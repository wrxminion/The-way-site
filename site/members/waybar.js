// The Way: one top bar for every page (member area, Findings, guides, maps, case pages, splash).
// Drop-in: <link rel="stylesheet" href="/members/waybar.css?v=25"> in <head>,
//          <header id="waybar" class="waybar">…fallback links…</header> first in <body>,
//          <script src="/members/waybar.js?v=48" defer></script>.
// Desktop, signed in or out: the same header. Voter Guide, News, Civics & History | THE WAY | Government, Election Studies, Research,
//   then Pull a thread, search and the account (Log in and Sign up, or a small Menu button, the bell and your name).
// Signed in, phone: a compact header (logo, search, account). The bottom bar is gone: the two bubble menus replace it.
// Signed out phone: a Menu panel holds the sections, search, "Log in" and "Sign up".
// The two bubble menus (right: Home, News, Pull a thread, Tools; left: VOTE!, Review, Commons, Help; on a phone Explore and
// Your Way) are drawn by bubbles.js, which this file loads and feeds (see WayBubbles.render below).
// The header Menu button and the signed-out Menu open the side panel (from the right, next to its trigger).
// The member area writes what the bar needs to localStorage ("theway.bar": display name, roles, which tabs exist,
// your ballot link). That is only for drawing links; every page and the database still check the real sign-in themselves.
(function () {
  'use strict';
  var KEY = 'theway.bar';
  var ROLES = ['admin', 'super_admin', 'moderator', 'researcher', 'reviewer', 'editor'];
  var GUIDE = /^\/guide(-[a-z]{2})?\/$/;
  var STATES = '/states/';
  var GOV = '/how-government-works.html';
  var TEACH = '/teacher-parent.html';
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
    teacherparent: 'M12 4l10 5-10 5-10-5z M6 12v4c0 2 3 3 6 3s6-1 6-3v-4',
    admin: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    review: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M8 12l3 3 5-6',
    research: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z M14 7l3 3',
    author: 'M6 3h9l3 3v15H6z M9 12h6 M9 16h4',
    private: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3',
    findings: 'M9 4h6v3H9z M7 5H5v16h14V5h-2 M9 13l2 2 4-4',
    user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
    close: 'M6 6l12 12 M18 6L6 18',
    menu: 'M4 7h16 M4 12h16 M4 17h16',
    home: 'M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6',
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
  // The Pull a Thread link in the signed-out header is ChatGPT's artwork (the words drawn as the thread, a hand pulling it).
  // The words are real text to a screen reader through the image's alt text.
  // The thread lettering in the menus. Slack at rest; on mouse over and keyboard focus the thread is pulled taut once (about a second)
  // and stays taut until the pointer or focus leaves. Reduced motion gets the taut still and no animation; touch gets the slack still.
  function threadArt(a) {
    a.textContent = '';
    var ART = '/members/art/thread-', reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var still = function (n) { return ART + n + '-240.webp?v=2 1x, ' + ART + n + '-480.webp?v=2 2x'; };
    var img = el('img', { class: 'wb-pat-img', src: ART + (reduce ? 'taut' : 'slack') + '-240.webp?v=2', srcset: still(reduce ? 'taut' : 'slack'), alt: 'Pull a Thread', width: '136', height: '43', decoding: 'async' });
    if (!reduce) {
      var PULL = ART + 'pull-480.webp?v=3', pre = new Image();
      var pull = function () { img.removeAttribute('srcset'); img.src = PULL; };   // no blank step: the picture is already loaded, so nothing flashes
      var rest = function () { img.src = ART + 'slack-240.webp?v=2'; img.srcset = still('slack'); };
      a.addEventListener('mouseenter', pull); a.addEventListener('focus', pull);
      a.addEventListener('mouseleave', rest); a.addEventListener('blur', rest);
      if (!(navigator.connection && navigator.connection.saveData)) { pre.decoding = 'async'; pre.src = PULL; }   // load it now so the first hover does not wait
    }
    a.appendChild(img);
    return a;
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
    if (/^#\/cases/.test(h) || /^\/cases/.test(path)) return 'cases';
    if (/^\/how-government-works/.test(path)) return 'govworks';
    if (/^\/teacher-parent/.test(path)) return 'teacherparent';
    if (/^\/case-studies/.test(path)) return 'casestudies';
    if (/^\/research\//.test(path)) return 'research-lib';
    if (/^\/search\//.test(path)) return 'search';
    if (/^\/members\/pull-a-thread/.test(path)) return 'thread';
    if (/^\/results/.test(path)) return 'results';
    if (/^\/news/.test(path)) return 'news';
    if (/^\/(foundation|founder|deeper)/.test(path)) return 'about';
    if (/^\/vote\//.test(path)) return 'vote';
    if (/^\/members\/help/.test(path)) return 'help';
    if (/^\/members\/notifications/.test(path)) return 'notes';
    if (/^\/members\/my-ballot/.test(path)) return 'myballot';
    if (/^\/members\/author/.test(path)) return 'author';
    if (/^\/members\/findings/.test(path)) return 'findings';
    if (/^\/members\/(discuss|read-checks)/.test(path)) return 'commons';
    if (/^#\/private/.test(h)) return 'private';
    if (/^#\/research/.test(h) || /^#\/projects/.test(h)) return 'research';
    if (/^#\/map/.test(h) || /^\/map/.test(path)) return 'map';
    if (/^\/states/.test(path)) return 'states';
    if (/^\/(guide|map)/.test(path)) return 'ballot';
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
      { href: '/news/', label: 'News', desc: 'The feed and the time machine', icon: 'news', key: 'news', dup: true },
      { href: '/results/', label: 'Election results', desc: 'Unofficial, auto-fed, updated as counts come in', icon: 'ballot', key: 'results' },
      { href: STATES + '#pick', label: 'Map', desc: 'Every state at a glance', icon: 'map', key: 'map' },
      { href: '/cases/', label: 'Civics & History', desc: 'History cases, every source shown', icon: 'cases', key: 'cases' },
      { href: GOV, label: 'Government', desc: 'Who does what, and where to go', icon: 'govworks', key: 'govworks' },
      { href: '/case-studies/', label: 'Election Studies', icon: 'casestudies', key: 'casestudies' },
      { href: '/research/', label: 'Research', desc: 'The public research library', icon: 'research-lib', key: 'research-lib' },
      { href: TEACH, label: 'Teacher? Parent? Like to have fun?', desc: 'Meet Scuba Steve, who hunts the hallucination shark', icon: 'teacherparent', key: 'teacherparent' }
    ];
    if (d.findings) explore.push({ href: '/members/findings.html', label: 'Findings', desc: 'What members checked, with the verdict', icon: 'findings', key: 'findings' });
    var community = [
      { href: NOTES, label: 'Notifications', desc: 'Replies and updates for you', icon: 'bell', key: 'notes', dup: true },
      { href: route('commons'), label: 'Commons', desc: 'Threads and comments from members', icon: 'commons', key: 'commons' },
      { href: '/members/help.html', label: 'What do I do here?', desc: 'A short guide, in plain words', icon: 'roles', key: 'help' },
      { href: route('roles'), label: 'Ranks & awards', desc: 'Author, Deshi and Renshi, and points', icon: 'roles', key: 'roles' },
      { href: route('invite'), label: 'Invite someone', icon: 'invite', key: 'invite' }
    ];
    var manage = [];
    if (can(d, 'moderator')) manage.push({ href: route('reports'), label: 'Reports', icon: 'reports', key: 'reports', dup: true });
    if (d.modlog) manage.push({ href: route('log'), label: 'Moderation log', icon: 'log', key: 'log', dup: true });
    if (can(d, 'admin')) manage.push({ href: route('admin'), label: 'Admin', icon: 'admin', key: 'admin', dup: true });
    // "My tools" (a group at the top of the desktop Menu): the buttons that used to sit in the "Your tools" box on Home, same role rules.
    var tools = [];
    if (can(d, 'admin') || d.roles.indexOf('super_admin') >= 0) tools.push({ href: route('admin'), label: 'Admin', desc: 'Members, invitations, ledger checks, analytics, notify list', icon: 'admin', key: 'admin' });
    tools.push({ href: '/members/author.html', label: 'Author desk and ranks', desc: 'Send an article or a source, and see your rank', icon: 'author', key: 'author' });
    tools.push({ href: route('private'), label: 'Private research', desc: 'Your own notes and team files, never published', icon: 'private', key: 'private' });
    if (can(d, 'moderator')) tools.push({ href: route('review'), label: 'Review sources', desc: 'Check each claim in a case against its sources', icon: 'review', key: 'review' });
    if (can(d, 'researcher') || can(d, 'reviewer')) tools.push({ href: route('research'), label: 'Research desk', desc: 'Write and check findings with the member team', icon: 'research', key: 'research' });
    if (can(d, 'moderator')) tools.push({ href: route('reports'), label: 'Reports', icon: 'reports', key: 'reports' });
    if (can(d, 'moderator') && d.modlog) tools.push({ href: route('log'), label: 'Moderation log', icon: 'log', key: 'log' });
    var more = [{ heading: 'My tools', items: tools, desk: true }, { heading: 'Community', items: community }, { heading: 'Explore', items: explore }];
    if (manage.length) more.push({ heading: 'Manage', items: manage });
    return {
      vote: { title: 'Vote', groups: vote, home: true },
      contribute: { title: 'Contribute', groups: [{ items: contribute }], home: true },
      more: { title: 'Menu', groups: more, home: true }
    };
  }
  function publicPanel() {
    return { title: 'Menu', search: true, groups: [
      { heading: 'Explore', items: [
        { href: THREAD, label: 'Pull a Thread', icon: 'thread', key: 'thread', art: true },
        { href: STATES, label: 'Voter Guide', desc: 'Your state, your ballot', icon: 'ballot', key: 'ballot' },
        { href: '/members/my-ballot.html', label: 'My ballot', desc: 'Your picks and notes, saved in this browser', icon: 'myballot', key: 'myballot' },
        { href: '/results/', label: 'Election results', desc: 'Unofficial, auto-fed, updated as counts come in', icon: 'ballot', key: 'results' },
      { href: '/news/', label: 'News', desc: 'The feed and the time machine', icon: 'news', key: 'news' },
        { href: '/cases/', label: 'Civics & History', desc: 'History cases, every source shown', icon: 'cases', key: 'cases' },
        { href: GOV, label: 'Government', desc: 'Who does what, and where to go', icon: 'govworks', key: 'govworks' },
        { href: '/case-studies/', label: 'Election Studies', icon: 'casestudies', key: 'casestudies' },
        { href: '/research/', label: 'Research', desc: 'The public research library', icon: 'research-lib', key: 'research-lib' },
        { href: TEACH, label: 'Teacher? Parent? Like to have fun?', desc: 'Meet Scuba Steve, who hunts the hallucination shark', icon: 'teacherparent', key: 'teacherparent' }
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
    if (spec.search) { var sf = searchForm('wb-menu-q'); sf.className += ' wb-menu-search'; kids.push(sf); }
    // Items marked dup are already in the desktop header, the My tools group, the bell or a pill; they show only on a phone.
    var wide = window.matchMedia && window.matchMedia('(min-width:761px)').matches;
    spec.groups.forEach(function (g) {
      if (g.desk && !wide) return;
      if (wide && g.items.every(function (it) { return it.dup; })) return;
      var sec = el('section', { class: 'wb-group' });
      if (g.heading) sec.appendChild(el('h3', null, g.heading));
      var ul = el('ul');
      g.items.forEach(function (it) {
        if (wide && it.dup) return;
        var li = el('li');
        var a = el('a', { href: it.href, 'aria-current': it.key === cur ? 'page' : null });
        if (it.art) {
          a.className = 'wb-art-item';
          threadArt(a);
        } else {
          a.appendChild(icon(it.icon));
          var t = el('span', { class: 'wb-item-text' });
          t.appendChild(el('span', { class: 'wb-item-label' }, it.label));
          if (it.desc) t.appendChild(el('span', { class: 'wb-item-desc' }, it.desc));
          a.appendChild(t);
        }
        a.addEventListener('click', function () { closePanel(false); });
        li.appendChild(a); ul.appendChild(li);
      });
      sec.appendChild(ul); kids.push(sec);
    });
    // Members: a big Home button stuck to the bottom of the panel, so it is easy to reach with a thumb however long the list is.
    if (spec.home) {
      var foot = el('div', { class: 'wb-panel-foot' });
      var home = el('a', { class: 'wb-home', href: route(''), 'aria-current': cur === 'home' ? 'page' : null });
      home.appendChild(icon('home')); home.appendChild(el('span', null, 'Home'));
      home.addEventListener('click', function () { closePanel(false); });
      foot.appendChild(home); kids.push(foot);
    }
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

  // The one top header for everyone: left links, THE WAY, right links (the same for signed-in and signed-out visitors).
  // On a wide screen they sit in one row; on a narrower desktop the two groups sit in one line under the name.
  function sectionNav(cur, guide) {
    var pub = el('nav', { class: 'wb-pub', 'aria-label': 'Sections' });
    var pubL = el('div', { class: 'wb-pub-l' }), pubR = el('div', { class: 'wb-pub-r' });
    pubL.appendChild(link(guide, 'Voter Guide', 'ballot', cur));
    pubL.appendChild(link('/news/', 'News', 'news', cur));
    pubL.appendChild(link('/cases/', 'Civics & History', 'cases', cur));
    pubR.appendChild(link(GOV, 'Government', 'govworks', cur));
    pubR.appendChild(link('/case-studies/', 'Election Studies', 'casestudies', cur));
    pubR.appendChild(link('/research/', 'Research', 'research-lib', cur));
    pub.appendChild(pubL); pub.appendChild(pubR);
    return pub;
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
    // Pull a Thread sits on the right of the top row (desktop), first in the group with the search and account, so THE WAY stays dead centre.
    var pat = null;
    if (data || !pending) {
      pat = threadArt(link(THREAD, 'Pull a Thread', 'thread', cur));
      pat.className = 'wb-pat-right';
    }
    panels = {};
    if (data) {
      panels = memberPanels(data);
      // Desktop: the same section links as the signed-out header (a phone shows the bottom bar instead).
      var mid = sectionNav(cur, data.ballot || STATES);
      var right = el('nav', { class: 'wb-right', 'aria-label': 'You' });
      // The Invite pill moved to the bottom-left stack (help-panel.js); it is still in the Menu under Community.
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
      // A small Menu button (desktop): Community, My tools and the rest of the sections. A phone has the bottom bar.
      right.appendChild(panelButton('more', 'Menu', 'wb-more-link', 'menu'));
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
      menu.appendChild(el('li', { class: 'wb-sep', role: 'separator' }));
      item(route('signout'), 'Sign out');
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleMenu(btn, menu); });
      who.appendChild(btn); who.appendChild(menu); right.appendChild(who);
      if (pat) right.insertBefore(pat, right.firstChild);
      kids.push(mid, right); // no Home pill: the name at the top is the Home link
    } else if (!pending) {
      panels = { menu: publicPanel() };
      var pub = sectionNav(cur, STATES);
      var menuBtn = panelButton('menu', 'Menu', 'wb-menu-btn', 'menu');
      var tools = el('div', { class: 'wb-tools' });
      tools.appendChild(searchForm('wb-top-q'));
      var auth = el('nav', { class: 'wb-auth', 'aria-label': 'Account' });
      auth.appendChild(link('/members/', 'Log in', 'login', cur)).className = 'wb-login';
      auth.appendChild(link(route('signup'), 'Sign up', 'signup', cur)).className = 'wb-signup';
      tools.appendChild(auth);
      if (pat) tools.insertBefore(pat, tools.firstChild);
      kids.push(pub, menuBtn, tools);
    }
    bar.replaceChildren.apply(bar, kids);
    if (bottom) { bottom.remove(); bottom = null; }
    signedOutNow = !data && !pending;
    syncFloating();
    syncBubbles();
    syncWave();
    if (wasOpen && panels[wasOpen]) {
      var again = document.querySelector('[data-wb-panel="' + wasOpen + '"]');
      openPanel(wasOpen, again);
    }
  }
  // Hand the bubble menus what they need; they draw both sides (Home, News, Tools; VOTE!, Review, Commons, Help).
  function syncBubbles() {
    if (!window.WayBubbles) return;
    window.WayBubbles.render({ data: data, pending: pending, cur: here(), route: route, thread: THREAD, can: can, refreshUnread: refreshUnread });
  }
  function loadBubbles() {
    if (window.WayBubbles || document.querySelector('script[src^="/members/bubbles.js"]')) return;
    // draw the bubbles only when the styles AND the script are in, so neither side shows up bare and then jumps into place
    var waiting = 3, ready = function () { if (--waiting === 0) syncBubbles(); };
    ['bubbles.css?v=7', 'bubbles-look.css?v=10'].forEach(function (f) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/members/' + f; l.onload = l.onerror = ready; document.head.appendChild(l); });
    var sc = document.createElement('script'); sc.src = '/members/bubbles.js?v=14'; sc.onload = ready; sc.onerror = function () { document.documentElement.classList.remove('wb-bubs-building'); ready(); }; document.head.appendChild(sc);
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
  // Bottom right column, top to bottom: hide arrow, up hand (Back to surface), Log in / Sign up (signed-out visitors only), Pull a thread.
  var signedOutNow = false;
  // One bubble picture: a decorative image (the words inside it are repeated as real text, hidden or laid over it).
  function bubbleArt(name, w, h) {
    var mk = function (file, cls) {
      var base = '/members/art/bubble-' + file;
      return el('img', { class: cls, src: base + '-1x.webp', srcset: base + '-1x.webp 1x, ' + base + '-2x.webp 2x', alt: '', 'aria-hidden': 'true', width: String(w), height: String(h), decoding: 'async' });
    };
    // sizes come from the stylesheet (the page security policy blocks inline style attributes)
    if (name !== 'back') return mk(name, 'wb-art');
    // the diver is its own layer so it can swim up a little on hover; at rest the two layers look like one picture
    var stack = el('span', { class: 'wb-art-stack' });
    stack.appendChild(mk('back-base', 'wb-art'));
    stack.appendChild(mk('back-diver', 'wb-art wb-diver'));
    return stack;
  }
  // A few small decorative air bubbles rise behind the buttons. Not links, not read out, no pointer events; hidden for reduced motion.
  function syncRise() {
    if (document.querySelector('.wb-rise')) return;
    var r = el('div', { class: 'wb-rise', 'aria-hidden': 'true' });
    for (var i = 0; i < 9; i++) r.appendChild(el('i', {}));
    for (var k = 0; k < 6; k++) r.appendChild(el('i', { class: 'wb-b' }));
    document.body.appendChild(r);
    riseBurst();
  }
  // a few extra bubbles for about five seconds when the button bubbles appear
  var burstTimer = 0;
  function riseBurst() {
    var r = document.querySelector('.wb-rise'); if (!r) return;
    r.classList.remove('wb-burst'); void r.offsetWidth; r.classList.add('wb-burst');
    clearTimeout(burstTimer); burstTimer = setTimeout(function () { r.classList.remove('wb-burst'); }, 5500);
  }
  function syncDock() {
    if (!window.WayBubbles) {
      document.documentElement.classList.add('wb-bubs-building');
      // Fail open: the hold must never block navigation, so it lifts by itself if the bubbles never report in.
      setTimeout(function () { document.documentElement.classList.remove('wb-bubs-building'); }, 4000);
    }
    var dock = document.querySelector('.wb-dock');
    var fab = document.querySelector('.wb-thread-fab');
    var onThread = /^\/members\/(pull-a-thread|thread-queue)/.test(path);
    document.documentElement.classList.toggle('wb-signed-out', signedOutNow);
    if (!dock) { dock = el('nav', { class: 'wb-dock', 'aria-label': 'Quick links' }); document.body.appendChild(dock); }
    // Log in / Sign up now lives with the left bubbles (bubbles.js)
    var oldAuth = dock.querySelector('.wb-dock-auth'); if (oldAuth) oldAuth.remove();
    if (onThread) { if (fab) fab.remove(); return; }
    if (fab) return;
    fab = el('a', { class: 'wb-thread-fab', href: THREAD });
    // ChatGPT's clear bubble art: the lettering is part of the picture (decorative; the hidden text is the name).
    fab.className += ' wb-bubble';
    fab.appendChild(bubbleArt('pull', 150, 150));
    fab.appendChild(el('span', { class: 'wb-sr' }, 'Pull a thread'));
    dock.appendChild(fab);
  }
  // A small down-arrow bubble hides the floating buttons; the same bubble (arrow up) brings them back. The choice is remembered.
  var BUBBLES = 'theway.bubbles';
  function bubblesOff() { try { return localStorage.getItem(BUBBLES) === 'off'; } catch (e) { return false; } }
  function paintToggle(btn, off, hold) {
    if (!hold) document.documentElement.classList.toggle('wb-bubbles-off', off);
    btn.setAttribute('aria-expanded', off ? 'false' : 'true');
    btn.setAttribute('aria-label', off ? 'Show the floating buttons' : 'Hide the floating buttons');
    btn.title = off ? 'Show the floating buttons' : 'Hide the floating buttons';
  }
  // Bringing the buttons back: they float up one after another (about 0.7 s in all). The CSS holds the motion and respects reduced motion.
  function floatUp() {
    if (window.WayBubbles && window.WayBubbles.rise) window.WayBubbles.rise();
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
      var popping = false;
      btn.addEventListener('click', function () {
        if (popping) return;
        var off = !document.documentElement.classList.contains('wb-bubbles-off');
        try { off ? localStorage.setItem(BUBBLES, 'off') : localStorage.removeItem(BUBBLES); } catch (e) { /* private mode: it just will not be remembered */ }
        if (off && window.WayBubbles && window.WayBubbles.popAway) {
          // every bubble pops first, then they are gone (the choice is already saved)
          popping = true;
          paintToggle(btn, true, true);
          var finish = function () { popping = false; paintToggle(btn, true); };
          try { window.WayBubbles.popAway(finish); } catch (e) { finish(); }
          return;
        }
        paintToggle(btn, off);
        if (!off) { riseBurst(); floatUp(); }
      });
      var d = document.querySelector('.wb-dock'); (d || document.body).appendChild(btn);
    }
    paintToggle(btn, bubblesOff());
  }
  function syncFloating() {
    syncDock();
    syncToggle();
    syncRise();
    var floating = document.querySelector('.wb-floating');
    if (!floating) {
      floating = el('nav', { class: 'wb-floating', 'aria-label': 'Quick links' });
      // a hand pointing up, no printed text (the hand is a placeholder until ChatGPT's art lands); the name is for screen readers
      var back = el('a', { href: '#waybar', class: 'wb-floating-return' });
      back.appendChild(bubbleArt('back', 104, 104));
      back.appendChild(el('span', { class: 'wb-sr' }, 'Back to surface'));
      floating.appendChild(back);
      (document.querySelector('.wb-dock') || document.body).appendChild(floating);
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
  if (!inMembers && /^\/(guide(-[a-z]{2})?|cases)\//.test(path)) {
    var dcss = document.createElement('link'); dcss.rel = 'stylesheet'; dcss.href = '/members/discuss.css?v=2'; document.head.appendChild(dcss);
    var dl = document.createElement('script'); dl.src = '/members/discuss-link.js?v=1'; document.body.appendChild(dl);
  }

  // Help is now a bubble on the left (bubbles.js); the old floating "What do I do here?" button and the Invite and My ballot pills are gone.

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
  if (/^\/guide(-[a-z]{2})?\//.test(path) && !inMembers) {
    var bcss = document.createElement('link'); bcss.rel = 'stylesheet'; bcss.href = '/members/ballot-pick.css?v=6'; document.head.appendChild(bcss);
    var bstore = document.createElement('script'); bstore.src = '/members/ballot-store.js?v=6';
    bstore.onload = function () { var bp = document.createElement('script'); bp.src = '/members/ballot-pick.js?v=8'; document.body.appendChild(bp); };
    document.body.appendChild(bstore);
  }
  var start = function () {
    addOriginalOcean(); loadBubbles(); render(stored());
    // One document-anchored whale on each page, sharing the cached asset.
    if (!document.querySelector('link[href^="/whale.css"]')) {
      var whaleCss = document.createElement('link');
      whaleCss.rel = 'stylesheet'; whaleCss.href = '/whale.css?v=4';
      document.head.appendChild(whaleCss);
    }
    if (!document.querySelector('script[src^="/whale.js"]')) {
      var whaleScript = document.createElement('script');
      whaleScript.src = '/whale.js?v=5';
      document.head.appendChild(whaleScript);
    }
    if (!document.querySelector('script[src^="/footer-quick.js"]')) {
      var footerScript = document.createElement('script');
      footerScript.src = '/footer-quick.js?v=1';
      document.head.appendChild(footerScript);
    }
    if (!document.querySelector('script[src^="/motion-pause.js"]')) {
      var motionScript = document.createElement('script');
      motionScript.src = '/motion-pause.js?v=1';
      document.head.appendChild(motionScript);
    }
    if (!document.querySelector('script[src^="/footer-tentacles.js"]')) {
      var tentScript = document.createElement('script');
      tentScript.src = '/footer-tentacles.js?v=6';
      tentScript.defer = true;
      document.head.appendChild(tentScript);
    }
    // Background shark pieces (shark-pass.js: rare papers, rarer shark, hourly roll; shark-silhouette.js: a small dark shark swimming by). Both are decorative and off for reduced motion.
    if (!document.querySelector('script[src^="/shark-pass.js"]')) {
      var sharkScript = document.createElement('script');
      sharkScript.src = '/shark-pass.js?v=3';
      sharkScript.defer = true;
      sharkScript.setAttribute('data-auto', '');
      document.head.appendChild(sharkScript);
    }
    if (!document.querySelector('script[src^="/shark-silhouette.js"]')) {
      var silScript = document.createElement('script');
      silScript.src = '/shark-silhouette.js?v=2';
      silScript.defer = true;
      document.head.appendChild(silScript);
    }
  };
  // "Follow / email me updates" link at the foot of measure, candidate, case, research and state pages
  if (!inMembers && path !== '/' && !document.querySelector('script[src^="/members/follow-link.js"]')) {
    var followScript = document.createElement('script');
    followScript.src = '/members/follow-link.js?v=2';
    followScript.defer = true;
    document.head.appendChild(followScript);
  }
  // Review-status label on pages the AI wrote (the script decides which pages; see /ai-label.js)
  if (!inMembers && (path.indexOf('/') === 0 || path.indexOf('/research/') === 0) && !document.querySelector('script[src^="/ai-label.js"]')) {
    var labelScript = document.createElement('script');
    labelScript.src = '/ai-label.js?v=3';
    labelScript.defer = true;
    document.head.appendChild(labelScript);
  }
  // "We need humans" banner for logged-out visitors (the script decides; see /humanbanner.js)
  if (!inMembers && !document.querySelector('script[src^="/humanbanner.js"]')) {
    var hbCss = document.createElement('link');
    hbCss.rel = 'stylesheet';
    hbCss.href = '/humanbanner.css?v=7';
    document.head.appendChild(hbCss);
    var hbScript = document.createElement('script');
    hbScript.src = '/humanbanner.js?v=6';
    hbScript.defer = true;
    document.head.appendChild(hbScript);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
