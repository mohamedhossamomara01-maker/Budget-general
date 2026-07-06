// ══════════════════════════════════════════════════════════════
// BUDGET APP — General Version
// ══════════════════════════════════════════════════════════════
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ── Supabase
const SUPABASE_URL = "https://nkcfosifswvaoqlfliww.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rY2Zvc2lmc3d2YW9xbGZsaXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjY3ODksImV4cCI6MjA5NzI0Mjc4OX0.mKg8mXOrfDayAKuGGm9GzU-F2jnONp8hb0tJ9XmsMCI";
let sb = null;
try { if (SUPABASE_URL !== "YOUR_URL") sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch {}

// ── Local Storage
const ld = (k, d) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ── Cloud
async function cloudLoad(uid, key) {
  if (!sb) return null;
  try {
    const { data } = await sb.from("budget_data").select("value").eq("user_id", uid).eq("key", key).single();
    return data ? JSON.parse(data.value) : null;
  } catch { return null; }
}
async function cloudSave(uid, key, value) {
  if (!sb) return;
  try {
    await sb.from("budget_data").upsert({ user_id: uid, key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  } catch {}
}

// ── Helpers
const DK = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const MK = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const finKey = date => MK(new Date(date + "T12:00:00"));
const SUM = a => a.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const fmt = n => Math.abs(Number(n) || 0).toLocaleString("ar-EG");
const PCT = (a, b) => b ? Math.min(100, Math.round(a/b*100)) : 0;
const catF = (list, id) => list.find(c => c.id === id) || list[list.length-1] || {ic:"📌",l:"أخرى",c:"#888"};
const genUID = () => "user_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const currentFinMonth = () => MK(new Date());
const addM = (mk, n) => { const [y,m] = mk.split("-").map(Number); const d = new Date(y, m-1+n, 1); return MK(d); };
const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

// ── Theme
const T = { bg:"#0a0f1a", card:"#111827", blue:"#1565ff", green:"#10b981", red:"#ef4444", orange:"#f59e0b", text:"#e2e8f0", sub:"#4a6080", bdr:"#1a2840" };

// ── Styles
const S = {
  card: (bg) => ({ background: bg || T.card, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }),
  row: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  sub: { fontSize: 11, color: T.sub, fontWeight: 700, marginBottom: 6, marginTop: 4, textAlign:"right" },
  inp: { width:"100%", background:"#0f1a2a", border:`1px solid ${T.bdr}`, borderRadius:10, padding:"11px 13px", color:T.text, fontSize:14, marginBottom:8, textAlign:"right", boxSizing:"border-box", display:"block" },
  btn: (c) => ({ width:"100%", background: c||T.blue, border:"none", borderRadius:12, padding:"13px", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginTop:4 }),
  lbl: { fontSize:11, color:T.sub },
};

// ── Components
function Bar({ v, max, c, h }) {
  return React.createElement("div", { style:{ background:"#1a2840", borderRadius:99, overflow:"hidden", height:h||7, marginBottom:4 } },
    React.createElement("div", { style:{ width: PCT(v,max)+"%", background: c||T.blue, height:"100%", borderRadius:99, transition:"width 0.3s" } })
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return React.createElement("div", { style:{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:T.text, padding:"10px 20px", borderRadius:12, fontSize:13, zIndex:999, boxShadow:"0 4px 20px #0008", whiteSpace:"nowrap" } }, msg);
}

// ── Categories
const CATS = [
  { id:"basics", l:"الأساسيات", ic:"🛒", c:"#3b82f6" },
  { id:"food", l:"الأكل", ic:"🍳", c:"#f59e0b" },
  { id:"cleaning", l:"المنظفات", ic:"🧴", c:"#06b6d4" },
  { id:"meat", l:"لحوم وفراخ", ic:"🥩", c:"#ef4444" },
  { id:"dairy", l:"بيض وألبان", ic:"🥚", c:"#fbbf24" },
  { id:"vegetables", l:"خضار", ic:"🥦", c:"#22c55e" },
  { id:"fruits", l:"فاكهة", ic:"🍎", c:"#f43f5e" },
  { id:"pantry", l:"العطارة", ic:"🌿", c:"#34d399" },
  { id:"house", l:"مستلزمات البيت", ic:"🏡", c:"#60a5fa" },
  { id:"health", l:"صحة وعلاج", ic:"💊", c:"#fb923c" },
  { id:"outing", l:"خروجات وتسالي", ic:"🎡", c:"#f472b6" },
  { id:"saving", l:"تحويش", ic:"💰", c:"#a78bfa" },
  { id:"other", l:"أخرى", ic:"📌", c:"#888" },
];

// ══════════════════════════════════════════════════════════════
// SETUP SCREEN
// ══════════════════════════════════════════════════════════════
function SetupScreen({ onDone }) {
  const [step, setStep] = useState("welcome"); // welcome | register
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const [err, setErr] = useState("");

  const features = [
    {
      icon: "💰",
      title: "نظّم مصاريفك بذكاء",
      desc: "سجّل كل مصروف في ثانية وشوف فين بتروح فلوسك — تصنيفات جاهزة وتقارير شهرية واضحة. هتعرف تقول 'في الأمان' بثقة كل أول شهر."
    },
    {
      icon: "📊",
      title: "ميزانية شخصية دقيقة",
      desc: "أضيف مرتبك وأقساطك الثابتة ومصادر دخلك التانية — التطبيق هيحسبلك الباقي تلقائياً ويحذرك لو اقتربت من الحد."
    },
    {
      icon: "🎯",
      title: "أهداف وإنجازات يومية",
      desc: "اكتب أهدافك السنوية وتابعها خطوة خطوة. وكل يوم شيّل على اللي عملته — أذكار، تمرين، أكل صح — وشوف تقرير شهرك في لحظة."
    },
    {
      icon: "⚖️",
      title: "تابع صحتك بالصور والـ AI",
      desc: "سجّل وزنك كل أسبوع واضغط صورة — التطبيق هيحسبلك معدل خسارتك ومتى هتوصل لهدفك. وبتقدر تقارن صورتين بـ AI يقولك الفرق المرئي في جسمك."
    }
  ];

  const cur = features[page];

  if (step === "welcome") return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#060d1a", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }
  },
    // Stars bg
    React.createElement("div", { style:{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 20% 20%, #1565ff0a 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #10b9810a 0%, transparent 50%)", pointerEvents:"none" } }),

    // Skip
    React.createElement("div", { style:{ display:"flex", justifyContent:"flex-start", padding:"16px 20px", position:"relative", zIndex:1 } },
      React.createElement("button", { onClick:()=>setStep("register"), style:{ background:"none", border:"none", color:T.sub, fontSize:13, cursor:"pointer" } }, "تخطي →")
    ),

    // Content
    React.createElement("div", { style:{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 28px 20px", position:"relative", zIndex:1 } },

      // Icon circle
      React.createElement("div", { style:{ width:100, height:100, borderRadius:28, background:"linear-gradient(135deg,#0d1e3a,#1a3a6e)", border:"1.5px solid #1565ff33", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:24, boxShadow:"0 0 40px #1565ff1a" } },
        React.createElement("span", { style:{ fontSize:48 } }, cur.icon)
      ),

      // Title
      React.createElement("div", { style:{ fontSize:22, fontWeight:900, color:T.text, textAlign:"center", marginBottom:12, lineHeight:1.3 } }, cur.title),

      // Description
      React.createElement("div", { style:{ fontSize:14, color:"#6a8ab0", textAlign:"center", lineHeight:1.8, maxWidth:340 } }, cur.desc),

      // Dots
      React.createElement("div", { style:{ display:"flex", gap:8, marginTop:32, marginBottom:32 } },
        features.map((_, i) => React.createElement("div", { key:i, onClick:()=>setPage(i), style:{ width:i===page?24:8, height:8, borderRadius:99, background:i===page?T.blue:"#1a2840", transition:"all 0.3s", cursor:"pointer" } }))
      ),

      // Buttons
      React.createElement("div", { style:{ display:"flex", gap:12, width:"100%", maxWidth:340 } },
        page > 0 && React.createElement("button", {
          onClick:()=>setPage(p=>p-1),
          style:{ flex:1, padding:"14px", borderRadius:12, border:"1px solid #1a2840", background:"transparent", color:T.sub, fontSize:14, fontWeight:700, cursor:"pointer" }
        }, "← السابق"),
        React.createElement("button", {
          onClick:()=>{ if(page<features.length-1) setPage(p=>p+1); else setStep("register"); },
          style:{ flex:2, padding:"14px", borderRadius:12, border:"none", background:T.blue, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px #1565ff33" }
        }, page < features.length-1 ? "التالي ←" : "ابتدي دلوقتي 🚀")
      )
    )
  );

  // Register step
  return React.createElement("div", { style:{ minHeight:"100vh", background:T.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 } },
    React.createElement("div", { style:{ fontSize:44, marginBottom:12 } }, "👋"),
    React.createElement("div", { style:{ fontSize:22, fontWeight:900, color:T.text, marginBottom:6, textAlign:"center" } }, "أهلاً بيك في مصروفي!"),
    React.createElement("div", { style:{ fontSize:13, color:T.sub, marginBottom:28, textAlign:"center" } }, "خليني أعرف بيانات بسيطة عشان أبدأ معاك"),
    React.createElement("div", { style:{ width:"100%", maxWidth:400 } },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:4, textAlign:"right" } }, "اسمك"),
      React.createElement("input", { style:S.inp, placeholder:"مثلاً: أحمد", value:name, onChange:e=>setName(e.target.value) }),
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:4, textAlign:"right" } }, "مرتبك الشهري (ج)"),
      React.createElement("input", { style:S.inp, type:"number", placeholder:"مثلاً: 15000", inputMode:"decimal", value:salary, onChange:e=>setSalary(e.target.value) }),
      err && React.createElement("div", { style:{ color:T.red, fontSize:12, textAlign:"center", marginBottom:8 } }, err),
      React.createElement("button", { style:{ ...S.btn(), boxShadow:"0 4px 20px #1565ff33" }, onClick:()=>{
        if (!name.trim()) { setErr("اكتب اسمك الأول"); return; }
        if (!salary || isNaN(salary)) { setErr("اكتب مرتبك"); return; }
        const uid = genUID();
        const profile = { name: name.trim(), salary: +salary, createdAt: new Date().toISOString() };
        sv("budget_uid", uid);
        sv("budget_profile", profile);
        cloudSave(uid, "profile", profile);
        onDone(uid, profile);
      } }, "ابتدي مصروفي 🚀")
    )
  );
}

// ══════════════════════════════════════════════════════════════
// EXPENSES SCREEN
// ══════════════════════════════════════════════════════════════
function ExpensesScreen({ uid, userName, entries, onAdd, onDel, mk }) {
  const [form, setForm] = useState({ amount:"", cat:"basics", note:"", date:DK() });
  const [view, setView] = useState("month");
  const [toast, setToast] = useState("");

  useEffect(() => { if (toast) { const t = setTimeout(()=>setToast(""),2000); return ()=>clearTimeout(t); } }, [toast]);

  const month = entries.filter(e => finKey(e.date) === mk);
  const today = entries.filter(e => e.date === DK());
  const mTot = SUM(month);
  const tTot = SUM(today);
  const shown = view === "today" ? today : month;

  const doAdd = () => {
    const a = parseFloat(form.amount);
    if (!a || a <= 0) { setToast("ادخل مبلغ"); return; }
    onAdd({ id:`en${Date.now()}`, type:"expense", amount:a, cat:form.cat, note:form.note.trim(), date:form.date });
    setForm(f => ({ ...f, amount:"", note:"" }));
    setToast("✅ اتضاف");
    setView("month");
  };

  return React.createElement("div", null,
    // Header stats
    React.createElement("div", { style:{ ...S.card(), marginBottom:8 } },
      React.createElement("div", { style:{ ...S.row, marginBottom:6 } },
        React.createElement("span", { style:{ fontSize:13, color:T.sub } }, "مصاريف الشهر"),
        React.createElement("span", { style:{ fontSize:18, fontWeight:900, color:mTot>0?T.red:T.sub } }, fmt(mTot), " ج")
      ),
      React.createElement("div", { style:{ ...S.row } },
        React.createElement("span", { style:{ fontSize:11, color:T.sub } }, "النهارده"),
        React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:T.orange } }, fmt(tTot), " ج")
      )
    ),

    // Tabs
    React.createElement("div", { style:{ display:"flex", gap:6, marginBottom:10 } },
      ["today","add","month"].map(v =>
        React.createElement("button", { key:v, onClick:()=>setView(v), style:{ flex:1, padding:"9px 4px", borderRadius:10, border:"none", background:view===v?T.blue:"#1a2840", color:view===v?"#fff":T.sub, fontSize:12, fontWeight:700, cursor:"pointer" } },
          v==="today"?"النهارده":v==="add"?"+ أضف":"الشهر"
        )
      )
    ),

    // Add form
    view === "add" && React.createElement("div", { style:S.card() },
      React.createElement("div", { style:{ fontSize:12, color:T.sub, marginBottom:8, textAlign:"right" } }, "إضافة مصروف"),
      React.createElement("input", { style:S.inp, type:"number", placeholder:"المبلغ (ج)", inputMode:"decimal", value:form.amount, onChange:e=>setForm(f=>({...f,amount:e.target.value})) }),
      React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 } },
        CATS.map(c => React.createElement("button", { key:c.id, onClick:()=>setForm(f=>({...f,cat:c.id})), style:{ padding:"7px 10px", borderRadius:8, border:`2px solid ${form.cat===c.id?c.c:"#1a2840"}`, background:form.cat===c.id?c.c+"22":"transparent", color:form.cat===c.id?c.c:T.sub, fontSize:11, cursor:"pointer" } },
          c.ic+" "+c.l
        ))
      ),
      React.createElement("input", { style:{ ...S.inp, fontSize:12 }, placeholder:"ملاحظة (اختياري)", value:form.note, onChange:e=>setForm(f=>({...f,note:e.target.value})) }),
      React.createElement("input", { style:{ ...S.inp, fontSize:12 }, type:"date", value:form.date, onChange:e=>setForm(f=>({...f,date:e.target.value})) }),
      React.createElement("button", { style:S.btn(), onClick:doAdd }, "إضافة ✓")
    ),

    // Entries list
    view !== "add" && React.createElement("div", { style:S.card() },
      shown.length === 0
        ? React.createElement("div", { style:{ textAlign:"center", color:T.sub, fontSize:13, padding:20 } }, view==="today"?"مفيش مصاريف النهارده":"مفيش مصاريف الشهر ده")
        : shown.map(e => {
            const c = catF(CATS, e.cat);
            const isNew = e.id.startsWith("en");
            return React.createElement("div", { key:e.id, style:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:`1px solid ${T.bdr}` } },
              React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
                React.createElement("span", { style:{ fontSize:18 } }, c.ic),
                React.createElement("div", null,
                  React.createElement("div", { style:{ fontSize:12, fontWeight:700, color:T.text } }, e.note || c.l),
                  React.createElement("div", { style:{ fontSize:10, color:T.sub } }, e.date, " · ", c.l)
                )
              ),
              React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
                React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:c.c } }, fmt(e.amount), " ج"),
                isNew && React.createElement("button", { onClick:()=>onDel(e.id), style:{ background:"none", border:"none", cursor:"pointer", color:T.sub, fontSize:14 } }, "🗑️")
              )
            );
          })
    ),
    React.createElement(Toast, { msg:toast })
  );
}

// ══════════════════════════════════════════════════════════════
// GOALS SCREEN
// ══════════════════════════════════════════════════════════════
function GoalsScreen({ uid, profile }) {
  const todayKey = DK();
  const dailyKey = `budget_daily_${todayKey}`;
  const [checks, setChecks] = useState(() => ld(dailyKey, []));
  const [goals, setGoals] = useState(() => ld(`budget_goals_${uid}`, []));
  const [newCheck, setNewCheck] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [showReport, setShowReport] = useState(false);

  useEffect(() => { sv(dailyKey, checks); }, [checks]);
  useEffect(() => { sv(`budget_goals_${uid}`, goals); cloudSave(uid, "goals", goals); }, [goals]);

  const dp = checks.length > 0 ? Math.round(checks.filter(c=>c.done).length/checks.length*100) : 0;

  const monthReport = useMemo(() => {
    const year = todayKey.slice(0,7);
    const report = {};
    for (let d=1; d<=31; d++) {
      const dk = `${year}-${String(d).padStart(2,"0")}`;
      const day = ld(`budget_daily_${dk}`, null);
      if (day) day.forEach(item => {
        if (!report[item.id]) report[item.id] = { t:item.t, days:0, total:0 };
        report[item.id].total++;
        if (item.done) report[item.id].days++;
      });
    }
    return Object.values(report).filter(r=>r.total>0);
  }, [showReport]);

  return React.createElement("div", null,
    // Daily checks
    React.createElement("div", { style:S.sub }, "إنجازاتك اليوم"),
    React.createElement("div", { style:S.card() },
      React.createElement("div", { style:{ ...S.row, marginBottom:7 } },
        React.createElement("span", { style:{ fontSize:13, fontWeight:700 } }, "الإنجاز اليومي"),
        React.createElement("span", { style:{ fontSize:18, fontWeight:900, color:dp>=70?T.green:T.orange } }, dp, "%")
      ),
      React.createElement(Bar, { v:dp, max:100, c:T.green }),
      React.createElement("div", { style:{ marginTop:10 } },
        checks.map(c => React.createElement("div", { key:c.id, style:{ display:"flex", gap:9, alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.bdr}` } },
          React.createElement("div", { onClick:()=>setChecks(a=>a.map(x=>x.id===c.id?{...x,done:!x.done}:x)), style:{ width:19, height:19, borderRadius:4, border:`2px solid ${c.done?T.green:"#2a3a55"}`, background:c.done?T.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" } },
            c.done && React.createElement("span", { style:{ fontSize:11, color:"#fff" } }, "✓")
          ),
          React.createElement("span", { onClick:()=>setChecks(a=>a.map(x=>x.id===c.id?{...x,done:!x.done}:x)), style:{ fontSize:12, color:c.done?"#4a6080":T.text, textDecoration:c.done?"line-through":"none", flex:1, cursor:"pointer" } }, c.t),
          React.createElement("span", { onClick:()=>setChecks(a=>a.filter(x=>x.id!==c.id)), style:{ fontSize:14, color:T.red, cursor:"pointer", opacity:0.6 } }, "×")
        ))
      ),
      React.createElement("div", { style:{ display:"flex", gap:7, marginTop:10 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, placeholder:"أضف إنجاز...", value:newCheck, onChange:e=>setNewCheck(e.target.value), onKeyDown:e=>{ if(e.key==="Enter"&&newCheck.trim()){ setChecks(a=>[...a,{id:`c${Date.now()}`,t:newCheck.trim(),done:false}]); setNewCheck(""); } } }),
        React.createElement("button", { onClick:()=>{ if(newCheck.trim()){ setChecks(a=>[...a,{id:`c${Date.now()}`,t:newCheck.trim(),done:false}]); setNewCheck(""); } }, style:{ ...S.btn(T.green), width:"auto", padding:"9px 14px", marginTop:0 } }, "+")
      ),
      React.createElement("button", { onClick:()=>setShowReport(v=>!v), style:{ width:"100%", marginTop:12, padding:"10px", background:showReport?"#1565ff22":"#1a2840", border:"1px solid #1565ff44", borderRadius:10, color:"#7aa3d4", fontSize:13, fontWeight:700, cursor:"pointer" } }, showReport?"▲ إخفاء تقرير الشهر":"📊 تقرير الشهر"),
      showReport && React.createElement("div", { style:{ ...S.card("#1565ff11"), border:"1px solid #1565ff22", marginTop:8 } },
        React.createElement("div", { style:{ fontSize:13, fontWeight:700, color:T.blue, marginBottom:10 } }, "📊 تقرير هذا الشهر"),
        monthReport.length === 0
          ? React.createElement("div", { style:{ fontSize:12, color:T.sub, textAlign:"center", padding:10 } }, "مفيش بيانات لسه")
          : monthReport.map((r,i) => { const pct = r.total>0?Math.round(r.days/r.total*100):0; return React.createElement("div", { key:i, style:{ marginBottom:8 } },
              React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", marginBottom:3 } },
                React.createElement("span", { style:{ fontSize:11, color:T.text } }, r.t),
                React.createElement("span", { style:{ fontSize:11, fontWeight:700, color:pct>=70?T.green:pct>=40?T.orange:T.red } }, r.days,"/",r.total," (",pct,"%)")
              ),
              React.createElement(Bar, { v:r.days, max:r.total, c:pct>=70?T.green:pct>=40?T.orange:T.red, h:5 })
            ); })
      )
    ),

    React.createElement(WeightTracker, { uid, name:profile?.name, goalWeight:80 }),
    // Goals
    React.createElement("div", { style:S.sub }, "أهدافي 🎯"),
    React.createElement("div", { style:S.card() },
      goals.map(g => React.createElement("div", { key:g.id, style:{ display:"flex", gap:9, alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.bdr}` } },
        React.createElement("div", { onClick:()=>setGoals(a=>a.map(x=>x.id===g.id?{...x,done:!x.done}:x)), style:{ width:19, height:19, borderRadius:99, border:`2px solid ${g.done?T.blue:"#2a3a55"}`, background:g.done?T.blue:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer" } },
          g.done && React.createElement("span", { style:{ fontSize:11, color:"#fff" } }, "✓")
        ),
        React.createElement("span", { onClick:()=>setGoals(a=>a.map(x=>x.id===g.id?{...x,done:!x.done}:x)), style:{ fontSize:12, color:g.done?"#4a6080":T.text, textDecoration:g.done?"line-through":"none", flex:1, cursor:"pointer" } }, g.t),
        React.createElement("span", { onClick:()=>setGoals(a=>a.filter(x=>x.id!==g.id)), style:{ fontSize:14, color:T.red, cursor:"pointer", opacity:0.6 } }, "×")
      )),
      React.createElement("div", { style:{ display:"flex", gap:7, marginTop:10 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, placeholder:"أضف هدف جديد...", value:newGoal, onChange:e=>setNewGoal(e.target.value), onKeyDown:e=>{ if(e.key==="Enter"&&newGoal.trim()){ setGoals(a=>[...a,{id:`g${Date.now()}`,t:newGoal.trim(),done:false}]); setNewGoal(""); } } }),
        React.createElement("button", { onClick:()=>{ if(newGoal.trim()){ setGoals(a=>[...a,{id:`g${Date.now()}`,t:newGoal.trim(),done:false}]); setNewGoal(""); } }, style:{ ...S.btn(T.blue), width:"auto", padding:"9px 14px", marginTop:0 } }, "+")
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════
// SUMMARY SCREEN
// ══════════════════════════════════════════════════════════════
function SummaryScreen({ uid, profile, entries, mk, onMkChange, installments, incomes }) {
  const salary = profile.salary || 0;
  const extraIncome = (incomes||[]).reduce((s,i)=>s+(+i.amount||0),0);
  const totalIncome = salary + extraIncome;
  const totalInstallments = (installments||[]).reduce((s,i)=>s+(+i.amount||0),0);
  const month = entries.filter(e => finKey(e.date) === mk);
  const mTot = SUM(month);
  const mSaving = SUM(month.filter(e=>e.cat==="saving"));
  const balance = totalIncome - mTot - totalInstallments;

  const bycat = CATS.map(c => ({ ...c, total: SUM(month.filter(e=>e.cat===c.id)) })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const [y, m] = mk.split("-").map(Number);
  const mnLabel = MONTHS[m-1] + " " + y;

  return React.createElement("div", null,
    // Month nav
    React.createElement("div", { style:{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:10 } },
      React.createElement("button", { onClick:()=>onMkChange(addM(mk,-1)), style:{ background:"#1a2840", border:"none", borderRadius:8, color:T.text, padding:"6px 12px", cursor:"pointer", fontSize:16 } }, "‹"),
      React.createElement("span", { style:{ fontSize:14, fontWeight:700, color:T.text } }, mnLabel),
      React.createElement("button", { onClick:()=>onMkChange(addM(mk,1)), style:{ background:"#1a2840", border:"none", borderRadius:8, color:T.text, padding:"6px 12px", cursor:"pointer", fontSize:16 } }, "›")
    ),

    // Balance card
    React.createElement("div", { style:{ ...S.card(balance>=0?"#10b98122":"#ef444422"), border:`2px solid ${balance>=0?T.green:T.red}`, textAlign:"center", marginBottom:10 } },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:4 } }, balance>=0?"✅ في الأمان":"⚠️ تعديت الميزانية"),
      React.createElement("div", { style:{ fontSize:32, fontWeight:900, color:balance>=0?T.green:T.red } }, fmt(Math.abs(balance)), " ج"),
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginTop:4 } }, fmt(totalIncome)," دخل — ",fmt(mTot+totalInstallments)," مصاريف")
    ),

    // Installments warning
    totalInstallments > 0 && React.createElement("div", { style:{ ...S.card("#ef444411"), border:"1px solid #ef444433", marginBottom:8 } },
      React.createElement("div", { style:{ ...S.row } },
        React.createElement("span", { style:{ fontSize:11, color:T.sub } }, "🏦 الأقساط والثوابت الشهرية"),
        React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:T.red } }, fmt(totalInstallments), " ج")
      )
    ),

    // Stats
    React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:10 } },
      [["المصاريف", mTot, T.red], ["التحويش", mSaving, "#a78bfa"]].map(([l,v,c]) =>
        React.createElement("div", { key:l, style:{ flex:1, ...S.card(c+"22"), border:`1px solid ${c}44`, textAlign:"center" } },
          React.createElement("div", { style:{ fontSize:10, color:c, marginBottom:2 } }, l),
          React.createElement("div", { style:{ fontSize:15, fontWeight:900, color:c } }, fmt(v), " ج")
        )
      )
    ),

    // By category
    bycat.length > 0 && React.createElement("div", { style:S.sub }, "حسب التصنيف"),
    bycat.length > 0 && React.createElement("div", { style:S.card() },
      bycat.map(c => React.createElement("div", { key:c.id, style:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.bdr}` } },
        React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
          React.createElement("span", null, c.ic),
          React.createElement("span", { style:{ fontSize:12, color:T.text } }, c.l)
        ),
        React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:c.c } }, fmt(c.total), " ج")
      ))
    )
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ══════════════════════════════════════════════════════════════
function SettingsScreen({ uid, profile, onUpdate, cats, onCatsChange }) {
  const [name, setName] = useState(profile.name);
  const [salary, setSalary] = useState(profile.salary);
  const [saved, setSaved] = useState(false);
  // مصادر دخل إضافية
  const [incomes, setIncomes] = useState(() => ld(`inc_${uid}`, []));
  const [newIncLbl, setNewIncLbl] = useState("");
  const [newIncAmt, setNewIncAmt] = useState("");
  // الأقساط الثابتة
  const [installments, setInstallments] = useState(() => ld(`inst_${uid}`, []));
  const [newInstLbl, setNewInstLbl] = useState("");
  const [newInstAmt, setNewInstAmt] = useState("");
  // تصنيفات مخصصة
  const [newCat, setNewCat] = useState("");

  useEffect(() => { sv(`inc_${uid}`, incomes); cloudSave(uid, `inc_${uid}`, incomes); }, [incomes]);
  useEffect(() => { sv(`inst_${uid}`, installments); cloudSave(uid, `inst_${uid}`, installments); }, [installments]);

  const save = () => {
    const updated = { ...profile, name: name.trim(), salary: +salary };
    sv("budget_profile", updated);
    cloudSave(uid, "profile", updated);
    onUpdate(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return React.createElement("div", null,
    // بيانات أساسية
    React.createElement("div", { style:S.sub }, "بياناتك الأساسية"),
    React.createElement("div", { style:S.card() },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:4 } }, "الاسم"),
      React.createElement("input", { style:S.inp, value:name, onChange:e=>setName(e.target.value) }),
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:4 } }, "المرتب (ج)"),
      React.createElement("input", { style:S.inp, type:"number", value:salary, onChange:e=>setSalary(e.target.value) }),
      React.createElement("button", { style:S.btn(saved?T.green:T.blue), onClick:save }, saved?"✅ اتحفظ":"حفظ التغييرات")
    ),

    // مصادر دخل إضافية
    React.createElement("div", { style:S.sub }, "💼 مصادر دخل إضافية"),
    React.createElement("div", { style:S.card() },
      incomes.length === 0
        ? React.createElement("div", { style:{ fontSize:12, color:T.sub, textAlign:"center", marginBottom:8 } }, "مفيش مصادر دخل إضافية لسه")
        : incomes.map((inc, i) => React.createElement("div", { key:i, style:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.bdr}` } },
            React.createElement("span", { style:{ fontSize:12, color:T.text } }, inc.label),
            React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
              React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:T.green } }, fmt(inc.amount), " ج"),
              React.createElement("span", { onClick:()=>setIncomes(p=>p.filter((_,j)=>j!==i)), style:{ color:T.red, cursor:"pointer", fontSize:14 } }, "×")
            )
          )),
      React.createElement("div", { style:{ display:"flex", gap:6, marginTop:8 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:2 }, placeholder:"المصدر (مثلاً: فريلانس)", value:newIncLbl, onChange:e=>setNewIncLbl(e.target.value) }),
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, type:"number", placeholder:"المبلغ", inputMode:"decimal", value:newIncAmt, onChange:e=>setNewIncAmt(e.target.value) }),
        React.createElement("button", { onClick:()=>{ if(newIncLbl.trim()&&newIncAmt){ setIncomes(p=>[...p,{label:newIncLbl.trim(),amount:+newIncAmt}]); setNewIncLbl(""); setNewIncAmt(""); } }, style:{ ...S.btn(T.green), width:"auto", padding:"9px 12px", marginTop:0 } }, "+")
      )
    ),

    // الأقساط الثابتة
    React.createElement("div", { style:S.sub }, "🏦 الأقساط والثوابت"),
    React.createElement("div", { style:S.card() },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:8 } }, "بتتخصم تلقائياً كل شهر من ميزانيتك"),
      installments.length === 0
        ? React.createElement("div", { style:{ fontSize:12, color:T.sub, textAlign:"center", marginBottom:8 } }, "مفيش أقساط لسه")
        : installments.map((inst, i) => React.createElement("div", { key:i, style:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${T.bdr}` } },
            React.createElement("span", { style:{ fontSize:12, color:T.text } }, inst.label),
            React.createElement("div", { style:{ display:"flex", gap:8, alignItems:"center" } },
              React.createElement("span", { style:{ fontSize:13, fontWeight:700, color:T.red } }, fmt(inst.amount), " ج/شهر"),
              React.createElement("span", { onClick:()=>setInstallments(p=>p.filter((_,j)=>j!==i)), style:{ color:T.red, cursor:"pointer", fontSize:14 } }, "×")
            )
          )),
      React.createElement("div", { style:{ display:"flex", gap:6, marginTop:8 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:2 }, placeholder:"القسط (مثلاً: قسط سيارة)", value:newInstLbl, onChange:e=>setNewInstLbl(e.target.value) }),
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, type:"number", placeholder:"المبلغ", inputMode:"decimal", value:newInstAmt, onChange:e=>setNewInstAmt(e.target.value) }),
        React.createElement("button", { onClick:()=>{ if(newInstLbl.trim()&&newInstAmt){ setInstallments(p=>[...p,{label:newInstLbl.trim(),amount:+newInstAmt}]); setNewInstLbl(""); setNewInstAmt(""); } }, style:{ ...S.btn(T.red), width:"auto", padding:"9px 12px", marginTop:0 } }, "+")
      )
    ),

    // التصنيفات المخصصة
    React.createElement("div", { style:S.sub }, "🏷️ تصنيفات المصاريف"),
    React.createElement("div", { style:S.card() },
      React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 } },
        cats.map((c,i) => React.createElement("div", { key:c.id, style:{ display:"flex", alignItems:"center", gap:4, background:c.c+"22", border:`1px solid ${c.c}44`, borderRadius:8, padding:"4px 8px" } },
          React.createElement("span", { style:{ fontSize:11 } }, c.ic+" "+c.l),
          !c.fixed && React.createElement("span", { onClick:()=>onCatsChange(cats.filter((_,j)=>j!==i)), style:{ color:T.red, cursor:"pointer", fontSize:12, marginRight:2 } }, "×")
        ))
      ),
      React.createElement("div", { style:{ display:"flex", gap:6 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, placeholder:"اسم التصنيف الجديد", value:newCat, onChange:e=>setNewCat(e.target.value) }),
        React.createElement("button", { onClick:()=>{ if(newCat.trim()){ const id="cat_"+Date.now(); onCatsChange([...cats,{id,l:newCat.trim(),ic:"📌",c:"#888",fixed:false}]); setNewCat(""); } }, style:{ ...S.btn(T.blue), width:"auto", padding:"9px 12px", marginTop:0 } }, "+")
      )
    )
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════
function App() {
  const [uid, setUid] = useState(() => ld("budget_uid", null));
  const [profile, setProfile] = useState(() => ld("budget_profile", null));
  const [entries, setEntries] = useState(() => ld("budget_entries", []));
  const [mk, setMk] = useState(currentFinMonth());
  const [tab, setTab] = useState("summary");
  const [cats, setCats] = useState(() => { const id = ld("budget_uid",""); return ld("cats_"+id, CATS); });
  const [incomes, setIncomes] = useState(() => { const id = ld("budget_uid",""); return ld("inc_"+id, []); });
  const [installments, setInstallments] = useState(() => { const id = ld("budget_uid",""); return ld("inst_"+id, []); });

  // Load from cloud on start
  useEffect(() => {
    if (!uid) return;
    cloudLoad(uid, "entries").then(data => {
      if (data && data.length > 0) {
        setEntries(data);
        sv("budget_entries", data);
      }
    });
    cloudLoad(uid, "profile").then(data => {
      if (data) { setProfile(data); sv("budget_profile", data); }
    });
    cloudLoad(uid, `cats_${uid}`).then(data => {
      if (data && data.length > 0) { setCats(data); sv(`cats_${uid}`, data); }
    });
    cloudLoad(uid, `inc_${uid}`).then(data => {
      if (data) { setIncomes(data); sv(`inc_${uid}`, data); }
    });
    cloudLoad(uid, `inst_${uid}`).then(data => {
      if (data) { setInstallments(data); sv(`inst_${uid}`, data); }
    });
  }, [uid]);

  // Save entries to cloud
  useEffect(() => {
    if (!uid) return;
    sv("budget_entries", entries);
    cloudSave(uid, "entries", entries);
  }, [entries]);

  const addE = useCallback(e => setEntries(p => [e, ...p]), []);
  const delE = useCallback(id => setEntries(p => p.filter(e => e.id !== id)), []);

  const handleCatsChange = (newCats) => {
    setCats(newCats);
    sv(`cats_${uid}`, newCats);
    cloudSave(uid, `cats_${uid}`, newCats);
  };

  if (!uid || !profile) {
    return React.createElement(SetupScreen, { onDone:(newUid, newProfile) => { setUid(newUid); setProfile(newProfile); } });
  }

  const TABS = [
    { k:"summary", ic:"📊", l:"الملخص" },
    { k:"expenses", ic:"💰", l:profile.name },
    { k:"goals", ic:"🎯", l:"أهدافي" },
    { k:"settings", ic:"⚙️", l:"إعدادات" },
  ];

  return React.createElement("div", { style:{ background:T.bg, minHeight:"100vh", color:T.text, fontFamily:"system-ui,sans-serif", direction:"rtl", maxWidth:480, margin:"0 auto", paddingBottom:70 } },
    // Header
    React.createElement("div", { style:{ padding:"14px 16px 6px", display:"flex", justifyContent:"space-between", alignItems:"center" } },
      React.createElement("div", { style:{ fontSize:9, color:T.sub } }, MK(new Date()) === mk ? "الشهر الحالي" : "" ),
      React.createElement("div", { style:{ textAlign:"center" } },
        React.createElement("div", { style:{ fontSize:16, fontWeight:900, color:T.text } },
          tab==="summary"?"📊 الملخص":tab==="expenses"?"💰 "+profile.name:tab==="goals"?"🎯 أهدافي":"⚙️ الإعدادات"
        ),
        React.createElement("div", { style:{ fontSize:10, color:T.sub } }, profile.name)
      ),
      React.createElement("div", { style:{ width:40 } })
    ),

    // Content
    React.createElement("div", { style:{ padding:"0 12px" } },
      tab === "summary" && React.createElement(SummaryScreen, { uid, profile, entries, mk, onMkChange:setMk, installments, incomes }),
      tab === "expenses" && React.createElement(ExpensesScreen, { uid, userName:profile.name, entries, onAdd:addE, onDel:delE, mk, cats, installments }),
      tab === "goals" && React.createElement(GoalsScreen, { uid, profile }),
      tab === "settings" && React.createElement(SettingsScreen, { uid, profile, onUpdate:setProfile, cats, onCatsChange:handleCatsChange })
    ),

    // Bottom nav
    React.createElement("div", { style:{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"#0d1420", borderTop:`1px solid ${T.bdr}`, display:"flex", padding:"6px 0 10px" } },
      TABS.map(t => React.createElement("button", { key:t.k, onClick:()=>setTab(t.k), style:{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2 } },
        React.createElement("span", { style:{ fontSize:20 } }, t.ic),
        React.createElement("span", { style:{ fontSize:9, color:tab===t.k?T.blue:T.sub, fontWeight:tab===t.k?700:400 } }, t.l)
      ))
    )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById("root"));

// ══════════════════════════════════════════════════════════════
// WEIGHT TRACKER
// ══════════════════════════════════════════════════════════════
const CLD_CLOUD = "tpzkvsa6";
const CLD_PRESET = "Mohamed";
const OPENROUTER_KEY = "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";

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, { method:"POST", body:fd });
  const data = await res.json();
  return data.secure_url;
}

async function analyzePhoto(b64, mime, prompt) {
  const body = {
    model: "openrouter/free",
    messages: [{ role:"user", content:[
      { type:"text", text:prompt },
      { type:"image_url", image_url:{ url:`data:${mime||"image/jpeg"};base64,${b64}` } }
    ]}]
  };
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 60000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:"POST", signal:ctrl.signal,
      headers:{ "Authorization":`Bearer ${OPENROUTER_KEY}`, "Content-Type":"application/json", "HTTP-Referer":"https://mohamedhossamomara01-maker.github.io/budget-app/", "X-Title":"Budget App" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || "مش قادر أحلل دلوقتي";
  } catch(e) {
    if (e.name==="AbortError") throw new Error("استغرق وقتاً طويلاً، جرب تاني");
    throw e;
  } finally { clearTimeout(timer); }
}

function WeightTracker({ uid, goalWeight, name }) {
  const storeKey = `wt_${uid}`;
  const [entries, setEntries] = useState(() => ld(storeKey, []));
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(DK());
  const [goalW, setGoalW] = useState(() => ld(`wt_goal_${uid}`, goalWeight || 80));
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState("");
  const [cmpA, setCmpA] = useState(null);
  const [cmpB, setCmpB] = useState(null);
  const [compareText, setCompareText] = useState("");
  const b64Cache = useRef({});
  const isLoading = useRef(false);

  useEffect(() => {
    isLoading.current = true;
    cloudLoad(uid, storeKey).then(data => {
      if (data && data.length > 0) { setEntries(data); sv(storeKey, data); }
      isLoading.current = false;
    });
  }, []);

  useEffect(() => {
    if (isLoading.current) return;
    sv(storeKey, entries);
    cloudSave(uid, storeKey, entries);
  }, [entries]);

  useEffect(() => { sv(`wt_goal_${uid}`, goalW); }, [goalW]);

  const sorted = [...entries].sort((a,b)=>a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length-1];
  const totalLost = first && last ? +(first.weight - last.weight).toFixed(1) : 0;
  const remaining = last ? +(last.weight - goalW).toFixed(1) : 0;
  const weeks = first && last ? Math.max(1,(new Date(last.date)-new Date(first.date))/(7*24*3600*1000)) : 1;
  const ratePerWeek = +(totalLost/weeks).toFixed(2);
  const weeksToGoal = ratePerWeek > 0 ? Math.ceil(remaining/ratePerWeek) : null;
  const goalDate = weeksToGoal ? new Date(Date.now()+weeksToGoal*7*24*3600*1000) : null;
  const goalDateStr = goalDate ? `${goalDate.getDate()}/${goalDate.getMonth()+1}/${goalDate.getFullYear()}` : null;

  const W=320, H=120, PAD=30;
  const weights = sorted.map(e=>e.weight);
  const minW = Math.min(...weights, +goalW)-1;
  const maxW = Math.max(...weights)+1;
  const toX = i => PAD+(i/Math.max(sorted.length-1,1))*(W-PAD*2);
  const toY = w => PAD+(1-(w-minW)/(maxW-minW))*(H-PAD*2);
  const points = sorted.map((e,i)=>`${toX(i)},${toY(e.weight)}`).join(" ");
  const goalY = toY(+goalW);

  async function handleUpload(e, date) {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise(res=>{ const r=new FileReader(); r.onloadend=()=>res(r.result.split(",")[1]); r.readAsDataURL(file); });
      b64Cache.current[date] = { data:b64, mime:file.type };
      const url = await uploadToCloudinary(file);
      setEntries(prev=>prev.map(en=>en.date===date?{...en,photo:url,photoMime:file.type}:en));
    } catch { alert("فشل رفع الصورة"); }
    setUploading(false);
  }

  async function getB64(entry) {
    if (b64Cache.current[entry.date]) return b64Cache.current[entry.date];
    const res = await fetch(entry.photo);
    const blob = await res.blob();
    const data = await new Promise(resolve=>{ const r=new FileReader(); r.onloadend=()=>resolve(r.result.split(",")[1]); r.readAsDataURL(blob); });
    const result = { data, mime:entry.photoMime||"image/jpeg" };
    b64Cache.current[entry.date] = result;
    return result;
  }

  const photosEntries = [...sorted].reverse().filter(e=>e.photo);
  const color = "#1565ff";

  return React.createElement(React.Fragment, null,
    React.createElement("div", { style:S.sub }, "⚖️ متابعة الوزن"),

    // Stats
    React.createElement("div", { style:{ display:"flex", gap:6, marginBottom:8 } },
      [["الحالي", last?last.weight+" كجم":"-", color],["خسرت", totalLost+" كجم","#10b981"],["الهدف", goalW+" كجم","#f59e0b"],["متبقي", remaining+" كجم",remaining>0?"#ef4444":"#10b981"]].map(([l,v,c])=>
        React.createElement("div", { key:l, style:{ flex:1, background:c+"22", border:"1px solid "+c+"44", borderRadius:10, padding:"6px 3px", textAlign:"center" } },
          React.createElement("div", { style:{ fontSize:9, color:c, marginBottom:1 } }, l),
          React.createElement("div", { style:{ fontSize:11, fontWeight:900, color:c } }, v)
        )
      )
    ),

    // Goal input
    React.createElement("div", { style:{ display:"flex", gap:7, marginBottom:8, alignItems:"center" } },
      React.createElement("span", { style:{ fontSize:11, color:T.sub, whiteSpace:"nowrap" } }, "الهدف (كجم):"),
      React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, type:"number", value:goalW, onChange:e=>setGoalW(e.target.value) })
    ),

    // Prediction
    goalDateStr && ratePerWeek>0 && React.createElement("div", { style:{ ...S.card("#10b98111"), border:"1px solid #10b98133", marginBottom:8, textAlign:"center" } },
      React.createElement("div", { style:{ fontSize:10, color:T.sub } }, "بالمعدل الحالي ("+ratePerWeek+" كجم/أسبوع)"),
      React.createElement("div", { style:{ fontSize:12, fontWeight:700, color:T.green, marginTop:3 } }, "هتوصل للهدف تقريباً "+goalDateStr+" 🎯")
    ),

    // Chart
    sorted.length>1 && React.createElement("div", { style:{ ...S.card(), marginBottom:8 } },
      React.createElement("svg", { width:W, height:H, style:{ display:"block", margin:"0 auto" } },
        React.createElement("line", { x1:PAD, y1:goalY, x2:W-PAD, y2:goalY, stroke:"#f59e0b44", strokeWidth:1, strokeDasharray:"4" }),
        React.createElement("text", { x:W-PAD-2, y:goalY-3, fill:"#f59e0b", fontSize:8, textAnchor:"end" }, goalW+" هدف"),
        React.createElement("polyline", { points, fill:"none", stroke:color, strokeWidth:2 }),
        sorted.map((e,i)=>React.createElement(React.Fragment, { key:i },
          React.createElement("circle", { cx:toX(i), cy:toY(e.weight), r:4, fill:color }),
          React.createElement("text", { x:toX(i), y:toY(e.weight)-6, fill:T.text, fontSize:8, textAnchor:"middle" }, e.weight)
        ))
      )
    ),

    // Add reading
    React.createElement("div", { style:{ ...S.card(), marginBottom:8 } },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:6 } }, "أضف قراءة"),
      React.createElement("div", { style:{ display:"flex", gap:7 } },
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, type:"number", placeholder:"الوزن (كجم)", inputMode:"decimal", value:newWeight, onChange:e=>setNewWeight(e.target.value) }),
        React.createElement("input", { style:{ ...S.inp, marginBottom:0, flex:1 }, type:"date", value:newDate, onChange:e=>setNewDate(e.target.value) }),
        React.createElement("button", { onClick:()=>{ const w=parseFloat(newWeight); if(!w||!newDate) return; setEntries(prev=>{const f=prev.filter(e=>e.date!==newDate); return [...f,{date:newDate,weight:w}];}); setNewWeight(""); }, style:{ ...S.btn(color), width:"auto", padding:"9px 14px", marginTop:0 } }, "+")
      )
    ),

    // Entries list
    React.createElement("div", { style:{ ...S.card(), marginBottom:8 } },
      React.createElement("div", { style:{ fontSize:11, color:T.sub, marginBottom:6 } }, "سجل القراءات"),
      uploading && React.createElement("div", { style:{ fontSize:11, color:T.orange, marginBottom:6 } }, "⏳ جاري رفع الصورة..."),
      [...sorted].reverse().map((e,i)=>React.createElement("div", { key:i, style:{ padding:"8px 0", borderBottom:"1px solid "+T.bdr } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
          React.createElement("span", { style:{ fontSize:12, color:T.sub } }, e.date),
          React.createElement("span", { style:{ fontSize:13, fontWeight:700, color } }, e.weight, " كجم"),
          React.createElement("div", { style:{ display:"flex", gap:6, alignItems:"center" } },
            React.createElement("label", { style:{ fontSize:11, color:T.sub, cursor:"pointer" } },
              e.photo?"📷 تغيير":"📷 صورة",
              React.createElement("input", { type:"file", accept:"image/*", style:{ display:"none" }, onChange:ev=>handleUpload(ev,e.date) })
            ),
            React.createElement("span", { onClick:()=>setEntries(prev=>prev.filter(x=>x.date!==e.date)), style:{ fontSize:14, color:T.red, cursor:"pointer", opacity:0.6 } }, "×")
          )
        ),
        e.photo && React.createElement(React.Fragment, null,
          React.createElement("img", { src:e.photo, style:{ width:"100%", borderRadius:8, marginTop:6, maxHeight:200, objectFit:"cover" } }),
          React.createElement("button", {
            onClick: async()=>{ setAnalyzing(true); setAnalysisText("");
              try { const {data,mime}=await getB64(e); const txt=await analyzePhoto(data,mime,"أنت مساعد لياقة بدنية. انظر للصورة أمامك فقط. اكتب 3 جمل قصيرة بالعربية فقط عن شكل الجسم المرئي في الصورة. ممنوع الكتابة بأي لغة أخرى غير العربية."); setAnalysisText(txt); } catch(err){ setAnalysisText("حصل خطأ: "+err.message); }
              setAnalyzing(false); },
            style:{ ...S.btn("#8b5cf6"), marginTop:6, fontSize:11, padding:"7px 12px" }
          }, analyzing?"⏳ جاري التحليل...":"🤖 حلل الصورة بـ AI"),
          analysisText && React.createElement("div", { style:{ background:"#8b5cf622", border:"1px solid #8b5cf644", borderRadius:8, padding:10, marginTop:6, fontSize:12, color:T.text, lineHeight:1.6 } }, analysisText)
        )
      ))
    ),

    // Compare photos
    photosEntries.length>=2 && React.createElement("div", { style:{ ...S.card(), marginBottom:8 } },
      React.createElement("div", { style:{ fontSize:13, fontWeight:700, marginBottom:8 } }, "📸 قارن بين صورتين"),
      React.createElement("div", { style:{ display:"flex", gap:7, marginBottom:8 } },
        [["صورة أولى",cmpA,setCmpA],["صورة تانية",cmpB,setCmpB]].map(([lbl,val,setter])=>
          React.createElement("div", { key:lbl, style:{ flex:1 } },
            React.createElement("div", { style:{ fontSize:10, color:T.sub, marginBottom:4 } }, lbl),
            React.createElement("select", { style:{ ...S.inp, marginBottom:0, fontSize:11 }, value:val||"", onChange:e=>setter(e.target.value) },
              React.createElement("option", { value:"" }, "اختار تاريخ"),
              photosEntries.map(e=>React.createElement("option", { key:e.date, value:e.date }, e.date+" ("+e.weight+" كجم)"))
            )
          )
        )
      ),
      cmpA && cmpB && cmpA!==cmpB && React.createElement(React.Fragment, null,
        React.createElement("div", { style:{ display:"flex", gap:8 } },
          [cmpA,cmpB].map(d=>{ const en=photosEntries.find(e=>e.date===d); return en?React.createElement("div", { key:d, style:{ flex:1, textAlign:"center" } },
            React.createElement("img", { src:en.photo, style:{ width:"100%", borderRadius:8, objectFit:"cover", maxHeight:200 } }),
            React.createElement("div", { style:{ fontSize:11, color:T.sub, marginTop:4 } }, d),
            React.createElement("div", { style:{ fontSize:13, fontWeight:700, color } }, en.weight," كجم")
          ):null; })
        ),
        React.createElement("div", { style:{ textAlign:"center", marginTop:8 } },
          React.createElement("div", { style:{ fontSize:12, fontWeight:700, color:T.green, marginBottom:8 } },
            "✅ الفرق: ", Math.abs((photosEntries.find(e=>e.date===cmpA)||{}).weight - (photosEntries.find(e=>e.date===cmpB)||{}).weight).toFixed(1), " كجم"
          ),
          React.createElement("button", {
            onClick: async()=>{ setAnalyzing(true); setCompareText("");
              const eA=photosEntries.find(e=>e.date===cmpA); const eB=photosEntries.find(e=>e.date===cmpB);
              try { const [rA,rB]=await Promise.all([getB64(eA),getB64(eB)]);
                const diff=Math.abs(eA.weight-eB.weight).toFixed(1);
                const body={model:"openrouter/free",messages:[{role:"user",content:[{type:"text",text:`قارن بين الصورتين. الصورة الأولى وزنها ${eA.weight} كجم والثانية ${eB.weight} كجم، الفرق ${diff} كجم. وضح الفروق المرئية بشكل إيجابي. الرد بالعربية في 4 جمل.`},{type:"image_url",image_url:{url:`data:${rA.mime};base64,${rA.data}`}},{type:"image_url",image_url:{url:`data:${rB.mime};base64,${rB.data}`}}]}]};
                const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${OPENROUTER_KEY}`,"Content-Type":"application/json","HTTP-Referer":"https://mohamedhossamomara01-maker.github.io/budget-app/","X-Title":"Budget App"},body:JSON.stringify(body)});
                const data=await res.json(); if(data.error) throw new Error(JSON.stringify(data.error));
                setCompareText(data.choices?.[0]?.message?.content||"مش قادر أقارن");
              } catch(err){ setCompareText("حصل خطأ: "+err.message); }
              setAnalyzing(false); },
            style:{ ...S.btn("#8b5cf6"), fontSize:11, padding:"7px 12px" }
          }, analyzing?"⏳ جاري المقارنة...":"🤖 قارن بـ AI"),
          compareText && React.createElement("div", { style:{ background:"#8b5cf622", border:"1px solid #8b5cf644", borderRadius:8, padding:10, marginTop:8, fontSize:12, color:T.text, lineHeight:1.6, textAlign:"right" } }, compareText)
        )
      )
    )
  );
}
