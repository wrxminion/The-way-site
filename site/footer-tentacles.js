// Footer kraken: five grey arms rise one after another around the wooden "What lurks below?" sign at the bottom of the page (ChatGPT's kraken-scene.js, drawn in /scuba/kraken-scene.js).
// Bruce, the hallucination shark, swims through once per page view and eats the growing "MORE COMING!" words (his own layer, .wb-tent-bruce, in /scuba/bruce-scene.js and more-coming.js; remove that layer to remove Bruce).
// The art is aria-hidden; the sign wording is real link text in the page. Clicking the scene opens the game. It only runs while the footer is on screen and stops with the site-wide Pause motion button
// (motion-pause.js) and for reduced motion, which shows a still scene without Bruce. Styles are in footer-tentacles.css. No inline scripts or styles.
(function () {
  'use strict';
  var foot = document.querySelector('footer.foot');
  if (!foot || foot.querySelector('.wb-tent-wrap')) return;
  var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/footer-tentacles.css?v=11'; document.head.appendChild(link);
  var wrap = document.createElement('div'); wrap.className = 'wb-tent-wrap';
  var strip = document.createElement('div'); strip.className = 'wb-tent'; strip.setAttribute('aria-hidden', 'true');
  var krakenEl = document.createElement('div'); krakenEl.className = 'wb-tent-kraken';
  var bruceEl = document.createElement('div'); bruceEl.className = 'wb-tent-bruce';
  strip.appendChild(krakenEl);
  // The sign wording lives inside the artwork so it scales with the boards at every width; this hidden copy is the real text for screen readers and search.
  // The scene is a link to the game (/members/steve-game.html, tester demo). The link text is hidden visually and read by screen readers.
  var sign = document.createElement('a'); sign.className = 'wb-tent-link'; sign.href = '/members/steve-game.html'; sign.textContent = 'What lurks below? Play Steve\'s Fact Dive (tester demo)';
  wrap.appendChild(strip); wrap.appendChild(sign);
  // The scene is the last thing on the page, after the footer (and anything added to the footer later), so nothing sits under the tentacles.
  // Bruce has his own layer as wide as the page (inside .wb-tent-sea, clipped at the page edges), so he swims across the whole screen and not just the 520 px kraken strip.
  var sea = document.createElement('div'); sea.className = 'wb-tent-sea'; var pooEl = document.createElement('div'); pooEl.className = 'wb-tent-poop'; sea.appendChild(wrap); sea.appendChild(bruceEl); sea.appendChild(pooEl);
  if (foot.nextSibling) foot.parentNode.insertBefore(sea, foot.nextSibling); else foot.parentNode.appendChild(sea);
  var KRAKEN_SPEED = 0.75;        // kraken seconds per real second (slowed, approved)
  var BRUCE_START = 9.5;          // real seconds on screen before MORE COMING! starts to grow (the arms are up by then)
  var PACE = 225;                 // Bruce's speed in scene units per second (same as the scene)
  var extra = 0, preroll = 0;     // scene units of sea on each side of the strip, and the extra seconds Bruce needs to swim in from the far right edge
  function layout() {
    var w = strip.clientWidth, sw = sea.clientWidth;
    if (!w || !sw) return;
    var s = w / 1000;
    extra = Math.max(0, (sw / s - 1000) / 2);
    preroll = Math.max(0, (1000 + extra - 1150) / PACE);
    bruceEl.style.top = wrap.offsetTop + 'px'; bruceEl.style.height = strip.clientHeight + 'px';
    pooEl.style.top = bruceEl.style.top; pooEl.style.height = bruceEl.style.height; stripW = w;
  }
  var stripW = 0, poo = null, pooDone = false;
  // The fart (brown puff) in Bruce's scene turns into a bad fact: ChatGPT's poop animation becomes a brown bubble, the bubble pops, and a "Bad fact" note sinks and fades.
  // Click the note for the made-up fact card (same facts and card as the shark pass: shark-pass.js and fact-pop.js). Starts when the scene's own puff would start.
  var FART_AT = 6.8, FART = /<ellipse cx="[^"]+" cy="[^"]+" rx="[^"]+" ry="[^"]+" fill="#(?:91643b|ae7b48|6b4a31|bd925e)" opacity="[^"]+"\/>/g;
  function pooStep(v) {
    var age = v - FART_AT;
    if (pooDone || age < 0) return;
    if (age > 17) { pooEl.textContent = ''; poo = null; pooDone = true; return; }
    var B = window.BruceTextGulp, s = stripW / 1000;
    if (!poo) {
      var at = B.state(FART_AT), size = Math.round(Math.max(48, 150 * s)), cx = (at.x + 560 + extra) * s, cy = (at.y + 223) * s;
      var puff = document.createElement('div'); puff.className = 'wb-tent-puff';
      var im = document.createElement('img'); im.alt = ''; im.width = 480; im.height = 480; im.draggable = false; im.src = '/art/hallucination-poop.webp?v=1'; puff.appendChild(im);
      puff.style.width = size + 'px'; puff.style.height = size + 'px'; puff.style.left = Math.round(cx - size / 2) + 'px'; puff.style.top = Math.round(cy - size / 2) + 'px';
      pooEl.appendChild(puff);
      poo = { puff: puff, im: im, cx: cx, cy: cy, size: size, bubble: false, popped: false, note: null };
    }
    if (age >= 5.6 && !poo.bubble) { poo.bubble = true; poo.im.src = '/art/bad-fact-bubble.webp?v=1'; }
    if (age >= 7.1 && !poo.popped) { poo.popped = true; poo.puff.classList.add('pop'); }
    if (age >= 7.55 && !poo.note && window.WayShark && window.WayShark.badFacts) {
      var bi = Math.floor(Math.random() * window.WayShark.badFacts.length);
      var n = document.createElement('button'); n.type = 'button'; n.className = 'wb-tent-fact';
      n.setAttribute('aria-label', 'Bad fact: open the card');
      var l = document.createElement('span'); l.className = 'wb-tent-fact-l'; l.textContent = 'Bad fact';
      var tx = document.createElement('span'); tx.textContent = window.WayShark.badFacts[bi];
      n.appendChild(l); n.appendChild(tx);
      n.addEventListener('click', function () { window.WayShark.openBad(bi); });
      pooEl.appendChild(n);
      var fw = n.offsetWidth, ww = pooEl.clientWidth;
      var pad = ww < 700 ? 70 : 8;   // on a phone keep the note clear of the round buttons at the screen edges
      n.style.maxWidth = Math.min(240, ww - 2 * pad) + 'px'; fw = n.offsetWidth;
      n.style.left = Math.round(Math.max(pad, Math.min(ww - fw - pad, poo.cx - fw / 2))) + 'px'; n.style.top = Math.round(poo.cy + poo.size * .1) + 'px';
      poo.note = n;
    }
    if (age >= 8 && poo.puff && age > 8.2 && poo.popped) { poo.puff.hidden = true; }
  }
  var loaded = false, started = false, visible = false, t = 0, last = 0, raf = 0, still = false, bruceDone = false;
  function need(cb) {
    if (window.ScubaArt) { cb(); return; }
    var s = document.createElement('script'); s.src = '/scuba/scuba.js?v=1'; s.onload = cb; s.onerror = function () { wrap.hidden = true; }; document.head.appendChild(s);
  }
  // draw a 1000 x 560 scene on the wide layer: same scale as the strip, with the extra sea on both sides
  function wide(s) { return s.replace('viewBox="0 0 1000 560"', 'viewBox="' + (-extra) + ' 0 ' + (1000 + 2 * extra) + ' 560"').replace('width="1000" height="560"', 'width="100%" height="100%"'); }
  function draw() {
    var A = window.ScubaArt;
    krakenEl.innerHTML = A.pre(window.KrakenScene.scene(t), 'kr-');
    var u = t / KRAKEN_SPEED - BRUCE_START, M = window.MoreComing, B = window.BruceTextGulp;
    if (!still && u >= M.DURATION + preroll) pooStep(u - M.DURATION - preroll);
    if (still || bruceDone || u < 0) { bruceEl.innerHTML = ''; return; }
    if (u < M.DURATION) bruceEl.innerHTML = A.pre(wide(M.scene(u)), 'mc-');
    else if (u < M.DURATION + preroll + B.DURATION) {
      // Bruce first swims in from the far right edge of the page (before the scene's own start), then the scene plays as drawn and he leaves past the left edge
      var v = u - M.DURATION - preroll, s = B.scene(v, true);
      if (v < .8) s = s.replace(/translate\(1150 /, 'translate(' + (1150 + PACE * (.8 - v)) + ' ');
      bruceEl.innerHTML = A.pre(wide(s.replace(FART, '')), 'br-');
    } else { bruceEl.innerHTML = ''; bruceDone = true; }
  }
  function frame(ts) {
    raf = 0;
    if (!visible || document.hidden) return;
    var dt = last ? Math.min((ts - last) / 1000, 0.1) : 0; last = ts;
    if (!A_off()) t += dt * KRAKEN_SPEED;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function A_off() { return window.ScubaArt.off(); }
  function run() { last = 0; if (!raf && visible && started && !still && !document.hidden) raf = requestAnimationFrame(frame); }
  function load() {
    if (loaded) return; loaded = true;
    need(function () {
      window.ScubaArt.load(['/scuba/kraken-scene.js?v=1', '/scuba/revision-scenes.js?v=1', '/scuba/more-coming.js?v=1', '/scuba/bruce-scene.js?v=1'], function () {
        if (!window.KrakenScene || !window.BruceTextGulp || !window.MoreComing) { wrap.hidden = true; return; }
        still = window.ScubaArt.reduced(); t = still ? 5 : 0; started = true;
        layout(); draw(); wrap.classList.add('is-ready'); layout(); run();
        window.addEventListener('resize', layout);
      });
    });
  }
  if (window.IntersectionObserver) {
    var near = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { near.disconnect(); load(); } }, { rootMargin: '300px' });
    near.observe(foot);
    var seen = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) run(); }, { rootMargin: '0px' });
    seen.observe(wrap);
  } else { visible = true; load(); }
  document.addEventListener('visibilitychange', run);
})();
