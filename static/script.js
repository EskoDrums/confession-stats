// script.js
// 1) Replace these placeholders before deploying
const SUPABASE_URL = "https://guiuexqotbmktthvksio.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aXVleHFvdGJta3R0aHZrc2lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDk4MzEsImV4cCI6MjA3ODc4NTgzMX0.wjEBNXuBhpA94iBSxoTLGZqRHquaNBz4iw_MACl2oDs"
;
// Put your admin ids here
const ADMINS = [652754, 9634014]; // <<-- replace with your real admin ids

// init Supabase client (v1)
const supabase = supabaseJs.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chart variables
let growthChart = null;

// helpers
function fmtNumber(n){return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}

// Telegram WebApp
const tg = window.Telegram ? window.Telegram.WebApp : null;
const tgUser = tg ? (tg.initDataUnsafe ? tg.initDataUnsafe.user : null) : null;

// If Telegram WebApp is not available, show a warning but still allow local testing
if(!tgUser){
  console.warn("Telegram WebApp not detected. Use ? for local dev.");
  // For local testing you can set a fake user here
  // tgUser = {id: 652754, first_name: "Admin", username: "admin"}
}

async function isAdmin(userId){
  return ADMINS.includes(Number(userId));
}

// UI refs
const adminName = document.getElementById("adminName");
const adminUsername = document.getElementById("adminUsername");
const adminId = document.getElementById("adminId");
const adminAvatar = document.getElementById("adminAvatar");
const totalUsersEl = document.getElementById("totalUsers");
const usersTodayEl = document.getElementById("usersToday");
const totalConfEl = document.getElementById("totalConfessions");
const confTodayEl = document.getElementById("confessionsToday");
const active30El = document.getElementById("active30");
const refreshBtn = document.getElementById("refreshBtn");
const exportBtn = document.getElementById("exportBtn");

// set profile card
function renderProfile(u){
  if(!u) return;
  adminName.innerText = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  adminUsername.innerText = u.username || "—";
  adminId.innerText = u.id || "—";
  adminAvatar.src = u.photo_url || "https://cdn-icons-png.flaticon.com/512/3177/3177440.png";
}

// date helpers
function startOfDayISO(daysAgo=0){
  const d = new Date();
  d.setUTCHours(0,0,0,0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function isoNDaysAgo(n){
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setUTCHours(0,0,0,0);
  return d.toISOString();
}

// fetch stats
async function fetchCounts(){
  // total users
  const usersCountRes = await supabase.from("users").select("*", { count: "exact" }).maybeSingle();
  // supabase client version differences: try alternate pattern
  let totalUsers = 0;
  try {
    totalUsers = (await supabase.from('users').select('*', { count: 'exact' })).count || 0;
  } catch (e){
    // fallback: fetch all and count length (ok for small DB)
    const r = await supabase.from('users').select('*');
    totalUsers = (r.data || []).length;
  }

  // users today
  const todayStart = startOfDayISO();
  const usersTodayResp = await supabase.from("users").select("*", { count: "exact" }).gte("created_at", todayStart);
  const usersToday = (usersTodayResp && usersTodayResp.count) ? usersTodayResp.count : 0;

  // total confessions
  const confResp = await supabase.from("confessions").select("*", { count: "exact" });
  const totalConfessions = (confResp && confResp.count) ? confResp.count : (confResp.data ? confResp.data.length : 0);

  // confessions today
  const confTodayResp = await supabase.from("confessions").select("*", { count: "exact" }).gte("created_at", todayStart);
  const confToday = (confTodayResp && confTodayResp.count) ? confTodayResp.count : 0;

  return {
    totalUsers, usersToday, totalConfessions, confToday
  };
}

// user growth data (last 30 days)
async function fetchUserGrowth(days=30){
  const since = isoNDaysAgo(days-1);
  // fetch created_at for users since `since`
  const resp = await supabase.from("users").select("created_at").gte("created_at", since).order("created_at", {ascending:true});
  const rows = resp.data || [];

  // build counts per day
  const counts = {};
  for(let i=0;i<days;i++){
    const key = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    const kstr = key.toISOString().slice(0,10);
    counts[kstr] = 0;
  }
  rows.forEach(r => {
    const d = (new Date(r.created_at)).toISOString().slice(0,10);
    if(counts[d] !== undefined) counts[d] += 1;
  });

  const labels = Object.keys(counts);
  const values = labels.map(l => counts[l]);
  const totalActive = values.filter(v=>v>0).length;
  return { labels, values, totalActive };
}

// render numeric stats & chart
async function renderAll(){
  try {
    const ok = await isAdmin(tgUser.id);
    if(!ok){
      document.body.innerHTML = "<div style='padding:40px;color:#fff'>Access denied — you are not an admin.</div>";
      return;
    }
  } catch(e){
    console.error(e);
  }

  renderProfile(tgUser);

  // show loading placeholders
  totalUsersEl.innerText = "…";
  usersTodayEl.innerText = "Today: …";
  totalConfEl.innerText = "…";
  confTodayEl.innerText = "Today: …";

  const counts = await fetchCounts();
  totalUsersEl.innerText = fmtNumber(counts.totalUsers);
  usersTodayEl.innerText = `Today: ${fmtNumber(counts.usersToday)}`;

  totalConfEl.innerText = fmtNumber(counts.totalConfessions);
  confTodayEl.innerText = `Today: ${fmtNumber(counts.confToday)}`;

  // user growth
  const growth = await fetchUserGrowth(30);
  document.getElementById("active30").innerText = `${growth.totalActive} active days`;

  renderChart(growth.labels, growth.values);
}

// Chart render
function renderChart(labels, data){
  const ctx = document.getElementById("growthChart").getContext("2d");
  if(growthChart) growthChart.destroy();
  growthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'New users per day',
        data,
        fill: true,
        backgroundColor: 'rgba(124,92,255,0.12)',
        borderColor: 'rgba(124,92,255,1)',
        tension: 0.22,
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: true, ticks: { color: '#cbd8ff' } },
        y: { display: true, ticks: { color: '#cbd8ff' } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// CSV export (basic)
async function exportCSV(){
  // fetch last 100 users as example
  const r = await supabase.from("users").select("user_id,created_at,anon_name").order("created_at", {ascending:false}).limit(100);
  const rows = r.data || [];
  const csv = ["user_id,created_at,anon_name", ...rows.map(row => `${row.user_id},${row.created_at},"${(row.anon_name||"").replace(/"/g,'""')}"`)].join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `users_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// attach events
refreshBtn.addEventListener("click", ()=>{ renderAll(); gsap.from(".stat-value",{y:8,opacity:0,duration:0.6,stagger:0.08}) });
exportBtn.addEventListener("click", exportCSV);

// kick-off (wait for Telegram ready)
window.addEventListener("DOMContentLoaded", async ()=>{
  try {
    if(tg) tg.ready();
    if(!tgUser){
      // local fallback for dev - you can remove in production
      // set a test admin id if you want to preview without Telegram
      // tgUser = {id: ADMINS[0], first_name:"Admin", username:"admin", photo_url:""}
      console.warn("No Telegram WebApp user found. For production open via Telegram WebApp.");
    }
    renderAll();
    // small intro animation
    gsap.from(".profile-card", {y:18,opacity:0,duration:0.8});
    gsap.from(".stat-card", {y:14,opacity:0,duration:0.9,stagger:0.06});
  }catch(e){console.error(e)}
});
