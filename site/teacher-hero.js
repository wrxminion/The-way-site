// Teacher? Parent? page art (ChatGPT scenes, drawn by /scuba/*.js). Decorative: aria-hidden or labelled figures, no clicks, no sound.
//  1. the top: Bruce (left) bobs and leaves BAD FACTS (ChatGPT's poop art, then a labeled made-up fact note); Scuba Steve (right) just swims, he drops nothing
//  2. "This is Steve": the still close-up of Scuba Steve. A fact paper drops from his hand and turns into a bubble that holds a TRUE fact with a named source link (list: steve-facts.js, window.WaySteveFacts)
//  3. "This is Bruce": a realistic shark eats a mushroom, turns into the cartoon hallucination shark, and leaves a made-up BAD FACT (HallucinationOrigin)
// It plays only while the page is open and showing; Pause motion (html.wb-motion-off) and reduced motion show still pictures. No inline scripts or styles.
(function () {
  'use strict';
  var svg = document.getElementById('bsvg'), hero = document.querySelector('.tp-hero'), bruceEl = document.getElementById('bruce'), bfx = document.getElementById('bfx'), sstage = document.getElementById('sstage'), simg = document.getElementById('simg'), sfx = document.getElementById('sfx'), ssvg = document.getElementById('ssvg'), stage = document.getElementById('stage'), puff = document.getElementById('puff'), fact = document.getElementById('fact');
  if (!svg || !ssvg || !stage) return;
  var A, reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var t = reduce ? 2 : 0, st = 0, visible = false, started = false, last = 0, raf = 0;
  var P0 = 10.0, PG = .9, PF = .35, NOTE_SINK = 6.0, NOTE_END = P0 + PG + NOTE_SINK + .8, LOOP = NOTE_END + 1.4;
  var SHARK = '/art/realistic-shark-web.png?v=1';
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function still() { return reduce || A.off(); }
  // Bruce alone (no papers around him), bobbing a little
  function drawTop() { var tt = still() ? 2 : t, bob = still() ? 0 : Math.sin(tt * 1.6) * 5; svg.innerHTML = A.pre('<g transform="translate(0 ' + bob.toFixed(2) + ')">' + BruceTextGulp.bruce(tt, .08 + .1 * Math.pow(Math.sin(tt * 3), 2)) + '</g>', 'thb-'); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }
  var live = [], timers = [], seq = 0, badSeq = 0, heroVis = false, stageVis = false, sbusy = false, bbusy = false;
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearFx() { timers.forEach(clearTimeout); timers = []; live.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } }); live = []; if (sfx) while (sfx.firstChild) sfx.removeChild(sfx.firstChild); if (bfx) while (bfx.firstChild) bfx.removeChild(bfx.firstChild); sbusy = bbusy = false; }
  // ---- Steve (still picture): a paper drops from his hand and turns into a bubble holding one TRUE fact with its source ----
  function facts() { return window.WaySteveFacts || []; }
  function pick(max) { var all = facts().filter(function (f) { return f.t.length <= max; }); if (!all.length) return null; return all[(seq++ + (seq === 1 ? Math.floor(Math.random() * all.length) : 0)) % all.length]; }
  function geo() {
    var W = sstage.clientWidth, iw = simg.offsetWidth, ih = simg.offsetHeight, il = simg.offsetLeft, roomL = il, roomR = W - il - iw;
    var bw = Math.max(130, Math.min(224, roomL - 6)), hx = il + .27 * iw, hy = .27 * ih;
    return { W: W, il: il, iw: iw, ih: ih, bw: bw, hx: hx, hy: hy, ok: roomL >= 136 };
  }
  function makeBubble(f, g) {
    var b = el('div', 'tp-bubble'); b.style.width = g.bw + 'px'; b.style.padding = '0 ' + Math.round(g.bw * .15) + 'px';
    b.appendChild(el('span', 'tp-bubble-l', 'True fact'));
    b.appendChild(el('span', '', f.t));
    var s2 = el('span', 'tp-bubble-s'); s2.appendChild(document.createTextNode('Source: '));
    var a = el('a'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = f.org; s2.appendChild(a); b.appendChild(s2);
    return b;
  }
  function stillBubble() {
    clearFx(); var g = geo(), f = pick(g.bw >= 200 ? 125 : 95); if (!f || !g.ok) return;
    var b = makeBubble(f, g); b.className += ' still'; b.style.left = Math.round(g.il - g.bw - 4) + 'px'; b.style.top = '40px'; sfx.appendChild(b);
  }
  function steveCycle() {
    if (sbusy || !sstage || !simg) return;
    var f0 = facts(); if (!f0.length) { loadFacts(); return later(steveCycle, 1500); }
    if (still() || document.hidden || !stageVis) return later(steveCycle, 2000);
    var g = geo(); if (!g.ok) return later(steveCycle, 4000);
    var f = pick(g.bw >= 200 ? 125 : 95); if (!f) return;
    sbusy = true;
    var px = g.hx - 14, py = g.hy + 90;
    var paper = el('img', 'tp-drop'); paper.alt = ''; paper.src = '/art/steve-file.webp?v=1'; paper.width = 116; paper.height = 145; paper.draggable = false; paper.style.left = Math.round(g.hx - 15) + 'px'; paper.style.top = Math.round(g.hy - 12) + 'px'; sfx.appendChild(paper);
    live.push(paper.animate([{ transform: 'translate(0,0) rotate(-14deg)', opacity: 0 }, { opacity: 1, offset: .12 }, { transform: 'translate(-14px,' + (py - g.hy) + 'px) rotate(12deg)', opacity: 1, offset: .75 }, { transform: 'translate(-14px,' + (py - g.hy + 6) + 'px) rotate(12deg) scale(.4)', opacity: 0 }], { duration: 1300, easing: 'ease-in', fill: 'forwards' }));
    var b = makeBubble(f, g), top0 = 70, bx = Math.round(g.il - g.bw - 4);
    b.style.left = bx + 'px'; b.style.top = top0 + 'px'; sfx.appendChild(b);
    var cx = bx + g.bw / 2, cy = top0 + g.bw / 2, dx = px + 15 - cx, dy = py + 20 - cy, sway = rnd(-8, 8);
    var ba = b.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.1)', opacity: 0, offset: 0 }, { opacity: 1, offset: .04 }, { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .1 }, { transform: 'translate(' + sway + 'px,-30px) scale(1)', opacity: 1, offset: .5 }, { transform: 'translate(' + (-sway) + 'px,-58px) scale(1)', opacity: 1, offset: .93 }, { transform: 'translate(' + (-sway) + 'px,-64px) scale(1.18)', opacity: 0, offset: 1 }], { duration: 13000, delay: 1000, easing: 'linear', fill: 'both' });
    live.push(ba);
    function hold(on) { if (ba.playState === 'finished') return; if (on) ba.pause(); else ba.play(); }
    b.addEventListener('mouseenter', function () { hold(true); }); b.addEventListener('mouseleave', function () { hold(false); });
    b.addEventListener('focusin', function () { hold(true); }); b.addEventListener('focusout', function () { hold(false); });
    ba.onfinish = function () { b.remove(); paper.remove(); sbusy = false; later(steveCycle, 1500); };
  }
  function loadFacts() { if (!document.querySelector('script[src^="/steve-facts.js"]')) { var q = document.createElement('script'); q.src = '/steve-facts.js?v=1'; document.head.appendChild(q); } }
  // ---- Bruce (top): the poop art leaves a bubble that pops into a labeled BAD FACT (made up, never a claim) ----
  var BAD_FALLBACK = ['Sharks invented the handshake.', 'The moon is made of old library cards.', 'Clouds are just sky sheep.'];
  function badFact() { var l = (window.WayShark && window.WayShark.badFacts) || BAD_FALLBACK; return l[(badSeq++ + (badSeq === 1 ? Math.floor(Math.random() * l.length) : 0)) % l.length]; }
  function noteEl(txt) { var n = el('div', 'tp-bad'); n.appendChild(el('span', 'tp-bad-l', 'Bad fact')); n.appendChild(el('span', '', txt)); return n; }
  function bGeo() {
    var hr = hero.getBoundingClientRect(), sr = bruceEl.getBoundingClientRect(), ps = Math.round(Math.max(44, Math.min(78, sr.width * .24)));
    return { hw: hr.width, ps: ps, x: sr.left - hr.left + sr.width * .86, y: sr.top - hr.top + sr.height * .42, bottom: sr.bottom - hr.top + 8 };
  }
  function placeNote(n, g) { var w = n.offsetWidth; n.style.left = Math.round(Math.max(0, Math.min(g.hw - w, g.x - w / 2))) + 'px'; n.style.top = Math.round(g.bottom) + 'px'; }
  function stillNote() { var g = bGeo(), n = noteEl(badFact()); n.className += ' still'; bfx.appendChild(n); placeNote(n, g); }
  function badCycle() {
    if (bbusy || !hero || !bruceEl) return;
    if (still() || document.hidden || !heroVis) return later(badCycle, 2000);
    bbusy = true;
    var g = bGeo(), pf = el('div', 'tp-poop'), im = el('img'); im.alt = ''; im.width = 480; im.height = 480; im.draggable = false; im.src = '/art/hallucination-poop.webp?v=1'; pf.appendChild(im);
    pf.style.width = pf.style.height = g.ps + 'px'; pf.style.left = Math.round(g.x - g.ps / 2) + 'px'; pf.style.top = Math.round(g.y) + 'px'; bfx.appendChild(pf);
    live.push(pf.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(10px,16px)' }], { duration: 5650, fill: 'forwards', easing: 'ease-out' }));
    later(function () { im.src = '/art/bad-fact-bubble.webp?v=1'; }, 5600);
    later(function () {
      pf.remove();
      var n = noteEl(badFact()); n.style.visibility = 'hidden'; bfx.appendChild(n); placeNote(n, g); n.style.visibility = '';
      var sink = g.hw < 420 ? 14 : 16;
      var na = n.animate([{ opacity: 0, transform: 'translateY(0) scale(.4)' }, { opacity: 1, transform: 'translateY(0) scale(1.08)', offset: .06 }, { opacity: 1, transform: 'translateY(2px) scale(1)', offset: .1 }, { opacity: 1, transform: 'translateY(' + sink + 'px) scale(1)', offset: .9 }, { opacity: 0, transform: 'translateY(' + (sink + 4) + 'px) scale(1)' }], { duration: 9000, fill: 'forwards', easing: 'ease-out' });
      live.push(na); na.onfinish = function () { n.remove(); bbusy = false; later(badCycle, 1800); };
    }, 7100);
  }
  function syncFx() { clearFx(); if (still()) { stillBubble(); stillNote(); } else { steveCycle(); badCycle(); } }
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
  function draw() { drawTop(); drawStage(); }
  function frame(ts) {
    raf = 0;
    if (document.hidden || still()) return;
    var dt = last ? Math.min((ts - last) / 1000, .1) : 0; last = ts; t += dt;
    if (visible) { st += dt; if (st >= LOOP) st = 0; }
    draw(); raf = requestAnimationFrame(frame);
  }
  function start() { last = 0; if (!raf && !document.hidden && !still()) raf = requestAnimationFrame(frame); }
  function go() {
    draw(); start(); syncFx(); var wasStill = still();
    document.addEventListener('visibilitychange', start);
    new MutationObserver(function () { draw(); start(); if (still() !== wasStill) { wasStill = still(); syncFx(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if ('IntersectionObserver' in window) { new IntersectionObserver(function (es) { es.forEach(function (e) { heroVis = e.isIntersecting; }); }).observe(hero); new IntersectionObserver(function (es) { es.forEach(function (e) { stageVis = e.isIntersecting; }); }).observe(sstage); } else heroVis = stageVis = true;
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
