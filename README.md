# VidyaDesk: School Management System

Ek multi-branch school management app jisme login aur role-based permissions hain.
Stack: **Node.js + Express + SQLite (Node ka built-in `node:sqlite`, kuch compile nahi karna)**, JWT login, aur plain HTML/JS frontend.

## Chalane ka tareeka

Node.js 22.13 ya usse naya chahiye (Node 22 LTS ya 24 LTS).

```bash
npm install
npm start
```

Browser me kholiye: http://localhost:3000

Pehli baar chalane par `data/school.db` ban jaata hai jisme demo data hota hai: 3 branches, 12 classes, 180 students, 20 din ki attendance, fees aur marks.
Demo data dobara shuru se banana ho to: `npm run reset`

## Demo logins

| Role | Username | Password | Kya dikhega |
|---|---|---|---|
| Owner / Admin | admin | admin123 | Saari branches, saari classes |
| Principal (Main Campus) | principal1 | principal123 | Sirf apni branch ki classes |
| Class teacher 8-A | teacher8a | teacher123 | Sirf Class 8-A |
| Class teacher 6-A | teacher6a | teacher123 | Sirf Class 6-A |
| Parent | parent | parent123 | Sirf apna bachcha (8-A) |

Doosri branches ke teachers: `teacher8a_b2`, `teacher5a_b3` waghaira (password `teacher123`). Principals: `principal2`, `principal3`.

## Permissions (server par check hoti hain)

| Feature | Admin | Principal | Class teacher | Parent |
|---|---|---|---|---|
| Dashboard | Branch-wise, sab branches | Class-wise, apni branch | Apni class | Apne bachche ka profile |
| Students list / profile | Sab | Apni branch | Sirf apni class | Sirf apna bachcha |
| Student add / poori details edit | Haan | Haan (apni branch) | Nahi, sirf phone, address, blood group | Nahi |
| Attendance mark + monthly register | Sab classes | Apni branch | Sirf apni class | Dekh sakta hai |
| Marks entry | Sab | Apni branch | Sirf apni class | Report card dekh sakta hai |
| Fees | Dekhna + collect + reminder | Dekhna + collect + reminder | Sirf status dekhna | Online pay (demo) |
| Homework / notices post | Kisi ko bhi | Branch ya class | Sirf apni class | Padh sakta hai |
| Admissions enquiries | Sab | Apni branch | Nahi | Nahi |
| Staff login + class teacher assign | Sab | Apni branch | Nahi | Nahi |

Permission ka asli logic `server.js` me `classIds()`, `canClass()` aur `canStudent()` functions me hai. Har API inhi se check karti hai, isliye teacher URL badal kar bhi doosri class ka data nahi dekh sakta.

## Demo me kya dikhayein (5 minute)

1. **teacher8a** se login karke dikhaiye ki sirf 8-A dikhta hai. Attendance me 2 bachchon ko A mark karke save kijiye; parent alert ban jaata hai.
2. **parent** se login karke dikhaiye ki "Today: Absent" aur message aa gaya. "Pay online" dabaiye.
3. **principal1** se Classes page pe class teacher badal kar dikhaiye, phir Fees me "Collect" se receipt banaiye.
4. **admin** se dikhaiye ki teeno branches ek dashboard pe aati hain.

## Folder structure

```
server.js        API routes + permission checks
db.js            Database tables + demo data
public/          Frontend (index.html, app.js, style.css)
data/school.db   SQLite database (apne aap banta hai)
```

## Production ke liye agla kaam

- `JWT_SECRET` environment variable me apna strong secret daaliye.
- SQLite ki jagah PostgreSQL/MySQL (zyada branches aur online hosting ke liye).
- Asli WhatsApp/SMS: abhi alerts sirf `notifications` table me save hote hain. WhatsApp Business API ya MSG91 jodna hai.
- Asli online payment: Razorpay / UPI gateway.
- Report card ki PDF (abhi browser ka "Print / save as PDF" hai).
- Parent ka login OTP se, aur password reset.
- Hosting: VPS ya Render/Railway par HTTPS ke saath, aur database ka roz backup.
