// Shark pass (optional, reusable). It shows how an AI hallucination works: random, and it can sneak up on you and get away without you noticing.
// Now and then a few paper FACT drawings drift in the background (fairly rare). Rarer still, a shark comes, eats them and swims off.
// Some passes are loud-ish and big, most are quiet: small, faint, near an edge, over in seconds, no sound, no popup.
// Decorative only: aria-hidden, pointer-events none, below the bar and bubbles, never touches page text or controls. Papers are drawings, not facts.
// No pass for reduced motion or a hidden tab. No inline scripts or styles (motion goes through the Web Animations API and the CSS object model).
//   WayShark.watch()  - the roll: every 45 to 90 minutes (random, a timer, never on page load) while the visitor stays on the page and the tab is showing:
//                       about 35% of rolls bring papers; about 1 in 3 of those bring the shark too (so roughly one roll in ten)
//   WayShark.play(o)  - play one now: o.shark (default true), o.quiet (default random, 65% quiet). For a page that wants it on purpose (e.g. the Steve page)
//   WayShark.stop()   - end it early. Add ?shark=1 to any address to force a full pass a few seconds after load, for review.
(function () {
  'use strict';
  var MIN_MS = 45 * 60000, MAX_MS = 90 * 60000, P_PAPERS = .35, P_SHARK = 1 / 3, QUIET = .65, cur = null, rollTimer = 0;
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var SHARK = '<svg viewBox="0 0 400 210" aria-hidden="true" focusable="false"><defs><linearGradient id="wb-sp-skin" x2=".35" y2="1"><stop stop-color="#b8d7d4"/><stop offset=".55" stop-color="#6e9da6"/><stop offset="1" stop-color="#d3dfca"/></linearGradient><linearGradient id="wb-sp-belly" x2=".2" y2="1"><stop stop-color="#ede7cd"/><stop offset="1" stop-color="#a9c6bc"/></linearGradient></defs><g transform="translate(4 0) rotate(0 180 110)"><g class="sp-tail"><path d="m267 100 68-54-13 51 24 50-78-25z" fill="#5c8d99" stroke="#9fc6cb" stroke-width="1.4"/></g><path d="m161 57 32-46 18 52" fill="#79a5ac" stroke="#b4d3d0"/><path d="M36 99C39 46 127 32 196 53q48 13 79 49-20 48-96 51-81 6-127-31z" fill="url(#wb-sp-skin)" stroke="#aacdd0" stroke-width="1.5"/><path d="M49 112q77-21 178 0-45 43-116 31z" fill="url(#wb-sp-belly)"/><path d="m169 114 30 45 11-53" fill="#5b8995" stroke="#9fc6cb"/><path d="m134 81-5 22m20-19-5 20m20-17-5 20" stroke="#416d7b" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="84" cy="76" rx="14" ry="15" fill="#f4edd5" stroke="#4a7481" stroke-width="1.5"/><circle cx="79" cy="79" r="6" fill="#253e4b"/><circle cx="77" cy="76" r="2.5" fill="#fff"/><path d="M66 54q18-10 31 2" stroke="#426c79" stroke-width="4" fill="none" stroke-linecap="round"/><path class="sp-mouth" d="M39 101q48-10 91 0l-4 21q-42 19-73-6z" fill="#26323d"/><path d="m45 101 10 15 9-16 11 18 10-18 11 17 10-17 10 10" fill="#fff2d2"/><g class="sp-jaw"><path d="M49 116q42 15 78-6-4 26-31 29-34-2-47-23" fill="url(#wb-sp-belly)" stroke="#8aadb1" stroke-width="1.1"/><path d="m57 119 8-8 7 14 11-9 7 13 10-13 9 9 10-13" fill="#fff2d2" stroke="#47626e" stroke-width=".5"/></g></g></svg>';
  function paper(x, y, a) {
    return '<svg class="sp-paper" viewBox="-24 -30 48 64" aria-hidden="true" focusable="false"><g transform="rotate(' + a + ')"><path d="M-20-27h30l11 10v43h-41z" fill="#fff0ca" stroke="#baa176" stroke-width="1.2"/><path d="M10-27v11h11" fill="#dbc49b"/><text x="0" y="-1" text-anchor="middle" fill="#6b5839" font-family="Arial,sans-serif" font-size="12">FACT</text><path d="M-13 8h26m-26 7h19" stroke="#9b8053" stroke-width="1.1"/></g></svg>';
  }
  function stop() { if (cur) { try { cur.timers.forEach(clearTimeout); cur.anims.forEach(function (a) { a.cancel(); }); cur.el.remove(); } catch (e) { /* gone */ } cur = null; } }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function play(o) {
    o = o || {};
    if (cur || (mq && mq.matches) || document.hidden || !document.body || !document.documentElement.animate) return;
    var withShark = o.shark !== false, quiet = o.quiet == null ? Math.random() < QUIET : !!o.quiet;
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/shark-pass.css?v=2'; document.head.appendChild(css);
    var el = document.createElement('div'); el.className = 'wb-shark-pass'; el.setAttribute('aria-hidden', 'true');
    var w = Math.max(window.innerWidth, 360), h = window.innerHeight;
    var size = Math.max(quiet ? 90 : 150, Math.min(quiet ? 150 : 260, w * (quiet ? .13 : .22)));
    // quiet passes keep to the top or bottom edge region; louder ones swim through the middle
    var y0 = Math.round(quiet ? (Math.random() < .5 ? h * rnd(.14, .24) : h * rnd(.78, .9)) : h * rnd(.35, .65));
    var dur = Math.round(quiet ? rnd(8000, 11000) : 20000), travel = w + size * 2, anims = [], timers = [];
    var layerOpacity = quiet ? .32 : .7;
    el.style.opacity = '0'; document.body.appendChild(el);
    var papers = [];
    for (var i = 0; i < 5; i++) {
      var p = document.createElement('div'); p.className = 'sp-p'; p.innerHTML = paper(0, 0, i * 19 - 30);
      var px = w * (.12 + i * .17), py = y0 + (i % 2 ? -1 : 1) * (20 + i * 9);
      p.style.left = px + 'px'; p.style.top = py + 'px'; p.style.width = '30px'; p.style.height = '40px';
      el.appendChild(p); papers.push({ el: p, x: px });
      anims.push(p.animate([{ transform: 'translateY(0) rotate(-4deg)' }, { transform: 'translateY(-7px) rotate(5deg)' }, { transform: 'translateY(0) rotate(-4deg)' }], { duration: rnd(3500, 5500), iterations: Infinity, easing: 'ease-in-out' }));
    }
    anims.push(el.animate([{ opacity: 0 }, { opacity: layerOpacity }], { duration: 3000, fill: 'forwards' }));
    var delay = withShark ? Math.round(rnd(o.fast ? 800 : 6000, o.fast ? 1500 : 20000)) : 0;
    function done(extra) { timers.push(setTimeout(stop, extra)); }
    if (!withShark) {
      // papers only: they drift for a couple of minutes and fade away, nobody comes
      timers.push(setTimeout(function () { if (cur) anims.push(el.animate([{ opacity: layerOpacity }, { opacity: 0 }], { duration: 4000, fill: 'forwards' })); }, 120000));
      done(125000); cur = { el: el, anims: anims, timers: timers }; return;
    }
    cur = { el: el, anims: anims, timers: timers };
    timers.push(setTimeout(function () {
      if (!cur) return;
      var shark = document.createElement('div'); shark.className = 'sp-shark'; shark.innerHTML = SHARK; shark.style.width = size + 'px'; shark.style.height = (size * .525) + 'px'; shark.style.top = y0 + 'px';
      el.appendChild(shark);
      papers.forEach(function (q) {
        var hit = Math.max(0, Math.min(1, (w + size * .3 - q.x - size * .4) / travel));
        anims.push(q.el.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: Math.max(.01, hit - .015) }, { opacity: 0, transform: 'scale(.3)' }], { duration: dur, fill: 'forwards', easing: 'linear' }));
      });
      anims.push(shark.animate([{ transform: 'translateX(' + (w + size * .3) + 'px)' }, { transform: 'translateX(' + (-size * 1.4) + 'px)' }], { duration: dur, fill: 'forwards', easing: 'linear' }));
      var sw = shark.firstChild;
      anims.push(sw.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-16px) rotate(-3deg)', offset: .22 }, { transform: 'translateY(8px) rotate(2deg)', offset: .5 }, { transform: 'translateY(-10px) rotate(-1.5deg)', offset: .78 }, { transform: 'translateY(0) rotate(0deg)' }], { duration: dur, easing: 'ease-in-out' }));
      var tail = sw.querySelector('.sp-tail'), jaw = sw.querySelector('.sp-jaw'), mouth = sw.querySelector('.sp-mouth'), chomp = { duration: quiet ? 900 : 1600, iterations: Infinity, easing: 'ease-in-out' };
      if (tail) anims.push(tail.animate([{ transform: 'rotate(-7deg)' }, { transform: 'rotate(8deg)' }], { duration: quiet ? 400 : 640, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
      // the mouth really opens: the lower jaw swings down about 20 degrees and the dark mouth grows with it
      if (jaw) anims.push(jaw.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-20deg)', offset: .4 }, { transform: 'rotate(-20deg)', offset: .55 }, { transform: 'rotate(0deg)' }], chomp));
      if (mouth) anims.push(mouth.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.7)', offset: .4 }, { transform: 'scaleY(1.7)', offset: .55 }, { transform: 'scaleY(1)' }], chomp));
      anims.push(el.animate([{ opacity: layerOpacity }, { opacity: layerOpacity, offset: .85 }, { opacity: 0 }], { duration: dur + 400, fill: 'forwards' }));
      timers.push(setTimeout(stop, dur + 600));
    }, delay));
  }
  // the hourly roll: a random wait of 45 to 90 minutes, then one roll; the next wait starts after it. Hidden tabs skip the roll.
  function watch() {
    if (rollTimer || (mq && mq.matches)) return;
    var forced = /[?&]shark=1\b/.test(location.search);
    if (forced) setTimeout(function () { play({ shark: true, quiet: false, fast: true }); }, 2500);
    (function next() {
      rollTimer = setTimeout(function () {
        if (!document.hidden && !cur && Math.random() < P_PAPERS) play({ shark: Math.random() < P_SHARK });
        next();
      }, Math.round(rnd(MIN_MS, MAX_MS)));
    })();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  window.WayShark = { watch: watch, maybe: watch, play: play, stop: stop };
  if (document.currentScript && document.currentScript.hasAttribute('data-auto')) watch();
})();
