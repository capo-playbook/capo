/* Capo Risk Calculator + Trade Journal. Runs entirely in the browser; the journal lives in localStorage only.
   No network calls. Defaults are editable assumptions, never market data. */
(function () {
  "use strict";
  var calc = document.getElementById("calc");
  if (!calc) return;
  var $ = function (id) { return document.getElementById(id); };
  var CK = "capo_calc_v1", JK = "capo_journal_v1", MAX = 2000;
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function num(id) { var v = $(id).value.trim(); if (v === "") return null; var n = Number(v); return isFinite(n) ? n : NaN; }
  function fmt(n, unit) {
    if (n == null || !isFinite(n)) return "—";
    var a = Math.abs(n), d = a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    var s = n.toLocaleString("en-US", { maximumFractionDigits: d });
    return unit === "USD" ? (n < 0 ? "−$" + s.replace("-", "") : "$" + s) : s.replace("-", "−") + " SOL";
  }
  function pct(n, d) { return n == null || !isFinite(n) ? "—" : (n * 100).toFixed(d == null ? 1 : d) + "%"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function setO(k, v, note) { var o = $("o-" + k); o.querySelector(".ov").textContent = v; if (note != null) o.querySelector(".on").textContent = note; }

  /* ---------------- calculator ---------------- */
  var IDS = ["c-unit", "c-bank", "c-risk", "c-stop", "c-cost", "c-cap", "c-liq", "c-solusd", "c-maximp"];
  var saved = load(CK, null);
  if (saved && typeof saved === "object") IDS.forEach(function (id) { if (saved[id] != null && $(id)) $(id).value = saved[id]; });
  var last = null;
  function unitLabels(u) {
    Array.prototype.forEach.call(document.querySelectorAll(".ju"), function (e) { e.textContent = u; });
    var bu = $("c-bank").parentNode.querySelector(".unit"); if (bu) bu.textContent = u === "USD" ? "$" : "SOL";
  }
  function compute() {
    var u = $("c-unit").value, B = num("c-bank"), r = num("c-risk"), s = num("c-stop"), c = num("c-cost"), k = num("c-cap"),
        L = num("c-liq"), P = num("c-solusd"), m = num("c-maximp"), msg = $("calc-msg"), flag = $("calc-flag"), bad = [];
    unitLabels(u);
    var v = {}; IDS.forEach(function (id) { v[id] = $(id).value; }); store(CK, v);
    if (!(B > 0)) bad.push("Bankroll must be more than 0.");
    if (!(r > 0 && r <= 100)) bad.push("Risk per trade must be between 0 and 100%.");
    if (!(s > 0 && s <= 100)) bad.push("Stop distance must be between 0 and 100%.");
    if (!(c >= 0 && c < 100)) bad.push("Round-trip costs must be between 0 and 100%.");
    if (!(k > 0 && k <= 100)) bad.push("Lottery-ticket cap must be between 0 and 100%.");
    if (L != null && !(L > 0)) bad.push("Liquidity must be a positive number, or blank.");
    if (P != null && !(P > 0)) bad.push("SOL price must be a positive number, or blank.");
    if (m != null && !(m > 0 && m < 100)) bad.push("Max exit impact must be between 0 and 100%.");
    if (bad.length) {
      msg.textContent = bad.join(" "); msg.className = "calc-msg small bad"; last = null;
      ["budget", "stopsize", "cap", "size", "zero", "be", "impact", "maximp", "tp"].forEach(function (x) { setO(x, "—"); });
      flag.dataset.l = "idle"; flag.textContent = "Fix the highlighted inputs to see your size."; return;
    }
    msg.textContent = ""; msg.className = "calc-msg small";
    var budget = B * r / 100, stopsize = budget / ((s + c) / 100), cap = B * k / 100, size = Math.min(stopsize, cap);
    var bound = stopsize <= cap ? "Your stop sets it." : "The lottery cap sets it.";
    var be = c / 100 / (1 - c / 100), tp = 1 / (2 * (1 - c / 200));
    setO("budget", fmt(budget, u)); setO("stopsize", fmt(stopsize, u)); setO("cap", fmt(cap, u));
    setO("size", fmt(size, u), bound + " " + pct(size / B, 2) + " of your bankroll.");
    setO("zero", "−" + fmt(size, u).replace("−", ""), "A rug skips your stop. That's " + pct(size / B, 2) + " of the bankroll.");
    setO("be", "+" + pct(be, 1)); setO("tp", pct(tp, 0) + " of the position", "Then the rest rides for free.");
    var side = null, imp = null, mx = null;
    if (L != null) side = u === "USD" ? L / 2 : (P ? L / 2 / P : null);
    if (side) {
      var f = size / side; imp = f / (1 + f); setO("impact", "≈" + pct(imp, 1), "You'd be " + pct(f, 1) + " of the pool's SOL side.");
      if (m != null) { var fm = m / (100 - m); mx = side * fm; setO("maximp", fmt(mx, u), "Keeps a full exit under " + m + "% impact."); }
    } else {
      var why = L == null ? "Add the pool liquidity to see this." : "Add today's SOL price to convert USD liquidity.";
      setO("impact", "—", why); setO("maximp", "—", why);
    }
    var lv = "ok", txt = "Inside the Playbook's sizing rules. It can still go to zero, so only risk what you'd shrug off.";
    if (size / B > 0.02) { lv = "red"; txt = "Over the Playbook's 1–2% line. Lower the cap or the risk %."; }
    else if (size / B > 0.01) { lv = "amber"; txt = "Between 1% and 2% of the bankroll. The Playbook flags this zone."; }
    if (imp != null && m != null && imp * 100 > m) { lv = lv === "red" ? "red" : "amber"; txt += " Exit impact is above your " + m + "% limit: the pool is thin for this size."; }
    if (s < c) { lv = lv === "red" ? "red" : "amber"; txt += " Your stop is tighter than your costs, so small wiggles will stop you out at a loss."; }
    flag.dataset.l = lv; flag.textContent = txt;
    last = { u: u, size: size, risk: size * (s + c) / 100 };
  }
  calc.addEventListener("input", compute); calc.addEventListener("change", compute);
  calc.addEventListener("submit", function (e) { e.preventDefault(); compute(); });
  compute();

  /* ---------------- journal ---------------- */
  var jf = $("jr-form"), jmsg = $("jr-msg"), tbody = $("jr-table").querySelector("tbody");
  var J = load(JK, []); if (!Array.isArray(J)) J = [];
  var editing = null;
  function say(t, ok) { jmsg.textContent = t; jmsg.className = "jr-msg small " + (ok ? "ok" : "bad"); }
  function nowLocal() { var d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
  function tms(s) { var t = s ? Date.parse(s) : NaN; return isFinite(t) ? t : null; }
  function hold(ms) {
    if (ms == null || ms < 0) return "—"; var mn = ms / 60000;
    if (mn < 60) return Math.round(mn) + " min"; if (mn < 1440) return (mn / 60).toFixed(1) + " h"; return (mn / 1440).toFixed(1) + " d";
  }
  function pnl(e) { return e.back === "" || e.back == null ? null : Number(e.back) - Number(e.size); }
  var TAGS = {}; Array.prototype.forEach.call(jf.querySelectorAll("input[name=tags]"), function (i) { TAGS[i.value] = i.parentNode.textContent.trim(); });
  function render() {
    var u = $("c-unit").value, rows = J.slice().sort(function (a, b) { return (tms(b.opened) || 0) - (tms(a.opened) || 0); });
    if (!rows.length) tbody.innerHTML = '<tr class="empty"><td colspan="8">No trades yet. Log your first one above, or import a CSV.</td></tr>';
    else tbody.innerHTML = rows.map(function (e) {
      var p = pnl(e), R = p != null && Number(e.risk) > 0 ? p / Number(e.risk) : null;
      var tg = (e.tags || []).map(function (t) { return '<span class="jt">' + esc(TAGS[t] || t) + "</span>"; }).join("");
      return '<tr data-id="' + esc(e.id) + '"><td>' + esc((e.opened || "").replace("T", " ")) + "</td><td><b>" + esc(e.coin) + "</b></td><td>" + esc(fmt(Number(e.size), e.unit)) +
        '</td><td class="' + (p == null ? "" : p >= 0 ? "pos" : "neg") + '">' + (p == null ? "open" : (p >= 0 ? "+" : "") + esc(fmt(p, e.unit))) + "</td><td>" + (R == null ? "—" : (R >= 0 ? "+" : "") + R.toFixed(2) + "R") +
        "</td><td>" + hold(tms(e.closed) != null && tms(e.opened) != null ? tms(e.closed) - tms(e.opened) : null) + "</td><td>" + (tg || '<span class="muted small">clean</span>') +
        '</td><td class="acts"><button type="button" class="lnk" data-a="edit">Edit</button><button type="button" class="lnk" data-a="del">Delete</button></td></tr>';
    }).join("");
    var cl = J.filter(function (e) { return pnl(e) != null && (e.unit || "SOL") === u; }), other = J.filter(function (e) { return pnl(e) != null && (e.unit || "SOL") !== u; }).length;
    var n = cl.length, w = cl.filter(function (e) { return pnl(e) > 0; }).length, rs = cl.filter(function (e) { return Number(e.risk) > 0; });
    var net = cl.reduce(function (a, e) { return a + pnl(e); }, 0), fees = cl.reduce(function (a, e) { return a + (Number(e.fees) || 0); }, 0);
    var hs = cl.map(function (e) { var a = tms(e.opened), b = tms(e.closed); return a != null && b != null && b >= a ? b - a : null; }).filter(function (x) { return x != null; });
    $("s-n").textContent = n + (other ? " (+" + other + " in other unit)" : "");
    $("s-win").textContent = n ? pct(w / n, 0) : "—";
    $("s-avgr").textContent = rs.length ? ((function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "R"; })(rs.reduce(function (a, e) { return a + pnl(e) / Number(e.risk); }, 0) / rs.length)) : "—";
    $("s-net").textContent = n ? (net >= 0 ? "+" : "") + fmt(net, u) : "—";
    $("s-hold").textContent = hs.length ? hold(hs.reduce(function (a, b) { return a + b; }, 0) / hs.length) : "—";
    $("s-plan").textContent = n ? pct(cl.filter(function (e) { return e.followed; }).length / n, 0) : "—";
    $("s-costs").textContent = n ? fmt(fees, u) : "—";
    var br = $("jr-breaks");
    charts(cl, u);
    if (!n) { br.innerHTML = '<p class="muted small">Rule-break tags show up here once you log closed trades.</p>'; return; }
    var clean = cl.filter(function (e) { return !(e.tags || []).length; }), cnet = clean.reduce(function (a, e) { return a + pnl(e); }, 0);
    var items = Object.keys(TAGS).map(function (t) {
      var x = cl.filter(function (e) { return (e.tags || []).indexOf(t) >= 0; }); if (!x.length) return "";
      var s = x.reduce(function (a, e) { return a + pnl(e); }, 0);
      return '<li><span class="jt">' + esc(TAGS[t]) + "</span> " + x.length + "× · " + '<b class="' + (s >= 0 ? "pos" : "neg") + '">' + (s >= 0 ? "+" : "") + esc(fmt(s, u)) + "</b></li>";
    }).join("");
    br.innerHTML = '<p class="small"><b>Clean trades</b> (no rule broken): ' + clean.length + " · " + '<b class="' + (cnet >= 0 ? "pos" : "neg") + '">' + (cnet >= 0 ? "+" : "") + esc(fmt(cnet, u)) + "</b></p>" +
      (items ? '<ul class="brk">' + items + "</ul>" : '<p class="muted small">No rule breaks logged. Keep it that way.</p>');
  }
  /* ---------- charts (inline SVG / HTML, drawn from this browser's journal only) ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function closeT(e) { var c = tms(e.closed); return c != null ? c : tms(e.opened); }
  function emptyMsg(el, t) { el.innerHTML = '<p class="muted small jc-empty">' + esc(t) + "</p>"; }
  function charts(cl, u) {
    // equity curve
    var eb = $("eq-box"), es = $("eq-sum"), xs = cl.slice().sort(function (a, b) { return (closeT(a) || 0) - (closeT(b) || 0); });
    if (xs.length < 2) { emptyMsg(eb, "Log two or more closed trades to draw the curve."); es.textContent = ""; }
    else {
      var pts = [0], run = 0, peak = 0, dd = 0; xs.forEach(function (e) { run += pnl(e); pts.push(run); peak = Math.max(peak, run); dd = Math.max(dd, peak - run); });
      var W = 320, H = 180, P = 8, lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts); if (hi === lo) { hi += 1; lo -= 1; }
      var X = function (i) { return P + i * (W - 2 * P) / (pts.length - 1); }, Y = function (v) { return P + (hi - v) * (H - 2 * P) / (hi - lo); };
      var d = pts.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" ");
      var last = pts[pts.length - 1], col = last >= 0 ? "#5fd08a" : "#ff9a8d";
      eb.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Equity curve: net ' + esc((last >= 0 ? "+" : "") + fmt(last, u)) + " over " + xs.length + ' trades" preserveAspectRatio="none">' +
        '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="rgba(212,175,55,.35)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>' +
        '<path d="' + d + " L" + X(pts.length - 1).toFixed(1) + " " + Y(0).toFixed(1) + " L" + X(0).toFixed(1) + " " + Y(0).toFixed(1) + 'Z" fill="' + (last >= 0 ? "rgba(95,208,138,.10)" : "rgba(255,154,141,.10)") + '"/>' +
        '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
      es.innerHTML = "Net <b class=\"" + (last >= 0 ? "pos" : "neg") + "\">" + (last >= 0 ? "+" : "") + esc(fmt(last, u)) + "</b> over " + xs.length + " trades · worst drawdown from a peak <b>" + esc(fmt(dd, u)) + "</b>";
    }
    // weekday x time-of-day heatmap
    var hb = $("hm-box"), hs = $("hm-sum");
    if (!cl.length) { emptyMsg(hb, "Closed trades fill this in."); hs.textContent = ""; }
    else {
      var days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], bl = ["0–6", "6–12", "12–18", "18–24"], g = {}, mx = 0;
      cl.forEach(function (e) { var t = tms(e.opened); if (t == null) return; var dt = new Date(t), k = ((dt.getDay() + 6) % 7) + "_" + Math.floor(dt.getHours() / 6);
        g[k] = g[k] || { n: 0, s: 0 }; g[k].n++; g[k].s += pnl(e); });
      Object.keys(g).forEach(function (k) { mx = Math.max(mx, Math.abs(g[k].s)); });
      var h = '<div class="hm" role="table" aria-label="Net result by weekday and entry time"><span class="hl" role="columnheader"></span>' + bl.map(function (b) { return '<span class="hl" role="columnheader">' + b + "</span>"; }).join("");
      var best = null, worst = null;
      days.forEach(function (dn, di) {
        h += '<span class="hl" role="rowheader">' + dn + "</span>";
        bl.forEach(function (b, bi) {
          var c = g[di + "_" + bi];
          if (!c) { h += '<span class="c0" role="cell" title="' + dn + " " + b + ': no trades">·</span>'; return; }
          var a = mx ? 0.18 + 0.62 * Math.abs(c.s) / mx : 0.2, bg = c.s >= 0 ? "rgba(95,208,138," + a.toFixed(2) + ")" : "rgba(255,122,107," + a.toFixed(2) + ")";
          var lab = dn + " " + b + ": " + c.n + " trade" + (c.n > 1 ? "s" : "") + ", " + (c.s >= 0 ? "+" : "") + fmt(c.s, u);
          h += '<span role="cell" style="background:' + bg + '" title="' + esc(lab) + '" aria-label="' + esc(lab) + '">' + c.n + "</span>";
          if (!best || c.s > best.s) best = { s: c.s, l: dn + " " + b }; if (!worst || c.s < worst.s) worst = { s: c.s, l: dn + " " + b };
        });
      });
      hb.innerHTML = h + "</div>";
      hs.innerHTML = cl.length < 10 ? '<span class="muted">Small sample (' + cl.length + " trades): patterns here are mostly noise until you have more.</span>"
        : "Best block: <b>" + esc(best.l) + "</b> (" + (best.s >= 0 ? "+" : "") + esc(fmt(best.s, u)) + ") · worst: <b>" + esc(worst.l) + "</b> (" + (worst.s >= 0 ? "+" : "") + esc(fmt(worst.s, u)) + "). Cells show trade counts; hours are local.";
    }
    // MAE / MFE scatter
    var xb = $("ex-box"), xsu = $("ex-sum"), ex = cl.filter(function (e) { return e.mae !== "" && e.mae != null && isFinite(Number(e.mae)) && Number(e.size) > 0; });
    if (ex.length < 3) { emptyMsg(xb, "Add MAE / MFE to 3+ closed trades (in \u201cExcursions\u201d below) to see whether your stops are too tight or you give back winners."); xsu.textContent = ""; }
    else {
      var W2 = 320, H2 = 180, P2 = 22, res = ex.map(function (e) { return { mae: Number(e.mae), mfe: e.mfe === "" || e.mfe == null ? null : Number(e.mfe), r: pnl(e) / Number(e.size) * 100, c: e.coin }; });
      var mxA = Math.max.apply(null, res.map(function (r) { return r.mae; }).concat([10])), ys = res.map(function (r) { return r.r; }), yl = Math.min.apply(null, ys.concat([-10])), yh = Math.max.apply(null, ys.concat([10]));
      var X2 = function (v) { return P2 + v * (W2 - 2 * P2) / mxA; }, Y2 = function (v) { return 6 + (yh - v) * (H2 - 6 - P2) / (yh - yl); };
      var svg = '<svg viewBox="0 0 ' + W2 + " " + H2 + '" role="img" aria-label="Scatter of worst drawdown while open against final result, ' + res.length + ' trades">' +
        '<line x1="' + P2 + '" x2="' + (W2 - 6) + '" y1="' + Y2(0).toFixed(1) + '" y2="' + Y2(0).toFixed(1) + '" stroke="rgba(212,175,55,.35)" stroke-dasharray="4 4"/>' +
        '<text x="' + (W2 - 6) + '" y="' + (H2 - 4) + '" text-anchor="end" fill="#9d9580" font-size="10">MAE % (worst dip) →</text><text x="2" y="12" fill="#9d9580" font-size="10">result %</text>' +
        '<text x="' + P2 + '" y="' + (H2 - 4) + '" fill="#9d9580" font-size="10">0</text><text x="' + (P2 - 3) + '" y="' + (Y2(0) + 3).toFixed(1) + '" text-anchor="end" fill="#9d9580" font-size="9">0</text>' +
        res.map(function (r) { return '<circle cx="' + X2(r.mae).toFixed(1) + '" cy="' + Y2(r.r).toFixed(1) + '" r="4" fill="' + (r.r >= 0 ? "#5fd08a" : "#ff9a8d") + '" fill-opacity=".85"><title>' + esc(r.c + ": dipped " + r.mae + "%, result " + r.r.toFixed(1) + "%") + "</title></circle>"; }).join("") + "</svg>";
      xb.innerHTML = svg;
      var wn = res.filter(function (r) { return r.r > 0; }), avg = function (a, f) { return a.length ? a.reduce(function (s, x) { return s + f(x); }, 0) / a.length : null; };
      var wMae = avg(wn, function (r) { return r.mae; }), give = avg(wn.filter(function (r) { return r.mfe != null; }), function (r) { return Math.max(0, r.mfe - r.r); });
      xsu.innerHTML = (wMae != null ? "Winners dipped <b>" + wMae.toFixed(1) + "%</b> on average before working. A stop tighter than that would have cut most of them. " : "") +
        (give != null ? "On winners you gave back <b>" + give.toFixed(1) + "</b> points from the best point to your exit." : "") + (wMae == null && give == null ? '<span class="muted">No winners with excursions yet.</span>' : "");
    }
  }
  function save() { if (!store(JK, J)) { say("Couldn't save: this browser blocks local storage (private mode?).", false); return false; } return true; }
  jf.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = jf, coin = f.coin.value.trim(), size = Number(f.size.value), back = f.back.value.trim(), op = f.opened.value, clo = f.closed.value;
    if (!coin) { say("Add the coin's ticker.", false); f.coin.focus(); return; }
    if (!op || tms(op) == null) { say("Add when you opened the trade.", false); f.opened.focus(); return; }
    if (!(size > 0)) { say("Size must be more than 0.", false); f.size.focus(); return; }
    if (back !== "" && !(Number(back) >= 0)) { say("'Got back' must be 0 or more (0 if it went to zero).", false); f.back.focus(); return; }
    if ((f.mae.value.trim() !== "" && !(Number(f.mae.value) >= 0 && Number(f.mae.value) <= 100)) || (f.mfe.value.trim() !== "" && !(Number(f.mfe.value) >= 0))) { say("MAE is 0–100% below entry and MFE is 0% or more above it. Leave them blank if unsure.", false); f.mae.focus(); return; }
    if (clo && tms(clo) < tms(op)) { say("Closed time is before the open time.", false); f.closed.focus(); return; }
    var mint = f.mint.value.trim();
    if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) { say("That mint doesn't look like a Solana address. Leave it blank if unsure.", false); f.mint.focus(); return; }
    var ent = { id: editing || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), coin: coin.slice(0, 24), mint: mint, opened: op, closed: clo,
      unit: $("c-unit").value, size: String(size), back: back, fees: f.fees.value.trim(), risk: f.risk.value.trim(), stopset: f.stopset.checked, followed: f.followed.checked,
      tags: Array.prototype.filter.call(f.querySelectorAll("input[name=tags]"), function (i) { return i.checked; }).map(function (i) { return i.value; }),
      note: f.note.value.trim().slice(0, 500), mae: f.mae.value.trim(), mfe: f.mfe.value.trim() };
    if (!editing && J.length >= MAX) { say("Journal is full (" + MAX + " trades). Export and delete old ones first.", false); return; }
    if (editing) J = J.map(function (x) { return x.id === editing ? ent : x; }); else J.push(ent);
    if (!save()) return;
    say(editing ? "Trade updated." : "Saved to this browser.", true); editing = null; jf.reset(); f.opened.value = nowLocal(); render();
  });
  jf.addEventListener("reset", function () { editing = null; setTimeout(function () { jf.opened.value = nowLocal(); }, 0); });
  tbody.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-a]"); if (!b) return;
    var id = b.closest("tr").dataset.id, ent = J.filter(function (x) { return x.id === id; })[0]; if (!ent) return;
    if (b.dataset.a === "del") { if (!confirm("Delete this trade from your journal?")) return; J = J.filter(function (x) { return x.id !== id; }); save(); render(); say("Deleted.", true); return; }
    editing = id; var f = jf;
    f.coin.value = ent.coin; f.mint.value = ent.mint || ""; f.opened.value = ent.opened; f.closed.value = ent.closed || ""; f.size.value = ent.size; f.back.value = ent.back || "";
    f.fees.value = ent.fees || ""; f.risk.value = ent.risk || ""; f.stopset.checked = !!ent.stopset; f.followed.checked = !!ent.followed; f.note.value = ent.note || ""; f.mae.value = ent.mae || ""; f.mfe.value = ent.mfe || "";
    Array.prototype.forEach.call(f.querySelectorAll("input[name=tags]"), function (i) { i.checked = (ent.tags || []).indexOf(i.value) >= 0; });
    say("Editing " + ent.coin + ". Save to update it.", true); f.coin.focus();
  });
  $("to-jr").addEventListener("click", function () {
    if (!last) { $("calc-msg").textContent = "Fix the inputs first."; return; }
    var r = function (x) { return String(Math.round(x * 1e6) / 1e6); };
    $("c-unit").value = last.u; jf.size.value = r(last.size); jf.risk.value = r(last.risk); jf.stopset.checked = true;
    if (!jf.opened.value) jf.opened.value = nowLocal();
    render(); $("journal").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); jf.coin.focus({ preventScroll: true });
    say("Size and planned risk filled in from the calculator.", true);
  });
  /* CSV */
  var COLS = ["id", "opened", "closed", "coin", "mint", "unit", "size", "back", "fees", "risk", "stopset", "followed", "tags", "note", "mae", "mfe"];
  function cell(v) { v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $("jr-export").addEventListener("click", function () {
    if (!J.length) { say("Nothing to export yet.", false); return; }
    var lines = [COLS.join(",")].concat(J.map(function (e) { return COLS.map(function (k) { var v = e[k]; if (k === "tags") v = (v || []).join("|"); if (typeof v === "boolean") v = v ? "yes" : "no"; return cell(v); }).join(","); }));
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    a.download = "capo_journal_" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); say("Exported " + J.length + " trades.", true);
  });
  var ALIAS = { date: "opened", time: "opened", "open time": "opened", entry: "opened", "close time": "closed", exit: "closed", token: "coin", symbol: "coin", ticker: "coin",
    cost: "size", spent: "size", "size_sol": "size", proceeds: "back", received: "back", "got back": "back", fee: "fees", currency: "unit" };
  function normT(s) { s = String(s || "").trim().replace(/\//g, "-"); if (!s) return ""; if (/^\d{4}-\d\d-\d\d$/.test(s)) s += "T00:00"; s = s.replace(" ", "T");
    var m = s.match(/^(\d{4}-\d\d-\d\d)T(\d{1,2}):(\d\d)/); return m ? m[1] + "T" + ("0" + m[2]).slice(-2) + ":" + m[3] : s; }
  function n(v) { var x = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(x) ? x : NaN; }
  function sfx(v) { var m = String(v || "").replace(/[\d.,\s-]/g, ""); return m.toUpperCase(); }
  function utcLocal(s) { s = String(s || "").trim(); var t = /^\d{9,11}$/.test(s) ? Number(s) * 1000 : /^\d{12,14}$/.test(s) ? Number(s) : Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
    return isFinite(t) ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : null; }
  function hid(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  /* Fills -> round trips at average cost, per instrument. fills: [{k, coin, t (local str), side, qty, val, fee, unit}] */
  function pair(fills, tag) {
    fills.sort(function (a, b) { return tms(a.t) - tms(b.t); }); var pos = {}, out = [];
    fills.forEach(function (f) {
      var p = pos[f.k] || (pos[f.k] = { qty: 0, cost: 0, fee: 0, opened: null });
      if (f.side === "buy") { if (p.qty <= 1e-12) { p.opened = f.t; p.fee = 0; } p.qty += f.qty; p.cost += f.val; p.fee += f.fee; return; }
      if (p.qty <= 1e-12) return; // a sell without a recorded buy: skip
      var q = Math.min(f.qty, p.qty), frac = q / p.qty, c = p.cost * frac, fe = p.fee * frac + f.fee * (q / f.qty);
      out.push({ id: tag + "-" + hid(f.k + f.t + f.qty + f.val), coin: f.coin, opened: p.opened, closed: f.t, unit: f.unit, size: String(+c.toFixed(8)),
        back: String(+(f.val * (q / f.qty) - f.fee * (q / f.qty)).toFixed(8)), fees: String(+fe.toFixed(8)), note: "imported " + tag });
      p.qty -= q; p.cost -= c; p.fee -= p.fee * frac;
    });
    var open = Object.keys(pos).filter(function (k) { return pos[k].qty > 1e-9; }).length;
    return { out: out, open: open };
  }
  function toRows(list) { var H = ["id", "opened", "closed", "coin", "unit", "size", "back", "fees", "note"]; return { head: H, rows: list.map(function (o) { return H.map(function (h) { return o[h] == null ? "" : String(o[h]); }); }) }; }
  function quoteUnit(q) { q = q.toUpperCase(); return q === "SOL" || q === "WSOL" ? "SOL" : /^(USDT|USDC|USD|BUSD|FDUSD)$/.test(q) ? "USD" : null; }
  function convert(head, rows) {
    var ix = function (names) { for (var i = 0; i < names.length; i++) { var j = head.indexOf(names[i]); if (j >= 0) return j; } return -1; };
    var iPair = ix(["pair", "market"]), iSide = ix(["side", "type"]), iExec = ix(["executed", "filled", "quantity"]), iAmt = ix(["amount", "total"]), iDate = ix(["date(utc)", "date", "time", "date(utc+0)"]), iFee = ix(["fee"]);
    if (iPair >= 0 && iSide >= 0 && iExec >= 0 && iAmt >= 0 && iDate >= 0) {
      var fills = [];
      rows.forEach(function (r) {
        var pr = String(r[iPair] || "").toUpperCase().replace(/[-_/]/g, ""), qv = sfx(r[iAmt]), m = pr.match(/^(.+?)(USDT|USDC|FDUSD|BUSD|USD|SOL)$/), q = qv || (m ? m[2] : ""), u = quoteUnit(q);
        var base = m ? m[1] : pr.slice(0, pr.length - q.length), t = utcLocal(r[iDate]), side = String(r[iSide] || "").toLowerCase();
        if (!u || !base || !t || !/^(buy|sell)$/.test(side)) return;
        var fee = iFee >= 0 ? n(r[iFee]) : 0, fu = iFee >= 0 ? sfx(r[iFee]) : "";
        fills.push({ k: pr, coin: base.slice(0, 24), t: t, side: side, qty: n(r[iExec]), val: n(r[iAmt]), fee: fu && fu !== q ? 0 : (fee || 0), unit: u });
      });
      var P = pair(fills.filter(function (f) { return f.qty > 0 && f.val >= 0; }), "exchange"), o = toRows(P.out); o.name = "exchange trade history"; o.open = P.open; return o;
    }
    var iTok = ix(["token", "symbol", "coin"]), iQty = ix(["amount", "token_amount", "qty", "quantity"]), iSol = ix(["sol", "sol_amount", "amount_sol"]), iUsd = ix(["usd", "usd_amount", "value_usd", "amount_usd"]), iT = ix(["time", "date", "timestamp", "block_time"]);
    if (iSide >= 0 && iTok >= 0 && iQty >= 0 && iT >= 0 && (iSol >= 0 || iUsd >= 0)) {
      var fl = [];
      rows.forEach(function (r) {
        var side = String(r[iSide] || "").toLowerCase(), t = utcLocal(r[iT]), tok = String(r[iTok] || "").trim(), v = iSol >= 0 ? n(r[iSol]) : n(r[iUsd]);
        if (!/^(buy|sell)$/.test(side) || !t || !tok) return;
        fl.push({ k: tok, coin: tok.slice(0, 24), t: t, side: side, qty: n(r[iQty]), val: Math.abs(v), fee: iFee >= 0 ? (n(r[iFee]) || 0) : 0, unit: iSol >= 0 ? "SOL" : "USD" });
      });
      var P2 = pair(fl.filter(function (f) { return f.qty > 0 && f.val >= 0; }), "swaps"), o2 = toRows(P2.out); o2.name = "swap list"; o2.open = P2.open; return o2;
    }
    return null;
  }
  function parseCSV(t) {
    var rows = [], row = [], f = "", q = false, i, ch;
    t = t.replace(/^\ufeff/, "");
    for (i = 0; i < t.length; i++) {
      ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += ch;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); });
  }
  $("jr-import").addEventListener("change", function (ev) {
    var file = ev.target.files && ev.target.files[0]; if (!file) return;
    if (file.size > 2e6) { say("That file is too big (max 2 MB).", false); ev.target.value = ""; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var rows = parseCSV(String(rd.result)), head = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
      var conv = convert(head, rows), fmtName = "Capo journal";
      if (conv) { head = conv.head; rows = conv.rows; fmtName = conv.name; }
      else { head = head.map(function (h) { return ALIAS[h] || h; }); if (head.indexOf("id") < 0) fmtName = "simple Capo"; }
      if (head.indexOf("coin") < 0 || head.indexOf("opened") < 0 || head.indexOf("size") < 0) { say("That CSV doesn't look like a Capo journal export or one of the formats listed below (needs coin, opened, size columns).", false); ev.target.value = ""; return; }
      var have = {}, added = 0, skipped = 0; J.forEach(function (e) { have[e.id] = 1; });
      rows.forEach(function (r) {
        var o = {}; head.forEach(function (h, i) { o[h] = (r[i] || "").trim(); });
        Object.keys(o).forEach(function (k) { if (/^'[=+\-@]/.test(o[k])) o[k] = o[k].slice(1); });
        if (!conv && !o.id) { o.opened = normT(o.opened); o.closed = normT(o.closed); ["size", "back", "fees", "risk"].forEach(function (k) { if (o[k]) o[k] = String(n(o[k])); }); if (o.back === "NaN") o.back = "x";
          o.unit = String(o.unit || "").toUpperCase() === "USD" ? "USD" : "SOL"; o.id = "csv-" + hid(r.join("\u0001")); }
        var size = Number(o.size);
        if (!o.coin || !(size > 0) || tms(o.opened) == null || (o.back !== "" && o.back != null && !(Number(o.back) >= 0))) { skipped++; return; }
        var id = o.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
        if (have[id] || J.length >= MAX) { skipped++; return; }
        have[id] = 1; added++;
        J.push({ id: id, coin: o.coin.slice(0, 24), mint: (o.mint || "").slice(0, 44), opened: o.opened.slice(0, 16), closed: (o.closed || "").slice(0, 16), unit: o.unit === "USD" ? "USD" : "SOL",
          size: String(size), back: o.back || "", fees: o.fees || "", risk: o.risk || "", stopset: /^(yes|true|1|y)$/i.test(o.stopset || ""), followed: /^(yes|true|1|y)$/i.test(o.followed || ""),
          tags: (o.tags || "").split("|").map(function (x) { return x.trim(); }).filter(function (x) { return TAGS[x]; }), note: (o.note || "").slice(0, 500),
          mae: isFinite(Number(o.mae)) && o.mae !== "" && o.mae != null ? String(Math.abs(Number(o.mae))) : "", mfe: isFinite(Number(o.mfe)) && o.mfe !== "" && o.mfe != null ? String(Number(o.mfe)) : "" });
      });
      save(); render(); say("Imported " + added + " trade" + (added === 1 ? "" : "s") + " (" + fmtName + ")" + (conv && conv.open ? ", " + conv.open + " still-open position" + (conv.open > 1 ? "s" : "") + " left out" : "") + (skipped ? ", skipped " + skipped + " (duplicates or unreadable rows)" : "") + ".", added > 0);
      ev.target.value = "";
    };
    rd.onerror = function () { say("Couldn't read that file.", false); };
    rd.readAsText(file);
  });
  $("jr-clear").addEventListener("click", function () {
    if (!J.length) { say("The journal is already empty.", false); return; }
    if (!confirm("Delete all " + J.length + " trades from this browser? Export a CSV first if you want a copy.")) return;
    J = []; save(); render(); say("All entries deleted from this browser.", true);
  });
  $("c-unit").addEventListener("change", render);
  jf.opened.value = nowLocal(); render();
})();
