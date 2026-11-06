// The Capo Playbook: motion layer. Pure enhancement: no content depends on it, nothing here touches payment logic.
// Off for prefers-reduced-motion. Every feature is isolated so one failure can't break another (or the page).
(function(){
'use strict';
var D=document, W=window, R=D.documentElement;
var mm=function(q){ return !!(W.matchMedia&&W.matchMedia(q).matches) };
if(mm('(prefers-reduced-motion: reduce)')) return;
var SAVE=!!(navigator.connection&&navigator.connection.saveData);
var FINE=mm('(hover: hover) and (pointer: fine)');
var SMALL=mm('(max-width: 760px)');
var LOW=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;
var ORDER=R.classList.contains('pg-order');
function $(s,r){ return (r||D).querySelector(s) } function $$(s,r){ return Array.prototype.slice.call((r||D).querySelectorAll(s)) }
function safe(f){ try{ f() }catch(e){ if(W.console) console.warn('fx:',e&&e.message) } }
var idle=W.requestIdleCallback||function(f){ return setTimeout(f,400) };
function afterLoad(f,delay){ var go=function(){ setTimeout(function(){ idle(f,{timeout:2000}) },delay||0) }; if(D.readyState==='complete') go(); else W.addEventListener('load',go) }
R.classList.add('fx');

// ---------- scroll bus: one rAF per frame for every scroll-linked effect ----------
var subs=[], ticking=false, sy=W.scrollY;
function onScroll(f){ subs.push(f); f(sy) }
W.addEventListener('scroll',function(){ sy=W.scrollY; if(ticking) return; ticking=true; requestAnimationFrame(function(){ ticking=false; for(var i=0;i<subs.length;i++) subs[i](sy) }) },{passive:true});

// ---------- scroll progress bar ----------
safe(function(){
  var b=D.createElement('div'); b.className='fx-progress'; b.setAttribute('aria-hidden','true'); D.body.appendChild(b);
  if(W.CSS&&CSS.supports&&CSS.supports('animation-timeline: scroll()')){ b.classList.add('native'); return }
  var max=1, size=function(){ max=Math.max(1,R.scrollHeight-W.innerHeight) }; size(); W.addEventListener('resize',size);
  onScroll(function(y){ b.style.transform='scaleX('+Math.min(1,y/max).toFixed(4)+')' });
});

// ---------- ambient layers: aurora + film grain (CSS-animated, compositor only) ----------
safe(function(){
  var a=D.createElement('div'); a.className='fx-aurora'; a.setAttribute('aria-hidden','true'); a.innerHTML='<i></i><i></i><i></i>';
  D.body.insertBefore(a,D.body.firstChild);
  if(!SMALL&&!LOW){ var g=D.createElement('div'); g.className='fx-grain'; g.setAttribute('aria-hidden','true'); D.body.appendChild(g) }
});

// ---------- gold dust constellation (canvas, fixed behind content) ----------
safe(function(){
  if(SAVE) return; var cv=D.createElement('canvas'); if(!cv.getContext) return;
  cv.className='fx-dust'; cv.setAttribute('aria-hidden','true');
  afterLoad(function(){ safe(function(){
    D.body.insertBefore(cv,D.body.firstChild);
    var ctx=cv.getContext('2d'), w=0, h=0, dpr=1, P=[], run=false, last=0, mx=-9999, my=-9999;
    var N=ORDER?(SMALL?14:34):(SMALL||LOW?26:70), LINK=SMALL?90:130, STEP=SMALL?42:33;
    var size=function(){ dpr=Math.min(W.devicePixelRatio||1,SMALL?1.25:1.5); w=W.innerWidth; h=W.innerHeight; cv.width=w*dpr|0; cv.height=h*dpr|0; ctx.setTransform(dpr,0,0,dpr,0,0) };
    size(); for(var i=0;i<N;i++) P.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.22,vy:-(Math.random()*.25+.05),r:Math.random()*1.6+.5,t:Math.random()*6.28,g:Math.random()>.18});
    var py=sy; onScroll(function(y){ var d=y-py; py=y; for(var i=0;i<P.length;i++) P[i].y-=d*(.08+P[i].r*.06) });
    if(FINE) W.addEventListener('pointermove',function(e){ mx=e.clientX; my=e.clientY },{passive:true});
    var frame=function(t){ if(!run) return; requestAnimationFrame(frame); if(t-last<STEP) return; last=t;
      ctx.clearRect(0,0,w,h);
      for(var i=0;i<P.length;i++){ var p=P[i]; p.x+=p.vx; p.y+=p.vy; p.t+=.03;
        var dx=p.x-mx, dy=p.y-my, d2=dx*dx+dy*dy; if(d2<14400){ var f=(14400-d2)/14400*.9; p.x+=dx*f*.04; p.y+=dy*f*.04 }
        if(p.y<-10){p.y=h+10;p.x=Math.random()*w} else if(p.y>h+10){p.y=-10;p.x=Math.random()*w}
        if(p.x<-10)p.x=w+10; else if(p.x>w+10)p.x=-10;
        var a=.35+Math.sin(p.t)*.25; ctx.fillStyle=p.g?'rgba(242,210,122,'+a.toFixed(3)+')':'rgba(61,220,132,'+(a*.8).toFixed(3)+')';
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill(); }
      ctx.lineWidth=.6;
      for(var i=0;i<P.length;i++) for(var j=i+1;j<P.length;j++){ var a2=P[i],b=P[j],ex=a2.x-b.x,ey=a2.y-b.y,dd=ex*ex+ey*ey; if(dd<LINK*LINK){
        ctx.strokeStyle='rgba(212,175,55,'+((1-Math.sqrt(dd)/LINK)*.16).toFixed(3)+')'; ctx.beginPath(); ctx.moveTo(a2.x,a2.y); ctx.lineTo(b.x,b.y); ctx.stroke(); } } };
    var set=function(){ var on=!D.hidden; if(on&&!run){ run=true; requestAnimationFrame(frame) } else if(!on) run=false };
    var rt; W.addEventListener('resize',function(){ clearTimeout(rt); rt=setTimeout(size,200) });
    D.addEventListener('visibilitychange',set); set(); cv.classList.add('on');
  }) },SMALL?1200:200);
});

// ---------- cursor glow + ring (desktop only; native cursor stays) ----------
safe(function(){
  if(!FINE) return;
  var g=D.createElement('div'); g.className='fx-glow'; g.setAttribute('aria-hidden','true');
  var r=D.createElement('div'); r.className='fx-ring'; r.setAttribute('aria-hidden','true');
  D.body.appendChild(g); D.body.appendChild(r);
  var tx=W.innerWidth/2, ty=W.innerHeight/3, gx=tx, gy=ty, rx=tx, ry=ty, moving=false, seen=false;
  var loop=function(){ gx+=(tx-gx)*.12; gy+=(ty-gy)*.12; rx+=(tx-rx)*.3; ry+=(ty-ry)*.3;
    g.style.transform='translate3d('+(gx-260)+'px,'+(gy-260)+'px,0)'; r.style.transform='translate3d('+(rx-18)+'px,'+(ry-18)+'px,0)';
    if(Math.abs(tx-gx)+Math.abs(ty-gy)>.4) requestAnimationFrame(loop); else moving=false; };
  W.addEventListener('pointermove',function(e){ tx=e.clientX; ty=e.clientY; if(!seen){ seen=true; R.classList.add('fx-cur') }
    var hot=e.target.closest&&e.target.closest('a,button,summary,[data-copy],input,.card,.plan');
    r.classList.toggle('hot',!!(hot&&hot.matches('a,button,summary,[data-copy],input'))); if(!moving){ moving=true; requestAnimationFrame(loop) } },{passive:true});
  D.addEventListener('pointerleave',function(){ R.classList.remove('fx-cur'); seen=false });
  W.addEventListener('pointerdown',function(){ r.classList.add('down') }); W.addEventListener('pointerup',function(){ r.classList.remove('down') });
});

// ---------- headline: per-letter entrance + liquid-gold wave (accessible: real text kept for screen readers) ----------
function splitLetters(el,cls,base){
  var txt=el.textContent; if(!txt||el.getAttribute('data-split')) return 0; el.setAttribute('data-split','1');
  var gold=el.classList.contains('gold-text'); if(gold) el.classList.remove('gold-text');
  var sr=D.createElement('span'); sr.className='sr'; sr.textContent=txt;
  var vis=D.createElement('span'); vis.setAttribute('aria-hidden','true'); vis.className='fx-split';
  var n=0; txt.split('').forEach(function(c){ var s=D.createElement('span'); s.className=cls+(gold?' gold-text':''); s.textContent=c===' '?'\u00a0':c; s.style.setProperty('--c',base+n); vis.appendChild(s); n++ });
  el.textContent=''; el.appendChild(sr); el.appendChild(vis); return n;
}
safe(function(){
  var h=$('.hero .display'); if(!h) return; var n=0;
  $$('.ln>span',h).forEach(function(s){ n+=splitLetters(s,'ch',n)+2 });
  h.classList.add('fx-on');
});

// ---------- section headings: word-by-word rise when their block reveals ----------
safe(function(){
  if(ORDER) return;
  $$('.sec-head h2').forEach(function(h){
    var k=0, walk=function(node,gold){
      Array.prototype.slice.call(node.childNodes).forEach(function(c){
        if(c.nodeType===3){ var parts=c.textContent.split(/(\s+)/), frag=D.createDocumentFragment();
          parts.forEach(function(p){ if(!p) return; if(/^\s+$/.test(p)){ frag.appendChild(D.createTextNode(p)); return }
            var w=D.createElement('span'); w.className='w'+(gold?' gold-text':''); w.textContent=p; w.style.setProperty('--wi',k++); frag.appendChild(w) });
          c.parentNode.replaceChild(frag,c);
        } else if(c.nodeType===1){ var g=c.classList.contains('gold-text'); if(g) c.classList.remove('gold-text'); walk(c,gold||g) }
      }) };
    walk(h,false); h.classList.add('fx-words');
  });
});

// ---------- eyebrow decrypt (letters scramble then resolve to the real text) ----------
var GLY='ABCDEFGHJKLMNPQRSTUVWXYZ0123456789$◆#';
// Size is locked and layout contained while scrambling, so nothing else on the page reflows or shifts.
function decrypt(el){ if(el.__dec||el.closest('.hero')||el.children.length) return; el.__dec=1; var fin=el.textContent, t0=0, lt=0, dur=Math.min(1000,260+fin.length*20);
  var r=el.getBoundingClientRect(); el.style.height=r.height+'px'; el.style.contain='strict'; el.style.overflow='hidden';
  el.setAttribute('aria-label',fin);
  var done=function(){ el.textContent=fin; el.removeAttribute('aria-label'); el.style.height=''; el.style.contain=''; el.style.overflow='' };
  var step=function(t){ if(!t0) t0=t; var p=Math.min(1,(t-t0)/dur); if(p>=1) return done(); requestAnimationFrame(step); if(t-lt<45) return; lt=t;
    var keep=Math.floor(p*fin.length), out='';
    for(var i=0;i<fin.length;i++){ var c=fin.charAt(i); out+= i<keep||c===' '||c==='·'?c:GLY.charAt((Math.random()*GLY.length)|0) }
    el.textContent=out; };
  requestAnimationFrame(step); }

// ---------- animated counters for the numbers already on the page (final text is the original, verbatim) ----------
function countUp(el){ if(el.__cnt) return; el.__cnt=1; var fin=el.textContent, nums=[], re=/\d+(?:\.\d+)?/g, m;
  while((m=re.exec(fin))) nums.push({s:m.index,l:m[0].length,v:parseFloat(m[0]),d:(m[0].split('.')[1]||'').length});
  if(!nums.length) return; var t0=0, dur=1500;
  var ease=function(x){ return x===1?1:1-Math.pow(2,-10*x) };
  var step=function(t){ if(!t0) t0=t; var p=Math.min(1,(t-t0)/dur), e=ease(p), out='', at=0;
    nums.forEach(function(n){ out+=fin.slice(at,n.s)+(n.v*e).toFixed(n.d); at=n.s+n.l }); out+=fin.slice(at);
    el.textContent=p<1?out:fin; if(p<1) requestAnimationFrame(step); };
  el.setAttribute('aria-label',fin); requestAnimationFrame(step); }

// ---------- one observer for section-level entrances ----------
safe(function(){
  if(!('IntersectionObserver' in W)) return;
  var targets=$$('.sec, .marquee, .eyebrow, .stat .big, .cmp tbody, .steps, .ticks, .foot');
  var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(!e.isIntersecting) return; var t=e.target; io.unobserve(t);
    if(t.classList.contains('eyebrow')) { if(!ORDER) decrypt(t) }
    else if(t.classList.contains('big')) countUp(t);
    else t.classList.add('fx-in'); }) },{rootMargin:'0px 0px -10% 0px',threshold:.12});
  var vh=W.innerHeight;
  targets.forEach(function(t){ var top=t.getBoundingClientRect().top;
    if(top<vh*.9 && !t.classList.contains('big') && !t.classList.contains('eyebrow')){ t.classList.add('fx-in','fx-now') } else { if(!t.classList.contains('big')&&!t.classList.contains('eyebrow')) t.classList.add('fx-wait'); io.observe(t) } });
  // failsafe: anything still waiting once it's on screen (or after scrolling past) gets shown
  var sweep=function(){ var vh2=W.innerHeight; $$('.fx-wait:not(.fx-in), .reveal.pre:not(.in)').forEach(function(t){ var r=t.getBoundingClientRect(); if(r.top<vh2&&r.bottom>-vh2*4){ t.classList.add(t.classList.contains('reveal')?'in':'fx-in') } }) };
  var st; onScroll(function(){ clearTimeout(st); st=setTimeout(sweep,500) }); setTimeout(sweep,3000);
});

// ---------- hero parallax layers ----------
safe(function(){
  var hero=$('.hero'); if(!hero) return; var copy=$('.hero-copy',hero), rain=$('.rain',hero), ta=$('.tag-a',hero), tb=$('.tag-b',hero);
  var hh=hero.offsetHeight||800;
  onScroll(function(y){ if(y>hh*1.2) return; var k=y;
    if(rain) rain.style.transform='translate3d(0,'+(k*.35).toFixed(1)+'px,0)';
    if(copy&&!SMALL) copy.style.transform='translate3d(0,'+(k*-.06).toFixed(1)+'px,0)';
    if(ta) ta.style.translate='0 '+(k*-.12).toFixed(1)+'px'; if(tb) tb.style.translate='0 '+(k*.1).toFixed(1)+'px';
  });
});

// ---------- 3D tilt + spotlight on cards, stats, plans (desktop) ----------
safe(function(){
  if(!FINE) return; var SEL='.card,.stat,.plan,.who-c,.callout,.band,.panel';
  var cur=null, raf=0, ev=null;
  var apply=function(){ raf=0; if(!cur||!ev) return; var r=cur.getBoundingClientRect(), x=(ev.clientX-r.left)/r.width, y=(ev.clientY-r.top)/r.height;
    var amt=cur.matches('.panel')?0:cur.matches('.plan')?2.2:cur.matches('.callout,.band')?1.6:6;
    cur.style.setProperty('--tx',((x-.5)*amt*2).toFixed(2)+'deg'); cur.style.setProperty('--ty',((.5-y)*amt*2).toFixed(2)+'deg');
    cur.style.setProperty('--mx',(x*r.width).toFixed(0)+'px'); cur.style.setProperty('--my',(y*r.height).toFixed(0)+'px'); };
  D.addEventListener('pointermove',function(e){ var t=e.target.closest&&e.target.closest(SEL);
    if(t&&ORDER&&!t.matches('.panel')) t=null;
    if(t!==cur){ if(cur){ cur.classList.remove('fx-tilt-on'); cur.style.setProperty('--tx','0deg'); cur.style.setProperty('--ty','0deg') } cur=t; if(cur){ cur.classList.add('fx-tilt','fx-tilt-on') } }
    ev=e; if(cur&&!raf) raf=requestAnimationFrame(apply) },{passive:true});
});

// ---------- magnetic buttons (landing, desktop) + click ripple (everywhere) ----------
safe(function(){
  if(FINE && !ORDER){ $$('.btn').forEach(function(b){
    b.addEventListener('pointermove',function(e){ var r=b.getBoundingClientRect(), x=e.clientX-r.left-r.width/2, y=e.clientY-r.top-r.height/2;
      b.style.setProperty('--bx',(x*.18).toFixed(1)+'px'); b.style.setProperty('--by',(y*.3).toFixed(1)+'px'); b.classList.add('fx-mag');
      b.style.setProperty('--px',(e.clientX-r.left)+'px'); b.style.setProperty('--py2',(e.clientY-r.top)+'px') });
    b.addEventListener('pointerleave',function(){ b.style.setProperty('--bx','0px'); b.style.setProperty('--by','0px'); b.classList.remove('fx-mag') }); }); }
  D.addEventListener('pointerdown',function(e){ var b=e.target.closest&&e.target.closest('.btn,.wp-item'); if(!b||b.classList.contains('loading')) return;
    var r=b.getBoundingClientRect(), s=D.createElement('span'), d=Math.max(r.width,r.height)*2.2; s.className='fx-ripple'; s.setAttribute('aria-hidden','true');
    s.style.cssText='width:'+d+'px;height:'+d+'px;left:'+(e.clientX-r.left-d/2)+'px;top:'+(e.clientY-r.top-d/2)+'px';
    b.appendChild(s); setTimeout(function(){ s.remove() },700); },{passive:true});
});

// ---------- marquee: skews with scroll velocity, settles when you stop ----------
safe(function(){
  var rows=$$('.mq-row'); if(!rows.length) return; var last=sy, dec=0;
  onScroll(function(y){ var v=Math.max(-8,Math.min(8,(y-last)/6)); last=y; rows.forEach(function(r,i){ r.style.transform='skewX('+(i?v:-v).toFixed(2)+'deg)' });
    clearTimeout(dec); dec=setTimeout(function(){ rows.forEach(function(r){ r.style.transform='' }) },140) });
});

// ---------- success: gold confetti when the order flips to paid (observes the status panel; read-only) ----------
function confetti(){
  if(SAVE) return; var cv=D.createElement('canvas'); if(!cv.getContext) return; cv.className='fx-confetti'; cv.setAttribute('aria-hidden','true'); D.body.appendChild(cv);
  var ctx=cv.getContext('2d'), w=cv.width=W.innerWidth, h=cv.height=W.innerHeight, C=['#f2d27a','#d4af37','#fff3c8','#3ddc84','#b8901f'], P=[], n=SMALL?90:170, t0=0;
  var st=$('#status'), o=st?st.getBoundingClientRect():{left:w/2,top:h/3,width:0,height:0}, ox=o.left+o.width/2, oy=Math.max(40,o.top+70);
  for(var i=0;i<n;i++){ var a=Math.random()*Math.PI*2, sp=Math.random()*9+4; P.push({x:ox,y:oy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-6,w:Math.random()*7+4,h:Math.random()*4+3,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:C[i%C.length]}) }
  var fr=function(t){ if(!t0) t0=t; var e=t-t0; ctx.clearRect(0,0,w,h);
    P.forEach(function(p){ p.vy+=.28; p.vx*=.985; p.vy*=.985; p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.globalAlpha=Math.max(0,1-e/2600); ctx.fillStyle=p.c; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h*Math.abs(Math.cos(p.r*2))+1); ctx.restore() });
    if(e<2700) requestAnimationFrame(fr); else cv.remove(); };
  requestAnimationFrame(fr);
}
safe(function(){
  if(!ORDER) return; var fired=false;
  var check=function(){ var st=$('#status'); if(!st||fired) return; if(st.classList.contains('is-paid')){ fired=true; var k='fx-paid-'+(st.getAttribute('data-oid')||'');
      var seen=false; try{ seen=sessionStorage.getItem(k) }catch(e){} if(!seen){ try{ sessionStorage.setItem(k,'1') }catch(e){} setTimeout(confetti,350) } } };
  new MutationObserver(check).observe(D.body,{subtree:true,attributes:true,attributeFilter:['class'],childList:true}); check();
});
})();
