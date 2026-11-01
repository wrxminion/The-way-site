// Teacher? Parent? page art (ChatGPT scenes, drawn by /scuba/*.js). Decorative: aria-hidden or labelled figures, no clicks, no sound.
//  1. the top: Bruce (left) bobs by himself; Scuba Steve (right) swims and drops fact papers that sink and fade
//  2. "This is Steve": a still close-up of Scuba Steve holding up his papers (a picture in the page, nothing to run)
//  3. "This is Bruce": a realistic shark eats a mushroom, turns into the cartoon hallucination shark, and leaves a made-up BAD FACT (HallucinationOrigin)
// It plays only while the page is open and showing; Pause motion (html.wb-motion-off) and reduced motion show still pictures. No inline scripts or styles.
(function () {
  'use strict';
  var svg = document.getElementById('bsvg'), drops = document.getElementById('drops'), ssvg = document.getElementById('ssvg'), stage = document.getElementById('stage'), puff = document.getElementById('puff'), fact = document.getElementById('fact');
  if (!svg || !ssvg || !stage) return;
  var A, reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t = reduce ? 2 : 0, st = 0, visible = false, started = false, last = 0, raf = 0;
  var P0 = 10.0, PG = .9, PF = .35, NOTE_SINK = 6.0, NOTE_END = P0 + PG + NOTE_SINK + .8, LOOP = NOTE_END + 1.4;
  var SHARK = '/art/realistic-shark-web.png?v=1';
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function still() { return reduce || A.off(); }
  // Bruce alone (no papers around him), bobbing a little
  function drawTop() { var tt = still() ? 2 : t, bob = still() ? 0 : Math.sin(tt * 1.6) * 5; svg.innerHTML = A.pre('<g transform="translate(0 ' + bob.toFixed(2) + ')">' + BruceTextGulp.bruce(tt, .08 + .1 * Math.pow(Math.sin(tt * 3), 2)) + '</g>', 'thb-'); }
  // Steve drops a paper every few seconds: it sinks, sways, and fades. Still pictures of two papers when motion is off.
  var dropT = 0, live = [];
  function clearDrops() { live.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } }); live = []; while (drops.firstChild) drops.removeChild(drops.firstChild); }
  function dropOne() {
    if (live.length >= 3) return;
    var im = document.createElement('img'); im.className = 'tp-paper'; im.alt = ''; im.src = '/art/steve-file.webp?v=1'; im.width = 116; im.height = 145; im.draggable = false; drops.appendChild(im);
    var x = (Math.random() - .5) * 20, h = Math.max(70, Math.round(drops.clientHeight * 1.1));
    var a = im.animate([{ transform: 'translate(0,0) rotate(-14deg)', opacity: 0 }, { opacity: 1, offset: .08 }, { transform: 'translate(' + (x - 14) + 'px,' + h * .5 + 'px) rotate(12deg)', opacity: 1, offset: .5 }, { transform: 'translate(' + (x + 10) + 'px,' + h + 'px) rotate(-8deg)', opacity: 0 }], { duration: 6500, easing: 'ease-in-out', fill: 'forwards' });
    live.push(a); a.onfinish = function () { im.remove(); live = live.filter(function (q) { return q !== a; }); };
  }
  function stillDrops() { clearDrops(); [[40, 74, -10], [58, 92, 8]].forEach(function (p) { var im = document.createElement('img'); im.className = 'tp-paper still'; im.alt = ''; im.src = '/art/steve-file.webp?v=1'; im.draggable = false; im.style.left = p[0] + '%'; im.style.top = p[1] + '%'; im.style.transform = 'rotate(' + p[2] + 'deg)'; drops.appendChild(im); }); }
  function drawStage() {
    var tt = still() ? 9 : st;
    ssvg.innerHTML = A.pre(A.inner(HallucinationOrigin.scene(tt, SHARK)), 'tho-');
    var pu = 0, ps = 1, px = 0, py = 0, fo = 0, fy = 0, fs = 1;
    if (still()) { fo = 1; }
    else if (tt >= P0) {
      var a = (tt - P0) / PG;
      if (a < 1) { pu = Math.min(1, a / .35); ps = .2 + .8 * ease(a / .35); px = 8 * ease(a / .35) + 6 * ease((a - .35) / .65); py = 10 * ease(a / .35) + 12 * ease((a - .35) / .65); ps *= 1 + .15 * ease((a - .35) / .65); }
      else { var b = (tt - P0 - PG) / PF; if (b < 1) { pu = 1 - ease(b); ps = 1.15 + .75 * ease(b); } else pu = 0; px = 14; py = 22; }
      var n = tt - P0 - PG;
      if (n >= 0 && n < NOTE_SINK + .8) { var q = Math.min(1, n / NOTE_SINK); fo = n < .15 ? n / .15 : (n > NOTE_SINK ? 1 - (n - NOTE_SINK) / .8 : 1); fs = n < .15 ? .4 + .68 * (n / .15) : (n < .25 ? 1.08 - .08 * ((n - .15) / .1) : 1); fy = 4 + 42 * q; }
    }
    puff.style.opacity = pu; puff.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + ps + ')';
    fact.style.opacity = fo; fact.style.transform = 'translate(-50%,0) translateY(' + fy + 'px) scale(' + fs + ')';
  }
  function draw() { drawTop(); drawStage(); if (still()) { if (!drops.querySelector('.still')) stillDrops(); } else { if (drops.querySelector('.still')) clearDrops(); } }
  function frame(ts) {
    raf = 0;
    if (document.hidden || still()) return;
    if (ts - dropT > 2600) { dropT = ts; dropOne(); }
    var dt = last ? Math.min((ts - last) / 1000, .1) : 0; last = ts; t += dt;
    if (visible) { st += dt; if (st >= LOOP) st = 0; }
    draw(); raf = requestAnimationFrame(frame);
  }
  function start() { last = 0; if (!raf && !document.hidden && !still()) raf = requestAnimationFrame(frame); }
  function go() {
    draw(); start();
    document.addEventListener('visibilitychange', start);
    new MutationObserver(function () { draw(); start(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !started) { started = true; st = 0; } visible = e.isIntersecting; }); }, { threshold: .5 }).observe(stage); else visible = true;
  }
  function boot() {
    A = window.ScubaArt;
    A.load(['/scuba/revision-scenes.js?v=1', '/scuba/more-coming.js?v=1', '/scuba/bruce-scene.js?v=1', '/scuba/origin-scene.js?v=1'], function () {
      if (window.BruceTextGulp && window.HallucinationOrigin) go();
    });
  }
  var s = document.createElement('script'); s.src = '/scuba/scuba.js?v=1'; s.onload = boot; document.head.appendChild(s);
})();
