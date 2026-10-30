// The Way: the two bubble menus (right: Home, News, Pull a thread, Tools; left: VOTE!, Review, Commons, Help).
// Loaded by waybar.js, which hands over what it knows (signed in or out, roles, links) through WayBubbles.render(ctx).
// Structure and behaviour live here and in bubbles.css. The LOOK (glass, icon colour, motion, badges) lives only in
// bubbles-look.css, so the artwork can be swapped without touching this file. Icons are small inline SVG, kept in ICON below.
// Phones: each side collapses into one bubble (Explore on the right, Your Way on the left) that opens a labelled list.
// No inline scripts or styles anywhere; positions are set with the CSS object model, which the page security policy allows.
(function () {
  'use strict';
  // v6 artwork (ChatGPT, 30 Oct). Gradient and filter ids are made unique per copy in icon(), because an icon can appear twice on a page.
  var ICON = {
    "home": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-home\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#f3d8a2\"/><stop offset=\".45\" stop-color=\"#f3d8a2\"/><stop offset=\"1\" stop-color=\"#a96838\"/></linearGradient><filter id=\"shadow-home\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-home)\" stroke=\"#f3d8a2\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-home)\"><path d=\"M5 31h38l-5 9H10z\"/><g class=\"roof\"><path d=\"M9 21 24 9l15 12z\"/></g><path d=\"M12 21h24v10H12z\"/><path fill=\"#173a49\" stroke=\"#efd59e\" d=\"M16 24h6v4h-6zM26 24h6v4h-6z\"/><path fill=\"none\" stroke=\"#9fe3ee\" stroke-width=\"1.6\" d=\"M5 44q4.75-3 9.5 0t9.5 0 9.5 0 9.5 0\"/></g></svg>",
    "news": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-news\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#fff0c9\"/><stop offset=\".45\" stop-color=\"#fff0c9\"/><stop offset=\"1\" stop-color=\"#9e8a66\"/></linearGradient><filter id=\"shadow-news\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-news)\" stroke=\"#fff0c9\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-news)\"><path d=\"m10 7 27 3v31L10 38z\"/><path d=\"m37 14 6 1v25l-6 1z\"/><path fill=\"#288b9b\" d=\"m15 13 16 2v7l-16-2z\"/><g class=\"lines\" stroke=\"#554b42\"><path d=\"m15 25 16 2m-16 4 16 2m-16 3 10 1\"/></g></g></svg>",
    "tools": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-tools\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#f2c469\"/><stop offset=\".45\" stop-color=\"#f2c469\"/><stop offset=\"1\" stop-color=\"#8b6429\"/></linearGradient><filter id=\"shadow-tools\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-tools)\" stroke=\"#f2c469\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-tools)\"><g class=\"gear\"><rect x=\"30\" y=\"12\" width=\"12\" height=\"30\" rx=\"6\"/><path d=\"M36 12V8M33 8h6\"/><path d=\"M5 20a3 3 0 0 1 3-3h20a3 3 0 0 1 3 3v8a6 6 0 0 1-6 6h-3l-2-3-2 3h-3a6 6 0 0 1-6-6z\"/><path fill=\"#183744\" stroke=\"#f8de9d\" d=\"M9 21h8v6a4 4 0 0 1-4 3 4 4 0 0 1-4-3zM19 21h8v6a4 4 0 0 1-4 3 4 4 0 0 1-4-3z\"/><path fill=\"none\" stroke=\"#92c6d2\" d=\"M11 23h2M21 23h2\"/></g></g></svg>",
    "vote": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-vote\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#d7c1f0\"/><stop offset=\".45\" stop-color=\"#d7c1f0\"/><stop offset=\"1\" stop-color=\"#8263a6\"/></linearGradient><filter id=\"shadow-vote\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-vote)\" stroke=\"#d7c1f0\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-vote)\"><path d=\"m8 28 15-6 18 6-15 7z\"/><path d=\"m8 28 18 7v10L8 38zM26 35l15-7v10l-15 7z\"/><g class=\"ballot\"><path fill=\"#fff3d8\" stroke=\"#d6c398\" d=\"m18 4 16 2-2 22-16-2z\"/><path class=\"check\" fill=\"none\" stroke=\"#d52e35\" stroke-width=\"3\" d=\"m20 16 4 4 6-8\"/></g></g></svg>",
    "review": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-review\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#9ed6ad\"/><stop offset=\".45\" stop-color=\"#9ed6ad\"/><stop offset=\"1\" stop-color=\"#34785e\"/></linearGradient><filter id=\"shadow-review\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-review)\" stroke=\"#9ed6ad\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-review)\"><path fill=\"#f4e6c8\" stroke=\"#d3c19b\" d=\"M9 6h23l6 7v29H9z\"/><path fill=\"#d4c3a0\" d=\"M32 6v9h6\"/><path fill=\"none\" stroke=\"#a28c69\" d=\"M14 15h11M14 21h12M14 27h8\"/><g class=\"reply\"><circle cx=\"32\" cy=\"33\" r=\"12\"/><path class=\"check\" fill=\"none\" stroke=\"#efffda\" stroke-width=\"3\" d=\"m25 33 5 5 9-11\"/></g></g></svg>",
    "commons": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-commons\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#99d9f0\"/><stop offset=\".45\" stop-color=\"#99d9f0\"/><stop offset=\"1\" stop-color=\"#397999\"/></linearGradient><filter id=\"shadow-commons\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-commons)\" stroke=\"#99d9f0\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-commons)\"><path d=\"M5 8h28v21H18l-9 7v-7H5z\"/><g class=\"reply\"><path fill=\"#d5a985\" stroke=\"#f3d5b7\" d=\"M21 23h23v18h-6v5l-7-5H21z\"/></g><path fill=\"none\" stroke=\"#edfcff\" d=\"M11 15h16M11 21h10\"/></g></svg>",
    "help": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-help\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#f24b4b\"/><stop offset=\".45\" stop-color=\"#f24b4b\"/><stop offset=\"1\" stop-color=\"#a31525\"/></linearGradient><filter id=\"shadow-help\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-help)\" stroke=\"#f24b4b\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-help)\"><g class=\"ring\"><circle cx=\"24\" cy=\"24\" r=\"19\"/><circle fill=\"#153e4c\" stroke=\"#fff8ec\" cx=\"24\" cy=\"24\" r=\"12\"/><path fill=\"none\" stroke=\"#fff8ec\" stroke-width=\"5\" d=\"M11 11l5 5M32 32l5 5M11 37l5-5M32 16l5-5\"/></g><path fill=\"none\" stroke=\"#fff7d9\" d=\"M20 20c0-6 9-6 9 0 0 3-5 3-5 7M24 31h.1\"/></g></svg>",
    "my-side": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"water-way\" x2=\".7\" y2=\"1\"><stop stop-color=\"#77ccdc\"/><stop offset=\".5\" stop-color=\"#238fa9\"/><stop offset=\"1\" stop-color=\"#10566f\"/></linearGradient><linearGradient id=\"path-way\" x2=\".7\" y2=\"1\"><stop stop-color=\"#fff0b8\"/><stop offset=\"1\" stop-color=\"#d1a568\"/></linearGradient></defs><path fill=\"url(#water-way)\" stroke=\"#a2e0e0\" stroke-width=\".8\" d=\"M4 9Q24 1 44 9v32Q24 47 4 41z\"/><g class=\"water-waves\" fill=\"none\" stroke=\"#b2ebed\" stroke-width=\"1.3\" opacity=\".8\"><path d=\"M6 13q5-3 10 0t10 0t10 0t7 0M5 23q5-3 10 0t10 0t10 0t8 0M5 34q5-3 10 0t10 0t10 0t8 0\"/></g><path class=\"water-path\" fill=\"url(#path-way)\" stroke=\"#fff0c3\" stroke-width=\".7\" d=\"M17 44c-4-9 4-11 10-17s-7-10-7-15 5-5 5-7h3c0 4-5 5-4 8s15 8 9 16-10 9-7 16z\"/><path class=\"path-light\" fill=\"none\" stroke=\"#fff9d8\" stroke-width=\"1.7\" stroke-linecap=\"round\" d=\"M22 41c-1-7 8-10 8-14s-9-9-8-14 5-5 5-7\"/></svg>",
    "explore": "<svg viewBox=\"0 0 48 48\" aria-hidden=\"true\" focusable=\"false\"><defs><linearGradient id=\"paint-explore\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#b7dca3\"/><stop offset=\".45\" stop-color=\"#b7dca3\"/><stop offset=\"1\" stop-color=\"#668b56\"/></linearGradient><filter id=\"shadow-explore\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"220%\"><feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"1.2\" flood-color=\"#001420\" flood-opacity=\".85\"/></filter></defs><g fill=\"url(#paint-explore)\" stroke=\"#b7dca3\" stroke-width=\"1.1\" stroke-linejoin=\"round\" stroke-linecap=\"round\" filter=\"url(#shadow-explore)\"><g class=\"fan\"><rect x=\"16\" y=\"7\" width=\"27\" height=\"8\" rx=\"3\"/><rect fill=\"#8bbaca\" x=\"16\" y=\"20\" width=\"27\" height=\"8\" rx=\"3\"/><rect fill=\"#d4b38a\" x=\"16\" y=\"33\" width=\"27\" height=\"8\" rx=\"3\"/><circle cx=\"7\" cy=\"11\" r=\"3\"/><circle fill=\"#8bbaca\" cx=\"7\" cy=\"24\" r=\"3\"/><circle fill=\"#d4b38a\" cx=\"7\" cy=\"37\" r=\"3\"/></g></g></svg>",
    "hidden": "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M10 24h.1M24 24h.1M38 24h.1\"/></g></svg>"
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
  var iconN = 0;
  function icon(name) {
    var n = ++iconN, h = (ICON[name] || '').replace(/\bid="([^"]+)"/g, 'id="$1-' + n + '"').replace(/url\(#([^)]+)\)/g, 'url(#$1-' + n + ')');
    var s = document.createElement('span'); s.innerHTML = h; return s.firstChild || document.createElement('span');
  }
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
      { key: 'news', label: 'News', kind: 'link', href: '/news/' }
    ];
    if (d) right.push({ key: 'tools', label: 'Tools', kind: 'menu', groups: toolsGroups(c) }); // Tools is for members; visitors have the header links
    var left = [{ key: 'vote', label: 'VOTE!', kind: 'link', href: '/vote/' }];
    if (d) {
      if (can(d, 'moderator')) left.push({ key: 'review', label: 'Review', kind: 'link', href: c.route('review') });
      left.push({ key: 'commons', label: 'Commons', kind: 'menu', groups: commonsGroups(c) });
    }
    left.push({ key: 'help', label: 'Help', kind: 'link', href: '/members/help.html' });
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
  // Phones: the list sits over the bottom of the screen, so the page gets room below its content while a list is open and can be
  // scrolled up past it. Wide screens: the pop-up sits in the empty strip beside the bubbles and does not move the page.
  function reserve(pop, side) {
    unreserve();
    if (!side) document.body.style.paddingBottom = (pop.offsetHeight + 110) + 'px';
  }
  function unreserve() { var b = document.body; b.style.paddingRight = ''; b.style.paddingLeft = ''; b.style.paddingBottom = ''; }
  function closeAll(returnFocus) {
    if (!openId) return;
    unreserve();
    var b = openBtn;
    var cl = b && b.querySelector('[data-closed-label]'); if (cl) cl.textContent = cl.getAttribute('data-closed-label');
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
    reserve(pop, side);
    var cl = btn.querySelector('[data-closed-label]'); if (cl) cl.textContent = 'Close tools';
    var first = pop.querySelector('a,button'); if (first && !btn.getAttribute('data-nofocus')) first.focus();
  }
  function menuBubble(s, side, current) {
    var id = 'wb-pop-' + (++uid);
    var wrap = el('div', { class: 'wb-bub-wrap wb-bub-gen wb-desk wb-bub-' + s.key });
    var b = el('button', { type: 'button', class: 'way-bubble', 'data-icon': s.key, 'aria-expanded': 'false', 'aria-haspopup': 'true', 'aria-controls': id });
    if (current === s.key) b.setAttribute('aria-current', 'page');
    b.appendChild(icon(s.key)); b.appendChild(el('span', s.key === 'tools' ? { 'data-closed-label': s.label } : null, s.label));
    var pop = el('div', { class: 'wb-pop', id: id, role: 'group', 'aria-label': s.label, hidden: '' });
    pop.appendChild(list(s.groups, function () { closeAll(false); }));
    b.addEventListener('click', function () { toggle(b, pop, id, side); });
    wrap.appendChild(b); wrap.appendChild(pop);
    return wrap;
  }
  // phone: one collapsed bubble per side; it opens a labelled list, and a group (Tools, Commons) replaces the list with a Back row
  function phoneSide(side, specs, current, extra) {
    var key = side === 'right' ? 'explore' : 'my-side', label = side === 'right' ? 'Explore' : 'Your Way';
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
    // phone: Explore (right) and Your Way (left)
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
