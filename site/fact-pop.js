// Fact pop: lets a visitor click the little facts that sink through the background (Steve's true papers and the shark's bad-fact notes).
// The swimmer layers sit BEHIND the page text and ignore the pointer, so they can never block reading or clicking. This file listens for plain clicks
// on the page instead: if the click lands on empty background where a fact is showing (nothing opaque covering it, not a link, button or field),
// the fact pops up as a small card. Text selection and controls always win.
//   WayFactPop.add(el, { kind, key, open, hover, host })  - register a fact element. open() shows it; hover(on) is optional (pause while the pointer is on it).
//   WayFactPop.card({ kind, label, text, note, from })    - the small pop-up card (bad facts); returns the card element. Esc or Close shuts it.
//   WayFactPop.caught(kind, key, card)                    - tell listeners a fact was popped. WayFactPop.onCaught is a list of functions({kind,key,card}).
//                                                          Nothing awards points here; a points patch can add a listener (see the art-swap README).
// No inline scripts or styles.
(function () {
  'use strict';
  if (window.WayFactPop) return;
  var items = [], over = null, root = document.documentElement, moveBusy = false;
  var CONTROL = 'a[href],button,input,select,textarea,label,summary,option,[role="button"],[role="link"],[role="dialog"],[contenteditable="true"]';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/fact-pop.css?v=1'; document.head.appendChild(css);
  function seen(it) {
    var cs = getComputedStyle(it.el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.35;
  }
  // true when something with its own background sits between the pointer and the swimmer layer (a card, a table, a panel): then the fact is hidden there
  function covered(target, it) {
    var stop = it.host || document.body;
    for (var n = target; n && n !== stop && n !== root; n = n.parentNode) {
      if (!n.nodeType || n.nodeType !== 1) break;
      var cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return true;
      var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      if (m) { var p = m[1].split(','); if (p.length < 4 || parseFloat(p[3]) > 0.04) return true; }
    }
    return false;
  }
  function find(ev) {
    var t = ev.target;
    if (!t || t.nodeType !== 1 || (t.closest && t.closest(CONTROL))) return null;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (!it.el.isConnected) { items.splice(i, 1); continue; }
      var r = it.el.getBoundingClientRect();
      if (ev.clientX < r.left - 6 || ev.clientX > r.right + 6 || ev.clientY < r.top - 6 || ev.clientY > r.bottom + 6) continue;
      if (seen(it) && !covered(t, it)) return it;
    }
    return null;
  }
  document.addEventListener('click', function (ev) {
    if (ev.button || ev.defaultPrevented) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) return;   // the visitor was selecting text
    var it = find(ev);
    if (it) { ev.preventDefault(); if (over) { over = null; root.classList.remove('wb-fact-over'); } it.open(); }
  });
  document.addEventListener('mousemove', function (ev) {
    if (moveBusy || !items.length) return;
    moveBusy = true;
    requestAnimationFrame(function () {
      moveBusy = false;
      var it = find(ev);
      if (it === over) return;
      if (over && over.hover) over.hover(false);
      over = it; root.classList.toggle('wb-fact-over', !!it);
      if (it && it.hover) it.hover(true);
    });
  }, { passive: true });
  function closeCard() { var c = document.querySelector('.wb-fact-card'); if (c) { var back = c._back; c.remove(); if (back && back.isConnected && back.focus) back.focus(); } }
  var api = {
    onCaught: [],
    add: function (el, o) { o = o || {}; o.el = el; items.push(o); return o; },
    remove: function (el) { items = items.filter(function (x) { return x.el !== el; }); },
    card: function (o) {
      closeCard();
      var c = document.createElement('div'); c.className = 'wb-fact-card wb-fact-' + (o.kind || 'bad'); c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', o.label); c._back = o.from;
      var l = document.createElement('p'); l.className = 'fc-l'; l.textContent = o.label; c.appendChild(l);
      var t = document.createElement('p'); t.className = 'fc-t'; t.textContent = o.text; c.appendChild(t);
      if (o.note) { var n = document.createElement('p'); n.className = 'fc-n'; n.textContent = o.note; c.appendChild(n); }
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Close'; b.addEventListener('click', closeCard); c.appendChild(b);
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); closeCard(); } });
      document.body.appendChild(c); b.focus();
      return c;
    },
    caught: function (kind, key, card) {
      api.onCaught.forEach(function (fn) { try { fn({ kind: kind, key: key, card: card }); } catch (e) { /* a listener must never break the pop */ } });
    },
    close: closeCard
  };
  window.WayFactPop = api;
})();
