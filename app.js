(function() {
  window.addEventListener("error", function(ev) {
    try {
      document.body.innerHTML = "<div style='color:#fff;background:#0a0f1a;min-height:100vh;padding:20px;font-family:monospace;direction:ltr;text-align:left;font-size:13px;white-space:pre-wrap;'>"
        + "⚠️ حصل خطأ في التطبيق:\n\n"
        + (ev.message || "unknown error") + "\n\n"
        + "الملف: " + (ev.filename || "?") + "\n"
        + "السطر: " + (ev.lineno || "?") + ":" + (ev.colno || "?") + "\n\n"
        + (ev.error && ev.error.stack ? ev.error.stack : "")
        + "</div>";
    } catch (e2) {}
  });
  window.addEventListener("unhandledrejection", function(ev) {
    try {
      document.body.innerHTML = "<div style='color:#fff;background:#0a0f1a;min-height:100vh;padding:20px;font-family:monospace;direction:ltr;text-align:left;font-size:13px;white-space:pre-wrap;'>"
        + "⚠️ حصل خطأ (Promise):\n\n"
        + (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)) + "\n\n"
        + (ev.reason && ev.reason.stack ? ev.reason.stack : "")
        + "</div>";
    } catch (e2) {}
  });
  function waitForDeps(callback, tries) {
    tries = tries || 0;
    if (typeof React !== "undefined" && typeof ReactDOM !== "undefined") {
      callback();
    } else if (tries > 100) {
      document.body.innerHTML = "<div style='color:#ef4444;padding:20px;font-family:Cairo,sans-serif;direction:rtl'>⚠️ فشل تحميل React. تأكد من اتصالك بالإنترنت وأعد تحميل الصفحة.</div>";
    } else {
      setTimeout(function() { waitForDeps(callback, tries+1); }, 50);
    }
  }
  waitForDeps(function() {
"use strict";
const {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef
} = React;

// ══════════════════════════════════════════════════════════════
// SUPABASE CONFIG — ضع بياناتك هنا بعد إنشاء المشروع
// ══════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://nkcfosifswvaoqlfliww.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rY2Zvc2lmc3d2YW9xbGZsaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjY3ODksImV4cCI6MjA5NzI0Mjc4OX0.mKg8mXOrfDayAKuGGm9GzU-F2jnONp8hb0tJ9XmsMCI";
let CURRENT_USER_ID = null; // بيتحط بعد تسجيل الدخول، مش عشوائي تاني

// ── Supabase client
let sb = null;
try {
  if (SUPABASE_URL !== "YOUR_SUPABASE_URL") {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.log("Supabase not configured");
}

// ── تسجيل الدخول / حساب جديد
async function authSignUp(email, password) {
  if (!sb) return { error: "السحابة مش متظبطة" };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { error: error.message };
  if (data.user && !data.session) return { needsConfirm: true };
  if (data.user) CURRENT_USER_ID = data.user.id;
  return { user: data.user };
}
async function authSignIn(email, password) {
  if (!sb) return { error: "السحابة مش متظبطة" };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  CURRENT_USER_ID = data.user.id;
  return { user: data.user };
}
async function authSignOut() {
  if (sb) await sb.auth.signOut();
  CURRENT_USER_ID = null;
}
async function authGetSession() {
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session && data.session.user) {
      CURRENT_USER_ID = data.session.user.id;
      return data.session.user;
    }
  } catch {}
  return null;
}

// ── Cloud sync helpers
async function cloudLoad(key) {
  if (!sb || !CURRENT_USER_ID) return null;
  try {
    const {
      data
    } = await sb.from("budget_data").select("value").eq("user_id", CURRENT_USER_ID).eq("key", key).single();
    return data ? JSON.parse(data.value) : null;
  } catch {
    return null;
  }
}
const CRITICAL_KEYS = ["mz_mhapp_v8", "mz_mhmonth_v8", "mz_mhind_v8", "mz_mhdelxl_v1"];
function _isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}
async function cloudSave(key, value) {
  if (!sb || !CURRENT_USER_ID) return;
  try {
    if (CRITICAL_KEYS.includes(key) && _isEmptyValue(value)) {
      const existing = await cloudLoad(key);
      if (existing && !_isEmptyValue(existing)) {
        console.log(`⚠️ اتلغى حفظ "${key}" فاضي على السحابة عشان فيه بيانات حقيقية موجودة بالفعل هناك`);
        return;
      }
    }
    await sb.from("budget_data").upsert({
      user_id: CURRENT_USER_ID,
      key,
      value: JSON.stringify(value),
      updated_at: new Date().toISOString()
    }, {
      onConflict: "user_id,key"
    });
  } catch (e) {
    console.log("Cloud save failed:", e);
  }
}

// ── Local + Cloud storage
// بيحفظ في localStorage عشان البيانات متمسحش لما تقفل المتصفح
// وبيرفع نفس القيمة للسحابة (Supabase) تلقائيًا بعد نص ثانية من آخر تعديل،
// عشان أي حاجة تتسجل في التطبيق تتزامن من غير ما تحتاج تعمل حاجة يدويًا
const ld = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v !== null ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const _pendingPush = {};
const sv = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  if (_pendingPush[k]) clearTimeout(_pendingPush[k]);
  _pendingPush[k] = setTimeout(() => {
    delete _pendingPush[k];
    cloudSave(k, v);
  }, 600);
};
// بيجيب كل المفاتيح المتزامنة على السحابة لليوزر ده، وبيحطها في الـ localStorage
// قبل ما التطبيق يفتح، عشان أي جهاز/متصفح تفتحه بيه يبقى فيه آخر نسخة من بياناتك
async function cloudPullAll() {
  if (!sb || !CURRENT_USER_ID) return;
  try {
    const { data } = await sb.from("budget_data").select("key,value").eq("user_id", CURRENT_USER_ID);
    if (!data) return;
    data.forEach(row => {
      try { localStorage.setItem(row.key, row.value); } catch {}
    });
  } catch (e) {
    console.log("Cloud pull failed:", e);
  }
}

// ══════════════════════════════════════════════════════════════
// EXACT DATA FROM MINE1.xlsx
// ══════════════════════════════════════════════════════════════

// ── بيانات المرتب من شيت "تحقيق الأهداف ومصاريف الشهور"
const MONTHLY_PRESET = {};
// إجماليات السنة (يناير-يونيو) زي ما هي مكتوبة بالظبط في الإكسيل (خلية T2 و U2 في شيت تحقيق الأهداف)
const YEARLY_EXPENSE_XL = 209749.04;
const YEARLY_INCOME_XL = 210458.5;

// ── بيانات إندرايف من شيت INDRIVE (كل عملية بالتاريخ الصح)
// النوع: "order" = إيراد أوردر | "petrol" = بنزين
const IND_RAW = [];

// ── مصاريف البيت من شيت "ضحي" + "تحقيق الأهداف"
const HOME_DATA = [];

// ── بيانات شيت "ضحي" (دخل ومصاريف ضحي المنفصلة)
const DUHA_DATA = [];

// ── صيانة العربية من شيت "العربية"
const CAR_DATA = [];

// ── بيانات القروض الصحيحة من شيت "اهدافي 2026"
// السلفة:   باقي في يناير = 393,000 ج | أصل = 434,000 ج
// قسط الشقة: باقي في يناير = 349,815.91 ج
// الأقساط المدفوعة فبراير→مايو من الإكسيل:
//   عربية: 7000×4 = 28,000
//   شقة:   1061.06+1031.03+1030+1032 = 4,154.09
// ── أرقام من شيت "اهدافي 2026" بالضبط ──
// الأرقام دي من الإكسيل مباشرة — ملناش دعوة بالحسابات القديمة
// من يونيو 2026 فصاعداً: كل شهر يدخله المستخدم يخصم من المتبقي
const SALFA_ORIGINAL = 0; // غيّرها لأصل القرض بتاعك (لو عندك سلفة)
const SALFA_START = 0; // المتبقي عليك دلوقتي
const APT_ORIGINAL = 0; // غيّرها لأصل قسط الشقة/الإيجار (لو عندك)
const APT_START = 0; // المتبقي عليك دلوقتي

const GOALS_DEF = [];
const CHECK_DEF = [];

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const HC = [{
  id: "basics",
  l: "الأساسيات",
  ic: "🛒",
  c: "#3b82f6"
}, {
  id: "cleaning",
  l: "المنظفات",
  ic: "🧴",
  c: "#06b6d4"
}, {
  id: "breakfast",
  l: "الفطار",
  ic: "🍳",
  c: "#f59e0b"
}, {
  id: "meat",
  l: "لحوم وفراخ",
  ic: "🥩",
  c: "#ef4444"
}, {
  id: "kids",
  l: "الشريك / العيال",
  ic: "👶",
  c: "#8b5cf6"
}, {
  id: "mohy",
  l: "أنا",
  ic: "👨",
  c: "#10b981"
}, {
  id: "dairy",
  l: "بيض وألبان",
  ic: "🥚",
  c: "#fbbf24"
}, {
  id: "pantry",
  l: "العطارة",
  ic: "🌿",
  c: "#34d399"
}, {
  id: "house",
  l: "مستلزمات البيت",
  ic: "🏡",
  c: "#60a5fa"
}, {
  id: "outing",
  l: "خروجات وتسالي",
  ic: "🎡",
  c: "#f472b6"
}, {
  id: "health",
  l: "صحة وعلاج",
  ic: "💊",
  c: "#fb923c"
}, {
  id: "vegetables",
  l: "خضار",
  ic: "🥦",
  c: "#22c55e"
}, {
  id: "fruits",
  l: "فاكهة",
  ic: "🍎",
  c: "#f43f5e"
}, {
  id: "saving",
  l: "تحويش",
  ic: "💰",
  c: "#a78bfa"
}];
// ── تصنيفات شيت "ضحي" (مطابقة لأعمدة الشيت بالظبط)
const DC = [{
  id: "basics",
  l: "الأساسيات",
  ic: "🛒",
  c: "#3b82f6"
}, {
  id: "cleaning",
  l: "المنظفات",
  ic: "🧴",
  c: "#06b6d4"
}, {
  id: "breakfast",
  l: "الفطار",
  ic: "🍳",
  c: "#f59e0b"
}, {
  id: "meat",
  l: "اللحوم والفراخ",
  ic: "🥩",
  c: "#ef4444"
}, {
  id: "duha_self",
  l: "نفسي",
  ic: "👩",
  c: "#8b5cf6"
}, {
  id: "mohy_d",
  l: "أنا",
  ic: "👨",
  c: "#10b981"
}, {
  id: "dairy",
  l: "البيض والألبان",
  ic: "🥚",
  c: "#fbbf24"
}, {
  id: "pantry",
  l: "العطارة",
  ic: "🌿",
  c: "#34d399"
}, {
  id: "house",
  l: "مستلزمات البيت",
  ic: "🏡",
  c: "#60a5fa"
}, {
  id: "outing",
  l: "الخروجات",
  ic: "🎡",
  c: "#f472b6"
}, {
  id: "vegetables",
  l: "خضار",
  ic: "🥦",
  c: "#22c55e"
}, {
  id: "fruits",
  l: "فاكهة",
  ic: "🍎",
  c: "#f43f5e"
}, {
  id: "saving",
  l: "تحويش",
  ic: "💰",
  c: "#a78bfa"
}];
const CC = [{
  id: "fuel",
  l: "بنزين",
  ic: "⛽",
  c: "#f59e0b"
}, {
  id: "oil",
  l: "زيت وفلاتر",
  ic: "🛢️",
  c: "#fbbf24"
}, {
  id: "brakes",
  l: "فرامل",
  ic: "⚙️",
  c: "#ef4444"
}, {
  id: "engine",
  l: "موتور وميكانيكا",
  ic: "🔩",
  c: "#8b5cf6"
}, {
  id: "elec",
  l: "كهرباء",
  ic: "⚡",
  c: "#60a5fa"
}, {
  id: "tires",
  l: "كاوتش وعجل",
  ic: "🔘",
  c: "#94a3b8"
}, {
  id: "suspension",
  l: "تعليق وميزان",
  ic: "🔧",
  c: "#34d399"
}, {
  id: "other",
  l: "تاني",
  ic: "🔨",
  c: "#6b7280"
}];

// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
// ld و sv معرفين فوق في Cloud Sync section
const fmt = n => Number(n || 0).toLocaleString("ar-EG");
const MK = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const DK = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const SUM = a => a.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const PCT = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const UNKNOWN_CAT = { id: "_unknown", l: "غير مصنف", ic: "❓", c: "#64748b" };
const catF = (list, id) => list.find(c => c.id === id) || UNKNOWN_CAT;

function loadOdoLog() {
  const legacyOdo = ld("mz_car_odo_v1", 0);
  const def = legacyOdo ? { [finKey(DK())]: legacyOdo } : {};
  return ld("mz_car_odo_log_v1", def);
}
function currentKnownOdo(odoLog) {
  const vals = Object.values(odoLog || {}).map(Number).filter(v => v > 0);
  return vals.length ? Math.max(...vals) : 0;
}
// بيرجع كل بند عربية اتسجله المستخدم وحدد له "ميعاد جاي" بالكيلومتر + هل محتاجين نفكّره يسجل عداد الشهر
function computeMaintAlerts(entries) {
  const overrideIds = new Set((entries || []).filter(e => e.type === "car").map(e => e.id));
  const all = [...CAR_DATA.filter(e => !overrideIds.has(e.id)), ...(entries || []).filter(e => e.type === "car")];
  const odoLog = loadOdoLog();
  const curOdo = currentKnownOdo(odoLog);
  const mk = finKey(DK());
  const needsOdoLog = !odoLog[mk];
  const items = all.filter(e => e.dueKm && +e.dueKm > 0).map(e => ({
    id: e.id,
    label: e.note || e.name || "صيانة",
    ic: catF(CC, e.cat).ic,
    dueKm: +e.dueKm,
    left: curOdo ? +e.dueKm - curOdo : null
  })).sort((a, b) => (a.left ?? 1e9) - (b.left ?? 1e9));
  return { curOdo, mk, needsOdoLog, items };
}

const addM = (mk, n) => {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return MK(d);
};
// مفتاح "الشهر المالي" المستخدم في كل التطبيق (إندرايف، البيت/ضحي، العربية، الملخص):
// - يونيو 2026: شهر استثنائي، من 23/5/2026 لحد 25/6/2026 (شهر القبض الأول)
// - من يوليو 2026 فصاعداً: الشهر المالي يبدأ يوم 25 من كل شهر (يوم القبض)
// - يناير → مايو 2026: بالتقويم العادي كما هي (قبل تطبيق نظام يوم القبض)
const FIN_CUTOVER = "2026-05-23"; // أول تاريخ يتطبق عليه منطق الشهر المالي
const FIN_CUTOVER2 = "2026-06-25"; // من هنا فصاعداً يوم القبض بقى 25
const finKey = dateStr => {
  if (dateStr < FIN_CUTOVER) return dateStr.slice(0, 7);
  if (dateStr < FIN_CUTOVER2) return "2026-06"; // كل ما بين 23/5 و25/6 = شهر يونيو
  const [y, m, day] = dateStr.split("-").map(Number);
  const base = MK(new Date(y, m - 1, 1));
  return day >= 25 ? addM(base, 1) : base;
};
// "الشهر المالي الحالي" - بيستخدم نفس منطق finKey بالظبط (يوم القبض 25)
// ده اللي المفروض يحدد الشهر اللي يفتح بيه التطبيق تلقائي، مش MK() العادي
const currentFinMonth = () => finKey(DK());
function calcLoans(monthly) {
  // نبدأ من الأرقام الموجودة في الإكسيل مباشرة (دي بالفعل المتبقي بعد سداد يونيو)
  // ونخصم منها فقط الأشهر الجديدة اللي المستخدم بيدخلها (يوليو فصاعداً)
  let salfaRem = SALFA_START; // 393,000 (متبقي بعد يونيو)
  let aptRem = APT_START; // 349,815.91 (متبقي بعد يونيو)
  
  // نجمع كل الأشهر من يوليو لحد الشهر الحالي
  const curMk = currentFinMonth();
  let checkMk = "2026-07";
  while (checkMk <= curMk) {
    const d = monthly[checkMk] || MONTHLY_PRESET[checkMk] || {};
    salfaRem -= +(d.car_fixed || 7000);
    aptRem -= +(d.rent || 1030);
    // الشهر الجديد
    const [y, m] = checkMk.split("-").map(Number);
    const next = new Date(y, m, 1);
    checkMk = MK(next);
  }
  
  return {
    salfaRem: Math.max(0, salfaRem),
    aptRem: Math.max(0, aptRem)
  };
}

// ── حساب المتبقي من الشهر السابق (محمد + ضحي) عشان يترحل للشهر الجاي
// ده بيتحسب حي كل مرة، مش قيمة متجمدة، فبيتحدث لو عدلت أي بيانات في الشهر السابق
function calcCarryover(mk, monthly, entries, indExtra, deletedXl) {
  const dxl = deletedXl || [];
  const prevMk = addM(mk, -1);
  const prevPreset = MONTHLY_PRESET[prevMk] || {};
  const prevMonthly = monthly[prevMk] || {};
  const prevSaved = { ...prevPreset, ...prevMonthly };
  const lastSalary = (() => {
    const mks = Object.keys(monthly).filter(k => k < mk).sort().reverse();
    for (const k of mks) { if (monthly[k]?.salary > 0) return monthly[k].salary; }
    const presetMks = Object.keys(MONTHLY_PRESET).filter(k => k < mk).sort().reverse();
    for (const k of presetMks) { if (MONTHLY_PRESET[k]?.salary > 0) return MONTHLY_PRESET[k].salary; }
    return 0;
  })();
  if (!prevSaved.salary && lastSalary) prevSaved.salary = lastSalary;
  const pn = k => +(prevSaved[k] || 0);
  const prevInc = pn("salary") + pn("transport") + pn("waste") + pn("old") + pn("deals") + pn("eid") + pn("dohaa") + pn("magdy");
  const prevFix = pn("car_fixed") + pn("rent") + pn("internet") + pn("charity") + pn("mom") + pn("ajz") + pn("tahwish");
  const prevDuha = pn("home_given") || 0;
  const prevAllH = [...HOME_DATA.filter(e => !dxl.includes(e.id)), ...(entries || []).filter(e => e.type === "home")].filter(e => finKey(e.date) === prevMk);
  const prevAllD = [...DUHA_DATA, ...(entries || []).filter(e => e.type === "duha")].filter(e => finKey(e.date) === prevMk);
  const prevAllC = [...CAR_DATA, ...(entries || []).filter(e => e.type === "car")].filter(e => finKey(e.date) === prevMk);
  const prevCarDoha = SUM(prevAllC.filter(e => e.paidBy === "doha"));
  const prevCarMohy = SUM(prevAllC.filter(e => e.paidBy !== "doha" && e.paidBy !== "tahwish"));
  const prevHomeDoha = SUM(prevAllH.filter(e => e.paidBy === "doha"));
  const prevHomeMohy = SUM(prevAllH.filter(e => e.paidBy !== "doha" && e.paidBy !== "tahwish"));
  const prevDuhaMohamed = SUM(prevAllD.filter(e => e.paidBy === "mohamed"));
  const prevDuhaOwn = SUM(prevAllD.filter(e => e.paidBy !== "mohamed" && e.paidBy !== "tahwish"));
  const prevIndSum = indriveSummary(indExtra || []);
  const prevInd = prevIndSum[prevMk];
  const prevIndRev = prevInd ? prevInd.rev : 0;
  const prevIndExp = prevInd ? (prevInd.petrol||0)+(prevInd.tax||0)+(prevInd.tire||0) : 0;
  const prevTahwish = SUM((entries||[]).filter(e=>e.type==="home"&&e.cat==="saving"&&e.id&&e.id.startsWith("hn")&&finKey(e.date)===prevMk));
  const prevTotalOut = prevFix + prevDuha + prevHomeMohy + prevCarMohy + prevDuhaMohamed + prevIndExp + prevTahwish;
  const prevBalance = Math.max(0, (prevInc + prevIndRev) - prevTotalOut);
  const prevDuhaSpent = prevDuhaOwn + prevHomeDoha + prevCarDoha;
  const prevDuhaBalance = Math.max(0, prevDuha - prevDuhaSpent);
  return {
    prevBalance,
    prevDuhaBalance,
    combined: prevBalance + prevDuhaBalance
  };
}

// ── إندرايف: ملخص شهري من الداتا الخام
function indriveSummary(extra = []) {
  const all = [...IND_RAW, ...extra];
  const by = {};
  all.forEach(e => {
    const m = finKey(e.date);
    if (!by[m]) by[m] = {
      orders: 0,
      rev: 0,
      petrol: 0,
      petrol_fills: 0,
      petrol_liters: 0,
      petrol_km: 0,
      tax: 0,
      tire: 0,
      entries: []
    };
    by[m].entries.push(e);
    if (e.type === "order") {
      by[m].orders += (e.count || 1);
      by[m].rev += e.amount;
    } else if (e.type === "tax") {
      by[m].tax += e.amount;
    } else if (e.type === "tire") {
      by[m].tire += e.amount;
    } else {
      by[m].petrol += e.amount;
      by[m].petrol_fills++;
      by[m].petrol_liters += (e.liters || 0);
      by[m].petrol_km += (e.km || 0);
    }
  });
  return by;
}

// ══════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════
const T = {
  bg: "#070c16",
  card: "#0f1a2a",
  bdr: "#1a2840",
  blue: "#3b82f6",
  green: "#10b981",
  red: "#ef4444",
  orange: "#f59e0b",
  purple: "#8b5cf6"
};
const S = {
  root: {
    fontFamily: "'Cairo',sans-serif",
    background: T.bg,
    minHeight: "100vh",
    color: "#e2e8f0",
    maxWidth: 480,
    margin: "0 auto",
    paddingBottom: 78,
    direction: "rtl"
  },
  card: (b = T.bdr) => ({
    background: T.card,
    borderRadius: 13,
    padding: "13px 15px",
    marginBottom: 9,
    border: `1px solid ${b}`
  }),
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  lbl: {
    fontSize: 12,
    color: "#4a6080"
  },
  inp: {
    background: T.bg,
    border: `1px solid ${T.bdr}`,
    borderRadius: 9,
    padding: "9px 12px",
    fontSize: 14,
    color: "#e2e8f0",
    width: "100%",
    fontFamily: "'Cairo',sans-serif",
    outline: "none",
    direction: "rtl",
    marginBottom: 9
  },
  btn: (bg = T.blue, c = "#fff") => ({
    background: bg,
    color: c,
    border: "none",
    borderRadius: 10,
    padding: "11px 0",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Cairo',sans-serif",
    cursor: "pointer",
    width: "100%",
    marginTop: 4
  }),
  div: {
    height: 1,
    background: T.bdr,
    margin: "8px 0"
  },
  sub: {
    fontSize: 10,
    color: "#2a3a55",
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: 7,
    fontWeight: 700
  }
};
function Bar({
  v,
  max,
  c = T.blue,
  h = 7
}) {
  const p = PCT(v, max),
    bg = p >= 100 ? "#ef4444" : p >= 80 ? "#f59e0b" : c;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.bdr,
      borderRadius: 99,
      height: h,
      overflow: "hidden",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${p}%`,
      height: "100%",
      background: bg,
      borderRadius: 99,
      transition: "width .4s"
    }
  }));
}
function Tabs({
  tabs,
  cur,
  set,
  ac = T.blue
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      padding: "9px 13px 0"
    }
  }, tabs.map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    onClick: () => set(k),
    style: {
      flex: 1,
      padding: "7px 0",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 700,
      fontSize: 12,
      background: cur === k ? ac : T.card,
      color: cur === k ? "#fff" : "#4a6080"
    }
  }, l)));
}
function Toast({
  msg
}) {
  return msg ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 90,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1a2840",
      color: "#fff",
      borderRadius: 99,
      padding: "7px 16px",
      fontSize: 13,
      fontWeight: 700,
      zIndex: 200,
      whiteSpace: "nowrap"
    }
  }, msg) : null;
}
function Confirm({
  msg,
  onOk,
  onNo
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000c",
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.card,
      borderRadius: 14,
      padding: 22,
      width: 265,
      textAlign: "center",
      border: `1px solid ${T.bdr}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 14
    }
  }, msg), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onOk,
    style: {
      ...S.btn("#ef4444"),
      flex: 1
    }
  }, "تأكيد"), /*#__PURE__*/React.createElement("button", {
    onClick: onNo,
    style: {
      ...S.btn("#1a2840", "#94a3b8"),
      flex: 1
    }
  }, "إلغاء"))));
}
function useToast() {
  const [t, s] = useState(null);
  useEffect(() => {
    if (!t) return;
    const x = setTimeout(() => s(null), 2200);
    return () => clearTimeout(x);
  }, [t]);
  return [t, s];
}

// ══════════════════════════════════════════════════════════════
// SALARY MODAL
// ══════════════════════════════════════════════════════════════
function SalaryModal({
  mk,
  monthly,
  entries,
  indExtra,
  deletedXl,
  onSave,
  onClose
}) {
  const def = MONTHLY_PRESET[mk] || {},
    saved = monthly[mk] || {};
  const g = k => saved[k] ?? def[k] ?? 0;
  const carry = calcCarryover(mk, monthly, entries, indExtra, deletedXl);
  const oldDefault = saved.old !== undefined ? saved.old : (def.old !== undefined ? def.old : carry.combined);
  const [f, sf] = useState({
    salary: g("salary"),
    transport: g("transport"),
    waste: g("waste"),
    old: oldDefault,
    deals: g("deals"),
    eid: g("eid"),
    dohaa: g("dohaa"),
    duha_w_sal: g("duha_w_sal"),
    duha_w_sav: g("duha_w_sav"),
    magdy: g("magdy"),
    charity: g("charity") || 0,
    mom: g("mom") || 0,
    internet: g("internet") || 0,
    car_fixed: g("car_fixed") || 0,
    rent: g("rent") || 0,
    home_given: g("home_given") || 0,
    ajz: g("ajz") || 0,
    tahwish: g("tahwish") || 0
  });
  const [y, m] = mk.split("-").map(Number);
  const n = k => +(f[k] || 0);
  const inc = n("salary") + n("transport") + n("waste") + n("old") + n("deals") + n("eid") + n("dohaa") + n("magdy");
  const fix = n("car_fixed") + n("rent") + n("internet") + n("charity") + n("mom") + n("ajz") + n("tahwish");
  const rem = inc - fix - n("home_given");
  const Fld = ({
    k,
    lbl,
    note
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginBottom: 3
    }
  }, lbl, note && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#2a3a55",
      fontSize: 10,
      marginRight: 4
    }
  }, "(", note, ")")), /*#__PURE__*/React.createElement("input", {
    style: {
      ...S.inp,
      marginBottom: 0,
      border: `1px solid ${n(k) > 0 ? T.blue : T.bdr}`
    },
    type: "number",
    inputMode: "decimal",
    placeholder: "0",
    value: f[k] || "",
    onChange: e => sf(p => ({
      ...p,
      [k]: e.target.value
    }))
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "#000e",
      zIndex: 150,
      overflowY: "auto",
      direction: "rtl"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.card,
      minHeight: "100vh",
      maxWidth: 480,
      margin: "0 auto",
      padding: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: "#fff"
    }
  }, "📥 بيانات ", MONTHS[m - 1], " ", y), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#f59e0b",
      marginTop: 3
    }
  }, "⏰ من 25 ", MONTHS[m - 2 >= 0 ? m - 2 : 11], " لـ 25 ", MONTHS[m - 1])), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      background: "none",
      border: "none",
      color: "#4a6080",
      fontSize: 20,
      cursor: "pointer"
    }
  }, "✕")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#3b82f622"),
      border: "1px solid #3b82f644",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "💰 الدخل"), /*#__PURE__*/React.createElement(Fld, {
    k: "salary",
    lbl: "💰 المرتب الأساسي"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "transport",
    lbl: "🚌 بدل المواصلات"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "waste",
    lbl: "🗑️ بدل المخلفات"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "old",
    lbl: "📦 فلوس قديمة / جمعية"
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 10, color: "#4a6080", marginTop: -4, marginBottom: 9, display: "flex", justifyContent: "space-between", alignItems: "center" }
  }, /*#__PURE__*/React.createElement("span", null, "متبقي عندي ", fmt(carry.prevBalance), " + متبقي الشريك ", fmt(carry.prevDuhaBalance), " = ", fmt(carry.combined), " ج"), /*#__PURE__*/React.createElement("button", {
    onClick: () => sf(p => ({ ...p, old: carry.combined })),
    style: { background: "none", border: "none", color: T.blue, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }
  }, "🔄 تحديث")), /*#__PURE__*/React.createElement(Fld, {
    k: "deals",
    lbl: "🤝 صفقات"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "eid",
    lbl: "🎁 عيدية / مكافأة"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "magdy",
    lbl: "👤 من مجدي"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      borderTop: `1px solid ${T.bdr}`,
      paddingTop: 8,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "إجمالي الدخل"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 900,
      color: T.green
    }
  }, fmt(inc), " ج"))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#ef444422"),
      border: "1px solid #ef444433",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🔒 الثوابت"), /*#__PURE__*/React.createElement(Fld, {
    k: "car_fixed",
    lbl: "🚗 قسط العربية",
    note: "يخصم من السلفة"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "rent",
    lbl: "🏠 قسط الشقة / الإيجار",
    note: "يخصم من قسط الشقة"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "internet",
    lbl: "📡 الإنترنت"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "charity",
    lbl: "🤲 الصدقات والحصري"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "mom",
    lbl: "👩 أمي"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "ajz",
    lbl: "📉 عجز"
  }), /*#__PURE__*/React.createElement(Fld, {
    k: "tahwish",
    lbl: "💰 تحويش"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      borderTop: `1px solid ${T.bdr}`,
      paddingTop: 8,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "إجمالي الثوابت"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: T.red
    }
  }, fmt(fix), " ج"))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card(rem >= 0 ? "#10b98133" : "#ef444433"),
      border: `2px solid ${rem >= 0 ? T.green : T.red}`,
      textAlign: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: rem >= 0 ? T.green : T.red,
      marginBottom: 3
    }
  }, rem >= 0 ? "✅ ميزانية الأكل والبيت" : "⚠️ عجز"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 26,
      fontWeight: 900,
      color: rem >= 0 ? T.green : T.red
    }
  }, fmt(Math.abs(rem)), " ج"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#4a6080",
      marginTop: 3
    }
  }, "دخل ", fmt(inc), " − ثوابت ", fmt(fix))), /*#__PURE__*/React.createElement("button", {
    style: S.btn(T.green),
    onClick: () => onSave(mk, {
      ...f
    })
  }, "💾 حفظ بيانات الشهر")));
}

// ══════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════
function CategoryScreen({
  entries,
  onAdd,
  onDel,
  mk,
  monthly,
  initialView,
  onConsumeInitialView,
  dataSource,
  categories: baseCategories,
  entryType,
  idPrefix,
  headerLabel,
  budgetKey,
  budgetLabel,
  defaultBudget,
  addTitle,
  noBudget,
  extraEntries
}) {
  const [expandedCat, setExpandedCat] = useState(null);
  const [customCats, setCustomCats] = useState(() => ld("mz_custom_cats_" + entryType, []));
  useEffect(() => sv("mz_custom_cats_" + entryType, customCats), [customCats]);
  const categories = useMemo(() => [...baseCategories, ...customCats], [baseCategories, customCats]);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const addCustomCat = () => {
    const name = newCatName.trim();
    if (!name) return;
    const newCat = { id: "custom_" + Date.now(), l: name, ic: "🏷️", c: "#94a3b8" };
    setCustomCats(p => [...p, newCat]);
    sf(f => ({ ...f, cat: newCat.id }));
    setNewCatName("");
    setAddingCat(false);
  };
  const [form, sf] = useState({
    amount: "",
    cat: baseCategories[0].id,
    note: "",
    date: DK(),
    tahwishAmt: "",
    paidBy: entryType === "duha" ? "doha" : "mohamed"
  });
  const [toast, setT] = useToast();
  const [del, setD] = useState(null);
  const [view, sv2] = useState(initialView || "today");
  useEffect(() => {
    if (initialView) {
      sv2(initialView);
      if (onConsumeInitialView) onConsumeInitialView();
    }
  }, [initialView]);
  const all = [...dataSource, ...entries.filter(e => e.type === entryType), ...(extraEntries || [])].sort((a, b) => b.date.localeCompare(a.date));
  const month = all.filter(e => finKey(e.date) === mk);
  const today = all.filter(e => e.date === DK());
  const saved = monthly[mk] || MONTHLY_PRESET[mk] || {};
  const budget = +(saved[budgetKey] || defaultBudget);
  const mTot = SUM(month),
    tTot = SUM(today),
    rem = budget - mTot;
  const bycat = useMemo(() => categories.map(c => ({
    ...c,
    total: SUM(month.filter(e => e.cat === c.id))
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total), [month, categories]);
  const [filterDate, setFD] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const allMonthEntries = [...month];
  const shownEntries = allMonthEntries.filter(e => {
    const dateOk = !filterDate || e.date === filterDate;
    const q = searchQ.trim().toLowerCase();
    const searchOk = !q || (e.note||"").toLowerCase().includes(q) || (e.name||"").toLowerCase().includes(q);
    return dateOk && searchOk;
  });
  const shownTot = SUM(shownEntries);
  const doAdd = () => {
    const a = parseFloat(form.amount);
    const ta = parseFloat(form.tahwishAmt);
    const hasA = a && a > 0;
    const hasTa = ta && ta > 0;
    if (!hasA && !hasTa) {
      setT("ادخل مبلغ");
      return;
    }
    if (hasA) {
      onAdd({
        id: `${idPrefix}${Date.now()}`,
        type: entryType,
        amount: a,
        cat: form.cat,
        note: form.note.trim(),
        date: form.date,
        paidBy: form.paidBy
      });
    }

    sf(f => ({
      ...f,
      amount: "",
      note: "",
      tahwishAmt: "",
      paidBy: entryType === "duha" ? "doha" : "mohamed"
    }));
    setT("✅ اتضاف");
    sv2("month");
  };
  const isNew = id => {
    const sid = String(id);
    if (sid.startsWith(idPrefix)) return true;
    // Allow deleting xl entries after June 21 (may duplicate phone entries)
    if (sid.startsWith("xl")) {
      const entry = [...dataSource].find(e => e.id === sid);
      if (entry && entry.date > "2026-06-21") return true;
    }
    return false;
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Tabs, {
    tabs: [["today", "النهارده"], ["add", "➕ أضف"], ["month", "الشهر"], ["stats", "📊 تحليل"]],
    cur: view,
    set: sv2
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, noBudget ? /*#__PURE__*/React.createElement("div", {
    style: S.row
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, headerLabel, " — ", MONTHS[+mk.split("-")[1] - 1]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: T.orange
    }
  }, fmt(mTot), " ج")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, headerLabel, " — ", MONTHS[+mk.split("-")[1] - 1]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: mTot > budget ? T.red : T.orange
    }
  }, fmt(mTot), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(Bar, {
    v: mTot,
    max: budget
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: rem < 0 ? T.red : T.green,
      whiteSpace: "nowrap"
    }
  }, rem < 0 ? "زيادة " + fmt(-rem) : fmt(rem) + " متبقي", " ج")), /*#__PURE__*/React.createElement("div", {
    style: S.row
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, budgetLabel), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: T.blue
    }
  }, fmt(budget), " ج")))), view === "today" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "النهارده — ", fmt(tTot), " ج (", today.length, ")"), today.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#2a3a55",
      fontSize: 12,
      textAlign: "center",
      padding: "20px 0"
    }
  }, "مفيش مصاريف النهارده"), today.map(e => {
    const c = e.type === "car" ? catF(CC, e.cat) : catF(categories, e.cat);
    return /*#__PURE__*/React.createElement("div", {
      key: e.id,
      style: {
        display: "flex",
        justifyContent: "space-between",
        padding: "9px 0",
        borderBottom: `1px solid ${T.bdr}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18
      }
    }, c.ic), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        fontWeight: 700
      }
    }, e.note || e.name || c.l), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#4a6080"
      }
    }, c.l, e.paidBy === "tahwish" ? " · 💰 من التحويش" : ""))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: c.c
      }
    }, fmt(e.amount), " ج"), isNew(e.id) && /*#__PURE__*/React.createElement("button", {
      onClick: () => setD(e.id),
      style: {
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#4a6080",
        fontSize: 13
      }
    }, "🗑️")));
  })), view === "add" && /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, addTitle), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: "المبلغ",
    inputMode: "decimal",
    value: form.amount,
    onChange: e => sf(f => ({
      ...f,
      amount: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 4,
      marginBottom: 9
    }
  }, categories.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    onClick: () => sf(f => ({
      ...f,
      cat: c.id
    })),
    style: {
      background: form.cat === c.id ? c.c + "33" : T.bg,
      border: `1.5px solid ${form.cat === c.id ? c.c : T.bdr}`,
      borderRadius: 8,
      padding: "7px 2px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17
    }
  }, c.ic), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: form.cat === c.id ? c.c : "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 700,
      textAlign: "center"
    }
  }, c.l))), /*#__PURE__*/React.createElement("button", {
    key: "add-cat",
    onClick: () => setAddingCat(true),
    style: {
      background: T.bg,
      border: `1.5px dashed ${T.bdr}`,
      borderRadius: 8,
      padding: "7px 2px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 17, color: "#4a6080" }
  }, "➕"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 700,
      textAlign: "center"
    }
  }, "إضافة"))), addingCat && /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 6, marginBottom: 9 }
  }, /*#__PURE__*/React.createElement("input", {
    style: { ...S.inp, marginBottom: 0, flex: 1 },
    type: "text",
    placeholder: "اسم البند الجديد",
    value: newCatName,
    autoFocus: true,
    onChange: e => setNewCatName(e.target.value),
    onKeyDown: e => { if (e.key === "Enter") addCustomCat(); }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addCustomCat,
    style: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 9, padding: "0 14px", fontFamily: "'Cairo',sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer" }
  }, "✓"), /*#__PURE__*/React.createElement("button", {
    onClick: () => { setAddingCat(false); setNewCatName(""); },
    style: { background: "none", color: "#4a6080", border: "none", borderRadius: 9, padding: "0 10px", fontFamily: "'Cairo',sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }
  }, "✕")), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "date",
    value: form.date,
    onChange: e => sf(f => ({
      ...f,
      date: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "text",
    placeholder: "ملاحظة (اختياري)",
    value: form.note,
    onChange: e => {
      const v = e.target.value;
      const autoCat = (() => {
        const t = v.toLowerCase();
        if (/بيض|بيضه|بيضتين|ألبان|لبن|جبنه|جبن|زبادي|زبده/.test(t)) return "dairy";
        if (/فراخ|دجاج|لحم|لحمه|لحوم|كباب|كفته|سمك/.test(t)) return "meat";
        if (/عيش|فول|فلافل|طعميه|بليلة|فطار|كيك|بسكويت|شيبسي|بسكويته|باتيه|سندوتش/.test(t)) return "breakfast";
        if (/منظف|صابون|جلاية|ملابس|غسيل|مكنسه|مسحوق/.test(t)) return "cleaning";
        if (/خضار|طماطم|بطاطس|موز|فاكهه|فاكهة|برتقال|تفاح/.test(t)) return "pantry";
        if (/دوا|دواء|علاج|صيدليه|كشف|مستشفي/.test(t)) return "health";
        if (/خروج|كافيه|مطعم|تسالي|لعبه/.test(t)) return "outing";
        if (/مياه|زيت|عدس|أرز|ارز|سكر|ملح|معكرونه|عجينه/.test(t)) return "basics";
        return null;
      })();
      sf(f => ({ ...f, note: v, ...(autoCat ? {cat: autoCat} : {}) }));
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 11, color: "#4a6080", marginBottom: 6, fontWeight: 700 }
  }, "هيتخصم منين؟"), /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 7, marginBottom: 9 }
  }, [
    { v: "mohamed", l: "💳 الدخل العادي", clr: "#3b82f6" },
    { v: "tahwish", l: "💰 من التحويش", clr: "#8b5cf6" }
  ].map(o => /*#__PURE__*/React.createElement("button", {
    key: o.v,
    onClick: () => sf(f => ({ ...f, paidBy: o.v })),
    style: {
      flex: 1,
      background: form.paidBy === o.v ? o.clr + "33" : T.bg,
      border: `1.5px solid ${form.paidBy === o.v ? o.clr : T.bdr}`,
      borderRadius: 9,
      padding: "9px 4px",
      cursor: "pointer",
      color: form.paidBy === o.v ? o.clr : "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 12,
      fontWeight: 700
    }
  }, o.l))), /*#__PURE__*/React.createElement("button", {
    style: S.btn(),
    onClick: doAdd
  }, "إضافة ✓")), view === "month" && /*#__PURE__*/React.createElement(React.Fragment, null,
  // ── Category bars summary
  /*#__PURE__*/React.createElement("div", {style:S.sub}, "حسب التصنيف"),
  bycat.map(c => /*#__PURE__*/React.createElement("div", {key:c.id, style:{marginBottom:9}},
    /*#__PURE__*/React.createElement("div", {style:{display:"flex",justifyContent:"space-between",marginBottom:3}},
      /*#__PURE__*/React.createElement("span", {style:{fontSize:12}}, c.ic, " ", c.l),
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:5,alignItems:"center"}},
        /*#__PURE__*/React.createElement(Bar, {v:c.total, max:mTot, c:c.c, h:5}),
        /*#__PURE__*/React.createElement("span", {style:{fontSize:11,fontWeight:700,color:c.c,whiteSpace:"nowrap"}}, fmt(c.total), " ج")
      )
    )
  )),
  /*#__PURE__*/React.createElement("div", {style:S.div}),
  // ── Search + date filter bar
  /*#__PURE__*/React.createElement("div", {style:{display:"flex",alignItems:"center",gap:5,marginBottom:8}},
    /*#__PURE__*/React.createElement("span", {style:{fontSize:12,fontWeight:700,color:"#4a6080",whiteSpace:"nowrap"}},
      filterDate || searchQ ? fmt(shownTot)+" ج ("+shownEntries.length+")" : "كل المصاريف ("+month.length+")"
    ),
    /*#__PURE__*/React.createElement("input", {
      type:"text", placeholder:"🔍 ابحث...", value:searchQ,
      onChange: e => setSearchQ(e.target.value),
      style:{flex:1,background:T.card,border:`1px solid ${searchQ?"#60a5fa":T.bdr}`,borderRadius:7,color:searchQ?"#60a5fa":"#e2e8f0",fontSize:11,padding:"4px 7px",fontFamily:"'Cairo',sans-serif",outline:"none",direction:"rtl"}
    }),
    /*#__PURE__*/React.createElement("input", {
      type:"date", value:filterDate, onChange:e=>setFD(e.target.value),
      style:{background:T.card,border:`1px solid ${filterDate?T.blue:T.bdr}`,borderRadius:6,color:filterDate?T.blue:"#4a6080",fontSize:10,padding:"3px 5px",fontFamily:"'Cairo',sans-serif"}
    }),
    (filterDate||searchQ) && /*#__PURE__*/React.createElement("button", {
      onClick:()=>{setFD("");setSearchQ("");},
      style:{background:"none",border:"none",cursor:"pointer",color:"#4a6080",fontSize:13,padding:0}
    }, "✕")
  ),
  // ── Entries list (same style as today tab)
  shownEntries.map(e => {
    const c = e.type === "car" ? catF(CC, e.cat) : catF(categories, e.cat);
    return /*#__PURE__*/React.createElement("div", {
      key:e.id,
      style:{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${T.bdr}`}
    },
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:8}},
        /*#__PURE__*/React.createElement("span", {style:{fontSize:18}}, c.ic),
        /*#__PURE__*/React.createElement("div", null,
          /*#__PURE__*/React.createElement("div", {style:{fontSize:12,fontWeight:700}}, e.note||e.name||c.l),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:"#4a6080"}}, c.l, e.paidBy === "tahwish" ? " · 💰 من التحويش" : "")
        )
      ),
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",gap:8,alignItems:"center"}},
        /*#__PURE__*/React.createElement("div", {style:{textAlign:"left"}},
          /*#__PURE__*/React.createElement("div", {style:{fontSize:12,fontWeight:700,color:c.c}}, fmt(e.amount), " ج"),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:9,color:"#4a6080"}}, e.date)
        ),
        isNew(e.id) && /*#__PURE__*/React.createElement("button", {
          onClick:()=>setD(e.id),
          style:{background:"none",border:"none",cursor:"pointer",color:"#4a6080",fontSize:13}
        }, "🗑️")
      )
    );
  })), view === "stats" && /*#__PURE__*/React.createElement(React.Fragment, null,
  /*#__PURE__*/React.createElement("div", {style:S.sub}, "📊 تحليل الأصناف — ", MONTHS[+mk.split("-")[1]-1]),
  // ── Category breakdown for this month
  (() => {
    const catStats = categories.map(c => {
      const items = month.filter(e => e.cat === c.id);
      return { ...c, total: SUM(items), count: items.length, items };
    }).filter(c => c.total > 0).sort((a,b) => b.total - a.total);
    if (catStats.length === 0) return /*#__PURE__*/React.createElement("div", {style:{color:"#4a6080",textAlign:"center",padding:20}}, "مفيش مصاريف الشهر ده");
    const maxT = catStats[0].total;
    return /*#__PURE__*/React.createElement(React.Fragment, null,
      // Summary header
      /*#__PURE__*/React.createElement("div", {style:{display:"flex",justifyContent:"space-between",background:"#0f1a2a",borderRadius:10,padding:"10px 14px",marginBottom:10,border:"1px solid #1a2840"}},
        /*#__PURE__*/React.createElement("div", null,
          /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:"#4a6080"}}, "إجمالي الشهر"),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:18,fontWeight:900,color:"#60a5fa"}}, fmt(mTot), " ج")
        ),
        /*#__PURE__*/React.createElement("div", {style:{textAlign:"left"}},
          /*#__PURE__*/React.createElement("div", {style:{fontSize:10,color:"#4a6080"}}, "عدد العمليات"),
          /*#__PURE__*/React.createElement("div", {style:{fontSize:18,fontWeight:900,color:"#a78bfa"}}, month.length)
        )
      ),
      // Category cards
      catStats.map(c =>
        /*#__PURE__*/React.createElement("div", {key:c.id, style:{background:"#0f1a2a",borderRadius:10,padding:"11px 13px",marginBottom:7,border:`1px solid ${c.c}33`}},
          /*#__PURE__*/React.createElement("div", {style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
            /*#__PURE__*/React.createElement("div", {style:{display:"flex",alignItems:"center",gap:6}},
              /*#__PURE__*/React.createElement("span", {style:{fontSize:18}}, c.ic),
              /*#__PURE__*/React.createElement("span", {style:{fontSize:13,fontWeight:700,color:"#e2e8f0"}}, c.l)
            ),
            /*#__PURE__*/React.createElement("div", {style:{textAlign:"left"}},
              /*#__PURE__*/React.createElement("div", {style:{fontSize:14,fontWeight:900,color:c.c}}, fmt(c.total), " ج"),
              /*#__PURE__*/React.createElement("div", {style:{fontSize:9,color:"#4a6080"}}, c.count, " عملية — متوسط ", fmt(Math.round(c.total/c.count)), " ج")
            )
          ),
          // Progress bar
          /*#__PURE__*/React.createElement("div", {style:{height:5,background:"#1a2840",borderRadius:99,marginBottom:6}},
            /*#__PURE__*/React.createElement("div", {style:{height:5,borderRadius:99,background:c.c,width:Math.round(c.total/maxT*100)+"%",transition:"width 0.3s"}})
          ),
          // Individual entries for this category this month
          /*#__PURE__*/React.createElement("div", {style:{marginTop:4}},
            c.items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0, expandedCat===c.id ? c.items.length : 5).map((e,i) =>
              /*#__PURE__*/React.createElement("div", {key:e.id, style:{display:"flex",justifyContent:"space-between",padding:"3px 0",borderTop:i===0?"none":`1px solid #1a2840`}},
                /*#__PURE__*/React.createElement("span", {style:{fontSize:10,color:"#94a3b8"}}, e.note||e.name||c.l, " ", /*#__PURE__*/React.createElement("span",{style:{color:"#2a3a55"}}, e.date.slice(5))),
                /*#__PURE__*/React.createElement("span", {style:{fontSize:10,fontWeight:700,color:c.c}}, fmt(e.amount), " ج")
              )
            ),
            c.items.length > 5 && /*#__PURE__*/React.createElement("div", {
              onClick: () => setExpandedCat(expandedCat===c.id ? null : c.id),
              style:{fontSize:9,color:"#60a5fa",textAlign:"center",paddingTop:4,cursor:"pointer",fontWeight:700}
            }, expandedCat===c.id ? "▲ عرض أقل" : `+ ${c.items.length-5} عملية أخرى`)
          )
        )
      ),
      // ── تحليل حسب الصنف: كل صنف اتكرر، اتشرى كام مرة وبكام
      (() => {
        const byName = {};
        month.forEach(e => {
          const key = (e.note || e.name || "").trim();
          if (!key) return;
          if (!byName[key]) byName[key] = { name: key, count: 0, total: 0 };
          byName[key].count++;
          byName[key].total += e.amount;
        });
        const items = Object.values(byName).filter(x => x.count > 1).sort((a,b) => b.total - a.total);
        if (!items.length) return null;
        return /*#__PURE__*/React.createElement(React.Fragment, null,
          /*#__PURE__*/React.createElement("div", {style:{...S.sub, marginTop:14}}, "🔍 اشتريت إيه أكتر من مرة"),
          /*#__PURE__*/React.createElement("div", {style:{background:"#0f1a2a",borderRadius:10,padding:"11px 13px",border:"1px solid #1a2840"}},
            items.map((it, i) =>
              /*#__PURE__*/React.createElement("div", {key:it.name, style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:i===0?"none":"1px solid #1a2840"}},
                /*#__PURE__*/React.createElement("span", {style:{fontSize:12,color:"#e2e8f0"}}, it.name, " ", /*#__PURE__*/React.createElement("span",{style:{fontSize:10,color:"#60a5fa",fontWeight:700}}, "× ", it.count)),
                /*#__PURE__*/React.createElement("span", {style:{fontSize:12,fontWeight:700,color:"#a78bfa"}}, fmt(it.total), " ج")
              )
            )
          )
        );
      })()
    );
  })()
), del && /*#__PURE__*/React.createElement(Confirm, {
    msg: "تحذف المصروف ده؟",
    onOk: () => {
      onDel(del);
      setD(null);
      setT("🗑️ اتحذف");
    },
    onNo: () => setD(null)
  }), /*#__PURE__*/React.createElement(Toast, {
    msg: toast
  })));
}

// ══════════════════════════════════════════════════════════════
// CAR SCREEN
// ══════════════════════════════════════════════════════════════
function CarScreen({
  entries,
  onAdd,
  onDel,
  onUpdate,
  mk
}) {
  const [form, sf] = useState({
    amount: "",
    cat: "oil",
    note: "",
    date: DK(),
    paidBy: "mohamed",
    dueKm: "",
    liters: "",
    km: ""
  });
  const [toast, setT] = useToast();
  const [del, setD] = useState(null);
  const [view, sv2] = useState("list");
  const [flt, setF] = useState("all");
  const [scope, setScope] = useState("month");
  const CAR_NEEDS_DEFAULT = [];
  const [carNeeds,setCarNeeds] = useState(()=>ld("mz_car_needs_v2", CAR_NEEDS_DEFAULT));
  const [newNeed,setNewNeed] = useState("");
  useEffect(()=>sv("mz_car_needs_v2",carNeeds),[carNeeds]);
  const all = useMemo(() => {
    const overrideIds = new Set(entries.filter(e => e.type === "car").map(e => e.id));
    return [...CAR_DATA.filter(e => !overrideIds.has(e.id)), ...entries.filter(e => e.type === "car")].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);
  const [odoLog, setOdoLog] = useState(() => loadOdoLog());
  useEffect(() => sv("mz_car_odo_log_v1", odoLog), [odoLog]);
  const [odoInput, setOdoInput] = useState("");
  const [editDue, setEditDue] = useState(null); // id of entry being edited for due-km
  const [editDueVal, setEditDueVal] = useState("");
  const [notifPermission, setNotifPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const curOdo = currentKnownOdo(odoLog);
  const dueList = useMemo(() => all.filter(e => e.dueKm && +e.dueKm > 0).map(e => ({
    id: e.id,
    label: e.note || e.name || "صيانة",
    ic: catF(CC, e.cat).ic,
    dueKm: +e.dueKm,
    left: curOdo ? +e.dueKm - curOdo : null
  })).sort((a, b) => (a.left ?? 1e9) - (b.left ?? 1e9)), [all, curOdo]);
  const thisMk = finKey(DK());
  const needsOdoLog = !odoLog[thisMk];
  const saveOdo = () => {
    const v = parseFloat(odoInput);
    if (!v) return;
    setOdoLog(p => ({ ...p, [thisMk]: v }));
    setOdoInput("");
  };
  const saveDue = id => {
    const v = parseFloat(editDueVal);
    onUpdate(id, { dueKm: v || null });
    setEditDue(null);
    setEditDueVal("");
  };
  const mCar = all.filter(e => finKey(e.date) === mk);
  const mShown = flt === "all" ? mCar : mCar.filter(e => e.cat === flt);
  const shown = flt === "all" ? all : all.filter(e => e.cat === flt);
  const tAll = SUM(all), tMon = SUM(mCar);
  const byY = {};
  all.forEach(e => { const y = e.date.slice(0, 4); byY[y] = (byY[y]||0) + e.amount; });
  const byMon = {};
  all.forEach(e => { const m2=finKey(e.date); if(!byMon[m2]){byMon[m2]={total:0,cnt:0};} byMon[m2].total+=e.amount; byMon[m2].cnt++; });
  const MN = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const doAdd = () => {
    const a = parseFloat(form.amount);
    if (!a || a <= 0) {
      setT("ادخل مبلغ");
      return;
    }
    onAdd({
      id: `cn${Date.now()}`,
      type: "car",
      amount: a,
      cat: form.cat,
      note: form.note.trim(),
      date: form.date,
      paidBy: form.paidBy,
      dueKm: parseFloat(form.dueKm) || null,
      liters: form.cat === "fuel" ? (parseFloat(form.liters) || null) : null,
      km: form.cat === "fuel" ? (parseFloat(form.km) || null) : null
    });
    sf(f => ({
      ...f,
      amount: "",
      note: "",
      paidBy: "mohamed",
      dueKm: "",
      liters: "",
      km: ""
    }));
    setT("✅ اتضاف");
    sv2("list");
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Tabs, {
    tabs: [["list", "السجل"], ["add", "➕"], ["needs", "احتياجات"], ["stats", "تقرير"]],
    cur: view,
    set: sv2,
    ac: "#8b5cf6"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#8b5cf622"),
      flex: 1,
      textAlign: "center",
      border: "1px solid #8b5cf644"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#8b5cf6",
      marginBottom: 1
    }
  }, "هذا الشهر"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 900,
      color: "#a78bfa"
    }
  }, fmt(tMon), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card(),
      flex: 1,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#4a6080",
      marginBottom: 1
    }
  }, "كل الفترة (سبتمبر 2025→)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 900,
      color: "#64748b"
    }
  }, fmt(tAll), " ج"))), view === "list" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: needsOdoLog ? "#f59e0b22" : "#0f1a2a",
      border: `1.5px solid ${needsOdoLog ? "#f59e0b88" : "#1a2840"}`,
      borderRadius: 13,
      padding: "11px 13px",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 5 }
  }, needsOdoLog ? "🔔 دخلنا شهر جديد! سجّل عداد العربية" : "📟 عداد العربية"), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 10, color: "#4a6080", marginBottom: 8 }
  }, curOdo > 0 ? `آخر قراءة معروفة: ${fmt(curOdo)} كم` : "لسه معندناش أي قراءة"), /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 7 }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "numeric",
    placeholder: needsOdoLog ? "اكتب عداد الشهر ده..." : "تحديث العداد",
    value: odoInput,
    onChange: e => setOdoInput(e.target.value),
    style: { ...S.inp, marginBottom: 0, flex: 1 }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: saveOdo,
    style: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 9, padding: "0 16px", fontFamily: "'Cairo',sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer" }
  }, "حفظ")), notifPermission !== "granted" && /*#__PURE__*/React.createElement("button", {
    onClick: () => Notification.requestPermission().then(setNotifPermission),
    style: { background: "none", border: "none", color: "#60a5fa", fontSize: 10, fontWeight: 700, cursor: "pointer", marginTop: 8, fontFamily: "'Cairo',sans-serif", padding: 0 }
  }, "🔔 فعّل تنبيهات المتصفح عشان تيجيلك رسالة")), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }
  }, "🔔 المواعيد الجاية"), dueList.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 11, color: "#4a6080", marginBottom: 10, background: "#0f1a2a", border: "1px solid #1a2840", borderRadius: 13, padding: "12px 13px" }
  }, "مفيش أي بند محدد له ميعاد جاي. لما تضيف صيانة، املا خانة \"🎯 الميعاد الجاي عند (كم)\" وهيتحط عليه تنبيه هنا أوتوماتيك.") : /*#__PURE__*/React.createElement("div", {
    style: { background: "#0f1a2a", border: "1px solid #1a2840", borderRadius: 13, padding: "11px 13px", marginBottom: 10 }
  }, dueList.map((it, i) => {
    const color = it.left === null ? "#4a6080" : it.left <= 0 ? "#ef4444" : it.left <= 1000 ? "#f59e0b" : "#10b981";
    const isEditing = editDue === it.id;
    return /*#__PURE__*/React.createElement("div", {
      key: it.id,
      style: { paddingBottom: 10, marginBottom: 10, borderBottom: i < dueList.length - 1 ? "1px solid #1a2840" : "none" }
    }, /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }
    }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 12, fontWeight: 700, flex: 1 } }, it.ic, " ", it.label), it.left !== null && /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 11, fontWeight: 700, color, whiteSpace: "nowrap" }
    }, it.left <= 0 ? `⚠️ متأخر ${fmt(Math.abs(it.left))} كم` : `باقي ${fmt(it.left)} كم`), /*#__PURE__*/React.createElement("button", {
      onClick: () => { setEditDue(isEditing ? null : it.id); setEditDueVal(isEditing ? "" : String(it.dueKm)); },
      style: { background: "none", border: "none", cursor: "pointer", color: "#4a6080", fontSize: 13, padding: "0 2px" }
    }, "✏️")), isEditing && /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", gap: 6, marginTop: 6 }
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      inputMode: "numeric",
      value: editDueVal,
      onChange: e => setEditDueVal(e.target.value),
      style: { ...S.inp, marginBottom: 0, flex: 1, fontSize: 12 }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => saveDue(it.id),
      style: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }
    }, "حفظ")), it.left !== null && !isEditing && /*#__PURE__*/React.createElement(Bar, {
      v: curOdo ? Math.max(0, curOdo - (it.dueKm - 7000)) : 0,
      max: 7000,
      c: color,
      h: 5
    }));
  })), (() => {
    const fuelEntries = all.filter(e => e.cat === "fuel" && e.liters && e.km);
    const mFuel = fuelEntries.filter(e => finKey(e.date) === mk);
    if (!mFuel.length) return null;
    const mLiters = mFuel.reduce((s, e) => s + (e.liters || 0), 0);
    const mKm = mFuel.reduce((s, e) => s + (e.km || 0), 0);
    const mRate = mLiters > 0 ? mKm / mLiters : 0;
    return /*#__PURE__*/React.createElement("div", {
      style: { background: "#10b98122", border: "1px solid #10b98144", borderRadius: 13, padding: "11px 13px", marginBottom: 10 }
    }, /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 6 }
    }, "⛽ معدل استهلاك البنزين — الشهر ده"), /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between" }
    }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: "#8fa3c4" } }, "المتوسط"), /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 14, fontWeight: 900, color: T.green }
    }, mRate.toFixed(1), " كم/لتر")));
  })(), scope === "all" && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "#8b5cf622",
      border: "1px solid #8b5cf644",
      borderRadius: 10,
      padding: "7px 11px",
      marginBottom: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 11, color: "#a78bfa", fontWeight: 700 }
  }, "🕐 عرض كل الفترة"), /*#__PURE__*/React.createElement("button", {
    onClick: () => { setScope("month"); setF("all"); },
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#a78bfa",
      fontSize: 11,
      fontWeight: 700,
      textDecoration: "underline"
    }
  }, "رجوع لهذا الشهر")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 3,
      marginBottom: 9,
      overflowX: "auto",
      paddingBottom: 2
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => { setF("all"); setScope("month"); },
    style: {
      borderRadius: 99,
      border: "none",
      padding: "4px 9px",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 10,
      fontWeight: 700,
      cursor: "pointer",
      background: flt === "all" && scope === "month" ? "#8b5cf6" : T.card,
      color: flt === "all" && scope === "month" ? "#fff" : "#4a6080",
      whiteSpace: "nowrap"
    }
  }, "هذا الشهر (", mCar.length, ")"), /*#__PURE__*/React.createElement("button", {
    onClick: () => { setF("all"); setScope("all"); },
    style: {
      borderRadius: 99,
      border: "none",
      padding: "4px 9px",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 10,
      fontWeight: 700,
      cursor: "pointer",
      background: flt === "all" && scope === "all" ? "#8b5cf6" : T.card,
      color: flt === "all" && scope === "all" ? "#fff" : "#4a6080",
      whiteSpace: "nowrap"
    }
  }, "كل الفترة (", all.length, ")"), CC.map(c => {
    const n = (scope === "all" ? all : mCar).filter(e => e.cat === c.id).length;
    if (!n) return null;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      onClick: () => setF(c.id),
      style: {
        borderRadius: 99,
        border: "none",
        padding: "4px 9px",
        fontFamily: "'Cairo',sans-serif",
        fontSize: 10,
        fontWeight: 700,
        cursor: "pointer",
        background: flt === c.id ? c.c : T.card,
        color: flt === c.id ? "#fff" : "#4a6080",
        whiteSpace: "nowrap"
      }
    }, c.ic, " ", c.l, " (", n, ")");
  })), (scope === "all" ? shown : mShown).length===0&&/*#__PURE__*/React.createElement("div",{style:{color:"#2a3a55",fontSize:12,textAlign:"center",padding:"20px 0"}}, scope === "all" ? "مفيش عمليات في التصنيف ده" : "مفيش صيانة هذا الشهر"), (scope === "all" ? shown : mShown).map(e => {
    const c = catF(CC, e.cat);
    const isEditingRow = editDue === e.id;
    const rowDiv = /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        padding: "9px 0",
        borderBottom: isEditingRow ? "none" : `1px solid ${T.bdr}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", gap: 8 }
    }, /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 18 }
    }, c.ic), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 12, fontWeight: 700 }
    }, e.name || e.note), /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 10, color: "#4a6080" }
    }, e.date, e.km ? ` · ${e.km} كم` : "", e.note ? ` · ${e.note}` : "", e.paidBy === "tahwish" ? " · 💰 من التحويش" : "", e.dueKm ? ` · 🎯 الميعاد الجاي ${fmt(e.dueKm)} كم` : ""))), /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", gap: 7, alignItems: "center" }
    }, /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 12, fontWeight: 700, color: c.c }
    }, fmt(e.amount), " ج"), /*#__PURE__*/React.createElement("button", {
      onClick: () => { setEditDue(isEditingRow ? null : e.id); setEditDueVal(isEditingRow ? "" : String(e.dueKm || "")); },
      style: { background: "none", border: "none", cursor: "pointer", color: e.dueKm ? "#a78bfa" : "#4a6080", fontSize: 12 }
    }, "🎯"), String(e.id).startsWith("cn") && /*#__PURE__*/React.createElement("button", {
      onClick: () => setD(e.id),
      style: { background: "none", border: "none", cursor: "pointer", color: "#4a6080", fontSize: 12 }
    }, "🗑️")));
    const editDiv = isEditingRow ? /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", gap: 6, padding: "0 0 9px 0", borderBottom: `1px solid ${T.bdr}` }
    }, /*#__PURE__*/React.createElement("input", {
      type: "number",
      inputMode: "numeric",
      placeholder: "الميعاد الجاي عند (كم)",
      value: editDueVal,
      onChange: ev => setEditDueVal(ev.target.value),
      style: { ...S.inp, marginBottom: 0, flex: 1, fontSize: 12 }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => saveDue(e.id),
      style: { background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }
    }, "حفظ")) : null;
    return /*#__PURE__*/React.createElement(React.Fragment, { key: e.id }, rowDiv, editDiv);
  })), view === "add" && /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "إضافة صيانة"), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: "المبلغ",
    inputMode: "decimal",
    value: form.amount,
    onChange: e => sf(f => ({
      ...f,
      amount: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: 4,
      marginBottom: 9
    }
  }, CC.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.id,
    onClick: () => sf(f => ({
      ...f,
      cat: c.id
    })),
    style: {
      background: form.cat === c.id ? c.c + "33" : T.bg,
      border: `1.5px solid ${form.cat === c.id ? c.c : T.bdr}`,
      borderRadius: 8,
      padding: "7px 2px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17
    }
  }, c.ic), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: form.cat === c.id ? c.c : "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 700
    }
  }, c.l)))), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "date",
    value: form.date,
    onChange: e => sf(f => ({
      ...f,
      date: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "text",
    placeholder: "التفاصيل مثلاً: تغير زيت ليكومولي 10 الالف",
    value: form.note,
    onChange: e => {
      const v = e.target.value;
      const autoCat = (() => {
        const t = v.toLowerCase();
        if (/بيض|بيضه|بيضتين|ألبان|لبن|جبنه|جبن|زبادي|زبده/.test(t)) return "dairy";
        if (/فراخ|دجاج|لحم|لحمه|لحوم|كباب|كفته|سمك/.test(t)) return "meat";
        if (/عيش|فول|فلافل|طعميه|بليلة|فطار|كيك|بسكويت|شيبسي|بسكويته|باتيه|سندوتش/.test(t)) return "breakfast";
        if (/منظف|صابون|جلاية|ملابس|غسيل|مكنسه|مسحوق/.test(t)) return "cleaning";
        if (/خضار|طماطم|بطاطس|موز|فاكهه|فاكهة|برتقال|تفاح/.test(t)) return "pantry";
        if (/دوا|دواء|علاج|صيدليه|كشف|مستشفي/.test(t)) return "health";
        if (/خروج|كافيه|مطعم|تسالي|لعبه/.test(t)) return "outing";
        if (/مياه|زيت|عدس|أرز|ارز|سكر|ملح|معكرونه|عجينه/.test(t)) return "basics";
        return null;
      })();
      sf(f => ({ ...f, note: v, ...(autoCat ? {cat: autoCat} : {}) }));
    }
  }), form.cat === "fuel" && /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 7, marginBottom: 9 }
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    placeholder: "لتر البنزين",
    value: form.liters,
    onChange: e => sf(f => ({ ...f, liters: e.target.value })),
    style: { ...S.inp, marginBottom: 0, flex: 1 }
  }), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    placeholder: "كم قطعتها بالتانك ده",
    value: form.km,
    onChange: e => sf(f => ({ ...f, km: e.target.value })),
    style: { ...S.inp, marginBottom: 0, flex: 1 }
  })), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 11, color: "#4a6080", marginBottom: 6, fontWeight: 700 }
  }, "🎯 الميعاد الجاي عند (كم) — اختياري"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "numeric",
    placeholder: "مثلاً 233130 — هيتحط عليه تنبيه لوحده",
    value: form.dueKm,
    onChange: e => sf(f => ({ ...f, dueKm: e.target.value })),
    style: S.inp
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 11, color: "#4a6080", marginBottom: 6, fontWeight: 700 }
  }, "هتتخصم من مرتب مين؟"), /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 7, marginBottom: 9 }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => sf(f => ({ ...f, paidBy: "mohamed" })),
    style: {
      flex: 1,
      background: form.paidBy === "mohamed" ? "#3b82f633" : T.bg,
      border: `1.5px solid ${form.paidBy === "mohamed" ? "#3b82f6" : T.bdr}`,
      borderRadius: 9,
      padding: "9px 4px",
      cursor: "pointer",
      color: form.paidBy === "mohamed" ? "#60a5fa" : "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 12,
      fontWeight: 700
    }
  }, "👨 مرتبي"), /*#__PURE__*/React.createElement("button", {
    onClick: () => sf(f => ({ ...f, paidBy: "tahwish" })),
    style: {
      flex: 1,
      background: form.paidBy === "tahwish" ? "#8b5cf633" : T.bg,
      border: `1.5px solid ${form.paidBy === "tahwish" ? "#8b5cf6" : T.bdr}`,
      borderRadius: 9,
      padding: "9px 4px",
      cursor: "pointer",
      color: form.paidBy === "tahwish" ? "#a78bfa" : "#4a6080",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 12,
      fontWeight: 700
    }
  }, "💰 من التحويش")), /*#__PURE__*/React.createElement("button", {
    style: S.btn("#8b5cf6"),
    onClick: doAdd
  }, "إضافة ✓")), view === "needs" && /*#__PURE__*/React.createElement(React.Fragment, null,/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",marginBottom:10,border:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{display:"flex",gap:7,marginBottom:8}},/*#__PURE__*/React.createElement("input",{style:{background:"#070c16",border:"1px solid #1a2840",borderRadius:9,padding:"9px 12px",fontSize:14,color:"#e2e8f0",flex:1,fontFamily:"'Cairo',sans-serif",outline:"none",direction:"rtl"},type:"text",placeholder:"أضف احتياج جديد...",value:newNeed,onChange:function(e){setNewNeed(e.target.value);},onKeyDown:function(e){if(e.key==="Enter"&&newNeed.trim()){setCarNeeds(function(n){return[...n,{name:newNeed.trim(),done:false}];});setNewNeed("");}}}),/*#__PURE__*/React.createElement("button",{onClick:function(){if(newNeed.trim()){setCarNeeds(function(n){return[...n,{name:newNeed.trim(),done:false}];});setNewNeed("");}},style:{background:"#8b5cf6",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:18,fontWeight:900,cursor:"pointer",fontFamily:"'Cairo',sans-serif"}},"+"), /*#__PURE__*/React.createElement("div",{style:{fontSize:11,color:"#4a6080"}},carNeeds.filter(function(x){return x.done;}).length," / ",carNeeds.length," تم")),carNeeds.map(function(item,i){return /*#__PURE__*/React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{onClick:function(){setCarNeeds(function(n){return n.map(function(x,idx){return idx===i?Object.assign({},x,{done:!x.done}):x;});});},style:{width:26,height:26,borderRadius:99,flexShrink:0,cursor:"pointer",background:item.done?"#10b981":"transparent",border:"2.5px solid "+(item.done?"#10b981":"#ef4444"),display:"flex",alignItems:"center",justifyContent:"center"}},item.done&&/*#__PURE__*/React.createElement("span",{style:{color:"#fff",fontSize:13,fontWeight:900}},"✓")),/*#__PURE__*/React.createElement("span",{onClick:function(){setCarNeeds(function(n){return n.map(function(x,idx){return idx===i?Object.assign({},x,{done:!x.done}):x;});});},style:{fontSize:13,flex:1,cursor:"pointer",color:item.done?"#4a6080":"#e2e8f0",textDecoration:item.done?"line-through":"none"}},item.name),/*#__PURE__*/React.createElement("button",{onClick:function(){setCarNeeds(function(n){return n.filter(function(_,idx){return idx!==i;});});},style:{background:"none",border:"none",cursor:"pointer",color:"#334155",fontSize:16,padding:"0 4px"}},"🗑"));}))),view === "stats" && /*#__PURE__*/React.createElement(React.Fragment, null,/*#__PURE__*/React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:7}},/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px",border:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#8b5cf6",marginBottom:3}},"📅 هذا الشهر"),/*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#a78bfa"}},fmt(tMon)," ج"),/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#4a6080"}},mCar.length," عملية")),/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px",border:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#f59e0b",marginBottom:3}},"💰 إجمالي كل الفترة"),/*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:900,color:"#fbbf24"}},fmt(tAll)," ج"),/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#4a6080"}},all.length," عملية"))),/*#__PURE__*/React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}},/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px",border:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#10b981",marginBottom:3}},"📊 متوسط الشهر"),/*#__PURE__*/React.createElement("div",{style:{fontSize:18,fontWeight:900,color:"#34d399"}},fmt(Math.round(tAll/Math.max(1,Object.keys(byMon).length)))," ج")),(function(){var top=Object.entries(byMon).sort(function(a,b){return b[1].total-a[1].total;})[0];if(!top)return null;var ty=+top[0].split("-")[0],tm=+top[0].split("-")[1];return /*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px",border:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#ef4444",marginBottom:3}},"🔥 أعلى شهر"),/*#__PURE__*/React.createElement("div",{style:{fontSize:18,fontWeight:900,color:"#f87171"}},fmt(top[1].total)," ج"),/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#4a6080"}},MN[tm-1]," ",ty));})()), /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#2a3a55",fontWeight:700,marginBottom:7}},"🔧 حسب التصنيف"),/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",marginBottom:9,border:"1px solid #1a2840"}},CC.map(function(c){var t=SUM(all.filter(function(e){return e.cat===c.id;}));if(!t)return null;var cnt=all.filter(function(e){return e.cat===c.id;}).length;var avg=Math.round(t/cnt);return /*#__PURE__*/React.createElement("div",{key:c.id,onClick:function(){setF(c.id);setScope("all");sv2("list");},style:{marginBottom:10,cursor:"pointer"}},/*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:4}},/*#__PURE__*/React.createElement("span",{style:{fontSize:12}},c.ic," ",c.l," (",cnt,")"),/*#__PURE__*/React.createElement("div",{style:{textAlign:"left"}},/*#__PURE__*/React.createElement("div",{style:{fontSize:12,fontWeight:700,color:c.c}},fmt(t)," ج"),/*#__PURE__*/React.createElement("div",{style:{fontSize:9,color:"#4a6080"}},"متوسط ",fmt(avg)," ج"))),/*#__PURE__*/React.createElement(Bar,{v:t,max:tAll,c:c.c}));})),/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#2a3a55",fontWeight:700,marginBottom:7}},"📅 حسب الشهر"),/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",marginBottom:9,border:"1px solid #1a2840"}},Object.entries(byMon).sort(function(a,b){return b[0].localeCompare(a[0]);}).map(function(entry){var mk2=entry[0],d=entry[1];var ty=+mk2.split("-")[0],tm=+mk2.split("-")[1];var isCur=mk2===mk;var maxT=Math.max.apply(null,Object.values(byMon).map(function(x){return x.total;}));return /*#__PURE__*/React.createElement("div",{key:mk2,style:{padding:"8px 0",borderBottom:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:4}},/*#__PURE__*/React.createElement("span",{style:{fontSize:12,fontWeight:isCur?900:400,color:isCur?"#60a5fa":"#e2e8f0"}},isCur?"← ":"",MN[tm-1]," ",ty),/*#__PURE__*/React.createElement("div",{style:{textAlign:"left"}},/*#__PURE__*/React.createElement("span",{style:{fontSize:12,fontWeight:700,color:isCur?"#60a5fa":"#a78bfa"}},fmt(d.total)," ج"),/*#__PURE__*/React.createElement("span",{style:{fontSize:9,color:"#4a6080",marginRight:4}}," (",d.cnt," عملية"))),/*#__PURE__*/React.createElement(Bar,{v:d.total,max:maxT,c:isCur?"#3b82f6":"#8b5cf6",h:5}));})),/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#2a3a55",fontWeight:700,marginBottom:7}},"📆 ملخص السنوات"),/*#__PURE__*/React.createElement("div",{style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",border:"1px solid #1a2840"}},Object.entries(byY).sort().map(function(e2){return /*#__PURE__*/React.createElement("div",{key:e2[0],style:{display:"flex",justifyContent:"space-between",marginBottom:7,paddingBottom:7,borderBottom:"1px solid #1a2840"}},/*#__PURE__*/React.createElement("span",{style:{fontSize:14,fontWeight:700}},"📅 ",e2[0]),/*#__PURE__*/React.createElement("span",{style:{fontSize:16,fontWeight:900,color:"#a78bfa"}},fmt(e2[1])," ج"));})))),
del && /*#__PURE__*/React.createElement(Confirm, {
    msg: "تحذف الصيانة دي؟",
    onOk: () => {
      onDel(del);
      setD(null);
      setT("🗑️");
    },
    onNo: () => setD(null)
  }), /*#__PURE__*/React.createElement(Toast, {
    msg: toast
  }));
}

// ══════════════════════════════════════════════════════════════
// SUMMARY SCREEN
// ══════════════════════════════════════════════════════════════
function SummaryScreen({
  entries,
  mk,
  monthly,
  indExtra,
  setTab,
  deletedXl,
  goAddHome
}) {
  const dxl = deletedXl || [];
  const [y, m] = mk.split("-").map(Number);
  const saved = monthly[mk] || MONTHLY_PRESET[mk] || {};
  // كل الشهور المعروفة: الشهور الجاهزة + أي شهر جديد المستخدم دخله بياناته (حتى لو لسه مش في MONTHLY_PRESET)
  const entryMonthKeys = (entries || []).map(e => finKey(e.date));
  const allMonthKeys = [...new Set([...Object.keys(MONTHLY_PRESET), ...Object.keys(monthly), ...entryMonthKeys])].sort();
  const n = k => +(saved[k] || 0);

  // حساب المتبقي من الشهر السابق ونقله تلقائياً (محمد + ضحي مجمّعين في "فلوس قديمة")
  const carry = calcCarryover(mk, monthly, entries, indExtra, dxl);
  const prevBalance = carry.prevBalance;
  const prevDuhaBalance = carry.prevDuhaBalance;

  // إضافة المتبقي للشهر الحالي (لو مفيش old مسجل يدوي) — مجموع متبقي محمد + متبقي ضحي مع بعض
  const autoOld = n("old") > 0 ? 0 : carry.combined;

  const baseInc = n("salary") + n("transport") + n("waste") + (n("old") > 0 ? n("old") : autoOld) + n("deals") + n("eid") + n("dohaa") + n("magdy");
  const duhaAllowance = n("home_given") || 0;
  const duhaWSal = n("duha_w_sal") || 0;
  const duhaWSav = n("duha_w_sav") || 0;
  const budget = duhaAllowance; // مرتب الشريك بس — المتبقي بقى بيترحل في "فلوس قديمة" العامة بدل ما يتحسب لوحده هنا
  const fix = n("car_fixed") + n("rent") + n("internet") + n("charity") + n("mom") + n("ajz") + n("tahwish");
  const fixDisplay = fix + duhaAllowance;
  // نشيل "basics" من الأكل والبيت لأنها بتتحسب في الثوابت (charity/mom/internet)
  const allH = [...HOME_DATA.filter(e => !dxl.includes(e.id)), ...entries.filter(e => e.type === "home")];
  const allD = [...DUHA_DATA, ...entries.filter(e => e.type === "duha")];
  const allC = [...CAR_DATA, ...entries.filter(e => e.type === "car")];
  const mHome = allH.filter(e => finKey(e.date) === mk);
  const mDuha = allD.filter(e => finKey(e.date) === mk);
  const mCarAll = allC.filter(e => finKey(e.date) === mk);
  const mCarDoha = SUM(mCarAll.filter(e => e.paidBy === "doha"));
  const mCarTahwish = SUM(mCarAll.filter(e => e.paidBy === "tahwish"));
  const carTahwishTotal = SUM(allC.filter(e => e.paidBy === "tahwish"));
  const mCar = SUM(mCarAll.filter(e => e.paidBy !== "doha" && e.paidBy !== "tahwish"));
  const mHomeDoha = SUM(mHome.filter(e => e.paidBy === "doha"));
  const mHomeTahwish = SUM(mHome.filter(e => e.paidBy === "tahwish"));
  const mHomeTot = SUM(mHome.filter(e => e.paidBy !== "doha" && e.paidBy !== "tahwish"));
  const mDuhaMohamed = SUM(mDuha.filter(e => e.paidBy === "mohamed"));
  const mDuhaTahwish = SUM(mDuha.filter(e => e.paidBy === "tahwish"));
  const mDuhaOwn = SUM(mDuha.filter(e => e.paidBy !== "mohamed" && e.paidBy !== "tahwish"));
  const homeTahwishTotal = SUM(allH.filter(e => e.paidBy === "tahwish"));
  const duhaTahwishTotal2 = SUM(allD.filter(e => e.paidBy === "tahwish"));
  const mDuhaTot = mDuhaOwn + mHomeDoha + mCarDoha;
  // إندرايف للشهر: الأوردرات بتزود "إجمالي الدخل" مباشرة،
  // والبنزين/الضريبة/النفخ بتتحسب ضمن إجمالي المصاريف
  const indSum = indriveSummary(indExtra || []);
  const ind = indSum[mk];
  const indRev = ind ? ind.rev : 0;
  const indExpenses = ind ? ind.petrol + (ind.tax || 0) + (ind.tire || 0) : 0;
  // تحويش محمد يخصم من الأمان
  const mTahwishMohy = SUM((entries||[]).filter(e=>e.type==="home"&&e.cat==="saving"&&e.id&&e.id.startsWith("hn")&&finKey(e.date)===mk));
  const totalOut = fix + duhaAllowance + mHomeTot + mCar + mDuhaMohamed + (duhaWSal||0) + (duhaWSav||0) + indExpenses + mTahwishMohy;
  const inc = baseInc + indRev;
  const balance = inc - totalOut;
  const bycat = HC.map(c => ({
    ...c,
    total: SUM(mHome.filter(e => e.cat === c.id))
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const noData = !n("salary");
  const R = ({
    icon,
    lbl,
    val,
    c
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "#94a3b8"
    }
  }, icon, " ", lbl), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: c || "#e2e8f0"
    }
  }, fmt(val), " ج"));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "📥 الدخل — ", MONTHS[m - 1], " ", y), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, n("salary") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "💰",
    lbl: "المرتب",
    val: n("salary"),
    c: T.green
  }), n("transport") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🚌",
    lbl: "بدل مواصلات",
    val: n("transport"),
    c: T.green
  }), n("waste") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🗑️",
    lbl: "بدل مخلفات",
    val: n("waste"),
    c: T.green
  }), (n("old") > 0 || autoOld > 0) && /*#__PURE__*/React.createElement(R, {
    icon: "📦",
    lbl: "فلوس قديمة/جمعية",
    val: n("old") > 0 ? n("old") : autoOld,
    c: T.green
  }), n("deals") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🤝",
    lbl: "صفقات",
    val: n("deals"),
    c: T.green
  }), n("eid") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🎁",
    lbl: "عيدية/مكافأة",
    val: n("eid"),
    c: T.green
  }), n("dohaa") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "👩",
    lbl: "من الشريك",
    val: n("dohaa"),
    c: T.green
  }), n("magdy") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "👤",
    lbl: "من مجدي",
    val: n("magdy"),
    c: T.green
  }), indRev > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🛺",
    lbl: "إندرايف",
    val: indRev,
    c: T.green
  }), noData && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#2a3a55",
      fontSize: 11,
      textAlign: "center",
      padding: "8px 0"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: S.div
  }), /*#__PURE__*/React.createElement("div", {
    style: S.row
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "إجمالي الدخل"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      fontWeight: 900,
      color: T.green
    }
  }, fmt(inc), " ج"))), ind && (ind.rev > 0 || ind.petrol > 0 || ind.tax > 0 || ind.tire > 0) && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🛺 إندرايف — ", MONTHS[m - 1]), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, ind.rev > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "📦",
    lbl: `أوردرات (${ind.orders})`,
    val: ind.rev,
    c: T.orange
  }), ind.petrol > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "⛽",
    lbl: `بنزين (${ind.petrol_fills} مرة)`,
    val: -ind.petrol,
    c: T.red
  }), ind.tax > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🧾",
    lbl: "ضريبة اندرايف",
    val: -ind.tax,
    c: "#a78bfa"
  }), ind.tire > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "🛞",
    lbl: "نفخ كاوتش",
    val: -ind.tire,
    c: "#38bdf8"
  }))), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🔒 الثوابت"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement(R, {
    icon: "🚗",
    lbl: "قسط العربية",
    val: n("car_fixed"),
    c: T.red
  }), /*#__PURE__*/React.createElement(R, {
    icon: "🏠",
    lbl: "قسط الشقة / الإيجار",
    val: n("rent"),
    c: T.red
  }), /*#__PURE__*/React.createElement(R, {
    icon: "📡",
    lbl: "الإنترنت",
    val: n("internet"),
    c: T.red
  }), /*#__PURE__*/React.createElement(R, {
    icon: "🤲",
    lbl: "الصدقات والحصري",
    val: n("charity"),
    c: T.red
  }), /*#__PURE__*/React.createElement(R, {
    icon: "👩",
    lbl: "أمي",
    val: n("mom"),
    c: T.red
  }), n("ajz") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "📉",
    lbl: "عجز",
    val: n("ajz"),
    c: T.red
  }), n("tahwish") > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "💰",
    lbl: "تحويش",
    val: n("tahwish"),
    c: T.red
  }), duhaWSal > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "💳",
    lbl: "سحب من مرتب الشريك",
    val: -duhaWSal,
    c: T.red
  }), duhaWSav > 0 && /*#__PURE__*/React.createElement(R, {
    icon: "📦",
    lbl: "سحب من تحويش الشريك",
    val: -duhaWSav,
    c: T.red
  }), /*#__PURE__*/React.createElement(R, {
    icon: "🛒",
    lbl: "الشريك",
    val: budget,
    c: T.red
  }), /*#__PURE__*/React.createElement("div", {
    style: S.div
  }), /*#__PURE__*/React.createElement("div", {
    style: S.row
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "إجمالي الثوابت"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: T.red
    }
  }, fmt(fixDisplay || 9480), " ج"))), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🛒 الأكل والبيت — ", fmt(mHomeTot), " ج"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => (goAddHome ? goAddHome() : setTab("food")),
    style: {
      width: "100%",
      padding: "12px 0",
      borderRadius: 10,
      border: "none",
      background: T.orange,
      color: "#000",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "➕ أضف مصروف بيت"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, "إجمالي ما اتصرف فعلياً"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: mHomeTot > budget ? T.red : T.blue
    }
  }, fmt(mHomeTot), " ج"))), duhaAllowance > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "👩 الشريك — مرتب ", fmt(duhaAllowance), " ج"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTab("duha"),
    style: {
      width: "100%",
      padding: "12px 0",
      borderRadius: 10,
      border: "none",
      background: "#8b5cf6",
      color: "#fff",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "👩 عرض مصاريف الشريك"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, "إجمالي ما اتصرف فعلياً"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: mDuhaTot > duhaAllowance ? T.red : T.blue
    }
  }, fmt(mDuhaTot), " ج")), mHomeDoha > 0 && /*#__PURE__*/React.createElement("div", {
    style: { ...S.row, marginTop: 4 }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 10, color: "#4a6080" }
  }, "منها من مصاريف البيت"), /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 11, fontWeight: 700, color: "#10b981" }
  }, fmt(mHomeDoha), " ج"))), (mCar + mCarDoha + mCarTahwish) > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🔧 صيانة العربية"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {
    style: S.row
  }, /*#__PURE__*/React.createElement("span", {
    style: S.lbl
  }, "إجمالي الصيانة"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "#a78bfa"
    }
  }, fmt(mCar + mCarDoha + mCarTahwish), " ج")), mCarDoha > 0 && /*#__PURE__*/React.createElement("div", {
    style: { ...S.row, marginTop: 4 }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 10, color: "#4a6080" }
  }, "منها من مرتب الشريك"), /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 11, fontWeight: 700, color: "#f472b6" }
  }, fmt(mCarDoha), " ج")), mCarTahwish > 0 && /*#__PURE__*/React.createElement("div", {
    style: { ...S.row, marginTop: 4 }
  }, /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 10, color: "#4a6080" }
  }, "منها من التحويش"), /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 11, fontWeight: 700, color: "#a78bfa" }
  }, fmt(mCarTahwish), " ج")))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card(balance >= 0 ? "#10b98133" : "#ef444433"),
      border: `2px solid ${balance >= 0 ? T.green : T.red}`,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: balance >= 0 ? T.green : T.red,
      marginBottom: 4
    }
  }, balance >= 0 ? "✅ في الأمان" : "⚠️ تعديت الميزانية"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 900,
      color: balance >= 0 ? T.green : T.red
    }
  }, fmt(Math.abs(balance)), " ج"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#4a6080",
      marginTop: 3
    }
  }, "دخل ", fmt(inc), " − مصاريف ", fmt(totalOut)), /*#__PURE__*/React.createElement("div", {
    style: S.div
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-around"
    }
  }, [["الثوابت", fixDisplay || 9480, T.red], ["الأكل والبيت", mHomeTot, T.blue], ["صيانة", mCar, "#a78bfa"], ["💰 تحويش", SUM((entries||[]).filter(e=>e.type==="home"&&e.cat==="saving"&&finKey(e.date)===mk)), "#a78bfa"], ["⛽ بنزين", ind ? (ind.petrol||0) : 0, "#f59e0b"], ["🧾 ضريبة", ind ? (ind.tax||0) : 0, "#f59e0b"], ["🔧 نفخ كاوتش", ind ? (ind.tire||0) : 0, "#f59e0b"]].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#4a6080"
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: c
    }
  }, fmt(v)))))), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "📅 ملخص الشهور"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, allMonthKeys.map(monthKey => {
    const preset = MONTHLY_PRESET[monthKey] || {};
    const u = monthly[monthKey] || {};
    const mn = k => +(u[k] !== undefined ? u[k] : preset[k] || 0);
    const indS = indriveSummary(indExtra || []);
    const im = indS[monthKey];
    const imRev = im ? im.rev : 0;
    const imExp = im ? (im.petrol || 0) + (im.tax || 0) + (im.tire || 0) : 0;
    const mInc = mn("salary") + mn("transport") + mn("waste") + mn("old") + mn("deals") + mn("eid") + mn("dohaa") + mn("magdy") + imRev;
    const mFix = mn("car_fixed") + mn("rent") + mn("internet") + mn("charity") + mn("mom") + mn("ajz") + mn("tahwish");
    const mFixDisplay = mFix + mn("home_given");
    const mAllH = [...HOME_DATA.filter(e => !dxl.includes(e.id)), ...entries.filter(e => e.type === "home")].filter(e => finKey(e.date) === monthKey && e.cat !== "basics");
    const mAllD = [...DUHA_DATA, ...entries.filter(e => e.type === "duha")].filter(e => finKey(e.date) === monthKey);
    const mAllC = [...CAR_DATA, ...entries.filter(e => e.type === "car")].filter(e => finKey(e.date) === monthKey);
    const mHTotal = SUM(mAllH);
    const mDuha = mn("home_given");
    const mCarTotal = SUM(mAllC);
    const mTotalLive = mFix + mDuha + mHTotal + mCarTotal + imExp;
    // لو الشهر ده ملوش تعديل من المستخدم وعنده قيمة موثقة من الإكسيل، استخدمها (أدق 100%)
    // لو المستخدم عدل أي حاجة في الشهر ده (أو شهر جديد لسه مش موجود في الإكسيل)، استخدم الحساب اللايف
    const hasUserEdit = Object.keys(u).length > 0;
    const mTotal = (!hasUserEdit && preset.expense_total_xl !== undefined) ? preset.expense_total_xl : mTotalLive;
    const mBal = mInc - mTotal;
    const monthName = MONTHS[+monthKey.split("-")[1] - 1];
    const isCurrent = monthKey === mk;
    return /*#__PURE__*/React.createElement("div", {
      key: monthKey,
      style: {
        padding: "10px 0",
        borderBottom: `1px solid ${T.bdr}`,
        opacity: isCurrent ? 1 : 0.85
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: isCurrent ? T.orange : "#aaa"
      }
    }, isCurrent ? "▶ " : "", monthName, " ", monthKey.split("-")[0]), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 900,
        color: mBal >= 0 ? T.green : T.red
      }
    }, mBal >= 0 ? "+" : "", fmt(mBal), " ج")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: 10,
        color: "#4a6080"
      }
    }, /*#__PURE__*/React.createElement("span", null, "دخل: ", fmt(mInc), " ج"), /*#__PURE__*/React.createElement("span", null, "مصاريف: ", fmt(mTotal), " ج")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 5
      }
    }, /*#__PURE__*/React.createElement(Bar, {
      v: mTotal,
      max: mInc,
      c: mBal >= 0 ? T.green : T.red
    })));
  })), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "💵 إجمالي الدخل والمصروفات"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",border:"1px solid #10b98133"}}, /*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}}, /*#__PURE__*/React.createElement("span",{style:{fontSize:12,color:"#4a6080"}}, "إجمالي الدخل كل الشهور"), /*#__PURE__*/React.createElement("span",{style:{fontSize:14,fontWeight:900,color:T.green}}, fmt(YEARLY_INCOME_XL + allMonthKeys.filter(k=>k>"2026-06").reduce((s,k)=>{ const p=MONTHLY_PRESET[k]||{}; const u=monthly[k]||{}; const mn2=x=>+(u[x]!==undefined?u[x]:p[x]||0); const indS=indriveSummary(indExtra||[]); const im=indS[k]; return s+mn2("salary")+mn2("transport")+mn2("waste")+mn2("old")+mn2("deals")+mn2("eid")+mn2("dohaa")+mn2("magdy")+(im?im.rev:0); },0)), " ج")), /*#__PURE__*/React.createElement("div",{style:{height:1,background:T.bdr,margin:"5px 0"}}), /*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}}, /*#__PURE__*/React.createElement("span",{style:{fontSize:12,color:"#4a6080"}}, "إجمالي المصاريف كل الشهور"), /*#__PURE__*/React.createElement("span",{style:{fontSize:14,fontWeight:900,color:T.red}}, fmt(YEARLY_EXPENSE_XL + allMonthKeys.filter(k=>k>"2026-06").reduce((s,k)=>{ const p=MONTHLY_PRESET[k]||{}; const u=monthly[k]||{}; const mn2=x=>+(u[x]!==undefined?u[x]:p[x]||0); const mFx=mn2("car_fixed")+mn2("rent")+mn2("internet")+mn2("charity")+mn2("mom")+mn2("ajz")+mn2("tahwish"); const mHH=[...HOME_DATA,...(entries||[]).filter(e=>e.type==="home")].filter(e=>finKey(e.date)===k&&e.cat!=="basics"); const mCC=[...CAR_DATA,...(entries||[]).filter(e=>e.type==="car")].filter(e=>finKey(e.date)===k); const mDD=[...DUHA_DATA,...(entries||[]).filter(e=>e.type==="duha")].filter(e=>finKey(e.date)===k); const indS=indriveSummary(indExtra||[]); const im=indS[k]; const ic=im?(im.petrol||0)+(im.tax||0)+(im.tire||0):0; const liveTotal=mFx+mn2("home_given")+SUM(mHH)+SUM(mCC)+SUM(mDD)+ic; const hasEdit=Object.keys(u).length>0; const finalTotal=(!hasEdit&&p.expense_total_xl!==undefined)?p.expense_total_xl:liveTotal; return s+finalTotal; },0)), " ج"))), /*#__PURE__*/React.createElement("div", {style:{background:"#0f1a2a",borderRadius:13,padding:"12px 14px",border:"1px solid #8b5cf644",marginTop:8}}, /*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:"#a78bfa",marginBottom:5,fontWeight:700}}, "💰 إجمالي التحويش"), /*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}}, /*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:"#4a6080"}}, "مجموع ما تم تحويشه كل الشهور"), /*#__PURE__*/React.createElement("span",{style:{fontSize:20,fontWeight:900,color:"#a78bfa"}}, fmt(Math.max(0, allMonthKeys.reduce((s,k)=>{ const p=MONTHLY_PRESET[k]||{}; const u=monthly[k]||{}; const presetT=+(u.tahwish!==undefined?u.tahwish:p.tahwish||0)||0; const manualT=SUM((entries||[]).filter(e=>e.cat==="saving"&&finKey(e.date)===k)); return s+presetT+manualT; },0) - (carTahwishTotal + homeTahwishTotal + duhaTahwishTotal2))), " ج")), (carTahwishTotal + homeTahwishTotal + duhaTahwishTotal2) > 0 && /*#__PURE__*/React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:4}}, /*#__PURE__*/React.createElement("span",{style:{fontSize:10,color:"#4a6080"}}, "منها اتصرف على العربية/البيت/الشريك"), /*#__PURE__*/React.createElement("span",{style:{fontSize:11,fontWeight:700,color:"#ef4444"}}, fmt((carTahwishTotal + homeTahwishTotal + duhaTahwishTotal2)), " ج"))))));
}

// ══════════════════════════════════════════════════════════════
// INDRIVE SCREEN — مع إضافة أوردر وبنزين
// ══════════════════════════════════════════════════════════════
function IndriveScreen({
  indExtra,
  onAddInd,
  onDelInd,
  mk
}) {
  const TYPE_META = {
    order: {
      label: "أوردر",
      icon: "📦",
      color: T.orange
    },
    petrol: {
      label: "بنزين",
      icon: "⛽",
      color: T.red
    },
    tax: {
      label: "ضريبة اندرايف",
      icon: "🧾",
      color: "#a78bfa"
    },
    tire: {
      label: "نفخ كاوتش",
      icon: "🛞",
      color: "#38bdf8"
    }
  };
  const [view, sv2] = useState("month");
  const [form, sf] = useState({
    type: "order",
    amount: "",
    date: DK(),
    note: "",
    liters: "",
    km: ""
  });
  const [petrolPrice, setPetrolPrice] = useState(() => ld("mz_petrolPrice", 24));
  useEffect(() => { sv("mz_petrolPrice", petrolPrice); }, [petrolPrice]);
  const [toast, setT] = useToast();
  const [del, setD] = useState(null);
  const summary = useMemo(() => indriveSummary(indExtra), [indExtra]);
  const months = Object.keys(summary).sort().reverse();

  // الشهر الحالي
  const curInd = summary[mk] || {
    orders: 0,
    rev: 0,
    petrol: 0,
    petrol_fills: 0,
    tax: 0,
    tire: 0,
    entries: []
  };
  const net = curInd.rev - curInd.petrol - curInd.tax - curInd.tire;

  // إجمالي كل الفترة
  const grandRev = months.reduce((s, m) => s + (summary[m].rev || 0), 0);
  const grandPet = months.reduce((s, m) => s + (summary[m].petrol || 0), 0);
  const grandTax = months.reduce((s, m) => s + (summary[m].tax || 0), 0);
  const grandTire = months.reduce((s, m) => s + (summary[m].tire || 0), 0);
  const grandOrders = months.reduce((s, m) => s + (summary[m].orders || 0), 0);
  const doAdd = () => {
    const a = parseFloat(form.amount);
    if (!a || a <= 0) {
      setT("ادخل مبلغ");
      return;
    }
    onAddInd({
      id: `ind${Date.now()}`,
      type: form.type,
      amount: a,
      date: form.date,
      note: form.note.trim(),
      ...(form.type === "petrol" ? {
        liters: parseFloat(form.liters) || 0,
        km: parseFloat(form.km) || 0,
        price: petrolPrice
      } : {})
    });
    sf(f => ({
      ...f,
      amount: "",
      note: "",
      liters: "",
      km: ""
    }));
    const labels = {
      order: "✅ أوردر اتضاف",
      petrol: "✅ بنزين اتضاف",
      tax: "✅ ضريبة اندرايف اتضافت",
      tire: "✅ نفخ كاوتش اتضاف"
    };
    setT(labels[form.type] || "✅ تم الإضافة");
    sv2("month");
  };
  const isNew = id => String(id).startsWith("ind");

  // لون الشهر بالنسبة للصافي
  const netColor = n => n > 0 ? T.green : n < 0 ? T.red : "#4a6080";
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Tabs, {
    tabs: [["month", "الشهر الحالي"], ["add", "➕ أضف"], ["all", "كل الشهور"]],
    cur: view,
    set: sv2,
    ac: T.orange
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px"
    }
  }, view === "month" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "🛺 إندرايف — ", MONTHS[+mk.split("-")[1] - 1]), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 6,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#f59e0b22"),
      textAlign: "center",
      border: "1px solid #f59e0b44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: T.orange,
      marginBottom: 2
    }
  }, "الأوردرات (", curInd.orders, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: "#fbbf24"
    }
  }, fmt(curInd.rev), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#ef444422"),
      textAlign: "center",
      border: "1px solid #ef444433"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: T.red,
      marginBottom: 2
    }
  }, "البنزين (", curInd.petrol_fills, ")"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: T.red
    }
  }, fmt(curInd.petrol), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#a78bfa22"),
      textAlign: "center",
      border: "1px solid #a78bfa44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#a78bfa",
      marginBottom: 2
    }
  }, "ضريبة اندرايف"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: "#a78bfa"
    }
  }, fmt(curInd.tax), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#38bdf822"),
      textAlign: "center",
      border: "1px solid #38bdf844"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: "#38bdf8",
      marginBottom: 2
    }
  }, "نفخ كاوتش"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 900,
      color: "#38bdf8"
    }
  }, fmt(curInd.tire), " ج"))), (() => {
    const monthPetrol = (curInd.entries || []).filter(e => e.type === "petrol" && e.liters && e.km);
    if (!monthPetrol.length) return null;
    const mLiters = monthPetrol.reduce((s, e) => s + (e.liters || 0), 0);
    const mKm = monthPetrol.reduce((s, e) => s + (e.km || 0), 0);
    const mRate = mLiters > 0 ? mKm / mLiters : 0;
    return /*#__PURE__*/React.createElement("div", {
      style: { ...S.card("#10b98122"), border: "1px solid #10b98144", marginBottom: 10 }
    }, /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 8 }
    }, "⚡ معدل استهلاك البنزين — الشهر ده"), /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", marginBottom: 8 }
    }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: "#8fa3c4" } }, "المتوسط"), /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 14, fontWeight: 900, color: T.green }
    }, mRate.toFixed(1), " كم/لتر")), monthPetrol.slice().reverse().map((e, i) => {
      const rate = e.liters > 0 ? e.km / e.liters : 0;
      return /*#__PURE__*/React.createElement("div", {
        key: e.id || i,
        style: { display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: i < monthPetrol.length - 1 ? "1px solid #1a2840" : "none" }
      }, /*#__PURE__*/React.createElement("span", { style: { color: "#4a6080" } }, e.date, " · ", e.km, " كم · ", e.liters, " لتر"), /*#__PURE__*/React.createElement("span", {
        style: { fontWeight: 700, color: rate >= mRate ? T.green : T.red }
      }, rate.toFixed(1), " كم/لتر"));
    }));
  })(), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "عمليات الشهر (", curInd.entries?.length || 0, ")"), (!curInd.entries || curInd.entries.length === 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "#2a3a55",
      fontSize: 12,
      textAlign: "center",
      padding: "20px 0"
    }
  }, "مفيش عمليات هذا الشهر"), (curInd.entries || []).sort((a, b) => b.date.localeCompare(a.date)).map((e, i) => /*#__PURE__*/React.createElement("div", {
    key: e.id || i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "9px 0",
      borderBottom: `1px solid ${T.bdr}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, TYPE_META[e.type]?.icon || "💰"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: TYPE_META[e.type]?.color || "#4a6080"
    }
  }, TYPE_META[e.type]?.label || e.type), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#4a6080"
    }
  }, e.date, e.note ? ` · ${e.note}` : ""))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: TYPE_META[e.type]?.color || "#4a6080"
    }
  }, fmt(e.amount), " ج"), isNew(e.id) && /*#__PURE__*/React.createElement("button", {
    onClick: () => setD(e.id),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#4a6080",
      fontSize: 13
    }
  }, "🗑️"))))), view === "add" && /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "إضافة عملية جديدة"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 12
    }
  }, Object.entries(TYPE_META).map(([key, meta]) => /*#__PURE__*/React.createElement("button", {
    key: key,
    onClick: () => sf(f => ({
      ...f,
      type: key
    })),
    style: {
      padding: "12px 0",
      borderRadius: 10,
      border: `2px solid ${form.type === key ? meta.color : T.bdr}`,
      background: form.type === key ? meta.color + "22" : T.bg,
      cursor: "pointer",
      fontFamily: "'Cairo',sans-serif",
      fontWeight: 700,
      fontSize: 13,
      color: form.type === key ? meta.color : "#4a6080"
    }
  }, meta.icon, " ", meta.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginBottom: 4
    }
  }, form.type === "petrol" ? "سعر اللتر (ج)" : "المبلغ (ج)"), form.type === "petrol" && /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: "مثلاً: 24",
    inputMode: "decimal",
    value: petrolPrice,
    onChange: e => setPetrolPrice(e.target.value)
  }), form.type === "petrol" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginTop: 8,
      marginBottom: 4
    }
  }, "عدد اللترات"), form.type === "petrol" && /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: "مثلاً: 10",
    inputMode: "decimal",
    value: form.liters,
    onChange: e => sf(f => ({
      ...f,
      liters: e.target.value
    }))
  }), form.type === "petrol" && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginTop: 8,
      marginBottom: 4
    }
  }, "كيلومترات التفويلة دي"), form.type === "petrol" && /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: "مثلاً: 100",
    inputMode: "decimal",
    value: form.km,
    onChange: e => sf(f => ({
      ...f,
      km: e.target.value
    }))
  }), form.type === "petrol" && form.liters && form.km && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.green,
      marginTop: 6,
      marginBottom: 4,
      fontWeight: 700
    }
  }, "⚡ معدل الاستهلاك: ", (parseFloat(form.km) / parseFloat(form.liters)).toFixed(1), " كم/لتر"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginTop: form.type === "petrol" ? 8 : 0,
      marginBottom: 4
    }
  }, form.type === "petrol" ? "المبلغ الإجمالي (ج)" : "المبلغ (ج)"), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "number",
    placeholder: form.type === "order" ? "مثلاً: 150" : "مثلاً: 305",
    inputMode: "decimal",
    value: form.amount,
    onChange: e => sf(f => ({
      ...f,
      amount: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginBottom: 4
    }
  }, "التاريخ"), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "date",
    value: form.date,
    onChange: e => sf(f => ({
      ...f,
      date: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "#4a6080",
      marginBottom: 4
    }
  }, "ملاحظة (اختياري)"), /*#__PURE__*/React.createElement("input", {
    style: S.inp,
    type: "text",
    placeholder: "مثلاً: رحلة مدينة نصر",
    value: form.note,
    onChange: e => {
      const v = e.target.value;
      const autoCat = (() => {
        const t = v.toLowerCase();
        if (/بيض|بيضه|بيضتين|ألبان|لبن|جبنه|جبن|زبادي|زبده/.test(t)) return "dairy";
        if (/فراخ|دجاج|لحم|لحمه|لحوم|كباب|كفته|سمك/.test(t)) return "meat";
        if (/عيش|فول|فلافل|طعميه|بليلة|فطار|كيك|بسكويت|شيبسي|بسكويته|باتيه|سندوتش/.test(t)) return "breakfast";
        if (/منظف|صابون|جلاية|ملابس|غسيل|مكنسه|مسحوق/.test(t)) return "cleaning";
        if (/خضار|طماطم|بطاطس|موز|فاكهه|فاكهة|برتقال|تفاح/.test(t)) return "pantry";
        if (/دوا|دواء|علاج|صيدليه|كشف|مستشفي/.test(t)) return "health";
        if (/خروج|كافيه|مطعم|تسالي|لعبه/.test(t)) return "outing";
        if (/مياه|زيت|عدس|أرز|ارز|سكر|ملح|معكرونه|عجينه/.test(t)) return "basics";
        return null;
      })();
      sf(f => ({ ...f, note: v, ...(autoCat ? {cat: autoCat} : {}) }));
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: S.btn(TYPE_META[form.type]?.color || T.orange),
    onClick: doAdd
  }, TYPE_META[form.type]?.icon + " إضافة " + (TYPE_META[form.type]?.label || ""))), view === "all" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#f59e0b22"),
      flex: 1,
      textAlign: "center",
      border: "1px solid #f59e0b44"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: T.orange,
      marginBottom: 1
    }
  }, "إجمالي الإيرادات"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 900,
      color: "#fbbf24"
    }
  }, fmt(grandRev), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#ef444422"),
      flex: 1,
      textAlign: "center",
      border: "1px solid #ef444433"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: T.red,
      marginBottom: 1
    }
  }, "إجمالي البنزين"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 900,
      color: T.red
    }
  }, fmt(grandPet), " ج")), /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.card("#8b5cf622"),
      flex: 1,
      textAlign: "center",
      border: "1px solid #8b5cf644"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#a78bfa",
      marginBottom: 1
    }
  }, "عدد الأوردرات"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 900,
      color: "#a78bfa"
    }
  }, grandOrders, " أوردر"))), (() => {
    const allPetrolEntries = [...IND_RAW, ...indExtra].filter(e => e.type === "petrol" && e.liters && e.km);
    if (!allPetrolEntries.length) return null;
    const byMonth = {};
    allPetrolEntries.forEach(e => {
      const k = finKey(e.date);
      if (!byMonth[k]) byMonth[k] = { liters: 0, km: 0 };
      byMonth[k].liters += (e.liters || 0);
      byMonth[k].km += (e.km || 0);
    });
    const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    return /*#__PURE__*/React.createElement("div", {
      style: { ...S.card("#10b98122"), border: "1px solid #10b98144", marginBottom: 10 }
    }, /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 8 }
    }, "⚡ معدل استهلاك البنزين لكل شهر"), monthKeys.map((k, idx) => {
      const d = byMonth[k];
      const rate = d.liters > 0 ? d.km / d.liters : 0;
      const [yy, mm] = k.split("-").map(Number);
      return /*#__PURE__*/React.createElement("div", {
        key: k,
        style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: idx < monthKeys.length - 1 ? "1px solid #1a2840" : "none" }
      }, /*#__PURE__*/React.createElement("span", { style: { fontSize: 12, color: "#8fa3c4" } }, MONTHS[mm - 1], " ", yy), /*#__PURE__*/React.createElement("span", {
        style: { fontSize: 13, fontWeight: 900, color: T.green }
      }, rate.toFixed(1), " كم/لتر"));
    }));
  })(), months.map(m => {
    const d = summary[m];
    const net = d.rev - d.petrol - (d.tax || 0) - (d.tire || 0);
    const [y, mo] = m.split("-").map(Number);
    return /*#__PURE__*/React.createElement("div", {
      key: m,
      style: S.card()
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.row,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700
      }
    }, MONTHS[mo - 1], " ", y), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: "#4a6080"
      }
    }, d.orders, " أوردر · ", d.petrol_fills, " بنزين")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "إيرادات"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: T.orange
      }
    }, fmt(d.rev))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "بنزين"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: T.red
      }
    }, fmt(d.petrol))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "الصافي"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: netColor(net)
      }
    }, fmt(net)))), d.tax > 0 || d.tire > 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px solid ${T.bdr}`
      }
    }, d.tax > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#a78bfa"
      }
    }, "🧾 ضريبة: ", fmt(d.tax), " ج"), d.tire > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#38bdf8"
      }
    }, "🛞 نفخ: ", fmt(d.tire), " ج")) : null);
  }))), del && /*#__PURE__*/React.createElement(Confirm, {
    msg: "تحذف العملية دي؟",
    onOk: () => {
      onDelInd(del);
      setD(null);
      setT("🗑️");
    },
    onNo: () => setD(null)
  }), /*#__PURE__*/React.createElement(Toast, {
    msg: toast
  }));
}

// ══════════════════════════════════════════════════════════════
// GOALS SCREEN
// ══════════════════════════════════════════════════════════════
function GoalsScreen({
  monthly
}) {
  const todayKey = DK(); // "2026-06-30"
  const dailyStoreKey = `mh_daily_${todayKey}`;

  // تحميل تشيكات اليوم — لو يوم جديد بيبدأ بـ false تلقائي
  const [ch, sCh] = useState(() => {
    const saved = ld(dailyStoreKey, null);
    if (saved) return saved;
    return CHECK_DEF.map((t, i) => ({ id: i, t, done: false }));
  });

  const [gl, sGl] = useState(() => ld("mz_mh_gl5", GOALS_DEF.map((t, i) => ({
    id: i,
    t,
    done: false
  }))));
  const [ng, sNg] = useState("");
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteVal, setNoteVal] = useState("");
  const [showMonthReport, setShowMonthReport] = useState(false);

  // حفظ تشيكات اليوم بتاريخه
  useEffect(() => sv(dailyStoreKey, ch), [ch]);
  useEffect(() => sv("mz_mh_gl5", gl), [gl]);

  // حساب تقرير الشهر الحالي
  const monthReport = useMemo(() => {
    const year = todayKey.slice(0, 7); // "2026-06"
    const report = {};
    CHECK_DEF.forEach((t, i) => { report[i] = { t, days: 0, total: 0 }; });
    // مسح كل الأيام المحفوظة في الشهر ده
    let d = 1;
    while (d <= 31) {
      const dk = `${year}-${String(d).padStart(2, "0")}`;
      const dayData = ld(`mz_mh_daily_${dk}`, null);
      if (dayData) {
        dayData.forEach(item => {
          if (report[item.id] !== undefined) {
            report[item.id].total++;
            if (item.done) report[item.id].days++;
          }
        });
      }
      d++;
    }
    return Object.values(report).filter(r => r.total > 0);
  }, [showMonthReport, todayKey]);

  const dp = Math.round(ch.filter(c => c.done).length / ch.length * 100);
  const {
    salfaRem,
    aptRem
  } = useMemo(() => calcLoans(monthly), [monthly]);
  function LoanCard({
    icon,
    lbl,
    color,
    original,
    remaining,
    qist,
    note
  }) {
    const paid = original - remaining,
      p = PCT(paid, original);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.card(`${color}33`),
        border: `1px solid ${color}44`,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 700,
        color: "#e2e8f0"
      }
    }, icon, " ", lbl), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: "#4a6080",
        marginTop: 2
      }
    }, note)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "left"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "تم السداد"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 900,
        color: T.green
      }
    }, fmt(Math.round(paid)), " ج"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement(Bar, {
      v: paid,
      max: original,
      c: color,
      h: 10
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 900,
        color,
        whiteSpace: "nowrap"
      }
    }, p, "%")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: T.bg,
        borderRadius: 8,
        padding: "7px 4px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "الأصل"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: "#64748b"
      }
    }, fmt(original), " ج")), /*#__PURE__*/React.createElement("div", {
      style: {
        background: "#ef444411",
        borderRadius: 8,
        padding: "7px 4px",
        border: "1px solid #ef444422"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "المتبقي"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 900,
        color: T.red
      }
    }, fmt(Math.round(remaining * 100) / 100), " ج")), /*#__PURE__*/React.createElement("div", {
      style: {
        background: color + "11",
        borderRadius: 8,
        padding: "7px 4px",
        border: `1px solid ${color}22`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: "#4a6080"
      }
    }, "القسط"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color
      }
    }, qist))));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "💳 القروض (محدّث تلقائياً)"), /*#__PURE__*/React.createElement(LoanCard, {
    icon: "🏦",
    lbl: "السلفة",
    color: T.purple,
    original: SALFA_ORIGINAL,
    remaining: salfaRem,
    qist: "7,000 ج",
    note: "كل قسط عربية شهري يخصم من المتبقي تلقائياً"
  }), /*#__PURE__*/React.createElement(LoanCard, {
    icon: "🏠",
    lbl: "قسط الشقة",
    color: T.blue,
    original: APT_ORIGINAL,
    remaining: aptRem,
    qist: "~1,030 ج",
    note: "كل إيجار/قسط شهري يخصم من المتبقي تلقائياً"
  }), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "محاسبة النفس اليومية ✅"), /*#__PURE__*/React.createElement(WeightTracker, {
    storeKey: "mz_mh_weight_v1",
    startWeight: 0,
    goalWeight: 0,
    name: "الشخص الأول",
    color: "#1565ff"
  }), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.row,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700
    }
  }, "إنجازك اليوم"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 900,
      color: dp >= 70 ? T.green : T.orange
    }
  }, dp, "%")), /*#__PURE__*/React.createElement(Bar, {
    v: dp,
    max: 100,
    c: T.green
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, ch.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    onClick: () => sCh(a => a.map(x => x.id === c.id ? {
      ...x,
      done: !x.done
    } : x)),
    style: {
      display: "flex",
      gap: 9,
      alignItems: "center",
      padding: "7px 0",
      borderBottom: `1px solid ${T.bdr}`,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 19,
      height: 19,
      borderRadius: 4,
      border: `2px solid ${c.done ? T.green : "#2a3a55"}`,
      background: c.done ? T.green : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }
  }, c.done && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#fff",
      lineHeight: 1
    }
  }, "✓")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: c.done ? "#4a6080" : "#e2e8f0",
      textDecoration: c.done ? "line-through" : "none",
      flex: 1
    }
  }, c.t), /*#__PURE__*/React.createElement("span", {
    onClick: e => { e.stopPropagation(); sCh(a => a.filter(x => x.id !== c.id)); },
    style: { fontSize: 14, color: T.red, cursor: "pointer", padding: "0 4px", opacity: 0.6 }
  }, "×"))))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowMonthReport(v => !v),
    style: {
      width: "100%",
      marginTop: 12,
      padding: "10px",
      background: showMonthReport ? "#1565ff22" : "#1a2840",
      border: "1px solid #1565ff44",
      borderRadius: 10,
      color: "#7aa3d4",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, showMonthReport ? "▲ إخفاء تقرير الشهر" : "📊 تقرير الشهر"), showMonthReport && /*#__PURE__*/React.createElement("div", {
    style: { ...S.card("#1565ff11"), border: "1px solid #1565ff22", marginTop: 8 }
  }, /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 10 }
  }, "📊 تقرير هذا الشهر"), monthReport.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12, color: "#4a6080", textAlign: "center", padding: 10 }
  }, "مفيش بيانات لهذا الشهر لسه") : monthReport.map((r, i) => {
    const pct = r.total > 0 ? Math.round(r.days / r.total * 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: { marginBottom: 8 }
    }, /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", marginBottom: 3 }
    }, /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 11, color: "#e2e8f0" }
    }, r.t), /*#__PURE__*/React.createElement("span", {
      style: { fontSize: 11, fontWeight: 700, color: pct >= 70 ? T.green : pct >= 40 ? T.orange : T.red }
    }, r.days, "/", r.total, " (", pct, "%)")
    ), /*#__PURE__*/React.createElement(Bar, { v: r.days, max: r.total, c: pct >= 70 ? T.green : pct >= 40 ? T.orange : T.red, h: 5 }));
  })), /*#__PURE__*/React.createElement("div", {
    style: S.sub
  }, "أهدافي 2026 🎯"), /*#__PURE__*/React.createElement("div", {
    style: S.card()
  }, gl.map(g => /*#__PURE__*/React.createElement(React.Fragment, { key: g.id }, /*#__PURE__*/React.createElement("div", {
    onClick: () => sGl(a => a.map(x => x.id === g.id ? {
      ...x,
      done: !x.done
    } : x)),
    style: {
      display: "flex",
      gap: 9,
      alignItems: "center",
      padding: "7px 0",
      borderBottom: noteEditId === g.id ? "none" : `1px solid ${T.bdr}`,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 19,
      height: 19,
      borderRadius: 99,
      border: `2px solid ${g.done ? T.blue : "#2a3a55"}`,
      background: g.done ? T.blue : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }
  }, g.done && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: "#fff",
      lineHeight: 1
    }
  }, "✓")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: g.done ? "#4a6080" : "#e2e8f0",
      textDecoration: g.done ? "line-through" : "none",
      flex: 1
    }
  }, g.t, g.note && /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 10, color: "#60a5fa", textDecoration: "none", marginTop: 2 }
  }, "📝 ", g.note)), /*#__PURE__*/React.createElement("span", {
    onClick: e => { e.stopPropagation(); setNoteEditId(noteEditId === g.id ? null : g.id); setNoteVal(g.note || ""); },
    style: { fontSize: 13, color: g.note ? "#60a5fa" : "#4a6080", cursor: "pointer", padding: "0 4px" }
  }, "📝"), /*#__PURE__*/React.createElement("span", {
    onClick: e => { e.stopPropagation(); sGl(a => a.filter(x => x.id !== g.id)); },
    style: { fontSize: 14, color: T.red, cursor: "pointer", padding: "0 4px", opacity: 0.6 }
  }, "×")), noteEditId === g.id && /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 6, padding: "0 0 9px 27px", borderBottom: `1px solid ${T.bdr}` }
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    autoFocus: true,
    placeholder: "ملاحظة... مثلاً حققته بسعر كذا أو في شهر كذا",
    value: noteVal,
    onChange: e => setNoteVal(e.target.value),
    onKeyDown: e => { if (e.key === "Enter") { sGl(a => a.map(x => x.id === g.id ? { ...x, note: noteVal.trim() } : x)); setNoteEditId(null); } },
    style: { ...S.inp, marginBottom: 0, flex: 1, fontSize: 12 }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => { sGl(a => a.map(x => x.id === g.id ? { ...x, note: noteVal.trim() } : x)); setNoteEditId(null); },
    style: { background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }
  }, "حفظ")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      display: "flex",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...S.inp,
      marginBottom: 0,
      flex: 1
    },
    type: "text",
    placeholder: "أضف هدف جديد...",
    value: ng,
    onChange: e => sNg(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter" && ng.trim()) {
        sGl(g => [...g, {
          id: Date.now(),
          t: ng.trim(),
          done: false
        }]);
        sNg("");
      }
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (ng.trim()) {
        sGl(g => [...g, {
          id: Date.now(),
          t: ng.trim(),
          done: false
        }]);
        sNg("");
      }
    },
    style: {
      ...S.btn(T.blue),
      width: "auto",
      padding: "9px 14px",
      marginTop: 0
    }
  }, "+"))));
}

// ══════════════════════════════════════════════════════════════
// WEIGHT TRACKER COMPONENT
// ══════════════════════════════════════════════════════════════
const CLD_CLOUD = "tpzkvsa6";
const CLD_PRESET = "Mohamed";
const WORKER_URL = "https://damp-poetry-c48b.mohamedhossamomara01.workers.dev";
// ملحوظة: مفتاح Gemini بقى مخزّن كـ Secret جوا الـ Worker نفسه، مش هنا —
// عشان كده مبقاش محتاج نبعته من المتصفح خالص.

async function geminiAnalyze(b64, mime, prompt) {
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mime || "image/jpeg", data: b64 } },
        { text: prompt }
      ]
    }]
  };
  const res = await fetch(WORKER_URL + "/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function openRouterAnalyze(b64, mime, prompt) {
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mime || "image/jpeg", data: b64 } },
        { text: prompt }
      ]
    }]
  };
  const res = await fetch(WORKER_URL + "/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "مش قادر أحلل دلوقتي";
}

async function analyzeBodyPhoto(base64Data, mimeType) {
  return openRouterAnalyze(
    base64Data,
    mimeType,
    "أنت مساعد لياقة بدنية. انظر للصورة أمامك فقط. اكتب 3 جمل قصيرة بالعربية فقط عن شكل الجسم المرئي في الصورة (الوجه، البطن، الجسم). ممنوع الكتابة بأي لغة أخرى غير العربية. ممنوع اختراع معلومات غير موجودة في الصورة."
  );
}

async function compareBodyPhotos(b64A, b64B, weightA, weightB, mimeA, mimeB) {
  const diff = Math.abs(weightA - weightB).toFixed(1);
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeA || "image/jpeg", data: b64A } },
        { inline_data: { mime_type: mimeB || "image/jpeg", data: b64B } },
        { text: `قارن بين الصورتين. الصورة الأولى وزنها ${weightA} كجم والثانية ${weightB} كجم، الفرق ${diff} كجم. وضح الفروق المرئية بشكل إيجابي ومشجع. الرد بالعربية في 4-5 جمل.` }
      ]
    }]
  };
  const res = await fetch(WORKER_URL + "/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "مش قادر أقارن دلوقتي";
}

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  return data.secure_url;
}

function WeightTracker({ storeKey, startWeight, goalWeight, name, color }) {
  const [entries, setEntries] = useState(() => ld(storeKey, startWeight ? [
    { date: "2026-06-01", weight: startWeight }
  ] : []));
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(DK());
  const [uploading, setUploading] = useState(false);
  const [cmpA, setCmpA] = useState(null);
  const [cmpB, setCmpB] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [compareText, setCompareText] = useState("");
  const b64Cache = useRef({});

  const isLoadingFromCloud = useRef(false);

  // تحميل من Supabase أول فتح
  useEffect(() => {
    isLoadingFromCloud.current = true;
    cloudLoad(storeKey).then(cloud => {
      if (cloud && cloud.length > 0) {
        setEntries(cloud);
        sv(storeKey, cloud);
      }
      isLoadingFromCloud.current = false;
    });
  }, []);

  // حفظ في localStorage وSupabase — بس مش لما بنحمل من السحابة
  useEffect(() => {
    if (isLoadingFromCloud.current) return;
    sv(storeKey, entries);
    cloudSave(storeKey, entries);
  }, [entries]);

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalLost = first && last ? +(first.weight - last.weight).toFixed(1) : 0;
  const remaining = last ? +(last.weight - goalWeight).toFixed(1) : 0;
  const weeksBetween = first && last ? Math.max(1, (new Date(last.date) - new Date(first.date)) / (7*24*3600*1000)) : 1;
  const ratePerWeek = +(totalLost / weeksBetween).toFixed(2);
  const weeksToGoal = ratePerWeek > 0 ? Math.ceil(remaining / ratePerWeek) : null;
  const goalDate = weeksToGoal ? new Date(Date.now() + weeksToGoal*7*24*3600*1000) : null;
  const goalDateStr = goalDate ? `${goalDate.getDate()}/${goalDate.getMonth()+1}/${goalDate.getFullYear()}` : null;

  // SVG chart
  const W=320, H=120, PAD=30;
  const weights = sorted.map(e => e.weight);
  const minW = Math.min(...weights, goalWeight) - 1;
  const maxW = Math.max(...weights) + 1;
  const toX = i => PAD + (i / Math.max(sorted.length-1,1)) * (W-PAD*2);
  const toY = w => PAD + (1 - (w-minW)/(maxW-minW)) * (H-PAD*2);
  const points = sorted.map((e,i) => `${toX(i)},${toY(e.weight)}`).join(" ");
  const goalY = toY(goalWeight);

  async function handlePhotoUpload(e, entryDate) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      // قراءة base64 محلياً للـ Gemini
      const b64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(file);
      });
      b64Cache.current[entryDate] = { data: b64, mime: file.type };
      // رفع على Cloudinary للحفظ الدائم
      const url = await uploadToCloudinary(file);
      setEntries(prev => prev.map(en => en.date === entryDate ? { ...en, photo: url, photoMime: file.type } : en));
    } catch(err) { alert("فشل رفع الصورة، جرب تاني"); }
    setUploading(false);
  }

  // جلب base64 للتحليل (من الكاش أو fetch من Cloudinary)
  async function getBase64(entry) {
    if (b64Cache.current[entry.date]) return b64Cache.current[entry.date];
    const res = await fetch(entry.photo);
    const blob = await res.blob();
    const data = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const result = { data, mime: entry.photoMime || "image/jpeg" };
    b64Cache.current[entry.date] = result;
    return result;
  }

  // photos with entries
  const photosEntries = [...sorted].reverse().filter(e => e.photo);

  return /*#__PURE__*/React.createElement(React.Fragment, null,
    /*#__PURE__*/React.createElement("div", { style: S.sub }, "⚖️ متابعة الوزن — " + name),

    // كروت ملخص
    /*#__PURE__*/React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } },
      [["الحالي", last ? last.weight+" كجم" : "-", color],
       ["خسرت", totalLost+" كجم", "#10b981"],
       ["الهدف", goalWeight+" كجم", "#f59e0b"],
       ["متبقي", remaining+" كجم", remaining > 0 ? "#ef4444" : "#10b981"]
      ].map(([lbl,val,c]) => /*#__PURE__*/React.createElement("div", {
        key: lbl, style: { flex:1, background:c+"22", border:"1px solid "+c+"44", borderRadius:10, padding:"8px 4px", textAlign:"center" }
      }, /*#__PURE__*/React.createElement("div", { style:{ fontSize:9, color:c, marginBottom:2 } }, lbl),
         /*#__PURE__*/React.createElement("div", { style:{ fontSize:13, fontWeight:900, color:c } }, val)))
    ),

    // توقع الوصول
    goalDateStr && ratePerWeek > 0 && /*#__PURE__*/React.createElement("div", {
      style: { ...S.card("#10b98111"), border:"1px solid #10b98133", marginBottom:10, textAlign:"center" }
    }, /*#__PURE__*/React.createElement("div", { style:{ fontSize:11, color:"#4a6080" } }, "بالمعدل الحالي ("+ratePerWeek+" كجم/أسبوع)"),
       /*#__PURE__*/React.createElement("div", { style:{ fontSize:13, fontWeight:700, color:T.green, marginTop:4 } }, "هتوصل للهدف تقريباً ", goalDateStr, " 🎯")),

    // منحنى
    sorted.length > 1 && /*#__PURE__*/React.createElement("div", { style:{ ...S.card(), marginBottom:10 } },
      /*#__PURE__*/React.createElement("svg", { width:W, height:H, style:{ display:"block", margin:"0 auto" } },
        /*#__PURE__*/React.createElement("line", { x1:PAD, y1:goalY, x2:W-PAD, y2:goalY, stroke:"#f59e0b44", strokeWidth:1, strokeDasharray:"4" }),
        /*#__PURE__*/React.createElement("text", { x:W-PAD-2, y:goalY-3, fill:"#f59e0b", fontSize:8, textAnchor:"end" }, goalWeight+" هدف"),
        /*#__PURE__*/React.createElement("polyline", { points, fill:"none", stroke:color, strokeWidth:2, strokeLinejoin:"round" }),
        sorted.map((e,i) => /*#__PURE__*/React.createElement(React.Fragment, { key:i },
          /*#__PURE__*/React.createElement("circle", { cx:toX(i), cy:toY(e.weight), r:4, fill:color }),
          /*#__PURE__*/React.createElement("text", { x:toX(i), y:toY(e.weight)-6, fill:"#e2e8f0", fontSize:8, textAnchor:"middle" }, e.weight)
        ))
      )
    ),

    // إضافة قراءة
    /*#__PURE__*/React.createElement("div", { style:{ ...S.card(), marginBottom:10 } },
      /*#__PURE__*/React.createElement("div", { style:{ fontSize:12, color:"#4a6080", marginBottom:6 } }, "أضف قراءة أسبوعية"),
      /*#__PURE__*/React.createElement("div", { style:{ display:"flex", gap:7 } },
        /*#__PURE__*/React.createElement("input", {
          style:{ ...S.inp, marginBottom:0, flex:1 }, type:"number", placeholder:"الوزن (كجم)", inputMode:"decimal",
          value:newWeight, onChange:e => setNewWeight(e.target.value)
        }),
        /*#__PURE__*/React.createElement("input", {
          style:{ ...S.inp, marginBottom:0, flex:1 }, type:"date", value:newDate, onChange:e => setNewDate(e.target.value)
        }),
        /*#__PURE__*/React.createElement("button", {
          onClick:() => {
            const w = parseFloat(newWeight);
            if (!w || !newDate) return;
            setEntries(prev => { const f = prev.filter(e => e.date !== newDate); return [...f, { date:newDate, weight:w }]; });
            setNewWeight("");
          },
          style:{ ...S.btn(color), width:"auto", padding:"9px 14px", marginTop:0 }
        }, "+")
      )
    ),

    // سجل القراءات + رفع صورة لكل قراءة
    /*#__PURE__*/React.createElement("div", { style:{ ...S.card(), marginBottom:10 } },
      /*#__PURE__*/React.createElement("div", { style:{ fontSize:12, color:"#4a6080", marginBottom:6 } }, "سجل القراءات"),
      uploading && /*#__PURE__*/React.createElement("div", { style:{ fontSize:11, color:T.orange, marginBottom:6 } }, "⏳ جاري رفع الصورة..."),
      [...sorted].reverse().map((e,i) => /*#__PURE__*/React.createElement("div", {
        key:i, style:{ padding:"8px 0", borderBottom:"1px solid "+T.bdr }
      },
        /*#__PURE__*/React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
          /*#__PURE__*/React.createElement("span", { style:{ fontSize:12, color:"#8fa3c4" } }, e.date),
          /*#__PURE__*/React.createElement("span", { style:{ fontSize:13, fontWeight:700, color } }, e.weight, " كجم"),
          /*#__PURE__*/React.createElement("div", { style:{ display:"flex", gap:6, alignItems:"center" } },
            /*#__PURE__*/React.createElement("label", { style:{ fontSize:11, color:"#4a6080", cursor:"pointer" } },
              e.photo ? "📷 تغيير" : "📷 صورة",
              /*#__PURE__*/React.createElement("input", { type:"file", accept:"image/*", style:{ display:"none" }, onChange:ev => handlePhotoUpload(ev, e.date) })
            ),
            /*#__PURE__*/React.createElement("span", {
              onClick:() => setEntries(prev => prev.filter(x => x.date !== e.date)),
              style:{ fontSize:14, color:T.red, cursor:"pointer", opacity:0.6 }
            }, "×")
          )
        ),
        e.photo && /*#__PURE__*/React.createElement(React.Fragment, null,
          /*#__PURE__*/React.createElement("img", { src:e.photo, style:{ width:"100%", borderRadius:8, marginTop:6, maxHeight:200, objectFit:"cover" } }),
          /*#__PURE__*/React.createElement("button", {
            onClick: async () => {
              setAnalyzing(true); setAnalysisText("");
              try {
                const {data, mime} = await getBase64(e);
                const txt = await analyzeBodyPhoto(data, mime);
                setAnalysisText(txt);
              } catch(err) { setAnalysisText("حصل خطأ: " + err.message); }
              setAnalyzing(false);
            },
            style: { ...S.btn("#8b5cf6"), marginTop:6, fontSize:11, padding:"7px 12px" }
          }, analyzing ? "⏳ جاري التحليل..." : "🤖 حلل الصورة بـ AI"),
          analysisText && /*#__PURE__*/React.createElement("div", {
            style: { background:"#8b5cf622", border:"1px solid #8b5cf644", borderRadius:8, padding:10, marginTop:6, fontSize:12, color:"#e2e8f0", lineHeight:1.6 }
          }, analysisText)
        )
      ))
    ),

    // مقارنة صورتين
    photosEntries.length >= 2 && /*#__PURE__*/React.createElement("div", { style:{ ...S.card(), marginBottom:10 } },
      /*#__PURE__*/React.createElement("div", { style:{ fontSize:13, fontWeight:700, marginBottom:8 } }, "📸 قارن بين صورتين"),
      /*#__PURE__*/React.createElement("div", { style:{ display:"flex", gap:7, marginBottom:8 } },
        [["صورة أولى", cmpA, setCmpA], ["صورة تانية", cmpB, setCmpB]].map(([lbl, val, setter]) =>
          /*#__PURE__*/React.createElement("div", { key:lbl, style:{ flex:1 } },
            /*#__PURE__*/React.createElement("div", { style:{ fontSize:10, color:"#4a6080", marginBottom:4 } }, lbl),
            /*#__PURE__*/React.createElement("select", {
              style:{ ...S.inp, marginBottom:0, fontSize:11 },
              value: val || "",
              onChange: e => setter(e.target.value)
            },
              /*#__PURE__*/React.createElement("option", { value:"" }, "اختار تاريخ"),
              photosEntries.map(e => /*#__PURE__*/React.createElement("option", { key:e.date, value:e.date }, e.date+" ("+e.weight+" كجم)"))
            )
          )
        )
      ),
      cmpA && cmpB && cmpA !== cmpB && /*#__PURE__*/React.createElement(React.Fragment, null,
        /*#__PURE__*/React.createElement("div", { style:{ display:"flex", gap:8 } },
          [cmpA, cmpB].map(d => {
            const en = photosEntries.find(e => e.date === d);
            return en ? /*#__PURE__*/React.createElement("div", { key:d, style:{ flex:1, textAlign:"center" } },
              /*#__PURE__*/React.createElement("img", { src:en.photo, style:{ width:"100%", borderRadius:8, objectFit:"cover", maxHeight:250 } }),
              /*#__PURE__*/React.createElement("div", { style:{ fontSize:11, color:"#8fa3c4", marginTop:4 } }, d),
              /*#__PURE__*/React.createElement("div", { style:{ fontSize:13, fontWeight:700, color } }, en.weight, " كجم")
            ) : null;
          })
        ),
        /*#__PURE__*/React.createElement("div", { style:{ textAlign:"center", marginTop:8 } },
          (() => {
            const eA = photosEntries.find(e => e.date === cmpA);
            const eB = photosEntries.find(e => e.date === cmpB);
            if (!eA || !eB) return null;
            const diff = Math.abs(eA.weight - eB.weight).toFixed(1);
            return /*#__PURE__*/React.createElement(React.Fragment, null,
              /*#__PURE__*/React.createElement("div", { style:{ fontSize:12, fontWeight:700, color:T.green, marginBottom:8 } }, "✅ الفرق: ", diff, " كجم"),
              /*#__PURE__*/React.createElement("button", {
                onClick: async () => {
                  setAnalyzing(true); setCompareText("");
                  try {
                    const [rA, rB] = await Promise.all([getBase64(eA), getBase64(eB)]);
                    const txt = await compareBodyPhotos(rA.data, rB.data, eA.weight, eB.weight, rA.mime, rB.mime);
                    setCompareText(txt);
                  } catch(err) { setCompareText("حصل خطأ: " + err.message); }
                  setAnalyzing(false);
                },
                style: { ...S.btn("#8b5cf6"), fontSize:11, padding:"7px 12px" }
              }, analyzing ? "⏳ جاري المقارنة..." : "🤖 قارن بـ AI"),
              compareText && /*#__PURE__*/React.createElement("div", {
                style: { background:"#8b5cf622", border:"1px solid #8b5cf644", borderRadius:8, padding:10, marginTop:8, fontSize:12, color:"#e2e8f0", lineHeight:1.6, textAlign:"right" }
              }, compareText)
            );
          })()
        )
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════
// DUHA GOALS SCREEN
// ══════════════════════════════════════════════════════════════
const DUHA_CHECK_DEF_DEFAULT = ["اذكار الصباح", "تمرين", "تظبيط اكل الفطار", "تظبيط اكل الغدا", "تظبيط اكل العشا", "اذكار المساء", "الصلاه في ميعادها", "الفجر في ميعاده"];
const DUHA_GOALS_DEF_DEFAULT = ["اخسي لحد وزن معين", "تمرين منتظم", "قراءة يومية"];

function DuhaGoalsSection() {
  const todayKey = DK();
  const dailyKey = `dh_daily_${todayKey}`;

  const [ch, sCh] = useState(() => {
    const saved = ld(dailyKey, null);
    if (saved) return saved;
    const defs = ld("mz_dh_check_defs", DUHA_CHECK_DEF_DEFAULT);
    return defs.map((t, i) => ({ id: i, t, done: false }));
  });

  const [gl, sGl] = useState(() => ld("mz_dh_gl", ld("mz_dh_goals_defs", DUHA_GOALS_DEF_DEFAULT).map((t, i) => ({ id: i, t, done: false }))));
  const [newCheck, setNewCheck] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteVal, setNoteVal] = useState("");

  useEffect(() => sv(dailyKey, ch), [ch]);
  useEffect(() => {
    sv("mz_dh_gl", gl);
    sv("mz_dh_goals_defs", gl.map(g => g.t));
  }, [gl]);
  useEffect(() => {
    sv("mz_dh_check_defs", ch.map(c => c.t));
  }, []);

  const dp = ch.length > 0 ? Math.round(ch.filter(c => c.done).length / ch.length * 100) : 0;

  const monthReport = useMemo(() => {
    const year = todayKey.slice(0, 7);
    const report = {};
    ch.forEach(c => { report[c.id] = { t: c.t, days: 0, total: 0 }; });
    for (let d = 1; d <= 31; d++) {
      const dk = `${year}-${String(d).padStart(2, "0")}`;
      const dayData = ld(`mz_dh_daily_${dk}`, null);
      if (dayData) {
        dayData.forEach(item => {
          if (!report[item.id]) report[item.id] = { t: item.t, days: 0, total: 0 };
          report[item.id].total++;
          if (item.done) report[item.id].days++;
        });
      }
    }
    return Object.values(report).filter(r => r.total > 0);
  }, [showReport, todayKey]);

  return /*#__PURE__*/React.createElement(React.Fragment, null,
    /*#__PURE__*/React.createElement(WeightTracker, {
      storeKey: "mz_dh_weight_v1",
      startWeight: 0,
      goalWeight: 0,
      name: "الشخص الثاني",
      color: "#ec4899"
    }),
    /*#__PURE__*/React.createElement("div", { style: S.sub }, "محاسبة النفس اليومية ✅"),
    /*#__PURE__*/React.createElement("div", { style: S.card() },
      /*#__PURE__*/React.createElement("div", { style: { ...S.row, marginBottom: 7 } },
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 13, fontWeight: 700 } }, "إنجازها اليوم"),
        /*#__PURE__*/React.createElement("span", { style: { fontSize: 18, fontWeight: 900, color: dp >= 70 ? T.green : T.orange } }, dp, "%")
      ),
      /*#__PURE__*/React.createElement(Bar, { v: dp, max: 100, c: T.green }),
      /*#__PURE__*/React.createElement("div", { style: { marginTop: 10 } },
        ch.map(c => /*#__PURE__*/React.createElement("div", {
          key: c.id,
          style: { display: "flex", gap: 9, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.bdr}` }
        },
          /*#__PURE__*/React.createElement("div", {
            onClick: () => sCh(a => a.map(x => x.id === c.id ? { ...x, done: !x.done } : x)),
            style: { width: 19, height: 19, borderRadius: 4, border: `2px solid ${c.done ? T.green : "#2a3a55"}`, background: c.done ? T.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }
          }, c.done && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: "#fff", lineHeight: 1 } }, "✓")),
          /*#__PURE__*/React.createElement("span", {
            onClick: () => sCh(a => a.map(x => x.id === c.id ? { ...x, done: !x.done } : x)),
            style: { fontSize: 12, color: c.done ? "#4a6080" : "#e2e8f0", textDecoration: c.done ? "line-through" : "none", flex: 1, cursor: "pointer" }
          }, c.t),
          /*#__PURE__*/React.createElement("span", {
            onClick: () => { sCh(a => { const n = a.filter(x => x.id !== c.id); sv("mz_dh_check_defs", n.map(x => x.t)); return n; }); },
            style: { fontSize: 14, color: T.red, cursor: "pointer", padding: "0 4px", opacity: 0.6 }
          }, "×")
        ))
      ),
      /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, display: "flex", gap: 7 } },
        /*#__PURE__*/React.createElement("input", {
          style: { ...S.inp, marginBottom: 0, flex: 1 },
          type: "text",
          placeholder: "أضف إنجاز جديد...",
          value: newCheck,
          onChange: e => setNewCheck(e.target.value),
          onKeyDown: e => {
            if (e.key === "Enter" && newCheck.trim()) {
              const t = newCheck.trim();
              sCh(a => { const n = [...a, { id: Date.now(), t, done: false }]; sv("mz_dh_check_defs", n.map(x => x.t)); return n; });
              setNewCheck("");
            }
          }
        }),
        /*#__PURE__*/React.createElement("button", {
          onClick: () => {
            if (newCheck.trim()) {
              const t = newCheck.trim();
              sCh(a => { const n = [...a, { id: Date.now(), t, done: false }]; sv("mz_dh_check_defs", n.map(x => x.t)); return n; });
              setNewCheck("");
            }
          },
          style: { ...S.btn(T.green), width: "auto", padding: "9px 14px", marginTop: 0 }
        }, "+")
      ),
      /*#__PURE__*/React.createElement("button", {
        onClick: () => setShowReport(v => !v),
        style: { width: "100%", marginTop: 12, padding: "10px", background: showReport ? "#1565ff22" : "#1a2840", border: "1px solid #1565ff44", borderRadius: 10, color: "#7aa3d4", fontSize: 13, fontWeight: 700, cursor: "pointer" }
      }, showReport ? "▲ إخفاء تقرير الشهر" : "📊 تقرير الشهر"),
      showReport && /*#__PURE__*/React.createElement("div", { style: { ...S.card("#1565ff11"), border: "1px solid #1565ff22", marginTop: 8 } },
        /*#__PURE__*/React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 10 } }, "📊 تقرير هذا الشهر"),
        monthReport.length === 0
          ? /*#__PURE__*/React.createElement("div", { style: { fontSize: 12, color: "#4a6080", textAlign: "center", padding: 10 } }, "مفيش بيانات لهذا الشهر لسه")
          : monthReport.map((r, i) => {
              const pct = r.total > 0 ? Math.round(r.days / r.total * 100) : 0;
              return /*#__PURE__*/React.createElement("div", { key: i, style: { marginBottom: 8 } },
                /*#__PURE__*/React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 3 } },
                  /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: "#e2e8f0" } }, r.t),
                  /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: pct >= 70 ? T.green : pct >= 40 ? T.orange : T.red } }, r.days, "/", r.total, " (", pct, "%)")
                ),
                /*#__PURE__*/React.createElement(Bar, { v: r.days, max: r.total, c: pct >= 70 ? T.green : pct >= 40 ? T.orange : T.red, h: 5 })
              );
            })
      )
    ),
    /*#__PURE__*/React.createElement("div", { style: S.sub }, "أهدافها 🎯"),
    /*#__PURE__*/React.createElement("div", { style: S.card() },
      gl.map(g => /*#__PURE__*/React.createElement(React.Fragment, { key: g.id },
        /*#__PURE__*/React.createElement("div", {
          style: { display: "flex", gap: 9, alignItems: "center", padding: "7px 0", borderBottom: noteEditId === g.id ? "none" : `1px solid ${T.bdr}` }
        },
          /*#__PURE__*/React.createElement("div", {
            onClick: () => sGl(a => a.map(x => x.id === g.id ? { ...x, done: !x.done } : x)),
            style: { width: 19, height: 19, borderRadius: 99, border: `2px solid ${g.done ? T.blue : "#2a3a55"}`, background: g.done ? T.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }
          }, g.done && /*#__PURE__*/React.createElement("span", { style: { fontSize: 11, color: "#fff", lineHeight: 1 } }, "✓")),
          /*#__PURE__*/React.createElement("span", {
            onClick: () => sGl(a => a.map(x => x.id === g.id ? { ...x, done: !x.done } : x)),
            style: { fontSize: 12, color: g.done ? "#4a6080" : "#e2e8f0", textDecoration: g.done ? "line-through" : "none", flex: 1, cursor: "pointer" }
          }, g.t, g.note && /*#__PURE__*/React.createElement("div", { style: { fontSize: 10, color: "#60a5fa", textDecoration: "none", marginTop: 2 } }, "📝 ", g.note)),
          /*#__PURE__*/React.createElement("span", {
            onClick: () => { setNoteEditId(noteEditId === g.id ? null : g.id); setNoteVal(g.note || ""); },
            style: { fontSize: 13, color: g.note ? "#60a5fa" : "#4a6080", cursor: "pointer", padding: "0 4px" }
          }, "📝"),
          /*#__PURE__*/React.createElement("span", {
            onClick: () => sGl(a => a.filter(x => x.id !== g.id)),
            style: { fontSize: 14, color: T.red, cursor: "pointer", padding: "0 4px", opacity: 0.6 }
          }, "×")
        ),
        noteEditId === g.id && /*#__PURE__*/React.createElement("div", {
          style: { display: "flex", gap: 6, padding: "0 0 9px 27px", borderBottom: `1px solid ${T.bdr}` }
        }, /*#__PURE__*/React.createElement("input", {
          type: "text",
          autoFocus: true,
          placeholder: "ملاحظة... مثلاً حققته بسعر كذا أو في شهر كذا",
          value: noteVal,
          onChange: e => setNoteVal(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") { sGl(a => a.map(x => x.id === g.id ? { ...x, note: noteVal.trim() } : x)); setNoteEditId(null); } },
          style: { ...S.inp, marginBottom: 0, flex: 1, fontSize: 12 }
        }), /*#__PURE__*/React.createElement("button", {
          onClick: () => { sGl(a => a.map(x => x.id === g.id ? { ...x, note: noteVal.trim() } : x)); setNoteEditId(null); },
          style: { background: T.blue, color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }
        }, "حفظ"))
      )),
      /*#__PURE__*/React.createElement("div", { style: { marginTop: 10, display: "flex", gap: 7 } },
        /*#__PURE__*/React.createElement("input", {
          style: { ...S.inp, marginBottom: 0, flex: 1 },
          type: "text",
          placeholder: "أضف هدف جديد...",
          value: newGoal,
          onChange: e => setNewGoal(e.target.value),
          onKeyDown: e => {
            if (e.key === "Enter" && newGoal.trim()) {
              sGl(g => [...g, { id: Date.now(), t: newGoal.trim(), done: false }]);
              setNewGoal("");
            }
          }
        }),
        /*#__PURE__*/React.createElement("button", {
          onClick: () => {
            if (newGoal.trim()) {
              sGl(g => [...g, { id: Date.now(), t: newGoal.trim(), done: false }]);
              setNewGoal("");
            }
          },
          style: { ...S.btn(T.blue), width: "auto", padding: "9px 14px", marginTop: 0 }
        }, "+")
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════
// شاشات الترحيب (Onboarding)
// ══════════════════════════════════════════════════════════════
const APP_NAME = "ميزانيتي";
const ONBOARD_SLIDES = [
  { icon: "💰", title: "نظم مصاريفك", body: "سجل كل مصاريفك واعرف فلوسك بتروح فين بتصنيفات جاهزة وتقارير شهرية" },
  { icon: "📊", title: "ميزانية شخصية محكمة", body: "حط مرتبك ومصادر دخلك التانية واقساطك وسيب باقي الحسبة عالبرنامج وهنحذرك لو وصلت للحد الأدنى" },
  { icon: "🎯", title: "أهداف وإنجازات يومية", body: "عملنالك مكان تحط فيها أهدافك السنوية واليومية وتقرير الأهداف وقدرت تحقق منها إيه" },
  { icon: "⚖️", title: "تابع صحتك بالصور", body: "منسيناش صحتك بردو، تقدر تسجل وزنك كل اسبوع وتضيف صورتك كل أسبوع عشان تعرف والبرنامج هيحسبلك خسرت من وزنك اد ايه وشكل جسمك اختلف ازاي وهتوصل لهدفك امتى، وبتقدر تقارن صورتين بـ AI يقولك الفرق المرئي في جسمك." }
];

function OnboardShell({ children, onSkip, dots, activeDot }) {
  return /*#__PURE__*/React.createElement("div", {
    style: { minHeight: "100vh", background: T.bg, fontFamily: "'Cairo',sans-serif", direction: "rtl", display: "flex", flexDirection: "column", padding: "20px 22px" }
  },
    /*#__PURE__*/React.createElement("div", { style: { textAlign: "left" } },
      onSkip && /*#__PURE__*/React.createElement("span", {
        onClick: onSkip,
        style: { color: "#4a6080", fontSize: 14, cursor: "pointer" }
      }, "تخطي ←")
    ),
    /*#__PURE__*/React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 18 } },
      children
    ),
    dots && /*#__PURE__*/React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 7, marginBottom: 22 } },
      dots.map((_, i) => /*#__PURE__*/React.createElement("div", {
        key: i,
        style: { width: i === activeDot ? 26 : 8, height: 8, borderRadius: 99, background: i === activeDot ? T.purple : "#1a2840", transition: "all .2s" }
      }))
    )
  );
}

function Onboarding({ onComplete }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("slides"); // slides | car1 | car2 | final
  const [hasCar, setHasCar] = useState(null);
  const [hasRide, setHasRide] = useState(null);
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");

  const finish = () => {
    onComplete({ name: name.trim() || "صاحبي", salary: parseFloat(salary) || 0, hasCar: !!hasCar, hasRide: !!hasRide });
  };
  const skipAll = () => onComplete({ name: "صاحبي", salary: 0, hasCar: false, hasRide: false });

  const iconBox = (ic) => /*#__PURE__*/React.createElement("div", {
    style: { width: 130, height: 130, borderRadius: 30, background: "#0f1a2a", border: `1.5px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58 }
  }, ic);
  const btn = (label, onClick, primary) => /*#__PURE__*/React.createElement("button", {
    onClick,
    style: {
      width: "100%", padding: "16px", borderRadius: 14, border: primary ? "none" : `1.5px solid ${T.bdr}`,
      background: primary ? T.purple : "transparent", color: primary ? "#fff" : "#8fa3c4",
      fontFamily: "'Cairo',sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer"
    }
  }, label);

  if (phase === "slides") {
    const s = ONBOARD_SLIDES[idx];
    return /*#__PURE__*/React.createElement(OnboardShell, { onSkip: skipAll, dots: ONBOARD_SLIDES, activeDot: idx },
      iconBox(s.icon),
      /*#__PURE__*/React.createElement("div", { style: { color: "#fff", fontSize: 24, fontWeight: 900 } }, s.title),
      /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 14, lineHeight: 1.9, maxWidth: 340 } }, s.body),
      /*#__PURE__*/React.createElement("div", { style: { width: "100%", maxWidth: 340, display: "flex", gap: 10, marginTop: 8 } },
        idx > 0 && btn("← السابق", () => setIdx(idx - 1), false),
        btn("التالي →", () => idx < ONBOARD_SLIDES.length - 1 ? setIdx(idx + 1) : setPhase("car1"), true)
      )
    );
  }
  if (phase === "car1") {
    return /*#__PURE__*/React.createElement(OnboardShell, { onSkip: skipAll },
      iconBox("🚗"),
      /*#__PURE__*/React.createElement("div", { style: { color: "#fff", fontSize: 22, fontWeight: 900 } }, "عندك عربية؟"),
      /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 13 } }, "عشان نضيفلك تاب خاص بمتابعة صيانتها ومصاريفها"),
      /*#__PURE__*/React.createElement("div", { style: { width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 } },
        btn("🚗 آه، عندي", () => { setHasCar(true); setPhase("car2"); }, true),
        btn("لأ، معنديش", () => { setHasCar(false); setHasRide(false); setPhase("final"); }, false),
        btn("← السابق", () => setPhase("slides"), false)
      )
    );
  }
  if (phase === "car2") {
    return /*#__PURE__*/React.createElement(OnboardShell, { onSkip: skipAll },
      iconBox("🛺"),
      /*#__PURE__*/React.createElement("div", { style: { color: "#fff", fontSize: 22, fontWeight: 900 } }, "بتشتغل عليها في برامج النقل الذكي؟"),
      /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 13 } }, "زي أوبر وإندرايف — عشان نضيفلك تاب لمتابعة الأوردرات والإيرادات"),
      /*#__PURE__*/React.createElement("div", { style: { width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 } },
        btn("🛺 آه، بشتغل بيها", () => { setHasRide(true); setPhase("final"); }, true),
        btn("لأ، للاستخدام الشخصي بس", () => { setHasRide(false); setPhase("final"); }, false),
        btn("← السابق", () => setPhase("car1"), false)
      )
    );
  }
  // final
  return /*#__PURE__*/React.createElement(OnboardShell, null,
    /*#__PURE__*/React.createElement("div", { style: { fontSize: 50 } }, "🙌"),
    /*#__PURE__*/React.createElement("div", { style: { color: "#fff", fontSize: 24, fontWeight: 900 } }, "يلا بينا سوا"),
    /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 13, marginBottom: 6 } }, "خليني أعرف بيانات بسيطة عشان أبدأ معاك"),
    /*#__PURE__*/React.createElement("div", { style: { width: "100%", maxWidth: 340, textAlign: "right" } },
      /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 12, marginBottom: 6 } }, "اسمك"),
      /*#__PURE__*/React.createElement("input", {
        type: "text", placeholder: "مثلاً: أحمد", value: name, onChange: e => setName(e.target.value),
        style: { ...S.inp, marginBottom: 14 }
      }),
      /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 12, marginBottom: 6 } }, "مرتبك الشهري (ج)"),
      /*#__PURE__*/React.createElement("input", {
        type: "number", inputMode: "decimal", placeholder: "مثلاً: 15000", value: salary, onChange: e => setSalary(e.target.value),
        style: { ...S.inp, marginBottom: 18 }
      }),
      btn("🚀 ابتدي بينا", finish, true)
    )
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
function App({ profile, setProfile }) {
  const [entries, setEn] = useState(() => ld("mz_mhapp_v8", []));
  const [deletedXl, setDelXl] = useState(() => ld("mz_mhdelxl_v1", []));
  const [monthly, setMo] = useState(() => {
    const m = ld("mz_mhmonth_v8", {});
    const curMk = currentFinMonth();
    if (profile.salary > 0 && !m[curMk]?.salary && !MONTHLY_PRESET[curMk]?.salary) {
      return { ...m, [curMk]: { ...(m[curMk] || {}), salary: profile.salary } };
    }
    return m;
  });
  const [indExtra, setIE] = useState(() => ld("mz_mhind_v8", []));
  const [tab, setTab] = useState("summary");
  const [homeInitialView, setHomeInitialView] = useState(null);
  const [mk, setMk] = useState(currentFinMonth());
  const [modal, setMod] = useState(false);
  const [syncing, setSync] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const syncTimer = useRef(null);

  // حفظ محلي فوري
  useEffect(() => sv("mz_mhapp_v8", entries), [entries]);
  useEffect(() => sv("mz_mhdelxl_v1", deletedXl), [deletedXl]);
  useEffect(() => sv("mz_mhmonth_v8", monthly), [monthly]);
  useEffect(() => sv("mz_mhind_v8", indExtra), [indExtra]);

  // تنبيهات صيانة العربية والعداد الشهري — بتتفحص كل ما تفتح التطبيق
  useEffect(() => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const today = DK();
      const alerts = computeMaintAlerts(entries);
      // تنبيه العداد الشهري (مرة واحدة في اليوم بحد أقصى)
      if (alerts.needsOdoLog && ld("mz_car_notif_odo_date_v1", "") !== today) {
        new Notification("🚗 دخلنا شهر جديد", { body: "سجّل عداد العربية عشان نقدر نتابعلك مواعيد الصيانة صح" });
        sv("mz_car_notif_odo_date_v1", today);
      }
      // تنبيه البنود القريبة من الميعاد أو المتأخرة (مرة واحدة في اليوم)
      const dueItems = alerts.items.filter(it => it.left !== null && it.left <= 1000);
      if (dueItems.length && ld("mz_car_notif_due_date_v1", "") !== today) {
        const body = dueItems.map(it => it.left <= 0 ? `${it.label}: متأخر ${fmt(Math.abs(it.left))} كم` : `${it.label}: باقي ${fmt(it.left)} كم`).join(" — ");
        new Notification("🔧 ميعاد صيانة العربية قرّب", { body });
        sv("mz_car_notif_due_date_v1", today);
      }
    } catch (e) {
      console.log("Notification failed (not supported on this browser):", e.message);
    }
  }, []);

  // تحميل من السحابة عند أول فتح
  useEffect(() => {
    if (!sb) return;
    (async () => {
      setSync(true);
      const [e, m, i] = await Promise.all([cloudLoad("entries"), cloudLoad("monthly"), cloudLoad("indExtra")]);
      // Merge: السحابة تغطي على المحلي بس لو في بيانات أحدث
      const localE = ld("mz_mhapp_v8", []);
      const localM = ld("mz_mhmonth_v8", {});
      const localI = ld("mz_mhind_v8", []);
      // نستخدم السحابة كمصدر أساسي ونضيف أي entries محلية مش موجودة فيها
      if (e) {
        const cloudIds = new Set(e.map(x => x.id));
        const merged = [...e, ...localE.filter(x => !cloudIds.has(x.id))];
        setEn(merged);
        sv("mz_mhapp_v8", merged);
      }
      if (m) {
        // السحابة هي المصدر الأساسي (آخر حفظ من أي جهاز)، والمحلي يكمّل بس الشهور غير الموجودة فيها
        const mergedM = { ...localM, ...m };
        setMo(mergedM);
        sv("mz_mhmonth_v8", mergedM);
      }
      if (i) {
        const cloudIdsI = new Set(i.map(x => x.id));
        const mergedI = [...i, ...localI.filter(x => !cloudIdsI.has(x.id))];
        setIE(mergedI);
        sv("mz_mhind_v8", mergedI);
      }
      setSync(false);
      setLastSync(new Date());
    })();
  }, []);

  // حفظ على السحابة بعد كل تغيير (debounced 2 ثانية)
  const debouncedCloudSync = useCallback((e, m, i) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      if (!sb) return;
      setSync(true);
      await Promise.all([cloudSave("entries", e), cloudSave("monthly", m), cloudSave("indExtra", i)]);
      setSync(false);
      setLastSync(new Date());
    }, 2000);
  }, []);
  useEffect(() => {
    debouncedCloudSync(entries, monthly, indExtra);
  }, [entries, monthly, indExtra]);
  const addE = useCallback(e => setEn(p => [e, ...p]), []);
  const updateE = useCallback((id, patch) => {
    setEn(p => {
      const exists = p.some(e => e.id === id);
      if (exists) return p.map(e => e.id === id ? { ...e, ...patch } : e);
      // مش موجود في entries (يبقى من الداتا القديمة الثابتة CAR_DATA) — نضيفه كـ override
      const seedEntry = CAR_DATA.find(e => e.id === id);
      if (seedEntry) return [{ ...seedEntry, ...patch, type: "car" }, ...p];
      return p;
    });
  }, []);
  const delE = useCallback(id => {
    if (String(id).startsWith("xl") || String(id).startsWith("dh")) {
      setDelXl(p => [...new Set([...p, id])]);
    } else {
      setEn(p => p.filter(e => e.id !== id));
    }
  }, []);
  const saveM = useCallback((k, d) => {
    setMo(p => ({
      ...p,
      [k]: d
    }));
    setMod(false);
  }, []);
  const addInd = useCallback(e => setIE(p => [e, ...p]), []);
  const delInd = useCallback(id => setIE(p => p.filter(e => e.id !== id)), []);
  const [, m] = mk.split("-").map(Number);
  const hasSal = !!(monthly[mk]?.salary || MONTHLY_PRESET[mk]?.salary);
  const NAV = [{
    k: "summary",
    ic: "📊",
    l: "ملخص"
  }, {
    k: "food",
    ic: "🛒",
    l: "أنا"
  }, {
    k: "car",
    ic: "🚗",
    l: "العربية"
  }, {
    k: "indrive",
    ic: "🛺",
    l: "إندرايف"
  }, {
    k: "goals",
    ic: "🎯",
    l: "أهدافي"
  }].filter(n => (n.k !== "car" || profile.hasCar) && (n.k !== "indrive" || profile.hasRide));
  return /*#__PURE__*/React.createElement("div", {
    style: S.root
  }, /*#__PURE__*/React.createElement("style", null, `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box;}input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;}
    ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1a2840;border-radius:99px;}`), tab === "summary" && /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 0" }
  }, /*#__PURE__*/React.createElement("div", {
    style: { width: 26, height: 26, borderRadius: 8, background: T.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }
  }, "💰"), /*#__PURE__*/React.createElement("span", {
    style: { fontSize: 13, fontWeight: 900, color: "#8fa3c4" }
  }, APP_NAME)), /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.bg,
      padding: "12px 14px 0",
      borderBottom: `1px solid ${T.bdr}`,
      position: "sticky",
      top: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 900,
      color: "#fff"
    }
  }, tab === "summary" ? "📊 الملخص" : tab === "food" ? "👨 أنا" : tab === "car" ? "🚗 العربية" : tab === "indrive" ? "🛺 إندرايف" : "🎯 أهدافي"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "#2a3a55"
    }
  }, profile.name), /*#__PURE__*/React.createElement("span", {
    onClick: () => { if (window.confirm("تسجيل خروج؟")) authSignOut().then(() => window.location.reload()); },
    style: { fontSize: 10, color: "#4a6080", cursor: "pointer", textDecoration: "underline" }
  }, "🚪 خروج"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      alignItems: "center"
    }
  }, tab !== "goals" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setMk(addM(mk, -1)),
    style: {
      background: T.card,
      border: `1px solid ${T.bdr}`,
      borderRadius: 7,
      padding: "4px 9px",
      color: "#4a6080",
      cursor: "pointer",
      fontSize: 14,
      lineHeight: 1
    }
  }, "‹"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: "#64748b",
      minWidth: 48,
      textAlign: "center"
    }
  }, MONTHS[m - 1]), /*#__PURE__*/React.createElement("button", {
    onClick: () => setMk(addM(mk, 1)),
    style: {
      background: T.card,
      border: `1px solid ${T.bdr}`,
      borderRadius: 7,
      padding: "4px 9px",
      color: "#4a6080",
      cursor: "pointer",
      fontSize: 14,
      lineHeight: 1
    }
  }, "›")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setMod(true),
    style: {
      background: hasSal ? "#10b98122" : "#f59e0b22",
      border: `1px solid ${hasSal ? "#10b98144" : "#f59e0b44"}`,
      borderRadius: 8,
      padding: "5px 10px",
      color: hasSal ? T.green : T.orange,
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      fontFamily: "'Cairo',sans-serif"
    }
  }, "✏️")))), tab === "summary" && /*#__PURE__*/React.createElement(SummaryScreen, {
    entries: entries,
    mk: mk,
    monthly: monthly,
    indExtra: indExtra,
    setTab: setTab,
    deletedXl: deletedXl,
    goAddHome: () => {
      setHomeInitialView("add");
      setTab("food");
    }
  }), tab === "food" && /*#__PURE__*/React.createElement(CategoryScreen, {
    entries: entries,
    onAdd: addE,
    onDel: delE,
    mk: mk,
    monthly: monthly,
    initialView: homeInitialView,
    onConsumeInitialView: () => setHomeInitialView(null),
    dataSource: HOME_DATA.filter(e => !deletedXl.includes(e.id)),
    categories: HC,
    entryType: "home",
    idPrefix: "hn",
    headerLabel: "أنا",
    noBudget: true,
    addTitle: "إضافة مصروف بيت"
  }), tab === "car" && /*#__PURE__*/React.createElement(CarScreen, {
    entries: entries,
    onAdd: addE,
    onDel: delE,
    onUpdate: updateE,
    mk: mk
  }), tab === "indrive" && /*#__PURE__*/React.createElement(IndriveScreen, {
    indExtra: indExtra,
    onAddInd: addInd,
    onDelInd: delInd,
    mk: mk
  }), tab === "goals" && /*#__PURE__*/React.createElement(GoalsScreen, {
    monthly: monthly
  }), modal && /*#__PURE__*/React.createElement(SalaryModal, {
    mk: mk,
    monthly: monthly,
    entries: entries,
    indExtra: indExtra,
    deletedXl: deletedXl,
    onSave: saveM,
    onClose: () => setMod(false)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      maxWidth: 480,
      margin: "0 auto",
      background: T.bg,
      borderTop: `1px solid ${T.bdr}`,
      display: "flex",
      zIndex: 20
    }
  }, NAV.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.k,
    onClick: () => setTab(n.k),
    style: {
      flex: 1,
      padding: "10px 0",
      border: "none",
      background: "transparent",
      color: tab === n.k ? T.blue : "#2a3a55",
      fontFamily: "'Cairo',sans-serif",
      fontSize: 10,
      fontWeight: 700,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 19
    }
  }, n.ic), /*#__PURE__*/React.createElement("span", null, n.l)))));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.log("React render crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return /*#__PURE__*/React.createElement("div", {
        style: { color: "#fff", background: "#0a0f1a", minHeight: "100vh", padding: 20, fontFamily: "monospace", direction: "ltr", textAlign: "left", fontSize: 13, whiteSpace: "pre-wrap" }
      }, "⚠️ حصل خطأ في التطبيق:\n\n" + (this.state.error.message || String(this.state.error)) + "\n\n" + (this.state.error.stack || ""));
    }
    return this.props.children;
  }
}
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setErr(""); setMsg("");
    if (!email.trim() || !password) { setErr("اكتب الإيميل وكلمة السر"); return; }
    if (password.length < 6) { setErr("كلمة السر لازم تكون 6 حروف/أرقام على الأقل"); return; }
    setBusy(true);
    const res = mode === "signup" ? await authSignUp(email.trim(), password) : await authSignIn(email.trim(), password);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    if (res.needsConfirm) { setMsg("تمام، بعتنالك إيميل تأكيد — افتحه ودوس على الرابط، وبعدين ارجع سجّل دخول هنا."); return; }
    onAuthed();
  };

  const inp = (props) => /*#__PURE__*/React.createElement("input", { ...props, style: { ...S.inp, marginBottom: 12 } });
  return /*#__PURE__*/React.createElement("div", {
    style: { minHeight: "100vh", background: T.bg, fontFamily: "'Cairo',sans-serif", direction: "rtl", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px 22px" }
  },
    /*#__PURE__*/React.createElement("div", {
      style: { width: 90, height: 90, borderRadius: 24, background: "#0f1a2a", border: `1.5px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, marginBottom: 16 }
    }, "💰"),
    /*#__PURE__*/React.createElement("div", { style: { color: "#fff", fontSize: 20, fontWeight: 900, marginBottom: 4 } }, APP_NAME),
    /*#__PURE__*/React.createElement("div", { style: { color: "#8fa3c4", fontSize: 13, marginBottom: 22 } }, mode === "signup" ? "اعمل حساب جديد" : "سجّل دخولك"),
    /*#__PURE__*/React.createElement("div", { style: { width: "100%", maxWidth: 340 } },
      inp({ type: "email", placeholder: "الإيميل", value: email, onChange: e => setEmail(e.target.value), autoCapitalize: "none" }),
      inp({ type: "password", placeholder: "كلمة السر (6 حروف/أرقام على الأقل)", value: password, onChange: e => setPassword(e.target.value) }),
      err && /*#__PURE__*/React.createElement("div", { style: { color: T.red, fontSize: 12, marginBottom: 10, textAlign: "center" } }, "⚠️ ", err),
      msg && /*#__PURE__*/React.createElement("div", { style: { color: T.green, fontSize: 12, marginBottom: 10, textAlign: "center" } }, "✅ ", msg),
      /*#__PURE__*/React.createElement("button", {
        onClick: submit,
        disabled: busy,
        style: { width: "100%", padding: "16px", borderRadius: 14, border: "none", background: T.purple, color: "#fff", fontFamily: "'Cairo',sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, marginBottom: 12 }
      }, busy ? "لحظة..." : (mode === "signup" ? "🚀 اعمل الحساب" : "تسجيل الدخول")),
      /*#__PURE__*/React.createElement("div", {
        onClick: () => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); setMsg(""); },
        style: { textAlign: "center", color: "#4a6080", fontSize: 12, cursor: "pointer" }
      }, mode === "signup" ? "عندك حساب بالفعل؟ سجّل دخول" : "لسه معملتش حساب؟ اعمل واحد")
    )
  );
}
function AppGate() {
  const [profile, setProfileState] = useState(() => ld("mz_profile_v1", null));
  const setProfile = (p) => { sv("mz_profile_v1", p); setProfileState(p); };
  if (!profile) {
    return /*#__PURE__*/React.createElement(Onboarding, { onComplete: setProfile });
  }
  return /*#__PURE__*/React.createElement(App, { profile, setProfile });
}
function Root() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    authGetSession().then(user => {
      setAuthed(!!user);
      setAuthChecked(true);
      if (user) cloudPullAll().finally(() => setNonce(n => n + 1));
    });
  }, []);

  if (!authChecked) {
    return /*#__PURE__*/React.createElement("div", {
      style: { minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a6080", fontFamily: "'Cairo',sans-serif" }
    }, "...");
  }
  if (!authed) {
    return /*#__PURE__*/React.createElement(AuthScreen, {
      onAuthed: () => { setAuthed(true); cloudPullAll().finally(() => setNonce(n => n + 1)); }
    });
  }
  return /*#__PURE__*/React.createElement(AppGate, { key: nonce });
}
root.render(/*#__PURE__*/React.createElement(ErrorBoundary, null, React.createElement(Root)));
  });
})();