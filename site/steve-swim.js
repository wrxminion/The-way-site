// Scuba Steve swim-by (ChatGPT art: /art/steve-swim-kick.webp, faces left; his legs kick: ChatGPT's Steve B leg frames joined to the launcher body). Every once in a while Scuba Steve, a marine biologist who collects facts, swims across the page and drops a few
// paper facts. Unlike the shark's papers (made up, labeled BAD FACT), Steve's papers are TRUE: each one opens a small card with the fact and a named source
// with a link to the page it came from (the list is in steve-facts.js, window.WaySteveFacts).
// Timer: a random wait of 30 to 60 minutes, then one swim-by; never on page load; hidden tabs skip it. It never starts while the shark pass or the shark
// silhouette is playing, and the shark pass will not start while Steve is out (shark-pass.js asks WaySteve.busy()).
// Off for reduced motion and for Pause motion (html.wb-motion-off). The layer sits BEHIND the page text (inside the page's ocean host, z-index -1) and ignores the
// pointer, so it never blocks reading or clicking. A click on a sinking paper where it shows on empty background pops its card (fact-pop.js does the hit test);
// the papers are also keyboard buttons. No inline scripts or styles (motion goes through the Web Animations API and the CSS object model).
//   WaySteve.watch()  - start the random timer (waybar.js loads this file with data-auto)
//   WaySteve.play(o)  - swim by now (o.papers 1 to 4, default random 2 or 3; o.fact index into the list). Returns false if it cannot play right now.
//   WaySteve.stop()   - end it early (leaves an open card alone)   WaySteve.busy() - true while Steve is out
//   WaySteve.setArt({ steve: '<svg>', paper: '<svg>', swimMs: 16000, facesLeft: false }) - the hook for swapping art and timing (see README). Add ?steve=1 to any address to force one swim.
(function () {
  'use strict';
  var MIN_MS = 30 * 60000, MAX_MS = 60 * 60000, RETRY_MS = 120000;
  var cur = null, rollTimer = 0, art = { swimMs: 16000, facesLeft: true };
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  // Steve swims with the suction-cup tracker launcher; the picture faces left, so the code flips him for right-hand swims. Raster art, local file (the page policy allows only 'self' images).
  var STEVE = '<img class="st-img" src="/art/steve-swim-kick.webp" alt="" width="640" height="249" decoding="async" draggable="false">';
  // The real swim-by art: ChatGPT's Steve B rig (scuba/steve-swim-rig.js, SteveBSwim) draws the papers Steve with independently kicking legs from /art/steve-b.png.
  // It is an inline SVG redrawn each animation frame; if the rig cannot load, the single picture above is used instead.
  var RIG_URLS = ['/scuba/scuba.js?v=1', '/scuba/steve-swim-rig.js?v=1'], RIG_PNG = '/art/steve-b.png?v=1', RIG_VB = '0 40 1774 880', rigState = 0;
  function loadRig(then) {
    if (window.SteveBSwim) { then(); return; }
    if (rigState === 1) return;
    rigState = 1;
    var i = 0;
    (function next() {
      if (i >= RIG_URLS.length) { rigState = 2; then(); return; }
      var s = document.createElement('script'); s.src = RIG_URLS[i++]; s.onload = next; s.onerror = function () { rigState = 2; then(); };
      document.head.appendChild(s);
    })();
  }
  var rigSeq = 0;
  // the floating file is ChatGPT's art (STEVE_FLOATING_FILES_V1): a paper with a clip; it floats the way the old paper did, and a click still opens the true-fact card
  var PAPER = '<img src="/art/steve-file.webp?v=1" alt="" width="116" height="145" decoding="async" draggable="false">';
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function facts() { return window.WaySteveFacts || []; }
  // same host the whale and the shark silhouette use, so the layer sits above the page's ocean background but behind its content
  function host() { return document.querySelector('[data-whale-host]') || document.querySelector('main.ocean') || document.querySelector('main') || document.body; }
  function off() { return document.documentElement.classList.contains('wb-motion-off') || (mq && mq.matches); }
  function sharkOut() { return !!((window.WayShark && window.WayShark.busy && window.WayShark.busy()) || document.querySelector('.shark-sil.swim')); }
  function closeCard() { var c = document.querySelector('.wb-steve-card'); if (c) { var back = c._back; c.remove(); if (back && back.isConnected) back.focus(); } }
  // the card: the fact, a clear "true" label, the named source as a link, and a Close button. Esc closes it.
  function showCard(f, from, key) {
    closeCard();
    var c = document.createElement('div'); c.className = 'wb-steve-card'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Fact from Scuba Steve'); c._back = from;
    var l = document.createElement('p'); l.className = 'st-l'; l.textContent = 'True fact from Scuba Steve'; c.appendChild(l);
    var t = document.createElement('p'); t.textContent = f.t; c.appendChild(t);
    var s = document.createElement('p'); s.className = 'st-s'; s.appendChild(document.createTextNode('Source: ' + f.org + ', '));
    var a = document.createElement('a'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = f.title; s.appendChild(a); c.appendChild(s);
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Close'; b.addEventListener('click', closeCard); c.appendChild(b);
    c.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); closeCard(); } });
    document.body.appendChild(c); b.focus();
    if (window.WayFactPop) window.WayFactPop.caught('steve', key, c);
  }
  function stop() {
    if (!cur) return;
    try { if (cur.raf) cancelAnimationFrame(cur.raf); cur.timers.forEach(clearTimeout); cur.anims.forEach(function (x) { x.cancel(); }); cur.el.remove(); } catch (e) { /* gone */ }
    cur = null;
  }
  function play(o) {
    o = o || {};
    var list = facts();
    if (cur || !list.length || off() || document.hidden || !document.body || !document.documentElement.animate || sharkOut()) return false;
    if (!window.SteveBSwim && rigState === 0 && !art.steve) { loadRig(function () { play(o); }); return true; }
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/steve-swim.css?v=3'; document.head.appendChild(css);
    var w = Math.max(window.innerWidth, 360), h = window.innerHeight, dir = Math.random() < .5 ? 1 : -1, dur = art.swimMs || 16000;
    var size = Math.round(Math.max(150, Math.min(280, w * .22))), y = Math.round(h * rnd(.28, .55));
    var el = document.createElement('div'); el.className = 'wb-steve';
    var fig = document.createElement('div'); fig.className = 'st-fig'; fig.setAttribute('aria-hidden', 'true');
    var useRig = !art.steve && !!window.SteveBSwim, rigId = 'sb' + (++rigSeq) + '-';
    fig.innerHTML = art.steve || (useRig ? '<svg class="st-img" viewBox="' + RIG_VB + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"></svg>' : STEVE);
    fig.style.width = size + 'px'; fig.style.height = Math.round(size * (useRig ? 880 / 1774 : 249 / 640)) + 'px'; fig.style.top = y + 'px';
    el.appendChild(fig); host().appendChild(el);
    var anims = [], timers = [], x0 = dir === 1 ? -size * 1.2 : w + size * .2, x1 = dir === 1 ? w + size * .2 : -size * 1.2;
    cur = { el: el, anims: anims, timers: timers, raf: 0 };
    if (useRig) {
      // the legs kick while he swims: redraw the rig from the clock every frame (it stops with the layer, with Pause motion and in a hidden tab)
      var svg = fig.firstChild, t0 = 0, last = 0, me = cur;
      (function frame(ts) {
        if (cur !== me) return;
        var dt = last ? Math.min((ts - last) / 1000, .1) : 0; last = ts; t0 += dt;
        if (!document.hidden) svg.innerHTML = window.SteveBSwim.rig(t0, RIG_PNG, rigId);
        me.raf = requestAnimationFrame(frame);
      })(0);
    }
    fig.firstChild.style.transform = (dir === 1) === art.facesLeft ? 'scaleX(-1)' : 'none';
    anims.push(fig.animate([{ transform: 'translateX(' + x0 + 'px)' }, { transform: 'translateX(' + x1 + 'px)' }], { duration: dur, fill: 'forwards', easing: 'linear' }));
    anims.push(fig.animate([{ translate: '0 0' }, { translate: '0 -10px', offset: .3 }, { translate: '0 6px', offset: .65 }, { translate: '0 0' }], { duration: dur, easing: 'ease-in-out' }));
    var n = Math.max(1, Math.min(4, o.papers || (Math.random() < .5 ? 2 : 3))), picks = [], pool = list.map(function (_, i) { return i; });
    if (o.fact != null && list[o.fact]) { picks.push(o.fact); pool.splice(pool.indexOf(o.fact), 1); }
    while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    picks.forEach(function (idx, k) {
      var frac = (k + 1) / (picks.length + 1) * .8 + .1;
      timers.push(setTimeout(function () { if (cur) drop(idx, x0 + (x1 - x0) * frac + size * .45, y + size * .1, h); }, dur * frac));
    });
    timers.push(setTimeout(function () { if (cur) hold(); }, dur + 400));
    return true;
  }
  // one paper: it falls slowly (slower and slower), hangs for a while, then fades. Pointing at it or focusing it pauses it so it is easy to click.
  function drop(idx, x, y, h) {
    var f = facts()[idx], p = document.createElement('button'); p.type = 'button'; p.className = 'st-paper';
    p.setAttribute('aria-label', 'Open a true fact from Scuba Steve'); p.innerHTML = art.paper || PAPER;
    p.style.pointerEvents = window.WayFactPop ? 'none' : 'auto'; // behind the text: fact-pop.js catches the click; without it the paper takes clicks itself
    p.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - 42, x))) + 'px'; p.style.top = Math.round(y) + 'px'; cur.el.appendChild(p);
    var fall = Math.min(h * .35, 220), life = 26000, set = [];
    set.push(p.animate([{ transform: 'translate(0,0) rotate(-12deg)', opacity: 0 }, { opacity: 1, offset: .05 }, { transform: 'translate(-14px,' + fall * .5 + 'px) rotate(10deg)', offset: .4, easing: 'ease-out' }, { transform: 'translate(8px,' + fall + 'px) rotate(-6deg)', opacity: 1, offset: .85 }, { transform: 'translate(8px,' + fall + 'px) rotate(-6deg)', opacity: 0 }], { duration: life, fill: 'forwards', easing: 'ease-in-out' }));
    cur.anims.push(set[0]);
    function pause() { set[0].pause(); } function resume() { if (!document.querySelector('.wb-steve-card')) set[0].play(); }
    p.addEventListener('pointerenter', pause); p.addEventListener('focus', pause); p.addEventListener('pointerleave', resume); p.addEventListener('blur', resume);
    function open() { showCard(f, p, 'steve:' + idx); }
    p.addEventListener('click', open);
    if (window.WayFactPop) window.WayFactPop.add(p, { kind: 'steve', key: 'steve:' + idx, host: cur.el.parentNode, open: open, hover: function (on) { if (on) pause(); else resume(); } });
    set[0].onfinish = function () { p.remove(); };
  }
  // after the last paper has gone the layer is removed
  function hold() { var t = setTimeout(function () { if (cur && !cur.el.querySelector('.st-paper')) stop(); else if (cur) hold(); }, 3000); cur.timers.push(t); }
  function watch() {
    if (rollTimer || (mq && mq.matches)) return;
    if (/[?&]steve=1\b/.test(location.search)) setTimeout(function () { play({ papers: 3 }); }, 2500);
    (function next(ms) {
      rollTimer = setTimeout(function () {
        // hidden tab, motion off, or a shark out: try again in a couple of minutes instead of skipping the whole wait
        if (document.hidden || off() || cur || sharkOut()) { next(RETRY_MS); return; }
        play(); next(Math.round(rnd(MIN_MS, MAX_MS)));
      }, ms);
    })(Math.round(rnd(MIN_MS, MAX_MS)));
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  if (window.MutationObserver) new MutationObserver(function () { if (off()) stop(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.WaySteve = { watch: watch, play: play, stop: stop, busy: function () { return !!cur; }, setArt: function (a) { if (a) { if (a.steve) art.steve = a.steve; if (a.paper) art.paper = a.paper; if (a.swimMs) art.swimMs = a.swimMs; if (a.facesLeft != null) art.facesLeft = !!a.facesLeft; } } };
  if (document.currentScript && document.currentScript.hasAttribute('data-auto')) watch();
})();
