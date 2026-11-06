/* Capo static-shell service worker. Build 445dcb4bf5. Caches only the public static shell. */
"use strict";
var V = "capo-shell-445dcb4bf5", B = "/capo", SHELL = ["/capo/", "/capo/check/", "/capo/tools/", "/capo/arena/", "/capo/war-room/", "/capo/lab/", "/capo/updates/", "/capo/manifest.webmanifest", "/capo/static/icon-192.png", "/capo/static/inter.woff2", "/capo/static/bebas.woff2", "/capo/static/cinzel.woff2", "/capo/static/site.css?v=138bccecf8", "/capo/static/app.js?v=138bccecf8", "/capo/static/fx.js?v=138bccecf8", "/capo/static/pwa.js?v=138bccecf8", "/capo/static/tools.js?v=138bccecf8", "/capo/static/check.js?v=138bccecf8", "/capo/static/lab.js?v=138bccecf8", "/capo/static/arena.js?v=138bccecf8", "/capo/static/hook.js?v=138bccecf8", "/capo/static/warroom.js?v=138bccecf8"];
var NEVER = /(^|\/)(order\.html|recover\.html|unsubscribe\.html)$|\/static\/wallet\.js|\/(api|dl|free)\/|\.(mp4|pdf)$/;
self.addEventListener("install", function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("capo-shell-") === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
function put(req, res) { if (res && res.ok && res.type === "basic") { var c = res.clone(); caches.open(V).then(function (ca) { ca.put(req, c); }); } return res; }
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin || (u.pathname !== B && u.pathname.indexOf(B + "/") !== 0) || NEVER.test(u.pathname) || r.headers.has("range")) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(function (res) { return put(r, res); }).catch(function () {
      return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || caches.match(B + "/"); }); }));
    return;
  }
  // Cache-first only for versioned assets (?v=) and files in the precached shell; everything else (e.g. icons the browser
  // itself requests) goes straight to the network untouched.
  if ((u.pathname.indexOf(B + "/static/") === 0 && /[?&]v=/.test(u.search)) || SHELL.indexOf(u.pathname + u.search) >= 0) {
    e.respondWith(caches.match(r).then(function (m) { return m || fetch(r).then(function (res) { return put(r, res); }); }));
  }
});
