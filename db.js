// Database: schema + demo seed data (SQLite file: data/school.db)
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+, nothing to compile
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'data');
fs.mkdirSync(DIR, { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'school.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// small helper so code can call db.transaction(fn)() like better-sqlite3
db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try { const r = fn(...args); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','principal','teacher','parent')),
  branch_id INTEGER REFERENCES branches(id),
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id),
  UNIQUE(branch_id, name)
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  admission_no TEXT UNIQUE NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  roll_no INTEGER,
  name TEXT NOT NULL,
  gender TEXT, dob TEXT,
  father_name TEXT, mother_name TEXT,
  phone TEXT, address TEXT, blood_group TEXT,
  parent_user_id INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','L')),
  marked_by INTEGER REFERENCES users(id),
  UNIQUE(student_id, date)
);
CREATE TABLE IF NOT EXISTS fee_dues (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  term TEXT NOT NULL, amount INTEGER NOT NULL,
  UNIQUE(student_id, term)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  amount INTEGER NOT NULL, mode TEXT NOT NULL,
  receipt_no TEXT UNIQUE NOT NULL,
  paid_on TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  collected_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  exam TEXT NOT NULL, subject TEXT NOT NULL,
  marks REAL NOT NULL, max_marks REAL NOT NULL DEFAULT 100,
  UNIQUE(student_id, exam, subject)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER REFERENCES branches(id),
  class_id INTEGER REFERENCES classes(id),
  type TEXT NOT NULL CHECK (type IN ('Homework','Notice')),
  subject TEXT, text TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  child_name TEXT NOT NULL, parent_name TEXT, phone TEXT,
  class_wanted TEXT, source TEXT DEFAULT 'Website',
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  channel TEXT NOT NULL, text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

const TERM = 'Term 2 (2026-27)';
const EXAM = 'Half-Yearly';
const SUBJECTS = ['English', 'Hindi', 'Maths', 'Science', 'SST'];

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM branches').get().c) return;
  let s = 42; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const hash = p => bcrypt.hashSync(p, 8);
  const FN_B = ['Aarav','Vivaan','Aditya','Ishaan','Arjun','Kabir','Reyansh','Krishna','Rohan','Dev','Yash','Atharv','Shaurya','Veer','Om','Laksh','Harsh','Parth'];
  const FN_G = ['Ananya','Diya','Kavya','Riya','Saanvi','Myra','Aadhya','Anika','Pari','Tara','Meera','Navya','Ira','Siya','Avni','Kiara','Prisha','Nisha'];
  const LN = ['Sharma','Verma','Gupta','Singh','Yadav','Jain','Agarwal','Mishra','Patel','Chauhan','Saxena','Tiwari'];
  const MOM = ['Sunita','Pooja','Neha','Anjali','Rekha','Kiran','Seema','Priya','Rita','Mamta'];
  const DAD = ['Rajesh','Sanjay','Amit','Vikas','Manoj','Sunil','Rakesh','Deepak','Anil','Ravi'];
  const AREAS = ['Civil Lines','Shastri Nagar','Model Town','Station Road','Kamla Nagar','Green Park'];

  const tx = db.transaction(() => {
    const insB = db.prepare('INSERT INTO branches (name,address) VALUES (?,?)');
    const branches = ['Main Campus', 'Civil Lines', 'Shastri Nagar'].map(n => insB.run(n, n + ', City').lastInsertRowid);
    const insU = db.prepare('INSERT INTO users (name,username,password_hash,role,branch_id,phone) VALUES (?,?,?,?,?,?)');
    insU.run('School Owner', 'admin', hash('admin123'), 'admin', null, '9800000001');
    const pw = hash('principal123'), tw = hash('teacher123');
    branches.forEach((b, i) => insU.run(['Dr. Meena Joshi', 'Mr. R. K. Pandey', 'Mrs. Alka Rao'][i], 'principal' + (i + 1), pw, 'principal', b, '98000001' + (10 + i)));

    const insC = db.prepare('INSERT INTO classes (branch_id,name,teacher_id) VALUES (?,?,?)');
    const insS = db.prepare(`INSERT INTO students (admission_no,class_id,roll_no,name,gender,dob,father_name,mother_name,phone,address,blood_group,parent_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insFee = db.prepare('INSERT INTO fee_dues (student_id,term,amount) VALUES (?,?,?)');
    const insPay = db.prepare('INSERT INTO payments (student_id,amount,mode,receipt_no,paid_on,collected_by) VALUES (?,?,?,?,?,?)');
    const insM = db.prepare('INSERT INTO marks (student_id,exam,subject,marks) VALUES (?,?,?,?)');
    const insA = db.prepare('INSERT INTO attendance (student_id,date,status,marked_by) VALUES (?,?,?,?)');
    const parentPw = hash('parent123');

    // last 20 school days (Mon-Sat), excluding today
    const days = []; const d = new Date(); d.setDate(d.getDate() - 1);
    while (days.length < 20) { if (d.getDay() !== 0) days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1); }

    const TEACHERS = ['Mrs. Kavita Sharma','Mr. Anil Verma','Ms. Pooja Mehta','Mr. Sunil Yadav','Mrs. Nidhi Gupta','Mr. Rahul Jain','Mrs. Shalini Singh','Mr. Vinod Mishra','Ms. Ritu Agarwal','Mr. Ajay Patel','Mrs. Rekha Tiwari','Mr. Deepak Saxena'];
    let adm = 1001, rcpt = 5001, tIdx = 0, parentMade = false;
    branches.forEach((b, bi) => {
      ['5-A', '6-A', '7-A', '8-A'].forEach(cn => {
        const uname = bi === 0 ? 'teacher' + cn.replace('-', '').toLowerCase() : 'teacher' + cn.replace('-', '').toLowerCase() + '_b' + (bi + 1);
        const tid = insU.run(TEACHERS[tIdx++ % TEACHERS.length], uname, tw, 'teacher', b, '97000' + String(10000 + tIdx)).lastInsertRowid;
        const cid = insC.run(b, cn, tid).lastInsertRowid;
        for (let r = 1; r <= 15; r++) {
          const girl = rnd() < .5, ln = pick(LN), name = (girl ? pick(FN_G) : pick(FN_B)) + ' ' + ln;
          const dad = pick(DAD) + ' ' + ln, mom = pick(MOM) + ' ' + ln;
          const phone = '98' + String(10000000 + Math.floor(rnd() * 89999999));
          let parentId = null;
          if (!parentMade && bi === 0 && cn === '8-A' && r === 1) {
            parentId = insU.run(dad, 'parent', parentPw, 'parent', b, phone).lastInsertRowid; parentMade = true;
          }
          const age = 5 + parseInt(cn), dob = `${2026 - age}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
          const sid = insS.run('ADM' + adm++, cid, r, name, girl ? 'F' : 'M', dob, dad, mom, phone, `${1 + Math.floor(rnd() * 200)}, ${pick(AREAS)}`, pick(['A+','B+','O+','AB+','O-']), parentId).lastInsertRowid;
          insFee.run(sid, TERM, 12000);
          const fr = rnd();
          if (parentId) insPay.run(sid, 6000, 'UPI', 'R' + rcpt++, days[10] + ' 10:30:00', null);
          else if (fr < .55) insPay.run(sid, 12000, pick(['UPI', 'Cash']), 'R' + rcpt++, days[Math.floor(rnd() * 15)] + ' 11:00:00', null);
          else if (fr < .8) insPay.run(sid, 6000, pick(['UPI', 'Cash']), 'R' + rcpt++, days[Math.floor(rnd() * 15)] + ' 11:00:00', null);
          const base = 45 + rnd() * 45;
          SUBJECTS.forEach(sub => insM.run(sid, EXAM, sub, Math.max(20, Math.min(100, Math.round(base + (rnd() - .5) * 25)))));
          const absRate = rnd() < .15 ? .2 : .05;
          days.forEach(dt => insA.run(sid, dt, rnd() < absRate ? 'A' : (rnd() < .02 ? 'L' : 'P'), tid));
        }
      });
    });
    const insP = db.prepare('INSERT INTO posts (branch_id,class_id,type,subject,text,created_by) VALUES (?,?,?,?,?,?)');
    insP.run(null, null, 'Notice', null, 'School will remain closed on Monday for the festival.', 1);
    insP.run(branches[0], null, 'Notice', null, 'Parent-teacher meeting on Saturday, 10 am to 1 pm.', 2);
    const insE = db.prepare('INSERT INTO enquiries (branch_id,child_name,parent_name,phone,class_wanted,source,status) VALUES (?,?,?,?,?,?,?)');
    insE.run(branches[0], 'Aryan Kapoor', 'Mr. Kapoor', '9876501234', 'Nursery', 'Website', 'New');
    insE.run(branches[0], 'Sara Khan', 'Mrs. Khan', '9812345670', 'Class 1', 'Walk-in', 'Called');
    insE.run(branches[1], 'Laksh Mehta', 'Mr. Mehta', '9900112233', 'Class 5', 'Facebook', 'Visit booked');
  });
  tx();
  console.log('Demo data created.');
}
seed();

module.exports = { db, TERM, EXAM, SUBJECTS };
