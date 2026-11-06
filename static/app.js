(function(){ var q=function(e){ var t=e&&e.viewTransition; if(!t) return; ['ready','finished','updateCallbackDone'].forEach(function(k){ t[k]&&t[k].catch&&t[k].catch(function(){}) }) };
  try{ window.addEventListener('unhandledrejection',function(e){ var r=e.reason; if(r&&r.name==='InvalidStateError'&&/transition/i.test(String(r.message||''))) e.preventDefault() }); window.addEventListener('pagereveal',q); window.addEventListener('pageswap',q) }catch(e){} })();
// The Capo Playbook: site behaviour. No dependencies, no external requests except the checkout API.
(function(){
'use strict';
var D=document, W=window;
var m=D.querySelector('meta[name="capo-api"]'), API=m?m.content.replace(/\/$/,''):'', SPLIT=!!API;
var HDR=SPLIT?{'ngrok-skip-browser-warning':'1'}:{};
var mm=function(q){return W.matchMedia&&W.matchMedia(q).matches};
var REDUCED=mm('(prefers-reduced-motion: reduce)'), SAVE=!!(navigator.connection&&navigator.connection.saveData);
var MOBILE=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Macintosh/.test(navigator.userAgent));
function $(s,r){return (r||D).querySelector(s)} function $$(s,r){return Array.prototype.slice.call((r||D).querySelectorAll(s))}
function api(p){return API+p}
function orderHref(id){return SPLIT?'order.html#'+id:'/order/'+id}
// Static order page: a new order id in the hash (fresh SOL quote, 'Pay 12 USDC instead', recover) must load that order, not keep the old one.
if(SPLIT&&/order\.html$/.test(location.pathname)) W.addEventListener('hashchange',function(){ var h=(location.hash||'').slice(1); if(/^[A-Za-z0-9_-]{16,40}$/.test(h)) location.reload() });
// ...and the skip link must not overwrite the order id in the hash.
if(SPLIT&&/order\.html$/.test(location.pathname)) D.addEventListener('click',function(e){ var a=e.target.closest&&e.target.closest('a.skip'); if(!a) return; e.preventDefault(); var m=D.getElementById('main'); if(m){ m.setAttribute('tabindex','-1'); m.focus(); m.scrollIntoView() } });

// Clipboard with a no-dialog fallback (execCommand on a hidden textarea) for unfocused/insecure contexts.
function copyText(t){ var fb=function(){ return new Promise(function(ok,no){ try{ var a=D.createElement('textarea'); a.value=t; a.setAttribute('readonly',''); a.style.position='fixed'; a.style.opacity='0'; D.body.appendChild(a); a.select(); var r=D.execCommand('copy'); a.remove(); r?ok():no(); }catch(e){no(e)} }) };
  return navigator.clipboard&&W.isSecureContext ? navigator.clipboard.writeText(t).catch(fb) : fb(); }
var toastEl,toastT;
function toast(msg){ if(!toastEl){toastEl=D.createElement('div');toastEl.className='toast';toastEl.setAttribute('role','status');D.body.appendChild(toastEl)}
  toastEl.textContent=msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){toastEl.classList.remove('on')},4200); }

// Fragment wiring (runs for the page and again for order HTML injected in split mode)
function wire(root){
  $$('[data-copy]',root).forEach(function(b){ b.addEventListener('click',function(){ copyText(b.getAttribute('data-copy')).then(function(){
      var o=b.getAttribute('data-orig')||b.textContent; b.setAttribute('data-orig',o); b.textContent='Copied ✓'; b.classList.add('copied');
      toast((b.getAttribute('data-copy-label')||'Text')+' copied'); setTimeout(function(){b.textContent=o;b.classList.remove('copied')},1600);
    },function(){ toast('Copy blocked by the browser. Long-press the text to copy it.') }); }); });
  $$(MOBILE?'.only-desktop':'.only-mobile',root).forEach(function(e){e.hidden=true});
  if(SPLIT){ // links in server-rendered fragments point at server routes; map them onto the static site / API
    $$('a[href]',root).forEach(function(a){ var h=a.getAttribute('href');
      if(h==='/') a.setAttribute('href','./'); else if(h==='/recover') a.setAttribute('href','recover.html');
      else if(h==='/updates/') a.setAttribute('href','updates/');
      else if(/^\/#/.test(h)) a.setAttribute('href','./'+h.slice(1));
      else if(/^\/(dl|free)\//.test(h)) a.setAttribute('href',api(h)); });
    $$('form[action]',root).forEach(function(f){ var a=f.getAttribute('action'); if(a.charAt(0)==='/') f.setAttribute('action',api(a)); });
  }
  $$('form[data-pay]',root).forEach(payForm);
  checkout(root);
  $$('[data-dl]',root).forEach(function(a){ a.addEventListener('click',function(e){ if(!SPLIT||a.getAttribute('href')==='#') return; e.preventDefault(); blobDownload(a); }); });
}

// Cross-origin downloads: <a download> is ignored cross-origin and ngrok shows an interstitial to plain navigations,
// so fetch with the skip header and save the blob (works on iOS Safari 13+, Android, desktop).
function blobDownload(a){
  a.classList.add('loading');
  fetch(a.href,{headers:HDR,cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(r.status===403||r.status===410?'This download link has expired. Use Find my order or email us with your order ID.':'Download failed. Please try again.');
    var cd=r.headers.get('Content-Disposition')||'', n=/filename="([^"]+)"/.exec(cd); return r.blob().then(function(b){return {b:b,n:n?n[1]:(a.getAttribute('data-name')||'download')}}); })
  .then(function(x){ var u=URL.createObjectURL(x.b), l=D.createElement('a'); l.href=u; l.download=x.n; l.rel='noopener'; D.body.appendChild(l); l.click(); l.remove();
    setTimeout(function(){URL.revokeObjectURL(u)},60000); toast('Saved '+x.n+(MOBILE?' (iPhone: check Files › Downloads)':'')); })
  .catch(function(e){ toast(e.message||'Download failed. Please try again.') }).then(function(){a.classList.remove('loading')});
}

// Pay buttons: glass overlay with a skeleton while the order (and live SOL quote) is created, then a smooth page transition.
function payForm(f){
  f.addEventListener('submit',function(e){
    var btn=e.submitter||$('button',f), asset=btn&&btn.value; if(!asset||!W.fetch) return;
    e.preventDefault(); if(f.dataset.busy) return; f.dataset.busy='1'; btn.classList.add('loading');
    var ov=D.createElement('div'); ov.className='flow-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Creating your order');
    ov.innerHTML='<div class="flow-card"><h3>'+(asset==='SOL'?'Locking a live SOL price…':'Creating your order…')+'</h3><p>Generating a unique Solana Pay reference for this order. Nothing is sent from your wallet yet.</p>'+
      '<div class="pay-flex"><div class="sk sk-qr" style="width:150px"></div><div><div class="sk sk-line"></div><div class="sk sk-line w80"></div><div class="sk sk-btn"></div></div></div></div>';
    D.body.appendChild(ov);
    var body=new URLSearchParams(); body.set('asset',asset);
    fetch(api('/api/order'),{method:'POST',body:body}) // simple CORS request: no preflight, and ngrok passes POSTs through
    .then(function(r){return r.json().then(function(j){ if(!r.ok||!j.order_id) throw new Error(j.error||'Something went wrong. Please try again.'); return j })})
    .then(function(j){ var go=function(){ location.href=orderHref(j.order_id) };
      if(D.startViewTransition&&!REDUCED&&!SPLIT) go(); else { ov.style.transition='opacity .25s'; go(); } })
    .catch(function(err){ ov.remove(); btn.classList.remove('loading'); delete f.dataset.busy; toast(err.message||'Network error. Please try again.') });
  });
}
W.addEventListener('pageshow',function(e){ if(e.persisted){ $$('.flow-ov').forEach(function(o){o.remove()}); $$('.loading').forEach(function(b){b.classList.remove('loading')}); $$('form[data-busy]').forEach(function(f){delete f.dataset.busy}); } });

// Recover form (split mode only; same-origin uses the normal POST)
var rf=$('form[data-recover]');
if(rf&&SPLIT){ rf.addEventListener('submit',function(e){ e.preventDefault(); var b=$('button',rf), msg=$('#recover-msg'); b.classList.add('loading');
  var body=new URLSearchParams(); body.set('q',$('input',rf).value.trim());
  fetch(api('/api/recover'),{method:'POST',body:body}).then(function(r){return r.json()}).then(function(j){ if(j.order_id){location.href=orderHref(j.order_id);return}
    msg.textContent=j.error||'No order found.'; msg.hidden=false; b.classList.remove('loading'); })
  .catch(function(){ msg.textContent='Network error. Please try again.'; msg.hidden=false; b.classList.remove('loading') }); }); }

// Order status: long-poll (server waits up to ~25 s), pause when hidden, stop after 30 min.
function statusWatch(){
  var box=$('#status'); if(!box) return; var sec=box.closest('.order');
  var oid=box.getAttribute('data-oid'), st=$('#st'), title=$('#st-title'), btn=$('#recheck'), started=Date.now(), busy=false, stopped=false;
  function burst(){ if(REDUCED) return; var r=$('.radar',box); for(var i=0;i<14;i++){ var s=D.createElement('i'); s.className='spark'; s.style.setProperty('--a',(i*360/14)+'deg'); s.style.animationDelay=(i%3)*40+'ms'; r.appendChild(s); setTimeout(s.remove.bind(s),1400);} }
  function show(j){
    if(j.state==='paid'){ var was=box.classList.contains('is-paid');
      box.classList.remove('is-warn'); box.classList.add('is-paid'); if(sec) sec.setAttribute('data-state','paid'); title.textContent='Payment confirmed'; var h=$('.h-order'); if(h) h.textContent='Your Capo Playbook is ready';
      st.textContent='Payment verified on-chain. ';
      if(j.sig){ var tx=D.createElement('a'); tx.href='https://solscan.io/tx/'+encodeURIComponent(j.sig); tx.target='_blank'; tx.rel='noopener'; tx.textContent='View on Solscan ↗'; st.appendChild(tx);
        var rc=$('#rc-tx'); if(rc){ rc.innerHTML=''; var a2=tx.cloneNode(true); a2.textContent=j.sig.slice(0,8)+'… on Solscan ↗'; rc.appendChild(a2); } }
      track(4); progress('verified'); var q0=$('#quote'); if(q0) q0.hidden=true;
      var d=$('#dls'); $('#dl-pdf').href=api(j.downloads.pdf); $('#dl-prompts').href=api(j.downloads.prompts);
      if(j.expired){ $('#dl-note').textContent=j.message; $('#dl-pdf').hidden=true; $('#dl-prompts').hidden=true; }
      if(d.hidden){ d.hidden=false; d.classList.add('show'); }
      if(btn) btn.hidden=true; var t=$('#topup'); if(t) t.hidden=true;
      var q=$('#payblock'); if(q&&!was){ q.classList.add('collapse'); setTimeout(function(){q.hidden=true},600); burst(); }
      return true; }
    if(j.state==='late'||j.state==='expired'||j.state==='missing'){ box.classList.add('is-warn'); title.textContent=j.state==='late'?'Payment arrived late':'Order closed'; st.textContent=j.message; if(btn) btn.hidden=true; return true; }
    st.textContent=j.message; W.__capoGot=j.got||0; if(j.got>0) track(3);
    var tp=$('#topup'); if(tp){ if(j.topup_url){tp.hidden=false; tp.href=j.topup_url;} else tp.hidden=true; }
    return false;
  }
  function poll(wait){ if(busy||stopped) return; busy=true;
    fetch(api('/api/status/'+oid+(wait?'?wait=25':'')),{cache:'no-store',headers:HDR}).then(function(r){return r.json()}).then(function(j){ busy=false; if(show(j)){stopped=true;return}
      if(Date.now()-started>30*60*1000){ st.textContent=j.message+' Auto-refresh paused; tap "Check status" after you pay.'; return; }
      if(!D.hidden) setTimeout(function(){poll(true)},500); }).catch(function(){ busy=false; setTimeout(function(){poll(true)},15000); });
  }
  D.addEventListener('visibilitychange',function(){ if(!D.hidden&&!stopped&&!busy) poll(true); });
  W.__capoPoll=function(){ started=Date.now(); stopped=false; poll(false); };
  if(btn) btn.addEventListener('click',function(){ started=Date.now(); btn.classList.add('loading'); setTimeout(function(){btn.classList.remove('loading')},700); poll(false); });
  if(box.classList.contains('is-paid')) stopped=true; else poll(false);
}

// Static order page (split mode): load the server-rendered order fragment by id from the URL hash.
var root=$('#order-root');
if(root&&SPLIT){ var id=(location.hash||'').slice(1);
  var fail=function(msg){ root.style.minHeight=Math.min(root.offsetHeight,innerHeight)+'px'; root.removeAttribute('aria-busy'); root.innerHTML='<a class="back" href="./">← The Capo Playbook</a><div class="panel"><h1 class="h-order">Order not found</h1><p class="muted"></p><a class="btn btn-glass" href="recover.html">Find my order</a></div>'; $('p',root).textContent=msg; };
  if(!/^[A-Za-z0-9_-]{16,40}$/.test(id)) fail('This link is missing its order ID. Use Find my order with your transaction signature.');
  else fetch(api('/api/order/'+id),{headers:HDR,cache:'no-store'}).then(function(r){return r.json().then(function(j){ if(!r.ok||!j.html) throw new Error(j.error||'Order not found.'); return j })})
    .then(function(j){ var t=D.createElement('template'); t.innerHTML=j.html; var n=t.content.firstElementChild; root.replaceWith(n); wire(n); statusWatch(); })
    .catch(function(e){ fail(e.message+' If you paid, use Find my order with your transaction signature.') });
}

// ---------- Pro checkout: step tracker, quote countdown, connect-wallet pay ----------
function track(n){ $$('#track li').forEach(function(li){ var i=+li.getAttribute('data-step'); li.classList.toggle('done',i<n||n===4); li.classList.toggle('now',i===n&&n!==4); if(i===n) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current'); }); }
var PSTAGES=['sign','sent','confirmed','verified'];
function progress(stage){ var ol=$('#wp-prog'); if(!ol) return; ol.hidden=false; var k=PSTAGES.indexOf(stage);
  $$('li',ol).forEach(function(li,i){ li.classList.toggle('done',i<k||(stage==='verified')); li.classList.toggle('now',i===k&&stage!=='verified'); }); }
var walletLib=null, walletWait=[];
function loadWallet(){ return new Promise(function(ok,no){ if(walletLib) return ok(walletLib); walletWait.push([ok,no]); if(walletWait.length>1) return;
  var src=(($('script[src*="app.js"]')||{}).src||'static/app.js').replace('app.js','wallet.js'), sc=D.createElement('script'); sc.src=src; sc.async=true;
  var done=function(err){ var q=walletWait; walletWait=[]; q.forEach(function(p){ err?p[1](err):p[0](walletLib) }) };
  W.addEventListener('capopay:ready',function(){ walletLib=W.CapoPay; walletLib.setApi(API); done() },{once:true});
  sc.onerror=function(){ walletWait.length&&done(new Error('Could not load the wallet module. Check your connection and reload.')) }; D.head.appendChild(sc); }); }
function esc(t){ var d=D.createElement('div'); d.textContent=t; return d.innerHTML }
function checkout(root){
  var wp=$('#walletpay',root); if(!wp||wp.dataset.wired) return; wp.dataset.wired='1';
  var q1=$('#quote'); var order={asset:wp.dataset.asset,units:wp.dataset.units,amount:wp.dataset.amount,reference:wp.dataset.reference,recipient:wp.dataset.recipient,mint:wp.dataset.mint,expires:(+wp.dataset.expires&&q1)?Date.now()/1000+(+q1.getAttribute('data-left')):0,oid:wp.dataset.oid};
  var here=SPLIT?location.href.split('#')[0]+'#'+order.oid:location.href, ref=location.origin;
  var deep={Phantom:function(u,r){return 'https://phantom.app/ul/browse/'+encodeURIComponent(u)+'?ref='+encodeURIComponent(r)},Solflare:function(u,r){return 'https://solflare.com/ul/v1/browse/'+encodeURIComponent(u)+'?ref='+encodeURIComponent(r)}};
  $$('[data-wallet]',wp).forEach(function(a){ var f=deep[a.getAttribute('data-wallet')]; if(f) a.href=f(here,ref); });
  var btn=$('#wp-open',wp), msg=$('#wp-msg',wp), busy=false, inflight=false;
  function say(t,kind){ msg.hidden=!t; msg.className='note '+(kind||'warn'); msg.textContent=t||''; }
  // countdown + auto-refresh of an expired SOL quote
  var q=$('#quote');
  if(q){ var exp=Date.now()/1000+(+q.getAttribute('data-left')), total=Math.max(60,(+q.getAttribute('data-expires'))-(+q.getAttribute('data-created'))), lft=$('#qleft'), arc=$('.q-arc',q), refreshed=false;
    var tick=function(){ var left=Math.max(0,Math.round(exp-Date.now()/1000)); lft.textContent=Math.floor(left/60)+':'+('0'+left%60).slice(-2);
      if(arc) arc.style.strokeDasharray=(left/total*100).toFixed(2)+' 100'; q.classList.toggle('low',left<=120);
      if(left>0) return setTimeout(tick,1000);
      q.classList.add('over'); btn.disabled=true;
      if(inflight||W.__capoGot>0){ lft.textContent='0:00'; return; }
      q.innerHTML='<span><b>Quote expired.</b> Getting a fresh SOL price…</span>';
      if(refreshed||D.hidden){ q.innerHTML='<span><b>Quote expired.</b> </span><button class="btn btn-gold btn-sm" type="button">Get a fresh quote</button>'; $('button',q).onclick=requote; return; }
      refreshed=true; requote(); };
    var requote=function(){ var b=new URLSearchParams(); b.set('asset','SOL'); fetch(api('/api/order'),{method:'POST',body:b}).then(function(r){return r.json()}).then(function(j){ if(!j.order_id) throw new Error(j.error); toast('Fresh SOL quote ready'); location.href=orderHref(j.order_id); if(SPLIT) setTimeout(function(){location.reload()},50); })
      .catch(function(e){ q.innerHTML='<span><b>Quote expired.</b> '+esc((e&&e.message)||'Network error.')+'</span>' }); };
    tick(); }
  // preload the wallet module when idle so the click is instant
  (W.requestIdleCallback||function(f){setTimeout(f,1200)})(function(){ loadWallet().catch(function(){}) },{timeout:3000});
  btn.addEventListener('click',function(){ if(busy) return; busy=true; btn.classList.add('loading'); say('');
    loadWallet().then(function(L){ busy=false; btn.classList.remove('loading'); picker(L); },function(e){ busy=false; btn.classList.remove('loading'); say(e.message); }); });
  function picker(L){
    var ov=D.createElement('div'); ov.className='wp-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-labelledby','wp-h');
    ov.innerHTML='<div class="wp-card"><button class="wp-x" type="button" aria-label="Close">×</button><p class="eyebrow">Secure checkout</p><h3 id="wp-h">Connect a wallet</h3>'+
      '<p class="muted small">Pay <b>'+esc(order.amount+' '+order.asset)+'</b> to The Capo Playbook. You review and approve the exact amount in your wallet.</p><ul class="wp-list"></ul>'+
      '<p class="muted small wp-fine">This page never sees your keys or seed phrase. It prepares one standard transfer; only your wallet can sign it.</p></div>';
    var ul=$('.wp-list',ov), prev=D.activeElement;
    var render=function(){ ul.innerHTML=''; var found=L.listWallets(), names={};
      found.forEach(function(w){ names[w.name.toLowerCase()]=1; var li=D.createElement('li'), b=D.createElement('button'); b.type='button'; b.className='wp-item';
        b.innerHTML=(w.icon?'<img alt="" width="32" height="32" src="'+esc(w.icon)+'">':'<span class="wp-mono">'+esc(w.name[0])+'</span>')+'<span class="wp-n">'+esc(w.name)+'</span><em class="ok">Detected</em>';
        b.onclick=function(){ close(); go(L,w); }; li.appendChild(b); ul.appendChild(li); });
      L.knownWallets().forEach(function(k){ if(names[k.name.toLowerCase()]) return; var li=D.createElement('li'), a=D.createElement('a'); a.className='wp-item'; a.rel='noopener'; a.target='_blank';
        var mob=MOBILE&&k.browse; a.href=mob?k.browse(here,ref):k.install; if(mob) a.removeAttribute('target');
        a.innerHTML='<span class="wp-mono">'+esc(k.name[0])+'</span><span class="wp-n">'+esc(k.name)+'</span><em>'+(mob?'Open app':'Install')+'</em>'; li.appendChild(a); ul.appendChild(li); });
      if(!found.length){ var p=D.createElement('li'); p.className='muted small wp-none'; p.textContent=MOBILE?'No wallet in this browser. Tap a wallet to open this order inside its app, or use the QR / Solana Pay link.':'No wallet extension found. Install one, or scan the QR code with your phone wallet.'; ul.appendChild(p); } };
    var off=L.onWalletsChanged(render); render();
    var close=function(){ off&&off(); ov.remove(); D.removeEventListener('keydown',key); prev&&prev.focus&&prev.focus(); };
    var key=function(e){ if(e.key==='Escape') close(); if(e.key==='Tab'){ var f=$$('button,a',ov); if(!f.length) return; var i=f.indexOf(D.activeElement); if(e.shiftKey&&i<=0){f[f.length-1].focus();e.preventDefault()} else if(!e.shiftKey&&i===f.length-1){f[0].focus();e.preventDefault()} } };
    $('.wp-x',ov).onclick=close; ov.addEventListener('click',function(e){ if(e.target===ov) close() }); D.addEventListener('keydown',key);
    D.body.appendChild(ov); var first=$('.wp-item',ov)||$('.wp-x',ov); first.focus();
  }
  function go(L,w){ if(inflight) return; inflight=true; btn.disabled=true; btn.classList.add('loading'); say('');
    L.pay(order,w,function(stage,x){ if(stage==='sign'){ progress('sign'); say('Approve the payment in '+w.name+'…','info'); } })
    .then(function(r){ say(''); progress('sent'); track(3); btn.classList.remove('loading'); btn.textContent='Payment sent ✓';
      var tx=$('#st-tx'); if(tx){ tx.hidden=false; tx.innerHTML='Transaction: <a target="_blank" rel="noopener" href="https://solscan.io/tx/'+encodeURIComponent(r.sig)+'">'+esc(r.sig.slice(0,10))+'… on Solscan ↗</a>'; }
      toast('Payment submitted. Confirming on Solana…'); W.__capoPoll&&W.__capoPoll();
      var n=0, chk=function(){ L.confirmation(r.sig).then(function(c){ if(c.stage==='failed'){ say('The transaction failed on-chain, so nothing was taken. Try again.'); inflight=false; btn.disabled=false; btn.textContent='Try again'; return; }
        if(c.stage==='confirmed'||c.stage==='finalized'){ progress('confirmed'); W.__capoPoll&&W.__capoPoll(); return; } if(++n<60) setTimeout(chk,2000); },function(){ if(++n<60) setTimeout(chk,3000) }) }; chk(); W.__capoSig=r.sig; })
    .catch(function(e){ inflight=false; btn.disabled=false; btn.classList.remove('loading'); $('#wp-prog').hidden=true; say(e.message||'Payment failed.', e.code==='rejected'?'info':'warn');
      if(e.code==='quote'){ var qb=$('#quote button'); if(qb) qb.focus(); } }); }
}

wire(D); statusWatch();

// Nav state
var nav=$('.nav'); if(nav){ var onS=function(){ nav.classList.toggle('scrolled',W.scrollY>8) }; onS(); W.addEventListener('scroll',onS,{passive:true}); }

// Scroll reveals (content stays visible without JS / with reduced motion)
if('IntersectionObserver' in W && !REDUCED){
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target) } }) },{rootMargin:'0px 0px -8% 0px',threshold:.08});
  var vh=W.innerHeight; $$('.reveal').forEach(function(el){ if(el.getBoundingClientRect().top>vh*.92){ el.classList.add('pre'); io.observe(el) } });
}

// Card spotlight + mascot tilt / parallax (fine pointers only)
if(!REDUCED && mm('(hover: hover) and (pointer: fine)')){
  $$('.card').forEach(function(c){ c.addEventListener('pointermove',function(e){ var r=c.getBoundingClientRect(); c.style.setProperty('--mx',(e.clientX-r.left)+'px'); c.style.setProperty('--my',(e.clientY-r.top)+'px') }) });
  var art=$('[data-tilt]'); if(art){ var fr=$('.art-frame',art), raf=0;
    art.addEventListener('pointermove',function(e){ var r=art.getBoundingClientRect(), x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height; cancelAnimationFrame(raf);
      raf=requestAnimationFrame(function(){ fr.style.setProperty('--ry',((x-.5)*14).toFixed(2)+'deg'); fr.style.setProperty('--rx',((.5-y)*12).toFixed(2)+'deg'); fr.style.setProperty('--gx',(x*100)+'%'); fr.style.setProperty('--gy',(y*100)+'%'); }) });
    art.addEventListener('pointerleave',function(){ fr.style.setProperty('--rx','0deg'); fr.style.setProperty('--ry','0deg') });
    var par=function(){ var y=W.scrollY; if(y<900) art.style.setProperty('--py',(y*.08).toFixed(1)+'px') }; W.addEventListener('scroll',par,{passive:true}); }
}

// Hero video: wide screens only, not with reduced motion or Data Saver
var v=$('video.herovid');
if(v && mm('(min-width: 900px)') && !REDUCED && !SAVE){ var go=function(){ v.src=v.getAttribute('data-src'); v.muted=true; var p=v.play(); if(p&&p.catch)p.catch(function(){}) };
  if(D.readyState==='complete') setTimeout(go,300); else W.addEventListener('load',function(){setTimeout(go,300)}); }

// Matrix code rain: ~18 fps, paused off-screen / hidden tab, skipped for reduced motion and Data Saver
var cv=$('canvas.rain');
if(cv && cv.getContext && !REDUCED && !SAVE){
  var start=function(){
    var ctx=cv.getContext('2d'), cols=[], fs=16, w=0, h=0, vis=true, last=0, run=false;
    var CH='01ABCDEFGHJKLMNPQRSTUVWXYZ$#*+=<>◆'.split('');
    var size=function(){ var dpr=Math.min(W.devicePixelRatio||1,1.5); w=cv.clientWidth; h=cv.clientHeight; cv.width=w*dpr; cv.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
      var n=Math.ceil(w/fs); cols=[]; for(var i=0;i<n;i++) cols.push(Math.random()*-h/fs); ctx.font='600 '+(fs-2)+'px ui-monospace,Menlo,monospace'; };
    var frame=function(t){ if(!run) return; requestAnimationFrame(frame); if(t-last<55) return; last=t;
      ctx.fillStyle='rgba(5,6,5,.14)'; ctx.fillRect(0,0,w,h);
      for(var i=0;i<cols.length;i++){ var y=cols[i]*fs, c=CH[(Math.random()*CH.length)|0];
        ctx.fillStyle=c==='◆'?'#d4af37':(Math.random()>.94?'#c8ffd9':'#3ddc84'); ctx.fillText(c,i*fs,y);
        cols[i]= y>h&&Math.random()>.975 ? 0 : cols[i]+1; } };
    var set=function(){ var on=vis&&!D.hidden; if(on&&!run){run=true;requestAnimationFrame(frame)} else if(!on) run=false; };
    size(); var rt; W.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(size,200)});
    new IntersectionObserver(function(es){vis=es[0].isIntersecting;set()}).observe(cv); D.addEventListener('visibilitychange',set); set();
  };
  (W.requestIdleCallback||function(f){setTimeout(f,600)})(start,{timeout:1500});
}
})();
/* mobile menu (<details>): close on link tap, Escape, or tap outside. Works without this script too. */
(function () {
  var m = document.querySelector("details.menu"); if (!m) return;
  m.addEventListener("click", function (e) { if (e.target.closest(".menu-panel a")) m.open = false; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && m.open) { m.open = false; m.querySelector("summary").focus(); } });
  document.addEventListener("click", function (e) { if (m.open && !m.contains(e.target)) m.open = false; });
})();
