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

// ===== โหมดผู้ดูแล =====
// หน้าเว็บปกติ: ซ่อนปุ่มตั้งค่า/Demo และใช้แหล่งข้อมูลที่กำหนดในโค้ดเสมอ (ทุกคนเห็นเหมือนกัน)
// ผู้ดูแลเปิดหน้าตั้งค่าได้ที่ลิงก์:  https://<เว็บ>/?admin
// หมายเหตุ: นี่คือการซ่อนจากผู้ใช้ทั่วไป ไม่ใช่ระบบความปลอดภัย และค่าที่ตั้งจะมีผลเฉพาะเบราว์เซอร์ของคนที่ตั้งเท่านั้น
const ADMIN_MODE = new URLSearchParams(location.search).has("admin");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const statusEl = document.getElementById("status");
const tempEl = document.getElementById("temp");
const humEl = document.getElementById("hum");
const heatIndexEl = document.getElementById("heatIndex");
const heatTouchVal = document.getElementById("heatTouchVal");
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

// ตรวจสอบและแสดงป้ายแจ้งเตือนการเลือกเวลาข้ามวัน/ข้ามคืน (เช่น 20:00 ไป 00:00 หรือ 22:00 ไป 02:00)
function updateOvernightIndicator() {
  const tag = document.getElementById("overnightTag");
  if (!tag || !startInput || !endInput) return;
  const s = startInput.value || "";
  const e = endInput.value || "";
  const d = dateInput ? dateInput.value : "";
  if (s && e && e <= s) {
    if (d) {
      const nextDate = new Date(new Date(`${d}T12:00:00+07:00`).getTime() + 86400000);
      const thShort = nextDate.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      tag.textContent = `🌙 ข้ามวัน (+1 วัน: ${thShort})`;
    } else {
      tag.textContent = `🌙 ข้ามวัน (+1 วัน)`;
    }
    tag.style.display = "inline-flex";
  } else {
    tag.style.display = "none";
  }
}

// ===== ตัวเลือกเวลาแบบเลื่อน (ชั่วโมง : นาที) ใช้ได้เหมือนกันทั้งคอม มือถือ iPad =====
// ค่าจริงเก็บใน <input type="hidden" id="start"/"end"> รูปแบบ HH:MM หรือว่าง "" (แสดง --)
function buildTimeSelect(hidden) {
  if (!hidden) return;
  const box = document.querySelector(`.time-select[data-for="${hidden.id}"]`);
  if (!box) return;
  const hSel = box.querySelector(".ts-h"), mSel = box.querySelector(".ts-m");
  const pad = (n) => String(n).padStart(2, "0");

  hSel.innerHTML = "";
  mSel.innerHTML = "";
  hSel.add(new Option("--", ""));
  for (let i = 0; i < 24; i++) hSel.add(new Option(pad(i), pad(i)));

  mSel.add(new Option("--", ""));
  for (let i = 0; i < 60; i++) mSel.add(new Option(pad(i), pad(i)));

  const toSelect = () => {
    if (!hidden.value) {
      hSel.value = "";
      mSel.value = "";
      return;
    }
    const [h, m] = hidden.value.split(":");
    hSel.value = (h !== undefined && h !== "") ? pad(Number(h) || 0) : "";
    mSel.value = (m !== undefined && m !== "") ? pad(Number(m) || 0) : "";
  };

  const toHidden = () => {
    if (hSel.value === "" && mSel.value === "") {
      hidden.value = "";
    } else {
      const h = hSel.value !== "" ? hSel.value : "00";
      const m = mSel.value !== "" ? mSel.value : "00";
      hidden.value = `${h}:${m}`;
    }
    updateOvernightIndicator();
  };

  hSel.addEventListener("change", toHidden);
  mSel.addEventListener("change", toHidden);
  hidden.syncTimeSelect = toSelect;
  toSelect();
}
function syncTimeSelects() {
  [startInput, endInput].forEach((el) => el && el.syncTimeSelect && el.syncTimeSelect());
  updateOvernightIndicator();
}
buildTimeSelect(startInput);
buildTimeSelect(endInput);
if (dateInput) {
  dateInput.addEventListener("change", () => {
    if (startInput && !startInput.value) startInput.value = "00:00";
    if (endInput && !endInput.value) endInput.value = "23:59";
    syncTimeSelects();
    updateOvernightIndicator();
    if (dateInput.value) {
      runSearch(true);
    }
  });
}
updateOvernightIndicator();
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
// ค่าสดจาก Firebase /live (ดูส่วนที่ 9 ท้ายไฟล์)
const LIVE_URL =
  "https://temp-humid-esp32-db4b9-default-rtdb.asia-southeast1.firebasedatabase.app/live.json";
const LIVE_FRESH_SEC = 10; // ไม่มีค่าใหม่เกิน 10 วิ = ถือว่าบอร์ดหยุดส่ง
let liveTs = 0;
let liveArrivedAt = 0; // เวลาที่ "ได้รับค่าใหม่" บนเครื่องผู้ชม (ไม่พึ่งนาฬิกาเครื่องผู้ชมตรงกับบอร์ด)
let isDemoMode = false;
let isSheetMode = false;
let currentSource = "none";
let currentRows = [];
// การค้นหาที่ผู้ใช้เลือกอยู่ (ถ้ามี) — ระหว่างดูผลค้นหา ระบบรีเฟรชจะไม่เด้งกลับไปหน้ากราฟรวม
let activeSearch = null;
let demoRows = [];
let liveChart = null;
let rangeChart = null;
let sheetPollTimer = null;

// กำหนดวันที่เริ่มต้นในช่องค้นหาเป็นวันปัจจุบัน (เวลาไทย) และเปิดให้เลือกดูได้อิสระทุกวันทุกเดือนทุกปี
if (dateInput) {
  dateInput.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  dateInput.removeAttribute("min");
  dateInput.removeAttribute("max");
}
if (startInput && !startInput.value) startInput.value = "00:00";
if (endInput && !endInput.value) endInput.value = "23:59";
syncTimeSelects();

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

// ===== ตัวช่วยแสดงวันที่/เวลาภาษาไทย (เวลาไทย) =====
const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thParts(ms) {
  const d = new Date(ms + 7 * 3600 * 1000); // แปลงเป็นเวลาไทยแล้วอ่านค่าแบบ UTC
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(),
           hh: String(d.getUTCHours()).padStart(2, "0"), mm: String(d.getUTCMinutes()).padStart(2, "0"),
           ss: String(d.getUTCSeconds()).padStart(2, "0") };
}
function fmtThDate(ms) { const p = thParts(ms); return `${p.day} ${TH_MONTHS[p.m]} ${p.y}`; }
function fmtThTime(ms, withSec) { const p = thParts(ms); return withSec ? `${p.hh}:${p.mm}:${p.ss}` : `${p.hh}:${p.mm}`; }

// แสดงข้อความกลางกราฟเมื่อไม่มีข้อมูล
const noDataPlugin = {
  id: "noData",
  afterDraw(chart) {
    const hasData = chart.data.datasets.some((ds) => ds.data.some((pt) => pt && pt.y !== null));
    if (hasData) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const areaW = chartArea.right - chartArea.left;
    const maxW = areaW - 24;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    const narrow = areaW < 420;
    const msg = chart.$emptyMessage || "ไม่มีข้อมูลในช่วงเวลานี้";

    ctx.save();
    // ขึ้นบรรทัดใหม่ที่ " — " และตัดคำเมื่อยาวเกินกรอบกราฟ (ไม่ล้นขอบทั้งมือถือ/iPad)
    const lines = [];
    msg.split(" — ").forEach((part, i) => {
      // ย่อขนาดตัวอักษรให้พอดีบรรทัดเดียว → ถ้ายังไม่พอ ตัดปี ค.ศ. ออก → สุดท้ายค่อยขึ้นบรรทัดใหม่
      const weight = i === 0 ? 700 : 500;
      let size = i === 0 ? (narrow ? 15 : 16) : (narrow ? 13 : 13.5);
      const minSize = i === 0 ? 12 : 10.5;
      const fit = (txt) => {
        for (let sz = size; sz >= minSize; sz -= 0.5) {
          ctx.font = `${weight} ${sz}px 'Prompt', sans-serif`;
          if (ctx.measureText(txt).width <= maxW) return true;
        }
        return false;
      };
      let txt = part;
      if (!fit(txt)) {
        const short = txt.replace(/ \d{4}(?= )/g, "");
        if (short !== txt) txt = short;
        if (!fit(txt)) {
          let line = "";
          txt.split(" ").forEach((word) => {
            const test = line ? line + " " + word : word;
            if (ctx.measureText(test).width > maxW && line) { lines.push({ text: line, font: ctx.font }); line = word; }
            else line = test;
          });
          if (line) lines.push({ text: line, font: ctx.font });
          return;
        }
      }
      lines.push({ text: txt, font: ctx.font });
    });
    const lh = narrow ? 20 : 24;
    const boxW = Math.min(maxW + 16, Math.max(...lines.map((l) => { ctx.font = l.font; return ctx.measureText(l.text).width; })) + 32);
    const boxH = lines.length * lh + 20;
    const theme = getThemeColors();
    // กล่องพื้นหลังกลางกราฟ
    ctx.fillStyle = theme.tooltipBg || "rgba(15,23,42,.85)";
    ctx.globalAlpha = 0.9;
    const bx = cx - boxW / 2, by = cy - boxH / 2, r = 10;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r); ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
    ctx.arcTo(bx, by + boxH, bx, by, r); ctx.arcTo(bx, by, bx + boxW, by, r); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.tooltipBorder || "rgba(148,163,184,.4)"; ctx.lineWidth = 1; ctx.stroke();
    // วาดชิดซ้ายแล้วคำนวณจุดเริ่มเอง (Safari บางรุ่นจัดกลางด้วย textAlign ผิดตำแหน่ง)
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.direction = "ltr";
    lines.forEach((l, i) => {
      ctx.font = l.font;
      ctx.fillStyle = i === 0 ? (theme.tooltipTitle || theme.tickColor) : (theme.tooltipBody || theme.tickColor);
      const w = ctx.measureText(l.text).width;
      ctx.fillText(l.text, cx - w / 2, by + 10 + lh / 2 + i * lh);
    });
    ctx.restore();
  }
};

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
    plugins: [noDataPlugin],
    data: {
      labels: [],
      datasets: [
        {
          label: "🌡️ อุณหภูมิ (°C)",
          data: [],
          borderColor: "#ff5e36",
          backgroundColor: tempGrad,
          yAxisID: "yT",
          tension: 0.3,
          cubicInterpolationMode: "monotone", // เส้นโค้งไม่พุ่งเกินค่าจริง
          spanGaps: false,                     // ช่วงที่ไม่มีข้อมูลจะเว้นว่าง ไม่ลากเส้นหลอก
          borderDash: [],                      // เส้นทึบสำหรับอุณหภูมิ
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: "#ff5e36",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2.5,
          borderWidth: 3,
          fill: true
        },
        {
          label: "💧 ความชื้น (%)",
          data: [],
          borderColor: "#0ea5e9",
          backgroundColor: humGrad,
          yAxisID: "yH",
          tension: 0.3,
          cubicInterpolationMode: "monotone", // เส้นโค้งไม่พุ่งเกินค่าจริง
          spanGaps: false,                     // ช่วงที่ไม่มีข้อมูลจะเว้นว่าง ไม่ลากเส้นหลอก
          borderDash: [],                      // เส้นทึบเรียบเนียนเหมือนอุณหภูมิ
          pointRadius: 0,
          pointHitRadius: 10,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: "#0ea5e9",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2.5,
          borderWidth: 3,
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
        title: {
          display: false,
          text: "",
          align: "start",
          color: theme.tickColor,
          font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 13, weight: '600' },
          padding: { bottom: 4 }
        },
        legend: {
          position: "top",
          align: "end",
          onHover: (event, legendItem, legend) => {
            const ci = legend.chart;
            ci.data.datasets.forEach((d, idx) => {
              if (idx === legendItem.datasetIndex) {
                d.borderWidth = 3.8;
                d.borderColor = idx === 0 ? "#ff5e36" : "#0ea5e9";
              } else {
                d.borderWidth = 1.2;
                d.borderColor = idx === 0 ? "rgba(255, 94, 54, 0.22)" : "rgba(14, 165, 233, 0.22)";
              }
            });
            ci.update('none');
          },
          onLeave: (event, legendItem, legend) => {
            const ci = legend.chart;
            ci.data.datasets[0].borderWidth = 3;
            ci.data.datasets[0].borderColor = "#ff5e36";
            ci.data.datasets[1].borderWidth = 3;
            ci.data.datasets[1].borderColor = "#0ea5e9";
            ci.update('none');
          },
          labels: {
            boxWidth: 14,
            boxHeight: 12,
            usePointStyle: true,
            pointStyle: "rectRounded",
            color: theme.tickColor,
            font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 12.5, weight: '700' }
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
          bodyFont: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif" },
          filter: (item) => item.raw && item.raw.y !== null,
          callbacks: {
            // หัว tooltip: วันที่ + เวลา (เช่น 12 พ.ย. 2026 · 00:24:10 น.)
            title: (items) => items.length ? `📅 ${fmtThDate(items[0].parsed.x)} · ⏰ ${fmtThTime(items[0].parsed.x, true)} น.` : "",
            label: (item) => item.datasetIndex === 0
              ? ` 🌡️ อุณหภูมิ: ${item.parsed.y.toFixed(1)} °C`
              : ` 💧 ความชื้น: ${item.parsed.y.toFixed(1)} %`
          }
        }
      },
      scales: {
        x: {
          type: "linear", // แกนเวลาจริง: ระยะห่างตามเวลา ช่วงที่ขาดข้อมูลจะเห็นชัด
          afterBuildTicks: (axis) => {
            // สร้างขีดเองให้ตรงเวลาไทยพอดี (เช่น 00:00, 00:15, 00:30)
            const step = axis.options.ticks.stepSize;
            if (!step || axis.min === undefined) return;
            const off = 7 * 3600 * 1000;
            const first = Math.ceil((axis.min + off) / step) * step - off;
            const ticks = [];
            for (let v = first; v <= axis.max + 1; v += step) ticks.push({ value: v });
            axis.ticks = ticks;
          },
          title: { display: true, text: "เวลา (น.)", color: theme.tickColor, font: { weight: 'bold', size: 12 } },
          grid: { color: theme.gridColor, drawTicks: false },
          ticks: {
            color: theme.tickColor, maxTicksLimit: 10, maxRotation: 0, font: { size: 11 },
            callback: function (value) {
              const spanMs = this.max - this.min;
              const t = fmtThTime(value, spanMs < 10 * 60 * 1000);
              return spanMs > 20 * 3600 * 1000 ? [t, fmtThDate(value)] : t; // ข้ามวัน -> แสดงวันที่ใต้เวลา
            }
          }
        },
        yT: {
          position: "left",
          title: { display: true, text: "🌡️ อุณหภูมิ (°C)", color: "#ff5e36", font: { weight: 'bold', size: 12 } },
          grid: { color: theme.gridColor },
          border: { color: "#ff5e36", width: 2 },
          ticks: { color: "#ff5e36", font: { size: 11.5, weight: '700' } },
          suggestedMin: 20,
          suggestedMax: 40
        },
        yH: {
          position: "right",
          title: { display: true, text: "💧 ความชื้น (%)", color: "#0ea5e9", font: { weight: 'bold', size: 12 } },
          grid: { drawOnChartArea: false },
          border: { color: "#0ea5e9", width: 2 },
          ticks: { color: "#0ea5e9", font: { size: 11.5, weight: '700' } },
          suggestedMin: 30,
          suggestedMax: 90
        }
      }
    }
  });
}

// rows: [{ts (วินาที), date, time, temp, hum}]  opts: { title, emptyMessage }
function updateChart(chart, rows, opts = {}) {
  if (!chart || !rows) return;
  const valid = rows.filter((r) => r.ts > 0).sort((a, b) => a.ts - b.ts);

  // ใส่ช่องว่างเมื่อข้อมูลขาดหายเกิน 15 นาที (บอร์ดออฟไลน์) เส้นจะไม่ถูกลากข้าม
  const GAP_SEC = 15 * 60;
  const tPts = [], hPts = [];
  valid.forEach((r, i) => {
    if (i > 0 && r.ts - valid[i - 1].ts > GAP_SEC) {
      const mid = ((r.ts + valid[i - 1].ts) / 2) * 1000;
      tPts.push({ x: mid, y: null });
      hPts.push({ x: mid, y: null });
    }
    tPts.push({ x: r.ts * 1000, y: r.temp });
    hPts.push({ x: r.ts * 1000, y: r.hum });
  });
  chart.data.labels = [];
  chart.data.datasets[0].data = tPts;
  chart.data.datasets[1].data = hPts;

  // จุดข้อมูล: ซ่อนจุดโดยค่าเริ่มต้น (pointRadius = 0) แสดงเฉพาะเมื่อเลื่อนเมาส์ชี้/แตะสัมผัส (Hover)
  chart.data.datasets.forEach((ds) => {
    ds.pointRadius = 0;
    ds.pointHitRadius = 14;
    ds.pointHoverRadius = 6;
    ds.pointHoverBorderWidth = 2;
    ds.pointHoverBorderColor = "#ffffff";
    ds.pointHoverBackgroundColor = ds.borderColor;
  });

  // ปรับช่วงแกนตามข้อมูลจริง (ไม่บีบเส้นให้แบนจนอ่านไม่ออก)
  const sc = chart.options.scales;
  if (valid.length) {
    const t = valid.map((v) => v.temp), h = valid.map((v) => v.hum);
    const padT = Math.max(1, (Math.max(...t) - Math.min(...t)) * 0.15);
    const padH = Math.max(3, (Math.max(...h) - Math.min(...h)) * 0.15);
    // ปัดขอบแกนให้เป็นเลขกลมๆ: อุณหภูมิทีละ 2 °C, ความชื้นทีละ 5 %
    sc.yT.min = Math.floor((Math.min(...t) - padT) / 2) * 2; sc.yT.max = Math.ceil((Math.max(...t) + padT) / 2) * 2;
    sc.yH.min = Math.max(0, Math.floor((Math.min(...h) - padH) / 5) * 5); sc.yH.max = Math.min(100, Math.ceil((Math.max(...h) + padH) / 5) * 5);
    sc.yT.ticks.stepSize = 2; sc.yH.ticks.stepSize = 5;
    let xMin = opts.xMin !== undefined ? opts.xMin : valid[0].ts * 1000;
    let xMax = opts.xMax !== undefined ? opts.xMax : valid[valid.length - 1].ts * 1000;
    if (xMax - xMin < 60000) { xMin -= 30000; xMax += 30000; }
    setTimeAxis(sc.x, xMin, xMax, opts.xMin === undefined);
  } else {
    delete sc.yT.min; delete sc.yT.max; delete sc.yH.min; delete sc.yH.max;
    delete sc.yT.ticks.stepSize; delete sc.yH.ticks.stepSize;
    if (opts.xMin !== undefined) setTimeAxis(sc.x, opts.xMin, opts.xMax, false);
    else { delete sc.x.min; delete sc.x.max; delete sc.x.ticks.stepSize; }
  }

  // หัวกราฟบอกช่วงข้อมูลที่แสดง
  const title = chart.options.plugins.title;
  if (opts.title !== undefined) { title.text = opts.title; title.display = !!opts.title; }
  chart.$emptyMessage = opts.emptyMessage;
  chart.$lastArgs = { rows, opts }; // เก็บไว้ใช้วาดกราฟสำหรับดาวน์โหลด
  applyResponsiveChart(chart);
  chart.update();
}

// จอแคบ (มือถือ) → ซ่อนชื่อแกน, ตัวอักษรเล็กลง, ขีดเวลาน้อยลง
let exportMode = false; // ระหว่างวาดกราฟสำหรับดาวน์โหลด ใช้รูปแบบจอใหญ่เสมอ
function isNarrow() { return !exportMode && window.innerWidth <= 600; }
function applyResponsiveChart(chart) {
  if (!chart) return;
  // แก้ที่ options ดิบ (chart.config.options) เท่านั้น — ห้ามเอาอ็อบเจกต์จาก chart.options
  // ไปใส่กลับ เพราะเป็น Proxy ซ้อนกันจน Safari/มือถือ error "Maximum call stack size exceeded"
  const raw = chart.config && chart.config.options;
  if (!raw) return;
  const n = isNarrow();
  const sc = raw.scales || {};
  ["x", "yT", "yH"].forEach((k) => {
    const a = sc[k];
    if (!a) return;
    if (a.title) a.title.display = !n;
    if (!a.ticks) a.ticks = {};
    if (!a.ticks.font) a.ticks.font = {};
    a.ticks.font.size = n ? 10 : 11;
  });
  const pl = raw.plugins || {};
  if (pl.legend) {
    pl.legend.align = n ? "center" : "end";
    if (pl.legend.labels && pl.legend.labels.font) pl.legend.labels.font.size = n ? 11 : 12;
  }
  if (pl.title && pl.title.font) pl.title.font.size = n ? 11.5 : 13;
}
let __lastNarrow = null;
window.addEventListener("resize", () => {
  const n = isNarrow();
  if (n === __lastNarrow) return;
  __lastNarrow = n;
  ["liveChart", "rangeChart"].forEach((id) => {
    const ch = window.Chart && Chart.getChart(id);
    if (ch) { applyResponsiveChart(ch); ch.update("none"); }
  });
});

// แกนเวลา: เลือกระยะห่างขีดเป็นนาทีกลมๆ (5, 10, 15, 30 นาที, 1, 2, 3 ชม. ...) ไม่เกิน ~8 ขีด
// roundEnds = true จะขยายขอบซ้าย/ขวาให้ตรงขีดพอดี (ใช้กับกราฟข้อมูลทั้งหมด/24 ชม.)
function setTimeAxis(x, minMs, maxMs, roundEnds) {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440];
  const spanMin = (maxMs - minMs) / 60000;
  const maxTicks = isNarrow() ? 5 : 8; // มือถือแสดงขีดเวลาน้อยลงไม่ให้ทับกัน
  const stepMin = steps.find((m) => spanMin / m <= maxTicks) || 1440;
  const stepMs = stepMin * 60000;
  const off = 7 * 3600 * 1000; // ให้ขีดตรงเวลาไทย
  if (roundEnds) {
    minMs = Math.floor((minMs + off) / stepMs) * stepMs - off;
    maxMs = Math.ceil((maxMs + off) / stepMs) * stepMs - off;
  }
  x.min = minMs; x.max = maxMs;
  x.ticks.stepSize = stepMs;
}

// ข้อความหัวกราฟ เช่น "12 พ.ย. 2026 · 00:09 – 00:39 น. · 7 จุด"
function rangeTitle(rows, prefix = "") {
  if (!rows.length) return "";
  const a = rows[0].ts * 1000, b = rows[rows.length - 1].ts * 1000;
  const sameDay = fmtThDate(a) === fmtThDate(b);
  const span = sameDay
    ? `${fmtThDate(a)} · ${fmtThTime(a)} – ${fmtThTime(b)} น.`
    : `${fmtThDate(a)} ${fmtThTime(a)} – ${fmtThDate(b)} ${fmtThTime(b)} น.`;
  return `${prefix}${span} · ${rows.length} จุด`;
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
      if (chart.options.scales.x.title) chart.options.scales.x.title.color = theme.tickColor;
    }
    if (chart.options.plugins && chart.options.plugins.title) {
      chart.options.plugins.title.color = theme.tickColor;
    }

    if (chart.options.scales.yT) {
      if (!chart.options.scales.yT.grid) chart.options.scales.yT.grid = {};
      chart.options.scales.yT.grid.color = theme.gridColor;
      if (!chart.options.scales.yT.ticks) chart.options.scales.yT.ticks = {};
      chart.options.scales.yT.ticks.color = "#ff5e36";
      if (!chart.options.scales.yT.border) chart.options.scales.yT.border = {};
      chart.options.scales.yT.border.color = "#ff5e36";
      if (chart.options.scales.yT.title) chart.options.scales.yT.title.color = "#ff5e36";
    }

    if (chart.options.scales.yH) {
      if (!chart.options.scales.yH.ticks) chart.options.scales.yH.ticks = {};
      chart.options.scales.yH.ticks.color = "#0ea5e9";
      if (!chart.options.scales.yH.border) chart.options.scales.yH.border = {};
      chart.options.scales.yH.border.color = "#0ea5e9";
      if (chart.options.scales.yH.title) chart.options.scales.yH.title.color = "#0ea5e9";
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
      return true; // สถานะออนไลน์/ออฟไลน์ ดูจากบอร์ดโดยตรง (checkStatus)
    }

    rows.sort((a, b) => a.ts - b.ts);
    currentRows = rows;
    isSheetMode = true;
    currentSource = "sheet";

    const last = rows[rows.length - 1];
    // การ์ดค่าปัจจุบันใช้ค่าสดจาก Firebase /live เป็นหลัก
    // ใช้ค่าจากชีตเฉพาะตอนที่ยังไม่มีค่าสด (เช่น บอร์ดออฟไลน์)
    if (!isLiveFresh()) {
      if (tempEl) tempEl.textContent = last.temp.toFixed(1);
      if (humEl) humEl.textContent = last.hum.toFixed(1);
      if (updatedEl) updatedEl.textContent = `${last.date} ${last.time}`;
      latestTs = last.ts;
      updateMetricPills(last.temp, last.hum);
    }

    if (sourceBadge) {
      sourceBadge.textContent = "📊 แหล่งข้อมูล: Google Sheet";
      sourceBadge.style.color = "var(--primary-color)";
    }

    updateMinMaxSub(rows);
    checkStatus();

    // กราฟ 24 ชม. ล่าสุด (นับตามเวลาจริง ไม่ใช่จำนวนแถว)
    const lastTsAll = rows[rows.length - 1].ts;
    const last24 = rows.filter((r) => r.ts >= lastTsAll - 24 * 3600);
    updateChart(liveChart, last24, { title: rangeTitle(last24, "24 ชม. ล่าสุด: ") });

    updateDataRangeHint(rows);

    // ส่วนค้นหา: ถ้าผู้ใช้กำลังดูช่วงที่ค้นหาอยู่ ให้คงช่วงนั้นไว้ (อัปเดตข้อมูลใหม่ในช่วงเดิม)
    if (activeSearch) {
      runSearch(true);
    } else {
      updateChart(rangeChart, rows, { title: rangeTitle(rows, "ข้อมูลทั้งหมด: ") });
      renderTable(rows);
      renderSummary(rows);
      setupExportCsv(rows);
    }

    // บันทึกแคชข้อมูลล่าสุดไว้เพื่อกู้คืนอัตโนมัติหากมีปัญหาเครือข่าย
    try {
      sessionStorage.setItem("esp32_cached_sheet_rows", JSON.stringify(rows));
    } catch (e) {}

    if (configNotice) configNotice.style.display = "none";
    return true;
  } catch (err) {
    console.error("Google Sheet Fetch Error:", err);
    if (statusEl) {
      statusEl.textContent = "● กำลังลองเชื่อมต่อใหม่...";
      statusEl.className = "status offline";
    }
    // กู้คืนข้อมูลจากแคชล่าสุดทันที เพื่อให้หน้าจอไม่ว่างเปล่าและไม่ต้องรบกวนผู้ใช้ด้วย alert
    try {
      const cached = sessionStorage.getItem("esp32_cached_sheet_rows");
      if (cached) {
        const cachedRows = JSON.parse(cached);
        if (Array.isArray(cachedRows) && cachedRows.length > 0) {
          const last = cachedRows[cachedRows.length - 1];
          if (tempEl) tempEl.textContent = last.temp.toFixed(1);
          if (humEl) humEl.textContent = last.hum.toFixed(1);
          if (updatedEl) updatedEl.textContent = `${last.date} ${last.time}`;
          updateMetricPills(last.temp, last.hum);
          updateMinMaxSub(cachedRows);
          updateDataRangeHint(cachedRows);
          const lastTsAll = cachedRows[cachedRows.length - 1].ts;
          const last24 = cachedRows.filter((r) => r.ts >= lastTsAll - 24 * 3600);
          updateChart(liveChart, last24, { title: rangeTitle(last24, "24 ชม. ล่าสุด: ") });
          updateChart(rangeChart, cachedRows, { title: rangeTitle(cachedRows, "ข้อมูลทั้งหมด: ") });
          renderTable(cachedRows);
          renderSummary(cachedRows);
          setupExportCsv(cachedRows);
        }
      }
    } catch (e) {}
    // ลองเชื่อมต่อใหม่อัตโนมัติในเบื้องหลัง
    setTimeout(() => {
      if (isSheetMode && activeSource && activeSource.url) {
        fetchFromGoogleSheet(activeSource.url, true);
      }
    }, 4000);
    return false;
  }
}

// ==========================================================================
// ===== 5. ตรวจสอบแหล่งข้อมูลเริ่มต้น =====
// ==========================================================================
function getSavedConfig() {
  // ผู้ใช้ทั่วไปใช้ URL ในโค้ดเสมอ ค่าที่เคยบันทึกในเบราว์เซอร์ใช้เฉพาะโหมดผู้ดูแล
  const savedSheet = (ADMIN_MODE && localStorage.getItem("esp32_sheet_url")) || DEFAULT_GOOGLE_SHEET_URL;
  if (savedSheet && savedSheet.trim() !== "") {
    return { type: "sheet", url: savedSheet.trim() };
  }

  if (firebaseConfig && firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "") {
    return { type: "firebase", config: firebaseConfig };
  }

  const savedFb = ADMIN_MODE ? localStorage.getItem("esp32_firebase_config") : null;
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
    }, 30000);
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

// ฟังก์ชันคำนวณดัชนีความร้อน (Heat Index) ตามสูตร Steadman / NOAA
function calculateHeatIndex(T, RH) {
  if (typeof T !== "number" || typeof RH !== "number" || isNaN(T) || isNaN(RH)) return T;
  const Tf = T * 1.8 + 32;
  let hif = 0.5 * (Tf + 61.0 + ((Tf - 68.0) * 1.2) + (RH * 0.094));
  if (hif >= 80) {
    hif = -42.379 + 2.04901523 * Tf + 10.14333127 * RH
          - 0.22475541 * Tf * RH - 0.00683783 * Tf * Tf
          - 0.05481717 * RH * RH + 0.00122874 * Tf * Tf * RH
          + 0.00085282 * Tf * RH * RH - 0.00000199 * Tf * Tf * RH * RH;
    if (RH < 13 && Tf >= 80 && Tf <= 112) {
      hif -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(Tf - 95)) / 17);
    } else if (RH > 85 && Tf >= 80 && Tf <= 87) {
      hif += ((RH - 85) / 10) * ((87 - Tf) / 5);
    }
  }
  return (hif - 32) / 1.8;
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

  if (heatIndexEl && typeof temp === "number" && typeof hum === "number") {
    const hi = calculateHeatIndex(temp, hum);
    heatIndexEl.textContent = hi.toFixed(1);
    if (heatTouchVal) {
      if (hi < 27) {
        heatTouchVal.textContent = "ตามร่างกาย";
        heatTouchVal.style.color = "";
      } else if (hi < 33) {
        heatTouchVal.textContent = "ตามร่างกาย (ระวัง)";
        heatTouchVal.style.color = "#f59e0b";
      } else if (hi < 42) {
        heatTouchVal.textContent = "ตามร่างกาย (เตือนภัย)";
        heatTouchVal.style.color = "#ea580c";
      } else {
        heatTouchVal.textContent = "ตามร่างกาย (อันตราย)";
        heatTouchVal.style.color = "var(--danger-color)";
      }
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

// สถานะบอร์ด: ออนไลน์ = บอร์ดส่งค่าสดเข้ามาภายใน 10 วินาทีล่าสุด, ไม่งั้น = ออฟไลน์
const PAGE_OPENED = Date.now();
function checkStatus() {
  if (!statusEl) return;
  const fresh = isLiveFresh();
  document.body.classList.toggle("board-offline", !fresh && Date.now() - PAGE_OPENED > 12000);
  if (fresh) {
    statusEl.textContent = "● ออนไลน์";
    statusEl.className = "status online";
    statusEl.title = "บอร์ด ESP32 กำลังส่งข้อมูลสด";
  } else if (Date.now() - PAGE_OPENED <= 12000) {
    statusEl.textContent = "● กำลังเชื่อมต่อ...";
    statusEl.className = "status";
  } else {
    statusEl.textContent = "● ออฟไลน์";
    statusEl.className = "status offline";
    statusEl.title = "ไม่ได้รับข้อมูลจากบอร์ดเกิน 10 วินาที (บอร์ดถูกถอด/ไม่มี WiFi)";
  }
}

setInterval(checkStatus, 1000);

// ==========================================================================
// ===== 6. การค้นหาข้อมูลตามช่วงเวลา =====
// ==========================================================================
if (quickTodayBtn) {
  quickTodayBtn.addEventListener("click", () => {
    if (dateInput) dateInput.value = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    if (startInput) startInput.value = "00:00";
    if (endInput) endInput.value = "23:59";
    syncTimeSelects();
    if (searchBtn) searchBtn.click();
  });
}

// แสดงช่วงข้อมูลที่มีอยู่จริง (เปิดให้ปฏิทินเลือกดูได้อิสระทุกวัน ทุกเดือน ทุกปี)
function updateDataRangeHint(rows) {
  const hint = document.getElementById("dataRangeHint");
  const valid = rows.filter((r) => r.ts > 0);
  if (!valid.length) { if (hint) hint.textContent = ""; return; }
  const a = valid[0].ts * 1000, b = valid[valid.length - 1].ts * 1000;
  // ปลดล็อกขีดจำกัด min/max ของช่องปฏิทิน เพื่อให้เลือกดูได้อิสระทุกวัน ทุกเดือน ทุกปี
  if (dateInput) {
    dateInput.removeAttribute("min");
    dateInput.removeAttribute("max");
  }
  if (hint) {
    hint.innerHTML = `📦 มีข้อมูลตั้งแต่ <strong>${fmtThDate(a)} ${fmtThTime(a)} น.</strong> ถึง <strong>${fmtThDate(b)} ${fmtThTime(b)} น.</strong> (${valid.length} จุด)` +
      (activeSearch ? ` · <a href="#" id="clearSearchLink">แสดงข้อมูลทั้งหมด</a>` : "");
    const link = document.getElementById("clearSearchLink");
    if (link) link.onclick = (ev) => { ev.preventDefault(); clearSearch(); };
  }
}

function clearSearch() {
  activeSearch = null;
  const rows = isDemoMode ? demoRows : currentRows;
  updateChart(rangeChart, rows, { title: rangeTitle(rows, "ข้อมูลทั้งหมด: ") });
  renderTable(rows);
  renderSummary(rows);
  setupExportCsv(rows);
  updateDataRangeHint(rows);
}

// silent = true: เรียกจากการรีเฟรชอัตโนมัติหรือเปลี่ยนวันที่ (ไม่แสดง alert)
async function runSearch(silent = false) {
  const d = dateInput ? dateInput.value : "";
  let s = startInput ? startInput.value : "";
  let e = endInput ? endInput.value : "";
  const warn = (msg) => { if (!silent) alert(msg); };

  if (!d) { warn("กรุณาเลือกวันที่ที่ต้องการค้นหา"); return; }

  // หากเว้นว่างเวลาเริ่มต้นหรือสิ้นสุด ให้ใช้ค่าครอบคลุมทั้งวัน 00:00 - 23:59 โดยอัตโนมัติ
  if (!s) {
    s = "00:00";
    if (startInput) startInput.value = s;
  }
  if (!e) {
    e = "23:59";
    if (endInput) endInput.value = e;
  }
  syncTimeSelects();

  const startDateObj = new Date(`${d}T${s}:00+07:00`);
  if (isNaN(startDateObj.getTime())) { warn("รูปแบบวันที่หรือเวลาเริ่มต้นไม่ถูกต้อง"); return; }
  const startTs = Math.floor(startDateObj.getTime() / 1000);

  // ตรวจสอบการเลือกเวลาข้ามวัน/ข้ามคืน
  // เช่น เริ่ม 20:00 หรือ 22:00 ถึง 00:00 (เที่ยงคืน) หรือถึง 02:00 (ตีสองของวันรุ่งขึ้น)
  const isOvernight = (e <= s);
  let endDateStr = d;
  if (isOvernight) {
    const nextDate = new Date(startDateObj.getTime() + 24 * 60 * 60 * 1000);
    endDateStr = nextDate.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  }

  const endDateObj = new Date(`${endDateStr}T${e}:59+07:00`);
  if (isNaN(endDateObj.getTime())) { warn("รูปแบบเวลาสิ้นสุดไม่ถูกต้อง"); return; }
  const endTs = Math.floor(endDateObj.getTime() / 1000);

  if (endTs < startTs) { warn("เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น"); return; }

  activeSearch = { d, s, e, isOvernight, endD: endDateStr };
  const label = isOvernight
    ? `${fmtThDate(startTs * 1000)} ${s} น. – ${fmtThDate(endTs * 1000)} ${e} น. (ข้ามวัน)`
    : `${fmtThDate(startTs * 1000)} · ${s} – ${e} น.`;
  const range = { xMin: startTs * 1000, xMax: endTs * 1000 };

  let rows = [];
  if (isDemoMode || isSheetMode) {
    const sourceList = isDemoMode ? demoRows : currentRows;
    rows = sourceList.filter((r) => r.ts >= startTs && r.ts <= endTs);

    if (!rows.length) {
      // บอกช่วงที่มีข้อมูลจริง แทนการแสดงกราฟว่างเฉยๆ
      const valid = sourceList.filter((r) => r.ts > 0);
      const avail = valid.length
        ? `ข้อมูลที่มี: ${fmtThDate(valid[0].ts * 1000)} ${fmtThTime(valid[0].ts * 1000)} – ${fmtThDate(valid[valid.length - 1].ts * 1000)} ${fmtThTime(valid[valid.length - 1].ts * 1000)} น.`
        : "ยังไม่มีข้อมูลในระบบ";
      updateChart(rangeChart, [], { ...range, title: `ผลการค้นหา: ${label}`, emptyMessage: `ไม่มีข้อมูลในช่วงนี้ — ${avail}` });
      renderTable([], `ไม่มีข้อมูลช่วง ${label}<br><small>${avail}</small>`);
      renderSummary([]);
      setupExportCsv([]);
      updateDataRangeHint(sourceList);
      return;
    }
  } else {
    if (!readingsRef) { warn("กรุณาเชื่อมต่อ Google Sheet หรือ Firebase ก่อน หรือกด 'โหลดข้อมูลจำลอง (Demo)'"); return; }
    try {
      const snap = await get(query(readingsRef, orderByChild("ts"), startAt(startTs), endAt(endTs)));
      rows = toRows(snap);
    } catch (err) {
      console.error("Search query failed:", err);
      warn("ค้นหาไม่สำเร็จ: " + err.message);
      return;
    }
  }

  updateChart(rangeChart, rows, { ...range, title: `ผลการค้นหา: ${label} · ${rows.length} จุด`, emptyMessage: "ไม่มีข้อมูลในช่วงนี้" });
  renderTable(rows);
  renderSummary(rows, s, e);
  setupExportCsv(rows);
  updateDataRangeHint(isDemoMode ? demoRows : currentRows);
}

if (searchBtn) searchBtn.addEventListener("click", () => runSearch(false));

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

function renderTable(rows, emptyHtml = "ไม่พบข้อมูลในช่วงเวลาที่เลือก") {
  const tbody = document.querySelector("#dataTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div class="empty-content">
            <span class="empty-icon">🔍</span>
            <p>${emptyHtml}</p>
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

// ===== ดาวน์โหลดข้อมูล: CSV (ตาราง), PNG (กราฟ), รายงาน PDF (กราฟ + สรุป + ตาราง) =====
let exportRows = [];

function setupExportCsv(rows) {
  exportRows = rows || [];
  const show = exportRows.length > 0 ? "inline-flex" : "none";
  [exportCsvBtn, document.getElementById("exportPngBtn"), document.getElementById("exportReportBtn")]
    .forEach((b) => { if (b) b.style.display = show; });
}

function exportFileName(ext) {
  const r = exportRows;
  return r.length ? `esp32-${r[0].date}_${r[0].time.slice(0, 5).replace(":", "")}-${r[r.length - 1].time.slice(0, 5).replace(":", "")}.${ext}` : `esp32.${ext}`;
}

// ===== ส่งไฟล์ให้ผู้ใช้ (รองรับ iPad/iPhone ที่ปุ่มดาวน์โหลดปกติใช้ไม่ได้) =====
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function downloadUrl(url, name) {
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

function deliverFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  // iPad/iPhone: เปิดหน้าแชร์ของระบบ → เลือก "บันทึกภาพ" / "บันทึกไปยังไฟล์"
  if (IS_IOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch((err) => {
      if (err && err.name === "AbortError") return; // ผู้ใช้กดยกเลิกเอง
      showSaveSheet(blob, name);
    });
    return;
  }
  if (IS_IOS) { showSaveSheet(blob, name); return; }
  const url = URL.createObjectURL(blob);
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 60000); // ปล่อยไว้ก่อน มือถือบางรุ่นดาวน์โหลดช้า
}

// สำรอง: แสดงหน้าต่างให้แตะบันทึกเอง (กรณีระบบไม่อนุญาตให้แชร์อัตโนมัติ)
function showSaveSheet(blob, name) {
  const url = URL.createObjectURL(blob);
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px";
  const isImg = blob.type.startsWith("image/");
  wrap.innerHTML = `<div style="background:#fff;color:#0f172a;border-radius:16px;padding:20px;max-width:420px;width:100%;text-align:center;font-family:inherit">
    <div style="font-weight:700;font-size:17px;margin-bottom:6px">ไฟล์พร้อมแล้ว</div>
    <div style="font-size:13px;color:#64748b;margin-bottom:14px">${name}</div>
    ${isImg ? `<img src="${url}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px">
      <div style="font-size:12.5px;color:#64748b;margin-bottom:12px">หรือแตะค้างที่รูป แล้วเลือก "บันทึกไปยังรูปภาพ"</div>` : ""}
    <button data-act="save" style="width:100%;padding:12px;border:none;border-radius:10px;background:#0284c7;color:#fff;font-weight:700;font-size:15px;margin-bottom:8px">💾 บันทึกไฟล์</button>
    <a data-act="open" href="${url}" target="_blank" rel="noopener" style="display:block;padding:10px;color:#0284c7;font-weight:600;font-size:14px">เปิดไฟล์ในแท็บใหม่</a>
    <button data-act="close" style="width:100%;padding:10px;border:none;background:none;color:#64748b;font-size:14px">ปิด</button></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  wrap.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (e.target === wrap || (act && act.dataset.act === "close")) close();
    if (act && act.dataset.act === "save") {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).then(close).catch(() => {});
      } else { downloadUrl(url, name); }
    }
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// CSV: วันที่/เวลาเป็นข้อความ เพื่อไม่ให้ Excel แปลงรูปแบบเอง (เช่น 12-11-26)
if (exportCsvBtn) exportCsvBtn.onclick = () => {
  if (!exportRows.length) return;
  let csv = "﻿ลำดับ,วันที่,เวลา,อุณหภูมิ (°C),ความชื้น (%)\n";
  exportRows.forEach((r, i) => {
    csv += `${i + 1},="${r.date}",="${r.time}",${r.temp.toFixed(1)},${r.hum.toFixed(1)}\n`;
  });
  deliverFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), exportFileName("csv"));
};

// รูปกราฟขนาดใหญ่ ธีมสว่าง พื้นขาว — วาดกราฟสำเนาบนแคนวาสที่ซ่อนไว้
// (ไม่ขึ้นกับขนาดจอ มือถือก็ได้รูปกว้างคมชัดเท่าคอม และไม่กระทบกราฟบนหน้าเว็บ)
function renderChartCanvas(chart, w = 900, h = 380) {
  const args = chart.$lastArgs || { rows: exportRows, opts: {} };
  const wasDark = getThemeColors().isDark;
  if (wasDark) htmlRoot.setAttribute("data-theme", "light");
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-30000px;top:0;width:${w}px;height:${h}px;pointer-events:none`;
  const cv = document.createElement("canvas");
  cv.id = "__exportChart";
  holder.appendChild(cv);
  document.body.appendChild(holder);
  exportMode = true;
  let out;
  try {
    const ex = makeChart("__exportChart");
    ex.config.options.animation = false;
    ex.config.options.devicePixelRatio = 2;
    ex.config.options.responsive = false;
    ex.stop(); // หยุดแอนิเมชันตอนสร้าง ให้วาดเสร็จทันที
    ex.resize(w, h);
    updateChart(ex, args.rows, args.opts);
    ex.stop();
    ex.draw();
    const src = ex.canvas;
    out = document.createElement("canvas");
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    ex.destroy();
  } finally {
    exportMode = false;
    holder.remove();
    if (wasDark) htmlRoot.setAttribute("data-theme", "dark");
  }
  return out;
}
function chartImage(chart) { return renderChartCanvas(chart).toDataURL("image/png"); }

const exportPngBtn = document.getElementById("exportPngBtn");
if (exportPngBtn) exportPngBtn.onclick = () => {
  if (!rangeChart || !exportRows.length) return;
  deliverFile(dataUrlToBlob(chartImage(rangeChart)), exportFileName("png"));
};

// ===== รายงาน PDF: วาดหน้า A4 ลงแคนวาสเอง แล้วประกอบเป็นไฟล์ PDF จริง =====
// (ไม่ใช้หน้าต่างพิมพ์ จึงได้ไฟล์ครบทุกหน้า มีกราฟ ใช้ได้ทั้งคอม มือถือ iPad)
function buildPdf(jpegPages, pw = 595.28, ph = 841.89) {
  const enc = new TextEncoder();
  const parts = []; const offsets = []; let len = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = jpegPages.length;
  // 1 = catalog, 2 = pages, แล้วต่อด้วย (page, content, image) ทีละหน้า
  const obj = (id, body) => { offsets[id] = len; push(`${id} 0 obj\n`); body(); push("\nendobj\n"); };
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  const kids = jpegPages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  jpegPages.forEach((pg, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`);
      push(pg.bytes); push("\nendstream");
    });
  });
  const total = 3 + n * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

function makeReportPages(rows, chartCanvas, title) {
  const W = 1240, H = 1754, M = 80; // A4 ที่ 150 dpi
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const pages = [];
  const t = rows.map((r) => r.temp), h = rows.map((r) => r.hum);
  const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  const now = Date.now();
  const rowH = 40;
  const cols = [0.09, 0.24, 0.2, 0.235, 0.235]; // สัดส่วนความกว้างคอลัมน์
  const heads = ["ลำดับ", "วันที่", "เวลา", "อุณหภูมิ (°C)", "ความชื้น (%)"];
  let ctx, y;

  const newPage = () => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.direction = "ltr";
    pages.push(c); y = M;
  };
  const text = (s, x, yy, size, weight = 400, color = "#0f172a", align = "left") => {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color;
    const w = ctx.measureText(s).width;
    ctx.fillText(s, align === "center" ? x - w / 2 : x, yy);
  };
  const tableHead = () => {
    ctx.fillStyle = "#f1f5f9"; ctx.fillRect(M, y, W - 2 * M, rowH);
    let x = M;
    heads.forEach((hd, i) => { const cw = cols[i] * (W - 2 * M); text(hd, x + cw / 2, y + rowH / 2, 19, 700, "#334155", "center"); x += cw; });
    y += rowH;
  };

  newPage();
  text("รายงานอุณหภูมิและความชื้น (ESP32 + DHT11)", M, y + 18, 36, 700);
  y += 58;
  text(title, M, y, 21, 400, "#475569"); y += 32;
  text(`ออกรายงานเมื่อ ${fmtThDate(now)} ${fmtThTime(now)} น.`, M, y, 19, 400, "#64748b"); y += 40;

  // กล่องสรุป 3 ช่อง
  const kw = (W - 2 * M - 40) / 3, kh = 130;
  const kpis = [
    ["อุณหภูมิเฉลี่ย", `${avg(t)} °C`, `ต่ำสุด ${Math.min(...t).toFixed(1)} · สูงสุด ${Math.max(...t).toFixed(1)} °C`, "#ea580c"],
    ["ความชื้นเฉลี่ย", `${avg(h)} %`, `ต่ำสุด ${Math.min(...h).toFixed(1)} · สูงสุด ${Math.max(...h).toFixed(1)} %`, "#0284c7"],
    ["จำนวนข้อมูล", `${rows.length} จุด`, `${rows[0].time.slice(0, 5)} – ${rows[rows.length - 1].time.slice(0, 5)} น.`, "#0f172a"],
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kw + 20);
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2; ctx.strokeRect(x, y, kw, kh);
    text(k[0], x + 18, y + 30, 18, 600, "#64748b");
    text(k[1], x + 18, y + 72, 34, 700, k[3]);
    text(k[2], x + 18, y + 108, 16, 400, "#64748b");
  });
  y += kh + 26;

  // กราฟ
  const gw = W - 2 * M, gh = Math.round(gw * chartCanvas.height / chartCanvas.width);
  ctx.drawImage(chartCanvas, M, y, gw, gh);
  ctx.strokeStyle = "#e2e8f0"; ctx.strokeRect(M, y, gw, gh);
  y += gh + 28;

  // ตาราง (ขึ้นหน้าใหม่อัตโนมัติ)
  tableHead();
  rows.forEach((r, i) => {
    if (y + rowH > H - M - 30) { newPage(); tableHead(); }
    const vals = [String(i + 1), r.date, r.time, r.temp.toFixed(1), r.hum.toFixed(1)];
    let x = M;
    vals.forEach((v, j) => { const cw = cols[j] * (W - 2 * M); text(v, x + cw / 2, y + rowH / 2, 19, 400, "#0f172a", "center"); x += cw; });
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, y + rowH); ctx.lineTo(W - M, y + rowH); ctx.stroke();
    y += rowH;
  });

  // เลขหน้า (มุมขวาล่าง)
  pages.forEach((c, i) => {
    ctx = c.getContext("2d");
    const s = `หน้า ${i + 1}/${pages.length}`; ctx.font = `400 16px ${font}`; ctx.fillStyle = "#94a3b8";
    ctx.fillText(s, W - M - ctx.measureText(s).width, H - M / 2);
  });
  return pages;
}

const exportReportBtn = document.getElementById("exportReportBtn");
if (exportReportBtn) exportReportBtn.onclick = () => {
  if (!rangeChart || !exportRows.length) return;
  const rows = exportRows;
  const title = rangeChart.options.plugins.title.text || rangeTitle(rows);
  const pages = makeReportPages(rows, renderChartCanvas(rangeChart), title);
  // แปลงแต่ละหน้าเป็น JPEG แบบ synchronous (ยังอยู่ในจังหวะกดปุ่ม ทำให้ iPad เปิดหน้าแชร์ได้)
  const pdfPages = pages.map((c) => {
    const b64 = c.toDataURL("image/jpeg", 0.9).split(",")[1];
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { w: c.width, h: c.height, bytes };
  });
  deliverFile(buildPdf(pdfPages), exportFileName("pdf"));
};

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

if (!ADMIN_MODE) {
  [configToggleBtn, openConfigBtn, loadDemoBtn].forEach((b) => { if (b) b.style.display = "none"; });
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


// ==========================================================================
// ===== 9. ค่าสดแบบเรียลไทม์จาก Firebase /live =====
// บอร์ด ESP32 เขียนทับค่าดิบที่ /live ทุก 1 วินาที
// เว็บรับค่าผ่าน Firebase REST streaming (EventSource) ได้ทันทีที่บอร์ดเขียน
// การบันทึกลง Google Sheet ทุก 5 นาที ทำโดย Apps Script (snapshotLiveToSheet)
// ==========================================================================

function isLiveFresh() {
  return liveArrivedAt > 0 && Date.now() - liveArrivedAt <= LIVE_FRESH_SEC * 1000;
}

function showLive(r) {
  if (!r || r.ts === undefined) return;
  const t = Number(r.temp), h = Number(r.hum);
  if (isNaN(t) || isNaN(h)) return;
  const newTs = Number(r.ts);
  if (liveTs === 0) {
    // ค่าแรกตอนเปิดเว็บ อาจเป็นค่าเก่าค้างไว้ตอนบอร์ดถูกถอด → นับว่าสดเฉพาะเมื่ออายุไม่เกิน 10 วิ
    if (Math.abs(Date.now() / 1000 - newTs) <= LIVE_FRESH_SEC) liveArrivedAt = Date.now();
  } else if (newTs !== liveTs) {
    liveArrivedAt = Date.now();
  }
  liveTs = newTs;
  latestTs = liveTs;
  if (tempEl) tempEl.textContent = t.toFixed(1);
  if (humEl) humEl.textContent = h.toFixed(1);
  if (updatedEl) updatedEl.textContent = `${r.date} ${r.time}`;
  updateMetricPills(t, h);
  checkStatus();
}

function fetchLiveOnce() {
  fetch(LIVE_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then((res) => res.json())
    .then(showLive)
    .catch(() => {});
}

function startLiveStream() {
  if (!("EventSource" in window)) {
    setInterval(fetchLiveOnce, 1000); // สำรองสำหรับเบราว์เซอร์เก่า
    return;
  }
  const stream = new EventSource(LIVE_URL);
  stream.addEventListener("put", (e) => {
    const msg = JSON.parse(e.data); // { path: "/", data: {...} }
    if (msg.path === "/") showLive(msg.data);
    else fetchLiveOnce();
  });
  stream.addEventListener("patch", fetchLiveOnce);
  stream.onerror = () => console.warn("Live stream: กำลังเชื่อมต่อใหม่...");
}

startLiveStream();

// ==========================================================================
// ===== 10. ระบบสลับหน้าระหว่างภาพรวมและวิเคราะห์แบบลื่นไหลไร้รอยต่อ (SPA Navigation) =====
// ==========================================================================
function setupViewSwitching() {
  const navPills = document.querySelectorAll(".app-nav .nav-pill");
  const viewLive = document.getElementById("viewLive");
  const viewAnalytics = document.getElementById("viewAnalytics");

  if (!viewLive || !viewAnalytics) return;

  function switchView(target, updateUrl = true) {
    const isLive = target === "live";

    // อัปเดตแท็บขีดเส้นใต้
    navPills.forEach((pill) => {
      const isPillLive = pill.getAttribute("data-view") === "live" || pill.getAttribute("href")?.includes("index.html");
      if ((isLive && isPillLive) || (!isLive && !isPillLive)) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });

    const doSwitch = () => {
      if (isLive) {
        viewAnalytics.style.display = "none";
        viewAnalytics.classList.remove("active");
        viewLive.style.display = "flex";
        viewLive.classList.add("active");

        const ch = window.Chart && Chart.getChart("liveChart");
        if (ch) {
          applyResponsiveChart(ch);
          ch.resize();
          ch.update("none");
        }
      } else {
        viewLive.style.display = "none";
        viewLive.classList.remove("active");
        viewAnalytics.style.display = "block";
        viewAnalytics.classList.add("active");

        const ch = window.Chart && Chart.getChart("rangeChart");
        if (ch) {
          applyResponsiveChart(ch);
          ch.resize();
          ch.update("none");
        }
      }
    };

    if (document.startViewTransition) {
      document.startViewTransition(doSwitch);
    } else {
      doSwitch();
    }

    if (updateUrl) {
      const targetUrl = isLive ? "index.html" : "history.html";
      if (!window.location.pathname.endsWith(targetUrl)) {
        try {
          history.pushState({ view: target }, "", targetUrl);
        } catch (e) {}
      }
    }
  }

  navPills.forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      const href = pill.getAttribute("href");
      const isLive = pill.getAttribute("data-view") === "live" || href?.includes("index.html");
      switchView(isLive ? "live" : "analytics", true);
    });
  });

  window.addEventListener("popstate", () => {
    const isHistory = window.location.pathname.includes("history.html");
    switchView(isHistory ? "analytics" : "live", false);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupViewSwitching);
} else {
  setupViewSwitching();
}
