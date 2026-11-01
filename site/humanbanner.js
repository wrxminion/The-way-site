// The Way: slim "we need humans" banner for logged-out visitors.
// One file. Change the words on the TEXT line below. Nothing is tracked: the only thing stored is
// "theway.humanbanner" in this tab's own session storage, so the X lasts until the tab closes. A small
// "Help us review" tab stays on the page after the X; it opens a small menu of bubbles (sign up to hunt,
// the Teacher? Parent? page, show the banner again).
(function () {
  'use strict';
  var TEXT = ['WE NEED HELP! THE HALLUCINATION SHARK ATE THE FACTS!!!', 'A lot of the site is written and checked by AI. We need humans to make sure it is not hallucinating.'];
  var BUTTON = 'Register to hunt him!';
  var TEACH = '/teacher-parent.html';
  var TEACH_LABEL = 'Teacher? Parent? Like to have fun?';
  var JOIN = '/members/#/reviewer';   // the reviewer sign up page (reviewer-signup patch)
  var KEY = 'theway.humanbanner';

  try { localStorage.removeItem(KEY); } catch (e) { /* the old permanent close is cleared so nobody stays hidden */ }
  var closed = false;
  try { closed = !!sessionStorage.getItem(KEY); } catch (e) { /* storage blocked: show it */ }
  try {
    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return; // signed in
    }
  } catch (e) { /* none */ }
  if (location.pathname.indexOf('/members/') === 0) return; // sign-up and member pages need no nudge

  var bar = document.createElement('div');
  bar.className = 'hb-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Help wanted');

  var p = document.createElement('p');
  p.className = 'hb-text';
  var big = document.createElement('strong');
  big.className = 'hb-big';
  big.textContent = TEXT[0];
  var small = document.createElement('span');
  small.className = 'hb-small';
  small.textContent = TEXT[1];
  p.appendChild(big); // block lines, so the call is big and the plain explanation sits under it
  p.appendChild(small);

  // The hunt scene (ChatGPT art, drawn by /scuba/*.js): Bruce bobs at the left and Steve with the suction-cup tracker launcher at the right.
  // Closing the banner plays it once: Steve fires and misses, holds up a "Missed." sign, Bruce swims off, Steve kicks after him, the banner slides away.
  // Every time the banner is shown (page load, or "Show the message again") the whole scene is built again, so it always starts fresh. Reduced motion or Pause motion: a still picture and the X just closes.
  // The old small shark picture is never shown, not even while the page loads: the stage keeps its size and stays empty until the scene is drawn.
  var stage = document.createElement('div');
  stage.className = 'hb-stage';
  stage.setAttribute('aria-hidden', 'true');

  var a = document.createElement('a');
  a.className = 'hb-join';
  a.href = JOIN;
  a.textContent = BUTTON;

  var x = document.createElement('button');
  x.type = 'button';
  x.className = 'hb-close';
  x.setAttribute('aria-label', 'Close this message');
  x.textContent = '×';
  // the bar rolls up (its height shrinks to nothing, so the page below moves up with it) while the scene keeps playing
  var ROLL_MS = 2200;   // how long the roll up takes (css transition in humanbanner.css uses the same time)
  function slideUp() {
    bar.style.maxHeight = bar.offsetHeight + 'px';
    void bar.offsetHeight;
    bar.classList.add('hb-closing');
    bar.style.maxHeight = '0px';
  }
  function resetBar() { bar.classList.remove('hb-closing'); bar.style.maxHeight = ''; }
  function reallyClose() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ }
    stopScene();
    bar.remove();
    resetBar();
    showTab();
  }
  x.addEventListener('click', function () {
    if (scene && scene.ready && !scene.running && window.ScubaArt && !window.ScubaArt.off() && !window.ScubaArt.reduced()) { scene.go(reallyClose); return; }
    if (scene && scene.running) return;
    reallyClose();
  });
  bar.addEventListener('keydown', function (e) { if (e.key === 'Escape') x.click(); });

  var t = document.createElement('a');
  t.className = 'hb-teach';
  t.href = TEACH;
  t.textContent = TEACH_LABEL;

  bar.appendChild(stage); bar.appendChild(p); bar.appendChild(a); bar.appendChild(t); bar.appendChild(x);

  var tab = null, menu = null;
  function closeMenu() {
    if (menu) { menu.remove(); menu = null; }
    if (tab) tab.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  }
  function outside(e) { if (menu && !menu.contains(e.target) && e.target !== tab) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') { closeMenu(); if (tab) tab.focus(); } }
  function showBar() {
    closeMenu();
    if (tab) { tab.remove(); tab = null; }
    try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    resetBar();
    var top = document.getElementById('waybar');
    if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
    ensureScene();   // a new, full scene every time the banner is shown
  }
  function bubble(tag, label, href) {
    var el = document.createElement(tag);
    el.className = 'hb-bub';
    el.textContent = label;
    if (href) el.href = href; else el.type = 'button';
    return el;
  }
  function openMenu() {
    menu = document.createElement('div');
    menu.className = 'hb-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Help us hunt the shark');
    menu.appendChild(bubble('a', BUTTON, JOIN));
    menu.appendChild(bubble('a', TEACH_LABEL, TEACH));
    var again = bubble('button', 'Show the message again');
    again.addEventListener('click', showBar);
    menu.appendChild(again);
    document.body.appendChild(menu);
    tab.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', onKey);
    menu.firstChild.focus();
  }
  function showTab() {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hb-tab';
    tab.textContent = 'Help us review';
    tab.setAttribute('aria-haspopup', 'true');
    tab.setAttribute('aria-expanded', 'false');
    tab.addEventListener('click', function () { if (menu) closeMenu(); else openMenu(); });
    document.body.appendChild(tab);
  }

  // ---- the hunt scene ----
  var scene = null, artState = 0, visHandler = null;   // artState: 0 not loaded, 1 loading, 2 ready, 3 failed
  function stopScene() { if (scene) scene.stop(); }
  function ensureScene() {
    if (artState === 2) { buildScene(); return; }
    if (artState === 1 || artState === 3) return;
    artState = 1;
    var s = document.createElement('script'); s.src = '/scuba/scuba.js?v=1';
    s.onerror = function () { artState = 3; stage.hidden = true; };
    s.onload = function () {
      window.ScubaArt.load(['/scuba/steve-speargun.js?v=2', '/scuba/revision-scenes.js?v=1', '/scuba/more-coming.js?v=1', '/scuba/bruce-scene.js?v=1', '/scuba/facts-scene.js?v=1'], function () {
        if (!window.SteveSpearGun || !window.BruceFacts) { artState = 3; stage.hidden = true; return; }
        artState = 2;
        if (bar.isConnected) buildScene();
      });
    };
    document.head.appendChild(s);
  }
  function buildScene() {
    var A = window.ScubaArt, GUN = '/art/steve-holding-speargun.png?v=1', KICK = '/art/steve-swim-kick.webp';
    var bruceEl = document.createElement('div'), steveEl = document.createElement('div'), kick = document.createElement('img');
    bruceEl.className = 'hb-bruce'; steveEl.className = 'hb-steve';
    kick.className = 'hb-kick'; kick.alt = ''; kick.src = KICK; kick.draggable = false;
    var NS = 'http://www.w3.org/2000/svg', sign = document.createElementNS(NS, 'svg');
    sign.setAttribute('class', 'hb-sign'); sign.setAttribute('viewBox', '0 0 120 72'); sign.setAttribute('aria-hidden', 'true');
    sign.innerHTML = '<g transform="translate(5 8) rotate(-5)"><rect width="110" height="57" rx="3" fill="#695139" stroke="#c6b187" stroke-width="2"/><rect x="6" y="6" width="98" height="45" fill="#263c3e"/><text x="55" y="38" text-anchor="middle" fill="#f0efda" font-family="Georgia,serif" font-style="italic" font-size="27">Missed.</text></g>';
    if (scene) scene.stop();
    if (visHandler) document.removeEventListener('visibilitychange', visHandler);
    stage.textContent = '';
    stage.appendChild(bruceEl); stage.appendChild(steveEl); stage.appendChild(sign); stage.appendChild(kick);
    // Timing (seconds after the click): the shot fires at 0 and flies over Bruce's head (a miss); Bruce spins off at REACT;
    // the "Missed." sign is up by SIGN_IN and stays full size until CLOSE (about 1.8 s to read); only then does the bar roll up.
    var T_SHOT = 1.4, REACT = .3, SIGN_IN = .7, SWAP = 3.2, CHASE = 2.4, CLOSE = 2.9, SHOT = { speed: 2.4, climb: .85 };
    var idleT = 0, T = 0, mode = 'idle', atClick = 0, departAt = 0, raf = 0, last = 0, aligned = null, signP = null, done = null, closing = false, closeT = 0, hardT = 0;
    function sm(v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }
    function bodyUse() { return steveEl.querySelector('g[clip-path="url(#hbs-body)"] > use'); }
    function measure() {
      var u = bodyUse(); if (!u) return null;
      var m = u.getScreenCTM(), sr = stage.getBoundingClientRect(); if (!m) return null;
      return { k: Math.hypot(m.a, m.b), px: m.a * 647 + m.c * 398 + m.e - sr.left, py: m.b * 647 + m.d * 398 + m.f - sr.top };
    }
    function steveSvg(t, fire) { return A.pre(SteveSpearGun.scene(t, GUN, fire, true, fire ? SHOT : null), 'hbs-'); }
    function align() {
      steveEl.innerHTML = steveSvg(T_SHOT + SWAP, true);
      var u = bodyUse(); if (!u) return;
      var m = u.getScreenCTM(), sr = stage.getBoundingClientRect(), k = Math.hypot(m.a, m.b);
      var px = m.a * 647 + m.c * 398 + m.e, py = m.b * 647 + m.d * 398 + m.f, sk = k * 2.644;
      aligned = { x: px - sr.left - 229 * sk, y: py - sr.top - 63.25 * sk, w: 640 * sk, px: px - sr.left, py: py - sr.top };
    }
    function drawSign() {
      if (mode === 'run' && T >= SIGN_IN && T < SWAP) {
        if (!signP) signP = measure(); if (!signP) { sign.style.display = 'none'; return; }
        var a = sm((T - SIGN_IN) / .38), b = sm((T - (SWAP - .3)) / .3), s = a * (1 - b), k = signP.k;
        var fx = signP.px + (470 - 647) * k, fy = signP.py + (0 - 398) * k, cx = signP.px + (fx - signP.px) * a, cy = signP.py + (fy - signP.py) * a, w = 44;
        sign.style.display = 'block'; sign.style.left = (cx - w / 2) + 'px'; sign.style.top = (cy - w * .3) + 'px';
        sign.style.transform = 'scale(' + s.toFixed(3) + ') rotate(' + ((1 - a) * -40).toFixed(1) + 'deg)'; sign.style.opacity = s > .02 ? '1' : '0';
      } else sign.style.display = 'none';
    }
    function drawKick() {
      if (mode === 'run' && T >= SWAP && aligned) {
        var pp = Math.min(1, Math.max(0, (T - SWAP) / CHASE)), e = pp * pp * (3 - 2 * pp), w = aligned.w, x1 = -w - 30;
        kick.style.display = 'block'; kick.style.width = w + 'px'; kick.style.left = (aligned.x + (x1 - aligned.x) * e) + 'px'; kick.style.top = aligned.y + 'px';
      } else kick.style.display = 'none';
    }
    function draw() {
      var spin = (mode === 'run' && T >= REACT) ? T - REACT : 0;   // Bruce tumbles wildly as he is thrown off
      bruceEl.innerHTML = (mode === 'idle' || T < REACT) ? A.pre(BruceFacts.idle(mode === 'idle' ? idleT : atClick + T), 'hbb-') : A.pre(BruceFacts.depart(Math.min(2.8, spin * 1.6), departAt), 'hbb-');
      bruceEl.style.transformOrigin = '45% 50%';
      bruceEl.style.transform = spin ? 'rotate(' + (-spin * 1300).toFixed(0) + 'deg)' : '';
      if (mode === 'idle') steveEl.innerHTML = steveSvg(idleT, false);
      else if (T < SWAP) steveEl.innerHTML = steveSvg(T_SHOT + T, true);
      else { if (!aligned) align(); steveEl.innerHTML = ''; }
      drawSign(); drawKick();
    }
    function frame(ts) {
      raf = 0;
      var dt = last ? Math.min((ts - last) / 1000, .1) : 0; last = ts;
      if (A.off() || document.hidden) { if (mode === 'run' && A.off()) { finish(); return; } if (!document.hidden) raf = requestAnimationFrame(frame); return; }
      if (mode === 'idle') idleT += dt;
      else if (mode === 'run') {
        T += dt;
        if (T >= REACT && !departAt) departAt = atClick + REACT;
        if (T >= CLOSE && !closing) { closing = true; slideUp(); closeT = setTimeout(finish, ROLL_MS + 200); }
      }
      draw();
      if (mode !== 'done') raf = requestAnimationFrame(frame);
    }
    function start() { last = 0; if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }
    function finish() { if (mode === 'done') return; mode = 'done'; clearTimeout(closeT); clearTimeout(hardT); if (raf) cancelAnimationFrame(raf); raf = 0; me.running = false; if (done) done(); }
    var me = scene = {
      ready: true, running: false,
      // a hard stop so a hidden tab or a stalled frame can never leave the bar half rolled up
      go: function (cb) { if (mode !== 'idle') return; done = cb; mode = 'run'; me.running = true; atClick = idleT; T = 0; departAt = 0; hardT = setTimeout(function () { if (mode === 'run') finish(); }, 12000); draw(); start(); },
      stop: function () { clearTimeout(closeT); clearTimeout(hardT); if (raf) cancelAnimationFrame(raf); raf = 0; mode = 'done'; me.running = false; }
    };
    // reduced motion / Pause motion: one still picture (Steve and Bruce at rest) and no timer
    if (A.reduced() || A.off()) { idleT = 3; draw(); return; }
    draw(); start();
    visHandler = function () { if (!document.hidden && (mode === 'idle' || mode === 'run')) start(); };
    document.addEventListener('visibilitychange', visHandler);
  }
  // coming back to the page from the back/forward cache must never show a half rolled up bar
  window.addEventListener('pageshow', function (e) { if (e.persisted && bar.isConnected) { resetBar(); ensureScene(); } });
  if (closed) showTab(); else showBar();
})();
