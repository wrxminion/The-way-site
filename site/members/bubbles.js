// The Way: the two bubble menus (right: Home, News, Pull a thread, Tools; left: VOTE!, Review, Commons, Help).
// Loaded by waybar.js, which hands over what it knows (signed in or out, roles, links) through WayBubbles.render(ctx).
// Structure and behaviour live here and in bubbles.css. The LOOK (glass, icon colour, motion, badges) lives only in
// bubbles-look.css, so the artwork can be swapped without touching this file. Icons are small inline SVG, kept in ICON below.
// Phones: each side collapses into one bubble (Explore on the right, My side on the left) that opens a labelled list.
// No inline scripts or styles anywhere; positions are set with the CSS object model, which the page security policy allows.
(function () {
  'use strict';
  var ICON = {
      "home": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path class=\"roof\" d=\"M7 21 24 7l17 14\"/><path d=\"M12 20v22h24V20M21 42V29h7v13\"/></g></svg>",
      "news": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"8\" width=\"29\" height=\"33\" rx=\"3\"/><path d=\"M38 16h4v22a3 3 0 0 1-3 3M15 15h17\"/><g class=\"lines\"><path d=\"M15 23h17M15 29h17M15 35h11\"/></g></g></svg>",
      "vote": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g class=\"ballot\"><path d=\"M17 5h17v20H17zM21 14l3 3 6-7\"/></g><path d=\"M10 28h30l3 14H7zM17 29h16\"/></g></svg>",
      "review": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 6h20l7 7v29H12zM31 6v9h8M18 21h13\"/><path class=\"check\" d=\"m18 31 6 5 10-11\"/></g></svg>",
      "commons": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 9h28v20H18l-8 7v-7H6z\"/><g class=\"reply\"><path d=\"M35 19h8v20h-6v6l-8-6H20v-7\"/></g></g></svg>",
      "help": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle class=\"ring\" cx=\"24\" cy=\"24\" r=\"19\"/><path d=\"M18 17c0-8 14-8 14 0 0 5-8 5-8 11M24 35h.1\"/></g></svg>",
      "tools": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g class=\"gear\"><path d=\"m20 5h8l1 6 4 2 6-2 4 7-5 4v5l5 4-4 7-6-2-4 2-1 6h-8l-1-6-4-2-6 2-4-7 5-4v-5l-5-4 4-7 6 2 4-2z\"/><circle cx=\"24\" cy=\"25\" r=\"7\"/></g></g></svg>",
      "my-side": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 31c-6-12 23-6 22-16\"/><g class=\"fan\"><circle cx=\"12\" cy=\"34\" r=\"7\"/><circle cx=\"28\" cy=\"25\" r=\"5\"/><circle cx=\"35\" cy=\"12\" r=\"6\"/></g></g></svg>",
      "hidden": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M10 24h.1M24 24h.1M38 24h.1\"/></g></svg>",
    "explore": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g class=\"fan\"><path d=\"M19 12h23M19 24h23M19 36h23\"/><circle cx=\"8\" cy=\"12\" r=\"2\"/><circle cx=\"8\" cy=\"24\" r=\"2\"/><circle cx=\"8\" cy=\"36\" r=\"2\"/></g></g></svg>"
  };

  var HIDE_KEY = 'theway.bubbles-hide';   // bubble keys the member chose to hide (Account > Bubble settings)
  var KEYS = ['home', 'news', 'tools', 'vote', 'review', 'commons', 'help'];
  var PHONE = '(max-width:760px)';
  // which bubble owns the page you are on (waybar.js here() names the page)
  var OWNER = { home: 'home', news: 'news', results: 'vote', ballot: 'vote', myballot: 'vote', states: 'vote', map: 'vote', vote: 'vote',
    review: 'review', commons: 'commons', invite: 'commons', notes: 'commons', help: 'help',
    cases: 'tools', govworks: 'tools', casestudies: 'tools', 'research-lib': 'tools', research: 'tools', private: 'tools', author: 'tools',
    findings: 'tools', admin: 'tools', reports: 'tools', log: 'tools', roles: 'tools' };
  var ctx = null, openId = null, openBtn = null, nested = null, uid = 0;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name) { var s = document.createElement('span'); s.innerHTML = ICON[name] || ''; return s.firstChild || document.createElement('span'); }
  function hidden() { try { var a = JSON.parse(localStorage.getItem(HIDE_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (k) { return KEYS.indexOf(k) >= 0; }) : []; } catch (e) { return []; } }
  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---- what each bubble holds: the one list used by the desktop pop-ups and the phone lists ----
  function toolsGroups(c) {
    var d = c.data, r = c.route, can = c.can;
    var g = [{ heading: null, items: [
      { href: '/cases/', label: 'Civics and history' },
      { href: '/how-government-works.html', label: 'Government' },
      { href: '/case-studies/', label: 'Election Studies' },
      { href: '/research/', label: 'Research' }
    ] }];
    if (d) {
      var mine = [{ href: '/members/author.html', label: 'Author desk and ranks' }, { href: r('private'), label: 'Private research' }];
      if (can(d, 'researcher') || can(d, 'reviewer')) mine.push({ href: r('research'), label: 'Research desk' });
      if (d.findings) mine.push({ href: '/members/findings.html', label: 'Findings' });
      mine.push({ href: r('roles'), label: 'Ranks and awards' });
      if (can(d, 'moderator')) mine.push({ href: r('reports'), label: 'Reports' });
      if (can(d, 'moderator') && d.modlog) mine.push({ href: r('log'), label: 'Moderation log' });
      if (can(d, 'admin')) mine.push({ href: r('admin'), label: 'Notify list' });
      g.push({ heading: 'My tools', items: mine });
    }
    return g;
  }
  function commonsGroups(c) {
    return [{ heading: null, items: [
      { href: c.route('commons'), label: 'Commons' },
      { href: c.route('invite'), label: 'Invite someone' },
      { href: '/members/notifications.html', label: 'Notifications', bell: true }
    ] }];
  }
  // the bubbles, in order bottom to top, for this visitor. kind 'link' goes straight to a page; 'menu' opens a list.
  function spec(c) {
    var d = c.data, can = c.can;
    var right = [
      { key: 'home', label: 'Home', kind: 'link', href: d ? c.route('') : '/', top: true },
      { key: 'news', label: 'News', kind: 'link', href: '/news/' },
      { key: 'tools', label: 'Tools', kind: 'menu', groups: toolsGroups(c) }
    ];
    var left = [{ key: 'vote', label: 'VOTE!', kind: 'link', href: '/vote/' }];
    if (d) {
      if (can(d, 'moderator')) left.push({ key: 'review', label: 'Review', kind: 'link', href: c.route('review') });
      left.push({ key: 'commons', label: 'Commons', kind: 'menu', groups: commonsGroups(c) });
      left.push({ key: 'help', label: 'Help', kind: 'link', href: '/members/help.html' });
    }
    return { right: right, left: left };
  }

  // ---- building blocks ----
  function bubbleLink(s, current) {
    var a = el('a', { class: 'way-bubble', 'data-icon': s.key, href: s.href, 'aria-current': current === s.key ? 'page' : null });
    a.appendChild(icon(s.key)); a.appendChild(el('span', null, s.label));
    if (s.top) a.addEventListener('click', toTop);
    return a;
  }
  // Home also scrolls back to the top when you are already on it
  function toTop(ev) {
    var a = ev.currentTarget, u;
    try { u = new URL(a.href, location.href); } catch (e) { return; }
    var home = function (h) { return !h || h === '#' || h === '#/'; };
    if (u.pathname === location.pathname && (u.hash === location.hash || (home(u.hash) && home(location.hash)))) {
      ev.preventDefault();
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
  function list(groups, onGo) {
    var ul = el('ul', { class: 'wb-pop-list' });
    groups.forEach(function (g) {
      if (g.heading) ul.appendChild(el('li', { class: 'wb-pop-h' }, g.heading));
      g.items.forEach(function (it) {
        var li = el('li'), a = el('a', { href: it.href, 'aria-current': it.cur ? 'page' : null }, it.label);
        if (it.bell) { a.textContent = ''; a.appendChild(el('span', null, it.label)); a.appendChild(el('span', { class: 'wb-bell-badge', hidden: '' })); setTimeout(function () { ctx.refreshUnread(a); }, 0); }
        a.addEventListener('click', onGo);
        li.appendChild(a); ul.appendChild(li);
      });
    });
    return ul;
  }
  // The visitor Log in / Sign up bubble (the site's existing artwork, kept as it is)
  function authBubble() {
    var auth = el('span', { class: 'wb-dock-auth wb-bubble wb-bub-auth' });
    var base = '/members/art/bubble-login';
    auth.appendChild(el('img', { class: 'wb-art', src: base + '-1x.webp', srcset: base + '-1x.webp 1x, ' + base + '-2x.webp 2x', alt: '', 'aria-hidden': 'true', width: '120', height: '120', decoding: 'async' }));
    auth.appendChild(el('a', { href: '/members/', class: 'wb-dock-login' }, 'Log in'));
    auth.appendChild(el('span', { 'aria-hidden': 'true' }, '/'));
    auth.appendChild(el('a', { href: ctx.route('signup'), class: 'wb-dock-signup' }, 'Sign up'));
    return auth;
  }

  // ---- open and close ----
  function placePop(btn, pop, side) {
    var r = btn.getBoundingClientRect(), vh = window.innerHeight, gap = 10;
    pop.style.maxHeight = Math.max(160, vh - 24) + 'px';
    pop.style.top = '0px';
    var h = pop.offsetHeight;
    pop.style.top = Math.max(12, Math.min(r.top, vh - h - 12)) + 'px';
    if (side === 'right') { pop.style.right = Math.max(8, window.innerWidth - r.left + gap) + 'px'; pop.style.left = 'auto'; }
    else { pop.style.left = Math.max(8, r.right + gap) + 'px'; pop.style.right = 'auto'; }
  }
  function closeAll(returnFocus) {
    if (!openId) return;
    var b = openBtn;
    document.querySelectorAll('.wb-bub-gen [aria-expanded="true"]').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
    document.querySelectorAll('.wb-bub-gen .wb-pop:not([hidden]), .wb-bub-gen .wb-fan:not([hidden])').forEach(function (x) { x.hidden = true; });
    openId = null; openBtn = null; nested = null;
    if (returnFocus && b && document.body.contains(b)) b.focus();
  }
  function toggle(btn, pop, id, side) {
    if (openId === id) { closeAll(true); return; }
    closeAll(false);
    openId = id; openBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    pop.hidden = false;
    if (side) placePop(btn, pop, side);
    var first = pop.querySelector('a,button'); if (first && !btn.getAttribute('data-nofocus')) first.focus();
  }
  function menuBubble(s, side, current) {
    var id = 'wb-pop-' + (++uid);
    var wrap = el('div', { class: 'wb-bub-wrap wb-bub-gen wb-desk wb-bub-' + s.key });
    var b = el('button', { type: 'button', class: 'way-bubble', 'data-icon': s.key, 'aria-expanded': 'false', 'aria-haspopup': 'true', 'aria-controls': id });
    if (current === s.key) b.setAttribute('aria-current', 'page');
    b.appendChild(icon(s.key)); b.appendChild(el('span', null, s.label));
    var pop = el('div', { class: 'wb-pop', id: id, role: 'group', 'aria-label': s.label, hidden: '' });
    pop.appendChild(list(s.groups, function () { closeAll(false); }));
    b.addEventListener('click', function () { toggle(b, pop, id, side); });
    wrap.appendChild(b); wrap.appendChild(pop);
    return wrap;
  }
  // phone: one collapsed bubble per side; it opens a labelled list, and a group (Tools, Commons) replaces the list with a Back row
  function phoneSide(side, specs, current, extra) {
    var key = side === 'right' ? 'explore' : 'my-side', label = side === 'right' ? 'Explore' : 'My side';
    var id = 'wb-fan-' + (++uid);
    var wrap = el('div', { class: 'wb-bub-wrap wb-bub-gen wb-phone wb-bub-' + key });
    var b = el('button', { type: 'button', class: 'way-bubble', 'data-icon': key, 'aria-expanded': 'false', 'aria-haspopup': 'true', 'aria-controls': id });
    b.appendChild(icon(key)); b.appendChild(el('span', null, label));
    var fan = el('div', { class: 'wb-fan wb-fan-' + side, id: id, role: 'group', 'aria-label': label, hidden: '' });
    function paint(group) {
      var ul = el('ul', { class: 'wb-fan-list' });
      function row(inner, node) { var li = el('li'); li.appendChild(node); ul.appendChild(li); return li; }
      if (group) {
        var back = el('button', { type: 'button', class: 'wb-fan-row wb-fan-back' });
        back.appendChild(el('span', { 'aria-hidden': 'true' }, '‹'));
        back.appendChild(el('span', null, 'Back'));
        back.addEventListener('click', function () { nested = null; paint(null); var f = fan.querySelector('a,button'); if (f) f.focus(); });
        row(0, back);
        group.groups.forEach(function (g) {
          if (g.heading) ul.appendChild(el('li', { class: 'wb-pop-h' }, g.heading));
          g.items.forEach(function (it) {
            var a = el('a', { class: 'wb-fan-row', href: it.href }, it.label);
            if (it.bell) { a.textContent = ''; a.appendChild(el('span', null, it.label)); a.appendChild(el('span', { class: 'wb-bell-badge', hidden: '' })); setTimeout(function () { ctx.refreshUnread(a); }, 0); }
            a.addEventListener('click', function () { closeAll(false); });
            row(0, a);
          });
        });
      } else {
        specs.forEach(function (s) {
          if (s.kind === 'menu') {
            var m = el('button', { type: 'button', class: 'wb-fan-row', 'aria-haspopup': 'true' });
            m.appendChild(icon(s.key)); m.appendChild(el('span', null, s.label)); m.appendChild(el('span', { class: 'wb-fan-go', 'aria-hidden': 'true' }, '›'));
            m.addEventListener('click', function () { nested = s.key; paint(s); var f = fan.querySelector('a,button'); if (f) f.focus(); });
            row(0, m);
          } else {
            var a = el('a', { class: 'wb-fan-row', href: s.href, 'aria-current': current === s.key ? 'page' : null });
            a.appendChild(icon(s.key)); a.appendChild(el('span', null, s.label));
            a.addEventListener('click', function (ev) { if (s.top) toTop(ev); closeAll(false); });
            row(0, a);
          }
        });
        if (extra) { var li = el('li', { class: 'wb-fan-extra' }); li.appendChild(extra()); ul.appendChild(li); }
      }
      fan.replaceChildren(ul);
    }
    paint(null);
    b.addEventListener('click', function () { nested = null; paint(null); toggle(b, fan, id, null); });
    wrap.appendChild(b); wrap.appendChild(fan);
    return wrap;
  }

  // ---- hidden links: a bubble the member hid keeps its links in a small "Hidden links" list on the same side (never copied) ----
  function hiddenBubble(side, items) {
    var id = 'wb-pop-' + (++uid);
    var wrap = el('div', { class: 'wb-bub-wrap wb-bub-gen wb-desk wb-bub-hidden' });
    var b = el('button', { type: 'button', class: 'wb-small', 'aria-expanded': 'false', 'aria-haspopup': 'true', 'aria-controls': id, 'aria-label': 'Hidden links' });
    b.appendChild(el('span', { 'aria-hidden': 'true' }, '…'));
    var pop = el('div', { class: 'wb-pop', id: id, role: 'group', 'aria-label': 'Hidden links', hidden: '' });
    pop.appendChild(list([{ heading: 'Hidden links', items: items }], function () { closeAll(false); }));
    b.addEventListener('click', function () { toggle(b, pop, id, side); });
    wrap.appendChild(b); wrap.appendChild(pop);
    return wrap;
  }
  function flat(s) {
    if (s.kind === 'link') return [{ href: s.href, label: s.label === 'VOTE!' ? 'VOTE!' : s.label }];
    var out = []; s.groups.forEach(function (g) { g.items.forEach(function (i) { out.push(i); }); });
    return out;
  }

  // ---- build everything ----
  function build() {
    document.querySelectorAll('.wb-bub-gen').forEach(function (n) { n.remove(); });
    openId = null; openBtn = null; nested = null;
    if (!ctx || ctx.pending) { document.documentElement.classList.remove('wb-has-bubs'); return; }
    var cur = OWNER[ctx.cur] || '', hide = hidden(), s = spec(ctx);
    var dock = document.querySelector('.wb-dock');
    if (!dock) return;
    var vr = s.right.filter(function (x) { return hide.indexOf(x.key) < 0; }), vl = s.left.filter(function (x) { return hide.indexOf(x.key) < 0; });
    var hr = [], hl = [];
    s.right.forEach(function (x) { if (hide.indexOf(x.key) >= 0) hr = hr.concat(flat(x)); });
    s.left.forEach(function (x) { if (hide.indexOf(x.key) >= 0) hl = hl.concat(flat(x)); });
    // desktop, right side (Pull a thread is the existing bubble in the dock; the dock orders them)
    vr.forEach(function (x) {
      var node;
      if (x.kind === 'menu') node = menuBubble(x, 'right', cur);
      else { node = el('div', { class: 'wb-bub-wrap wb-bub-gen wb-desk wb-bub-' + x.key }); node.appendChild(bubbleLink(x, cur)); }
      dock.appendChild(node);
    });
    if (hr.length) dock.appendChild(hiddenBubble('right', hr));
    // desktop, left side
    var nav = el('nav', { class: 'wb-bubs-l wb-bub-gen', 'aria-label': 'Quick links, left' });
    vl.forEach(function (x) {
      var node;
      if (x.kind === 'menu') node = menuBubble(x, 'left', cur);
      else { node = el('div', { class: 'wb-bub-wrap wb-desk wb-bub-' + x.key }); node.appendChild(bubbleLink(x, cur)); }
      nav.appendChild(node);
    });
    if (hl.length) nav.appendChild(hiddenBubble('left', hl));
    if (!ctx.data) { var aw = el('div', { class: 'wb-bub-wrap wb-desk wb-bub-auth-wrap' }); aw.appendChild(authBubble()); nav.appendChild(aw); }
    // phone: Explore (right) and My side (left)
    var pr = vr.slice(); pr.splice(2, 0, { key: 'thread', label: 'Pull a thread', kind: 'link', href: ctx.thread });
    var thr = pr.filter(function (x) { return x.key !== 'thread' || !/^\/members\/(pull-a-thread|thread-queue)/.test(location.pathname); });
    var order = ['home', 'news', 'thread', 'tools'];   // top of the list is Home on a phone too
    thr.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    if (hr.length) thr.push({ key: 'hidden', label: 'Hidden links', kind: 'menu', groups: [{ items: hr }] });
    var lpl = vl.slice(); if (hl.length) lpl.push({ key: 'hidden', label: 'Hidden links', kind: 'menu', groups: [{ items: hl }] });
    dock.appendChild(phoneSide('right', thr, cur));
    nav.appendChild(phoneSide('left', lpl, cur, ctx.data ? null : function () { var w = el('div', { class: 'wb-fan-auth' }); w.appendChild(authBubble()); return w; }));
    document.body.appendChild(nav);
    document.documentElement.classList.add('wb-has-bubs');
  }

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && openId) { ev.stopImmediatePropagation(); closeAll(true); } }, true);
  document.addEventListener('click', function (ev) { if (openId && !(ev.target.closest && ev.target.closest('.wb-bub-wrap'))) closeAll(false); });
  window.addEventListener('resize', function () { if (openId) closeAll(false); });
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) closeAll(false); });
  // While someone types on a phone, the bubbles step aside, so they never sit on the keyboard or on the field.
  document.addEventListener('focusin', function (ev) {
    var t = ev.target;
    if (t && t.matches && t.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=""],[contenteditable="true"]')) document.documentElement.classList.add('wb-typing');
  });
  document.addEventListener('focusout', function () { setTimeout(function () {
    var a = document.activeElement;
    if (!(a && a.matches && a.matches('input,textarea,select,[contenteditable]'))) document.documentElement.classList.remove('wb-typing');
  }, 50); });

  window.WayBubbles = { render: function (c) { ctx = c; build(); }, keys: KEYS };
})();
