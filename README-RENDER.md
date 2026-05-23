# Deploy to Render Free

คู่มือนี้สำหรับเอา Clip Organizer V1 ขึ้น Render Free แบบ “ส่งลิงก์ให้ทีมเล็กแล้วกดใช้งานได้เลย”

หลักคิดของโหมดนี้:

- คนที่มีลิงก์เว็บเปิดแอพได้เลย ไม่ต้องล็อกอิน
- Google Sheet / Drive ยังตั้งเป็น `จำกัด` ได้
- แอพอ่านชีต private ผ่าน Service Account
- เหมาะกับทีมเล็ก เช่น ไม่เกิน 5 คน

## สิ่งที่ต้องมี

- บัญชี Render
- GitHub repo ที่มีไฟล์แอพนี้
- Google Service Account สำหรับอ่าน Google Sheet / Drive

ไม่จำเป็นต้องมี Google OAuth ถ้าไม่ต้องการล็อกอิน

## 1. เตรียมโค้ดขึ้น GitHub

ไฟล์ที่ต้องอยู่ใน repo:

- `server.mjs`
- `index.html`
- `package.json`
- `config.online.json`
- `render.yaml`
- `Dockerfile` ถ้าต้องการใช้ Docker ภายหลัง

ไฟล์ที่ไม่ควรเอาขึ้น:

- `config.json`
- `.env`
- `.scan-index.json`
- ไฟล์ JSON key ของ Service Account

มี `.gitignore` กันไฟล์พวกนี้ไว้แล้ว

## 2. สร้าง Web Service ใน Render

1. เข้า Render Dashboard
2. กด `New +`
3. เลือก `Web Service`
4. Connect GitHub repo ของแอพ
5. เลือก branch ที่ต้องการ deploy
6. ตั้งค่า:

```text
Name: clip-organizer-v1
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free
```

## 3. ตั้ง Environment Variables ใน Render

เข้าเมนู `Environment` ของ service แล้วเพิ่มค่าต่อไปนี้:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=10000
COOKIE_SECURE=1
GOOGLE_SERVICE_ACCOUNT_EMAIL=อีเมล service account
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=private key ทั้งก้อนจาก JSON key
```

หมายเหตุสำหรับ private key:

- ให้ใส่ตั้งแต่ `-----BEGIN PRIVATE KEY-----` ถึง `-----END PRIVATE KEY-----`
- ถ้า Render รับค่าเป็นบรรทัดเดียว ให้ใช้ `\n` แทนขึ้นบรรทัดใหม่
- ห้ามส่งค่านี้ให้คนอื่น และห้ามใส่ลง GitHub

## 4. แชร์ชีต/Drive ให้ Service Account

เปิด Google Sheet และ Google Drive folder ที่แอพต้องอ่าน แล้วแชร์ให้:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
```

สิทธิ์ที่แนะนำ:

```text
Viewer
```

เมื่อแชร์แล้ว ชีตและไฟล์ยังตั้งเป็น `จำกัด` ได้ แอพจะอ่านผ่าน Service Account

## 5. ทดสอบ

1. กด `Manual Deploy` หรือรอ Render deploy
2. เปิด URL ของ Render
3. ตรวจแท็บ:

- Dashboard ตำแหน่ง
- ค้นคลังทั้งหมด
- คลังเอกสาร

## ถ้าอยากเปิดล็อกอินภายหลัง

ค่อยตั้ง Google OAuth เพิ่ม:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://ชื่อเว็บบน-render.onrender.com/auth/google/callback
ALLOWED_EMAILS=suntzu.tutor.official@gmail.com,tlezz98@gmail.com
```

แล้วแก้ `config.online.json`:

```json
"requireLogin": true
```

## ข้อจำกัดของ Render Free

- เว็บอาจหลับเมื่อไม่มีคนใช้งาน
- เปิดครั้งแรกหลังหลับอาจรอประมาณ 30-60 วินาที
- เหมาะกับทดลองใช้งานหรือทีมเล็กก่อน

## หมายเหตุเรื่องแท็บจัดคลิปตามตำแหน่ง

แท็บนี้ยังเป็น Local Clip Mode เพราะต้องอ่านคลิปจากเครื่อง เช่น `D:\ตัดแล้ว`

บน Render จะไม่มีไดรฟ์ D: ของเครื่องคุณ ดังนั้นออนไลน์ควรใช้เพื่อ:

- Dashboard
- คลังเอกสาร
- ค้นคลังทั้งหมด
- เปิด/คัดลอกลิงก์
