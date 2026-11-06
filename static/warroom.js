/* Capo War Room client. DEMO SIMULATION, PAPER ONLY. Read-only: this page can't vote, trade or post anything.
   Everything from the server is rendered with textContent (never innerHTML). */
(function () {
  "use strict";
  var root = document.getElementById("wr");
  if (!root) return;
  var m = document.querySelector('meta[name="capo-api"]'), API = m ? m.content.replace(/\/$/, "") : "";
  var $ = function (id) { return document.getElementById(id); };
  var lastId = 0, crew = {}, filter = "all", timer = null, fails = 0, POLL = 15000, MAXN = 240, data = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function money(n) { if (n == null || !isFinite(n)) return "—"; return (n < 0 ? "−$" : "$") + Math.abs(n).toFixed(2); }
  function smoney(n) { if (n == null || !isFinite(n)) return "—"; return (n >= 0 ? "+$" : "−$") + Math.abs(n).toFixed(2); }
  function pct(n) { if (n == null || !isFinite(n)) return "—"; return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%"; }
  function px(n) { if (n == null || !isFinite(n) || n <= 0) return "—"; if (n >= 1) return "$" + Number(n).toPrecision(4); if (n < 1e-9) return "$" + n.toExponential(3); return "$" + n.toFixed(Math.min(12, 3 - Math.floor(Math.log10(n)))); }
  function hm(ts) { try { return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch (e) { return ""; } }
  function dt(ts) { try { return new Date(ts * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function ago(ts) { var s = Math.max(0, Date.now() / 1000 - ts); return s < 60 ? Math.round(s) + " s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; }
  function get(path) {
    var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(API + path, { headers: { "ngrok-skip-browser-warning": "1" }, signal: ctl ? ctl.signal : undefined, credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  function eventNode(e) {
    var who = crew[e.member] || { name: e.member || "Crew", id: e.member || "x" };
    var li = el("li", "wr-ev k-" + (e.kind || "x")); li.dataset.k = e.kind || ""; li.dataset.m = who.id || "";
    if (e.vote) li.dataset.v = e.vote;
    li.appendChild(el("span", "wr-av", (who.name || "?").charAt(0)));
    var b = el("div", "wr-b"), h = el("p", "wr-h");
    h.appendChild(el("b", null, who.name));
    if (e.kind === "motion") h.appendChild(el("span", "wr-tag", "Motion"));
    else if (e.kind === "fill") h.appendChild(el("span", "wr-tag t-fill", "Paper fill"));
    else if (e.kind === "decision") h.appendChild(el("span", "wr-tag t-dec", "Decision"));
    else if (e.kind === "scan") h.appendChild(el("span", "wr-tag", "Scan"));
    if (e.vote && e.kind === "vote") h.appendChild(el("span", "wr-vote v-" + e.vote.toLowerCase(), e.vote));
    var tm = el("time", "wr-t", hm(e.ts)); tm.dateTime = new Date(e.ts * 1000).toISOString(); tm.title = "Round " + (e.round || 0); h.appendChild(tm);
    b.appendChild(h); b.appendChild(el("p", "wr-x", e.text)); li.appendChild(b);
    li.hidden = !show(li);
    return li;
  }
  function show(li) { return filter === "all" || li.dataset.k === filter || (filter === "decision" && li.dataset.k === "fill"); }
  function addEvents(evs) {
    var feed = $("wr-feed");
    if (!evs || !evs.length) return;
    var frag = document.createDocumentFragment();
    for (var i = evs.length - 1; i >= 0; i--) { frag.appendChild(eventNode(evs[i])); if (evs[i].id > lastId) lastId = evs[i].id; }
    var first = !feed.firstChild; feed.insertBefore(frag, feed.firstChild);
    if (!first) for (var j = 0; j < evs.length && j < 12; j++) { var n = feed.children[j]; if (n) n.classList.add("new"); }
    while (feed.children.length > MAXN) feed.removeChild(feed.lastChild);
  }
  function stats(d) {
    var a = d.account, pos = d.position, unreal = pos && pos.unreal_usd != null ? pos.unreal_usd : 0, eq = a.equity + unreal, pnl = eq - a.start;
    $("w-phase").textContent = d.phase_label;
    $("w-equity").textContent = money(eq);
    var p = $("w-pnl"); p.textContent = smoney(pnl) + " (" + pct(pnl / a.start * 100) + ")"; p.className = pnl >= 0 ? "pos" : "neg";
    $("w-record").textContent = a.wins + " · " + a.losses;
    $("w-costs").textContent = money(a.costs);
    $("w-tick").textContent = d.last_tick ? ago(d.last_tick) : "not yet";
    var steps = $("wr-steps").children, ph = d.phase === "HALTED" || d.phase === "PAUSED" ? "" : d.phase;
    for (var i = 0; i < steps.length; i++) steps[i].className = steps[i].dataset.ph === ph ? "on" : "";
    root.dataset.state = d.phase.toLowerCase();
    var box = $("wr-pos");
    while (box.firstChild) box.removeChild(box.firstChild);
    if (pos) {
      box.hidden = false;
      box.appendChild(el("p", "wr-pos-h", "Open paper position: " + pos.sym + " · " + money(pos.size_usd)));
      var g = el("div", "wr-pos-g");
      [["Entry fill", px(pos.entry_fill_usd)], ["Mark", px(pos.mark_usd)], ["Move", pct(pos.move_pct)], ["Paper P&L if sold", smoney(pos.unreal_usd)],
       ["Stop", px(pos.stop_usd)], ["Target", px(pos.target_usd)], ["Time stop", hm(pos.time_stop_at)]].forEach(function (r) {
        var c = el("div", "as"); c.appendChild(el("b", null, r[1])); c.appendChild(el("span", null, r[0])); g.appendChild(c); });
      box.appendChild(g);
    } else box.hidden = true;
    var st = d.phase === "COOLDOWN" && d.cooldown_until ? "Cooling down until " + hm(d.cooldown_until) + "." :
      d.phase === "ENTRY_WHEN" && d.candidate ? "Picked " + d.candidate + ". Arguing about timing." :
      d.phase === "HALTED" ? "Daily loss cap hit. No new paper entries until 00:00 UTC." :
      d.phase === "PAUSED" ? "The War Room is paused." : "Round " + d.round + ". " + d.mode.engine;
    $("wr-status").textContent = st;
  }
  function trades(d) {
    var box = $("wr-trades"), t = d.trades || [];
    if (!t.length) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var tb = el("table", "wr-tt"), th = el("thead"), hr = el("tr");
    ["Coin", "Opened", "Size", "Entry", "Exit", "Paper P&L"].forEach(function (h) { hr.appendChild(el("th", null, h)); });
    th.appendChild(hr); tb.appendChild(th);
    var body = el("tbody");
    t.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", null, r.sym)); tr.appendChild(el("td", null, dt(r.opened))); tr.appendChild(el("td", null, money(r.size_usd)));
      tr.appendChild(el("td", null, px(r.entry_fill_usd))); tr.appendChild(el("td", null, r.closed ? px(r.exit_fill_usd) : "open"));
      var c = el("td", r.closed ? (r.pnl_usd > 0 ? "pos" : "neg") : "muted", r.closed ? smoney(r.pnl_usd) : "—");
      if (r.reason) c.title = r.reason; tr.appendChild(c); body.appendChild(tr);
    });
    tb.appendChild(body); box.appendChild(tb);
    box.appendChild(el("p", "muted small", "Simulated paper fills at the DexScreener quote ± " + (d.rules.cost_rt_pct / 2).toFixed(2) + "% cost per side. Not real trades."));
    chart(d);
  }
  function chart(d) {
    var box = $("wr-chart"), c = (d.trades || []).filter(function (r) { return r.closed; }).slice().reverse();
    while (box.firstChild) box.removeChild(box.firstChild);
    if (c.length < 2) return;
    var eq = [d.rules.bankroll_usd], s = d.rules.bankroll_usd;
    c.forEach(function (r) { s += r.pnl_usd || 0; eq.push(s); });
    var W = 300, H = 70, mn = Math.min.apply(null, eq), mx = Math.max.apply(null, eq), rg = (mx - mn) || 1, NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("preserveAspectRatio", "none");
    var pts = eq.map(function (v, i) { return (i / (eq.length - 1) * W).toFixed(1) + "," + (H - 4 - (v - mn) / rg * (H - 8)).toFixed(1); }).join(" ");
    var pl = document.createElementNS(NS, "polyline"); pl.setAttribute("points", pts); pl.setAttribute("class", s >= d.rules.bankroll_usd ? "up" : "dn");
    svg.appendChild(pl); box.appendChild(svg);
  }
  function render(d, full) {
    data = d;
    if (full) {
      crew = {}; (d.crew || []).forEach(function (c) { crew[c.id] = c; });
      var feed = $("wr-feed"); while (feed.firstChild) feed.removeChild(feed.firstChild); lastId = 0;
      if (!d.events.length) { var li = el("li", "wr-ev k-system"); li.appendChild(el("p", "wr-x muted", "The crew hasn't met yet. The first round starts within ~" + d.tick_s + " s.")); feed.appendChild(li); }
    } else if (d.events.length) { var ph = $("wr-feed").querySelector(".k-system:not([data-k])"); if (ph) ph.remove(); }
    addEvents(d.events); stats(d); trades(d);
    root.setAttribute("aria-busy", "false");
  }
  function poll(full) {
    clearTimeout(timer);
    if (document.hidden) return;
    get("/api/warroom/state" + (full || !lastId ? "" : "?after=" + lastId)).then(function (d) { fails = 0; render(d, full || !lastId); $("wr-live").className = "wr-live"; },
      function () { fails++; $("wr-live").className = "wr-live off"; $("wr-status").textContent = "Couldn't reach the War Room server. Retrying…"; })
      .then(function () { timer = setTimeout(function () { poll(false); }, Math.min(POLL * Math.pow(2, fails), 120000)); });
  }
  var fb = document.querySelectorAll(".wr-filter button");
  Array.prototype.forEach.call(fb, function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.f;
      Array.prototype.forEach.call(fb, function (x) { var on = x === b; x.className = on ? "on" : ""; x.setAttribute("aria-pressed", on ? "true" : "false"); });
      Array.prototype.forEach.call($("wr-feed").children, function (li) { li.hidden = !show(li); });
    });
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(false); else clearTimeout(timer); });
  setInterval(function () { if (data && data.last_tick) $("w-tick").textContent = ago(data.last_tick); }, 5000);
  poll(true);
})();
