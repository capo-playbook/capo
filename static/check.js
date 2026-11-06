/* Capo Red-Flag Checker: a risk read built in the browser from public data only.
   Sources: Solana RPC (publicnode, mainnet-beta), DexScreener, Jupiter token + quote APIs, Raydium pool API.
   v2: LP burn read, sell-path quote attempt (read-only, no swaps), richer Token-2022 flags, watch mode.
   Never a buy/safe verdict, never a score. Every number shown comes from a live fetch. */
(function () {
  "use strict";
  var root = document.getElementById("chk");
  if (!root) return;
  var form = document.getElementById("chk-form"), input = document.getElementById("ca"),
      err = document.getElementById("chk-err"), sum = document.getElementById("chk-sum"),
      head = document.getElementById("chk-token"), share = document.getElementById("chk-share"),
      btn = form.querySelector("button[type=submit]");
  var RPC_ACCT = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
  var RPC_LARGEST = ["https://api.mainnet-beta.solana.com"];
  var SYS = "11111111111111111111111111111111", BURN = "1nc1nerator11111111111111111111111111111111";
  var TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", T22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  // Known AMM / launchpad authorities whose token accounts are pool vaults, not wallets.
  var AMM = { "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": "Raydium pool", "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL": "Raydium CPMM pool" };
  var WSOL = "So11111111111111111111111111111111111111112";
  var run = 0, watch = null, lastSym = "", lastRed = 0;

  /* ---------- helpers ---------- */
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58len(s) { // decoded byte length, or -1 if not base58
    var bytes = [0], i, j, c, carry;
    for (i = 0; i < s.length; i++) {
      c = B58.indexOf(s[i]); if (c < 0) return -1; carry = c;
      for (j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 255; carry >>= 8; }
      while (carry) { bytes.push(carry & 255); carry >>= 8; }
    }
    for (i = 0; i < s.length && s[i] === "1"; i++) bytes.push(0);
    return bytes.length;
  }
  function b58enc(b) {
    var d = [0], i, j, c, out = "";
    for (i = 0; i < b.length; i++) { c = b[i]; for (j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
    for (i = 0; i < b.length && b[i] === 0; i++) out += "1";
    for (j = d.length - 1; j >= 0; j--) out += B58[d[j]];
    return out;
  }
  function b64bytes(s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function u64(b, o) { var lo = 0, hi = 0, i; for (i = 3; i >= 0; i--) lo = lo * 256 + b[o + i]; for (i = 7; i >= 4; i--) hi = hi * 256 + b[o + i]; return hi * 4294967296 + lo; }
  function validMint(s) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && b58len(s) === 32; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function short(a) { return a ? a.slice(0, 4) + "…" + a.slice(-4) : ""; }
  function scan(a, kind) { return '<a href="https://solscan.io/' + (kind || "account") + "/" + esc(a) + '" target="_blank" rel="noopener noreferrer" class="mono">' + esc(short(a)) + "</a>"; }
  function usd(n) {
    if (n == null || !isFinite(n)) return "n/a";
    var a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    if (a >= 1) return "$" + n.toFixed(2);
    return "$" + n.toPrecision(3);
  }
  function pct(x, d) { return (x == null || !isFinite(x)) ? "n/a" : (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function ago(ms) {
    var s = (Date.now() - ms) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return (s / 3600).toFixed(1) + " hours";
    if (s < 86400 * 60) return Math.round(s / 86400) + " days";
    if (s < 86400 * 730) return (s / 86400 / 30.4).toFixed(1) + " months";
    return (s / 86400 / 365.25).toFixed(1) + " years";
  }
  var memo = {};
  function cachedGet(url, ms) { // in-page 60 s cache so re-checks don't burn public rate limits
    var c = memo[url]; if (c && Date.now() - c.t < 60000) return c.p;
    var p = timed(url, null, ms); memo[url] = { t: Date.now(), p: p }; p.catch(function () { delete memo[url]; }); return p;
  }
  function timed(url, opt, ms) {
    var c = typeof AbortController === "function" ? new AbortController() : null, t;
    opt = opt || {}; if (c) opt.signal = c.signal;
    return Promise.race([
      fetch(url, opt).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }),
      new Promise(function (_, rej) { t = setTimeout(function () { if (c) c.abort(); rej(new Error("timeout")); }, ms || 9000); })
    ]).finally(function () { clearTimeout(t); });
  }
  function rpc(urls, method, params) {
    var i = 0;
    function next(lastErr) {
      if (i >= urls.length) return Promise.reject(lastErr || new Error("rpc unavailable"));
      var u = urls[i++];
      return timed(u, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) }, 9000)
        .then(function (j) { if (j && j.error) throw new Error(j.error.message || "rpc error"); if (!j || !("result" in j)) throw new Error("bad rpc"); return j.result; })
        .catch(next);
    }
    return next();
  }

  /* ---------- rendering ---------- */
  var LV = { red: "Red flag", amber: "Caution", green: "No flag", grey: "No data", wait: "Checking…" };
  function row(id, level, value, why, src) {
    var el = document.getElementById("r-" + id); if (!el) return;
    el.setAttribute("data-l", level);
    el.querySelector(".pill").textContent = LV[level];
    el.querySelector(".val").innerHTML = value;
    el.querySelector(".why").innerHTML = why || "";
    el.querySelector(".src").textContent = src ? "Source: " + src : "";
  }
  function resetRows(level) {
    var rows = root.querySelectorAll(".chk-row");
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].id.slice(2);
      row(id, level, level === "wait" ? '<span class="sk sk-line w60"></span>' : "—", level === "wait" ? "" : rows[i].getAttribute("data-idle"), "");
    }
  }
  function summary() {
    var c = { red: 0, amber: 0, green: 0, grey: 0 }, reds = [];
    var rows = root.querySelectorAll(".chk-row");
    for (var i = 0; i < rows.length; i++) {
      var l = rows[i].getAttribute("data-l"); if (l in c) c[l]++;
      if (l === "red") reds.push(rows[i].querySelector(".lab").textContent);
    }
    sum.setAttribute("data-state", "done");
    sum.innerHTML = '<p class="eyebrow">Risk read</p><p class="tally"><span class="t red"><b>' + c.red + '</b> red</span><span class="t amber"><b>' + c.amber +
      '</b> caution</span><span class="t green"><b>' + c.green + '</b> no flag</span>' + (c.grey ? '<span class="t grey"><b>' + c.grey + "</b> no data</span>" : "") + "</p>" +
      '<p class="muted small">' + (reds.length ? "Red flags on: " + esc(reds.join(", ")) + ". " : "No red flags on the checks we could run. No red flags is not safe. These checks can&rsquo;t see everything and a coin can still rug. ") +
      "This is a risk read, not a verdict. &ldquo;No flag&rdquo; means this one check didn&rsquo;t trip, not that the token is safe. NFA, DYOR.</p>" +
      '<div class="share-prompt" id="share-prompt"><span class="sp-t"><b>Share this read</b>Send it to the chat before anyone apes in.</span>' +
      '<button class="btn btn-gold btn-sm" type="button" data-sp="share">' + (navigator.share ? "Share" : "Copy link") + '</button>' +
      '<a class="btn btn-glass btn-sm" data-sp="x" target="_blank" rel="noopener noreferrer" href="' + esc(xIntent(c.red)) + '">Post on X</a></div>';
    lastRed = c.red;
  }
  function readUrl() { return share.querySelector("input").value || location.href.split("#")[0]; }
  function readText(red) { return "Red-flag read on " + (lastSym ? "$" + lastSym : "this coin") + ": " + (red ? red + " red flag" + (red > 1 ? "s" : "") + ". A risk read, not advice." : "no red flags on the checks it could run. No red flags is not safe. These checks can't see everything and a coin can still rug.") + " Check yours:"; }
  function xIntent(red) { return "https://x.com/intent/post?text=" + encodeURIComponent(readText(red)) + "&url=" + encodeURIComponent(readUrl()); }
  sum.addEventListener("click", function (e) {
    var b = e.target.closest('button[data-sp="share"]'); if (!b) return;
    var u = readUrl();
    if (navigator.share) { navigator.share({ title: "Capo Red-Flag Checker", text: readText(lastRed), url: u }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { b.textContent = "Link copied ✓"; }, function () { var i = share.querySelector("input"); i.focus(); i.select(); b.textContent = "Select + copy"; });
    setTimeout(function () { b.textContent = "Copy link"; }, 1800);
  });
  function setSum(html, state) { sum.setAttribute("data-state", state || "msg"); sum.innerHTML = html; }

  /* ---------- the check ---------- */
  function qget(url) { // Jupiter quote: keep the error body (NO_ROUTES_FOUND vs. network trouble)
    var c = memo["q" + url]; if (c && Date.now() - c.t < 60000) return c.p;
    var ac = typeof AbortController === "function" ? new AbortController() : null, t;
    var p = Promise.race([
      fetch(url, ac ? { signal: ac.signal } : {}).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: {} }; }); }),
      new Promise(function (_, rej) { t = setTimeout(function () { if (ac) ac.abort(); rej(new Error("timeout")); }, 9000); })
    ]).finally(function () { clearTimeout(t); });
    memo["q" + url] = { t: Date.now(), p: p }; p.catch(function () { delete memo["q" + url]; }); return p;
  }
  function qget2(url) { return qget(url).then(function (r) { return (r.ok || r.j.errorCode) ? r : wait(1500).then(function () { delete memo["q" + url]; return qget(url); }); }, function () { return wait(1500).then(function () { return qget(url); }); }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function check(mint, quiet) {
    var my = ++run;
    err.hidden = true; btn.disabled = true; root.setAttribute("aria-busy", "true");
    if (!quiet) { stopWatch(true); resetRows("wait"); }
    if (!quiet) setSum('<p class="eyebrow">Risk read</p><p class="tally"><span class="sk sk-line w60"></span></p><p class="muted small">Reading public data for ' + esc(short(mint)) + "…</p>", "loading");
    if (!quiet) {
      head.innerHTML = '<span class="sk sk-circle"></span><span class="sk sk-line w40"></span>';
      var u = new URL(location.href); u.searchParams.set("ca", mint); history.replaceState(null, "", u.pathname + u.search + u.hash);
      share.hidden = false; share.querySelector("input").value = u.href.split("#")[0];
    }

    var pAcct = rpc(RPC_ACCT, "getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    // token-pairs lists every pool (up to 30); tokens/v1 now returns only the top pair, so it is the fallback.
    var pDex = cachedGet("https://api.dexscreener.com/token-pairs/v1/solana/" + mint, 9000)
      .catch(function () { return cachedGet("https://api.dexscreener.com/tokens/v1/solana/" + mint, 9000); }).catch(function () { return null; });
    var pJup = cachedGet("https://lite-api.jup.ag/tokens/v2/search?query=" + mint, 9000).then(function (a) {
      if (!Array.isArray(a)) return null; for (var i = 0; i < a.length; i++) if (a[i].id === mint) return a[i]; return false;
    }).catch(function () { return null; });
    function big() { return rpc(RPC_LARGEST, "getTokenLargestAccounts", [mint, { commitment: "confirmed" }]); }
    var pBig = big().catch(function () { return wait(2500).then(big); }).catch(function () { return null; }); // one polite retry: the public RPC rate-limits per IP

    function stale() { return my !== run; }
    function done() { btn.disabled = false; root.removeAttribute("aria-busy"); }

    pAcct.then(function (acct) {
      if (stale()) return;
      var v = acct && acct.value;
      if (!v) { resetRows("grey"); done(); head.innerHTML = ""; return setSum('<p class="eyebrow">Nothing to read</p><p class="tally sm">No account at this address on Solana mainnet.</p><p class="muted small">Check you pasted the token&rsquo;s mint (contract) address, not a pair, wallet or transaction.</p>', "msg"); }
      var parsed = v.data && v.data.parsed;
      if (!parsed || parsed.type !== "mint" || (v.owner !== TOKEN && v.owner !== T22)) {
        resetRows("grey"); done(); head.innerHTML = "";
        return setSum('<p class="eyebrow">Not a token mint</p><p class="tally sm">This address is a ' + (v.owner === SYS ? "wallet" : parsed && parsed.type === "account" ? "token account (someone&rsquo;s balance), not the mint" : "program or other account") + '.</p><p class="muted small">Paste the token&rsquo;s mint (contract) address. On DexScreener or Solscan it&rsquo;s usually labelled CA or Mint.</p>', "msg");
      }
      var info = parsed.info, dec = info.decimals, supply = Number(info.supply) / Math.pow(10, dec), feeBps = 0;
      // 1 + 2: authorities
      if (info.mintAuthority) row("mint", "red", "Active: " + scan(info.mintAuthority), "Someone can still mint new tokens, which dilutes every holder. Fine for some stablecoins and project tokens; a big risk on a memecoin.", "Solana RPC");
      else row("mint", "green", "Renounced", "No one can mint more of this token.", "Solana RPC");
      if (info.freezeAuthority) row("freeze", "red", "Active: " + scan(info.freezeAuthority), "This wallet can freeze any holder&rsquo;s tokens so they can&rsquo;t sell. Common in honeypots. Regulated stablecoins (like USDC) also keep it, for compliance.", "Solana RPC");
      else row("freeze", "green", "Renounced", "No one can freeze holders&rsquo; tokens.", "Solana RPC");
      // 3: program + extensions
      if (v.owner === T22) {
        var ex = info.extensions || [], bad = [], warn = [];
        ex.forEach(function (e) {
          var n = e.extension, s = e.state || {};
          if (n === "permanentDelegate" && s.delegate) bad.push("permanent delegate " + scan(s.delegate) + " (can move or burn anyone&rsquo;s tokens)");
          else if (n === "nonTransferable") bad.push("non-transferable");
          else if (n === "defaultAccountState" && s.accountState === "frozen") bad.push("new accounts start frozen");
          else if (n === "pausable") bad.push("transfers can be paused");
          else if (n === "transferFeeConfig") {
            var f = s.newerTransferFee || s.olderTransferFee || {}, bps = f.transferFeeBasisPoints || 0, mx = Number(f.maximumFee || 0) / Math.pow(10, dec);
            feeBps = Math.max(feeBps, bps);
            var ft = "transfer fee " + (bps / 100) + "%" + (bps && mx ? " (max " + mx.toLocaleString(undefined, { maximumFractionDigits: 4 }) + " tokens)" : "") +
              (s.transferFeeConfigAuthority ? ", and " + scan(s.transferFeeConfigAuthority) + " can change it" : "");
            if (bps >= 500) bad.push(ft); else if (bps || s.transferFeeConfigAuthority) warn.push(ft);
          }
          else if (n === "transferHook" && s.programId) warn.push("transfer hook " + scan(s.programId) + " (custom code runs on every transfer)");
          else if (n === "mintCloseAuthority" && s.closeAuthority) warn.push("mint can be closed by " + scan(s.closeAuthority));
          else if ((n === "interestBearingConfig" || n === "scaledUiAmountConfig") ) warn.push("displayed balances can change (" + (n === "interestBearingConfig" ? "interest-bearing" : "scaled UI amount") + ")");
        });
        if (bad.length) row("prog", "red", "Token-2022: " + bad.concat(warn).join(", "), "These extensions let the issuer control or block holders&rsquo; tokens. Regulated stablecoins use some of them for compliance; on a memecoin they&rsquo;re a big risk.", "Solana RPC");
        else if (warn.length) row("prog", "amber", "Token-2022: " + warn.join(", "), "Not a rug by itself, but it changes what you actually receive or can sell.", "Solana RPC");
        else row("prog", "green", "Token-2022, no risky extensions", "Checked for permanent delegate, freeze-by-default, pause, transfer fees, hooks, mint close and balance-scaling extensions.", "Solana RPC");
      } else row("prog", "green", "Standard SPL token", "Classic token program: no transfer fees, hooks or permanent delegates possible.", "Solana RPC");

      Promise.all([pDex, pJup, pBig]).then(function (r) {
        if (stale()) return;
        var pairs = Array.isArray(r[0]) ? r[0] : null, jup = r[1], big = r[2];
        var base = (pairs || []).filter(function (p) { return p.baseToken && p.baseToken.address === mint; });
        var pairAddr = {}; (pairs || []).forEach(function (p) { pairAddr[p.pairAddress] = p.dexId; });
        // token header
        var name = (jup && jup.name) || (base[0] && base[0].baseToken.name) || "Unknown token", sym = (jup && jup.symbol) || (base[0] && base[0].baseToken.symbol) || "";
        var price = base[0] && base[0].priceUsd ? Number(base[0].priceUsd) : jup && jup.usdPrice;
        var mc = (base[0] && (base[0].marketCap || base[0].fdv)) || (jup && (jup.mcap || jup.fdv));
        lastSym = sym;
        head.innerHTML = '<span class="ph" aria-hidden="true">' + esc((sym || "?").slice(0, 1)) + "</span>" +
          '<div><b>' + esc(name) + "</b> " + (sym ? '<span class="muted">$' + esc(sym) + "</span>" : "") + (jup && jup.isVerified ? ' <span class="tag">Jupiter verified</span>' : "") +
          (/pump$/.test(mint) ? ' <span class="tag">pump.fun launch</span>' : "") +
          '<br><span class="muted small">Price ' + esc(usd(price)) + " · Market cap " + esc(usd(mc)) + " · Supply " + esc(supply.toLocaleString(undefined, { maximumFractionDigits: 0 })) + " · " + scan(mint, "token") + "</span></div>";

        // 7: pool age
        var created = base.map(function (p) { return p.pairCreatedAt; }).filter(Boolean);
        var first = created.length ? Math.min.apply(null, created) : (jup && jup.firstPool && Date.parse(jup.firstPool.createdAt)) || null;
        var ageSrc = created.length ? "DexScreener (oldest pool)" : "Jupiter (first pool)";
        if (first) {
          var h = (Date.now() - first) / 3.6e6;
          row("age", h < 24 ? "red" : h < 24 * 7 ? "amber" : "green", ago(first) + " old", h < 24 ? "Less than a day old. In <a href=\"../lab/\">our research</a>, 78.5% of pump.fun graduates that hit $100k were down by half or more 24 hours later." : h < 168 ? "Under a week old: little track record." : "Has traded for over a week. Age alone says nothing about where it goes next.", ageSrc);
        } else row("age", "grey", "Unknown", "No pool found to date it.", "DexScreener, Jupiter");

        // 8 + 9: liquidity and volume
        var curve = (pairs || []).some(function (p) { return p.dexId === "pumpfun" && p.baseToken && p.baseToken.address === mint; });
        var liq = 0, vol = 0, nP = 0;
        base.forEach(function (p) { if (p.liquidity && p.liquidity.usd) { liq += p.liquidity.usd; nP++; } if (p.volume && p.volume.h24) vol += p.volume.h24; });
        var lsrc = "DexScreener";
        // DexScreener lists at most ~30 pairs; Jupiter aggregates every pool it routes through. Use whichever sees more.
        if (jup && jup.liquidity != null && jup.liquidity > liq) { liq = jup.liquidity; lsrc = "Jupiter (all routed pools)"; nP = 0; }
        var s24 = (jup && jup.stats24h) || {}, jv = (s24.buyVolume || 0) + (s24.sellVolume || 0), vsrc = "DexScreener";
        if (jv > vol) { vol = jv; vsrc = "Jupiter"; }
        if (!liq && curve) row("liq", "amber", "Bonding curve only", "Still on pump.fun&rsquo;s bonding curve: no DEX pool yet. Price moves a lot on small buys and sells.", "DexScreener");
        else if (!liq) row("liq", pairs === null && !jup ? "grey" : "red", pairs === null && !jup ? "Couldn&rsquo;t load" : "No pool found", pairs === null && !jup ? "DexScreener and Jupiter didn&rsquo;t answer. Try again in a minute." : "No liquidity found: you may not be able to sell.", lsrc);
        else {
          var lr = mc ? liq / mc : null;
          var ll = liq < 10000 ? "red" : (liq < 50000 || (lr != null && lr < 0.03 && liq < 5e6)) ? "amber" : "green";
          row("liq", ll, esc(usd(liq)) + (nP ? " across " + nP + " pool" + (nP > 1 ? "s" : "") : "") + (lr != null ? " (" + pct(lr, lr < 0.01 ? 2 : 1) + " of market cap)" : ""),
            ll === "red" ? "Very thin: a few sells can move the price hard." : ll === "amber" ? "Thin for its size: big exits will slip a lot." : "Enough depth that normal-size trades won&rsquo;t move it much. Liquidity can still be pulled or drained.", lsrc);
        }
        if (mc && (vol || base.length)) {
          var t = vol / mc;
          row("vol", t > 3 ? "amber" : t < 0.01 ? "amber" : "green", esc(usd(vol)) + " in 24h (" + (t >= 10 ? Math.round(t) + "×" : t < 0.01 ? pct(t, 2) : pct(t, 0)) + " of market cap)",
            t > 3 ? "Turnover far above market cap. Can be real hype, or bots trading with themselves." : t < 0.01 ? "Low turnover next to its size. Fine for big established tokens; on a small coin it means it&rsquo;s hard to get in or out." : "Normal range of activity.", vsrc);
        } else row("vol", "grey", "n/a", "No market cap or volume data.", vsrc);

        // 6: creator / dev (Jupiter)
        if (jup && jup.dev) {
          var a = jup.audit || {}, dp = a.devBalancePercentage, dm = a.devMints;
          var dl = dp > 10 ? "red" : (dp > 2 || dm >= 10) ? "amber" : (dp == null && dm == null ? "grey" : "green");
          row("dev", dl, scan(jup.dev) + (dp != null ? " holds " + dp.toFixed(2) + "%" : "") + (dm != null ? " · has created " + dm + " token" + (dm === 1 ? "" : "s") : ""),
            dl === "red" ? "The creator still holds a big bag and can dump it." : dm >= 10 ? "Serial launcher: this wallet has created many tokens." : dl === "grey" ? "Creator found, but no balance data." : dp == null ? "Few launches on record from this wallet. Jupiter has no figure for how much it still holds." : "Creator holds little of the supply.", "Jupiter");
        } else row("dev", "grey", "Not available", "Jupiter has no creator record for this token (common for older or bridged tokens).", "Jupiter");

        // 4 + 5: holders, 10: LP, 11: sell path. Run together, then summarise once.
        var tasks = [lpCheck(base, curve, stale), sellCheck(mint, feeBps, stale)];
        if (big && big.value && big.value.length && supply > 0) {
          var accts = big.value.slice(0, 20);
          tasks.push(rpc(RPC_ACCT, "getMultipleAccounts", [accts.map(function (x) { return x.address; }), { encoding: "jsonParsed" }]).then(function (m) {
            var owners = (m.value || []).map(function (x) { return x && x.data && x.data.parsed && x.data.parsed.info ? x.data.parsed.info.owner : null; });
            var uniq = owners.filter(function (o, i) { return o && owners.indexOf(o) === i; });
            return rpc(RPC_ACCT, "getMultipleAccounts", [uniq, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]).then(function (o2) {
              var prog = {}; (o2.value || []).forEach(function (x, i) { prog[uniq[i]] = x ? x.owner : null; });
              return accts.map(function (x, i) {
                var o = owners[i], kind = "wallet";
                if (o === BURN) kind = "burn"; else if (pairAddr[o] || AMM[o]) kind = "pool"; else if (prog[o] && prog[o] !== SYS) kind = "program";
                return { owner: o || x.address, share: Number(x.amount) / Math.pow(10, dec) / supply, kind: kind };
              });
            });
          }).then(function (list) { if (!stale()) holders(list); }).catch(function () { if (!stale()) holdersFallback(jup, mint); }));
        } else holdersFallback(jup, mint);
        Promise.all(tasks.map(function (p) { return p.catch(function () {}); })).then(function () { if (!stale()) { summary(); done(); afterRun(mint); } });
      });
    }).catch(function () {
      if (stale()) return;
      if (quiet) { done(); return watchNote("Couldn&rsquo;t reach the public Solana RPC on the last recheck. Kept the previous read; will try again."); }
      resetRows("grey"); done(); head.innerHTML = "";
      setSum('<p class="eyebrow">Data sources unavailable</p><p class="tally sm">We couldn&rsquo;t reach the public Solana RPC right now.</p><p class="muted small">Nothing here is a result. Try again in a minute.</p>', "msg");
    });
  }

  /* ---------- v2: LP burn read ---------- */
  var PUMPSWAP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
  var DEXN = { pumpswap: "PumpSwap", raydium: "Raydium", orca: "Orca", meteora: "Meteora", pumpfun: "pump.fun curve" };
  function poolName(p) { var n = DEXN[p.dexId] || p.dexId || "pool"; return n + (p.labels && p.labels.length ? " " + p.labels.join("/") : ""); }
  function lpOne(p) {
    var lb = (p.labels || []).join(" ").toUpperCase();
    if (/CLMM|DLMM|\bWP\b|WHIRLPOOL/.test(lb) || p.dexId === "orca") return Promise.resolve({ k: "clmm" });
    if (p.dexId === "raydium") {
      return cachedGet("https://api-v3.raydium.io/pools/info/ids?ids=" + p.pairAddress, 9000).then(function (j) {
        var d = j && j.success && j.data && j.data[0];
        if (!d) return { k: "err" };
        if (d.type === "Concentrated") return { k: "clmm" };
        return d.burnPercent == null ? { k: "err" } : { k: "burn", v: Math.max(0, Math.min(1, d.burnPercent / 100)), src: "Raydium API" };
      });
    }
    if (p.dexId === "pumpswap") {
      // PumpSwap pool account: lp_mint at byte 107, lp_supply (LP ever issued, ignoring burns) at byte 203.
      return rpc(RPC_ACCT, "getAccountInfo", [p.pairAddress, { encoding: "base64" }]).then(function (a) {
        var v = a && a.value; if (!v || v.owner !== PUMPSWAP) return { k: "err" };
        var d = b64bytes(v.data[0]); if (d.length < 211) return { k: "err" };
        var lp = b58enc(d.slice(107, 139)), issued = u64(d, 203);
        return rpc(RPC_ACCT, "getAccountInfo", [lp, { encoding: "jsonParsed" }]).then(function (m) {
          var info = m && m.value && m.value.data && m.value.data.parsed && m.value.data.parsed.info;
          if (!info || !issued) return { k: "err" };
          return { k: "burn", v: Math.max(0, Math.min(1, 1 - Number(info.supply) / issued)), src: "Solana RPC (PumpSwap pool)" };
        });
      });
    }
    return Promise.resolve({ k: "unknown" });
  }
  function lpCheck(base, curve, stale) {
    var pools = base.filter(function (p) { return p.liquidity && p.liquidity.usd > 0 && p.dexId !== "pumpfun"; })
      .sort(function (a, b) { return b.liquidity.usd - a.liquidity.usd; }).slice(0, 3);
    if (!pools.length) {
      row("lp", "grey", curve ? "Still on the bonding curve" : "No pool found", curve ? "On pump.fun&rsquo;s bonding curve there&rsquo;s no LP token yet, so there&rsquo;s nothing to burn or lock." : "No DEX pool to read.", "DexScreener");
      return Promise.resolve();
    }
    var tot = pools.reduce(function (s, p) { return s + p.liquidity.usd; }, 0);
    return Promise.all(pools.map(function (p) { return lpOne(p).catch(function () { return { k: "err" }; }); })).then(function (res) {
      if (stale()) return;
      var txt = { clmm: "concentrated pool, no LP token", unknown: "lock status not readable", err: "couldn&rsquo;t read" };
      var parts = res.map(function (r, i) {
        return esc(poolName(pools[i])) + " (" + pct(pools[i].liquidity.usd / tot, 0) + " of liquidity): " + (r.k === "burn" ? "<b>" + pct(r.v, r.v > 0.99 ? 2 : 1) + " of LP burned</b>" : txt[r.k]);
      });
      var m = res[0], lvl, why, srcs = res.filter(function (r) { return r.src; }).map(function (r) { return r.src; });
      if (m.k === "burn") {
        lvl = m.v >= 0.95 ? "green" : m.v >= 0.5 ? "amber" : "red";
        why = lvl === "green" ? "Most of the main pool&rsquo;s LP tokens are burned, so that liquidity can&rsquo;t be pulled. Holders can still dump into it." :
          lvl === "amber" ? "Part of the main pool&rsquo;s LP is not burned: whoever holds it can withdraw that liquidity." : "Most of the main pool&rsquo;s LP is not burned: the holder can pull the liquidity.";
      } else if (m.k === "clmm") { lvl = "amber"; why = "The main pool is concentrated liquidity (positions, not LP tokens). Burn or lock can&rsquo;t be read this way, and position owners can usually withdraw at any time."; }
      else { lvl = "grey"; why = m.k === "err" ? "Couldn&rsquo;t read the main pool&rsquo;s LP data right now. Try again in a minute." : "We read LP burns for PumpSwap and Raydium standard pools only."; }
      row("lp", lvl, parts.join("<br>"), why + " Third-party lockers aren&rsquo;t checked.", (srcs.length ? srcs.filter(function (x, i) { return srcs.indexOf(x) === i; }).join(", ") + ", " : "") + "DexScreener");
    });
  }

  /* ---------- v2: sell-path quote attempt (read-only Jupiter quotes, never a swap) ---------- */
  var QURL = "https://lite-api.jup.ag/swap/v1/quote?slippageBps=500&swapMode=ExactIn&restrictIntermediateTokens=true";
  function sellCheck(mint, feeBps, stale) {
    if (mint === WSOL) { row("sell", "grey", "n/a", "This is wrapped SOL itself.", "Jupiter"); return Promise.resolve(); }
    var amt = 100000000; // 0.1 SOL
    var nr = function (r) { return r && r.j && /NO_ROUTES|NOT_TRADABLE|COULD_NOT_FIND/i.test((r.j.errorCode || "") + " " + (r.j.error || "")); };
    var fee = feeBps ? " The " + feeBps / 100 + "% Token-2022 transfer fee may not be in these quotes." : "";
    return qget2(QURL + "&inputMint=" + WSOL + "&outputMint=" + mint + "&amount=" + amt).then(function (b) {
      if (stale()) return;
      if (!b.ok || !b.j.outAmount) {
        if (nr(b)) row("sell", "grey", "No buy route found", "Jupiter found no route for a 0.1 SOL buy, so there was no sell to test. Quote attempt, not a verdict.", "Jupiter quote API");
        else row("sell", "grey", "Couldn&rsquo;t load", "Jupiter&rsquo;s quote API didn&rsquo;t answer. Try again in a minute.", "Jupiter quote API");
        return;
      }
      return qget2(QURL + "&inputMint=" + mint + "&outputMint=" + WSOL + "&amount=" + b.j.outAmount).then(function (s2) {
        if (stale()) return;
        if (!s2.ok || !s2.j.outAmount) {
          if (nr(s2)) row("sell", "red", "Buy quote found, no sell quote", "Jupiter could quote buying 0.1 SOL of it but found no route to sell the same amount back. Honeypots look like this; so can a brief routing gap. Quote attempt, not a verdict." + fee, "Jupiter quote API");
          else row("sell", "grey", "Couldn&rsquo;t load the sell quote", "The buy quote worked; the sell quote didn&rsquo;t answer. Try again in a minute.", "Jupiter quote API");
          return;
        }
        var back = Number(s2.j.outAmount) / 1e9, loss = 1 - back / 0.1;
        var via = (s2.j.routePlan || []).map(function (r) { return r.swapInfo && r.swapInfo.label; }).filter(Boolean);
        via = via.filter(function (x, i) { return via.indexOf(x) === i; }).slice(0, 2).join(" + ");
        var lvl = loss > 0.15 ? "red" : loss > 0.05 ? "amber" : "green";
        var rt = Math.abs(loss) < 0.0005 ? "under 0.05%" : (loss > 0 ? "&minus;" : "+") + pct(Math.abs(loss), Math.abs(loss) < 0.01 ? 2 : 1);
        row("sell", lvl, "0.1 SOL &rarr; tokens &rarr; " + back.toFixed(4) + " SOL back (" + rt + " round trip)" + (via ? " via " + esc(via) : ""),
          (lvl === "red" ? "Selling back loses a lot even on a small size: heavy fees, a sell tax or very thin depth. " : lvl === "amber" ? "Noticeable round-trip cost on a small size. " : "A sell route exists and the round trip on 0.1 SOL is cheap. ") +
          "Read-only quotes, no swap made. A quote isn&rsquo;t a fill: freezes, hooks or blacklists can still block a real sell. Quote attempt, not a verdict." + fee, "Jupiter quote API");
      });
    }).catch(function () { if (!stale()) row("sell", "grey", "Couldn&rsquo;t load", "Jupiter&rsquo;s quote API didn&rsquo;t answer. Try again in a minute.", "Jupiter quote API"); });
  }

  /* ---------- v2: watch mode (browser-only rechecks, paused while the tab is hidden) ---------- */
  var cw = document.getElementById("chk-watch"), cwBtn = document.getElementById("cw-btn"), cwSt = document.getElementById("cw-status"), cwLog = document.getElementById("cw-log");
  var WATCH_MS = 180000, WATCH_MAX = 7200000;
  function hm(t) { return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  function snap() {
    var o = {}, rows = root.querySelectorAll(".chk-row");
    for (var i = 0; i < rows.length; i++) o[rows[i].id] = { l: rows[i].getAttribute("data-l"), v: rows[i].querySelector(".val").textContent.replace(/\s+/g, " ").trim(), lab: rows[i].querySelector(".lab").textContent };
    return o;
  }
  function logLine(html) {
    if (!cwLog) return;
    var li = document.createElement("li"); li.innerHTML = html; cwLog.insertBefore(li, cwLog.firstChild);
    while (cwLog.children.length > 30) cwLog.removeChild(cwLog.lastChild);
  }
  function wstatus() {
    if (!cwSt) return;
    if (!watch) { cwSt.textContent = ""; return; }
    cwSt.textContent = document.hidden ? "Paused while this tab is hidden." : "Watching. Rechecked " + watch.n + "×, next at " + hm(watch.due) + ". Stops after 2 hours.";
  }
  function watchNote(t) { if (watch) logLine(hm(Date.now()) + " · " + t); }
  function afterRun(mint) {
    if (cw && cw.hidden) cw.hidden = false;
    if (!watch || watch.mint !== mint) return;
    var now = snap(), old = watch.last, ch = [];
    Object.keys(now).forEach(function (k) {
      var a = old[k], b = now[k]; if (!a || (a.l === b.l && a.v === b.v)) return;
      ch.push("<b>" + esc(b.lab) + "</b>: " + esc(a.v) + " (" + esc(LV[a.l] || a.l) + ") &rarr; " + esc(b.v) + " (" + esc(LV[b.l] || b.l) + ")");
      var el = document.getElementById(k); if (el) { el.classList.add("chg"); el.setAttribute("data-chg", hm(Date.now())); }
    });
    watch.n++; watch.last = now;
    logLine(hm(Date.now()) + " · " + (ch.length ? ch.join("<br>") : "No changes."));
    wstatus();
  }
  function sched() { clearTimeout(watch.t); watch.t = setTimeout(tick, Math.max(0, watch.due - Date.now())); }
  function tick() {
    if (!watch) return;
    if (document.hidden) { wstatus(); return; }
    if (Date.now() - watch.start > WATCH_MAX) { watchNote("Stopped after 2 hours to go easy on the free public APIs. Start again any time."); return stopWatch(); }
    watch.due = Date.now() + WATCH_MS; check(watch.mint, true); sched(); wstatus();
  }
  function stopWatch(reset) {
    if (watch) clearTimeout(watch.t);
    watch = null;
    if (cwBtn) { cwBtn.setAttribute("aria-pressed", "false"); cwBtn.textContent = "Watch: recheck every 3 min"; }
    if (reset) {
      if (cw) cw.hidden = true; if (cwLog) cwLog.innerHTML = "";
      var c = root.querySelectorAll(".chk-row.chg"); for (var i = 0; i < c.length; i++) { c[i].classList.remove("chg"); c[i].removeAttribute("data-chg"); }
    }
    wstatus();
  }
  if (cwBtn) cwBtn.addEventListener("click", function () {
    if (watch) { watchNote("Stopped watching."); return stopWatch(); }
    var m = new URLSearchParams(location.search).get("ca") || input.value.trim(); if (!validMint(m)) return;
    watch = { mint: m, start: Date.now(), due: Date.now() + WATCH_MS, n: 0, last: snap(), t: 0 };
    cwBtn.setAttribute("aria-pressed", "true"); cwBtn.textContent = "Stop watching";
    logLine(hm(Date.now()) + " · Started watching " + esc(short(m)) + ". Changes show here and are outlined in the list.");
    sched(); wstatus();
  });
  document.addEventListener("visibilitychange", function () {
    if (!watch) return;
    if (document.hidden) clearTimeout(watch.t);
    else if (Date.now() >= watch.due) tick(); else sched();
    wstatus();
  });

  function holders(list) {
    // merge token accounts by owner
    var by = {}; list.forEach(function (h) { var k = h.owner; if (!by[k]) by[k] = { owner: k, share: 0, kind: h.kind }; by[k].share += h.share; });
    var all = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.share - a.share; });
    var wallets = all.filter(function (h) { return h.kind === "wallet"; }), skipped = all.length - wallets.length;
    var top10 = wallets.slice(0, 10).reduce(function (s, h) { return s + h.share; }, 0), top = wallets[0];
    var lbl = { pool: "pool", program: "program/vault", burn: "burned" };
    var ex = all.filter(function (h) { return h.kind !== "wallet"; }).slice(0, 3).map(function (h) { return lbl[h.kind] + " " + pct(h.share); }).join(", ");
    row("top10", top10 > 0.5 ? "red" : top10 > 0.25 ? "amber" : "green", pct(top10) + " held by the top 10 wallets",
      (skipped ? "Excludes " + skipped + " pool, program or burn account" + (skipped > 1 ? "s" : "") + (ex ? " (" + ex + ")" : "") + ". " : "") +
      (top10 > 0.5 ? "A handful of wallets can crash the price." : top10 > 0.25 ? "Concentrated: watch those wallets." : "Spread out across holders.") + " One person can own many wallets.", "Solana RPC (largest accounts)");
    if (top) row("whale", top.share > 0.15 ? "red" : top.share > 0.05 ? "amber" : "green", pct(top.share, 2) + " in " + scan(top.owner), top.share > 0.15 ? "One wallet can dump a big chunk of supply." : top.share > 0.05 ? "A sizeable single holder." : "No single wallet dominates.", "Solana RPC (largest accounts)");
    else row("whale", "grey", "n/a", "Only pools or programs among the largest holders.", "Solana RPC");
  }
  function holdersFallback(jup, mint) {
    var t = jup && jup.audit && jup.audit.topHoldersPercentage;
    if (t != null) {
      var f = t / 100;
      row("top10", f > 0.5 ? "red" : f > 0.25 ? "amber" : "green", t.toFixed(1) + "% held by top holders (Jupiter&rsquo;s figure)", "The public RPC limited our holder lookup from your connection, so this uses Jupiter&rsquo;s top-holders figure. Jupiter&rsquo;s method may count pools differently. Re-run in a minute for our own breakdown.", "Jupiter");
    } else row("top10", "grey", "Couldn&rsquo;t load", "The public RPC limited the holder lookup and Jupiter had no figure. Try again in a minute.", "Solana RPC, Jupiter");
    row("whale", "grey", "Couldn&rsquo;t load", "Needs the holder list from the free public RPC, which rate-limited your connection (we retried once). Try again in a minute, or see the " +
      '<a href="https://solscan.io/token/' + esc(mint) + '#holders" target="_blank" rel="noopener noreferrer">holders tab on Solscan</a>.' + (jup && jup.holderCount ? " Jupiter counts " + Number(jup.holderCount).toLocaleString() + " holders." : ""), "Solana RPC");
  }

  /* ---------- wiring ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var s = (input.value || "").trim();
    var m = s.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/); // accept pasted dexscreener/solscan/pump.fun links
    if (m && !validMint(s)) s = m[0];
    if (!validMint(s)) { err.hidden = false; err.textContent = "That doesn't look like a Solana address. A mint address is 32 to 44 letters and numbers (base58, no 0, O, I or l)."; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
    input.removeAttribute("aria-invalid"); input.value = s; check(s);
  });
  share.querySelector("button").addEventListener("click", function () {
    var i = share.querySelector("input"), b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { b.textContent = "Copied"; }, function () { i.select(); b.textContent = "Select + copy"; });
    setTimeout(function () { b.textContent = "Copy link"; }, 1800);
  });
  var q = new URLSearchParams(location.search).get("ca");
  if (q) { input.value = q.trim(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); }
})();
