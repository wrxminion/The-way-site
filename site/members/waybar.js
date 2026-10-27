// The Way: one top bar for every page (member area, Findings, guides, maps, case pages, splash).
// Drop-in: <link rel="stylesheet" href="/members/waybar.css?v=1"> in <head>,
//          <header id="waybar" class="waybar">…fallback links…</header> first in <body>,
//          <script src="/members/waybar.js?v=1" defer></script>.
// Signed in (in this browser): logo left · Map, Ballot in the middle · Commons, Invite, your name right
// (Home is big at the left; your name opens a menu with every page you can reach; everything opens in the same tab).
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
    if (/^\/preview\/pages\/case-studies/.test(path)) return 'casestudies';
    if (/^\/research\//.test(path)) return 'research-lib';
    if (/^\/search\//.test(path)) return 'search';
    if (/^\/preview\/pages\/news/.test(path)) return 'news';
    if (/^\/preview\/pages\/(foundation|founder|deeper)/.test(path)) return 'about';
    if (/^#\/research/.test(h)) return 'research';
    if (/^#\/map/.test(h) || /^\/preview\/pages\/map/.test(path)) return 'map';
    if (/^\/preview\/pages\/(guide|states|map)/.test(path)) return 'ballot';
    if (/^#\/(commons|c\/|t\/)/.test(h)) return 'commons';
    if (/^#\/invite/.test(h)) return 'invite';
    if (/^#\/review/.test(h)) return 'review';
    if (/^#\/admin/.test(h)) return 'admin';
    if (/^#\/roles/.test(h)) return 'me';
    if (/^#\/?$/.test(h) && appPage) return 'home';
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
    bar.classList.toggle('wb-open', open);
    var logo = link(data ? route('') : '/', 'The Way'); // signed out: always the public front page
    logo.className = 'wb-logo';
    var kids = [logo];
    if (data) {
      var can = function (r) { return data.roles.indexOf(r) >= 0 || data.roles.indexOf('admin') >= 0; };
      // Every link here opens in the same tab. Home sits at the left, big, because it is used the most.
      var home = link(route(''), 'Home', 'home');
      home.className = 'wb-home';
      var mid = el('nav', { class: 'wb-mid', 'aria-label': 'Sections' });
      mid.appendChild(link('/preview/pages/states/', 'Voter Guide', 'ballot'));
      mid.appendChild(link('/preview/pages/news/', 'News', 'news'));
      mid.appendChild(link(route('cases'), 'Civics & History', 'cases'));
      mid.appendChild(link('/preview/pages/deeper.html', 'About', 'about'));
      var deskOk = can('researcher') || can('reviewer');
      if (path !== '/' && path !== '/index.html') mid.appendChild(link(route('commons'), 'Commons', 'commons'));
      mid.appendChild(link(route('invite'), 'Invite', 'invite'));
      if (deskOk) mid.appendChild(link(route('research'), 'Research', 'research'));
      if (can('moderator')) mid.appendChild(link(route('review'), 'Source verification', 'review'));
      if (can('admin')) mid.appendChild(link(route('admin'), 'Admin', 'admin'));
      var right = el('nav', { class: 'wb-right', 'aria-label': 'You' });
      right.appendChild(searchForm());
      var who = el('div', { class: 'wb-who' });
      var btn = el('button', { type: 'button', class: 'wb-name', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        'aria-current': cur === 'me' ? 'page' : null, title: 'Your account and menu' });
      btn.appendChild(el('span', { class: 'wb-name-text' }, data.name));
      btn.appendChild(el('span', { class: 'wb-caret', 'aria-hidden': 'true' }, '▾'));
      var menu = el('ul', { class: 'wb-menu', hidden: '' });
      var item = function (href, label) { var li = el('li'); li.appendChild(link(href, label)); menu.appendChild(li); };
      item(route(''), 'Home');
      item(route('commons'), 'Commons');
      item(route('invite'), 'Invite someone');
      item(route('cases'), 'Civics & History');
      item('/preview/pages/deeper.html', 'About');
      if (data.findings) item('/members/findings.html', 'Findings');
      if (can('moderator')) item(route('review'), 'Source verification');
      if (can('researcher') || can('reviewer')) item(route('research'), 'Research desk');
      if (data.modlog) item(route('log'), 'Moderation log');
      if (can('moderator')) item(route('reports'), 'Reports');
      if (can('admin')) item(route('admin'), 'Admin');
      item(route('roles'), 'Roles and points');
      menu.appendChild(el('li', { class: 'wb-sep', role: 'separator' }));
      item(route('account'), 'Your account');
      item(route('signout'), 'Sign out');
      btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggleMenu(btn, menu); });
      who.appendChild(btn); who.appendChild(menu); right.appendChild(who);
      var burger = el('button', { type: 'button', class: 'wb-burger', 'aria-expanded': open ? 'true' : 'false', 'aria-label': 'Menu' }, 'Menu');
      burger.addEventListener('click', function () { open = !open; render(); });
      kids.push(home, mid, right, burger);
    } else if (!pending) {
      // Four principal public destinations flank the centered site identity.
      var left = el('nav', { class: 'wb-public-left', 'aria-label': 'Voter information' });
      left.appendChild(link('/preview/pages/states/', 'Voter Guide', 'ballot'));
      left.appendChild(link('/preview/pages/news/', 'News', 'news'));
      var rightPublic = el('nav', { class: 'wb-public-right', 'aria-label': 'Learn about The Way' });
      rightPublic.appendChild(link('/preview/pages/case-studies/', 'Case Studies', 'casestudies'));
      rightPublic.appendChild(link('/research/', 'Research', 'research-lib'));
      var mobile = el('nav', { class: 'wb-public-mobile', 'aria-label': 'Sections' });
      mobile.appendChild(link('/preview/pages/states/', 'Voter Guide', 'ballot'));
      mobile.appendChild(link('/preview/pages/news/', 'News', 'news'));
      mobile.appendChild(link('/preview/pages/case-studies/', 'Case Studies', 'casestudies'));
      mobile.appendChild(link('/research/', 'Research', 'research-lib'));
      mobile.appendChild(link('/preview/pages/cases/', 'Civics & History', 'cases'));
      mobile.appendChild(link('/preview/pages/deeper.html', 'About', 'about'));
      mobile.appendChild(link('/preview/pages/join.html', 'Join'));
      mobile.appendChild(link('/members/', 'Sign in'));
      var publicMenu = el('button', { type: 'button', class: 'wb-burger wb-public-menu', 'aria-expanded': open ? 'true' : 'false', 'aria-label': 'Sections menu' }, 'Menu');
      publicMenu.addEventListener('click', function () { open = !open; render(); });
      var topSearch = searchForm('wb-top-q');
      topSearch.classList.add('wb-public-search');
      kids.push(left, rightPublic, mobile, publicMenu, topSearch);
    }
    bar.replaceChildren.apply(bar, kids);
    syncFloating();
  }
  function syncFloating() {
    var floating = document.querySelector('.wb-floating');
    if (!floating) {
      floating = el('nav', { class: 'wb-floating', 'aria-label': 'Quick links' });
      document.body.appendChild(floating);
      document.body.classList.add('wb-floating-ready');
      var updateFloatingVisibility = function () { floating.hidden = window.scrollY <= 80; };
      window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
      updateFloatingVisibility();
    }
    var items = [];
    if (!data) {
      var access = el('span', { class: 'wb-floating-access' });
      access.appendChild(el('a', { href: '/preview/pages/join.html' }, 'Join'));
      access.appendChild(document.createTextNode(' / '));
      access.appendChild(el('a', { href: '/members/' }, 'Sign in'));
      items.push(access);
    }
    var search = searchForm('wb-floating-q');
    search.classList.add('wb-floating-search');
    items.push(search, el('a', { href: '#waybar', class: 'wb-floating-return' }, 'Back to surface'));
    floating.replaceChildren.apply(floating, items);
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
  }
  // My Ballot: on voter-guide pages, load the pick/save controls (browser-only; see ballot-store.js).
  if (/^\/preview\/pages\/guide(-[a-z]{2})?\//.test(path) && !inMembers) {
    var bcss = document.createElement('link'); bcss.rel = 'stylesheet'; bcss.href = '/members/ballot-pick.css?v=1'; document.head.appendChild(bcss);
    var bstore = document.createElement('script'); bstore.src = '/members/ballot-store.js?v=1';
    bstore.onload = function () { var bp = document.createElement('script'); bp.src = '/members/ballot-pick.js?v=1'; document.body.appendChild(bp); };
    document.body.appendChild(bstore);
  }
  var start = function () {
    addOriginalOcean(); render(stored());
    if (!document.querySelector('script[src^="/preview/pages/footer-quick.js"]')) {
      var footerScript = document.createElement('script');
      footerScript.src = '/preview/pages/footer-quick.js?v=1';
      document.head.appendChild(footerScript);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
