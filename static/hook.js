// The Capo Playbook: landing "first 30 seconds" layer. Pure enhancement: every number and link is already in the HTML.
// Quick demo = 3 public reads (Solana RPC + DexScreener) run in the visitor's browser. Nothing is stored or sent to us.
(function () {
  "use strict";
  var D = document, W = window;
  var RM = !!(W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function safe(f) { try { f(); } catch (e) { if (W.console) console.warn("hook:", e && e.message); } }

  /* ---------- season name: same rule as the server (consecutive ISO weeks differ) ---------- */
  safe(function () {
    var sec = $(".paths[data-seasons]"); if (!sec) return;
    var names = sec.getAttribute("data-seasons").split("|"); if (names.length < 2) return;
    var d = Math.floor(Date.now() / 864e5), mon = d - (d + 3) % 7, n = names[Math.floor((mon + 719163) / 7) % names.length];
    if (n) $$(".season").forEach(function (e) { if (e.textContent !== n) e.textContent = n; });
  });

  /* ---------- punch counter: 100% -> the real figure. Final text is the original, verbatim ---------- */
  safe(function () {
    var el = $(".hero .pn"); if (!el || RM) return;
    var fin = el.textContent, m = /(\d+(?:\.\d+)?)/.exec(fin); if (!m) return;
    var to = parseFloat(m[1]), from = parseFloat(el.getAttribute("data-from") || "100"), dec = (m[1].split(".")[1] || "").length;
    el.setAttribute("aria-label", fin); el.classList.add("counting");
    var t0 = 0, dur = 1400, ease = function (x) { return 1 - Math.pow(1 - x, 3); };
    function step(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / dur);
      el.textContent = p < 1 ? fin.replace(m[1], (from + (to - from) * ease(p)).toFixed(dec)) : fin;
      if (p < 1) requestAnimationFrame(step); else { el.classList.remove("counting"); el.classList.add("landed"); } }
    setTimeout(function () { requestAnimationFrame(step); }, 350);
  });

  /* ---------- instant demo strip ---------- */
  safe(function () {
    var box = $("#demo"); if (!box) return;
    var form = $("form[data-demo]", box), input = $("#demo-ca"), btn = $("button[type=submit]", form), out = $(".demo-out", box),
        msg = $(".demo-msg", box), full = $(".demo-full", box), share = $(".demo-share", box);
    var FULL = (full.getAttribute("href") || "/check/").split("?")[0];
    var RPC = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
    var B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, run = 0, last = null;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function usd(n) { return n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "k" : "$" + Math.round(n); }
    function timed(url, opt, ms) {
      var c = W.AbortController ? new AbortController() : null, t; if (c) { opt = opt || {}; opt.signal = c.signal; }
      return Promise.race([fetch(url, opt).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }),
        new Promise(function (_, rej) { t = setTimeout(function () { if (c) c.abort(); rej(new Error("timeout")); }, ms || 8000); })]).finally(function () { clearTimeout(t); });
    }
    function rpc(i, mint) {
      return timed(RPC[i], { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed", commitment: "confirmed" }] }) }, 7000)
        .then(function (j) { if (!j || j.error || !("result" in j)) throw new Error("rpc"); return j.result; })
        .catch(function (e) { if (i + 1 < RPC.length) return rpc(i + 1, mint); throw e; });
    }
    function chip(k, l, v) { var li = $('li[data-k="' + k + '"]', out); if (!li) return; li.setAttribute("data-l", l); $(".dv", li).innerHTML = v; }
    function setAll(l, v) { ["mint", "freeze", "liq"].forEach(function (k) { chip(k, l, v); }); }
    function go(mint, sym) {
      var my = ++run; last = null; box.setAttribute("data-state", "busy"); btn.disabled = true;
      setAll("wait", '<span class="dots" aria-hidden="true"></span><span class="sr">checking</span>');
      msg.textContent = "Reading Solana and DexScreener for " + mint.slice(0, 4) + "…" + mint.slice(-4) + "…";
      full.hidden = true; share.hidden = true;
      var href = FULL + "?ca=" + encodeURIComponent(mint);
      var pA = rpc(0, mint).then(function (r) {
        if (my !== run) return null; var v = r && r.value, info = v && v.data && v.data.parsed && v.data.parsed.type === "mint" ? v.data.parsed.info : null;
        if (!info) { chip("mint", "grey", "Not a token mint"); chip("freeze", "grey", "n/a"); return "nomint"; }
        chip("mint", info.mintAuthority ? "red" : "green", info.mintAuthority ? "Active: more can be printed" : "Renounced ✓");
        chip("freeze", info.freezeAuthority ? "red" : "green", info.freezeAuthority ? "Active: holders can be frozen" : "Renounced ✓");
        return "ok";
      }, function () { if (my === run) { chip("mint", "grey", "Couldn&rsquo;t load"); chip("freeze", "grey", "Couldn&rsquo;t load"); } return "err"; });
      var pB = timed("https://api.dexscreener.com/token-pairs/v1/solana/" + mint, null, 8000).catch(function () { return timed("https://api.dexscreener.com/tokens/v1/solana/" + mint, null, 8000); }).then(function (pairs) {
        if (my !== run) return; var liq = 0, n = 0, s = sym;
        (pairs || []).forEach(function (p) { if (p.baseToken && p.baseToken.address === mint) { if (!s) s = p.baseToken.symbol; if (p.liquidity && p.liquidity.usd) { liq += p.liquidity.usd; n++; } } });
        if (!liq) chip("liq", "red", "No pool found");
        else chip("liq", liq < 1e4 ? "red" : liq < 5e4 ? "amber" : "green", esc(usd(liq)) + " in " + n + " pool" + (n > 1 ? "s" : ""));
        return s;
      }, function () { if (my === run) chip("liq", "grey", "Couldn&rsquo;t load"); return sym; });
      Promise.all([pA, pB]).then(function (r) {
        if (my !== run) return; btn.disabled = false; box.setAttribute("data-state", "done");
        var reds = $$('li[data-l="red"]', out).length, s = r[1] ? "$" + String(r[1]).replace(/^\$/, "").slice(0, 16) : mint.slice(0, 4) + "…" + mint.slice(-4);
        msg.innerHTML = r[0] === "nomint" ? "That address isn&rsquo;t a token mint. Paste the coin&rsquo;s contract address." :
          (reds ? "<b>" + reds + " red flag" + (reds > 1 ? "s" : "") + "</b> on " + esc(s) + ". " + (/^\$(USDC|PYUSD|USDT)$/.test(s) ? "Stablecoin issuers keep these for compliance; on a memecoin they&rsquo;d be a big risk. " : "") : "No red flags on these 3 for " + esc(s) + ". No red flags is not safe. These checks can&rsquo;t see everything and a coin can still rug. ") + "A risk read, not a verdict.";
        full.setAttribute("href", href); full.hidden = false;
        last = { url: new URL(href, location.href).href, sym: s, reds: reds };
        if (r[0] !== "nomint") share.hidden = false;
      });
    }
    function pick(s) { s = (s || "").trim(); var m = s.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/); if (m && !B58.test(s)) s = m[0]; return B58.test(s) ? s : null; }
    form.addEventListener("submit", function (e) {
      e.preventDefault(); var m = pick(input.value);
      if (!m) { msg.textContent = input.value.trim() ? "That doesn't look like a Solana mint (32–44 letters and numbers, no 0, O, I or l)." : "Paste a mint first, or tap the live example."; input.focus(); return; }
      input.value = m; go(m);
    });
    $$(".demo-try", box).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); var m = a.getAttribute("data-try"); input.value = m;
      $$(".demo-try", box).forEach(function (x) { x.classList.toggle("on", x === a); }); go(m, a.getAttribute("data-sym")); }); });
    share.addEventListener("click", function () {
      if (!last) return; var text = "Quick red-flag read on " + last.sym + ": " + (last.reds ? last.reds + " red flag" + (last.reds > 1 ? "s" : "") + ". Not advice." : "no red flags on 3 checks. No red flags is not safe. These checks can't see everything and a coin can still rug.") + " Check yours:";
      if (navigator.share) { navigator.share({ title: "Capo Red-Flag Checker", text: text, url: last.url }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(last.url) : Promise.reject()).then(function () { share.textContent = "Link copied ✓"; }, function () { share.textContent = "Copy: " + last.url; });
      setTimeout(function () { share.textContent = "Share this read"; }, 2200);
    });
  });

  /* ---------- sticky mobile CTA bar (after the first scroll; hides over the pay box and footer) ---------- */
  safe(function () {
    var c = $('a[data-hook="p-check"]'), a = $('a[data-hook="p-arena"]'); if (!c || !a) return;
    var bar = D.createElement("nav"); bar.className = "stick"; bar.setAttribute("aria-label", "Quick actions");
    bar.innerHTML = '<a href="' + esc2(c.getAttribute("href")) + '" data-hook="s-check">Check a coin</a><a href="' + esc2(a.getAttribute("href")) + '" data-hook="s-arena">Arena</a><a href="#pro" class="sg" data-hook="s-pro">Playbook · $12</a>';
    function esc2(s) { return String(s).replace(/"/g, "&quot;"); }
    D.body.appendChild(bar); D.body.classList.add("has-stick");
    var block = 0, y0 = 260;
    function upd() { var on = W.scrollY > y0 && !block; if (on !== bar.classList.contains("on")) { bar.classList.toggle("on", on); if (on) bar.removeAttribute("inert"); else bar.setAttribute("inert", ""); } }
    bar.setAttribute("inert", "");
    if ("IntersectionObserver" in W) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.__in = e.isIntersecting; }); block = $$("#pro, .foot").some(function (t) { return t.__in; }) ? 1 : 0; upd(); }, { threshold: 0 });
      $$("#pro, .foot").forEach(function (t) { io.observe(t); });
    }
    W.addEventListener("scroll", upd, { passive: true }); upd();
  });
})();
