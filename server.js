// VidyaDesk - school management API (Express + SQLite)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { db, TERM, EXAM, SUBJECTS } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const PORT = process.env.PORT || 3000;

const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const q = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const fail = (res, code, msg) => res.status(code).json({ error: msg });

// ---------- Auth ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = one('SELECT * FROM users WHERE username = ? AND active = 1', String(username || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) return fail(res, 401, 'Wrong username or password');
  const token = jwt.sign({ id: u.id }, SECRET, { expiresIn: '12h' });
  res.json({ token, user: publicUser(u) });
});

function publicUser(u) {
  const branch = u.branch_id ? one('SELECT name FROM branches WHERE id = ?', u.branch_id) : null;
  const classes = u.role === 'teacher' ? q('SELECT id, name FROM classes WHERE teacher_id = ?', u.id) : [];
  return { id: u.id, name: u.name, username: u.username, role: u.role, branch_id: u.branch_id, branch: branch?.name || 'All branches', classes };
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    const { id } = jwt.verify(h.replace('Bearer ', ''), SECRET);
    const u = one('SELECT * FROM users WHERE id = ? AND active = 1', id);
    if (!u) throw 0;
    req.user = u; next();
  } catch { fail(res, 401, 'Please log in again'); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : fail(res, 403, 'You do not have permission for this');

// ---------- Permission scope (the core of role-based access) ----------
// admin: every class | principal: classes of own branch | teacher: only classes where they are class teacher
function classIds(u) {
  if (u.role === 'admin') return q('SELECT id FROM classes').map(r => r.id);
  if (u.role === 'principal') return q('SELECT id FROM classes WHERE branch_id = ?', u.branch_id).map(r => r.id);
  if (u.role === 'teacher') return q('SELECT id FROM classes WHERE teacher_id = ?', u.id).map(r => r.id);
  return [];
}
const canClass = (u, cid) => classIds(u).includes(Number(cid));
function canStudent(u, sid) {
  const s = one('SELECT class_id, parent_user_id FROM students WHERE id = ?', sid);
  if (!s) return false;
  if (u.role === 'parent') return s.parent_user_id === u.id;
  return canClass(u, s.class_id);
}
function studentIds(u) {
  if (u.role === 'parent') return q('SELECT id FROM students WHERE parent_user_id = ?', u.id).map(r => r.id);
  const c = classIds(u); if (!c.length) return [];
  return q(`SELECT id FROM students WHERE class_id IN (${c.map(() => '?').join(',')})`, ...c).map(r => r.id);
}
const inList = a => a.length ? `(${a.join(',')})` : '(-1)'; // ids are integers from our DB
const branchOk = (u, bid) => u.role === 'admin' || Number(bid) === u.branch_id;

app.use('/api', (req, res, next) => (req.path === '/login' || req.path.startsWith('/public')) ? next() : auth(req, res, next));

app.get('/api/me', (req, res) => res.json(publicUser(req.user)));

// ---------- Shared helpers ----------
const FEE_SQL = `
  (SELECT COALESCE(SUM(amount),0) FROM fee_dues f WHERE f.student_id = s.id) AS fee_due,
  (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.student_id = s.id) AS fee_paid,
  (SELECT ROUND(100.0 * SUM(status IN ('P','L')) / COUNT(*), 1) FROM attendance a WHERE a.student_id = s.id) AS att_pct,
  (SELECT status FROM attendance a WHERE a.student_id = s.id AND a.date = ?) AS today`;
function notify(studentId, text, channel = 'WhatsApp') { run('INSERT INTO notifications (student_id, channel, text) VALUES (?,?,?)', studentId, channel, text); }
const inr = n => '₹' + Number(n).toLocaleString('en-IN');

// ---------- Branches, classes, dashboard ----------
app.get('/api/branches', (req, res) => {
  const u = req.user;
  res.json(u.role === 'admin' ? q('SELECT * FROM branches') : q('SELECT * FROM branches WHERE id = ?', u.branch_id));
});

app.get('/api/classes', (req, res) => {
  const ids = classIds(req.user);
  res.json(q(`SELECT c.id, c.name, c.branch_id, b.name AS branch, u.name AS teacher, c.teacher_id,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.active = 1) AS students,
      (SELECT COUNT(*) FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.class_id = c.id AND a.date = ? AND a.status = 'A') AS absent_today,
      (SELECT COUNT(*) FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.class_id = c.id AND a.date = ?) AS marked_today
    FROM classes c JOIN branches b ON b.id = c.branch_id LEFT JOIN users u ON u.id = c.teacher_id
    WHERE c.id IN ${inList(ids)} ORDER BY b.id, c.name`, today(), today()));
});

app.get('/api/dashboard', (req, res) => {
  const u = req.user, sids = studentIds(u), t = today();
  if (u.role === 'parent') return res.json({ children: sids });
  const totals = one(`SELECT COUNT(*) students,
      (SELECT COALESCE(SUM(amount),0) FROM fee_dues WHERE student_id IN ${inList(sids)}) due,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id IN ${inList(sids)}) paid,
      (SELECT COUNT(*) FROM attendance WHERE date = ? AND status = 'A' AND student_id IN ${inList(sids)}) absent,
      (SELECT COUNT(*) FROM attendance WHERE date = ? AND student_id IN ${inList(sids)}) marked
    FROM students WHERE id IN ${inList(sids)}`, t, t);
  const groupBy = u.role === 'admin' ? 'b.id' : 'c.id';
  const label = u.role === 'admin' ? 'b.name' : `c.name || ' · ' || COALESCE(tu.name,'No teacher')`;
  const rows = q(`SELECT ${label} AS label, COUNT(s.id) AS students,
      SUM((SELECT COALESCE(SUM(amount),0) FROM fee_dues f WHERE f.student_id = s.id)) AS due,
      SUM((SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.student_id = s.id)) AS paid,
      ROUND(100.0 * SUM((SELECT COUNT(*) FROM attendance a WHERE a.student_id = s.id AND a.status IN ('P','L'))) /
        MAX(1, SUM((SELECT COUNT(*) FROM attendance a WHERE a.student_id = s.id))), 1) AS att_pct
    FROM students s JOIN classes c ON c.id = s.class_id JOIN branches b ON b.id = c.branch_id LEFT JOIN users tu ON tu.id = c.teacher_id
    WHERE s.id IN ${inList(sids)} GROUP BY ${groupBy} ORDER BY b.id, c.name`);
  const enquiries = ['admin', 'principal'].includes(u.role)
    ? one(`SELECT COUNT(*) c FROM enquiries WHERE status != 'Admitted' ${u.role === 'principal' ? 'AND branch_id = ' + Number(u.branch_id) : ''}`).c : null;
  const lowAtt = q(`SELECT s.id, s.name, c.name AS class,
      ROUND(100.0 * SUM(a.status IN ('P','L')) / COUNT(*), 1) AS att_pct
    FROM students s JOIN classes c ON c.id = s.class_id JOIN attendance a ON a.student_id = s.id
    WHERE s.id IN ${inList(sids)} GROUP BY s.id HAVING att_pct < 85 ORDER BY att_pct LIMIT 8`);
  res.json({ totals, rows, rowLabel: u.role === 'admin' ? 'Branch' : 'Class', enquiries, lowAtt, date: t });
});

// ---------- Students ----------
app.get('/api/students', (req, res) => {
  const u = req.user; let ids = classIds(u);
  if (u.role === 'parent') {
    return res.json(q(`SELECT s.*, c.name AS class, ${FEE_SQL} FROM students s JOIN classes c ON c.id = s.class_id WHERE s.parent_user_id = ?`, today(), u.id));
  }
  if (req.query.class_id) { if (!canClass(u, req.query.class_id)) return fail(res, 403, 'This class is not assigned to you'); ids = [Number(req.query.class_id)]; }
  const search = '%' + String(req.query.q || '').trim() + '%';
  res.json(q(`SELECT s.id, s.admission_no, s.roll_no, s.name, s.gender, s.father_name, s.phone, s.class_id, c.name AS class, b.name AS branch, ${FEE_SQL}
    FROM students s JOIN classes c ON c.id = s.class_id JOIN branches b ON b.id = c.branch_id
    WHERE s.active = 1 AND s.class_id IN ${inList(ids)} AND (s.name LIKE ? OR s.admission_no LIKE ? OR s.phone LIKE ?)
    ORDER BY b.id, c.name, s.roll_no LIMIT 500`, today(), search, search, search));
});

app.get('/api/students/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!canStudent(req.user, id)) return fail(res, 403, 'You do not have permission to see this student');
  const s = one(`SELECT s.*, c.name AS class, b.name AS branch, t.name AS class_teacher, ${FEE_SQL}
    FROM students s JOIN classes c ON c.id = s.class_id JOIN branches b ON b.id = c.branch_id LEFT JOIN users t ON t.id = c.teacher_id WHERE s.id = ?`, today(), id);
  s.attendance = q('SELECT date, status FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 60', id);
  s.payments = q('SELECT amount, mode, receipt_no, paid_on FROM payments WHERE student_id = ? ORDER BY paid_on DESC', id);
  s.dues = q('SELECT term, amount FROM fee_dues WHERE student_id = ?', id);
  s.marks = q('SELECT exam, subject, marks, max_marks FROM marks WHERE student_id = ? ORDER BY exam, subject', id);
  s.notifications = q('SELECT channel, text, created_at FROM notifications WHERE student_id = ? ORDER BY id DESC LIMIT 20', id);
  s.can_edit_all = ['admin', 'principal'].includes(req.user.role);
  s.can_edit_contact = s.can_edit_all || req.user.role === 'teacher';
  res.json(s);
});

const STUDENT_FIELDS = ['name', 'gender', 'dob', 'father_name', 'mother_name', 'phone', 'address', 'blood_group', 'roll_no', 'class_id'];
const CONTACT_FIELDS = ['phone', 'address', 'blood_group'];

app.post('/api/students', allow('admin', 'principal'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.class_id) return fail(res, 400, 'Name and class are required');
  if (!canClass(req.user, b.class_id)) return fail(res, 403, 'You cannot add students to this class');
  const next = one("SELECT COALESCE(MAX(CAST(SUBSTR(admission_no,4) AS INTEGER)),1000)+1 n FROM students").n;
  const roll = b.roll_no || one('SELECT COALESCE(MAX(roll_no),0)+1 n FROM students WHERE class_id = ?', b.class_id).n;
  const r = run(`INSERT INTO students (admission_no,class_id,roll_no,name,gender,dob,father_name,mother_name,phone,address,blood_group) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'ADM' + next, b.class_id, roll, b.name, b.gender || null, b.dob || null, b.father_name || null, b.mother_name || null, b.phone || null, b.address || null, b.blood_group || null);
  run('INSERT INTO fee_dues (student_id, term, amount) VALUES (?,?,?)', r.lastInsertRowid, TERM, 12000);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/students/:id', allow('admin', 'principal', 'teacher'), (req, res) => {
  const id = Number(req.params.id), u = req.user;
  if (!canStudent(u, id)) return fail(res, 403, 'You can only edit students of your own class');
  const fields = u.role === 'teacher' ? CONTACT_FIELDS : STUDENT_FIELDS;
  const b = req.body || {};
  if (b.class_id && !canClass(u, b.class_id)) return fail(res, 403, 'You cannot move a student to that class');
  const set = fields.filter(f => f in b);
  if (!set.length) return fail(res, 400, 'Nothing to update');
  run(`UPDATE students SET ${set.map(f => f + ' = ?').join(', ')} WHERE id = ?`, ...set.map(f => b[f] === '' ? null : b[f]), id);
  res.json({ ok: true, updated: set });
});

// ---------- Attendance ----------
app.get('/api/attendance', allow('admin', 'principal', 'teacher'), (req, res) => {
  const cid = Number(req.query.class_id), date = req.query.date || today();
  if (!canClass(req.user, cid)) return fail(res, 403, 'This class is not assigned to you');
  res.json({
    date, class_id: cid,
    students: q(`SELECT s.id, s.roll_no, s.name, a.status FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
      WHERE s.class_id = ? AND s.active = 1 ORDER BY s.roll_no`, date, cid)
  });
});

app.post('/api/attendance', allow('admin', 'principal', 'teacher'), (req, res) => {
  const { class_id, date = today(), records = [] } = req.body || {};
  if (!canClass(req.user, class_id)) return fail(res, 403, 'This class is not assigned to you');
  if (date > today()) return fail(res, 400, 'Attendance cannot be marked for a future date');
  const valid = new Set(q('SELECT id FROM students WHERE class_id = ?', class_id).map(r => r.id));
  const up = db.prepare(`INSERT INTO attendance (student_id,date,status,marked_by) VALUES (?,?,?,?)
    ON CONFLICT(student_id,date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by`);
  let absent = 0;
  db.transaction(() => {
    for (const r of records) {
      if (!valid.has(Number(r.student_id)) || !['P', 'A', 'L'].includes(r.status)) continue;
      const prev = one('SELECT status FROM attendance WHERE student_id = ? AND date = ?', r.student_id, date);
      up.run(r.student_id, date, r.status, req.user.id);
      if (r.status === 'A' && prev?.status !== 'A') {
        absent++;
        const s = one('SELECT name FROM students WHERE id = ?', r.student_id);
        notify(r.student_id, `${s.name} is absent from school today (${date}). Please inform the class teacher if this is unexpected.`, 'SMS + WhatsApp');
      }
    }
  })();
  res.json({ ok: true, alerts_sent: absent });
});

app.get('/api/attendance/report', allow('admin', 'principal', 'teacher'), (req, res) => {
  const cid = Number(req.query.class_id), month = req.query.month || today().slice(0, 7);
  if (!canClass(req.user, cid)) return fail(res, 403, 'This class is not assigned to you');
  const days = q(`SELECT DISTINCT a.date FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.class_id = ? AND a.date LIKE ? ORDER BY a.date`, cid, month + '%').map(r => r.date);
  const rows = q(`SELECT s.id, s.roll_no, s.name, GROUP_CONCAT(a.date || ':' || a.status) AS marks,
      SUM(a.status = 'P') AS p, SUM(a.status = 'A') AS a, SUM(a.status = 'L') AS l
    FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date LIKE ?
    WHERE s.class_id = ? AND s.active = 1 GROUP BY s.id ORDER BY s.roll_no`, month + '%', cid);
  res.json({ month, days, rows });
});

// ---------- Marks ----------
app.get('/api/marks', allow('admin', 'principal', 'teacher'), (req, res) => {
  const cid = Number(req.query.class_id), exam = req.query.exam || EXAM;
  if (!canClass(req.user, cid)) return fail(res, 403, 'This class is not assigned to you');
  const students = q('SELECT id, roll_no, name FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_no', cid);
  const marks = q(`SELECT m.student_id, m.subject, m.marks FROM marks m JOIN students s ON s.id = m.student_id WHERE s.class_id = ? AND m.exam = ?`, cid, exam);
  res.json({ exam, subjects: SUBJECTS, students, marks });
});

app.post('/api/marks', allow('admin', 'principal', 'teacher'), (req, res) => {
  const { class_id, exam = EXAM, rows = [], notify_parents } = req.body || {};
  if (!canClass(req.user, class_id)) return fail(res, 403, 'This class is not assigned to you');
  const valid = new Set(q('SELECT id FROM students WHERE class_id = ?', class_id).map(r => r.id));
  const up = db.prepare(`INSERT INTO marks (student_id,exam,subject,marks) VALUES (?,?,?,?)
    ON CONFLICT(student_id,exam,subject) DO UPDATE SET marks = excluded.marks`);
  let n = 0;
  db.transaction(() => {
    for (const r of rows) {
      const m = Number(r.marks);
      if (!valid.has(Number(r.student_id)) || !SUBJECTS.includes(r.subject) || !(m >= 0 && m <= 100)) continue;
      up.run(r.student_id, exam, r.subject, m); n++;
    }
    if (notify_parents) for (const sid of valid) notify(sid, `${exam} report card is ready. Open the parent app to view it.`);
  })();
  res.json({ ok: true, saved: n });
});

// ---------- Fees ----------
app.get('/api/fees', allow('admin', 'principal', 'teacher'), (req, res) => {
  let ids = classIds(req.user);
  if (req.query.class_id) { if (!canClass(req.user, req.query.class_id)) return fail(res, 403, 'This class is not assigned to you'); ids = [Number(req.query.class_id)]; }
  res.json({
    can_collect: req.user.role !== 'teacher',
    students: q(`SELECT s.id, s.roll_no, s.name, s.father_name, s.phone, c.name AS class, b.name AS branch, ${FEE_SQL}
      FROM students s JOIN classes c ON c.id = s.class_id JOIN branches b ON b.id = c.branch_id
      WHERE s.class_id IN ${inList(ids)} AND s.active = 1 ORDER BY b.id, c.name, s.roll_no`, today())
  });
});

app.post('/api/payments', (req, res) => {
  const u = req.user, { student_id, amount, mode } = req.body || {};
  if (!['admin', 'principal', 'parent'].includes(u.role)) return fail(res, 403, 'Only the office or the parent can record a payment');
  if (!canStudent(u, student_id)) return fail(res, 403, 'Not allowed for this student');
  const bal = one(`SELECT (SELECT COALESCE(SUM(amount),0) FROM fee_dues WHERE student_id = ?) - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id = ?) b`, student_id, student_id).b;
  const amt = Math.round(Number(amount));
  if (!(amt > 0) || amt > bal) return fail(res, 400, `Amount must be between 1 and ${bal}`);
  const payMode = u.role === 'parent' ? 'Online (parent app)' : (['UPI', 'Cash', 'Card', 'Cheque'].includes(mode) ? mode : 'Cash');
  const receipt = 'R' + (one("SELECT COALESCE(MAX(CAST(SUBSTR(receipt_no,2) AS INTEGER)),5000)+1 n FROM payments").n);
  run('INSERT INTO payments (student_id,amount,mode,receipt_no,collected_by) VALUES (?,?,?,?,?)', student_id, amt, payMode, receipt, u.id);
  notify(student_id, `Received ${inr(amt)} via ${payMode}. Receipt ${receipt}. Balance: ${inr(bal - amt)}.`);
  res.json({ ok: true, receipt_no: receipt, amount: amt, mode: payMode, balance: bal - amt });
});

app.post('/api/fees/remind', allow('admin', 'principal'), (req, res) => {
  let ids = classIds(req.user);
  if (req.body?.class_id) { if (!canClass(req.user, req.body.class_id)) return fail(res, 403, 'Not allowed'); ids = [Number(req.body.class_id)]; }
  const due = q(`SELECT s.id, s.name, (SELECT COALESCE(SUM(amount),0) FROM fee_dues WHERE student_id = s.id) - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id = s.id) bal
    FROM students s WHERE s.class_id IN ${inList(ids)} AND s.active = 1`).filter(r => r.bal > 0);
  db.transaction(() => due.forEach(s => notify(s.id, `Reminder: ${inr(s.bal)} fee pending for ${s.name}. Pay in the parent app or at the school office.`)))();
  res.json({ ok: true, sent: due.length });
});

// ---------- Homework & notices ----------
app.get('/api/posts', (req, res) => {
  const u = req.user;
  let cls = classIds(u), branches = u.role === 'admin' ? q('SELECT id FROM branches').map(r => r.id) : [u.branch_id];
  if (u.role === 'parent') {
    const kids = q('SELECT s.class_id, c.branch_id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.parent_user_id = ?', u.id);
    cls = kids.map(k => k.class_id); branches = kids.map(k => k.branch_id);
  }
  res.json(q(`SELECT p.*, c.name AS class, b.name AS branch, u.name AS author FROM posts p
    LEFT JOIN classes c ON c.id = p.class_id LEFT JOIN branches b ON b.id = p.branch_id LEFT JOIN users u ON u.id = p.created_by
    WHERE (p.branch_id IS NULL AND p.class_id IS NULL) OR (p.class_id IS NULL AND p.branch_id IN ${inList(branches.filter(Boolean))}) OR p.class_id IN ${inList(cls)}
    ORDER BY p.id DESC LIMIT 50`));
});

app.post('/api/posts', allow('admin', 'principal', 'teacher'), (req, res) => {
  const u = req.user, { type = 'Homework', subject, text, class_id, branch_id } = req.body || {};
  if (!text?.trim()) return fail(res, 400, 'Message is required');
  if (!['Homework', 'Notice'].includes(type)) return fail(res, 400, 'Invalid type');
  let cid = class_id ? Number(class_id) : null, bid = null;
  if (u.role === 'teacher' && !cid) return fail(res, 403, 'Teachers can post only to their own class');
  if (cid) { if (!canClass(u, cid)) return fail(res, 403, 'This class is not assigned to you'); bid = one('SELECT branch_id FROM classes WHERE id = ?', cid).branch_id; }
  else if (u.role === 'principal') bid = u.branch_id;
  else if (branch_id) bid = Number(branch_id);
  run('INSERT INTO posts (branch_id,class_id,type,subject,text,created_by) VALUES (?,?,?,?,?,?)', bid, cid, type, subject || null, text.trim(), u.id);
  res.json({ ok: true });
});

// ---------- Admissions ----------
app.post('/api/public/enquiry', (req, res) => {
  const b = req.body || {};
  if (!b.child_name || !b.phone || !b.branch_id) return fail(res, 400, 'Child name, phone and branch are required');
  run('INSERT INTO enquiries (branch_id,child_name,parent_name,phone,class_wanted,source) VALUES (?,?,?,?,?,?)', b.branch_id, b.child_name, b.parent_name || null, b.phone, b.class_wanted || null, b.source || 'Website');
  res.json({ ok: true });
});
app.get('/api/public/branches', (req, res) => res.json(q('SELECT id, name FROM branches')));

app.get('/api/enquiries', allow('admin', 'principal'), (req, res) => {
  const u = req.user;
  res.json(q(`SELECT e.*, b.name AS branch FROM enquiries e JOIN branches b ON b.id = e.branch_id ${u.role === 'principal' ? 'WHERE e.branch_id = ?' : ''} ORDER BY e.id DESC`, ...(u.role === 'principal' ? [u.branch_id] : [])));
});
app.put('/api/enquiries/:id', allow('admin', 'principal'), (req, res) => {
  const e = one('SELECT branch_id FROM enquiries WHERE id = ?', req.params.id);
  if (!e || !branchOk(req.user, e.branch_id)) return fail(res, 403, 'Not allowed');
  if (!['New', 'Called', 'Visit booked', 'Admitted', 'Not interested'].includes(req.body?.status)) return fail(res, 400, 'Invalid status');
  run('UPDATE enquiries SET status = ? WHERE id = ?', req.body.status, req.params.id);
  res.json({ ok: true });
});

// ---------- Staff & class-teacher assignment ----------
app.get('/api/staff', allow('admin', 'principal'), (req, res) => {
  const u = req.user;
  res.json(q(`SELECT u.id, u.name, u.username, u.role, u.phone, b.name AS branch, u.branch_id,
      (SELECT GROUP_CONCAT(name, ', ') FROM classes WHERE teacher_id = u.id) AS classes
    FROM users u LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.role IN ('teacher','principal') ${u.role === 'principal' ? 'AND u.branch_id = ' + Number(u.branch_id) : ''} ORDER BY u.branch_id, u.role DESC, u.name`));
});

app.post('/api/staff', allow('admin', 'principal'), (req, res) => {
  const b = req.body || {}, u = req.user;
  const branch = u.role === 'principal' ? u.branch_id : Number(b.branch_id);
  const role = u.role === 'admin' && b.role === 'principal' ? 'principal' : 'teacher';
  if (!b.name || !b.username || !b.password || !branch) return fail(res, 400, 'Name, username, password and branch are required');
  if (String(b.password).length < 6) return fail(res, 400, 'Password must be at least 6 characters');
  try {
    const r = run('INSERT INTO users (name,username,password_hash,role,branch_id,phone) VALUES (?,?,?,?,?,?)', b.name, String(b.username).trim().toLowerCase(), bcrypt.hashSync(b.password, 8), role, branch, b.phone || null);
    res.json({ id: r.lastInsertRowid });
  } catch { fail(res, 400, 'Username already exists'); }
});

app.put('/api/classes/:id/teacher', allow('admin', 'principal'), (req, res) => {
  const c = one('SELECT * FROM classes WHERE id = ?', req.params.id);
  if (!c || !canClass(req.user, c.id)) return fail(res, 403, 'Not allowed');
  const tid = req.body?.teacher_id ? Number(req.body.teacher_id) : null;
  if (tid) { const t = one("SELECT * FROM users WHERE id = ? AND role = 'teacher'", tid); if (!t || t.branch_id !== c.branch_id) return fail(res, 400, 'Teacher must belong to the same branch'); }
  run('UPDATE classes SET teacher_id = ? WHERE id = ?', tid, c.id);
  res.json({ ok: true });
});

app.post('/api/classes', allow('admin', 'principal'), (req, res) => {
  const b = req.body || {}, branch = req.user.role === 'principal' ? req.user.branch_id : Number(b.branch_id);
  if (!b.name || !branch) return fail(res, 400, 'Class name and branch are required');
  try { res.json({ id: run('INSERT INTO classes (branch_id,name) VALUES (?,?)', branch, String(b.name).trim()).lastInsertRowid }); }
  catch { fail(res, 400, 'This class already exists in the branch'); }
});

// ---------- Notifications log ----------
app.get('/api/notifications', (req, res) => {
  const ids = studentIds(req.user);
  res.json(q(`SELECT n.*, s.name AS student, s.phone FROM notifications n JOIN students s ON s.id = n.student_id
    WHERE n.student_id IN ${inList(ids)} ORDER BY n.id DESC LIMIT 100`));
});

app.get('/api/meta', (req, res) => res.json({ term: TERM, exam: EXAM, subjects: SUBJECTS, today: today() }));

app.use('/api', (req, res) => fail(res, 404, 'Not found'));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) app.listen(PORT, () => console.log(`VidyaDesk running at http://localhost:${PORT}`));
module.exports = app;
