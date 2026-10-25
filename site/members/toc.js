// The Way: "On this page" menu for long pages (voter guides, district maps, case pages).
// Drop-in: <link rel="stylesheet" href="/members/toc.css?v=1"> in <head>,
//          <script src="/members/toc.js?v=1" defer></script>.
// Reads the page's own h2/h3 headings (inside <main>, or the whole body when there is no <main>),
// gives any heading without an id one, and draws: a sticky sidebar on wide screens, a jump menu button on narrow ones.
// Pages with fewer than 4 headings get nothing. No inline script or style: same-origin file only (CSP safe).
(function () {
  'use strict';
  var MIN = 4;
  var root = document.querySelector('main') || document.body;
  var found = Array.prototype.slice.call(root.querySelectorAll('h2, h3')).filter(function (h) {
    return !h.closest('.waybar, .otp, nav, header.waybar, [hidden], [aria-hidden=true]') && (h.textContent || '').trim();
  });
  if (found.length < MIN) return;

  var used = {};
  Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (e) { used[e.id] = true; });
  function slug(t) { return t.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section'; }
  var items = found.map(function (h) {
    var text = h.textContent.replace(/\s+/g, ' ').trim();
    if (!h.id) {
      var base = 'otp-' + slug(text), id = base, n = 2;
      while (used[id]) id = base + '-' + n++;
      h.id = id; used[id] = true;
    }
    return { el: h, id: h.id, text: text, sub: h.tagName === 'H3' };
  });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function list() {
    var ol = el('ol'), cur = ol, parent = null;
    items.forEach(function (it) {
      var li = el('li'), a = el('a', '', it.text);
      a.href = '#' + it.id; a.setAttribute('data-otp', it.id);
      li.appendChild(a);
      if (it.sub && parent) {
        if (!cur || cur === ol) { cur = el('ol'); parent.appendChild(cur); }
        cur.appendChild(li);
      } else { ol.appendChild(li); parent = li; cur = ol; }
    });
    return ol;
  }

  var side = el('nav', 'otp otp-side');
  side.setAttribute('aria-label', 'On this page');
  side.appendChild(el('p', 'otp-title', 'On this page'));
  side.appendChild(list());

  var jump = el('div', 'otp otp-jump');
  var btn = el('button', 'otp-btn', 'On this page');
  btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'otp-panel');
  var panel = el('nav', 'otp-panel'); panel.id = 'otp-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'On this page');
  panel.appendChild(el('p', 'otp-title', 'Jump to'));
  panel.appendChild(list());
  jump.appendChild(btn); jump.appendChild(panel);

  function toggle(open) {
    panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function () { toggle(panel.hidden); });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) toggle(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
  document.addEventListener('click', function (e) { if (!panel.hidden && !jump.contains(e.target)) toggle(false); });

  document.body.appendChild(side);
  document.body.appendChild(jump);

  // mark the section being read
  var links = Array.prototype.slice.call(document.querySelectorAll('.otp a[data-otp]'));
  function mark() {
    var cur = items[0].id, line = 120;
    items.forEach(function (it) { if (it.el.getBoundingClientRect().top <= line) cur = it.id; });
    links.forEach(function (a) {
      if (a.getAttribute('data-otp') === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  var tick = false;
  window.addEventListener('scroll', function () {
    if (tick) return; tick = true;
    requestAnimationFrame(function () { tick = false; mark(); });
  }, { passive: true });
  mark();
})();
