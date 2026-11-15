// Serverless Backend Function: /api/data
// ทำหน้าที่เป็น Backend API ดึงข้อมูลประวัติจาก Google Apps Script / Google Sheets
// ซ่อน URL ของ Google Sheets และป้องกันปัญหา CORS

module.exports = async (req, res) => {
  // ตั้งค่า CORS ให้เรียกใช้งานได้ปลอดภัย
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ป้องกันการเข้าถึง API หลังบ้านโดยตรงผ่านการพิมพ์ URL บนเบราว์เซอร์
  const secFetchDest = req.headers['sec-fetch-dest'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  const acceptHeader = req.headers['accept'] || '';
  if (secFetchDest === 'document' || secFetchMode === 'navigate' || acceptHeader.includes('text/html')) {
    return res.status(403).json({
      status: 'error',
      message: '🔒 ไม่อนุญาตให้เข้าถึง API หลังบ้านโดยตรง (Direct access is forbidden)',
      code: 'DIRECT_ACCESS_BLOCKED'
    });
  }

  // URL แหล่งข้อมูลหลัก (สามารถตั้งค่าผ่าน Vercel Environment Variables ได้)
  const UPSTREAM_URL = process.env.GOOGLE_SHEET_URL || 
    "https://script.google.com/macros/s/AKfycbzwn88j4InLcqY7DiwB7NsKbjbFmcm6LPdS9MS0atQCvLwhvrU-vm4kjMNSpoFC8FeD/exec";

  try {
    const response = await fetch(UPSTREAM_URL, {
      redirect: 'follow',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ESP32-Dashboard-Backend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Upstream returned status ${response.status}`);
    }

    const data = await response.json();

    // แคชชั่วคราวบน Vercel Edge Server 15 วินาที เพื่อความรวดเร็วและไม่เปลืองโควตา Google
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Backend API [/api/data] error:', error);
    return res.status(502).json({
      status: 'error',
      message: 'ไม่สามารถดึงข้อมูลจากแหล่งจัดเก็บหลังบ้านได้: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
};
