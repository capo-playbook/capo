/* Registers the offline shell service worker on the static site only (the page carries <link rel=manifest data-sw>).
   The worker never touches the API, payment/order pages, wallet.js or downloads. */
(function () {
  "use strict";
  var m = document.querySelector("link[rel=manifest][data-sw]");
  if (!m || !("serviceWorker" in navigator)) return;
  var go = function () { navigator.serviceWorker.register(m.getAttribute("data-sw"), { scope: m.getAttribute("data-scope") }).catch(function () {}); };
  if (document.readyState === "complete") go(); else addEventListener("load", go);
})();
