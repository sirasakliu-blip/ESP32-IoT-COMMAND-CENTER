// Serverless Backend Function: /api/live
// ทำหน้าที่เป็น Backend API ดึงข้อมูลเซนเซอร์ล่าสุดแบบ Real-time จาก Firebase RTDB
// ป้องกันการเปิดเผย URL ฐานข้อมูล Firebase โดยตรงต่อผู้ใช้หน้าเว็บ

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const FIREBASE_LIVE_URL = process.env.FIREBASE_LIVE_URL || 
    "https://temp-humid-esp32-db4b9-default-rtdb.asia-southeast1.firebasedatabase.app/live.json";

  try {
    const response = await fetch(FIREBASE_LIVE_URL + '?t=' + Date.now(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ESP32-Dashboard-Backend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Upstream returned status ${response.status}`);
    }

    const data = await response.json();

    // ข้อมูลสดไม่ทำการแคชเพื่อให้อัปเดต Real-time เสมอ
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Backend API [/api/live] error:', error);
    return res.status(502).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลสดจากหลังบ้านได้: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
};
