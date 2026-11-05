// The Way: shared page frame (redesign step 1, Nov 2026). See frame.css for how a page opts in.
// Builds a reading column and a side panel next to the element marked data-wf-main:
//   data-wf="facts": the page's own <dl class="wf-factbox"> (moved in here) plus an "On this page" jump list.
//   data-wf="pick":  Your pick and notes. The My Ballot controls that ballot-pick.js adds are moved into the panel,
//                    with the notes saved for this page and the jump list. On phones the panel is a bottom sheet.
// Nothing here leaves the browser; saved picks and notes stay where ballot-store.js keeps them.
(function () {
  'use strict';
  var body = document.body;
  if (!body || !body.classList.contains('wf')) return;
  var host = document.querySelector('[data-wf-main]');
  if (!host) return;
  // The Nov 3, 2026 guides are archived and picking is closed (members/waybar.js, BALLOTS_ARCHIVED): no pick box on those pages.
  var archived = /^\/(guide|map)(-[a-z]{2})?\//.exec(location.pathname);
  var kind = body.getAttribute('data-wf') === 'pick' && !archived ? 'pick' : 'facts';

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function box(title) { var b = el('section', 'wf-box'); var h = el('h2', 'wf-box-title', title); b.appendChild(h); return b; }

  var main = el('div', 'wf-main');
  while (host.firstChild) main.appendChild(host.firstChild);
  var side = el('aside', 'wf-side');
  host.classList.add('wf-grid');
  host.appendChild(main); host.appendChild(side);

  // ---- fact box (written in the page, so it also works without this script, just not in the side panel)
  var facts = main.querySelector('.wf-factbox');
  if (facts) {
    var fb = box(facts.getAttribute('data-title') || 'Key facts');
    facts.hidden = false; fb.appendChild(facts); side.appendChild(fb);
  }

  // ---- archived guide: point to what happened
  if (archived) {
    var rb = box('After the election');
    var rp = el('p', 'wf-fine', 'This guide is kept as a record of the November 3, 2026 ballot. ');
    var ra = el('a', null, 'See the results for this state'); ra.href = '/results/?state=' + (archived[2] || 'co') + '#tabs';
    rp.appendChild(ra); rb.appendChild(rp); side.appendChild(rb);
  }

  // ---- Your pick and notes
  if (kind === 'pick') {
    side.id = 'wf-side'; side.setAttribute('aria-label', 'Your pick and notes');
    var pb = box('Your pick and notes');
    var h1 = main.querySelector('h1');
    pb.appendChild(el('p', 'wf-item', h1 ? (h1.innerText || h1.textContent).split('\n')[0].replace(/\s+/g, ' ').trim() : document.title));
    var pickSlot = el('div', 'wf-pick-slot'), noteSlot = el('div', 'wf-note-slot');
    pickSlot.appendChild(el('p', 'wf-fine', 'Loading your pick…'));
    pb.appendChild(pickSlot); pb.appendChild(noteSlot);
    var savedBox = box('Saved from this page');
    var savedList = el('ul', 'wf-saved');
    savedBox.appendChild(savedList);
    var open = el('p', 'wf-fine'); var a = el('a', null, 'Open My ballot to see all your picks and print them');
    a.href = '/members/my-ballot.html'; open.appendChild(a); savedBox.appendChild(open);
    side.appendChild(pb); side.appendChild(savedBox);

    // ballot-pick.js is loaded later by waybar.js: move its pieces in as they appear
    var moved = { bar: false, note: false };
    function adopt() {
      if (!moved.bar) {
        var bar = main.querySelector('.bp-bar');
        if (bar) { pickSlot.textContent = ''; pickSlot.appendChild(bar); moved.bar = true; }
      }
      if (!moved.note) {
        var form = document.querySelector('.bp-dock .bp-noteform'), add = document.querySelector('.bp-dock .bp-addnote');
        if (form && add) { noteSlot.appendChild(add); noteSlot.appendChild(form); moved.note = true; }
      }
      if (moved.bar && moved.note && obs) { obs.disconnect(); obs = null; }
    }
    var obs = new MutationObserver(adopt);
    obs.observe(body, { childList: true, subtree: true });
    adopt();
    setTimeout(function () { if (!moved.bar) pickSlot.textContent = ''; }, 8000);

    // the notes and saved facts for this page, read from this browser
    var m = /^\/guide-([a-z]{2})\//.exec(location.pathname), ST = m ? m[1].toUpperCase() : 'CO';
    function drawSaved() {
      var WB = window.WayBallot, d = null;
      savedList.textContent = '';
      try { d = WB ? WB.read(ST) : null; } catch (e) { d = null; }
      var list = d ? Object.keys(d.facts).map(function (k) { return d.facts[k]; })
        .filter(function (f) { return f.pageUrl === location.pathname; }).sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); }) : [];
      if (!list.length) { savedList.appendChild(el('li', 'wf-fine', 'Nothing saved yet. Use Save next to a fact, highlight text, or add a note.')); return; }
      list.forEach(function (f) {
        var li = el('li'); var t = String(f.text || ''); li.appendChild(document.createTextNode(t.length > 160 ? t.slice(0, 157) + '…' : t));
        var s = el('small');
        if (/^https:\/\//.test(f.srcUrl || '')) { var l = el('a', null, f.srcLabel || 'Source'); l.href = f.srcUrl; l.rel = 'noopener'; s.appendChild(l); }
        else s.textContent = f.srcLabel || 'My note';
        li.appendChild(s); savedList.appendChild(li);
      });
    }
    document.addEventListener('theway-ballot', drawSaved);
    window.addEventListener('storage', drawSaved);
    if (window.WayBallot) drawSaved(); else window.addEventListener('load', function () { setTimeout(drawSaved, 300); });

    // phones: a button opens the panel as a bottom sheet
    var sheet = el('button', 'wf-sheet-btn', 'Your pick & notes');
    sheet.type = 'button'; sheet.setAttribute('aria-controls', 'wf-side'); sheet.setAttribute('aria-expanded', 'false');
    sheet.addEventListener('click', function () {
      var on = body.classList.toggle('wf-open');
      sheet.setAttribute('aria-expanded', String(on)); sheet.textContent = on ? 'Close' : 'Your pick & notes';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && body.classList.contains('wf-open')) sheet.click(); });
    body.appendChild(sheet);
  }

  // ---- keep the panel below anything pinned to the top of the window (for example the help banner)
  function pinnedBottom() {
    var y = 0;
    [0.25, 0.5, 0.75].forEach(function (fx) {
      var n = document.elementFromPoint(innerWidth * fx, 2);
      for (; n && n !== body && n !== document.documentElement; n = n.parentElement) {
        var pos = getComputedStyle(n).position;
        if ((pos === 'fixed' || pos === 'sticky') && !side.contains(n)) { y = Math.max(y, n.getBoundingClientRect().bottom); break; }
      }
    });
    return Math.min(y, innerHeight / 2);
  }
  var queued = false;
  function place() { queued = false; body.style.setProperty('--wf-top', Math.round(pinnedBottom() + 14) + 'px'); }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(place); } }
  addEventListener('scroll', queue, { passive: true }); addEventListener('resize', queue); setTimeout(place, 600); place();

  // ballot-pick.js puts "Save" buttons next to facts in the article; the panel is not an article, so drop any it adds here
  new MutationObserver(function () {
    Array.prototype.forEach.call(side.querySelectorAll('.wf-box > p > .bp-save, .wf-saved .bp-save, .wf-jump .bp-save, .wf-factbox .bp-save'), function (b) { b.remove(); });
  }).observe(side, { childList: true, subtree: true });

  // ---- On this page: every h2 in the article
  var hs = Array.prototype.slice.call(main.querySelectorAll('h2')).filter(function (h) { return !h.closest('.wf-side, aside, footer, nav'); });
  if (hs.length > 2) {
    var jb = box('On this page'); jb.classList.add('wf-jump');
    var ol = el('ol'), links = [];
    hs.forEach(function (h, i) {
      if (!h.id) h.id = 'wf-' + (h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || i);
      var li = el('li'), l = el('a', null, h.textContent.replace(/[↓\s]+$/, '').trim()); l.href = '#' + h.id;
      l.addEventListener('click', function () { if (body.classList.contains('wf-open')) body.classList.remove('wf-open'); });
      li.appendChild(l); ol.appendChild(li); links.push([h, l]);
    });
    jb.appendChild(ol); side.appendChild(jb);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function () {
        var cur = null;
        links.forEach(function (p) { if (p[0].getBoundingClientRect().top < 140) cur = p[1]; });
        links.forEach(function (p) { p[1].setAttribute('aria-current', p[1] === cur ? 'true' : 'false'); });
      }, { rootMargin: '0px 0px -60% 0px' });
      hs.forEach(function (h) { io.observe(h); });
    }
  }
})();
