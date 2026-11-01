// Shark pass (optional, reusable). It shows how an AI hallucination works: random, and it can sneak up on you and get away without you noticing.
// Now and then a few paper FACT drawings drift in the background (fairly rare). Rarer still, a shark comes, eats them and swims off.
// Some passes are loud-ish and big, most are quiet: small, faint, near an edge, over in seconds, no sound, no popup.
// Decorative only: aria-hidden, pointer-events none, BEHIND the page text (inside the page's ocean host, z-index -1), never touches page text or controls. Papers are drawings, not facts.
// The shark is ChatGPT's art (/art/shark-swim.webp). The bad-fact notes it leaves sink slowly; a click on one where it shows on empty background pops it up (fact-pop.js).
// No pass for reduced motion or a hidden tab. No inline scripts or styles (motion goes through the Web Animations API and the CSS object model).
//   WayShark.watch()  - the roll: every 45 to 90 minutes (random, a timer, never on page load) while the visitor stays on the page and the tab is showing:
//                       about 35% of rolls bring papers; about 1 in 3 of those bring the shark too (so roughly one roll in ten)
//   WayShark.play(o)  - play one now: o.shark (default true), o.quiet (default random, 65% quiet). For a page that wants it on purpose (e.g. the Steve page)
//   The shark really eats: each paper is pulled into the mouth as it arrives and shrinks away, and the shark then leaves a small brown puff that
//   turns into a short silly BAD FACT (a made-up hallucination, labeled as such). Silly on purpose, never a real claim.
//   WayShark.stop()   - end it early. Add ?shark=1 to any address to force a full pass a few seconds after load, for review.
(function () {
  'use strict';
  var MIN_MS = 45 * 60000, MAX_MS = 90 * 60000, P_PAPERS = .35, P_SHARK = 1 / 3, QUIET = .65, cur = null, rollTimer = 0;
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var SHARK = '<img src="/art/shark-swim.webp" alt="" width="300" height="116" decoding="async" draggable="false">';   // faces left, mouth and tail move in the picture
  function paper(x, y, a) {
    return '<svg class="sp-paper" viewBox="-24 -30 48 64" aria-hidden="true" focusable="false"><g transform="rotate(' + a + ')"><path d="M-20-27h30l11 10v43h-41z" fill="#fff0ca" stroke="#baa176" stroke-width="1.2"/><path d="M10-27v11h11" fill="#dbc49b"/><text x="0" y="-1" text-anchor="middle" fill="#6b5839" font-family="Arial,sans-serif" font-size="12">FACT</text><path d="M-13 8h26m-26 7h19" stroke="#9b8053" stroke-width="1.1"/></g></svg>';
  }
  // short, silly, obviously wrong, kid-safe. Each one is labeled BAD FACT when it shows.
  var BAD_FACTS = ['Cats have ten legs. They move so fast it looks like four.', 'Fish get thirsty. They just hide it well.', 'The moon is made of old library cards.', 'Sharks invented the handshake.', 'Bananas are yellow boomerangs that gave up.', 'Penguins can fly, but only on Tuesdays.', 'A group of crabs is called a sandwich.', 'The ocean is salty because the fish cry.', 'Clouds are just sky sheep.', 'Dolphins pay their taxes in fish.', 'Octopuses wear eight tiny socks.', 'Seahorses ride other seahorses to work.'];
  function stop() { if (cur) { try { cur.timers.forEach(clearTimeout); cur.anims.forEach(function (a) { a.cancel(); }); cur.el.remove(); if (cur.fx) cur.fx.remove(); } catch (e) { /* gone */ } cur = null; } }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // the host the whale and the shark silhouette use: layers inside it sit above the page's ocean background but behind its text
  function host() { return document.querySelector('[data-whale-host]') || document.querySelector('main.ocean') || document.querySelector('main') || document.body; }
  function play(o) {
    o = o || {};
    if (cur || (mq && mq.matches) || document.documentElement.classList.contains('wb-motion-off') || document.hidden || !document.body || !document.documentElement.animate || (window.WaySteve && window.WaySteve.busy && window.WaySteve.busy())) return;
    var withShark = o.shark !== false, quiet = o.quiet == null ? Math.random() < QUIET : !!o.quiet;
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/shark-pass.css?v=5'; document.head.appendChild(css);
    var el = document.createElement('div'); el.className = 'wb-shark-pass'; el.setAttribute('aria-hidden', 'true');
    var w = Math.max(window.innerWidth, 360), h = window.innerHeight;
    var size = Math.max(quiet ? 90 : 150, Math.min(quiet ? 150 : 260, w * (quiet ? .13 : .22)));
    // quiet passes keep to the top or bottom edge region; louder ones swim through the middle
    var y0 = Math.round(quiet ? (Math.random() < .5 ? h * rnd(.14, .24) : h * rnd(.78, .9)) : h * rnd(.35, .65));
    var dur = Math.round(quiet ? rnd(8000, 11000) : 20000), travel = w + size * 2, anims = [], timers = [];
    var layerOpacity = quiet ? .32 : .7;
    var hostEl = host();
    el.style.opacity = '0'; hostEl.appendChild(el);
    // a second layer for the puffs and facts so they stay readable even on a quiet pass
    var fx = document.createElement('div'); fx.className = 'wb-shark-pass sp-fx'; fx.setAttribute('aria-hidden', 'true'); fx.style.opacity = quiet ? '.6' : '1'; hostEl.appendChild(fx);
    var mouthY = y0 + size * .21, bob = Math.max(4, size * .05), papers = [];
    for (var i = 0; i < 5; i++) {
      var p = document.createElement('div'); p.className = 'sp-p'; p.innerHTML = paper(0, 0, i * 19 - 30);
      var px = w * (.12 + i * .17), py = Math.round(mouthY - 20 + (i % 2 ? -1 : 1) * (3 + i * 3));
      p.style.left = px + 'px'; p.style.top = py + 'px'; p.style.width = '30px'; p.style.height = '40px';
      el.appendChild(p); papers.push({ el: p, x: px, i: i });
      anims.push(p.animate([{ transform: 'translateY(0) rotate(-4deg)' }, { transform: 'translateY(-7px) rotate(5deg)' }, { transform: 'translateY(0) rotate(-4deg)' }], { duration: rnd(3500, 5500), iterations: Infinity, easing: 'ease-in-out' }));
    }
    anims.push(el.animate([{ opacity: 0 }, { opacity: layerOpacity }], { duration: 3000, fill: 'forwards' }));
    var delay = withShark ? Math.round(rnd(o.fast ? 800 : 6000, o.fast ? 1500 : 20000)) : 0;
    function done(extra) { timers.push(setTimeout(stop, extra)); }
    if (!withShark) {
      // papers only: they drift for a couple of minutes and fade away, nobody comes
      timers.push(setTimeout(function () { if (cur) anims.push(el.animate([{ opacity: layerOpacity }, { opacity: 0 }], { duration: 4000, fill: 'forwards' })); }, 120000));
      done(125000); cur = { el: el, fx: fx, anims: anims, timers: timers }; return;
    }
    cur = { el: el, fx: fx, anims: anims, timers: timers };
    timers.push(setTimeout(function () {
      if (!cur) return;
      var shark = document.createElement('div'); shark.className = 'sp-shark'; shark.innerHTML = SHARK; shark.style.width = size + 'px'; shark.style.height = Math.round(size * 116 / 300) + 'px'; shark.style.top = y0 + 'px';
      el.appendChild(shark);
      // the shark runs from x = w + .3 size to x = -1.4 size, so it travels w + 1.7 size; its mouth is about .08 size in from its nose
      var T = w + size * 1.7, startX = w + size * .3, eatAt = [];
      papers.forEach(function (q) {
        var t = Math.max(.02, Math.min(.98, (startX + size * .08 - (q.x + 15)) / T)), pre = 400 / dur, post = 140 / dur;
        q.el.firstChild.style.transformOrigin = '100% 50%'; q.el.firstChild.style.transformBox = 'fill-box';
        // the paper is pulled toward the mouth, spins a little and shrinks away behind the head; it acts on the drawing inside, so the gentle float keeps going
        anims.push(q.el.firstChild.animate([{ opacity: 1, transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 }, { opacity: 1, transform: 'translate(0,0) scale(1) rotate(0deg)', offset: Math.max(.005, t - pre) }, { opacity: 1, transform: 'translate(4px,0) scale(.7) rotate(-12deg)', offset: t }, { opacity: 0, transform: 'translate(10px,0) scale(.12) rotate(-25deg)', offset: Math.min(1, t + post) }, { opacity: 0, transform: 'translate(10px,0) scale(.12) rotate(-25deg)', offset: 1 }], { duration: dur, fill: 'forwards', easing: 'linear' }));
        eatAt.push({ i: q.i, ms: t * dur });
      });
      // after the 2nd paper and after the last one, the shark leaves a puff behind (about .66 size back from the nose, low on the body)
      eatAt.sort(function (m, n) { return m.ms - n.ms; });
      var lastEnd = dur + 600;
      [1, eatAt.length - 1].forEach(function (k) {
        var ms = eatAt[k].ms + 900;
        lastEnd = Math.max(lastEnd, ms + 17500);
        timers.push(setTimeout(function () { if (cur) poop(fx, timers, anims, startX - T * ms / dur + size * .62, mouthY + size * .08, w, quiet, size); }, ms));
      });
      anims.push(shark.animate([{ transform: 'translateX(' + startX + 'px)' }, { transform: 'translateX(' + (-size * 1.4) + 'px)' }], { duration: dur, fill: 'forwards', easing: 'linear' }));
      var sw = shark.firstChild;
      anims.push(sw.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(' + (-bob) + 'px) rotate(-3deg)', offset: .22 }, { transform: 'translateY(' + (bob / 2) + 'px) rotate(2deg)', offset: .5 }, { transform: 'translateY(' + (-bob * .6) + 'px) rotate(-1.5deg)', offset: .78 }, { transform: 'translateY(0) rotate(0deg)' }], { duration: dur, easing: 'ease-in-out' }));
      var tail = sw.querySelector('.sp-tail'), jaw = sw.querySelector('.sp-jaw'), mouth = sw.querySelector('.sp-mouth'), chomp = { duration: quiet ? 900 : 1600, iterations: Infinity, easing: 'ease-in-out' };
      if (tail) anims.push(tail.animate([{ transform: 'rotate(-7deg)' }, { transform: 'rotate(8deg)' }], { duration: quiet ? 400 : 640, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' }));
      // the mouth really opens: the lower jaw swings down about 20 degrees and the dark mouth grows with it
      if (jaw) anims.push(jaw.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-20deg)', offset: .4 }, { transform: 'rotate(-20deg)', offset: .55 }, { transform: 'rotate(0deg)' }], chomp));
      if (mouth) anims.push(mouth.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.7)', offset: .4 }, { transform: 'scaleY(1.7)', offset: .55 }, { transform: 'scaleY(1)' }], chomp));
      anims.push(el.animate([{ opacity: layerOpacity }, { opacity: layerOpacity, offset: .85 }, { opacity: 0 }], { duration: dur + 400, fill: 'forwards' }));
      timers.push(setTimeout(stop, lastEnd));
    }, delay));
  }
  // one puff: a small brown cloud swells and drifts, then turns into a label and a silly wrong fact that hangs there a few seconds and fades
  function poop(fx, timers, anims, x, y, w, quiet, size) {
    // ChatGPT's art (art/hallucination-poop.webp, 5.65 s): the poop turns into a brown cloud and then a brown bubble. The bubble then pops (droplets) and the BAD FACT note appears.
    var ps = Math.round(Math.max(44, Math.min(78, size * .34)));
    var pf = document.createElement('div'); pf.className = 'sp-puff';
    var im = document.createElement('img'); im.alt = ''; im.width = 480; im.height = 480; im.draggable = false; im.src = '/art/hallucination-poop.webp?v=1'; pf.appendChild(im);
    pf.style.width = ps + 'px'; pf.style.height = ps + 'px'; pf.style.left = Math.round(x - ps / 2) + 'px'; pf.style.top = Math.round(y) + 'px'; fx.appendChild(pf);
    anims.push(pf.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(10px,16px)' }], { duration: 5650, fill: 'forwards', easing: 'ease-out' }));
    // when the animation reaches the bubble, hold it as a still picture of that last frame (no looping), then pop
    timers.push(setTimeout(function () { if (cur) im.src = '/art/bad-fact-bubble.webp?v=1'; }, 5600));
    timers.push(setTimeout(function () {
      if (!cur) return;
      pf.classList.add('sp-pop');
      var f = document.createElement('div'); f.className = 'sp-fact' + (quiet ? ' sp-fact-q' : '');
      var lab = document.createElement('span'); lab.className = 'sp-fact-l'; lab.textContent = 'Bad fact';
      var bi = Math.floor(Math.random() * BAD_FACTS.length), txt = document.createElement('span'); txt.textContent = BAD_FACTS[bi];
      f.appendChild(lab); f.appendChild(txt); f.style.opacity = '0'; fx.appendChild(f);
      var fw = f.offsetWidth, fh = f.offsetHeight, cx = x + 10 + ps / 2;
      f.style.left = Math.round(Math.max(8, Math.min(w - fw - 8, cx - fw / 2))) + 'px'; f.style.top = Math.round(Math.max(8, Math.min(window.innerHeight - fh - 8, y + 16 + ps / 2 - fh / 2))) + 'px';
      timers.push(setTimeout(function () {
        if (!cur) return;
        // the note pops in, then sinks slowly while it hangs there (a click pops it up as a card, see fact-pop.js), then fades
        anims.push(f.animate([{ opacity: 0, transform: 'translateY(0) scale(.4)' }, { opacity: 1, transform: 'translateY(0) scale(1.08)', offset: .06 }, { opacity: 1, transform: 'translateY(4px) scale(1)', offset: .1 }, { opacity: 1, transform: 'translateY(46px) scale(1)', offset: .9 }, { opacity: 0, transform: 'translateY(52px) scale(1)' }], { duration: 9000, fill: 'forwards', easing: 'ease-out' }));
        if (window.WayFactPop) window.WayFactPop.add(f, { kind: 'bad', key: 'bad:' + bi, host: fx.parentNode, open: function () { openBad(bi); } });
      }, 450));
      timers.push(setTimeout(function () { pf.remove(); }, 800));
    }, 7100));
  }
  // a clicked bad fact: a small card that says plainly it is made up
  function openBad(i) {
    if (!window.WayFactPop) return;
    var c = window.WayFactPop.card({ kind: 'bad', label: 'Bad fact', text: BAD_FACTS[i], note: 'Made up by the Hallucination Shark. Not true.' });
    window.WayFactPop.caught('bad', 'bad:' + i, c);
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
  // secret admin shortcut: Alt+Shift+S (or the Shark lab entry on a phone) loads the shark lab (shark-lab.js), which only opens for a signed-in admin
  // (a phone has no keyboard: the admin-only Shark lab entry in the Tools bubble and the Menu calls WayShark.lab() the same way)
  function lab() {
    if (window.WaySharkLab) { window.WaySharkLab.open(); return; }
    var sc = document.createElement('script'); sc.src = '/shark-lab.js?v=2'; document.head.appendChild(sc);
  }
  document.addEventListener('keydown', function (ev) {
    if (!(ev.altKey && ev.shiftKey && (ev.key === 'S' || ev.key === 's' || ev.code === 'KeyS'))) return;
    lab();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  window.WayShark = { watch: watch, maybe: watch, play: play, stop: stop, lab: lab, busy: function () { return !!cur; } };
  if (document.currentScript && document.currentScript.hasAttribute('data-auto')) watch();
})();
