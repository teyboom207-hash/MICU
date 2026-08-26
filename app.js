/* ================= CONSTANTS ================= */
const WARDS_KEY = 'wardapp_wards_v1';
const SESSION_KEY = 'wardapp_session_v1';
const DATA_PREFIX = 'wardapp_data_v1_';
const WARN_DAYS = 60; // advance-notice window

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

let CURRENT_EMAIL = null;
let DATA = null;

/* ================= HELPERS ================= */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysBetween(iso){
  const today = new Date(todayISO()+'T00:00:00');
  const target = new Date(iso+'T00:00:00');
  return Math.round((target - today) / 86400000);
}
function formatDateThai(iso){
  if(!iso) return '-';
  const d = new Date(iso+'T00:00:00');
  return d.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' });
}
function esc(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function normEmail(e){ return e.trim().toLowerCase(); }

/* ================= DATA LAYER ================= */
function loadWards(){
  try{ return JSON.parse(localStorage.getItem(WARDS_KEY)) || {}; }catch(e){ return {}; }
}
function saveWards(w){ localStorage.setItem(WARDS_KEY, JSON.stringify(w)); }

function defaultData(){
  return { items: [], batches: [], stockInLog: [], stockOutLog: [] };
}
function loadData(email){
  try{
    const raw = localStorage.getItem(DATA_PREFIX + email);
    return raw ? JSON.parse(raw) : defaultData();
  }catch(e){ return defaultData(); }
}
function saveData(){
  localStorage.setItem(DATA_PREFIX + CURRENT_EMAIL, JSON.stringify(DATA));
}

/* ================= AUTH ================= */
function initAuth(){
  const savedSession = localStorage.getItem(SESSION_KEY);
  if(savedSession){
    const wards = loadWards();
    if(wards[savedSession]){
      loginAs(savedSession, wards[savedSession].name);
      return;
    }
  }
  showLogin();
}

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function loginAs(email, wardName){
  CURRENT_EMAIL = email;
  DATA = loadData(email);
  document.getElementById('ward-name-display').textContent = wardName;
  document.getElementById('ward-email-display').textContent = email;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  localStorage.setItem(SESSION_KEY, email);
  refreshAllViews();
  switchView('dashboard');
}

document.getElementById('login-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  const email = normEmail(document.getElementById('login-email').value);
  const name = document.getElementById('login-wardname').value.trim();
  if(!email || !name) return;
  const wards = loadWards();
  wards[email] = { name, email, updatedAt: todayISO() };
  saveWards(wards);
  loginAs(email, name);
});

document.getElementById('logout-btn').addEventListener('click', function(){
  localStorage.removeItem(SESSION_KEY);
  CURRENT_EMAIL = null; DATA = null;
  document.getElementById('login-email').value = '';
  document.getElementById('login-wardname').value = '';
  showLogin();
});

/* ================= NAV / ROUTER ================= */
document.querySelectorAll('.nav-btn[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=> switchView(btn.dataset.view));
});
function switchView(view){
  document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  closeSidebar();
  if(view === 'dashboard') renderDashboard();
  if(view === 'stockin') renderStockIn();
  if(view === 'stockout') renderStockOut();
  if(view === 'reports') renderReports(true);
}

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
document.getElementById('hamburger').addEventListener('click', ()=>{
  sidebar.classList.add('open'); overlay.classList.add('show');
});
overlay.addEventListener('click', closeSidebar);
function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); }

/* ================= ITEM HELPERS ================= */
function getOrCreateItem(name){
  name = name.trim();
  let item = DATA.items.find(i => i.name.toLowerCase() === name.toLowerCase());
  if(!item){
    item = { id: uid(), name, createdAt: todayISO() };
    DATA.items.push(item);
  }
  return item;
}
function itemName(id){
  const it = DATA.items.find(i=>i.id===id);
  return it ? it.name : '(ไม่พบชื่อพัสดุ)';
}
function totalAvailable(itemId){
  return DATA.batches.filter(b=>b.itemId===itemId).reduce((s,b)=>s+b.qty,0);
}

function categoryOf(days){
  if(days < 0) return 'red';
  if(days <= WARN_DAYS) return 'orange';
  return 'green';
}
function categoryLabel(days, cat){
  if(cat==='red') return `หมดอายุแล้ว ${Math.abs(days)} วัน`;
  if(cat==='orange') return `เหลืออีก ${days} วัน`;
  return `เหลืออีก ${days} วัน`;
}
function pillClass(cat){ return cat==='red'?'pill-red':cat==='orange'?'pill-orange':'pill-green'; }
function rowClass(cat){ return cat==='red'?'row-red':cat==='orange'?'row-orange':'row-green'; }
function statusText(cat){ return cat==='red'?'หมดอายุ':cat==='orange'?'ใกล้หมดอายุ':'ปกติ'; }

/* ================= DASHBOARD ================= */
function renderDashboard(){
  const search = (document.getElementById('dash-search').value || '').trim().toLowerCase();
  const rows = DATA.batches
    .filter(b=>b.qty > 0)
    .map(b=>{
      const days = daysBetween(b.expiryDate);
      const cat = categoryOf(days);
      return { ...b, name: itemName(b.itemId), days, cat };
    })
    .filter(r => !search || r.name.toLowerCase().includes(search))
    .sort((a,b)=> a.expiryDate.localeCompare(b.expiryDate));

  // summary
  const sums = { red:{qty:0,items:new Set()}, orange:{qty:0,items:new Set()}, green:{qty:0,items:new Set()} };
  DATA.batches.filter(b=>b.qty>0).forEach(b=>{
    const cat = categoryOf(daysBetween(b.expiryDate));
    sums[cat].qty += b.qty;
    sums[cat].items.add(b.itemId);
  });
  document.getElementById('sum-red-qty').textContent = sums.red.qty;
  document.getElementById('sum-red-items').textContent = sums.red.items.size;
  document.getElementById('sum-orange-qty').textContent = sums.orange.qty;
  document.getElementById('sum-orange-items').textContent = sums.orange.items.size;
  document.getElementById('sum-green-qty').textContent = sums.green.qty;
  document.getElementById('sum-green-items').textContent = sums.green.items.size;

  const tbody = document.getElementById('dash-tbody');
  tbody.innerHTML = '';
  document.getElementById('dash-empty').classList.toggle('hidden', rows.length>0);

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.className = rowClass(r.cat);
    tr.innerHTML = `
      <td><span class="status-pill ${pillClass(r.cat)}">${statusText(r.cat)}</span></td>
      <td>${esc(r.name)}</td>
      <td>${r.qty} ชิ้น</td>
      <td>${formatDateThai(r.expiryDate)}</td>
      <td>${categoryLabel(r.days, r.cat)}</td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById('dash-search').addEventListener('input', renderDashboard);
document.getElementById('dash-print-btn').addEventListener('click', ()=> printDashboard());

/* ================= STOCK IN ================= */
function refreshItemSelects(){
  const sel1 = document.getElementById('stockin-item-select');
  const sel2 = document.getElementById('stockout-item-select');
  const keep1 = sel1.value, keep2 = sel2.value;
  sel1.innerHTML = '<option value="">-- เลือกพัสดุ --</option><option value="__new__">➕ เพิ่มพัสดุใหม่</option>';
  sel2.innerHTML = '<option value="">-- เลือกพัสดุ --</option>';
  [...DATA.items].sort((a,b)=>a.name.localeCompare(b.name,'th')).forEach(it=>{
    const o1 = document.createElement('option'); o1.value = it.id; o1.textContent = it.name; sel1.appendChild(o1);
    const avail = totalAvailable(it.id);
    const o2 = document.createElement('option'); o2.value = it.id; o2.textContent = `${it.name} (คงเหลือ ${avail})`; sel2.appendChild(o2);
  });
  if([...sel1.options].some(o=>o.value===keep1)) sel1.value = keep1;
  if([...sel2.options].some(o=>o.value===keep2)) sel2.value = keep2;
}

document.getElementById('stockin-item-select').addEventListener('change', function(){
  document.getElementById('stockin-newname-wrap').classList.toggle('hidden', this.value !== '__new__');
});

document.getElementById('stockin-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  const sel = document.getElementById('stockin-item-select');
  const qty = parseInt(document.getElementById('stockin-qty').value, 10);
  const expiry = document.getElementById('stockin-expiry').value;
  const date = document.getElementById('stockin-date').value;
  if(!qty || qty <= 0 || !expiry || !date) return;

  let item;
  if(sel.value === '__new__'){
    const newName = document.getElementById('stockin-newname').value.trim();
    if(!newName){ alert('กรุณาระบุชื่อพัสดุใหม่'); return; }
    item = getOrCreateItem(newName);
  } else if(sel.value){
    item = DATA.items.find(i=>i.id===sel.value);
  } else {
    alert('กรุณาเลือกพัสดุ'); return;
  }

  const batchId = uid();
  DATA.batches.push({ id: batchId, itemId: item.id, qty, expiryDate: expiry, dateAdded: date });
  DATA.stockInLog.push({ id: uid(), batchId, itemId: item.id, qty, expiryDate: expiry, date });
  saveData();

  this.reset();
  document.getElementById('stockin-newname-wrap').classList.add('hidden');
  document.getElementById('stockin-date').value = todayISO();
  refreshAllViews();
});

function renderStockIn(){
  refreshItemSelects();
  if(!document.getElementById('stockin-date').value) document.getElementById('stockin-date').value = todayISO();
  const tbody = document.getElementById('stockin-tbody');
  tbody.innerHTML = '';
  const logs = [...DATA.stockInLog].sort((a,b)=> b.date.localeCompare(a.date)).slice(0,25);
  document.getElementById('stockin-empty').classList.toggle('hidden', logs.length>0);
  logs.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateThai(l.date)}</td>
      <td>${esc(itemName(l.itemId))}</td>
      <td>${l.qty} ชิ้น</td>
      <td>${formatDateThai(l.expiryDate)}</td>
      <td><button class="btn-danger-mini" data-undo-in="${l.id}">ลบ</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-undo-in]').forEach(b=>{
    b.addEventListener('click', ()=> undoStockIn(b.dataset.undoIn));
  });
}
function undoStockIn(logId){
  if(!confirm('ยืนยันลบรายการเติมพัสดุนี้? ระบบจะตัดจำนวนออกจากคลังด้วย')) return;
  const log = DATA.stockInLog.find(l=>l.id===logId);
  if(!log) return;
  const batch = DATA.batches.find(b=>b.id===log.batchId);
  if(batch){
    batch.qty -= log.qty;
    if(batch.qty <= 0) DATA.batches = DATA.batches.filter(b=>b.id!==batch.id);
  }
  DATA.stockInLog = DATA.stockInLog.filter(l=>l.id!==logId);
  saveData();
  refreshAllViews();
}

/* ================= STOCK OUT ================= */
document.getElementById('stockout-item-select').addEventListener('change', function(){
  const avail = this.value ? totalAvailable(this.value) : null;
  document.getElementById('stockout-available').value = avail === null ? '—' : `${avail} ชิ้น`;
});

document.getElementById('stockout-form').addEventListener('submit', function(ev){
  ev.preventDefault();
  const itemId = document.getElementById('stockout-item-select').value;
  const qty = parseInt(document.getElementById('stockout-qty').value, 10);
  const date = document.getElementById('stockout-date').value;
  if(!itemId){ alert('กรุณาเลือกพัสดุ'); return; }
  if(!qty || qty <= 0 || !date) return;

  const avail = totalAvailable(itemId);
  if(qty > avail){ alert(`คงเหลือเพียง ${avail} ชิ้น ไม่สามารถเบิกเกินจำนวนที่มีได้`); return; }

  // FEFO deduction
  let remaining = qty;
  const batches = DATA.batches.filter(b=>b.itemId===itemId).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
  for(const b of batches){
    if(remaining <= 0) break;
    const take = Math.min(b.qty, remaining);
    b.qty -= take;
    remaining -= take;
  }
  DATA.batches = DATA.batches.filter(b=> !(b.itemId===itemId && b.qty<=0));

  DATA.stockOutLog.push({ id: uid(), itemId, qty, date });
  saveData();

  this.reset();
  document.getElementById('stockout-available').value = '—';
  document.getElementById('stockout-date').value = todayISO();
  refreshAllViews();
});

function renderStockOut(){
  refreshItemSelects();
  if(!document.getElementById('stockout-date').value) document.getElementById('stockout-date').value = todayISO();
  const tbody = document.getElementById('stockout-tbody');
  tbody.innerHTML = '';
  const logs = [...DATA.stockOutLog].sort((a,b)=> b.date.localeCompare(a.date)).slice(0,25);
  document.getElementById('stockout-empty').classList.toggle('hidden', logs.length>0);
  logs.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateThai(l.date)}</td>
      <td>${esc(itemName(l.itemId))}</td>
      <td>${l.qty} ชิ้น</td>
      <td><button class="btn-danger-mini" data-undo-out="${l.id}">ลบ</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-undo-out]').forEach(b=>{
    b.addEventListener('click', ()=> undoStockOut(b.dataset.undoOut));
  });
}
function undoStockOut(logId){
  if(!confirm('ยืนยันลบรายการเบิกใช้นี้? ระบบจะคืนจำนวนกลับเข้าคลัง')) return;
  const log = DATA.stockOutLog.find(l=>l.id===logId);
  if(!log) return;
  // return qty into a "restored" batch with a far-future placeholder expiry is wrong;
  // instead, restore into existing batches of same item (extend earliest batch), or create adjustment batch with today's date+1yr as unknown expiry flag.
  let existing = DATA.batches.filter(b=>b.itemId===log.itemId).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));
  if(existing.length){
    existing[0].qty += log.qty;
  } else {
    DATA.batches.push({ id: uid(), itemId: log.itemId, qty: log.qty, expiryDate: todayISO(), dateAdded: todayISO() });
  }
  DATA.stockOutLog = DATA.stockOutLog.filter(l=>l.id!==logId);
  saveData();
  refreshAllViews();
}

/* ================= REPORTS ================= */
function populateReportFilters(){
  const monthSel = document.getElementById('report-month');
  const yearSel = document.getElementById('report-year');
  if(monthSel.options.length <= 1){
    THAI_MONTHS.forEach((m,idx)=>{
      const o = document.createElement('option'); o.value = idx+1; o.textContent = m; monthSel.appendChild(o);
    });
  }
  const years = new Set();
  DATA.stockInLog.forEach(l=>years.add(l.date.slice(0,4)));
  DATA.stockOutLog.forEach(l=>years.add(l.date.slice(0,4)));
  years.add(todayISO().slice(0,4));
  const keep = yearSel.value;
  yearSel.innerHTML = '<option value="">-- ทุกปี --</option>';
  [...years].sort().reverse().forEach(y=>{
    const o = document.createElement('option'); o.value = y; o.textContent = (parseInt(y,10)+543); yearSel.appendChild(o);
  });
  if([...yearSel.options].some(o=>o.value===keep)) yearSel.value = keep;
}

function renderReports(){
  populateReportFilters();
  const month = document.getElementById('report-month').value;
  const year = document.getElementById('report-year').value;
  const search = (document.getElementById('report-search').value || '').trim().toLowerCase();

  function matches(log){
    if(search && !itemName(log.itemId).toLowerCase().includes(search)) return false;
    if(year && log.date.slice(0,4) !== year) return false;
    if(month && parseInt(log.date.slice(5,7),10) !== parseInt(month,10)) return false;
    return true;
  }

  const inLogs = DATA.stockInLog.filter(matches).sort((a,b)=>b.date.localeCompare(a.date));
  const outLogs = DATA.stockOutLog.filter(matches).sort((a,b)=>b.date.localeCompare(a.date));

  document.getElementById('report-total-in').textContent = inLogs.reduce((s,l)=>s+l.qty,0);
  document.getElementById('report-total-out').textContent = outLogs.reduce((s,l)=>s+l.qty,0);

  const inBody = document.getElementById('report-in-tbody');
  inBody.innerHTML = '';
  document.getElementById('report-in-empty').classList.toggle('hidden', inLogs.length>0);
  inLogs.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDateThai(l.date)}</td><td>${esc(itemName(l.itemId))}</td><td>${l.qty} ชิ้น</td><td>${formatDateThai(l.expiryDate)}</td>`;
    inBody.appendChild(tr);
  });

  const outBody = document.getElementById('report-out-tbody');
  outBody.innerHTML = '';
  document.getElementById('report-out-empty').classList.toggle('hidden', outLogs.length>0);
  outLogs.forEach(l=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDateThai(l.date)}</td><td>${esc(itemName(l.itemId))}</td><td>${l.qty} ชิ้น</td>`;
    outBody.appendChild(tr);
  });
}
document.getElementById('report-filter-btn').addEventListener('click', ()=> renderReports());
document.getElementById('report-clear-btn').addEventListener('click', ()=>{
  document.getElementById('report-month').value = '';
  document.getElementById('report-year').value = '';
  document.getElementById('report-search').value = '';
  renderReports();
});
document.getElementById('report-print-btn').addEventListener('click', ()=> printReports());

/* ================= PDF (BROWSER PRINT) EXPORT ================= */
function printDashboard(){
  const rows = DATA.batches.filter(b=>b.qty>0).map(b=>{
    const days = daysBetween(b.expiryDate);
    const cat = categoryOf(days);
    return { name: itemName(b.itemId), qty: b.qty, expiry: b.expiryDate, days, cat };
  }).sort((a,b)=>a.expiry.localeCompare(b.expiry));

  let html = `<h1>คลังพัสดุวอร์ด - แดชบอร์ด</h1>
  <div class="print-sub">วอร์ด: ${esc(document.getElementById('ward-name-display').textContent)} • พิมพ์เมื่อ ${formatDateThai(todayISO())}</div>
  <table><thead><tr><th>สถานะ</th><th>ชื่อพัสดุ</th><th>จำนวนคงเหลือ</th><th>วันหมดอายุ</th><th>รายละเอียด</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    const cls = r.cat==='red'?'print-status-red':r.cat==='orange'?'print-status-orange':'print-status-green';
    html += `<tr><td class="${cls}">${statusText(r.cat)}</td><td>${esc(r.name)}</td><td>${r.qty} ชิ้น</td><td>${formatDateThai(r.expiry)}</td><td>${categoryLabel(r.days,r.cat)}</td></tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('print-area').innerHTML = html;
  window.print();
}

function printReports(){
  const month = document.getElementById('report-month').value;
  const year = document.getElementById('report-year').value;
  const search = (document.getElementById('report-search').value || '').trim().toLowerCase();
  function matches(log){
    if(search && !itemName(log.itemId).toLowerCase().includes(search)) return false;
    if(year && log.date.slice(0,4) !== year) return false;
    if(month && parseInt(log.date.slice(5,7),10) !== parseInt(month,10)) return false;
    return true;
  }
  const inLogs = DATA.stockInLog.filter(matches).sort((a,b)=>a.date.localeCompare(b.date));
  const outLogs = DATA.stockOutLog.filter(matches).sort((a,b)=>a.date.localeCompare(b.date));
  const label = (month ? THAI_MONTHS[parseInt(month,10)-1] : 'ทุกเดือน') + ' ' + (year ? (parseInt(year,10)+543) : 'ทุกปี') +
                (search ? ` • ค้นหา: "${esc(search)}"` : '');

  let html = `<h1>คลังพัสดุวอร์ด - สรุปรายเดือน</h1>
  <div class="print-sub">วอร์ด: ${esc(document.getElementById('ward-name-display').textContent)} • ช่วง: ${label} • พิมพ์เมื่อ ${formatDateThai(todayISO())}</div>
  <h3>📥 เติมเข้าคลัง (รวม ${inLogs.reduce((s,l)=>s+l.qty,0)} ชิ้น)</h3>
  <table><thead><tr><th>วันที่</th><th>ชื่อพัสดุ</th><th>จำนวน</th><th>วันหมดอายุ</th></tr></thead><tbody>`;
  inLogs.forEach(l=>{ html += `<tr><td>${formatDateThai(l.date)}</td><td>${esc(itemName(l.itemId))}</td><td>${l.qty} ชิ้น</td><td>${formatDateThai(l.expiryDate)}</td></tr>`; });
  html += `</tbody></table>
  <h3>📤 เบิกออกจากคลัง (รวม ${outLogs.reduce((s,l)=>s+l.qty,0)} ชิ้น)</h3>
  <table><thead><tr><th>วันที่</th><th>ชื่อพัสดุ</th><th>จำนวน</th></tr></thead><tbody>`;
  outLogs.forEach(l=>{ html += `<tr><td>${formatDateThai(l.date)}</td><td>${esc(itemName(l.itemId))}</td><td>${l.qty} ชิ้น</td></tr>`; });
  html += `</tbody></table>`;
  document.getElementById('print-area').innerHTML = html;
  window.print();
}

/* ================= GLOBAL REFRESH ================= */
function refreshAllViews(){
  refreshItemSelects();
  renderDashboard();
}

/* ================= INIT ================= */
document.getElementById('stockin-date').value = todayISO();
document.getElementById('stockout-date').value = todayISO();
initAuth();
