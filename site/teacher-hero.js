// Teacher? Parent? page art (ChatGPT scenes, drawn by /scuba/*.js). Decorative: aria-hidden or labelled figures, no clicks, no sound.
//  1. the top: Bruce bobs beside Steve (BruceFacts.idle)
//  2. "This is Steve": Scuba Steve upright, holding up his papers, fins moving slowly (SteveBSwim rig)
//  3. "This is Bruce": a realistic shark eats a mushroom, turns into the cartoon hallucination shark, and leaves a made-up BAD FACT (HallucinationOrigin)
// It plays only while the page is open and showing; Pause motion (html.wb-motion-off) and reduced motion show still pictures. No inline scripts or styles.
(function () {
  'use strict';
  var svg = document.getElementById('bsvg'), stsvg = document.getElementById('stsvg'), ssvg = document.getElementById('ssvg'), stage = document.getElementById('stage'), puff = document.getElementById('puff'), fact = document.getElementById('fact');
  if (!svg || !stsvg || !ssvg || !stage) return;
  var A, reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t = reduce ? 2 : 0, st = 0, visible = false, started = false, last = 0, raf = 0;
  var P0 = 10.0, PG = .9, PF = .35, NOTE_SINK = 6.0, NOTE_END = P0 + PG + NOTE_SINK + .8, LOOP = NOTE_END + 1.4;
  var SHARK = '/art/realistic-shark-web.png?v=1', STEVEB = '/art/steve-b.png?v=1';
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function still() { return reduce || A.off(); }
  function drawSteve() {
    var k = still() ? 0 : t * .35, rise = still() ? 0 : Math.sin(t * .9) * 1.5;
    stsvg.innerHTML = '<g transform="translate(160 ' + (245 + rise) + ') rotate(90) scale(.112) translate(-887 -443.5)">' + SteveBSwim.rig(k, STEVEB, 'thst-') + '</g>';
  }
  function drawTop() { svg.innerHTML = A.pre(A.inner(BruceFacts.idle(still() ? 2 : t)), 'thb-'); }
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
  function draw() { drawTop(); drawSteve(); drawStage(); }
  function frame(ts) {
    raf = 0;
    if (document.hidden || still()) return;
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
    A.load(['/scuba/revision-scenes.js?v=1', '/scuba/more-coming.js?v=1', '/scuba/bruce-scene.js?v=1', '/scuba/facts-scene.js?v=1', '/scuba/origin-scene.js?v=1', '/scuba/steve-swim-rig.js?v=1'], function () {
      if (window.BruceFacts && window.HallucinationOrigin && window.SteveBSwim) go();
    });
  }
  var s = document.createElement('script'); s.src = '/scuba/scuba.js?v=1'; s.onload = boot; document.head.appendChild(s);
})();
