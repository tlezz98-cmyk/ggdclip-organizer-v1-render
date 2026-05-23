# Clip Organizer Online Ready

แพ็กนี้เป็นชุดสำหรับนำแอพขึ้นออนไลน์ โดยตัดไฟล์ข้อมูลในเครื่องออกแล้ว

## ไฟล์สำคัญ

- `server.mjs` เซิร์ฟเวอร์ Node.js
- `index.html` หน้าแอพ
- `package.json` คำสั่งเริ่มรัน `npm start`
- `Open Clip Organizer.vbs` ตัวเปิดแอพบน Windows แบบไม่โชว์ Command Prompt
- `.env.example` ตัวอย่างค่าที่ต้องตั้งบนโฮสต์ออนไลน์
- `config.online.json` ค่าเริ่มต้นแบบออนไลน์ ไม่ผูก path ในเครื่อง
- `Dockerfile` สำหรับ Cloud Run / VPS / โฮสต์ที่รองรับ Docker
- `render.yaml` และ `README-RENDER.md` สำหรับขึ้น Render Free

## ขึ้น Render Free

ถ้าต้องการให้คนอื่นเปิดผ่านเว็บโดยไม่ต้องแตะ Command Prompt ให้ใช้คู่มือ `README-RENDER.md`

สรุปค่าหลัก:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free
```

บน Render ให้ตั้งค่า Google OAuth และ Service Account ใน Environment Variables แทนการใส่ความลับลงไฟล์

## เปิดบน Windows โดยไม่ใช้ Command Prompt

สำหรับเครื่องที่ต้องการรันแอพเอง:

1. ติดตั้ง Node.js LTS หนึ่งครั้ง
2. แตกไฟล์ zip
3. ดับเบิลคลิก `Open Clip Organizer.vbs`

ไฟล์นี้จะเปิดเซิร์ฟเวอร์แบบซ่อนหน้าต่างคำสั่ง แล้วเปิด `http://127.0.0.1:8787/` ให้เอง

ถ้านำขึ้นออนไลน์จริง ผู้ใช้ทั่วไปไม่ต้องติดตั้งอะไรเลย ให้เปิด URL ของเว็บแอพอย่างเดียว

## ให้คนอื่นใช้ง่ายที่สุด

โหมดที่เหมาะกับผู้ใช้ทั่วไปคือเอาแอพขึ้นออนไลน์ แล้วตั้งค่า 2 ส่วนนี้ให้เสร็จ:

1. `Service Account` สำหรับให้แอพอ่านชีต/Drive ที่ตั้งเป็น private
2. `Google OAuth` เฉพาะกรณีต้องการบังคับล็อกอิน

ค่าเริ่มต้นของชุดออนไลน์ตอนนี้คือ `onlineMode: true` และ `requireLogin: false` หมายความว่าคนที่มีลิงก์เว็บจะเปิดและกดใช้งานได้เลย แต่แอพยังอ่านชีต private ผ่าน Service Account

## Private Google Sheets

ถ้าต้องการให้แอพอ่านชีตได้เสมอ แม้ชีตตั้งเป็น “จำกัด” ให้ใช้ Service Account

1. เปิด Google Cloud Console
2. เปิด Google Sheets API และ Google Drive API
3. สร้าง Service Account
4. สร้าง JSON key แล้วนำ `client_email`, `private_key`, `project_id` มาใส่ในแอพ
5. แชร์ Google Sheet หรือ Google Drive folder ให้ `client_email` ของ Service Account เป็น Viewer

เมื่อทำแบบนี้ ผู้ใช้ทั่วไปไม่จำเป็นต้องมีสิทธิ์เปิดชีตโดยตรง แต่แอพยังโหลด Dashboard / คลังเอกสาร / ค้นคลังทั้งหมด ได้

## ค่า Environment ที่ควรตั้งบนออนไลน์

```text
HOST=0.0.0.0
PORT=8787
NODE_ENV=production
COOKIE_SECURE=1

GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

ตั้งค่า Service Account ได้อีก 2 วิธี:

```text
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"...","project_id":"..."}
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/app/service-account.json
```

## Google OAuth

OAuth ใช้สำหรับล็อกอินเข้าแอพและจำกัดอีเมลที่เข้าได้ ไม่ใช่วิธีหลักในการอ่านชีต private

1. สร้าง OAuth Client แบบ Web application
2. ใส่ Authorized redirect URI เช่น `https://your-domain.com/auth/google/callback`
3. ตั้งค่า environment:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback
```

อีเมลที่อนุญาตไว้ในแพ็กนี้:

- `suntzu.tutor.official@gmail.com`
- `tlezz98@gmail.com`

## โหมดที่เหมาะกับออนไลน์

- Dashboard ตำแหน่ง
- ค้นคลังทั้งหมด
- คลังเอกสาร

แท็บจัดคลิปตามตำแหน่งยังเป็น Local Clip Mode เพราะต้องอ่านไฟล์วิดีโอในเครื่องผู้ใช้
