// The Way: one top bar for every page (member area, Findings, guides, maps, case pages, splash).
// Drop-in: <link rel="stylesheet" href="/members/waybar.css?v=1"> in <head>,
//          <header id="waybar" class="waybar">…fallback links…</header> first in <body>,
//          <script src="/members/waybar.js?v=1" defer></script>.
// Signed in, desktop: logo centered · section links, a "More" button and Invite · search · your name (account menu).
// Signed in, phone: a compact header (logo, search, account) and a bottom bar with Vote, Commons, Contribute, More.
// Signed out: logo and public sections, search, "Log in" and "Sign up"; on a phone the sections sit in a Menu panel.
// Vote, Contribute, More and the signed-out Menu all open the SAME side panel (from the right, next to its trigger).
// The member area writes what the bar needs to localStorage ("theway.bar": display name, roles, which tabs exist,
// your ballot link). That is only for drawing links; every page and the database still check the real sign-in themselves.
(function () {
  'use strict';
  var KEY = 'theway.bar';
  var ROLES = ['admin', 'super_admin', 'moderator', 'researcher', 'reviewer', 'editor'];
  var GUIDE = /^\/preview\/pages\/guide(-[a-z]{2})?\/$/;
  var STATES = '/preview/pages/states/';
  var GOV = '/preview/pages/how-government-works.html';
  var path = location.pathname;
  var inMembers = path.indexOf('/members/') === 0;
  var appPage = /^\/members\/(index\.html)?$/.test(path); // the member app itself (hash routes)

  function clean(d) {
    if (!d || d.v !== 1 || typeof d.name !== 'string' || !d.name.trim()) return null;
    return {
      v: 1,
      name: d.name.trim().slice(0, 40),
      roles: Array.isArray(d.roles) ? d.roles.filter(function (r) { return ROLES.indexOf(r) >= 0; }) : [],
      findings: d.findings === true,
      modlog: d.modlog === true,
      ballot: typeof d.ballot === 'string' && GUIDE.test(d.ballot) ? d.ballot : null,
      state: typeof d.state === 'string' ? d.state.trim().slice(0, 30) : ''
    };
  }
  function stored() {
    try {
      var session = false;
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) { session = true; break; }
      }
      return session ? clean(JSON.parse(localStorage.getItem(KEY) || 'null')) : null;
    } catch (e) { return null; }
  }
  function save(d) {
    try { d ? localStorage.setItem(KEY, JSON.stringify(clean(d))) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  var route = function (r) { return (appPage ? '#/' : '/members/#/') + r; };
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  // Small line icons, drawn in script (no images, nothing inline in the page): 24x24 paths, stroked in the link colour.
  var ICONS = {
    vote: 'M5 4h14v16H5z M9 12l2 2 4-4',
    ballot: 'M5 4h14v16H5z M9 12l2 2 4-4',
    myballot: 'M6 3h9l3 3v15H6z M9 11h6 M9 15h6',
    states: 'M5 21V4 M5 5h13l-2 4 2 4H5',
    commons: 'M4 5h16v11H9l-5 4z',
    contribute: 'M12 5v14 M5 12h14',
    more: 'M5 12h.01 M12 12h.01 M19 12h.01',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0',
    thread: 'M4 18c5-11 8 3 12-6 1.5-4.5 2.5-5 4-6',
    search: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z M15.5 15.5L20 20',
    news: 'M5 4h12v16H5z M17 8h3v10a2 2 0 0 1-2 2 M8 8h6 M8 12h6 M8 16h4',
    cases: 'M3 9l9-5 9 5 M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 20h18',
    casestudies: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M8 7h7',
    'research-lib': 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
    invite: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M3 20a6 6 0 0 1 12 0 M18 8v6 M15 11h6',
    roles: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.5 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z',
    reports: 'M5 21V4 M5 5h12l-2 4 2 4H5',
    log: 'M5 5h14 M5 10h14 M5 15h14 M5 20h9',
    govworks: 'M12 3l9 4v2H3V7z M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 21h18',
    admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    review: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M8 12l3 3 5-6',
    research: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z M14 7l3 3',
    author: 'M6 3h9l3 3v15H6z M9 12h6 M9 16h4',
    private: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3',
    findings: 'M9 4h6v3H9z M7 5H5v16h14V5h-2 M9 13l2 2 4-4',
    user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
    close: 'M6 6l12 12 M18 6L6 18',
    menu: 'M4 7h16 M4 12h16 M4 17h16',
    login: 'M14 4h5v16h-5 M4 12h11 M11 8l4 4-4 4',
    about: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 11v6 M12 7.5h.01'
  };
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'wb-ico');
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.more);
    s.appendChild(p);
    return s;
  }
  // Site search in the bar on every page: a plain form that sends the visitor to /search/?q=... (done in script,
  // because some pages' security policy does not allow a form to submit).
  function searchForm(inputId) {
    inputId = inputId || 'wb-q';
    var f = el('form', { class: 'wb-search', role: 'search', action: '/search/', method: 'get' });
    var lab = el('label', { class: 'wb-sr', for: inputId }, 'Search the whole site');
    var inp = el('input', { id: inputId, type: 'search', name: 'q', placeholder: 'Search', autocomplete: 'off', maxlength: '120' });
    var m = /^\/search\/?$/.test(path) && /[?&]q=([^&]*)/.exec(location.search);
    if (m) { try { inp.value = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { /* ignore */ } }
    var btn = el('button', { type: 'submit', 'aria-label': 'Search' });
    btn.appendChild(el('span', { 'aria-hidden': 'true', class: 'wb-glass' }));
    f.appendChild(lab); f.appendChild(inp); f.appendChild(btn);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = inp.value.trim();
      location.href = '/search/' + (v ? '?q=' + encodeURIComponent(v) : '');
    });
    return f;
  }
  function here() {
    var bar = document.getElementById('waybar');
    var set = bar && bar.getAttribute('data-here');
    if (set) return set;
    var h = appPage ? (location.hash || '#/') : '';
    if (/^#\/cases/.test(h) || /^\/preview\/pages\/cases/.test(path)) return 'cases';
    if (/^\/preview\/pages\/how-government-works/.test(path)) return 'govworks';
    if (/^\/preview\/pages\/case-studies/.test(path)) return 'casestudies';
    if (/^\/research\//.test(path)) return 'research-lib';
    if (/^\/search\//.test(path)) return 'search';
    if (/^\/members\/pull-a-thread/.test(path)) return 'thread';
    if (/^\/preview\/pages\/news/.test(path)) return 'news';
    if (/^\/preview\/pages\/(foundation|founder|deeper)/.test(path)) return 'about';
    if (/^\/members\/my-ballot/.test(path)) return 'myballot';
    if (/^\/members\/author/.test(path)) return 'author';
    if (/^\/members\/findings/.test(path)) return 'findings';
    if (/^\/members\/(discuss|read-checks)/.test(path)) return 'commons';
    if (/^#\/private/.test(h)) return 'private';
    if (/^#\/research/.test(h) || /^#\/projects/.test(h)) return 'research';
    if (/^#\/map/.test(h) || /^\/preview\/pages\/map/.test(path)) return 'map';
    if (/^\/preview\/pages\/states/.test(path)) return 'states';
    if (/^\/preview\/pages\/(guide|map)/.test(path)) return 'ballot';
    if (/^#\/(commons|c\/|t\/)/.test(h)) return 'commons';
    if (/^#\/invite/.test(h)) return 'invite';
    if (/^#\/review/.test(h)) return 'review';
    if (/^#\/reports/.test(h)) return 'reports';
    if (/^#\/log/.test(h)) return 'log';
    if (/^#\/admin/.test(h)) return 'admin';
    if (/^#\/roles/.test(h)) return 'roles';
    if (/^#\/?$/.test(h) && appPage) return 'home';
    if (/^#\/(account|password)/.test(h)) return 'me';
    return '';
  }

  // ---- what the menus hold (one list, used by the bottom bar, the side panel and the desktop links) ----
  var THREAD = '/members/pull-a-thread.html';
  var NOTES = '/members/notifications.html';
  // Bell with the unread count. The count is asked for at most once a minute and kept in localStorage ("theway.unread");
  // notifications.html keeps it current. No DMs: notices come only from the site.
  function bellLink(cur) {
    var a = el('a', { class: 'wb-bell', href: NOTES, 'aria-label': 'Notifications', 'aria-current': /^\/members\/notifications/.test(path) ? 'page' : null });
    a.appendChild(icon('bell'));
    a.appendChild(el('span', { class: 'wb-bell-badge', hidden: '' }));
    setTimeout(function () { refreshUnread(a); }, 0);
    return a;
  }
  function showUnread(a, n) {
    var b = a.querySelector('.wb-bell-badge'); if (!b) return;
    b.hidden = !(n > 0); b.textContent = n > 99 ? '99+' : String(n);
    a.setAttribute('aria-label', n > 0 ? 'Notifications, ' + n + ' unread' : 'Notifications');
  }
  function refreshUnread(a) {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('theway.unread') || 'null'); } catch (e) { /* none */ }
    if (cached && typeof cached.n === 'number') showUnread(a, cached.n);
    if (cached && Date.now() - cached.t < 60000) return;
    var tok = null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (/^sb-.+-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && v.access_token && (!v.expires_at || v.expires_at * 1000 > Date.now())) tok = v.access_token; }
      }
    } catch (e) { return; }
    if (!tok) return;
    var go = function () {
      var cfg = window.THE_WAY_CONFIG; if (!cfg) return;
      fetch(cfg.supabaseUrl + '/rest/v1/rpc/my_unread_count', { method: 'POST', headers: { apikey: cfg.supabaseAnonKey, authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (n) { if (typeof n === 'number') { try { localStorage.setItem('theway.unread', JSON.stringify({ n: n, t: Date.now() })); } catch (e) { /* ignore */ } showUnread(a, n); } })
        .catch(function () { /* the bell just stays as it was */ });
    };
    if (window.THE_WAY_CONFIG) go();
    else { var sc = document.createElement('script'); sc.src = '/members/config.js?v=40'; sc.onload = go; document.head.appendChild(sc); }
  }
  function can(d, r) { return d.roles.indexOf(r) >= 0 || d.roles.indexOf('admin') >= 0; }
  function memberPanels(d) {
    var st = d.state;
    var vote = [{ items: [
      { href: d.ballot || STATES, label: st ? st + ' voter guide' : 'Voter guide', desc: d.ballot ? 'What is on your ballot, from official sources' : 'Pick your state to see its ballot', icon: 'ballot', key: 'ballot' },
      { href: '/members/my-ballot.html', label: 'My ballot', desc: 'Your picks and notes, saved in this browser', icon: 'myballot', key: 'myballot' },
      { href: STATES, label: 'Other states', desc: 'Voter guides for every state', icon: 'states', key: 'states' }
    ] }];
    var contribute = [];
    if (can(d, 'moderator')) contribute.push({ href: route('review'), label: 'Review sources', desc: 'Check each claim in a case against its sources', icon: 'review', key: 'review' });
    if (can(d, 'researcher') || can(d, 'reviewer')) contribute.push({ href: route('research'), label: 'Research desk', desc: 'Write and check findings with the member team', icon: 'research', key: 'research' });
    contribute.push({ href: '/members/author.html', label: 'Author tools', desc: 'Send an article or a source, and see your rank', icon: 'author', key: 'author' });
    contribute.push({ href: route('private'), label: 'Private research', desc: 'Your own notes and team files, never published', icon: 'private', key: 'private' });
    var explore = [
      { href: '/preview/pages/news/', label: 'News', desc: 'The feed and the time machine', icon: 'news', key: 'news' },
      { href: '/preview/pages/cases/', label: 'Civics & History', desc: 'History cases, every source shown', icon: 'cases', key: 'cases' },
      { href: GOV, label: 'Government', desc: 'Who does what, and where to go', icon: 'govworks', key: 'govworks' },
      { href: '/preview/pages/case-studies/', label: 'Case Studies', icon: 'casestudies', key: 'casestudies' },
      { href: '/research/', label: 'Research', desc: 'The public research library', icon: 'research-lib', key: 'research-lib' },
      { href: THREAD, label: 'Pull a Thread', desc: 'Send us a link, a screenshot or a question to check', icon: 'thread', key: 'thread' },
      { href: route('map'), label: 'Map', desc: 'Every state at a glance', icon: 'map', key: 'map' }
    ];
    if (d.findings) explore.push({ href: '/members/findings.html', label: 'Findings', desc: 'What members checked, with the verdict', icon: 'findings', key: 'findings' });
    var community = [
      { href: route('invite'), label: 'Invite someone', icon: 'invite', key: 'invite' },
      { href: NOTES, label: 'Notifications', desc: 'Replies and updates for you', icon: 'bell', key: 'notes' },
      { href: route('roles'), label: 'Ranks & awards', desc: 'Author, Deshi and Renshi, and points', icon: 'roles', key: 'roles' }
    ];
    var manage = [];
    if (can(d, 'moderator')) manage.push({ href: route('reports'), label: 'Reports', icon: 'reports', key: 'reports' });
    if (d.modlog) manage.push({ href: route('log'), label: 'Moderation log', icon: 'log', key: 'log' });
    if (can(d, 'admin')) manage.push({ href: route('admin'), label: 'Admin', icon: 'admin', key: 'admin' });
    var more = [{ heading: 'Explore', items: explore }, { heading: 'Community', items: community }];
    if (manage.length) more.push({ heading: 'Manage', items: manage });
    return {
      vote: { title: 'Vote', groups: vote },
      contribute: { title: 'Contribute', groups: [{ items: contribute }] },
      more: { title: 'More', groups: more }
    };
  }
  function publicPanel() {
    return { title: 'Menu', groups: [
      { heading: 'Explore', items: [
        { href: STATES, label: 'Voter Guide', icon: 'ballot', key: 'ballot' },
        { href: '/preview/pages/news/', label: 'News', icon: 'news', key: 'news' },
        { href: '/preview/pages/cases/', label: 'Civics & History', icon: 'cases', key: 'cases' },
        { href: GOV, label: 'Government', icon: 'govworks', key: 'govworks' },
        { href: '/preview/pages/case-studies/', label: 'Case Studies', icon: 'casestudies', key: 'casestudies' },
        { href: '/research/', label: 'Research', icon: 'research-lib', key: 'research-lib' },
        { href: THREAD, label: 'Pull a Thread', icon: 'thread', key: 'thread' },
        { href: '/preview/pages/deeper.html', label: 'Why?', icon: 'about', key: 'about' }
      ] },
      { heading: 'Your account', items: [
        { href: '/members/', label: 'Log in', icon: 'login', key: 'login' },
        { href: route('signup'), label: 'Sign up', icon: 'invite', key: 'signup' }
      ] }
    ] };
  }
  var BAR_GROUP = {
    vote: ['ballot', 'myballot', 'states'],
    commons: ['commons'],
    contribute: ['review', 'research', 'author', 'private']
  };
  function groupOf(key) {
    for (var g in BAR_GROUP) if (BAR_GROUP[g].indexOf(key) >= 0) return g;
    return key && key !== 'home' && key !== 'me' && key !== 'search' ? 'more' : '';
  }

  // ---- the side panel (Vote, Contribute, More, and the signed-out Menu) ----
  var layer = null, panel = null, scrim = null, bottom = null;
  var openKind = null, lastTrigger = null, panels = {};
  function ensureLayer() {
    if (layer) return;
    layer = el('div', { class: 'wb-layer', hidden: '' });
    scrim = el('div', { class: 'wb-scrim' });
    scrim.addEventListener('click', function () { closePanel(true); });
    panel = el('aside', { class: 'wb-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wb-panel-title', tabindex: '-1' });
    layer.appendChild(scrim); layer.appendChild(panel);
    document.body.appendChild(layer);
  }
  function link(href, label, key, cur) {
    var a = el('a', { href: href, 'aria-current': key && key === cur ? 'page' : null });
    a.textContent = label;
    return a;
  }
  function fillPanel(kind) {
    var spec = panels[kind]; if (!spec) return false;
    var cur = here();
    var head = el('div', { class: 'wb-panel-head' });
    head.appendChild(el('h2', { id: 'wb-panel-title' }, spec.title));
    var close = el('button', { type: 'button', class: 'wb-close' });
    close.appendChild(icon('close')); close.appendChild(el('span', null, 'Close'));
    close.addEventListener('click', function () { closePanel(true); });
    head.appendChild(close);
    var kids = [head];
    spec.groups.forEach(function (g) {
      var sec = el('section', { class: 'wb-group' });
      if (g.heading) sec.appendChild(el('h3', null, g.heading));
      var ul = el('ul');
      g.items.forEach(function (it) {
        var li = el('li');
        var a = el('a', { href: it.href, 'aria-current': it.key === cur ? 'page' : null });
        a.appendChild(icon(it.icon));
        var t = el('span', { class: 'wb-item-text' });
        t.appendChild(el('span', { class: 'wb-item-label' }, it.label));
        if (it.desc) t.appendChild(el('span', { class: 'wb-item-desc' }, it.desc));
        a.appendChild(t);
        a.addEventListener('click', function () { closePanel(false); });
        li.appendChild(a); ul.appendChild(li);
      });
      sec.appendChild(ul); kids.push(sec);
    });
    panel.replaceChildren.apply(panel, kids);
    return true;
  }
  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n === layer || n.tagName === 'SCRIPT') return;
      if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
    });
  }
  function triggers() { return document.querySelectorAll('[data-wb-panel]'); }
  function syncTriggers() {
    Array.prototype.forEach.call(triggers(), function (t) {
      t.setAttribute('aria-expanded', t.getAttribute('data-wb-panel') === openKind ? 'true' : 'false');
    });
  }
  function openPanel(kind, trigger) {
    ensureLayer();
    if (openKind) closePanel(false, true);
    if (!fillPanel(kind)) return;
    openKind = kind; lastTrigger = trigger || null;
    layer.hidden = false;
    document.documentElement.classList.add('wb-lock');
    setInert(true);
    syncTriggers();
    var first = panel.querySelector('.wb-close');
    if (first) first.focus();
    panel.scrollTop = 0;
  }
  function closePanel(returnFocus, quiet) {
    if (!openKind) return;
    var kind = openKind, t = lastTrigger;
    openKind = null; lastTrigger = null;
    layer.hidden = true;
    document.documentElement.classList.remove('wb-lock');
    setInert(false);
    syncTriggers();
    if (returnFocus && !quiet) {
      var again = t && document.body.contains(t) ? t : document.querySelector('[data-wb-panel="' + kind + '"]');
      if (again) again.focus();
    }
  }
  function trapTab(ev) {
    if (!openKind || ev.key !== 'Tab') return;
    var f = panel.querySelectorAll('a[href],button:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  function panelButton(kind, label, cls, iconName) {
    var b = el('button', { type: 'button', class: cls, 'data-wb-panel': kind, 'aria-haspopup': 'dialog', 'aria-expanded': openKind === kind ? 'true' : 'false' });
    if (iconName) b.appendChild(icon(iconName));
    b.appendChild(el('span', { class: 'wb-label' }, label));
    b.addEventListener('click', function () {
      if (openKind === kind) closePanel(true); else openPanel(kind, b);
    });
    return b;
  }

  var data = null, pending = false, searchOpen = false;
  function render(d, opts) {
    var bar = document.getElementById('waybar');
    if (!bar) return;
    if (d !== undefined) { data = d ? clean(d) : null; pending = !!(opts && opts.pending); }
    var cur = here();
    var wasOpen = openKind;
    if (wasOpen) closePanel(false, true);
    bar.classList.add('waybar');
    bar.classList.toggle('wb-in', !!data);
    bar.classList.toggle('wb-search-open', searchOpen);
    var logo = link(data ? route('') : '/', 'The Way'); // signed in: member Home; signed out: the public front page
    logo.className = 'wb-logo';
    var kids = [logo];
    panels = {};
    if (data) {
      panels = memberPanels(data);
      var home = link(route(''), 'Home', 'home', cur);
      home.className = 'wb-home';
      // Desktop section links (a phone shows the bottom bar instead).
      var mid = el('nav', { class: 'wb-mid', 'aria-label': 'Sections' });
      mid.appendChild(link(data.ballot || STATES, 'Voter Guide', 'ballot', cur));
      mid.appendChild(link('/preview/pages/news/', 'News', 'news', cur));
      mid.appendChild(link('/preview/pages/cases/', 'Civics & History', 'cases', cur));
      mid.appendChild(link('/preview/pages/case-studies/', 'Case Studies', 'casestudies', cur));
      mid.appendChild(link('/research/', 'Research', 'research-lib', cur));
      mid.appendChild(link(THREAD, 'Pull a Thread', 'thread', cur));
      mid.appendChild(link(route('commons'), 'Commons', 'commons', cur));
      if (can(data, 'researcher') || can(data, 'reviewer')) mid.appendChild(link(route('research'), 'Research desk', 'research', cur));
      if (can(data, 'moderator')) mid.appendChild(link(route('review'), 'Review sources', 'review', cur));
      var moreBtn = panelButton('more', 'More', 'wb-more-link');
      mid.appendChild(moreBtn);
      var right = el('nav', { class: 'wb-right', 'aria-label': 'You' });
      var inv = link(route('invite'), 'Invite', 'invite', cur);
      inv.className = 'wb-invite';
      right.appendChild(inv);
      var sb = el('button', { type: 'button', class: 'wb-search-toggle', 'aria-label': 'Search', 'aria-expanded': searchOpen ? 'true' : 'false', 'aria-controls': 'wb-q' });
      sb.appendChild(icon('search'));
      sb.addEventListener('click', function () {
        searchOpen = !searchOpen;
        bar.classList.toggle('wb-search-open', searchOpen);
        sb.setAttribute('aria-expanded', searchOpen ? 'true' : 'false');
        syncWave();
        if (searchOpen) { var i = document.getElementById('wb-q'); if (i) i.focus(); }
      });
      right.appendChild(sb);
      right.appendChild(searchForm());
      right.appendChild(bellLink(cur));
      // Account menu: only personal things (your account, sign out). Everything else is in the menus above.
      var who = el('div', { class: 'wb-who' });
      var btn = el('button', { type: 'button', class: 'wb-name', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        'aria-label': 'Account: ' + data.name, 'aria-current': cur === 'me' ? 'page' : null, title: 'Your account' });
      btn.appendChild(el('span', { class: 'wb-avatar', 'aria-hidden': 'true' }, Array.from(data.name)[0].toUpperCase()));
      btn.appendChild(el('span', { class: 'wb-name-text' }, data.name));
      btn.appendChild(el('span', { class: 'wb-caret', 'aria-hidden': 'true' }, '▾'));
      var menu = el('ul', { class: 'wb-menu', hidden: '' });
      var item = function (href, label) { var li = el('li'); li.appendChild(link(href, label)); menu.appendChild(li); };
      menu.appendChild(el('li', { class: 'wb-menu-name' }, data.name));
      item(route('account'), 'Your account');
      item(NOTES, 'Notifications');
      menu.appendChild(el('li', { class: 'wb-sep', role: 'separator' }));
      item(route('signout'), 'Sign out');
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleMenu(btn, menu); });
      who.appendChild(btn); who.appendChild(menu); right.appendChild(who);
      kids.push(home, mid, right);
      renderBottom(cur);
    } else if (!pending) {
      panels = { menu: publicPanel() };
      var pub = el('nav', { class: 'wb-pub', 'aria-label': 'Sections' });
      pub.appendChild(link(STATES, 'Voter Guide', 'ballot', cur));
      pub.appendChild(link('/preview/pages/news/', 'News', 'news', cur));
      pub.appendChild(link('/preview/pages/cases/', 'Civics & History', 'cases', cur));
      pub.appendChild(link(GOV, 'Government', 'govworks', cur));
      pub.appendChild(link('/preview/pages/case-studies/', 'Case Studies', 'casestudies', cur));
      pub.appendChild(link('/research/', 'Research', 'research-lib', cur));
      pub.appendChild(link(THREAD, 'Pull a Thread', 'thread', cur));
      var menuBtn = panelButton('menu', 'Menu', 'wb-menu-btn', 'menu');
      var tools = el('div', { class: 'wb-tools' });
      tools.appendChild(searchForm('wb-top-q'));
      var auth = el('nav', { class: 'wb-auth', 'aria-label': 'Account' });
      auth.appendChild(link('/members/', 'Log in', 'login', cur)).className = 'wb-login';
      auth.appendChild(link(route('signup'), 'Sign up', 'signup', cur)).className = 'wb-signup';
      tools.appendChild(auth);
      kids.push(pub, menuBtn, tools);
    }
    if (!data) renderBottom(cur);
    bar.replaceChildren.apply(bar, kids);
    document.documentElement.classList.toggle('wb-has-bottom', !!data);
    signedOutNow = !data && !pending;
    syncFloating();
    syncWave();
    if (wasOpen && panels[wasOpen]) {
      var again = document.querySelector('[data-wb-panel="' + wasOpen + '"]');
      openPanel(wasOpen, again);
    }
  }
  // Phone bottom bar for members: Vote, Commons, Contribute, More. No Home item (the logo is Home).
  function renderBottom(cur) {
    if (!data) { if (bottom) { bottom.remove(); bottom = null; } return; }
    if (!bottom) {
      bottom = el('nav', { class: 'wb-bottom', 'aria-label': 'Main' });
      document.body.appendChild(bottom);
    }
    var active = groupOf(cur);
    var tab = function (kind, label, iconName) {
      var b = panelButton(kind, label, 'wb-tab', iconName);
      if (active === kind) b.setAttribute('aria-current', 'page');
      return b;
    };
    var commons = link(route('commons'), 'Commons', 'commons', cur);
    commons.className = 'wb-tab';
    commons.textContent = '';
    commons.appendChild(icon('commons')); commons.appendChild(el('span', { class: 'wb-label' }, 'Commons'));
    bottom.replaceChildren(tab('vote', 'Vote', 'vote'), commons, tab('contribute', 'Contribute', 'contribute'), tab('more', 'More', 'more'));
  }
  // The water's crest sits just under the bar so waves never cover navigation text (on a phone the bar is taller).
  function syncWave() {
    var bar = document.getElementById('waybar'), w = document.querySelector('.michi-surface');
    if (!bar || !w) return;
    document.body.classList.toggle('wb-in-page', !!data);
    var phone = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
    w.style.top = phone || data ? Math.max(40, bar.offsetHeight - 6) + 'px' : '';
  }
  window.addEventListener('resize', function () { syncWave(); });
  // One small "Back to surface" button after scrolling (search and Log in / Sign up live in the header).
  // The Pull a Thread floating link: ChatGPT's text-free hand (art/pull-a-thread-hand-*.webp, decorative) plus a real printed
  // label. It goes bottom left on every page except the Pull a Thread pages themselves. A plain link, no script behind it.
  // Bottom left dock: Log in / Sign up (signed-out visitors only), then Pull a thread. "Back to surface" is bottom right.
  var signedOutNow = false;
  function syncDock() {
    var dock = document.querySelector('.wb-dock');
    var fab = document.querySelector('.wb-thread-fab');
    var onThread = /^\/members\/(pull-a-thread|thread-queue|notifications)/.test(path);
    document.documentElement.classList.toggle('wb-signed-out', signedOutNow);
    if (!signedOutNow && onThread) { if (dock) dock.remove(); return; }
    if (!dock) { dock = el('nav', { class: 'wb-dock', 'aria-label': 'Log in and Pull a thread' }); document.body.appendChild(dock); }
    var auth = dock.querySelector('.wb-dock-auth');
    if (signedOutNow && !auth) {
      auth = el('span', { class: 'wb-dock-auth' });
      auth.appendChild(el('a', { href: '/members/', class: 'wb-dock-login' }, 'Log in'));
      auth.appendChild(el('span', { 'aria-hidden': 'true' }, '/'));
      auth.appendChild(el('a', { href: route('signup'), class: 'wb-dock-signup' }, 'Sign up'));
      dock.insertBefore(auth, dock.firstChild);
    } else if (!signedOutNow && auth) auth.remove();
    if (onThread) { if (fab) fab.remove(); return; }
    if (fab) return;
    fab = el('a', { class: 'wb-thread-fab', href: THREAD });
    var img = el('img', { src: '/members/art/pull-a-thread-hand-120.webp', srcset: '/members/art/pull-a-thread-hand-120.webp 1x, /members/art/pull-a-thread-hand-240.webp 2x',
                          alt: '', 'aria-hidden': 'true', width: '120', height: '102', decoding: 'async', loading: 'lazy' });
    fab.appendChild(img);
    fab.appendChild(el('span', { class: 'wb-thread-fab-label' }, 'Pull a thread'));
    dock.appendChild(fab);
  }
  // A small down-arrow bubble hides the floating buttons; the same bubble (arrow up) brings them back. The choice is remembered.
  var BUBBLES = 'theway.bubbles';
  function bubblesOff() { try { return localStorage.getItem(BUBBLES) === 'off'; } catch (e) { return false; } }
  function paintToggle(btn, off) {
    document.documentElement.classList.toggle('wb-bubbles-off', off);
    btn.setAttribute('aria-expanded', off ? 'false' : 'true');
    btn.setAttribute('aria-label', off ? 'Show the floating buttons' : 'Hide the floating buttons');
    btn.title = off ? 'Show the floating buttons' : 'Hide the floating buttons';
  }
  function syncToggle() {
    var btn = document.querySelector('.wb-bubbles-toggle');
    if (!btn) {
      btn = el('button', { type: 'button', class: 'wb-bubbles-toggle' });
      var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), pth = document.createElementNS(ns, 'path');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      pth.setAttribute('d', 'M6 9l6 6 6-6'); pth.setAttribute('fill', 'none'); pth.setAttribute('stroke', 'currentColor'); pth.setAttribute('stroke-width', '2.5');
      pth.setAttribute('stroke-linecap', 'round'); pth.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pth); btn.appendChild(svg);
      btn.addEventListener('click', function () {
        var off = !document.documentElement.classList.contains('wb-bubbles-off');
        try { off ? localStorage.setItem(BUBBLES, 'off') : localStorage.removeItem(BUBBLES); } catch (e) { /* private mode: it just will not be remembered */ }
        paintToggle(btn, off);
      });
      document.body.appendChild(btn);
    }
    paintToggle(btn, bubblesOff());
  }
  function syncFloating() {
    syncToggle();
    syncDock();
    var floating = document.querySelector('.wb-floating');
    if (!floating) {
      floating = el('nav', { class: 'wb-floating', 'aria-label': 'Quick links' });
      floating.appendChild(el('a', { href: '#waybar', class: 'wb-floating-return' }, 'Back to surface'));
      document.body.appendChild(floating);
      document.body.classList.add('wb-floating-ready');
      var updateFloatingVisibility = function () { floating.hidden = window.scrollY <= 80; };
      window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
      updateFloatingVisibility();
    }
  }
  function toggleMenu(btn, menu, force) {
    var show = force != null ? force : menu.hidden;
    menu.hidden = !show;
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  }
  function closeMenus(returnFocus) {
    var bar = document.getElementById('waybar'); if (!bar) return;
    var m = bar.querySelector('.wb-menu'), b = bar.querySelector('.wb-name');
    if (m && b && !m.hidden) { toggleMenu(b, m, false); if (returnFocus) b.focus(); }
  }
  document.addEventListener('click', function (ev) { if (!ev.target.closest || !ev.target.closest('.wb-who')) closeMenus(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (openKind) { closePanel(true); return; }
      closeMenus(true);
      if (searchOpen) {
        searchOpen = false;
        var bar = document.getElementById('waybar'), t = bar && bar.querySelector('.wb-search-toggle');
        if (bar) bar.classList.remove('wb-search-open');
        if (t) { t.setAttribute('aria-expanded', 'false'); t.focus(); }
        syncWave();
      }
    }
    trapTab(ev);
  });
  window.addEventListener('hashchange', function () { closePanel(false); closeMenus(); render(); });
  // Coming back with the browser's Back button must not show a panel left open.
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) closePanel(false); });

  // "Member discussion" link under guide measures/candidates and history cases (discuss-link.js decides which pages).
  if (!inMembers && /^\/preview\/pages\/(guide(-[a-z]{2})?|cases)\//.test(path)) {
    var dcss = document.createElement('link'); dcss.rel = 'stylesheet'; dcss.href = '/members/discuss.css?v=1'; document.head.appendChild(dcss);
    var dl = document.createElement('script'); dl.src = '/members/discuss-link.js?v=1'; document.body.appendChild(dl);
  }

  // Cloudflare Web Analytics on every public page that carries the bar (not the member area).
  if (!inMembers && !document.querySelector('script[data-cf-beacon]')) {
    var cf = document.createElement('script');
    cf.defer = true;
    cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cf.setAttribute('data-cf-beacon', '{"token": "d7281223266b45dd905b3f994da3fd0e"}');
    document.head.appendChild(cf);
  }
  window.WayBar = { render: render, save: save, read: stored };
  // Reuse the original Why The Way water on pages without their own ocean.
  function addOriginalOcean() {
    if (document.querySelector('.surface') || document.querySelector('.michi-ocean-water')) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/shared-ocean.css?v=5'; document.head.appendChild(css);
    var water = document.createElement('div'); water.className = 'michi-ocean-water';
    water.setAttribute('aria-hidden', 'true');
    water.innerHTML = "<div aria-hidden=\"true\" class=\"michi-surface\"><svg preserveAspectRatio=\"none\" viewBox=\"0 0 1200 160\"><defs><linearGradient id=\"michi-crest\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\"><stop stop-color=\"#e8ffff\" stop-opacity=\".85\"/><stop offset=\".18\" stop-color=\"#aceff8\" stop-opacity=\".42\"/><stop offset=\"1\" stop-color=\"#c4ffff\" stop-opacity=\"0\"/></linearGradient></defs><g class=\"michi-water-sheet\"><path d=\"M0 35 Q70 8 150 30 T300 25 T450 31 T600 25 T750 29 T900 24 T1050 31 T1200 22 L1200 160 L0 160 Z\" fill=\"url(#michi-crest)\" opacity=\".54\"/><path d=\"M0 35 Q70 8 150 30 T300 25 T450 31 T600 25 T750 29 T900 24 T1050 31 T1200 22\" fill=\"none\" stroke=\"#ebffff\" stroke-opacity=\".82\" stroke-width=\"2.4\"/></g><g class=\"michi-water-sheet two\"><path d=\"M0 43 Q105 12 200 38 T400 35 T600 41 T800 32 T1000 42 T1200 29\" fill=\"none\" stroke=\"#d2ffff\" stroke-opacity=\".48\" stroke-width=\"2\"/><path d=\"M0 59 Q65 43 145 57 T320 54 T490 64 T680 58 T900 62 T1080 57 T1200 58\" fill=\"none\" stroke=\"#c6f8ff\" stroke-opacity=\".24\" stroke-width=\"1.4\"/></g><g class=\"michi-water-sheet three\"><path d=\"M0 83 Q80 64 175 79 T370 75 T590 82 T805 78 T1000 85 T1200 75\" fill=\"none\" stroke=\"#c3fbfc\" stroke-opacity=\".17\" stroke-width=\"1.6\"/></g></svg></div>\n<div class=\"michi-caustics\"></div><div class=\"michi-caustics second\"></div><div class=\"michi-shafts\"></div><div class=\"michi-bubbles\"></div>\n";
    document.body.classList.add('michi-ocean-active');
    document.body.insertBefore(water, document.body.firstChild);
    syncWave();
  }
  // My Ballot: on voter-guide pages, load the pick/save controls (browser-only; see ballot-store.js).
  if (/^\/preview\/pages\/guide(-[a-z]{2})?\//.test(path) && !inMembers) {
    var bcss = document.createElement('link'); bcss.rel = 'stylesheet'; bcss.href = '/members/ballot-pick.css?v=3'; document.head.appendChild(bcss);
    var bstore = document.createElement('script'); bstore.src = '/members/ballot-store.js?v=5';
    bstore.onload = function () { var bp = document.createElement('script'); bp.src = '/members/ballot-pick.js?v=7'; document.body.appendChild(bp); };
    document.body.appendChild(bstore);
  }
  var start = function () {
    addOriginalOcean(); render(stored());
    // One document-anchored whale on each page, sharing the cached asset.
    if (!document.querySelector('link[href^="/whale.css"]')) {
      var whaleCss = document.createElement('link');
      whaleCss.rel = 'stylesheet'; whaleCss.href = '/whale.css?v=4';
      document.head.appendChild(whaleCss);
    }
    if (!document.querySelector('script[src^="/whale.js"]')) {
      var whaleScript = document.createElement('script');
      whaleScript.src = '/whale.js?v=4';
      document.head.appendChild(whaleScript);
    }
    if (!document.querySelector('script[src^="/preview/pages/footer-quick.js"]')) {
      var footerScript = document.createElement('script');
      footerScript.src = '/preview/pages/footer-quick.js?v=1';
      document.head.appendChild(footerScript);
    }
  };
  // "Follow / email me updates" link at the foot of measure, candidate, case, research and state pages
  if (!inMembers && path !== '/' && !document.querySelector('script[src^="/members/follow-link.js"]')) {
    var followScript = document.createElement('script');
    followScript.src = '/members/follow-link.js?v=2';
    followScript.defer = true;
    document.head.appendChild(followScript);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
