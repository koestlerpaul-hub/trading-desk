// Desk app. Static, read-only: polls plan B JSON at d/<DATA_PATH>/*.json. Never places orders.
const SIGNUP = "https://fomo.family/r/muteee";
const POLL_MS = 15000;
var DP = null, S = null, ACT = [], COINS = [], EV = [], lastOk = 0, lastErr = null, route = {tab: "home"};
const TABS = ["home", "live", "agents", "activity", "account"];

(function initPath() {
  const t = location.hash.match(/[#&]t=([a-z]+)/), mm = location.hash.match(/[#&]m=([A-Za-z0-9]+)/);
  const m = location.hash.match(/[#&]d=([A-Za-z0-9_\-]+)/);
  if (m) { localStorage.setItem("desk.dp", m[1]); history.replaceState(null, "", location.pathname); }
  DP = localStorage.getItem("desk.dp");
  if (t) route = TABS.includes(t[1]) ? {tab: t[1]} : {tab: "agents", view: t[1], mint: mm && mm[1]};
})();

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd = (x, d = 2) => x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});
const pct = x => x == null ? "—" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";
const ago = ts => { if (!ts) return "never"; const s = Math.round((Date.now() - Date.parse(ts)) / 1000); return s < 60 ? s + "s ago" : s < 3600 ? Math.round(s/60) + "m ago" : Math.round(s/3600) + "h ago"; };
const TZ = {timeZone: "Europe/Stockholm", hour12: false, hourCycle: "h23"};
const tm = ts => ts ? new Date(ts).toLocaleTimeString("sv-SE", {...TZ, hour: "2-digit", minute: "2-digit"}) : "";
const tms = ts => ts ? new Date(ts).toLocaleTimeString("sv-SE", {...TZ, hour: "2-digit", minute: "2-digit", second: "2-digit"}) : "";
const link = c => (c && c.link) || SIGNUP;
const fomoBtn = (c, label, cls = "") => `<a class="btn ${cls}" href="${esc(link(c))}" target="_blank" rel="noopener">${esc(label)}</a>`;

async function j(name) {
  const r = await fetch(`d/${DP}/${name}?v=${Date.now()}`, {cache: "no-store"});
  if (!r.ok) throw new Error(name + " HTTP " + r.status);
  return r.json();
}
async function poll() {
  if (!DP) { render(); return; }
  try {
    [S, ACT, COINS, EV] = await Promise.all([j("state.json"), j("activity.json"), j("coins.json"), j("events.json").catch(() => [])]);
    lastOk = Date.now(); lastErr = null;
  } catch (e) { lastErr = e.message; }
  render();
}

function header() {
  const m = $("#mode");
  if (S) { m.textContent = S.mode; m.className = "badge" + (S.mode === "LIVE" ? " live" : ""); }
  const age = S ? (Date.now() - Date.parse(S.ts)) / 1000 : null;
  $("#upd").innerHTML = lastErr ? `<span class="r">offline · ${esc(lastErr)}</span>` :
    S ? `updated ${ago(S.ts)}${age > 900 ? ' <span class="o">· stale</span>' : ""}` : "";
}

function render() {
  header();
  const v = $("#view");
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === route.tab));
  if (!DP) { v.innerHTML = `<div class="card empty">No desk linked.<br><br>Open the link with <code>#d=…</code> from the desk once on this phone.</div>${foot()}`; return; }
  if (!S) { v.innerHTML = lastErr ? `<div class="card err empty">Can't reach the desk.<br><span class="small">${esc(lastErr)}</span><br><br><button class="btn sec" onclick="poll()">Retry</button></div>` : `<div class="card empty">Loading…</div>`; return; }
  v.innerHTML = ({home, live, agents, activity, account, coin, auditor}[route.view || route.tab])() + foot();
  if (route.view === "coin") drawChart();
}
const foot = () => `<footer class="small muted">Trades happen on FOMO, by you. <a href="${SIGNUP}" target="_blank" rel="noopener">Join FOMO · 10% off fees</a></footer>`;

function home() {
  const st = S.stats, pnl = st.pnlUsd, start = S.startStack || S.stack;
  const chg = start ? 100 * (S.stack - start) / start : 0;
  let h = `<div class="card"><div class="muted small">${S.mode} stack</div><div class="big">${usd(S.stack)}</div>
   <div class="row"><span class="${chg >= 0 ? "g" : "r"}">${pct(chg)} since start</span><span class="muted">${usd(S.open)} open</span></div>
   ${S.ticketCheck ? `<div class="small o" style="margin-top:8px">${esc(S.ticketCheck)}</div>` : ""}
   ${S.layer8Down ? `<div class="small r" style="margin-top:8px">Layer 8 down: every coin is red until rpc_url changes</div>` : ""}</div>`;
  h += `<div class="card"><div class="row"><b>Open</b><span class="muted small">${S.positions.length}</span></div>`;
  h += S.positions.length ? `<div class="list">` + S.positions.map(p => {
    const ch = p.entry_price ? 100 * (p.lastPrice / p.entry_price - 1) : null;
    return `<div class="it" onclick="go('coin','${p.mint}')"><div><div class="t">${esc(p.name)}</div><div class="d">${usd(p.size_usd)} · stop -${p.stop_pct}%${p.trail_active ? " · trailing" : ""}</div></div>
     <div class="rt"><span class="${ch >= 0 ? "g" : "r"}">${pct(ch)}</span><br>${fomoBtn(p, "Sell on FOMO", "sec")}</div></div>`;
  }).join("") + `</div>` : `<div class="empty">No open positions. The desk is watching.</div>`;
  h += `</div><div class="card"><b>Tonight</b><div class="grid" style="margin-top:10px">
   <div class="kv"><span class="muted small">Migrations</span><b>${st.migrations}</b></div>
   <div class="kv"><span class="muted small">Scanner pass</span><b>${st.scanPass}/${st.scanned}</b></div>
   <div class="kv"><span class="muted small">Audits passed</span><b>${st.auditPass}/${st.audits}</b></div>
   <div class="kv"><span class="muted small">Analyst pass</span><b>${st.analystPass}/${st.analyses}</b></div>
   <div class="kv"><span class="muted small">Trades</span><b>${st.trades}</b></div>
   <div class="kv"><span class="muted small">P&amp;L</span><b class="${pnl >= 0 ? "g" : "r"}">${usd(pnl)}</b></div></div></div>`;
  h += `<div class="card"><div class="row"><b>Latest</b><a onclick="go('activity')">All</a></div>${actList(ACT.slice(0, 5))}</div>`;
  return h;
}

const AG = {scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk"};
const AGD = {scanner: "Watches every Pump.fun migration, kills thin, top-heavy, pumped and copycat pools.",
  auditor: "8-layer safety check, any red layer rejects.", analyst: "4 questions on numbers only, then the gate.",
  executor: "Sizes the ticket and sends you a Buy on FOMO push.", risk: "Watches open positions: stop, trailing stop, timeout, pulled."};
function agents() {
  const st = S.stats;
  const extra = {scanner: `${st.migrations} migrations · ${st.waiting} waiting · ${st.scanKills} killed · ws ${S.wsState}`,
    auditor: `${st.audits} audits · ${st.auditPass} passed`, analyst: `${st.analyses} analysed · ${st.analystPass} passed · ${S.settings["analyst.mode"]}`,
    executor: `${st.trades} trades · ${st.pushes} pushes`, risk: `${S.positions.length} open · poll ${S.settings["risk.poll_s"]}s`};
  const acc = a => { const x = (S.accuracy || {})[a] || {}; const f = k => x[k] && x[k].judged ? `${x[k].pct}% of ${x[k].judged}` : "—";
    return `<div class="small" style="margin-top:6px">Verdict accuracy · 1h ${f("1h")} · 4h ${f("4h")}${x.pending ? ` · ${x.pending} pending` : ""}</div>`; };
  return Object.keys(AG).map(a => { const h = S.agents[a] || {state: "down"};
    return `<div class="card" onclick="${a === "auditor" ? "go('auditor')" : ""}"><div class="row"><b><span class="dot ${h.state}"></span>${AG[a]}</b><span class="small muted">${h.state} · ${ago(h.ts)}</span></div>
     <div class="small muted" style="margin-top:6px">${AGD[a]}</div><div class="small" style="margin-top:6px">${extra[a]}</div>${acc(a)}${a === "auditor" ? `<div class="small" style="margin-top:6px"><a>Open Auditor →</a></div>` : ""}</div>`; }).join("");
}

function disc(layers) {
  const R = 70, cx = 90, cy = 90, seg = 2 * Math.PI / 8;
  let p = "";
  for (let i = 0; i < 8; i++) {
    const L = layers.find(x => x.n === i + 1);
    const col = !L || L.pass == null ? "#33333d" : L.pass ? "#2fd27a" : "#ff5a5f";
    const a0 = -Math.PI / 2 + i * seg + 0.04, a1 = a0 + seg - 0.08;
    p += `<path d="M${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}" stroke="${col}" stroke-width="18" fill="none"/>`;
    const am = (a0 + a1) / 2; p += `<text x="${cx + (R - 26) * Math.cos(am)}" y="${cy + (R - 26) * Math.sin(am) + 4}" fill="#8a8a99" font-size="11" text-anchor="middle">${i + 1}</text>`;
  }
  const passed = layers.filter(x => x.pass).length;
  return `<svg viewBox="0 0 180 180" width="180" height="180">${p}<text x="90" y="96" fill="#f2f2f5" font-size="22" font-weight="700" text-anchor="middle">${passed}/8</text></svg>`;
}
function auditor() {
  const list = COINS.filter(c => c.layers && c.layers.length);
  const cur = list.find(c => c.mint === route.mint) || list[0];
  let h = `<a class="back" onclick="go('agents')">‹ Agents</a>`;
  if (!cur) return h + `<div class="card empty">No audits yet. Coins reach the Auditor after the Scanner passes them (pool ≥ ${S.settings["scanner.min_pool_age_min"]} min old).</div>`;
  h += `<div class="card"><div class="row"><div><b>${esc(cur.name || cur.mint.slice(0, 6))}</b><div class="small muted">${cur.audit ? (cur.audit.passed ? '<span class="g">passed</span>' : '<span class="r">rejected · ' + esc(cur.audit.reason) + "</span>") : "auditing…"}</div></div>${fomoBtn(cur, "Coin on FOMO", "sec")}</div>
   <div style="text-align:center;margin:10px 0">${disc(cur.layers)}</div>
   ${cur.layers.map(L => `<div class="layer"><span class="n">${L.n}</span><div style="flex:1"><div>${esc(L.name)}</div><div class="small muted">${esc(L.value ?? "")}</div></div><span class="${L.pass ? "g" : L.pass === 0 || L.pass === false ? "r" : "muted"}">${L.pass ? "✓" : L.pass === 0 || L.pass === false ? "✗" : "·"}</span></div>`).join("")}</div>`;
  h += `<div class="card"><b>Recent audits</b><div class="list">${list.slice(0, 15).map(c => `<div class="it" onclick="route.mint='${c.mint}';render()"><div><div class="t">${esc(c.name || c.mint.slice(0, 6))}</div><div class="d">${c.layers.filter(x => x.pass).length}/8 · ${esc(c.audit ? c.audit.reason || "passed" : "…")}</div></div><div class="rt">${c.audit && c.audit.passed ? '<span class="g">pass</span>' : '<span class="r">red</span>'}</div></div>`).join("")}</div></div>`;
  return h;
}

function actList(rows) {
  if (!rows.length) return `<div class="empty">Nothing yet. First rejects show up once pools are ${S ? S.settings["scanner.min_pool_age_min"] : 30} min old.</div>`;
  return `<div class="list">` + rows.map(a => `<div class="it"${a.mint ? ` onclick="go('coin','${a.mint}')"` : ""}><div><div class="t">${esc(a.title)}</div><div class="d">${esc(a.detail)} · ${tm(a.ts)}</div></div><div class="rt ${/^\+/.test(a.right_text) ? "g" : /^-/.test(a.right_text) ? "r" : "muted"}">${esc(a.right_text)}</div></div>`).join("") + `</div>`;
}
function activity() {
  const kills = COINS.filter(c => c.scan && c.scan.verdict === "kill").slice(0, 20);
  return `<div class="card"><b>Activity</b>${actList(ACT)}</div>
   <div class="card"><b>Scanner kills</b>${kills.length ? `<div class="list">${kills.map(c => `<div class="it"><div><div class="t"><a href="${esc(link(c))}" target="_blank" rel="noopener">${esc(c.name || c.mint.slice(0, 6))}</a></div><div class="d">Scanner · ${esc(c.scan.reason)} · ${tm(c.scan.ts)}</div></div><div class="rt muted">killed</div></div>`).join("")}</div>` : `<div class="empty">None yet.</div>`}</div>`;
}

function safeUrl(u) { return /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : null; }
function socialCard(so) {
  if (!so) return `<div class="card small"><div class="row"><b>Social</b><span class="muted">not checked yet</span></div></div>`;
  const x = so.x, xu = x && safeUrl(x.url);
  const xl = !x ? `<span class="muted">no X</span>` : `<a href="${esc(xu || "#")}" target="_blank" rel="noopener">${esc(x.kind === "account" ? "@" + (x.handle || "") : x.kind === "community" ? "X community" : x.kind === "tweet" ? "tweet by @" + (x.handle || "") : "X link")}</a>${so.bonus ? ` <span class="g">✓ +${so.bonus}</span>` : ""}`;
  const th = so.theme ? `${esc(so.theme.tag)} · <a href="${esc(safeUrl(so.theme.url) || "#")}" target="_blank" rel="noopener">@${esc(so.theme.handle)}</a>` : `<span class="muted">—</span>`;
  return `<div class="card small"><div class="row"><b>Social</b><span>𝕏 ${xl}</span></div>
   <div class="row"><span class="muted">Theme</span><span>${th}</span></div>
   <div class="row"><span class="muted">Paid boost</span><span>${so.boosted ? `yes · ${esc(String(so.boost))} <span class="muted">(context only)</span>` : "no"}</span></div>
   ${so.cto ? `<div class="row"><span class="muted">Community takeover</span><span>yes</span></div>` : ""}
   ${(so.flags || []).map(f => `<div class="row"><span class="r">⚠ ${esc(f)}</span></div>`).join("")}</div>`;
}
function coin() {
  const c = COINS.find(x => x.mint === route.mint) || {mint: route.mint};
  const p = S.positions.find(x => x.mint === route.mint) || S.closed.find(x => x.mint === route.mint);
  let h = `<a class="back" onclick="back()">‹ Back</a><div class="card"><div class="row"><div><b>${esc(c.name || (p && p.name) || route.mint.slice(0, 6))}</b><div class="small muted">${esc(c.symbol || "")} · ${esc(route.mint.slice(0, 4))}…${esc(route.mint.slice(-4))}</div></div>
   ${p && p.status === "open" ? fomoBtn(c, "Sell on FOMO", "r") : fomoBtn(c, "Buy on FOMO", "g")}</div>
   <canvas id="chart" height="220"></canvas><div class="small muted"><span class="o">- - -</span> Risk trailing stop${p && p.entry_price ? ` · <span style="color:#6aa8ff">—</span> entry` : ""}</div></div>`;
  if (p) h += `<div class="card grid"><div class="kv"><span class="muted small">Size</span><b>${usd(p.size_usd)}</b></div><div class="kv"><span class="muted small">Entry</span><b>${p.entry_price ? p.entry_price.toPrecision(4) : "—"}</b></div>
   <div class="kv"><span class="muted small">Stop</span><b>-${p.stop_pct}%</b></div><div class="kv"><span class="muted small">${p.status === "closed" ? "P&L" : "Now"}</span><b>${p.status === "closed" ? usd(p.pnl_usd) : p.lastPrice ? p.lastPrice.toPrecision(4) : "—"}</b></div></div>`;
  if (c.scan) h += `<div class="card small"><div class="row"><span>Scanner</span><span>${esc(c.scan.verdict)}${c.scan.reason ? " · " + esc(c.scan.reason) : ""}</span></div>
   <div class="row"><span class="muted">Liquidity</span><span>${usd(c.scan.liquidity_usd, 0)}</span></div><div class="row"><span class="muted">Top 10</span><span>${c.scan.top10_pct == null ? "—" : c.scan.top10_pct.toFixed(1) + "%"}</span></div></div>`;
  h += socialCard(c.social);
  if (c.analysis && c.analysis.answers) { const A = c.analysis.answers; h += `<div class="card small"><div class="row"><b>Analyst</b><span>score ${c.analysis.score}</span></div>${Object.keys(A).map(k => `<div class="row"><span class="muted">${k}</span><span>${A[k].toFixed(2)}</span></div>`).join("")}</div>`; }
  return h;
}
function drawChart() {
  const cv = $("#chart"); if (!cv) return;
  const c = COINS.find(x => x.mint === route.mint) || {}, pr = (c.prices || []).filter(x => x[1]);
  const p = S.positions.find(x => x.mint === route.mint);
  const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = 220 * devicePixelRatio, ctx = cv.getContext("2d");
  ctx.scale(devicePixelRatio, devicePixelRatio); const w = W / devicePixelRatio, hh = 220;
  if (pr.length < 2) { ctx.fillStyle = "#8a8a99"; ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.fillText("Waiting for prices…", w / 2, hh / 2); return; }
  const B = 60000, cs = []; // 1-min candles
  pr.forEach(([ts, px]) => { const t = Math.floor(Date.parse(ts) / B) * B, l = cs[cs.length - 1];
    if (l && l.t === t) { l.h = Math.max(l.h, px); l.l = Math.min(l.l, px); l.c = px; } else cs.push({t, o: l ? l.c : px, h: px, l: px, c: px}); });
  let lo = Math.min(...cs.map(x => x.l)), hi = Math.max(...cs.map(x => x.h));
  const lines = []; if (p && p.exitLine) lines.push([p.exitLine, "#ff9f1a", [6, 5]]); if (p && p.entry_price) lines.push([p.entry_price, "#6aa8ff", []]);
  lines.forEach(([v]) => { lo = Math.min(lo, v); hi = Math.max(hi, v); }); const pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
  const y = v => 8 + (hh - 16) * (1 - (v - lo) / (hi - lo)), n = Math.max(cs.length, 20), cw = w / n;
  cs.forEach((k, i) => { const x = i * cw + cw / 2, up = k.c >= k.o; ctx.strokeStyle = ctx.fillStyle = up ? "#2fd27a" : "#ff5a5f";
    ctx.beginPath(); ctx.moveTo(x, y(k.h)); ctx.lineTo(x, y(k.l)); ctx.stroke(); const t = y(Math.max(k.o, k.c)), b = y(Math.min(k.o, k.c)); ctx.fillRect(x - cw * 0.35, t, cw * 0.7, Math.max(1, b - t)); });
  lines.forEach(([v, col, dash]) => { ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, y(v)); ctx.lineTo(w, y(v)); ctx.stroke(); ctx.setLineDash([]);
    if (col === "#ff9f1a") { ctx.fillStyle = col; ctx.font = "11px system-ui"; ctx.textAlign = "right"; ctx.fillText("Risk trailing stop", w - 4, y(v) - 4); } });
}

const SL = [["Stop", "risk.stop_pct", "stop", 0.5, "%"], ["Trailing stop", "risk.trail_pct", "trail", 0.5, "%"], ["Stack per trade", "executor.stack_pct", "stack_pct", 0.5, "%"],
  ["Min liquidity", "scanner.min_liquidity_usd", "min_liq", 500, "$"], ["Min score", "analyst.min_score", "min_score", 1, ""], ["Timeout", "risk.timeout_h", "timeout", 0.25, "h"]];
function account() {
  const st = S.settings;
  let h = `<div class="card"><div class="row"><b>Mode</b><span class="badge ${S.mode === "LIVE" ? "live" : ""}">${S.mode}</span></div><div class="small muted" style="margin-top:6px">${S.mode === "PAPER" ? `Paper stack ${usd(S.stack)}. LIVE only when you send LIVE in Telegram.` : `LIVE stack ${usd(S.stack)}. You still tap every trade on FOMO yourself.`}</div>
    <div class="row small"><span class="muted">Min stack for ${st["executor.stack_pct"]}% tickets</span><span>${usd(S.minStack)}</span></div>
    <div class="row small"><span class="muted">Below min</span><span>${st["executor.below_min"]}</span></div><div class="row small"><span class="muted">Analyst</span><span>${st["analyst.mode"]}</span></div>
    <div class="row small"><span class="muted">Pushes</span><span>${S.channels.length ? S.channels.join(", ") : "none connected"}</span></div></div>`;
  h += `<div class="card"><b>Settings</b><div class="small muted">Slide, then send the command to the desk (Telegram or Grok Bot chat). This page can't change the desk by itself.</div>` +
    SL.map(([lab, key, alias, step, u]) => { const [lo, hi] = S.ranges[key]; const v = st[key];
      return `<div style="margin-top:12px"><div class="row"><span>${lab}</span><span id="v_${alias}">${u === "$" ? usd(v, 0) : (key.endsWith("stop_pct") || key.endsWith("trail_pct") ? "-" : "") + v + u}</span></div>
       <input type="range" min="${lo}" max="${Math.min(hi, key.includes("liquidity") ? 200000 : hi)}" step="${step}" value="${v}" oninput="sl('${alias}','${u}',this.value,'${key}')"></div>`; }).join("") +
    `<pre id="cmd" class="small" style="margin-top:12px">set stop to ${st["risk.stop_pct"]}</pre><button class="btn sec" onclick="navigator.clipboard&&navigator.clipboard.writeText($('#cmd').textContent)">Copy command</button></div>`;
  h += `<div class="card"><b>Push on this phone</b><div class="small muted" style="margin:6px 0">Add to Home Screen first on iPhone. The desk can't receive anything from this page, so copy the subscription and send it to Grok Bot.</div>
    <button class="btn sec" onclick="sub()">Enable push</button><pre id="subout" class="small" style="display:none"></pre></div>`;
  h += `<div class="card"><b>FOMO</b><div class="row small" style="margin-top:8px"><span class="muted">Referral</span><span>muteee · 10% off fees</span></div>
    <div style="margin-top:10px"><a class="btn" href="${SIGNUP}" target="_blank" rel="noopener">Sign up on FOMO</a> <a class="btn sec" href="${esc(S.profileUrl)}" target="_blank" rel="noopener">@muteee</a></div></div>`;
  return h;
}
function sl(alias, u, v, key) { const neg = key.endsWith("stop_pct") || key.endsWith("trail_pct"); $("#v_" + alias).textContent = u === "$" ? usd(+v, 0) : (neg ? "-" : "") + v + u; $("#cmd").textContent = `set ${alias} to ${v}`; }
async function sub() {
  const o = $("#subout"); o.style.display = "block";
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser has no Web Push. On iPhone: Share → Add to Home Screen, then open from there.");
    const reg = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready;
    if (await Notification.requestPermission() !== "granted") throw new Error("Notifications not allowed.");
    const k = S.vapidPublic; if (!k) throw new Error("Desk has no push key.");
    const raw = atob(k.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - k.length % 4) % 4));
    const s = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0))});
    o.textContent = "desk push-sub " + JSON.stringify(s);
  } catch (e) { o.textContent = e.message; }
}


// ---------- LIVE VIEW ----------
// Feed = desk/live.py snapshot (last ~100 events + heartbeats + mode). Sources, best first:
//  1. realtime: signed snapshots pushed to Nostr relays (cfg.realtime) -> arrives < 1 s after the desk acts
//  2. cfg.feedUrl: a read-only HTTPS endpoint polled every 3 s (if one is configured)
//  3. Pages copy d/<DP>/live.json, polled every 15 s (Pages itself only refreshes ~every 6 min)
var LV = null, LCFG = null, lvSrc = "", lvGot = 0, lvFilter = "all";
const COIN_RE = /^https:\/\/fomo\.family\/coin\?address=[A-Za-z0-9]+&chainId=\d+&r=muteee&source=share_link$/;
const lvLink = e => COIN_RE.test((e && e.link) || "") ? e.link : SIGNUP;
function lvAccept(f, src) {
  if (!f || !Array.isArray(f.events) || !f.ts) return;
  if (LV && Date.parse(f.ts) < Date.parse(LV.ts)) return;           // keep the newest snapshot
  LV = f; lvSrc = src; lvGot = Date.now();
  if (route.tab === "live" && !route.view) render(); else lvTick();
}
async function liveStart() {
  if (!DP) return;
  try { LCFG = await j("live_cfg.json"); } catch (e) { LCFG = {}; }
  if (LCFG.realtime && LCFG.pubkey && (LCFG.relays || []).length) LCFG.relays.slice(0, 3).forEach(lvRelay);
  if (LCFG.feedUrl && /^https:\/\//.test(LCFG.feedUrl)) { const f = async () => { try { const r = await fetch(LCFG.feedUrl, {cache: "no-store"}); if (r.ok) lvAccept(await r.json(), "direct"); } catch (e) {} }; f(); setInterval(f, 3000); }
  const pg = async () => { if (Date.now() - lvGot < 20000 && lvSrc !== "pages") return; try { lvAccept(await j("live.json"), "pages"); } catch (e) {} };
  pg(); setInterval(pg, 15000); setInterval(lvTick, 1000);
}
function lvRelay(url, wait = 1000) {
  if (!/^wss:\/\//.test(url)) return;
  let ws; try { ws = new WebSocket(url); } catch (e) { return; }
  ws.onopen = () => { wait = 1000; ws.send(JSON.stringify(["REQ", "desk", {kinds: [LCFG.kind || 30078], authors: [LCFG.pubkey], "#d": [LCFG.d || "desk-live"], limit: 1}])); };
  ws.onmessage = m => { try { const x = JSON.parse(m.data); if (x[0] === "EVENT" && x[2] && x[2].pubkey === LCFG.pubkey) lvAccept(JSON.parse(x[2].content), "realtime"); } catch (e) {} };
  ws.onclose = () => setTimeout(() => lvRelay(url, Math.min(wait * 2, 30000)), wait);
}
function lvAge() { return LV ? Math.max(0, Math.round((Date.now() - Date.parse(LV.ts)) / 1000)) : null; }
function lvTick() {
  const el = document.getElementById("lvage"); if (!el) return;
  const a = lvAge(); el.textContent = a == null ? "connecting…" : a < 120 ? `${a}s ago` : ago(LV.ts);
  const d = document.getElementById("lvdot"); if (d) d.className = "pulse" + (a == null || a > (lvSrc === "pages" ? 900 : 30) ? " off" : "");
}
const VC = {pass: "g", kill: "r", buy: "b", sell: "o", new: "muted", info: "muted"};
const VL = {pass: "pass", kill: "kill", buy: "buy", sell: "sell", new: "new", info: "info"};
const AGN = {scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk", desk: "Desk"};
function live() {
  if (!LV) return `<div class="card empty"><span id="lvdot" class="pulse off"></span> Connecting to the desk… <span id="lvage" class="small"></span></div>`;
  const a = lvAge(), st = LV.stats || {}, lh = st.lastHour || {};
  const src = lvSrc === "realtime" ? "real-time" : lvSrc === "direct" ? "every 3 s" : "via Pages · refreshes ~every 6 min";
  let h = `<div class="card"><div class="row"><b><span id="lvdot" class="pulse"></span>LIVE <span class="badge${LV.mode === "LIVE" ? " live" : ""}">${esc(LV.mode)}</span></b><span class="small muted">updated <span id="lvage">${a}s ago</span></span></div>
   <div class="small muted" style="margin-top:4px">${esc(src)}</div>
   <div class="chips">${["scanner", "auditor", "analyst", "executor", "risk"].map(k => { const x = (LV.agents || {})[k] || {state: "down"};
     return `<span class="chip"><span class="dot ${esc(x.state)}"></span>${AGN[k]}<span class="muted"> ${x.ageS == null ? "—" : x.ageS + "s"}</span></span>`; }).join("")}</div>
   <div class="small muted" style="margin-top:8px">Last hour: ${lh.graduated ?? 0} graduated · ${lh.scanned ?? 0} checked · ${lh.killed ?? 0} killed · ${lh.audited ?? 0} audited · ${lh.buys ?? 0} buys · ${st.waiting ?? 0} waiting</div></div>`;
  const F = {all: () => true, pass: e => e.verdict === "pass", kill: e => e.verdict === "kill", trades: e => e.verdict === "buy" || e.verdict === "sell"};
  h += `<div class="seg">${[["all", "All"], ["pass", "Passed"], ["kill", "Killed"], ["trades", "Trades"]].map(([k, l]) => `<button class="${lvFilter === k ? "on" : ""}" onclick="lvFilter='${k}';render()">${l}</button>`).join("")}</div>`;
  const rows = LV.events.filter(F[lvFilter] || F.all);
  h += `<div class="card lv">` + (rows.length ? rows.map(e => {
    const nm = e.name || (e.mint ? e.mint.slice(0, 4) + "…" + e.mint.slice(-4) : AGN[e.agent] || e.agent);
    return `<div class="lvr"><div class="lvt">${esc(tms(e.ts))}</div><div class="lvb"><div class="row"><span class="t">${esc(nm)}${e.symbol ? ` <span class="muted small">${esc(e.symbol)}</span>` : ""}</span><span class="vp ${VC[e.verdict] || "muted"}">${esc(VL[e.verdict] || e.verdict)}</span></div>
      <div class="d"><span class="ag">${esc(AGN[e.agent] || e.agent)}</span> · ${esc(e.reason)}</div>${e.mint ? `<a class="small" href="${esc(lvLink(e))}" target="_blank" rel="noopener">Coin on FOMO ›</a>` : ""}</div></div>`; }).join("")
    : `<div class="empty">Nothing in this filter yet.</div>`) + `</div>`;
  return h;
}

let stack = [];
function go(v, mint) { if (TABS.includes(v)) { route = {tab: v}; stack = []; } else { stack.push({...route}); route = {...route, view: v, mint}; } render(); scrollTo(0, 0); }
function back() { route = stack.pop() || {tab: route.tab}; render(); }
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => go(b.dataset.tab));
poll(); setInterval(poll, POLL_MS); liveStart();
