# ระบบวัดอุณหภูมิและความชื้น ESP32 Web Dashboard

Web Application Dashboard สำหรับแสดงผลและค้นหาข้อมูลอุณหภูมิและความชื้นจากบอร์ด ESP32 + DHT11 เชื่อมต่อผ่าน Firebase Realtime Database 

---

## 📁 โครงสร้างโปรเจกต์

```
WebIOT/
├── index.html        # หน้าแดชบอร์ดภาพรวม (Real-time Live Overview)
├── history.html      # หน้าค้นหาข้อมูลตามช่วงเวลา กราฟแนวโน้ม และตารางประวัติ
├── style.css         # สไตล์การจัดวาง Responsive สำหรับมือถือ แท็บเล็ต iPad และ PC
├── app.js            # ตรรกะดึงข้อมูล Firebase/Google Sheets, Chart.js, Heat Index
├── logo.svg          # โลโก้และ Favicon ประจำโปรเจกต์
├── vercel.json       # ไฟล์คอนฟิก Deploy บน Vercel
├── simulate-esp32.js # สคริปต์ Node.js จำลองบอร์ด ESP32 ส่งข้อมูลทดสอบ
├── .gitignore        # ป้องกันไฟล์ความลับหลุดขึ้น GitHub
├── apps-script/
│   └── Code.gs       # โค้ดสำหรับ Google Sheets Sync (กู้คืน/สำรองข้อมูล)
└── esp32-firmware/   # โค้ด PlatformIO สำหรับบอร์ด ESP32 + DHT11
    ├── platformio.ini
    └── src/main.cpp
```

---

## 🚀 วิธีเปิดใช้งาน

### 1. ใส่ Firebase Config (ตามคู่มือขั้นที่ 3.4)
เปิดไฟล์ [app.js](file:///d:/WebIOT/app.js) แล้วนำค่า `firebaseConfig` จาก Firebase Console มาวางในตัวแปร:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  // ...
};
```
*(หรือเปิดหน้าเว็บแล้วกดปุ่มรูปฟันเฟือง ⚙️ / "ตั้งค่าด่วน" เพื่อวางและทดสอบได้ทันที)*

### 2. รันหน้าเว็บด้วย Live Server ใน VS Code (ขั้นที่ 5.5)
1. คลิกขวาที่ไฟล์ `index.html` ใน VS Code
2. เลือก **Open with Live Server** (ห้ามดับเบิลคลิกเปิดไฟล์ตรง ๆ เพื่อให้ ES Module ทำงานได้)

### 3. ฟีเจอร์ที่มีในหน้านี้
- **ตัวเลขแบบ Real-time:** แสดงอุณหภูมิ (°C) และความชื้น (%) ล่าสุด อัปเดตทันทีเมื่อเซ็นเซอร์ส่งข้อมูล
- **สถานะการทำงาน:** ขึ้น `● ออนไลน์` เมื่อมีข้อมูลใหม่ หรือ `● ออฟไลน์` หากไม่มีข้อมูลเกิน 10 นาที
- **กราฟ 24 ชั่วโมงล่าสุด:** แสดงเส้นอุณหภูมิ (สีส้ม) และความชื้น (สีน้ำเงิน) แบบ 2 แกน (Dual Y-Axis)
- **ระบบค้นหาย้อนหลัง:** เลือกวันที่และช่วงเวลาเพื่อดูกราฟ, ตารางข้อมูลรายจุด และค่าสรุปสถิติ (ต่ำสุด, สูงสุด, ค่าเฉลี่ย)
- **โหมดข้อมูลจำลอง (Demo Mode):** สามารถกดทดสอบดูกราฟและฟังก์ชันทั้งหมดได้แม้ยังไม่ได้ต่อบอร์ด ESP32 หรือยังไม่มีฐานข้อมูล Firebase
- **ส่งออกไฟล์ CSV:** สามารถดาวน์โหลดผลการค้นหาเป็นไฟล์ CSV ได้ทันที
