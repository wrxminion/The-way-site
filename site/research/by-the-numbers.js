// "By the numbers" panel on the Research page. Reads window.BY_THE_NUMBERS (by-the-numbers-data.js, written monthly
// by tools/build-by-the-numbers.js) and the state shapes in /members/usmap-data.js. Text goes in with textContent only.
// No requests to any server: everything is in static files.
(function () {
  'use strict';
  var root = document.getElementById('numbers');
  if (!root) return;
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/research/by-the-numbers.css?v=1';
  document.head.appendChild(css);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var fmt = function (v) { return typeof v === 'number' ? v.toLocaleString() : String(v); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var d = window.BY_THE_NUMBERS;

  root.appendChild(el('h2', null, 'By the numbers'));
  if (!d || !d.month) {
    root.appendChild(el('p', 'bn-note', 'The first numbers will appear after the first full month of tracking. They update once a month.'));
    return;
  }
  var ym = d.month.split('-');
  var monthName = MONTHS[+ym[1] - 1] + ' ' + ym[0];
  root.appendChild(el('p', 'bn-note', 'How the site was used and what the work holds, for ' + monthName + '. Updated monthly. ' +
    'Counts under 10 show as "under 10" so no one can be picked out. We use Cloudflare Web Analytics, which sets no cookies and keeps no IP addresses. The numbers are estimates.'));

  var tiles = el('div', 'bn-tiles');
  [['visits', 'Visits'], ['page_views', 'Page views'], ['countries', 'Countries'], ['members', 'Members'], ['sources_checked', 'Sources checked']].forEach(function (p) {
    var t = el('div', 'bn-tile');
    t.appendChild(el('strong', null, fmt(d[p[0]])));
    t.appendChild(el('span', null, p[1]));
    tiles.appendChild(t);
  });
  root.appendChild(tiles);
  root.appendChild(el('p', 'bn-note', 'Sources checked: sources the fact-checker has opened and saved a copy of. Members: people with an account.'));

  function title(path) {
    if (path === '/') return 'Home';
    var parts = path.replace(/\/$/, '').split('/').filter(Boolean);
    var last = (parts[parts.length - 1] || '').replace(/\.html?$/, '').replace(/[-_]+/g, ' ');
    return last ? last.charAt(0).toUpperCase() + last.slice(1) : path;
  }

  var cols = el('div', 'bn-cols');
  var pc = el('div', 'bn-card');
  pc.appendChild(el('h3', null, 'Most-read pages'));
  if (d.pages && d.pages.length) {
    var ol = el('ol', 'bn-list');
    d.pages.forEach(function (p) {
      var li = el('li');
      var a = el('a', null, title(p.path));
      a.href = p.path;
      li.appendChild(a);
      li.appendChild(el('span', 'bn-views', fmt(p.views) + ' views'));
      ol.appendChild(li);
    });
    pc.appendChild(ol);
    pc.appendChild(el('p', 'bn-note', 'Based on each day\'s busiest pages, so it is approximate.'));
  } else pc.appendChild(el('p', 'bn-note', 'No page reached 10 views.'));
  cols.appendChild(pc);

  var tc = el('div', 'bn-card');
  tc.appendChild(el('h3', null, 'Most-read topics'));
  if (d.topics && d.topics.length) {
    var ul = el('ul', 'bn-list');
    d.topics.forEach(function (t) {
      var li = el('li'); li.appendChild(el('span', null, t.topic)); li.appendChild(el('span', 'bn-views', fmt(t.views) + ' views')); ul.appendChild(li);
    });
    tc.appendChild(ul);
  } else tc.appendChild(el('p', 'bn-note', 'No topic reached 10 views.'));
  cols.appendChild(tc);
  root.appendChild(cols);

  var sc = el('div', 'bn-card');
  sc.appendChild(el('h3', null, 'Interest by state (which state guides were viewed)'));
  sc.appendChild(el('p', 'bn-note', 'This is not where visitors live. It counts views of each state\'s guide and map pages.'));
  var shapes = window.US_STATES;
  if (shapes && d.states && d.states.length) {
    var NS = 'http://www.w3.org/2000/svg';
    var byCode = {}, max = 0;
    d.states.forEach(function (s) { byCode[s.code] = s.views; if (typeof s.views === 'number' && s.views > max) max = s.views; });
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 975 610'); svg.setAttribute('class', 'bn-map'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Map of United States states shaded by views of that state\'s guide pages');
    Object.keys(shapes).forEach(function (code) {
      var v = byCode[code], lvl = 0;
      if (typeof v === 'number') lvl = Math.max(1, Math.ceil(5 * Math.sqrt(v / (max || 1))));
      else if (v === 'under 10') lvl = 1;
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', shapes[code][1]); p.setAttribute('class', 'bn-shape bn-l' + lvl);
      var t = document.createElementNS(NS, 'title');
      t.textContent = shapes[code][0] + ': ' + (v == null ? 'no views' : fmt(v) + (typeof v === 'number' ? ' views' : ' views'));
      p.appendChild(t); svg.appendChild(p);
    });
    sc.appendChild(svg);
  } else sc.appendChild(el('p', 'bn-note', 'No state guide reached 10 views.'));
  root.appendChild(sc);
})();
