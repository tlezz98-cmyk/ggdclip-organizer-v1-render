# ระบบตามงานผ่าน Telegram

ระบบนี้ทำให้แอพตอบคำถามในกลุ่ม Telegram ได้ เช่น:

- สรุปงานค้าง
- งานด่วนวันนี้
- กกต การเงินเหลืออะไร
- วิชาไหนมีคลิปแล้วแต่ยังไม่ลงลิงก์
- งานเอกสารค้าง

## ใช้ตอนคอมปิดได้อย่างไร

ถ้าคอมเครื่องนี้ปิดอยู่ บอทต้องรันบนแอพออนไลน์ เช่น Render:

`https://ggdclip-organizer-v1-render.onrender.com`

ข้อมูลที่ตอบได้ตอนคอมปิดต้องอยู่บนคลาวด์ เช่น Google Sheet, Dashboard, สารบัญเอกสาร หรือ audit snapshot ที่อัปขึ้นไปแล้ว ระบบออนไลน์จะอ่านไดรฟ์ `D:\ตัดแล้ว` ของเครื่องนี้สด ๆ ไม่ได้ถ้าเครื่องปิด

## ค่าที่ต้องตั้งบน Render

ตั้ง Environment Variables:

```text
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=ใส่ token จาก BotFather
TELEGRAM_CHAT_ID=ใส่ chat id ของกลุ่ม เช่น -100xxxxxxxxxx
TELEGRAM_WEBHOOK_SECRET=ตั้งเป็นข้อความสุ่มยาว ๆ
PUBLIC_BASE_URL=https://ggdclip-organizer-v1-render.onrender.com
TELEGRAM_DAILY_SUMMARY_TIME=09:00
TELEGRAM_TIME_ZONE=Asia/Bangkok
```

ถ้า Google Sheet เป็น private ให้ตั้ง Service Account ด้วย:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
```

## เชื่อม Telegram

1. สร้างบอทใน Telegram ผ่าน BotFather แล้วเก็บ Bot Token
2. เพิ่มบอทเข้ากลุ่ม Telegram
3. ถ้าต้องการให้พิมพ์ภาษาคนได้โดยไม่ต้อง mention บอท ให้ปิด privacy mode ของบอทใน BotFather
4. ตั้งค่า Environment Variables บน Render
5. เปิดหน้า `?tab=tasks`
6. กด `เชื่อม webhook`
7. ส่งข้อความทดสอบในกลุ่ม เช่น `สรุปงานค้าง`

## หมายเหตุ Render

ถ้าใช้ Render Free แอพอาจหลับเมื่อไม่มีคนเข้าใช้งาน ข้อความแรกจาก Telegram อาจปลุกแอพแต่ตอบช้า หรือ timeout ได้ ถ้าต้องใช้จริงแบบนอกบ้านตลอดเวลา แนะนำใช้แผนที่ไม่หลับ หรือมีตัว ping ปลุกตามรอบ
