/* ==========================================================================
   ระบบวัดอุณหภูมิและความชื้น ESP32 Dashboard (app.js)
   รองรับทั้ง Google Sheets และ Firebase Realtime Database แบบ Real-time
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  query, 
  orderByChild, 
  limitToLast, 
  startAt, 
  endAt, 
  onValue, 
  get 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ==========================================================================
// ===== แก้ตรงนี้: วาง firebaseConfig หรือ Google Sheet URL ของคุณ =====
// ==========================================================================
const firebaseConfig = {
  // วางค่าที่คัดลอกจาก Firebase Console ที่นี่ (ถ้าใช้ Firebase)
};

// วาง Google Sheet URL หรือ Web App URL ของคุณที่นี่:
const DEFAULT_GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzwn88j4InLcqY7DiwB7NsKbjbFmcm6LPdS9MS0atQCvLwhvrU-vm4kjMNSpoFC8FeD/exec"; 

// ==========================================================================
// ===== 1. ตัวแปรสถานะและ DOM Elements =====
// ==========================================================================
const htmlRoot = document.documentElement;
const themeToggleBtn = document.getElementById("themeToggleBtn");
const statusEl = document.getElementById("status");
const tempEl = document.getElementById("temp");
const humEl = document.getElementById("hum");
const updatedEl = document.getElementById("updated");
const tempTag = document.getElementById("tempTag");
const humTag = document.getElementById("humTag");
const liveTempMinMax = document.getElementById("liveTempMinMax");
const liveHumMinMax = document.getElementById("liveHumMinMax");
const digitalClock = document.getElementById("digitalClock");
const quickTodayBtn = document.getElementById("quickTodayBtn");
const sourceBadge = document.getElementById("sourceBadge");

const dateInput = document.getElementById("date");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const searchBtn = document.getElementById("searchBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const summaryEl = document.getElementById("summary");
const summaryWrap = document.getElementById("summaryWrap");

const kpiAvgTemp = document.getElementById("kpiAvgTemp");
const kpiAvgHum = document.getElementById("kpiAvgHum");
const kpiCount = document.getElementById("kpiCount");
const kpiRangeTemp = document.getElementById("kpiRangeTemp");
const kpiRangeHum = document.getElementById("kpiRangeHum");

const configNotice = document.getElementById("configNotice");
const configModal = document.getElementById("configModal");
const openConfigBtn = document.getElementById("openConfigBtn");
const configToggleBtn = document.getElementById("configToggleBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const saveConfigBtn = document.getElementById("saveConfigBtn");
const clearConfigBtn = document.getElementById("clearConfigBtn");
const configInput = document.getElementById("configInput");
const sheetUrlInput = document.getElementById("sheetUrlInput");
const tabSheetBtn = document.getElementById("tabSheetBtn");
const tabFirebaseBtn = document.getElementById("tabFirebaseBtn");
const tabSheetPanel = document.getElementById("tabSheetPanel");
const tabFirebasePanel = document.getElementById("tabFirebasePanel");
const loadDemoBtn = document.getElementById("loadDemoBtn");

let db = null;
let readingsRef = null;
let latestTs = 0;
let isDemoMode = false;
let isSheetMode = false;
let currentSource = "none";
let currentRows = [];
let demoRows = [];
let liveChart = null;
let rangeChart = null;
let sheetPollTimer = null;

// กำหนดวันที่เริ่มต้นในช่องค้นหาเป็นวันปัจจุบัน (เวลาไทย)
if (dateInput) {
  dateInput.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

// นาฬิกาดิจิทัลเรียลไทม์ (เวลาไทย)
function updateClock() {
  if (!digitalClock) return;
  const now = new Date();
  digitalClock.textContent = now.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ==========================================================================
// ===== 2. ฟังก์ชันสร้างและอัปเดตกราฟ CHART.JS =====
// ==========================================================================
function getThemeColors() {
  const isDark = htmlRoot.getAttribute("data-theme") === "dark";
  return {
    isDark: isDark,
    gridColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
    tickColor: isDark ? "#94a3b8" : "#64748b",
    tooltipBg: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.96)",
    tooltipTitle: isDark ? "#f8fafc" : "#0f172a",
    tooltipBody: isDark ? "#cbd5e1" : "#334155",
    tooltipBorder: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)"
  };
}

function makeChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");

  // สร้าง Gradient Fill ใต้เส้นกราฟ
  const tempGrad = ctx.createLinearGradient(0, 0, 0, 320);
  tempGrad.addColorStop(0, "rgba(255, 94, 54, 0.35)");
  tempGrad.addColorStop(1, "rgba(255, 94, 54, 0.0)");

  const humGrad = ctx.createLinearGradient(0, 0, 0, 320);
  humGrad.addColorStop(0, "rgba(14, 165, 233, 0.35)");
  humGrad.addColorStop(1, "rgba(14, 165, 233, 0.0)");

  const theme = getThemeColors();

  return new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "อุณหภูมิ (°C)",
          data: [],
          borderColor: "#ff5e36",
          backgroundColor: tempGrad,
          yAxisID: "yT",
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#ff5e36",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          borderWidth: 2.5,
          fill: true
        },
        {
          label: "ความชื้น (%)",
          data: [],
          borderColor: "#0ea5e9",
          backgroundColor: humGrad,
          yAxisID: "yH",
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: "#0ea5e9",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          borderWidth: 2.5,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
            pointStyle: "circle",
            color: theme.tickColor,
            font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 12, weight: '600' }
          }
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          cornerRadius: 10,
          titleFont: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", weight: 'bold' },
          bodyFont: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif" }
        }
      },
      scales: {
        x: {
          grid: { color: theme.gridColor, drawTicks: false },
          ticks: { color: theme.tickColor, maxTicksLimit: 12, font: { size: 11 } }
        },
        yT: {
          position: "left",
          title: { display: true, text: "°C", color: "#ff5e36", font: { weight: 'bold', size: 12 } },
          grid: { color: theme.gridColor },
          ticks: { color: theme.tickColor, font: { size: 11 } },
          suggestedMin: 20,
          suggestedMax: 40
        },
        yH: {
          position: "right",
          title: { display: true, text: "%", color: "#0ea5e9", font: { weight: 'bold', size: 12 } },
          grid: { drawOnChartArea: false },
          ticks: { color: theme.tickColor, font: { size: 11 } },
          suggestedMin: 30,
          suggestedMax: 90
        }
      }
    }
  });
}

function updateChart(chart, rows) {
  if (!chart || !rows) return;
  chart.data.labels = rows.map((r) => `${r.date.slice(5)} ${r.time.slice(0, 5)}`);
  chart.data.datasets[0].data = rows.map((r) => r.temp);
  chart.data.datasets[1].data = rows.map((r) => r.hum);
  chart.update();
}

function updateChartsTheme() {
  const theme = getThemeColors();
  const charts = [liveChart, rangeChart];

  charts.forEach((chart) => {
    if (!chart || !chart.options || !chart.options.scales) return;

    if (chart.options.scales.x) {
      if (!chart.options.scales.x.grid) chart.options.scales.x.grid = {};
      chart.options.scales.x.grid.color = theme.gridColor;
      if (!chart.options.scales.x.ticks) chart.options.scales.x.ticks = {};
      chart.options.scales.x.ticks.color = theme.tickColor;
    }

    if (chart.options.scales.yT) {
      if (!chart.options.scales.yT.grid) chart.options.scales.yT.grid = {};
      chart.options.scales.yT.grid.color = theme.gridColor;
      if (!chart.options.scales.yT.ticks) chart.options.scales.yT.ticks = {};
      chart.options.scales.yT.ticks.color = theme.tickColor;
    }

    if (chart.options.scales.yH) {
      if (!chart.options.scales.yH.ticks) chart.options.scales.yH.ticks = {};
      chart.options.scales.yH.ticks.color = theme.tickColor;
    }

    if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
      chart.options.plugins.legend.labels.color = theme.tickColor;
    }

    if (chart.options.plugins && chart.options.plugins.tooltip) {
      chart.options.plugins.tooltip.backgroundColor = theme.tooltipBg;
      chart.options.plugins.tooltip.titleColor = theme.tooltipTitle;
      chart.options.plugins.tooltip.bodyColor = theme.tooltipBody;
      chart.options.plugins.tooltip.borderColor = theme.tooltipBorder;
    }

    chart.update('none');
  });
}

// สร้างกราฟทันที
liveChart = makeChart("liveChart");
rangeChart = makeChart("rangeChart");

// ==========================================================================
// ===== 3. การจัดการ THEME (ULTRA-SMOOTH DARK/LIGHT TOGGLE) =====
// ==========================================================================
function getPreferredTheme() {
  const saved = localStorage.getItem("esp32_dashboard_theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  htmlRoot.setAttribute("data-theme", theme);
  localStorage.setItem("esp32_dashboard_theme", theme);
  
  if (themeToggleBtn) {
    const icon = themeToggleBtn.querySelector(".theme-icon") || themeToggleBtn;
    if (theme === "dark") {
      icon.textContent = "🌙";
      themeToggleBtn.setAttribute("title", "โหมดกลางคืน (คลิกเพื่อสลับเป็นโหมดสว่าง)");
    } else {
      icon.textContent = "☀️";
      themeToggleBtn.setAttribute("title", "โหมดสว่าง (คลิกเพื่อสลับเป็นโหมดมืด)");
    }
  }

  updateChartsTheme();
}

function toggleThemeSmoothly() {
  const current = htmlRoot.getAttribute("data-theme") === "light" ? "light" : "dark";
  const nextTheme = current === "dark" ? "light" : "dark";

  if (document.startViewTransition) {
    document.startViewTransition(() => {
      applyTheme(nextTheme);
    });
  } else {
    applyTheme(nextTheme);
  }
}

const initialTheme = getPreferredTheme();
applyTheme(initialTheme);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleThemeSmoothly);
}

// ==========================================================================
// ===== 4. ระบบดึงข้อมูลจาก GOOGLE SHEETS =====
// ==========================================================================
function extractSpreadsheetId(url) {
  if (!url) return "";
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : url.trim();
}

async function fetchFromGoogleSheet(inputUrl, isBackground = false) {
  if (!inputUrl) return false;
  const isWebApp = inputUrl.includes("script.google.com");

  if (!isBackground && statusEl) {
    statusEl.textContent = "● กำลังเชื่อมต่อ...";
    statusEl.className = "status";
  }

  try {
    let rows = [];

    if (isWebApp) {
      // ดึงจาก Apps Script Web App (doGet)
      const res = await fetch(inputUrl, { redirect: "follow" });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        if (text.includes("<!DOCTYPE") || text.includes("<html") || text.includes("accounts.google.com")) {
          throw new Error("Apps Script ยังไม่ได้รับสิทธิ์สาธารณะ: กรุณาเข้าไปที่ Apps Script > กด Deploy > Manage deployments > Edit > เปลี่ยน 'Who has access' เป็น 'Anyone'");
        }
        throw new Error("Apps Script ไม่ได้ส่ง JSON กลับมา");
      }

      let rawRows = [];
      if (json && json.status === "success" && Array.isArray(json.rows)) {
        rawRows = json.rows;
      } else if (json && Array.isArray(json)) {
        rawRows = json;
      } else {
        throw new Error((json && json.message) || "รูปแบบข้อมูลจาก Apps Script ไม่ถูกต้อง");
      }

      // ปรับฟอร์แมตข้อมูลจาก Google Sheet ให้เป็นมาตรฐาน YYYY-MM-DD และ HH:mm:ss
      rows = rawRows.map((r) => {
        let ts = Number(r.ts) || 0;
        if (ts > 10000000000) ts = Math.floor(ts / 1000); // แปลง ms เป็น seconds ถ้าจำเป็น

        let dateStr = String(r.date || "").trim();
        let timeStr = String(r.time || "").trim();

        // แปลง Date string เช่น "Wed Nov 11 2026 00:00:00..." เป็น "2026-11-11"
        if (dateStr.includes("GMT") || isNaN(Date.parse(dateStr)) === false && dateStr.length > 10) {
          try {
            const dObj = new Date(dateStr);
            if (!isNaN(dObj.getTime())) {
              dateStr = dObj.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
            }
          } catch (e) {}
        }

        // แปลง Time string เช่น "Sat Dec 30 1899 10:00:00..." เป็น "10:00:00"
        if (timeStr.includes("GMT") || timeStr.length > 8) {
          const timeMatch = timeStr.match(/(\d{2}:\d{2}:\d{2})/);
          if (timeMatch) {
            timeStr = timeMatch[1];
          } else {
            try {
              const tObj = new Date(timeStr);
              if (!isNaN(tObj.getTime())) {
                timeStr = tObj.toTimeString().slice(0, 8);
              }
            } catch (e) {}
          }
        }

        return {
          ts: ts,
          date: dateStr,
          time: timeStr,
          temp: Number(r.temp) || 0,
          hum: Number(r.hum) || 0
        };
      });
    } else {
      // ดึงจาก Google Visualization API (Google Spreadsheet ID / Shared Link)
      const sheetId = extractSpreadsheetId(inputUrl);
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=data`;
      const res = await fetch(gvizUrl);
      if (!res.ok) {
        throw new Error("ไม่สามารถเข้าถึง Google Sheet ได้ (โปรดตรวจสอบว่าได้ตั้งค่าแชร์เป็น: ทุกคนที่มีลิงก์มีสิทธิ์ดู หรือยัง)");
      }
      const text = await res.text();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("ไม่พบโครงสร้างข้อมูลจาก Google Sheet");
      
      const jsonStr = text.slice(start, end + 1);
      const data = JSON.parse(jsonStr);

      if (data.table && data.table.rows) {
        data.table.rows.forEach((r) => {
          if (!r.c || r.c.length === 0) return;
          const tsVal = r.c[0] ? (r.c[0].v !== undefined ? r.c[0].v : r.c[0].f) : 0;
          const dateVal = r.c[1] ? (r.c[1].f || r.c[1].v) : "";
          const timeVal = r.c[2] ? (r.c[2].f || r.c[2].v) : "";
          const tempVal = r.c[3] ? (r.c[3].v !== undefined ? r.c[3].v : r.c[3].f) : 0;
          const humVal = r.c[4] ? (r.c[4].v !== undefined ? r.c[4].v : r.c[4].f) : 0;

          if (tsVal !== 0 || dateVal !== "") {
            rows.push({
              ts: Number(tsVal) || 0,
              date: String(dateVal || ""),
              time: String(timeVal || ""),
              temp: Number(tempVal) || 0,
              hum: Number(humVal) || 0
            });
          }
        });
      }
    }

    if (rows.length === 0) {
      if (statusEl) {
        statusEl.textContent = "● ออนไลน์";
        statusEl.className = "status online";
      }
      return true;
    }

    rows.sort((a, b) => a.ts - b.ts);
    currentRows = rows;
    isSheetMode = true;
    currentSource = "sheet";

    const last = rows[rows.length - 1];
    if (tempEl) tempEl.textContent = last.temp.toFixed(1);
    if (humEl) humEl.textContent = last.hum.toFixed(1);
    if (updatedEl) updatedEl.textContent = `${last.date} ${last.time}`;
    latestTs = last.ts;

    if (sourceBadge) {
      sourceBadge.textContent = "📊 แหล่งข้อมูล: Google Sheet";
      sourceBadge.style.color = "var(--primary-color)";
    }

    updateMetricPills(last.temp, last.hum);
    updateMinMaxSub(rows);
    checkStatus();

    // แสดงผลกราฟ 24 ชม.
    updateChart(liveChart, rows.slice(-288));

    // แสดงผลลงตารางและกราฟค้นหาทันที!
    updateChart(rangeChart, rows);
    renderTable(rows);
    renderSummary(rows);
    setupExportCsv(rows);

    if (configNotice) configNotice.style.display = "none";
    return true;
  } catch (err) {
    console.error("Google Sheet Fetch Error:", err);
    if (!isBackground) {
      if (statusEl) {
        statusEl.textContent = "● เกิดข้อผิดพลาดในการดึงข้อมูลจากชีต";
        statusEl.className = "status offline";
      }
      alert("ไม่สามารถดึงข้อมูลจาก Google Sheet ได้: " + err.message + 
            "\n\nคำแนะนำ: กรุณาเปิด Google Sheet กด 'แชร์' (Share) แล้วเปลี่ยนสิทธิ์ทั่วไปเป็น 'ทุกคนที่มีลิงก์มีสิทธิ์ดู' (Anyone with the link can view)");
    }
    return false;
  }
}

// ==========================================================================
// ===== 5. ตรวจสอบแหล่งข้อมูลเริ่มต้น =====
// ==========================================================================
function getSavedConfig() {
  const savedSheet = localStorage.getItem("esp32_sheet_url") || DEFAULT_GOOGLE_SHEET_URL;
  if (savedSheet && savedSheet.trim() !== "") {
    return { type: "sheet", url: savedSheet.trim() };
  }

  if (firebaseConfig && firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "") {
    return { type: "firebase", config: firebaseConfig };
  }

  const savedFb = localStorage.getItem("esp32_firebase_config");
  if (savedFb) {
    try {
      const parsed = JSON.parse(savedFb);
      if (parsed && (parsed.databaseURL || parsed.apiKey)) {
        return { type: "firebase", config: parsed };
      }
    } catch (e) {}
  }

  return null;
}

const activeSource = getSavedConfig();

if (activeSource) {
  if (activeSource.type === "sheet") {
    fetchFromGoogleSheet(activeSource.url);
    // Real-time Auto-Sync: ดึงข้อมูลใหม่จาก Google Sheet อัตโนมัติทุก 5 วินาที
    if (sheetPollTimer) clearInterval(sheetPollTimer);
    sheetPollTimer = setInterval(() => {
      if (isSheetMode) fetchFromGoogleSheet(activeSource.url, true);
    }, 5000);
  } else if (activeSource.type === "firebase") {
    initFirebaseApp(activeSource.config);
  }
} else {
  if (configNotice) configNotice.style.display = "flex";
  if (statusEl) {
    statusEl.textContent = "● รอเลือกแหล่งข้อมูล";
    statusEl.className = "status";
  }
}

function initFirebaseApp(config) {
  try {
    const app = initializeApp(config);
    db = getDatabase(app);
    readingsRef = ref(db, "readings");
    currentSource = "firebase";

    if (configNotice) configNotice.style.display = "none";

    if (sourceBadge) {
      sourceBadge.textContent = "🔥 แหล่งข้อมูล: Firebase RTDB";
    }

    if (statusEl) {
      statusEl.textContent = "● กำลังเชื่อมต่อ Firebase...";
      statusEl.className = "status";
    }

    const liveQuery = query(readingsRef, orderByChild("ts"), limitToLast(288));

    onValue(liveQuery, (snap) => {
      const rows = toRows(snap);
      if (rows.length === 0) return;

      currentRows = rows;
      const last = rows[rows.length - 1];
      if (tempEl) tempEl.textContent = last.temp.toFixed(1);
      if (humEl) humEl.textContent = last.hum.toFixed(1);
      if (updatedEl) updatedEl.textContent = `${last.date} ${last.time}`;
      latestTs = last.ts;

      updateMetricPills(last.temp, last.hum);
      updateMinMaxSub(rows);
      checkStatus();
      updateChart(liveChart, rows);

      // โหลดข้อมูลใส่ตารางทันทีหากยังว่างอยู่
      const tbody = document.querySelector("#dataTable tbody");
      if (tbody && tbody.querySelector(".empty-state")) {
        renderTable(rows);
        updateChart(rangeChart, rows);
        renderSummary(rows);
        setupExportCsv(rows);
      }
    }, (error) => {
      console.error("Firebase connection error:", error);
      if (statusEl) {
        statusEl.textContent = "● ข้อผิดพลาด Firebase (Rules/Config)";
        statusEl.className = "status offline";
      }
    });

  } catch (err) {
    console.error("Firebase init failed:", err);
    alert("ไม่สามารถเชื่อมต่อ Firebase ได้: " + err.message);
  }
}

// อัปเดตคำแนะนำสภาวะอากาศบนการ์ด
function updateMetricPills(temp, hum) {
  if (tempTag) {
    if (temp < 25) {
      tempTag.textContent = "❄️ อากาศเย็นสบาย";
      tempTag.style.color = "var(--primary-color)";
    } else if (temp <= 32) {
      tempTag.textContent = "🌤️ อุณหภูมิปกติ";
      tempTag.style.color = "var(--success-color)";
    } else {
      tempTag.textContent = "🔥 อากาศร้อน";
      tempTag.style.color = "var(--temp-primary)";
    }
  }

  if (humTag) {
    if (hum < 40) {
      humTag.textContent = "🏜️ อากาศแห้ง";
      humTag.style.color = "#f59e0b";
    } else if (hum <= 70) {
      humTag.textContent = "✨ ความชื้นเหมาะสม";
      humTag.style.color = "var(--success-color)";
    } else {
      humTag.textContent = "🌧️ ความชื้นสูง";
      humTag.style.color = "var(--hum-primary)";
    }
  }
}

// คำนวณช่วงต่ำสุด-สูงสุดรอบ 24 ชม. สำหรับการ์ดหลัก
function updateMinMaxSub(rows) {
  if (!rows || rows.length === 0) return;
  const temps = rows.map(r => r.temp);
  const hums = rows.map(r => r.hum);

  if (liveTempMinMax) {
    liveTempMinMax.textContent = `24ชม: ${Math.min(...temps).toFixed(1)}° - ${Math.max(...temps).toFixed(1)}°C`;
  }
  if (liveHumMinMax) {
    liveHumMinMax.textContent = `24ชม: ${Math.min(...hums).toFixed(1)}% - ${Math.max(...hums).toFixed(1)}%`;
  }
}

// ตรวจสอบสถานะการเชื่อมต่อ (ถ้าไม่มีข้อมูลเกิน 10 นาที ถือว่าออฟไลน์)
function checkStatus() {
  if (!statusEl || latestTs === 0) return;
  const ageMin = (Date.now() / 1000 - latestTs) / 60;
  if (ageMin <= 10) {
    statusEl.textContent = "● ออนไลน์";
    statusEl.className = "status online";
  } else {
    statusEl.textContent = "● ออฟไลน์ (ไม่มีข้อมูลใหม่เกิน 10 นาที)";
    statusEl.className = "status offline";
  }
}

setInterval(checkStatus, 30000);

// ==========================================================================
// ===== 6. การค้นหาข้อมูลตามช่วงเวลา =====
// ==========================================================================
if (quickTodayBtn) {
  quickTodayBtn.addEventListener("click", () => {
    if (dateInput) dateInput.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    if (startInput) startInput.value = "00:00";
    if (endInput) endInput.value = "23:59";
    if (searchBtn) searchBtn.click();
  });
}

if (searchBtn) {
  searchBtn.addEventListener("click", async () => {
    const d = dateInput ? dateInput.value : "";
    const s = startInput ? startInput.value : "";
    const e = endInput ? endInput.value : "";

    if (!d || !s || !e) {
      alert("กรุณาเลือกวันที่และเวลาให้ครบถ้วน");
      return;
    }

    const startTs = Date.parse(`${d}T${s}:00+07:00`) / 1000;
    const endTs = Date.parse(`${d}T${e}:59+07:00`) / 1000;

    if (isNaN(startTs) || isNaN(endTs)) {
      alert("รูปแบบวันที่หรือเวลาไม่ถูกต้อง");
      return;
    }

    if (endTs < startTs) {
      alert("เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น");
      return;
    }

    // กรณีทำงานในโหมดจำลองข้อมูล (Demo) หรือ Google Sheet
    if (isDemoMode || isSheetMode) {
      const sourceList = isDemoMode ? demoRows : currentRows;
      const filtered = sourceList.filter(r => r.ts >= startTs && r.ts <= endTs);
      updateChart(rangeChart, filtered);
      renderTable(filtered);
      renderSummary(filtered, s, e);
      setupExportCsv(filtered);
      return;
    }

    if (!readingsRef) {
      alert("กรุณาเชื่อมต่อ Google Sheet หรือ Firebase ก่อน หรือกด 'โหลดข้อมูลจำลอง (Demo)'");
      return;
    }

    try {
      const q = query(
        readingsRef, 
        orderByChild("ts"), 
        startAt(startTs), 
        endAt(endTs)
      );
      const snap = await get(q);
      const rows = toRows(snap);
      updateChart(rangeChart, rows);
      renderTable(rows);
      renderSummary(rows, s, e);
      setupExportCsv(rows);
    } catch (err) {
      console.error("Search query failed:", err);
      alert("ค้นหาไม่สำเร็จ: " + err.message + "\n(กรุณาตรวจว่าได้ตั้ง .indexOn: ['ts'] ใน Firebase Rules แล้วหรือยัง)");
    }
  });
}

function toRows(snap) {
  const rows = [];
  if (!snap) return rows;
  snap.forEach((child) => {
    const val = child.val();
    if (val && typeof val === "object") {
      rows.push({
        ts: Number(val.ts) || 0,
        date: String(val.date || ""),
        time: String(val.time || ""),
        temp: Number(val.temp) || 0,
        hum: Number(val.hum) || 0
      });
    }
  });
  return rows.sort((a, b) => a.ts - b.ts);
}

function renderTable(rows) {
  const tbody = document.querySelector("#dataTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-content">
            <span class="empty-icon">🔍</span>
            <p>ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  rows.forEach((r, i) => {
    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td>${i + 1}</td>
        <td>${r.date}</td>
        <td>${r.time}</td>
        <td><strong class="temp-text">${r.temp.toFixed(1)}</strong></td>
        <td><strong class="hum-text">${r.hum.toFixed(1)}</strong></td>
      </tr>`
    );
  });
}

function renderSummary(rows, startTime = "", endTime = "") {
  if (!summaryEl) return;

  if (rows.length === 0) {
    summaryEl.textContent = "";
    if (summaryWrap) summaryWrap.style.display = "none";
    return;
  }

  const t = rows.map((r) => r.temp);
  const h = rows.map((r) => r.hum);
  const avg = (arr) => (arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1);

  const minT = Math.min(...t);
  const maxT = Math.max(...t);
  const avgT = avg(t);

  const minH = Math.min(...h);
  const maxH = Math.max(...h);
  const avgH = avg(h);

  if (kpiAvgTemp) kpiAvgTemp.textContent = `${avgT} °C`;
  if (kpiRangeTemp) kpiRangeTemp.textContent = `ต่ำสุด ${minT}° | สูงสุด ${maxT}°C`;
  
  if (kpiAvgHum) kpiAvgHum.textContent = `${avgH} %`;
  if (kpiRangeHum) kpiRangeHum.textContent = `ต่ำสุด ${minH}% | สูงสุด ${maxH}%`;

  if (kpiCount) kpiCount.textContent = `${rows.length} รายการ`;

  if (summaryWrap) summaryWrap.style.display = "flex";
  summaryEl.textContent = `พบ ${rows.length} รายการ | อุณหภูมิ ต่ำสุด ${minT} สูงสุด ${maxT} เฉลี่ย ${avgT} °C | ` +
    `ความชื้น ต่ำสุด ${minH} สูงสุด ${maxH} เฉลี่ย ${avgH} %`;
}

function setupExportCsv(rows) {
  if (!exportCsvBtn) return;
  if (!rows || rows.length === 0) {
    exportCsvBtn.style.display = "none";
    return;
  }
  exportCsvBtn.style.display = "inline-flex";
  exportCsvBtn.onclick = () => {
    let csv = "\uFEFFลำดับ,วันที่,เวลา,อุณหภูมิ (°C),ความชื้น (%)\n";
    rows.forEach((r, i) => {
      csv += `${i + 1},"${r.date}","${r.time}",${r.temp.toFixed(1)},${r.hum.toFixed(1)}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `esp32-data-${rows[0].date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
}

// ==========================================================================
// ===== 7. โหมดจำลองข้อมูล (DEMO DATA SIMULATION) =====
// ==========================================================================
function generateDemoData() {
  const rows = [];
  const now = new Date();
  for (let i = 288; i >= 0; i--) {
    const timePoint = new Date(now.getTime() - i * 5 * 60 * 1000);
    const year = timePoint.getFullYear();
    const month = String(timePoint.getMonth() + 1).padStart(2, "0");
    const day = String(timePoint.getDate()).padStart(2, "0");
    const hours = String(timePoint.getHours()).padStart(2, "0");
    const mins = String(timePoint.getMinutes()).padStart(2, "0");
    const secs = "00";

    const hourOfDay = timePoint.getHours();
    const baseTemp = 28.5 + 4.5 * Math.sin((hourOfDay - 6) / 24 * 2 * Math.PI);
    const temp = +(baseTemp + (Math.random() * 1.0 - 0.5)).toFixed(1);
    const hum = +(72 - (temp - 26) * 3 + (Math.random() * 2.5 - 1.2)).toFixed(1);

    rows.push({
      ts: Math.floor(timePoint.getTime() / 1000),
      date: `${year}-${month}-${day}`,
      time: `${hours}:${mins}:${secs}`,
      temp: temp,
      hum: hum
    });
  }
  return rows;
}

if (loadDemoBtn) {
  loadDemoBtn.addEventListener("click", () => {
    isDemoMode = true;
    demoRows = generateDemoData();
    currentRows = demoRows;
    const last = demoRows[demoRows.length - 1];
    
    if (tempEl) tempEl.textContent = last.temp.toFixed(1);
    if (humEl) humEl.textContent = last.hum.toFixed(1);
    if (updatedEl) updatedEl.textContent = `${last.date} ${last.time} (Demo Live)`;
    latestTs = last.ts;
    
    if (sourceBadge) {
      sourceBadge.textContent = "✨ แหล่งข้อมูล: จำลอง (Demo)";
    }

    updateMetricPills(last.temp, last.hum);
    updateMinMaxSub(demoRows);
    checkStatus();
    updateChart(liveChart, demoRows);

    // แสดงผลลงตารางและกราฟทันที
    updateChart(rangeChart, demoRows);
    renderTable(demoRows);
    renderSummary(demoRows);
    setupExportCsv(demoRows);

    if (configNotice) configNotice.style.display = "none";

    setInterval(() => {
      if (!isDemoMode) return;
      const tNow = new Date();
      const lastItem = demoRows[demoRows.length - 1];
      const newTemp = +(lastItem.temp + (Math.random() * 0.4 - 0.2)).toFixed(1);
      const newHum = +(lastItem.hum + (Math.random() * 0.8 - 0.4)).toFixed(1);
      const newItem = {
        ts: Math.floor(tNow.getTime() / 1000),
        date: tNow.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }),
        time: tNow.toTimeString().slice(0, 8),
        temp: newTemp,
        hum: newHum
      };
      demoRows.push(newItem);
      if (demoRows.length > 288) demoRows.shift();
      
      if (tempEl) tempEl.textContent = newItem.temp.toFixed(1);
      if (humEl) humEl.textContent = newItem.hum.toFixed(1);
      if (updatedEl) updatedEl.textContent = `${newItem.date} ${newItem.time} (Demo Live)`;
      latestTs = newItem.ts;
      
      updateMetricPills(newItem.temp, newItem.hum);
      updateMinMaxSub(demoRows);
      checkStatus();
      updateChart(liveChart, demoRows);
    }, 4000);
  });
}

// ==========================================================================
// ===== 8. MODAL การตั้งค่าแหล่งข้อมูล (SHEETS & FIREBASE) =====
// ==========================================================================
let activeTab = "sheet";

function openModal() {
  if (configModal) {
    configModal.style.display = "flex";
    if (sheetUrlInput) {
      sheetUrlInput.value = localStorage.getItem("esp32_sheet_url") || DEFAULT_GOOGLE_SHEET_URL;
    }
    const currentFb = localStorage.getItem("esp32_firebase_config");
    if (configInput) {
      configInput.value = currentFb ? JSON.stringify(JSON.parse(currentFb), null, 2) : "";
    }
  }
}

function closeModal() {
  if (configModal) configModal.style.display = "none";
}

if (openConfigBtn) openConfigBtn.addEventListener("click", openModal);
if (configToggleBtn) configToggleBtn.addEventListener("click", openModal);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

if (configModal) {
  configModal.addEventListener("click", (e) => {
    if (e.target === configModal) closeModal();
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// สลับแท็บใน Modal
if (tabSheetBtn && tabFirebaseBtn && tabSheetPanel && tabFirebasePanel) {
  tabSheetBtn.addEventListener("click", () => {
    activeTab = "sheet";
    tabSheetBtn.classList.add("active");
    tabFirebaseBtn.classList.remove("active");
    tabSheetPanel.classList.add("active");
    tabFirebasePanel.classList.remove("active");
  });

  tabFirebaseBtn.addEventListener("click", () => {
    activeTab = "firebase";
    tabFirebaseBtn.classList.add("active");
    tabSheetBtn.classList.remove("active");
    tabFirebasePanel.classList.add("active");
    tabSheetPanel.classList.remove("active");
  });
}

if (saveConfigBtn) {
  saveConfigBtn.addEventListener("click", async () => {
    if (activeTab === "sheet") {
      const sheetUrl = sheetUrlInput ? sheetUrlInput.value.trim() : "";
      if (!sheetUrl) {
        alert("กรุณาวางลิงก์ Google Sheet หรือ Web App URL");
        return;
      }
      localStorage.setItem("esp32_sheet_url", sheetUrl);
      closeModal();
      await fetchFromGoogleSheet(sheetUrl);
      if (sheetPollTimer) clearInterval(sheetPollTimer);
      sheetPollTimer = setInterval(() => {
        if (isSheetMode) fetchFromGoogleSheet(sheetUrl, true);
      }, 5000);
    } else {
      let raw = configInput ? configInput.value.trim() : "";
      if (!raw) {
        alert("กรุณากรอกหรือวาง Firebase Config");
        return;
      }
      if (raw.includes("{") && raw.includes("}")) {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        raw = raw.slice(start, end + 1);
      }
      let configObj = null;
      try {
        configObj = JSON.parse(raw);
      } catch {
        try {
          const fn = new Function(`return (${raw});`);
          configObj = fn();
        } catch (err) {
          alert("รูปแบบไม่ถูกต้อง: กรุณาวาง JSON หรือ Object ที่ถูกต้อง");
          return;
        }
      }

      if (configObj) {
        localStorage.setItem("esp32_firebase_config", JSON.stringify(configObj));
        closeModal();
        location.reload();
      }
    }
  });
}

if (clearConfigBtn) {
  clearConfigBtn.addEventListener("click", () => {
    if (confirm("ต้องการล้างค่าการตั้งค่าแหล่งข้อมูลที่บันทึกไว้หรือไม่?")) {
      localStorage.removeItem("esp32_sheet_url");
      localStorage.removeItem("esp32_firebase_config");
      location.reload();
    }
  });
}
