// Footer kraken: five grey arms rise one after another around the wooden "What lurks below?" sign at the bottom of the page (ChatGPT's kraken-scene.js, drawn in /scuba/kraken-scene.js).
// Bruce, the hallucination shark, swims through once per page view and eats the growing "MORE COMING!" words (his own layer, .wb-tent-bruce, in /scuba/bruce-scene.js and more-coming.js; remove that layer to remove Bruce).
// The art is aria-hidden; the sign wording is real link text in the page. Clicking the scene opens the game. It only runs while the footer is on screen and stops with the site-wide Pause motion button
// (motion-pause.js) and for reduced motion, which shows a still scene without Bruce. Styles are in footer-tentacles.css. No inline scripts or styles.
(function () {
  'use strict';
  var foot = document.querySelector('footer.foot');
  if (!foot || foot.querySelector('.wb-tent-wrap')) return;
  var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/footer-tentacles.css?v=9'; document.head.appendChild(link);
  var wrap = document.createElement('div'); wrap.className = 'wb-tent-wrap';
  var strip = document.createElement('div'); strip.className = 'wb-tent'; strip.setAttribute('aria-hidden', 'true');
  var krakenEl = document.createElement('div'); krakenEl.className = 'wb-tent-kraken';
  var bruceEl = document.createElement('div'); bruceEl.className = 'wb-tent-bruce';
  strip.appendChild(krakenEl); strip.appendChild(bruceEl);
  // The sign wording lives inside the artwork so it scales with the boards at every width; this hidden copy is the real text for screen readers and search.
  // The scene is a link to the game (/members/steve-game.html, tester demo). The link text is hidden visually and read by screen readers.
  var sign = document.createElement('a'); sign.className = 'wb-tent-link'; sign.href = '/members/steve-game.html'; sign.textContent = 'What lurks below? Play Steve\'s Fact Dive (tester demo)';
  wrap.appendChild(strip); wrap.appendChild(sign);
  // The scene is the last thing on the page, after the footer (and anything added to the footer later), so nothing sits under the tentacles.
  if (foot.nextSibling) foot.parentNode.insertBefore(wrap, foot.nextSibling); else foot.parentNode.appendChild(wrap);
  var KRAKEN_SPEED = 0.75;        // kraken seconds per real second (slowed, approved)
  var BRUCE_START = 9.5;          // real seconds on screen before MORE COMING! starts to grow (the arms are up by then)
  var loaded = false, started = false, visible = false, t = 0, last = 0, raf = 0, still = false, bruceDone = false;
  function need(cb) {
    if (window.ScubaArt) { cb(); return; }
    var s = document.createElement('script'); s.src = '/scuba/scuba.js?v=1'; s.onload = cb; s.onerror = function () { wrap.hidden = true; }; document.head.appendChild(s);
  }
  function draw() {
    var A = window.ScubaArt;
    krakenEl.innerHTML = A.pre(window.KrakenScene.scene(t), 'kr-');
    var u = t / KRAKEN_SPEED - BRUCE_START, M = window.MoreComing, B = window.BruceTextGulp;
    if (still || bruceDone || u < 0) { bruceEl.innerHTML = ''; return; }
    if (u < M.DURATION) bruceEl.innerHTML = A.pre(M.scene(u), 'mc-');
    else if (u < M.DURATION + B.DURATION) bruceEl.innerHTML = A.pre(B.scene(u - M.DURATION, true), 'br-');
    else { bruceEl.innerHTML = ''; bruceDone = true; }
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
        draw(); wrap.classList.add('is-ready'); run();
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
