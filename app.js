'use strict';
const $=id=>document.getElementById(id);let creatingStaff=false;let token=sessionStorage.getItem('absensi_token')||'',currentUser=null,staff=[],shifts=[],report=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(s,error=false){$('message').innerHTML='<div class="msg '+(error?'error':'')+'">'+esc(s)+'</div>'}
function request(data){return new Promise((resolve,reject)=>{
 const url=window.ABSENSI_CONFIG?.scriptUrl;
 if(!url||!/^https:\/\/script\.google\.com\/macros\/s\//.test(url)){reject(Error('URL Apps Script /exec tidak valid di config.js'));return}
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 const frame=document.createElement('iframe');frame.name='absensi_'+nonce;
 // Safari dapat menunda navigasi iframe yang memakai display:none.
 Object.assign(frame.style,{position:'absolute',left:'-9999px',top:'0',width:'1px',height:'1px',opacity:'0',border:'0',pointerEvents:'none'});
 frame.setAttribute('aria-hidden','true');frame.setAttribute('tabindex','-1');
 const form=document.createElement('form');form.method='POST';form.action=url;form.target=frame.name;form.style.display='none';
 const input=document.createElement('input');input.name='payload';input.value=JSON.stringify({...data,token,origin:location.origin,nonce});form.append(input);
 let settled=false,loaded=false,timer;
 function cleanup(){if(settled)return false;settled=true;clearTimeout(timer);window.removeEventListener('message',onMessage);form.remove();frame.remove();return true}
 function onMessage(e){
  if(!e.data||e.data.nonce!==nonce||typeof e.data.ok!=='boolean')return;
  if(!/^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com$/i.test(e.origin)&&e.origin!=='https://script.google.com')return;
  const result=e.data;if(!cleanup())return;
  result.ok?resolve(result.data):reject(Error(result.error||'Permintaan ditolak server'));
 }
 window.addEventListener('message',onMessage);
 frame.addEventListener('load',()=>{loaded=true});
 document.body.appendChild(frame);document.body.appendChild(form);
 timer=setTimeout(()=>{if(cleanup())reject(Error(loaded?'Respons Apps Script tidak diterima. Safari mungkin membatasi komunikasi iframe. Periksa Apps Script → Executions untuk melihat apakah doPost berjalan.':'Koneksi login ke Apps Script belum selesai. Periksa jaringan dan Apps Script → Executions.'))},45000);
 try{form.submit()}catch(err){if(cleanup())reject(Error('Gagal mengirim permintaan login: '+err.message))}
})}
async function run(action){try{msg('Memproses...');await action();msg('Berhasil')}catch(e){msg(e.message,true)}}
function showAuth(isLogged){$('loginPanel').classList.toggle('hidden',isLogged);$('dashboard').classList.toggle('hidden',!isLogged)}
async function refresh(){const x=await request({op:'me'});currentUser=x.user;showAuth(true);$('welcome').textContent='Halo, '+(String(x.user.name||'Staff').replace(/\s*\([^)]*\)/g,'').replace(/\s+/g,' ').trim()||'Staff');$('today').textContent='Tanggal '+x.today+' • '+x.now+' WIB';$('shiftInfo').textContent=x.shift?'Shift '+x.shift.name+' • '+x.shift.start:'Belum ada jadwal shift';$('attendanceStatus').textContent=x.attendance?'Sudah Absen • '+x.attendance.time+' • '+x.attendance.status:'Belum Absen';$('absen').disabled=!!x.attendance||x.user.role!=='Kasir'||x.user.must_change_password; $('changePasswordNotice').textContent=x.user.must_change_password?'Wajib ganti password awal sebelum menggunakan fitur lain.':'';$('adminPanel').classList.toggle('hidden',x.user.role!=='Admin'||x.user.must_change_password);if(x.user.role==='Admin'){
  const active=document.querySelector('#adminPanel [data-tab].active');
  const tab=active?.dataset.tab||'attendance';
  $('attendancePanel').classList.toggle('hidden',tab!=='attendance');
  ['staff','settings','shifts','report'].forEach(t=>$(t+'Tab').classList.toggle('hidden',tab!==t));
  loadStaff().catch(e=>msg('Login berhasil, tetapi daftar staff gagal dimuat: '+e.message,true));
}else{$('attendancePanel').classList.remove('hidden')}
}
$('loginForm').addEventListener('submit',e=>{e.preventDefault();const button=e.currentTarget.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;run(async()=>{try{const x=await request({op:'login',username:$('username').value,password:$('password').value});token=x.token;sessionStorage.setItem('absensi_token',token);$('password').value='';await refresh()}finally{button.disabled=false}})});
$('logout').onclick=()=>run(async()=>{try{await request({op:'logout'})}finally{token='';sessionStorage.removeItem('absensi_token');currentUser=null;showAuth(false);$('adminPanel').classList.add('hidden')}});
$('changePasswordForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=Object.fromEntries(new FormData(e.target));await request({op:'changePassword',...f});e.target.reset();await refresh();msg('Password berhasil diganti')})};
$('absen').onclick=()=>run(async()=>{const x=await request({op:'absen'});await refresh();msg('Absen masuk tercatat: '+x.time+' • '+x.status)});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{
 const tab=b.dataset.tab;
 document.querySelectorAll('[data-tab]').forEach(item=>{item.classList.toggle('active',item===b);item.setAttribute('aria-current',item===b?'page':'false')});
 $('attendancePanel').classList.toggle('hidden',tab!=='attendance');
 ['staff','settings','shifts','report'].forEach(t=>$(t+'Tab').classList.toggle('hidden',tab!==t));
 if(tab==='settings')run(loadSettings);
 if(tab==='shifts')run(loadShifts);
 if(tab==='report')run(loadReport);
});
async function loadStaff(){staff=await request({op:'staff'});$('staffList').innerHTML='<table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+staff.filter(s=>s.role!=='Admin').map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.username)+'</td><td>'+esc(s.role)+'</td><td>'+esc(s.active?'Aktif':'Nonaktif')+'</td><td><button data-edit="'+esc(s.id)+'">Edit</button><button data-pass="'+esc(s.id)+'">Reset Password</button><button data-delete="'+esc(s.id)+'" class="danger">Hapus</button></td></tr>').join('')+'</tbody></table>';document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editStaff(b.dataset.edit));document.querySelectorAll('[data-pass]').forEach(b=>b.onclick=()=>resetPassword(b.dataset.pass));document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteStaff(b.dataset.delete));$('shiftStaff').innerHTML=staff.filter(s=>s.role==='Kasir'&&s.active).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')}
$('createStaff').onsubmit=e=>{e.preventDefault();if(creatingStaff)return;creatingStaff=true;const form=e.currentTarget;const btn=form.querySelector('[type=submit],button');if(btn)btn.disabled=true;run(async()=>{try{const f=Object.fromEntries(new FormData(form));await request({op:'manageStaff',mode:'create',...f});form.reset();await loadStaff()}finally{creatingStaff=false;if(btn)btn.disabled=false}})};
function deleteStaff(id){const s=staff.find(x=>x.id===id);if(!s)return;if(!confirm('Hapus akun '+s.name+' ('+s.username+') secara permanen? Akun tidak bisa login lagi. Riwayat absensi tetap disimpan.'))return;run(async()=>{await request({op:'manageStaff',mode:'delete',id});await loadStaff();msg('Staff berhasil dihapus')})}
function editStaff(id){const s=staff.find(x=>x.id===id);if(!s)return;const name=prompt('Nama staff:',s.name);if(name===null)return;const role=prompt('Role (Kasir, CS, CS Line, Kapten):',s.role);if(role===null)return;const active=confirm('Klik OK jika akun tetap AKTIF. Cancel untuk NONAKTIF.');run(async()=>{await request({op:'manageStaff',mode:'update',id,name,role,active});await loadStaff()})}
function resetPassword(id){const password=prompt('Password baru minimal 1 karakter. Staff wajib menggantinya setelah login:');if(password===null)return;run(async()=>{await request({op:'manageStaff',mode:'password',id,password});await loadStaff()})}
async function loadSettings(){const s=await request({op:'settings'});$('limitEnabled').checked=s.limit_enabled;$('limitHours').value=s.limit_hours}
$('settingsForm').onsubmit=e=>{e.preventDefault();run(async()=>{await request({op:'settingsUpdate',limit_enabled:$('limitEnabled').checked,limit_hours:Number($('limitHours').value)});await loadSettings()})};
async function loadShifts(){const x=await request({op:'shifts'});shifts=x.shifts;$('shiftSelect').innerHTML=shifts.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' ('+esc(s.start)+')</option>').join('');$('shiftList').innerHTML='<h3>Daftar Shift</h3>'+shifts.map(s=>'<p>'+esc(s.name)+' — '+esc(s.start)+'</p>').join('')+'<h3>Jadwal Tersimpan</h3>'+x.assignments.map(a=>'<p>'+esc(a.date)+' — '+esc(staff.find(s=>s.id===a.staff_id)?.name||a.staff_id)+' — '+esc(shifts.find(s=>s.id===a.shift_id)?.name||a.shift_id)+'</p>').join('')}
$('createShift').onsubmit=e=>{e.preventDefault();run(async()=>{await request({op:'manageShift',mode:'create',...Object.fromEntries(new FormData(e.target))});e.target.reset();await loadShifts()})};
$('assignShift').onsubmit=e=>{e.preventDefault();run(async()=>{await request({op:'manageShift',mode:'assign',...Object.fromEntries(new FormData(e.target))});await loadShifts()})};
function localDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return parts}
$('reportDate').value=localDate();async function loadReport(){report=await request({op:'report',date:$('reportDate').value});$('reportList').innerHTML='<table><thead><tr><th>Tanggal</th><th>Nama</th><th>Jam</th><th>Status</th><th>Shift</th></tr></thead><tbody>'+report.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.time)+'</td><td>'+esc(r.status)+'</td><td>'+esc(r.shift_start)+'</td></tr>').join('')+'</tbody></table>'}
$('loadReport').onclick=()=>run(loadReport);
$('exportCsv').onclick=()=>{const rows=[['Tanggal','ID Staff','Nama','Role','Jam','Status','Shift'],...report.map(r=>[r.date,r.staff_id,r.name,r.role,r.time,r.status,r.shift_start])];const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='absensi-'+$('reportDate').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
if(token)refresh().catch(e=>{sessionStorage.removeItem('absensi_token');token='';showAuth(false);msg(e.message,true)});
