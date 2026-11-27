// VidyaDesk frontend (vanilla JS single-page app)
(() => {
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fdate = d => d ? new Date(d.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const grade = m => m >= 91 ? 'A1' : m >= 81 ? 'A2' : m >= 71 ? 'B1' : m >= 61 ? 'B2' : m >= 51 ? 'C1' : m >= 41 ? 'C2' : m >= 33 ? 'D' : 'E';
const opts = (arr, v) => arr.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');
const feeStatus = s => s.fee_paid >= s.fee_due ? ['Paid', 'paid'] : s.fee_paid > 0 ? ['Partial', 'part'] : ['Due', 'due'];
const ATT = { P: 'Present', A: 'Absent', L: 'Leave' };

let TOKEN = localStorage.getItem('vd_token'), ME = null, META = null, CLASSES = [];
const ST = { cls: '', q: '', attDate: '', exam: '' };

async function api(path, opt = {}) {
  const r = await fetch('/api' + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(); throw new Error(data.error); }
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 2800); };
const modal = h => { $('#mbox').innerHTML = h; $('#modal').classList.add('on'); };
const closeModal = () => $('#modal').classList.remove('on');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
function logout() { localStorage.removeItem('vd_token'); TOKEN = null; ME = null; location.hash = ''; showLogin(); }

// ---------- Login ----------
const DEMO = [
  ['admin', 'admin123', 'Owner / Admin', 'All 3 branches, every class'],
  ['principal1', 'principal123', 'Principal, Main Campus', 'Only Main Campus classes'],
  ['teacher8a', 'teacher123', 'Class teacher, 8-A', 'Only Class 8-A, Main Campus'],
  ['teacher6a', 'teacher123', 'Class teacher, 6-A', 'Only Class 6-A, Main Campus'],
  ['parent', 'parent123', 'Parent', 'Only their own child'],
];
function showLogin(msg = '') {
  $('#app').innerHTML = `<div class="login"><div class="box">
    <div class="row"><div class="logo">V</div><div><b style="font-size:20px">VidyaDesk</b><div class="note">School management · Demo</div></div></div>
    <form id="lf" class="list"><label>Username<input name="u" autocomplete="username" required></label>
    <label>Password<input name="p" type="password" autocomplete="current-password" required></label>
    <p class="err">${esc(msg)}</p><button class="btn">Log in</button></form>
    <p class="note" style="margin:16px 0 0">Demo accounts (tap to fill):</p>
    <div class="demo">${DEMO.map(d => `<button data-u="${d[0]}" data-p="${d[1]}"><b>${d[2]}</b><small>${d[0]} / ${d[1]} · ${d[3]}</small></button>`).join('')}</div></div></div>`;
  $('.demo').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#lf').u.value = b.dataset.u; $('#lf').p.value = b.dataset.p; };
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/login', { method: 'POST', body: { username: e.target.u.value, password: e.target.p.value } });
      TOKEN = r.token; localStorage.setItem('vd_token', TOKEN); location.hash = ''; boot();
    } catch (err) { showLogin(err.message); }
  };
}

// ---------- Shell ----------
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['classes', 'Classes'], ['students', 'Students'], ['attendance', 'Attendance'], ['marks', 'Marks'], ['fees', 'Fees'], ['posts', 'Homework & notices'], ['admissions', 'Admissions'], ['staff', 'Staff & teachers'], ['alerts', 'Alerts sent']],
  teacher: [['dashboard', 'My class'], ['students', 'Students'], ['attendance', 'Attendance'], ['marks', 'Marks'], ['fees', 'Fee status'], ['posts', 'Homework & notices'], ['alerts', 'Alerts sent']],
  parent: [['dashboard', 'My child'], ['posts', 'Homework & notices']],
};
NAV.principal = NAV.admin;

async function boot() {
  if (!TOKEN) return showLogin();
  try { [ME, META] = await Promise.all([api('/me'), api('/meta')]); } catch { return; }
  CLASSES = ME.role === 'parent' ? [] : await api('/classes');
  if (!ST.cls && CLASSES[0]) ST.cls = String(CLASSES[0].id);
  ST.attDate = META.today; ST.exam = META.exam;
  $('#app').innerHTML = `<header><div class="logo">V</div><h1>VidyaDesk<small>${esc(ME.branch)}</small></h1>
    <div class="who"><b>${esc(ME.name)}</b><span class="role">${esc(ME.role === 'admin' ? 'Owner / Admin' : ME.role === 'teacher' ? 'Class teacher' + (ME.classes.length ? ' · ' + ME.classes.map(c => c.name).join(', ') : '') : ME.role)}</span></div>
    <button class="out" id="logout">Log out</button></header>
    <div class="wrap"><nav id="nav"></nav><main id="main"></main></div>`;
  $('#logout').onclick = logout;
  route();
}
window.addEventListener('hashchange', () => ME && route());

async function route() {
  const [view, id] = (location.hash.slice(1) || 'dashboard').split('/');
  $('#nav').innerHTML = NAV[ME.role].map(([k, l]) => `<a href="#${k}" class="${k === view || (view === 'student' && k === 'students') ? 'on' : ''}">${l}</a>`).join('');
  const main = $('#main'); main.onclick = null; main.onchange = null; main.innerHTML = '<p class="note">Loading…</p>';
  try { main.innerHTML = await (V[view] || V.dashboard)(id); after[view]?.(id); }
  catch (e) { main.innerHTML = `<h2>Not allowed</h2><p class="err">${esc(e.message)}</p>`; }
}
const classSelect = (id = 'csel', all = false) => `<select id="${id}">${all ? '<option value="">All my classes</option>' : ''}${opts(CLASSES.map(c => [c.id, (ME.role === 'admin' ? c.branch + ' · ' : '') + 'Class ' + c.name]), ST.cls)}</select>`;
const lockNote = () => ME.role === 'teacher' ? `<div class="lock">You are seeing only your class (${esc(ME.classes.map(c => c.name).join(', ') || 'none assigned')}). Other classes are hidden by your permissions.</div>` : '';

// ---------- Views ----------
const V = {};
const after = {};

V.dashboard = async () => {
  if (ME.role === 'parent') return parentHome();
  const d = await api('/dashboard'), t = d.totals, pct = t.due ? Math.round(t.paid / t.due * 100) : 0;
  return `<h2>${ME.role === 'teacher' ? 'Class ' + esc(ME.classes.map(c => c.name).join(', ')) : esc(ME.branch)}: ${pct}% fees collected</h2>
  <p class="sub">${fdate(d.date)} · ${t.marked ? `${t.absent} absent out of ${t.marked} marked today` : 'Attendance not marked yet today'}</p>${lockNote()}
  <div class="kpis"><div class="kpi"><span>Students</span><b>${t.students}</b><em>${CLASSES.length} class${CLASSES.length > 1 ? 'es' : ''}</em></div>
  <div class="kpi"><span>Fees collected</span><b>${inr(t.paid)}</b><em>of ${inr(t.due)}</em></div>
  <div class="kpi"><span>Fees pending</span><b>${inr(t.due - t.paid)}</b><em>${META.term}</em></div>
  ${d.enquiries !== null ? `<div class="kpi"><span>Open admission enquiries</span><b>${d.enquiries}</b><em><a href="#admissions">View pipeline</a></em></div>` : `<div class="kpi"><span>Absent today</span><b>${t.absent}</b><em><a href="#attendance">Mark attendance</a></em></div>`}</div>
  <div class="card"><h3>${d.rowLabel}-wise summary</h3><div class="scroll"><table><thead><tr><th>${d.rowLabel}</th><th class="n">Students</th><th>Fee collection</th><th class="n">Pending</th><th class="n">Attendance</th></tr></thead><tbody>
  ${d.rows.map(r => { const p = r.due ? Math.round(r.paid / r.due * 100) : 0; return `<tr><td><b>${esc(r.label)}</b></td><td class="n">${r.students}</td><td><div class="row" style="margin:0;flex-wrap:nowrap"><div class="bar ${p < 70 ? 'low' : ''}"><i style="width:${p}%"></i></div><span>${p}%</span></div></td><td class="n">${inr(r.due - r.paid)}</td><td class="n">${r.att_pct}%</td></tr>`; }).join('')}
  </tbody></table></div></div>
  <div class="card"><h3>Students with attendance below 85%</h3>${d.lowAtt.length ? `<table><tbody>${d.lowAtt.map(s => `<tr class="click" data-href="#student/${s.id}"><td>${esc(s.name)}</td><td>Class ${esc(s.class)}</td><td class="n"><span class="pill A">${s.att_pct}%</span></td></tr>`).join('')}</tbody></table>` : '<p class="note">Everyone is above 85%.</p>'}</div>`;
};

V.classes = async () => {
  CLASSES = await api('/classes');
  const staff = await api('/staff'), branches = await api('/branches');
  return `<h2>Classes and class teachers</h2><p class="sub">Assign a class teacher. That teacher will see only this class.</p>
  <div class="card"><div class="scroll"><table><thead><tr><th>Class</th>${ME.role === 'admin' ? '<th>Branch</th>' : ''}<th class="n">Students</th><th>Today</th><th>Class teacher</th></tr></thead><tbody>
  ${CLASSES.map(c => `<tr><td><b>${esc(c.name)}</b></td>${ME.role === 'admin' ? `<td>${esc(c.branch)}</td>` : ''}<td class="n">${c.students}</td>
  <td>${c.marked_today ? `<span class="pill P">Marked</span> ${c.absent_today} absent` : '<span class="pill none">Not marked</span>'}</td>
  <td><select data-teach="${c.id}"><option value="">No teacher</option>${opts(staff.filter(s => s.role === 'teacher' && s.branch_id === c.branch_id).map(s => [s.id, s.name]), c.teacher_id)}</select></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><h3>Add a class</h3><form id="addClass" class="form"><label>Class name<input name="name" placeholder="e.g. 9-A" required></label>
  ${ME.role === 'admin' ? `<label>Branch<select name="branch_id">${opts(branches.map(b => [b.id, b.name]))}</select></label>` : ''}<button class="btn">Add class</button></form></div>`;
};
after.classes = () => {
  $('#main').onchange = async e => {
    if (!e.target.dataset.teach) return;
    try { await api(`/classes/${e.target.dataset.teach}/teacher`, { method: 'PUT', body: { teacher_id: e.target.value || null } }); toast('Class teacher updated'); } catch (err) { toast(err.message); }
  };
  $('#addClass').onsubmit = async e => { e.preventDefault(); try { await api('/classes', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Class added'); CLASSES = await api('/classes'); route(); } catch (err) { toast(err.message); } };
};

V.students = async () => {
  const list = await api(`/students?${ST.cls ? 'class_id=' + ST.cls + '&' : ''}q=${encodeURIComponent(ST.q)}`);
  const canAdd = ME.role !== 'teacher';
  return `<h2>${list.length} students</h2><p class="sub">Tap a student to see full details, attendance, fees and marks.</p>${lockNote()}
  <div class="row">${classSelect('csel', ME.role !== 'teacher')}<input id="sq" placeholder="Search name, admission no. or phone" value="${esc(ST.q)}" style="flex:1;max-width:340px">
  ${canAdd ? '<button class="btn" id="addStu">Add student</button>' : ''}</div>
  <div class="card"><div class="scroll"><table><thead><tr><th class="n">Roll</th><th>Name</th><th>Class</th><th>Father</th><th>Phone</th><th class="n">Attendance</th><th>Today</th><th>Fees</th></tr></thead><tbody>
  ${list.map(s => { const [fl, fc] = feeStatus(s); return `<tr class="click" data-href="#student/${s.id}"><td class="n">${s.roll_no}</td><td><b>${esc(s.name)}</b><br><small class="note">${esc(s.admission_no)}</small></td><td>${esc(s.class)}</td><td>${esc(s.father_name)}</td><td>${esc(s.phone)}</td><td class="n">${s.att_pct ?? '-'}%</td><td>${s.today ? `<span class="pill ${s.today}">${ATT[s.today]}</span>` : '<span class="note">-</span>'}</td><td><span class="pill ${fc}">${fl}</span></td></tr>`; }).join('') || '<tr><td colspan="8">No students found.</td></tr>'}
  </tbody></table></div></div>`;
};
after.students = () => {
  $('#csel').onchange = e => { ST.cls = e.target.value; route(); };
  let t; $('#sq').oninput = e => { clearTimeout(t); t = setTimeout(() => { ST.q = e.target.value; route().then(() => { const i = $('#sq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  const add = $('#addStu');
  if (add) add.onclick = () => {
    modal(`<h3 style="margin-top:0">Add student</h3><form id="sf" class="list">
      <label>Class<select name="class_id">${opts(CLASSES.map(c => [c.id, (ME.role === 'admin' ? c.branch + ' · ' : '') + c.name]), ST.cls)}</select></label>
      <label>Student name<input name="name" required></label><label>Gender<select name="gender">${opts([['M', 'Male'], ['F', 'Female']])}</select></label>
      <label>Date of birth<input type="date" name="dob"></label><label>Father's name<input name="father_name"></label><label>Mother's name<input name="mother_name"></label>
      <label>Phone<input name="phone" inputmode="tel" pattern="[0-9]{10}" title="10-digit mobile number"></label><label>Address<input name="address"></label>
      <div class="row"><button class="btn">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
    $('#sf').onsubmit = async e => { e.preventDefault(); try { const r = await api('/students', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Student added'); location.hash = 'student/' + r.id; } catch (err) { toast(err.message); } };
  };
};

V.student = async id => {
  const s = await api('/students/' + id);
  const [fl, fc] = feeStatus(s), bal = s.fee_due - s.fee_paid;
  const exams = [...new Set(s.marks.map(m => m.exam))];
  const field = (k, label, editable, type = 'text') => `<dt>${label}</dt><dd>${editable ? `<input name="${k}" type="${type}" value="${esc(s[k])}" style="width:100%">` : esc(s[k]) || '-'}</dd>`;
  const E = s.can_edit_all, C = s.can_edit_contact;
  const counts = s.attendance.reduce((a, r) => (a[r.status]++, a), { P: 0, A: 0, L: 0 });
  return `${ME.role !== 'parent' ? '<p class="noprint"><a href="#students">← All students</a></p>' : ''}
  <h2>${esc(s.name)}</h2><p class="sub">Class ${esc(s.class)} · Roll ${s.roll_no} · ${esc(s.admission_no)} · ${esc(s.branch)} · Class teacher: ${esc(s.class_teacher || '-')}</p>
  <div class="kpis"><div class="kpi"><span>Attendance (overall)</span><b>${s.att_pct ?? '-'}%</b><em>Today: ${s.today ? ATT[s.today] : 'not marked'}</em></div>
  <div class="kpi"><span>Fees, ${esc(META.term)}</span><b>${bal > 0 ? inr(bal) + ' due' : 'All paid'}</b><em><span class="pill ${fc}">${fl}</span> ${inr(s.fee_paid)} of ${inr(s.fee_due)}</em></div>
  <div class="kpi"><span>${esc(exams[0] || 'Exam')} result</span><b>${s.marks.length ? (s.marks.filter(m => m.exam === exams[0]).reduce((a, m) => a + m.marks, 0) / s.marks.filter(m => m.exam === exams[0]).length).toFixed(1) + '%' : '-'}</b><em>average of all subjects</em></div></div>
  <div class="grid2"><div class="card"><h3>Student details</h3><form id="detf"><dl class="dl">
    ${field('name', 'Name', E)}${field('gender', 'Gender', E)}${field('dob', 'Date of birth', E, 'date')}${field('blood_group', 'Blood group', C)}
    ${field('father_name', "Father's name", E)}${field('mother_name', "Mother's name", E)}${field('phone', 'Parent phone', C)}${field('address', 'Address', C)}</dl>
    ${C ? `<div class="row" style="margin-top:12px"><button class="btn sm">Save changes</button>${!E ? '<span class="note">Teachers can update contact details only.</span>' : ''}</div>` : ''}</form></div>
  <div class="card"><h3>Attendance, last ${s.attendance.length} school days</h3>
    <p class="note">${counts.P} present · ${counts.A} absent · ${counts.L} leave</p>
    <div class="cal">${s.attendance.slice().reverse().map(a => `<div class="${a.status}" title="${a.date}: ${ATT[a.status]}">${+a.date.slice(8)}</div>`).join('')}</div></div></div>
  <div class="grid2"><div class="card"><h3>Fee payments</h3>
    ${s.payments.length ? `<table><tbody>${s.payments.map(p => `<tr><td>${fdate(p.paid_on)}</td><td>${esc(p.mode)}</td><td>${esc(p.receipt_no)}</td><td class="n"><b>${inr(p.amount)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="note">No payments yet.</p>'}
    ${bal > 0 && ME.role !== 'teacher' ? `<div class="row" style="margin-top:12px"><button class="btn y" data-pay="${s.id}" data-bal="${bal}">${ME.role === 'parent' ? 'Pay ' + inr(bal) + ' online' : 'Collect fee'}</button></div>` : ''}</div>
  <div class="card"><h3>Report card</h3>${exams.map(ex => { const ms = s.marks.filter(m => m.exam === ex), tot = ms.reduce((a, m) => a + m.marks, 0), pct = tot / ms.length;
    return `<p style="margin:0 0 6px"><b>${esc(ex)}</b></p><table><tbody>${ms.map(m => `<tr><td>${esc(m.subject)}</td><td class="n">${m.marks} / ${m.max_marks}</td><td class="n">${grade(m.marks)}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="n"><b>${tot} / ${ms.length * 100}</b></td><td class="n"><b>${pct.toFixed(1)}% · ${grade(pct)}</b></td></tr></tbody></table>`; }).join('') || '<p class="note">No marks entered yet.</p>'}
    <button class="btn ghost sm noprint" style="margin-top:10px" onclick="window.print()">Print / save as PDF</button></div></div>
  <div class="card"><h3>Messages sent to parent</h3>${s.notifications.length ? `<div class="list">${s.notifications.map(n => `<div class="item">${esc(n.text)}<small>${esc(n.channel)} · ${fdate(n.created_at)} ${n.created_at.slice(11, 16)}</small></div>`).join('')}</div>` : '<p class="note">No messages yet.</p>'}</div>`;
};
after.student = id => {
  const f = $('#detf');
  f.onsubmit = async e => { e.preventDefault(); try { await api('/students/' + id, { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Details saved'); route(); } catch (err) { toast(err.message); } };
  const pay = $('[data-pay]'); if (pay) pay.onclick = () => payModal(id, +pay.dataset.bal);
};
function payModal(id, bal) {
  const parent = ME.role === 'parent';
  modal(`<h3 style="margin-top:0">${parent ? 'Pay fees online' : 'Collect fee'}</h3><p class="note">Pending ${inr(bal)}</p><form id="pf" class="list">
    <label>Amount<input name="amount" type="number" min="1" max="${bal}" value="${bal}" required></label>
    ${parent ? '<p class="note">Demo: no real money moves. In production this opens Razorpay / UPI.</p>' : `<label>Mode<select name="mode">${opts(['UPI', 'Cash', 'Card', 'Cheque'])}</select></label>`}
    <div class="row"><button class="btn">${parent ? 'Pay now' : 'Save and send receipt'}</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/payments', { method: 'POST', body: { student_id: +id, ...Object.fromEntries(new FormData(e.target)) } });
      modal(`<h3 style="margin-top:0">Payment successful</h3><dl class="dl"><dt>Receipt no.</dt><dd><b>${esc(r.receipt_no)}</b></dd><dt>Amount</dt><dd>${inr(r.amount)}</dd><dt>Mode</dt><dd>${esc(r.mode)}</dd><dt>Balance</dt><dd>${inr(r.balance)}</dd></dl>
        <p class="note">Receipt sent to parent on WhatsApp.</p><button class="btn" data-close>Done</button>`);
      route();
    } catch (err) { toast(err.message); }
  };
}

V.attendance = async () => {
  if (!ST.cls) return '<h2>No class assigned</h2><p class="sub">Ask the principal to assign you a class.</p>';
  const d = await api(`/attendance?class_id=${ST.cls}&date=${ST.attDate}`);
  const marked = d.students.some(s => s.status);
  d.students.forEach(s => s.status = s.status || 'P');
  ST.attRows = d.students;
  const rep = await api(`/attendance/report?class_id=${ST.cls}&month=${ST.attDate.slice(0, 7)}`);
  return `<h2>Attendance</h2><p class="sub">${marked ? 'Already marked for this date. You can correct it and save again.' : 'Everyone starts as present. Tap A for absent, L for leave.'}</p>${lockNote()}
  <div class="row">${classSelect()}<input type="date" id="adate" value="${ST.attDate}" max="${META.today}"><button class="btn ghost sm" id="allP">Mark all present</button></div>
  <div class="card"><div class="att" id="attList">${d.students.map(s => `<div class="r" data-id="${s.id}"><b style="width:2em">${s.roll_no}</b><span>${esc(s.name)}</span>
    <div class="seg">${['P', 'A', 'L'].map(k => `<button type="button" class="${k}${s.status === k ? ' on' : ''}" data-st="${k}" aria-label="${ATT[k]}">${k}</button>`).join('')}</div></div>`).join('')}</div>
  <div class="row" style="margin-top:14px"><button class="btn" id="saveAtt">Save attendance</button><span class="note" id="attSum"></span></div>
  <p class="note">Parents of absent students get an SMS/WhatsApp alert when you save.</p></div>
  <div class="card"><h3>Monthly register, ${new Date(rep.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3><div class="scroll"><table class="rep"><thead><tr><th>Roll</th><th>Name</th>${rep.days.map(x => `<th>${+x.slice(8)}</th>`).join('')}<th>P</th><th>A</th><th>%</th></tr></thead><tbody>
  ${rep.rows.map(r => { const m = Object.fromEntries((r.marks || '').split(',').filter(Boolean).map(x => x.split(':'))); const tot = (r.p || 0) + (r.a || 0) + (r.l || 0);
    return `<tr><td>${r.roll_no}</td><td>${esc(r.name)}</td>${rep.days.map(x => `<td>${m[x] ? `<span class="pill ${m[x]}" style="padding:0 4px">${m[x]}</span>` : ''}</td>`).join('')}<td>${r.p || 0}</td><td>${r.a || 0}</td><td>${tot ? Math.round(((r.p || 0) + (r.l || 0)) / tot * 100) : '-'}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
};
after.attendance = () => {
  if (!$('#attList')) return;
  const sum = () => { const c = ST.attRows.reduce((a, s) => (a[s.status]++, a), { P: 0, A: 0, L: 0 }); $('#attSum').textContent = `${c.P} present · ${c.A} absent · ${c.L} leave`; };
  sum();
  $('#csel').onchange = e => { ST.cls = e.target.value; route(); };
  $('#adate').onchange = e => { ST.attDate = e.target.value; route(); };
  $('#attList').onclick = e => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    const row = b.closest('.r'), s = ST.attRows.find(x => x.id === +row.dataset.id); s.status = b.dataset.st;
    row.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === b)); sum();
  };
  $('#allP').onclick = () => { ST.attRows.forEach(s => s.status = 'P'); document.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x.dataset.st === 'P')); sum(); };
  $('#saveAtt').onclick = async () => {
    try { const r = await api('/attendance', { method: 'POST', body: { class_id: +ST.cls, date: ST.attDate, records: ST.attRows.map(s => ({ student_id: s.id, status: s.status })) } });
      toast(`Attendance saved. ${r.alerts_sent} parent alert${r.alerts_sent === 1 ? '' : 's'} sent.`); route(); } catch (err) { toast(err.message); }
  };
};

V.marks = async () => {
  if (!ST.cls) return '<h2>No class assigned</h2>';
  const d = await api(`/marks?class_id=${ST.cls}&exam=${encodeURIComponent(ST.exam)}`);
  const M = {}; d.marks.forEach(m => (M[m.student_id] ??= {})[m.subject] = m.marks);
  return `<h2>Marks entry · ${esc(d.exam)}</h2><p class="sub">Type marks out of 100. Totals and grades update as you type.</p>${lockNote()}
  <div class="row">${classSelect()}<select id="exam">${opts(['Unit Test 1', 'Half-Yearly', 'Unit Test 2', 'Annual'], d.exam)}</select></div>
  <div class="card"><div class="scroll"><table class="mgrid"><thead><tr><th class="n">Roll</th><th>Name</th>${d.subjects.map(s => `<th class="n">${s}</th>`).join('')}<th class="n">Total</th><th class="n">%</th><th>Grade</th></tr></thead><tbody>
  ${d.students.map(s => `<tr data-id="${s.id}"><td class="n">${s.roll_no}</td><td><a href="#student/${s.id}">${esc(s.name)}</a></td>${d.subjects.map(sub => `<td class="n"><input type="number" min="0" max="100" data-sub="${sub}" value="${M[s.id]?.[sub] ?? ''}"></td>`).join('')}<td class="n tot"></td><td class="n pct"></td><td class="gr"></td></tr>`).join('')}
  </tbody></table></div>
  <div class="row" style="margin-top:14px"><button class="btn" id="saveMarks">Save marks</button><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="notif" style="min-height:auto"> Send "report card ready" alert to parents</label></div></div>`;
};
after.marks = () => {
  if (!$('.mgrid')) return;
  const calc = tr => { const v = [...tr.querySelectorAll('input')].map(i => i.value === '' ? null : +i.value).filter(x => x !== null); const t = v.reduce((a, b) => a + b, 0), p = v.length ? t / v.length : 0;
    tr.querySelector('.tot').textContent = v.length ? t : ''; tr.querySelector('.pct').textContent = v.length ? p.toFixed(1) : ''; tr.querySelector('.gr').textContent = v.length ? grade(p) : ''; };
  document.querySelectorAll('.mgrid tbody tr').forEach(calc);
  $('.mgrid').oninput = e => calc(e.target.closest('tr'));
  $('#csel').onchange = e => { ST.cls = e.target.value; route(); };
  $('#exam').onchange = e => { ST.exam = e.target.value; route(); };
  $('#saveMarks').onclick = async () => {
    const rows = []; document.querySelectorAll('.mgrid tbody tr').forEach(tr => tr.querySelectorAll('input').forEach(i => { if (i.value !== '') rows.push({ student_id: +tr.dataset.id, subject: i.dataset.sub, marks: +i.value }); }));
    try { const r = await api('/marks', { method: 'POST', body: { class_id: +ST.cls, exam: ST.exam, rows, notify_parents: $('#notif').checked } }); toast(`${r.saved} marks saved`); } catch (err) { toast(err.message); }
  };
};

V.fees = async () => {
  const d = await api('/fees' + (ST.cls ? '?class_id=' + ST.cls : ''));
  const due = d.students.reduce((a, s) => a + s.fee_due, 0), paid = d.students.reduce((a, s) => a + s.fee_paid, 0), pend = d.students.filter(s => s.fee_paid < s.fee_due);
  return `<h2>${inr(due - paid)} pending from ${pend.length} students</h2><p class="sub">${esc(META.term)} · collected ${inr(paid)} of ${inr(due)}</p>${lockNote()}
  ${!d.can_collect ? '<div class="lock">Teachers can view fee status but only the office can collect fees.</div>' : ''}
  <div class="row">${classSelect('csel', ME.role !== 'teacher')}${d.can_collect ? `<button class="btn y" id="remind">Send reminder to ${pend.length} parents</button>` : ''}</div>
  <div class="card"><div class="scroll"><table><thead><tr><th>Student</th><th>Class</th><th>Father / phone</th><th class="n">Paid</th><th class="n">Balance</th><th>Status</th>${d.can_collect ? '<th></th>' : ''}</tr></thead><tbody>
  ${d.students.map(s => { const [fl, fc] = feeStatus(s), bal = s.fee_due - s.fee_paid; return `<tr><td><a href="#student/${s.id}"><b>${esc(s.name)}</b></a></td><td>${esc(s.class)}</td><td>${esc(s.father_name)}<br><small class="note">${esc(s.phone)}</small></td><td class="n">${inr(s.fee_paid)}</td><td class="n">${inr(bal)}</td><td><span class="pill ${fc}">${fl}</span></td>${d.can_collect ? `<td>${bal > 0 ? `<button class="btn sm" data-pay="${s.id}" data-bal="${bal}">Collect</button>` : ''}</td>` : ''}</tr>`; }).join('')}
  </tbody></table></div></div>`;
};
after.fees = () => {
  $('#csel').onchange = e => { ST.cls = e.target.value; route(); };
  $('#main').onclick = e => { const b = e.target.closest('[data-pay]'); if (b) payModal(b.dataset.pay, +b.dataset.bal); };
  const r = $('#remind'); if (r) r.onclick = async () => { try { const x = await api('/fees/remind', { method: 'POST', body: { class_id: ST.cls || null } }); toast(`Reminder sent to ${x.sent} parents`); } catch (err) { toast(err.message); } };
};

V.posts = async () => {
  const posts = await api('/posts'), canPost = ME.role !== 'parent';
  let target = '';
  if (canPost) {
    const choices = CLASSES.map(c => [c.id, (ME.role === 'admin' ? c.branch + ' · ' : '') + 'Class ' + c.name]);
    if (ME.role === 'principal') choices.unshift(['', 'Whole branch']);
    if (ME.role === 'admin') choices.unshift(['', 'All branches']);
    target = `<label>Send to<select name="class_id">${opts(choices, ME.role === 'teacher' ? ST.cls : '')}</select></label>`;
  }
  return `<h2>Homework and notices</h2><p class="sub">${canPost ? 'Posts appear instantly in the parent app.' : 'Messages from school for your child.'}</p>
  ${canPost ? `<div class="card"><form id="pf2" class="form"><label>Type<select name="type">${opts(['Homework', 'Notice'])}</select></label>${target}
  <label>Subject<select name="subject">${opts(['', ...META.subjects])}</select></label><label style="grid-column:1/-1">Message<textarea name="text" required placeholder="e.g. Learn chapter 4 for Monday's test"></textarea></label><button class="btn">Post</button></form></div>` : ''}
  <div class="list">${posts.map(p => `<div class="item"><b>${esc(p.type)}${p.subject ? ' · ' + esc(p.subject) : ''}</b> <span class="pill part">${p.class ? 'Class ' + esc(p.class) + (ME.role === 'admin' ? ', ' + esc(p.branch) : '') : p.branch ? esc(p.branch) : 'All branches'}</span><br>${esc(p.text)}<small>${esc(p.author)} · ${fdate(p.created_at)}</small></div>`).join('') || '<p class="note">Nothing posted yet.</p>'}</div>`;
};
after.posts = () => {
  const f = $('#pf2'); if (!f) return;
  f.onsubmit = async e => { e.preventDefault(); try { await api('/posts', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Posted'); route(); } catch (err) { toast(err.message); } };
};

const STAGES = ['New', 'Called', 'Visit booked', 'Admitted', 'Not interested'];
V.admissions = async () => {
  const [list, branches] = await Promise.all([api('/enquiries'), api('/branches')]);
  return `<h2>${list.filter(e => !['Admitted', 'Not interested'].includes(e.status)).length} open admission enquiries</h2><p class="sub">Enquiries from the website form land here. Update the status as you follow up.</p>
  <div class="kpis">${STAGES.map(s => `<div class="kpi"><span>${s}</span><b>${list.filter(e => e.status === s).length}</b></div>`).join('')}</div>
  <div class="card"><h3>Website enquiry form (public, no login needed)</h3><form id="ef" class="form">
  <label>Branch<select name="branch_id">${opts(branches.map(b => [b.id, b.name]))}</select></label><label>Child's name<input name="child_name" required></label>
  <label>Parent's name<input name="parent_name"></label><label>Phone<input name="phone" required pattern="[0-9]{10}" title="10-digit mobile number"></label>
  <label>Class<select name="class_wanted">${opts(['Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'])}</select></label><button class="btn">Submit enquiry</button></form></div>
  <div class="card"><div class="scroll"><table><thead><tr><th>Child</th><th>Parent</th><th>Class</th><th>Branch</th><th>Source</th><th>Date</th><th>Status</th></tr></thead><tbody>
  ${list.map(e => `<tr><td><b>${esc(e.child_name)}</b></td><td>${esc(e.parent_name)}<br><small class="note">${esc(e.phone)}</small></td><td>${esc(e.class_wanted)}</td><td>${esc(e.branch)}</td><td>${esc(e.source)}</td><td>${fdate(e.created_at)}</td><td><select data-enq="${e.id}">${opts(STAGES, e.status)}</select></td></tr>`).join('')}
  </tbody></table></div></div>`;
};
after.admissions = () => {
  $('#ef').onsubmit = async e => { e.preventDefault(); try { const r = await fetch('/api/public/enquiry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); if (!r.ok) throw new Error((await r.json()).error); toast('Enquiry added'); route(); } catch (err) { toast(err.message); } };
  $('#main').onchange = async e => { if (!e.target.dataset.enq) return; try { await api('/enquiries/' + e.target.dataset.enq, { method: 'PUT', body: { status: e.target.value } }); toast('Status updated'); } catch (err) { toast(err.message); } };
};

V.staff = async () => {
  const [staff, branches] = await Promise.all([api('/staff'), api('/branches')]);
  return `<h2>Staff and logins</h2><p class="sub">Create a login for each teacher, then assign their class on the <a href="#classes">Classes</a> page.</p>
  <div class="card"><div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Username</th><th>Branch</th><th>Class teacher of</th><th>Phone</th></tr></thead><tbody>
  ${staff.map(s => `<tr><td><b>${esc(s.name)}</b></td><td><span class="role">${esc(s.role)}</span></td><td>${esc(s.username)}</td><td>${esc(s.branch)}</td><td>${esc(s.classes || '-')}</td><td>${esc(s.phone)}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><h3>Add staff login</h3><form id="stf" class="form"><label>Full name<input name="name" required></label><label>Username<input name="username" required></label>
  <label>Password<input name="password" type="password" minlength="6" required></label><label>Phone<input name="phone"></label>
  ${ME.role === 'admin' ? `<label>Branch<select name="branch_id">${opts(branches.map(b => [b.id, b.name]))}</select></label><label>Role<select name="role">${opts([['teacher', 'Teacher'], ['principal', 'Principal']])}</select></label>` : ''}
  <button class="btn">Create login</button></form></div>`;
};
after.staff = () => { $('#stf').onsubmit = async e => { e.preventDefault(); try { await api('/staff', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Login created'); route(); } catch (err) { toast(err.message); } }; };

V.alerts = async () => {
  const list = await api('/notifications');
  return `<h2>Alerts sent to parents</h2><p class="sub">Demo: messages are saved here. In production they go out through WhatsApp Business API / SMS.</p>${lockNote()}
  <div class="list">${list.map(n => `<div class="item"><b>${esc(n.student)}</b> · ${esc(n.phone)}<br>${esc(n.text)}<small>${esc(n.channel)} · ${fdate(n.created_at)} ${n.created_at.slice(11, 16)}</small></div>`).join('') || '<p class="note">No alerts yet. Mark someone absent or send a fee reminder.</p>'}</div>`;
};

async function parentHome() {
  const kids = await api('/students');
  if (!kids.length) return '<h2>No child linked to this account</h2>';
  return V.student(kids[0].id);
}
after.dashboard = id => { if (ME.role === 'parent') api('/students').then(k => k[0] && after.student(k[0].id)); };

document.addEventListener('click', e => { const r = e.target.closest('tr[data-href]'); if (r && !e.target.closest('a,button,input,select')) location.hash = r.dataset.href.slice(1); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

boot();
})();
