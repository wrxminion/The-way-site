// The Way: one top bar for every page (member area, Findings, guides, maps, case pages, splash).
// Drop-in: <link rel="stylesheet" href="/members/waybar.css?v=1"> in <head>,
//          <header id="waybar" class="waybar">…fallback links…</header> first in <body>,
//          <script src="/members/waybar.js?v=1" defer></script>.
// Signed in (in this browser): logo left · Map, Ballot in the middle · Commons, Invite, your name right
// (your name opens a menu: Home, Civics & History, Findings, your tools, Your account, Sign out).
// Signed out: logo and "Sign in" only. The member area writes what the bar needs to localStorage
// ("theway.bar": display name, roles, which tabs exist, your ballot link). That is only for drawing
// links; every page and the database still check the real sign-in themselves.
(function () {
  'use strict';
  var KEY = 'theway.bar';
  var ROLES = ['admin', 'moderator', 'researcher', 'reviewer'];
  var GUIDE = /^\/preview\/pages\/guide(-[a-z]{2})?\/$/;
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
      ballot: typeof d.ballot === 'string' && GUIDE.test(d.ballot) ? d.ballot : null
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
  // Site search in the bar on every page: a plain form that sends the visitor to /search/?q=... (done in script,
  // because some pages' security policy does not allow a form to submit).
  function searchForm() {
    var f = el('form', { class: 'wb-search', role: 'search', action: '/search/', method: 'get' });
    var lab = el('label', { class: 'wb-sr', for: 'wb-q' }, 'Search the whole site');
    var inp = el('input', { id: 'wb-q', type: 'search', name: 'q', placeholder: 'Search', autocomplete: 'off', maxlength: '120' });
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
    if (/^\/preview\/pages\/case-studies/.test(path)) return 'casestudies';
    if (/^\/research\//.test(path)) return 'research-lib';
    if (/^\/search\//.test(path)) return 'search';
    if (/^\/preview\/pages\/news/.test(path)) return 'news';
    if (/^#\/research/.test(h)) return 'research';
    if (/^#\/map/.test(h) || /^\/preview\/pages\/map/.test(path)) return 'map';
    if (/^\/preview\/pages\/(guide|states|map)/.test(path)) return 'ballot';
    if (/^#\/(commons|c\/|t\/)/.test(h)) return 'commons';
    if (/^#\/invite/.test(h)) return 'invite';
    if (/^#\/(account|password)/.test(h)) return 'me';
    return '';
  }

  var data = null, pending = false, open = false;
  function render(d, opts) {
    var bar = document.getElementById('waybar');
    if (!bar) return;
    if (d !== undefined) { data = d ? clean(d) : null; pending = !!(opts && opts.pending); }
    var cur = here();
    var link = function (href, label, key, extra) {
      var a = el('a', { href: href, 'aria-current': key && key === cur ? 'page' : null });
      a.textContent = label;
      if (extra) for (var k in extra) a.setAttribute(k, extra[k]);
      return a;
    };
    bar.classList.add('waybar');
    bar.classList.toggle('wb-in', !!data);
    bar.classList.toggle('wb-open', open && !!data);
    var logo = link(data ? route('') : '/', 'The Way'); // signed out: always the public front page
    logo.className = 'wb-logo';
    var kids = [logo];
    if (data) {
      var mid = el('nav', { class: 'wb-mid', 'aria-label': 'Map, ballot, news, cases' });
      mid.appendChild(link(route('map'), 'Map', 'map'));
      // In the member area the guides open in a new tab (that folder has its own password).
      mid.appendChild(link(data.ballot || '/preview/pages/guide/', 'Ballot', 'ballot', inMembers ? { target: '_blank', rel: 'noopener' } : null));
      // News and About are public pages in the preview folder (own password), so in the member area they open in a new tab.
      var tab = inMembers ? { target: '_blank', rel: 'noopener' } : null;
      mid.appendChild(link('/preview/pages/news/', 'News', 'news', tab));
      mid.appendChild(link(route('cases'), 'Civics & History', 'cases'));
      mid.appendChild(link('/preview/pages/', 'About', 'about', tab));
      var right = el('nav', { class: 'wb-right', 'aria-label': 'You' });
      right.appendChild(searchForm());
      var deskOk = data.roles.indexOf('admin') >= 0 || data.roles.indexOf('researcher') >= 0 || data.roles.indexOf('reviewer') >= 0;
      if (deskOk) right.appendChild(link(route('research'), 'Research', 'research'));
      right.appendChild(link(route('commons'), 'Commons', 'commons'));
      right.appendChild(link(route('invite'), 'Invite', 'invite'));
      var who = el('div', { class: 'wb-who' });
      var btn = el('button', { type: 'button', class: 'wb-name', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        'aria-current': cur === 'me' ? 'page' : null, title: 'Your account and menu' });
      btn.appendChild(el('span', { class: 'wb-name-text' }, data.name));
      btn.appendChild(el('span', { class: 'wb-caret', 'aria-hidden': 'true' }, '▾'));
      var menu = el('ul', { class: 'wb-menu', hidden: '' });
      var item = function (href, label) { var li = el('li'); li.appendChild(link(href, label)); menu.appendChild(li); };
      var can = function (r) { return data.roles.indexOf(r) >= 0 || data.roles.indexOf('admin') >= 0; };
      item(route(''), 'Home');
      item(route('cases'), 'Civics & History');
      item('/preview/pages/', 'About and essays');
      if (data.findings) item('/members/findings.html', 'Findings');
      if (can('researcher') || can('reviewer')) item(route('research'), 'Research desk');
      if (data.modlog) item(route('log'), 'Moderation log');
      if (can('moderator')) item(route('reports'), 'Reports');
      if (can('admin')) item(route('admin'), 'Admin');
      menu.appendChild(el('li', { class: 'wb-sep', role: 'separator' }));
      item(route('account'), 'Your account');
      item(route('signout'), 'Sign out');
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleMenu(btn, menu); });
      who.appendChild(btn); who.appendChild(menu); right.appendChild(who);
      var burger = el('button', { type: 'button', class: 'wb-burger', 'aria-expanded': open ? 'true' : 'false', 'aria-label': 'Menu' }, 'Menu');
      burger.addEventListener('click', function () { open = !open; render(); });
      kids.push(mid, right, burger);
    } else if (!pending) {
      var out = el('nav', { class: 'wb-right', 'aria-label': 'Sign in' });
      var s = link(appPage ? '#/' : '/members/', 'Sign in');
      s.className = 'wb-pill';
      out.appendChild(searchForm());
      out.appendChild(s);
      {
        // Signed out: the same section links on every page, member sign-in included: the same section links on every page (Frank, Oct 19).
        var pub = el('nav', { class: 'wb-mid wb-pub', 'aria-label': 'Sections' });
        pub.appendChild(link('/preview/pages/states/', 'Voter Guide', 'ballot'));
        pub.appendChild(link('/research/', 'Research', 'research-lib'));
        pub.appendChild(link('/preview/pages/cases/', 'Civics & History', 'cases'));
        pub.appendChild(link('/preview/pages/case-studies/', 'Ballot Case Studies', 'casestudies'));
        pub.appendChild(link('/preview/pages/news/', 'News', 'news'));
        pub.appendChild(link('/search/', 'Search', 'search'));
        pub.appendChild(link('/preview/pages/', 'About', 'about'));
        kids.push(pub);
      }
      kids.push(out);
    }
    bar.replaceChildren.apply(bar, kids);
  }
  function toggleMenu(btn, menu, force) {
    var show = force != null ? force : menu.hidden;
    menu.hidden = !show;
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  }
  function closeMenus() {
    var bar = document.getElementById('waybar'); if (!bar) return;
    var m = bar.querySelector('.wb-menu'), b = bar.querySelector('.wb-name');
    if (m && b && !m.hidden) toggleMenu(b, m, false);
  }
  document.addEventListener('click', function (ev) { if (!ev.target.closest || !ev.target.closest('.wb-who')) closeMenus(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { closeMenus(); if (open) { open = false; render(); } } });
  window.addEventListener('hashchange', function () { open = false; render(); });

  // Cloudflare Web Analytics on every public page that carries the bar (not the member area).
  if (!inMembers && !document.querySelector('script[data-cf-beacon]')) {
    var cf = document.createElement('script');
    cf.defer = true;
    cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cf.setAttribute('data-cf-beacon', '{"token": "9bb85ea3222345f3aed4aa50db9b3e0d"}');
    document.head.appendChild(cf);
  }
  window.WayBar = { render: render, save: save, read: stored };
  var start = function () { render(stored()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
