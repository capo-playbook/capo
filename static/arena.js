/* Capo Paper Arena client. Play money only. All prices and fills are decided by the server; this file only displays them. */
(function () {
  "use strict";
  var root = document.getElementById("arena");
  if (!root) return;
  var m = document.querySelector('meta[name="capo-api"]'), API = m ? m.content.replace(/\/$/, "") : "";
  var $ = function (id) { return document.getElementById(id); };
  var KK = "capo_arena_key_v1", key = null, state = null, tab = "weekly", boardData = null, quoteFor = null, lastMe = 0, lastBoard = 0, meBusy = false;
  var STOP_POLL = 20000, SLOW_POLL = 60000;
  try { key = localStorage.getItem(KK); } catch (e) { key = null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sol(n, d) { return n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 3 : d }); }
  function signed(n, d) { return (n >= 0 ? "+" : "−") + sol(Math.abs(n), d); }
  function px(n) { if (n == null || !isFinite(n)) return "—"; return n >= 0.01 ? n.toPrecision(4) : n.toExponential(3); }
  function usd(n) { if (n == null) return "—"; var a = Math.abs(n); return a >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : a >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "k" : "$" + n.toFixed(2); }
  function ago(ts) { var s = Math.max(0, Date.now() / 1000 - ts); return s < 60 ? Math.round(s) + "s ago" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; }
  function hold(s) { return s == null ? "" : s < 3600 ? Math.round(s / 60) + " min" : s < 86400 ? (s / 3600).toFixed(1) + " h" : (s / 86400).toFixed(1) + " d"; }
  function newKey() {
    var b = new Uint8Array(24); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function req(path, data) {
    var o = { method: data ? "POST" : "GET", headers: { "ngrok-skip-browser-warning": "1" } };
    if (data) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(data); }
    var ctl = window.AbortController ? new AbortController() : null; if (ctl) o.signal = ctl.signal;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch(API + path, o).then(function (r) {
      return r.json().catch(function () { return { error: "Unexpected reply from the game server (" + r.status + ")." }; }).then(function (j) { j._s = r.status; return j; });
    }, function () { return { error: "Couldn't reach the game server. Check your connection and try again.", _s: 0 }; })
      .then(function (j) { clearTimeout(t); return j; });
  }
  function say(id, t, ok) { var e = $(id); e.textContent = t || ""; e.className = "ar-msg small " + (t ? (ok ? "ok" : "bad") : ""); }
  function busy(b, on, label) { if (!b) return; if (on) { b.dataset.l = b.textContent; b.textContent = label || "Working…"; b.disabled = true; } else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; } }

  /* ---------- views ---------- */
  function show(me) {
    state = me; root.dataset.state = "play"; $("ar-join").hidden = true; $("ar-dash").hidden = false;
    var pnl = me.equity - me.start;
    $("a-nick").textContent = me.nick; $("a-equity").textContent = sol(me.equity, 2) + " SOL";
    var p = $("a-pnl"); p.textContent = signed(pnl, 2) + " (" + signed(pnl / me.start * 100, 1) + "%)"; p.className = pnl >= 0 ? "pos" : "neg";
    $("a-cash").textContent = sol(me.cash, 2); $("a-streak").textContent = me.streak + (me.streak === 1 ? " day" : " days");
    var left = me.week_ends - Date.now() / 1000; $("a-ends").textContent = left > 86400 ? Math.floor(left / 86400) + "d " + Math.floor(left % 86400 / 3600) + "h" : Math.max(0, Math.floor(left / 3600)) + "h " + Math.max(0, Math.floor(left % 3600 / 60)) + "m";
    $("key-out").value = key || "";
    $("a-season").textContent = me.season || "—";
    $("a-rank").textContent = (me.rank || "Recruit") + " · " + sol(me.xp || 0, 0) + " XP";
    $("a-crowns").textContent = String(me.crowns || 0);
    lastMe = Date.now(); stopNote(); drawMine();
    var pos = me.positions || [];
    $("ar-pos").innerHTML = pos.length ? pos.map(function (x) {
      var pl = (x.value || 0) - x.cost, chg = x.last_px && x.entry_px ? (x.last_px / x.entry_px - 1) * 100 : null;
      return '<div class="pos-row" data-id="' + x.id + '"><div class="pos-l"><b>' + esc(x.sym) + '</b> <a class="mono small" href="../check/?ca=' + encodeURIComponent(x.mint) + '">' + esc(x.mint.slice(0, 4) + "…" + x.mint.slice(-4)) + "</a>" +
        '<span class="muted small">in ' + sol(x.cost, 3) + " SOL · opened " + ago(x.opened) + (x.stop_pct ? " · stop −" + sol(x.stop_pct, 1) + "%" : " · no stop") + "</span>" +
        (x.plan ? '<span class="small plan">“' + esc(x.plan) + "”</span>" : "") + "</div>" +
        '<div class="pos-v"><b class="' + (pl >= 0 ? "pos" : "neg") + '">' + signed(pl, 3) + " SOL</b><span class=\"muted small\">worth " + sol(x.value, 3) + (chg != null ? " · price " + signed(chg, 1) + "%" : "") + (x.priced ? " · priced " + ago(x.priced) : "") + "</span></div>" +
        '<div class="pos-a"><button type="button" class="btn btn-glass btn-sm" data-f="0.25">Sell 25%</button><button type="button" class="btn btn-glass btn-sm" data-f="0.5">50%</button><button type="button" class="btn btn-gold btn-sm" data-f="1">Close</button></div></div>';
    }).join("") : '<p class="muted small">No open paper positions.</p>';
    var bd = me.badges || [];
    $("ar-badges").innerHTML = bd.length ? '<ul class="bdg-got">' + bd.map(function (b) { return '<li><span class="bdg on" data-b="' + esc(b.id) + '">' + esc(b.label) + '</span><span class="muted small">' + esc(b.week) + "</span></li>"; }).join("") + "</ul>"
      : '<p class="muted small">None yet. See how to earn them in the house rules.</p>';
    var tr = me.trades || [], tb = $("ar-trades").querySelector("tbody");
    tb.innerHTML = tr.length ? tr.map(function (t) {
      var note = t.reason === "stop" ? "stop hit" : t.reason === "week-end" ? "week ended" : t.side === "sell" && t.hold_s != null ? "held " + hold(t.hold_s) : "";
      return "<tr><td>" + ago(t.ts) + '</td><td class="' + (t.side === "buy" ? "" : "") + '">' + (t.side === "buy" ? "Buy" : "Sell") + "</td><td>" + esc(t.sym) + "</td><td>" + sol(t.sol, 3) + '</td><td class="' + (t.pnl == null ? "" : t.pnl >= 0 ? "pos" : "neg") + '">' + (t.pnl == null ? "—" : signed(t.pnl, 3)) + "</td><td class=\"muted small\">" + esc(note) + "</td></tr>";
    }).join("") : '<tr class="empty"><td colspan="6">No trades yet.</td></tr>';
    if (me.stopped && me.stopped.length) say("buy-msg", me.stopped.length + " paper stop" + (me.stopped.length > 1 ? "s" : "") + " triggered at the latest price.", true);
  }
  function hasStops() { return !!(state && (state.positions || []).some(function (x) { return x.stop_pct; })); }
  function stopNote() {
    var el = $("stop-watch"); if (!el) return;
    if (!hasStops()) { el.textContent = ""; return; }
    var s = Math.round((Date.now() - lastMe) / 1000);
    el.textContent = document.visibilityState === "visible" ? "Stops checked " + (s < 5 ? "just now" : s + "s ago") + " · every ~20s while this tab is open" : "Stop checks paused while this tab is hidden";
  }
  /* ---------- share cards (drawn locally on a canvas; nothing is uploaded) ---------- */
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawCard(cv, d) {
    if (!cv || !cv.getContext) return; var c = cv.getContext("2d"), W = 1200, Hh = 630, G = "#d4af37", G2 = "#f3d77a";
    c.clearRect(0, 0, W, Hh);
    var bg = c.createRadialGradient(900, 80, 40, 700, 300, 900); bg.addColorStop(0, "#2a2210"); bg.addColorStop(0.55, "#0e0c08"); bg.addColorStop(1, "#060504");
    c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
    c.strokeStyle = G; c.lineWidth = 3; rr(c, 18, 18, W - 36, Hh - 36, 22); c.stroke();
    c.globalAlpha = 0.35; c.lineWidth = 1; rr(c, 30, 30, W - 60, Hh - 60, 16); c.stroke(); c.globalAlpha = 1;
    c.textBaseline = "alphabetic"; c.fillStyle = G; c.font = "700 26px Cinzel, Georgia, serif"; c.fillText("THE PAPER ARENA", 70, 92);
    c.fillStyle = "#cfc6ae"; c.font = "500 24px Inter, system-ui, sans-serif";
    var sz = "Season: " + (d.season || "?") + " · " + (d.week || "") + (d.final ? " · final" : " · in progress");
    c.fillText(sz, 70, 132);
    c.fillStyle = "#fff3c8"; c.font = "400 96px 'Bebas Neue', 'Bebas Fallback', Impact, sans-serif";
    var nk = String(d.nick || "?"); c.fillText(nk + (d.champion ? "  \u265B" : ""), 70, 250);
    var up = (d.pnl_pct || 0) >= 0; c.fillStyle = up ? "#5fd08a" : "#ff9a8d"; c.font = "400 150px 'Bebas Neue', 'Bebas Fallback', Impact, sans-serif";
    c.fillText((up ? "+" : "\u2212") + Math.abs(d.pnl_pct || 0).toFixed(1) + "%", 66, 400);
    c.fillStyle = "#cfc6ae"; c.font = "500 24px Inter, system-ui, sans-serif"; c.fillText("paper P&L this season", 74, 438);
    var stats = [["Paper equity", sol(d.equity, 1) + " SOL"], ["Trades", String(d.trades || 0)], ["Rank", (d.rank || "Recruit") + " · " + sol(d.xp || 0, 0) + " XP"], ["Crowns", String(d.crowns || 0)]];
    stats.forEach(function (st, i) {
      var x = 640, y = 190 + i * 70; c.fillStyle = "#9d9580"; c.font = "600 18px Inter, system-ui, sans-serif"; c.fillText(st[0].toUpperCase(), x, y);
      c.fillStyle = G2; c.font = "400 40px 'Bebas Neue', 'Bebas Fallback', Impact, sans-serif"; c.fillText(st[1], x, y + 38);
    });
    var bx = 70, by = 486; c.font = "600 20px Inter, system-ui, sans-serif";
    (d.badges || []).slice(0, 6).forEach(function (b) {
      var w = c.measureText(b).width + 32; if (bx + w > W - 70) return;
      c.fillStyle = "rgba(212,175,55,.16)"; rr(c, bx, by, w, 38, 19); c.fill(); c.strokeStyle = G; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = "#fff3c8"; c.fillText(b, bx + 16, by + 26); bx += w + 12;
    });
    if (!(d.badges || []).length) { c.fillStyle = "#9d9580"; c.fillText("No badges yet this season", 70, by + 26); }
    c.fillStyle = "#9d9580"; c.font = "500 19px Inter, system-ui, sans-serif";
    c.fillText("Paper SOL only. A game, not a track record. NFA · DYOR.", 70, 578);
    c.textAlign = "right"; c.fillStyle = G; c.fillText("capo-playbook.github.io/capo/arena", W - 70, 578); c.textAlign = "left";
  }
  function myCard() {
    var me = state; if (!me) return null;
    return { nick: me.nick, season: me.season, week: me.week, final: false, equity: me.equity, pnl_pct: (me.equity / me.start - 1) * 100, trades: me.week_trades || 0,
      badges: (me.badges || []).filter(function (b) { return b.week === me.week; }).map(function (b) { return b.label; }), rank: me.rank, xp: me.xp, crowns: me.crowns };
  }
  function drawMine() { var d = myCard(); if (d) drawCard($("card-cv"), d); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawMine(); if (shared) drawCard($("cv-cv"), shared); });
  var shared = null;
  function cardLink() { return location.origin + location.pathname + "?card=" + encodeURIComponent(state.nick) + "&wk=" + encodeURIComponent(state.week); }
  $("card-dl").addEventListener("click", function () {
    var cv = $("card-cv"); if (!state) return; drawMine();
    var name = "capo-arena-" + state.nick + "-" + state.week + ".png";
    function go(href, rel) { var a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); if (rel) setTimeout(function () { URL.revokeObjectURL(href); }, 4000); }
    if (cv.toBlob) cv.toBlob(function (b) { if (b) go(URL.createObjectURL(b), true); else say("card-msg", "Couldn't make the image in this browser.", false); }, "image/png");
    else go(cv.toDataURL("image/png"));
    say("card-msg", "Card saved as " + name + ".", true);
  });
  $("card-link").addEventListener("click", function () {
    if (!state) return; var u = cardLink();
    if (state.hidden) { say("card-msg", "Your player is hidden from public boards, so a card link won't open for others.", false); return; }
    if (!state.week_trades) { say("card-msg", "Make a paper trade this season first. Cards only exist for weeks you played.", false); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { say("card-msg", "Link copied: " + u, true); }, function () { say("card-msg", "Copy this link: " + u, true); });
  });
  (function () { var nu = $("share-nudge"), sh = $("ar-share"); if (!nu || !sh) return;
    nu.querySelector("a").addEventListener("click", function () { sh.classList.remove("pulse"); void sh.offsetWidth; sh.classList.add("pulse"); }); })();
  function loadShared() {
    var q = new URLSearchParams(location.search), n = q.get("card"), w = q.get("wk") || "";
    if (!n || !/^[A-Za-z0-9_]{3,16}$/.test(n) || (w && !/^\d{4}-W\d{2}$/.test(w))) return;
    req("/api/arena/card?nick=" + encodeURIComponent(n) + (w ? "&wk=" + encodeURIComponent(w) : "")).then(function (j) {
      var box = $("ar-cardview"); box.hidden = false;
      if (j.error) { $("cv-txt").textContent = j.error; box.querySelector(".card-box").hidden = true; return; }
      shared = j; drawCard($("cv-cv"), j);
      $("cv-txt").textContent = j.nick + " · Season " + j.season + " (" + j.week + (j.final ? ", final" : ", in progress") + "): " + (j.pnl_pct >= 0 ? "+" : "−") + Math.abs(j.pnl_pct).toFixed(1) + "% paper P&L over " + j.trades + " trades. " + j.note;
    });
  }
  function showJoin(msg) { root.dataset.state = "join"; $("ar-join").hidden = false; $("ar-dash").hidden = true; if (msg) say("join-msg", msg, false); }
  function refresh() {
    if (!key) { showJoin(); return Promise.resolve(); }
    return req("/api/arena/me", { key: key }).then(function (j) {
      if (j.error) {
        if (/No player/.test(j.error)) showJoin();
        else if (state) { lastMe = Date.now(); say("buy-msg", "Couldn't refresh just now (" + j.error + ") Showing your last read; will retry.", false); }
        else { showJoin(); say("join-msg", j.error, false); }
        return;
      }
      show(j);
    });
  }
  function renderBoard() {
    var b = boardData, el = $("bd-body");
    if (!b) return;
    if (b.error) { el.innerHTML = '<p class="muted small">' + esc(b.error) + "</p>"; return; }
    $("bd-upd").textContent = (b.season ? "Season " + b.season + " · " : "Week " + b.week.split("-W")[1] + " · ") + "updated " + ago(b.updated);
    renderSeasons(b);
    var rows = b[tab] || [], me = state && state.nick;
    if (!rows.length) { el.innerHTML = '<p class="muted small">' + (tab === "weekly" ? "No paper trades yet this week. Be the first on the board." : "Nobody on this board yet.") + "</p>"; return; }
    var head = tab === "weekly" ? "<th>Equity</th><th>Week</th><th>Badges</th>" : tab === "alltime" ? "<th>P&amp;L</th><th>Weeks</th><th>Badges</th>" : "<th>XP</th><th>Rank</th><th>Badges</th><th>Streak</th>";
    el.innerHTML = '<div class="table-scroll"><table class="board"><thead><tr><th>#</th><th>Player</th>' + head + "</tr></thead><tbody>" + rows.map(function (r, i) {
      var c = tab === "weekly" ? "<td>" + sol(r.equity, 1) + '</td><td class="' + (r.pnl_pct >= 0 ? "pos" : "neg") + '">' + signed(r.pnl_pct, 1) + "%</td><td>" + r.badges + "</td>"
        : tab === "alltime" ? '<td class="' + (r.pnl >= 0 ? "pos" : "neg") + '">' + signed(r.pnl, 1) + "</td><td>" + r.weeks + "</td><td>" + r.badges + "</td>"
        : "<td>" + sol(r.xp || 0, 0) + "</td><td>" + esc(r.rank || "Recruit") + "</td><td>" + r.badges + "</td><td>" + r.best_streak + "d</td>";
      return '<tr class="' + (r.nick === me ? "me" : "") + '"><td>' + (i + 1) + "</td><td>" + esc(r.nick) + (r.crowns ? '<span class="crown" title="Season crowns">\u265B ' + r.crowns + "</span>" : "") + "</td>" + c + "</tr>";
    }).join("") + "</tbody></table></div>" + (tab === "discipline" ? '<p class="muted small">Ranked by discipline XP (stops, time stops, plan notes, waiting after a loss), then badges. XP is a side board; the P&amp;L boards come first.</p>' : '<p class="muted small">Paper SOL only. Results are a game, not a track record.</p>');
  }
  function renderSeasons(b) {
    $("sz-now").textContent = b.season ? "Now: " + b.season : "";
    var ss = b.seasons || [];
    $("sz-body").innerHTML = (ss.length ? "<ol>" + ss.map(function (r) {
      return "<li><span><b>" + esc(r.name) + '</b> <span class="muted small">' + esc(r.week) + "</span></span><span>\u265B " + esc(r.champion) + ' <span class="' + (r.pnl_pct >= 0 ? "pos" : "neg") + '">' + signed(r.pnl_pct, 1) + "%</span></span></li>";
    }).join("") + "</ol>" : '<p class="muted small">No finished seasons with a champion yet. This one ends Monday 00:00 UTC.</p>') +
      '<p class="muted small">Crown: top paper equity in a finished season, ' + ((b.rules && b.rules.crown_min_trades) || 5) + "+ trades. Bragging rights only.</p>";
  }
  function loadBoard(bust) {
    lastBoard = Date.now();
    return req("/api/arena/board" + (bust ? "?r=" + Date.now() : "")).then(function (j) { boardData = j.error ? { error: j.error } : j; renderBoard(); });
  }

  /* ---------- actions ---------- */
  $("join-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var n = $("nick").value.trim(), b = e.target.querySelector("button[type=submit]");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { say("join-msg", "Nicknames are 3 to 16 letters, numbers or underscores.", false); $("nick").focus(); return; }
    var k = key || newKey();
    busy(b, true, "Joining…");
    req("/api/arena/join", { nick: n, key: k, website: $("ar-web").value }).then(function (j) {
      busy(b, false);
      if (j.error) { say("join-msg", j.error, false); return; }
      key = k; try { localStorage.setItem(KK, k); } catch (er) { say("join-msg", "Joined, but this browser won't save your key (private mode?). Copy it from the bottom of the page.", false); }
      show(j); loadBoard(true);
    });
  });
  $("key-form").addEventListener("submit", function (e) {
    e.preventDefault(); var k = $("key-in").value.trim();
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(k)) { say("join-msg", "That doesn't look like a device key.", false); return; }
    req("/api/arena/me", { key: k }).then(function (j) {
      if (j.error) { say("join-msg", j.error === "No player on this device yet." ? "No player found for that key." : j.error, false); return; }
      key = k; try { localStorage.setItem(KK, k); } catch (er) {} show(j); renderBoard();
    });
  });
  $("key-copy").addEventListener("click", function () {
    var i = $("key-out"); i.select();
    (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { $("key-copy").textContent = "Copied"; }, function () { document.execCommand && document.execCommand("copy"); $("key-copy").textContent = "Copied"; });
    setTimeout(function () { $("key-copy").textContent = "Copy"; }, 1500);
  });
  var mintIn = $("b-mint");
  function validMint(s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s); }
  mintIn.addEventListener("input", function () {
    var v = mintIn.value.trim(), mm = v.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/); if (mm && mm[0] !== v) mintIn.value = v = mm[0];
    $("b-check").href = (validMint(v) ? "../check/?ca=" + encodeURIComponent(v) : "../check/");
    if (quoteFor && quoteFor !== v) { quoteFor = null; $("b-q").innerHTML = '<span class="muted small">Prices come from DexScreener, fetched by our server when you act.</span>'; }
  });
  function showQuote(q) {
    quoteFor = q.mint;
    $("b-q").innerHTML = '<div class="q"><b>' + esc(q.sym) + "</b> " + esc(q.name || "") + ' <span class="muted small">on ' + esc(q.dex || "?") + "</span></div>" +
      '<div class="small">Price ' + px(q.px_sol) + " SOL (" + (q.px_usd >= 0.01 ? "$" + q.px_usd.toPrecision(4) : "$" + q.px_usd.toExponential(3)) + ") · pool liquidity " + usd(q.liq_usd) +
      " · max fill " + sol(q.max_sol, 2) + " paper SOL</div>" + (q.tradable ? "" : '<div class="small neg">Liquidity is under the Arena minimum, so this one can\'t be traded here.</div>') +
      '<div class="muted small">From ' + esc(q.src) + ", " + ago(q.ts) + ". Your fill uses a fresh server price at the moment you press buy.</div>";
  }
  $("b-quote").addEventListener("click", function (e) {
    var v = mintIn.value.trim(); if (!validMint(v)) { say("buy-msg", "Paste a valid Solana mint address first.", false); mintIn.focus(); return; }
    var b = e.currentTarget; busy(b, true, "Fetching…"); say("buy-msg", "");
    req("/api/arena/quote", { key: key, mint: v }).then(function (j) { busy(b, false); if (j.error) { say("buy-msg", j.error, false); return; } showQuote(j); });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".chips button"), function (c) { c.addEventListener("click", function () { $("b-sol").value = c.dataset.sol; }); });
  $("buy-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = mintIn.value.trim(), s = Number($("b-sol").value), st = $("b-stop").value.trim(), b = e.target.querySelector("button[type=submit]");
    if (!validMint(v)) { say("buy-msg", "Paste a valid Solana mint address first.", false); mintIn.focus(); return; }
    if (!(s >= 0.05)) { say("buy-msg", "Minimum paper trade is 0.05 SOL.", false); $("b-sol").focus(); return; }
    if (st !== "" && !(Number(st) >= 1 && Number(st) <= 95)) { say("buy-msg", "Stop must be between 1% and 95% below entry, or blank.", false); $("b-stop").focus(); return; }
    var d = { key: key, mint: v, sol: String(s), plan: $("b-plan").value.trim() }; if (st !== "") d.stop = st;
    busy(b, true, "Filling…"); say("buy-msg", "");
    req("/api/arena/buy", d).then(function (j) {
      busy(b, false);
      if (j.error) { say("buy-msg", j.error, false); return; }
      say("buy-msg", j.message, true); $("b-plan").value = ""; show(j.me); loadBoard(true);
    });
  });
  $("ar-pos").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-f]"); if (!b) return;
    var id = b.closest(".pos-row").dataset.id; busy(b, true, "Selling…");
    req("/api/arena/sell", { key: key, pos: id, frac: b.dataset.f }).then(function (j) {
      busy(b, false);
      if (j.error) { say("buy-msg", j.error, false); return; }
      say("buy-msg", j.message, true); show(j.me); loadBoard(true);
      var nu = $("share-nudge"); if (nu && j.me && !j.me.hidden) nu.hidden = false;
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (t) {
    t.addEventListener("click", function () {
      tab = t.dataset.t;
      Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (x) { x.setAttribute("aria-selected", x === t ? "true" : "false"); });
      renderBoard();
    });
  });
  loadShared();
  refresh().then(function () { loadBoard(); });
  // Polling only while the tab is visible: the board once a minute; your account every ~20 s while a stop is set (so paper stops
  // keep filling at the latest server price), otherwise once a minute. Stops still fill at the mark, not the stop level: gap risk.
  function tick() {
    stopNote();
    if (document.visibilityState !== "visible") return;
    var t = Date.now();
    if (t - lastBoard >= SLOW_POLL) loadBoard();
    if (state && !meBusy && t - lastMe >= (hasStops() ? STOP_POLL : SLOW_POLL)) { meBusy = true; refresh().then(function () { meBusy = false; }, function () { meBusy = false; }); }
  }
  setInterval(tick, 5000);
  document.addEventListener("visibilitychange", tick);
})();
