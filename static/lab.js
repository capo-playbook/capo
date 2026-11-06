/* Lab Drop: email sign-up and unsubscribe. Emails are only stored; nothing is sent from here. */
(function () {
  "use strict";
  var m = document.querySelector('meta[name="capo-api"]'), API = m ? m.content.replace(/\/$/, "") : "";
  function post(path, data) {
    return fetch(API + path, { method: "POST", headers: { "content-type": "application/json", "ngrok-skip-browser-warning": "1" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { error: "Unexpected reply (" + r.status + ")" }; }).then(function (j) { j._s = r.status; return j; }); });
  }
  var f = document.getElementById("sub-form"), msg = document.getElementById("sub-msg");
  if (f) f.addEventListener("submit", function (e) {
    e.preventDefault();
    var em = f.email.value.trim(), b = f.querySelector("button[type=submit]");
    function say(t, ok) { msg.hidden = false; msg.className = "sub-msg small " + (ok ? "ok" : "bad"); msg.textContent = t; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { say("Please enter a valid email address.", false); f.email.focus(); return; }
    if (!f.consent.checked) { say("Please tick the box to confirm you want the emails.", false); f.consent.focus(); return; }
    b.disabled = true; b.textContent = "Saving…";
    post("/api/subscribe", { email: em, consent: "yes", website: f.website.value })
      .then(function (j) {
        if (j.ok) {
          say(j.message, true);
          if (j.unsub) {
            var u = new URL("unsubscribe.html", location.href); u.hash = "t=" + j.unsub;
            var p = document.createElement("span"); p.className = "unsub-keep";
            p.appendChild(document.createTextNode(" Keep this link to unsubscribe any time: "));
            var a = document.createElement("a"); a.href = u.href; a.textContent = "unsubscribe link"; p.appendChild(a); msg.appendChild(p);
          }
          f.reset();
        } else say(j.error || "Something went wrong. Please try again.", false);
      }, function () { say("Couldn't reach the server. Please try again in a minute.", false); })
      .then(function () { b.disabled = false; b.textContent = "Subscribe"; });
  });
  var uf = document.getElementById("unsub-form");
  if (uf) {
    var t = (location.hash.match(/t=([A-Za-z0-9_-]{20,64})/) || [])[1];
    if (t) document.getElementById("unsub-t").value = t;
    uf.addEventListener("submit", function (e) {
      e.preventDefault();
      var out = document.getElementById("unsub-msg"), tok = document.getElementById("unsub-t").value;
      if (!tok) { out.textContent = "This page needs the unsubscribe link from your sign-up. Email us and we'll remove you by hand."; return; }
      post("/api/unsubscribe", { t: tok }).then(function (j) { out.textContent = j.message || j.error; if (j.ok) uf.hidden = true; },
        function () { out.textContent = "Couldn't reach the server. Please try again in a minute."; });
    });
  }
})();
