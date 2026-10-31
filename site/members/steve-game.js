// Steve's Fact Dive (tester demo). Scuba Steve, a marine biologist, practices on bubbles that each hold a fact.
// Made-up (silly) facts: shoot them to pop them. True facts (named source, from /steve-facts.js): swim Steve into them to catch them.
// The shark is the factarian: it only eats papers, so here it just floats at the right edge and the made-up bubbles come from it. It never goes near Steve.
// Public tester demo, no sign-in needed. Touch: drag to aim, lift to fire, tap = aim and fire.
// Pause motion (WayMotion) freezes the game. No network calls, nothing stored, no inline scripts.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ART = { swim: 'art/steve-game-swim.png', gun: 'art/steve-game-gun.png', shark: 'art/steve-game-shark.svg' }; // art swap point. Steve art: ChatGPT's swimming-with-paper and launcher stills, mirrored so he faces right.
  [ART.swim, ART.gun].forEach(function (u) { var i = new Image(); i.src = u; });

  // Short versions of the true facts for the bubble face (the full wording and the source stay in the catch log). Keyed by the start of the fact in steve-facts.js.
  var SHORT = {
    'An octopus has three hearts': 'An octopus has three hearts.',
    'A hagfish has four hearts': 'A hagfish has four hearts.',
    'A hagfish can release up to six': 'A hagfish can release up to six gallons of mucus.',
    'A blue whale has the largest heart': 'A blue whale has the largest heart of any animal.',
    'Leatherback sea turtles make the longest': 'Leatherback sea turtles make the longest migrations of any sea turtle.',
    'Sea otters have the thickest fur': 'Sea otters have the thickest fur of any mammal.',
    'A male seahorse carries the eggs': 'A male seahorse carries the eggs and gives birth to the babies.',
    'A sea star uses sea water': 'A sea star uses sea water instead of blood.',
    'Some sea stars have far more': 'Some sea stars have 10, 20, or even 40 arms.',
    'All clownfish start life as males': 'All clownfish start life as males.',
    'Whale sharks eat mostly small things': 'Whale sharks eat mostly plankton, schooling fish, and squid.',
    'Jellies do not have brains': 'Jellies do not have brains the way we usually think of them.',
    'The oldest ancestors of modern jellies': 'The oldest ancestors of modern jellies lived at least 500 million years ago.',
    'The orange roughy': 'The orange roughy, a fish, lives more than 100 years.',
    'A fish would suffocate': 'A fish would suffocate if it tried to chew its food.'
  };
  // Silly on purpose. The "source" lines are pretend and clearly not real places.
  var FAKE = [
    ['Octopuses wear 12 tiny hats.', 'Source: trust me'],
    ['Fish vote on Tuesdays.', 'Source: sounds right'],
    ['Sharks have 16 noses.', 'Source: my cousin said'],
    ['Whales sing in five languages and a tuba.', 'Source: no name'],
    ['Starfish have nine brains and a mustache.', 'Source: it just knows'],
    ['Seahorses sleep in tiny chairs.', 'Source: none'],
    ['Dolphins do math homework.', 'Source: everybody says'],
    ['Crabs invented the wave.', 'Source: trust me'],
    ['Jellyfish pay rent.', 'Source: a shiny sign'],
    ['Clams write novels in the sand.', 'Source: sounds right']
  ];

  var field = $('sg-field'), steveEl = $('sg-steve'), sharkEl = $('sg-shark'), spearEl = $('sg-spear');
  var scoreEl = $('sg-score'), timeEl = $('sg-time'), papersEl = $('sg-papers'), msgEl = $('sg-msg');
  var startP = $('sg-start'), endP = $('sg-end'), pauseB = $('sg-pause'), calmCb = $('sg-calm');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, st = null, keys = { up: false, down: false }, raf = 0, last = 0, motionNoted = false;
  steveEl.src = ART.swim; sharkEl.src = ART.shark;
  calmCb.checked = !!reduce; document.body.classList.toggle('sg-calm', calmCb.checked);
  calmCb.addEventListener('change', function () { document.body.classList.toggle('sg-calm', calmCb.checked); });

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function say(t) { msgEl.textContent = t; }
  function size() { W = field.clientWidth; H = field.clientHeight; }
  function motionOff() { return !!(window.WayMotion && window.WayMotion.isOff()); }
  function speedF() { return calmCb.checked ? 0.6 : 1; }

  function facts() {
    var list = window.WaySteveFacts || [];
    return list.map(function (f) {
      var short = null;
      Object.keys(SHORT).forEach(function (k) { if (f.t.indexOf(k) === 0) short = SHORT[k]; });
      return { face: short || f.t, org: f.org, title: f.title, url: f.url, full: f.t };
    });
  }
  var TRUE = [];

  function newState() {
    return { score: 0, time: 60, papers: 3, steveY: H / 2, targetY: null, fireWhenAimed: false, bubbles: [], spear: null, cool: 0,
      spawn: 0.6, running: false, paused: false, tick: 0, caught: [], popped: 0, wrongShots: 0, slipped: 0, sharkY: H / 2, gunT: 0, grabT: 0 };
  }
  function updHud() { scoreEl.textContent = st.score; timeEl.textContent = Math.max(0, Math.ceil(st.time)); papersEl.textContent = st.papers; }
  function steveBox() { var sw = steveEl.offsetWidth; return { x: 8 + sw * 0.55, hw: sw * 0.45, hh: Math.max(30, steveEl.offsetHeight * 0.4) }; }

  function spawnBubble() {
    var good = Math.random() < 0.5 && TRUE.length > 0, el = document.createElement('div'), c = document.createElement('span'), s = document.createElement('span');
    var d, srcText, face;
    if (good) { d = pick(TRUE); face = d.face; srcText = 'Source: ' + d.org; }
    else { d = pick(FAKE); face = d[0]; srcText = d[1]; }
    el.className = 'sg-bub ' + (good ? 'good' : 'bad');
    c.className = 'c'; c.textContent = face; s.className = 's'; s.textContent = srcText;
    el.appendChild(c); el.appendChild(s); field.appendChild(el);
    var r = el.offsetWidth / 2, y = rnd(r + 4, H - r - 4);
    if (!good) st.sharkY = y;
    st.bubbles.push({ el: el, good: good, d: d, x: W + r, y: y, r: r, vx: -rnd(50, 80) * (1 + Math.min(0.5, st.tick / 120)), ph: rnd(0, 6), cy: y });
  }
  function popEl(el) { el.classList.add('sg-pop'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320); }
  function removeEl(el) { if (el.parentNode) el.parentNode.removeChild(el); }

  function fire() {
    if (!st || !st.running || st.paused || st.cool > 0 || st.spear) return;
    var b = steveBox(); st.spear = { x: b.x + b.hw, y: st.steveY }; st.cool = 0.3; st.gunT = 0.7; spearEl.hidden = false;
  }
  function lose() { st.papers = Math.max(0, st.papers - 1); st.slipped++; }

  function update(dt) {
    var sf = speedF(), i, b;
    st.time -= dt; if (st.time <= 0) { finish(false); return; }
    var sp = 340, minY = 40, maxY = H - 40;
    if (keys.up || keys.down) { st.targetY = null; st.steveY += ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * sp * dt; }
    else if (st.targetY !== null) { var d = st.targetY - st.steveY, m = sp * 1.6 * dt; if (Math.abs(d) <= m) { st.steveY = st.targetY; if (st.fireWhenAimed) { st.fireWhenAimed = false; fire(); } } else st.steveY += Math.sign(d) * m; }
    st.steveY = Math.max(minY, Math.min(maxY, st.steveY));
    if (st.cool > 0) st.cool -= dt;
    st.spawn -= dt; if (st.spawn <= 0) { spawnBubble(); st.spawn = rnd(1.3, 2.0) / sf; }
    var sb = steveBox();
    for (i = st.bubbles.length - 1; i >= 0; i--) {
      b = st.bubbles[i]; b.x += b.vx * sf * dt; b.ph += dt;
      b.cy = b.y + (calmCb.checked ? 0 : Math.sin(b.ph * 1.6) * 8);
      b.el.style.transform = 'translate(' + (b.x - b.r) + 'px,' + (b.cy - b.r) + 'px)';
      if (b.x - b.r < sb.x + sb.hw && b.x + b.r > sb.x - sb.hw && Math.abs(b.cy - st.steveY) < b.r + sb.hh * 0.6) { // Steve swam into it
        st.bubbles.splice(i, 1);
        if (b.good) { st.score += 3; st.grabT = 0.4; st.caught.push(b.d); popEl(b.el); say('Caught! ' + b.d.full + ' (Source: ' + b.d.org + ', "' + b.d.title + '")'); }
        else { lose(); st.score = Math.max(0, st.score - 2); popEl(b.el); say('A made-up fact slipped through and a paper is gone. Shoot those before they reach Steve.'); if (st.papers <= 0) { finish(true); return; } }
      } else if (b.x < -b.r - 10) {
        st.bubbles.splice(i, 1); removeEl(b.el);
        if (!b.good) { lose(); say('A made-up fact floated past and a paper is gone.'); if (st.papers <= 0) { finish(true); return; } }
        else say('A true fact floated away. Swim Steve into those to catch them.');
      }
    }
    if (st.spear) {
      var s = st.spear, hit = false; s.x += 900 * dt;
      spearEl.style.transform = 'translate(' + s.x + 'px,' + (s.y - 3) + 'px)';
      var tipx = s.x + 54;
      for (i = 0; i < st.bubbles.length && !hit; i++) {
        b = st.bubbles[i];
        if (Math.abs(tipx - b.x) < b.r && Math.abs(s.y - b.cy) < b.r * 0.9) {
          hit = true; st.bubbles.splice(i, 1); popEl(b.el);
          if (b.good) { st.score = Math.max(0, st.score - 1); st.wrongShots++; say('Oops, that one was true (' + b.d.org + '). Catch true facts by swimming into them.'); }
          else { st.score += 2; st.popped++; say('Pop! That one was made up. Sounding sure is not proof.'); }
        }
      }
      if (hit || s.x > W + 20) { st.spear = null; spearEl.hidden = true; }
    }
    if (st.gunT > 0) st.gunT -= dt; if (st.grabT > 0) st.grabT -= dt;
    var wantGun = st.gunT > 0 || dragging, want = wantGun ? ART.gun : ART.swim;
    if (steveEl.getAttribute('src') !== want) steveEl.src = want;
    steveEl.classList.toggle('sg-grab', st.grabT > 0);
    steveEl.style.transform = 'translateY(' + (st.steveY - steveEl.offsetHeight / 2) + 'px)';
    sharkEl.style.transform = 'translateY(' + (st.sharkY - sharkEl.offsetHeight / 2) + 'px)';
    st.tick += dt; updHud();
  }

  function loop(ts) {
    if (!st || !st.running) return;
    var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (motionOff()) { if (!motionNoted) { motionNoted = true; say('Motion is paused. Press Play motion in the footer to keep diving.'); } }
    else { motionNoted = false; if (!st.paused) update(dt); }
    raf = requestAnimationFrame(loop);
  }
  function clearField() { if (st) st.bubbles.forEach(function (o) { removeEl(o.el); }); }
  function begin() {
    TRUE = facts(); size(); clearField(); st = newState(); st.running = true; motionNoted = false;
    startP.hidden = true; endP.hidden = true; spearEl.hidden = true; pauseB.disabled = false; pauseB.textContent = 'Pause';
    updHud(); say('Dive! Shoot the made-up bubbles. Catch the true ones.');
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function finish(outOfPapers) {
    st.running = false; cancelAnimationFrame(raf); pauseB.disabled = true; spearEl.hidden = true; clearField(); st.bubbles = [];
    $('sg-endh').textContent = outOfPapers ? 'Out of papers!' : 'Nice diving!';
    $('sg-summary').textContent = 'Score ' + st.score + '. True facts caught: ' + st.caught.length + '. Made-up bubbles popped: ' + st.popped + '. Papers left: ' + st.papers + ' of 3.';
    var log = $('sg-log'); log.textContent = '';
    if (st.caught.length) {
      var h = document.createElement('p'); h.textContent = 'Facts you caught, with where they came from:'; log.appendChild(h);
      var ul = document.createElement('ul'); var seen = {};
      st.caught.forEach(function (d) {
        if (seen[d.full]) return; seen[d.full] = 1;
        var li = document.createElement('li'), a = document.createElement('a');
        li.appendChild(document.createTextNode(d.full + ' '));
        a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = d.org + ': ' + d.title; li.appendChild(a); ul.appendChild(li);
      });
      log.appendChild(ul);
    }
    endP.hidden = false; say('Round over. Want to dive again?');
  }
  function togglePause() {
    if (!st || !st.running) return;
    st.paused = !st.paused; pauseB.textContent = st.paused ? 'Resume' : 'Pause'; say(st.paused ? 'Paused.' : 'Back in the water.'); last = performance.now();
  }

  // controls
  var dragging = false;
  function localY(e) { var r = field.getBoundingClientRect(); return e.clientY - r.top; }
  field.addEventListener('pointerdown', function (e) {
    if (!st || !st.running || st.paused) return;
    dragging = true; try { field.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    st.targetY = localY(e); st.fireWhenAimed = false; if (e.cancelable) e.preventDefault();
  });
  field.addEventListener('pointermove', function (e) { if (dragging && st && st.running) st.targetY = localY(e); });
  function lift(e) {
    if (!dragging) return; dragging = false;
    if (e.type === 'pointerup' && st && st.running && !st.paused) { st.targetY = localY(e); st.fireWhenAimed = true; } // lift = fire once Steve has lined up
  }
  field.addEventListener('pointerup', lift); field.addEventListener('pointercancel', function () { dragging = false; });
  function hold(id, key) {
    var b = $(id), on = function (e) { e.preventDefault(); keys[key] = true; }, off = function () { keys[key] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  }
  hold('sg-up', 'up'); hold('sg-down', 'down');
  $('sg-fire').addEventListener('click', fire);
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName, run = st && st.running;
    if (e.key === 'ArrowUp') { keys.up = true; if (run) e.preventDefault(); }
    else if (e.key === 'ArrowDown') { keys.down = true; if (run) e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT' && run) { e.preventDefault(); fire(); }
  });
  document.addEventListener('keyup', function (e) { if (e.key === 'ArrowUp') keys.up = false; if (e.key === 'ArrowDown') keys.down = false; });
  $('sg-go').addEventListener('click', begin); $('sg-again').addEventListener('click', begin); pauseB.addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', function () { if (document.hidden && st && st.running && !st.paused) togglePause(); });
  window.addEventListener('resize', size);

  size();
})();
