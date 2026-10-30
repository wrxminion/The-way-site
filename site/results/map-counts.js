// Election results on the US map (the /states/ ballot map). Does nothing until config.json release_at has passed
// and the collector has written data/balance.json. Called seats only, shown with stripe patterns and written labels,
// never party colors. All numbers come from the collector's files and are put on the page with textContent.
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var CODES = {'Alabama':'al','Alaska':'ak','Arizona':'az','Arkansas':'ar','California':'ca','Colorado':'co','Connecticut':'ct','Delaware':'de','District of Columbia':'dc','Florida':'fl','Georgia':'ga','Hawaii':'hi','Idaho':'id','Illinois':'il','Indiana':'in','Iowa':'ia','Kansas':'ks','Kentucky':'ky','Louisiana':'la','Maine':'me','Maryland':'md','Massachusetts':'ma','Michigan':'mi','Minnesota':'mn','Mississippi':'ms','Missouri':'mo','Montana':'mt','Nebraska':'ne','Nevada':'nv','New Hampshire':'nh','New Jersey':'nj','New Mexico':'nm','New York':'ny','North Carolina':'nc','North Dakota':'nd','Ohio':'oh','Oklahoma':'ok','Oregon':'or','Pennsylvania':'pa','Rhode Island':'ri','South Carolina':'sc','South Dakota':'sd','Tennessee':'tn','Texas':'tx','Utah':'ut','Vermont':'vt','Virginia':'va','Washington':'wa','West Virginia':'wv','Wisconsin':'wi','Wyoming':'wy'};
  var svg = document.querySelector('svg.usmap-svg');
  if (!svg || !window.fetch) return;
  function j(p) { return fetch('/results/' + p + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  function mk(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function html(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sum(a, b) { return { D: (a.D || 0) + (b.D || 0), R: (a.R || 0) + (b.R || 0), O: (a.O || 0) + (b.O || 0), U: (a.U || 0) + (b.U || 0) }; }
  function label(c) { return 'D ' + c.D + ' · R ' + c.R + (c.O ? ' · O ' + c.O : '') + (c.U ? ' · not called ' + c.U : ''); }

  Promise.all([j('config.json'), j('data/manifest.json'), j('data/balance.json')]).then(function (a) {
    var cfg = a[0], man = a[1], bal = a[2];
    if (!(Date.now() >= new Date(cfg.release_at)) || man.mode === 'waiting') return;
    var states = {};
    ['house', 'senate'].forEach(function (k) { Object.keys(bal[k] || {}).forEach(function (st) { (states[st] = states[st] || {})[k] = bal[k][st]; }); });
    if (!Object.keys(states).length) return;

    var defs = mk('defs');
    function pat(id, angle, c1, c2) {
      var p = mk('pattern', { id: id, width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(' + angle + ')' });
      p.appendChild(mk('rect', { width: 8, height: 8, fill: c1 }));
      p.appendChild(mk('rect', { width: 4, height: 8, fill: c2 }));
      defs.appendChild(p);
    }
    pat('rp-d', 45, '#4f8fa0', '#cfeff0');      // more called seats for Democratic candidates: stripes lean right
    pat('rp-r', 135, '#9a8a5c', '#f0e6cf');     // more called seats for Republican candidates: stripes lean left
    pat('rp-t', 0, '#7d9096', '#c9d8dc');       // tied or other: horizontal stripes
    svg.insertBefore(defs, svg.firstChild);

    var rows = [];
    Array.prototype.forEach.call(svg.querySelectorAll('a.us-st'), function (link) {
      var t = link.querySelector('title'), code = t && CODES[t.textContent.trim()];
      var s = code && states[code];
      if (!s) return;
      var all = sum(s.house || {}, s.senate || {});
      var called = all.D + all.R + all.O;
      var path = link.querySelector('path');
      if (called) {
        var fill = all.D > all.R ? 'rp-d' : all.R > all.D ? 'rp-r' : 'rp-t';
        path.style.fill = 'url(#' + fill + ')';
      }
      var text = t.textContent.trim() + ': ' + (s.house ? 'House ' + label(s.house) : '') + (s.house && s.senate ? '; ' : '') + (s.senate ? 'Senate ' + label(s.senate) : '');
      t.textContent = text;
      link.setAttribute('aria-label', text);
      rows.push({ name: t.textContent.split(':')[0], s: s });
      try {
        var bb = path.getBBox();
        if (called && bb.width > 38) {
          var lab = mk('text', { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 + 14, class: 'rp-lab' }, 'D' + all.D + ' R' + all.R);
          link.appendChild(lab);
        }
      } catch (e) { /* label is optional */ }
    });

    // text version of the same counts, and the national totals, under the map
    var box = html('section', 'rp-box');
    box.appendChild(html('h2', null, 'Election results so far'));
    var tot = { house: { D: 0, R: 0, O: 0, U: 0 }, senate: { D: 0, R: 0, O: 0, U: 0 } };
    var b = man.balance || {};
    ['house', 'senate'].forEach(function (k) {
      if (!b[k]) return;
      var c = b[k];
      box.appendChild(html('p', 'rp-line', (k === 'house' ? 'U.S. House' : 'U.S. Senate') + ': ' + label(c)));
    });
    box.appendChild(html('p', 'rp-note', 'Seats the official source has called, so far. Not a prediction. Stripes lean right where more called seats are for Democratic candidates, left for Republican candidates, and are vertical where tied or other. Unofficial until certified, collected automatically and not checked by a person. '));
    var more = html('a', null, 'See every race'); more.href = '/results/'; box.lastChild.appendChild(more);
    var det = html('details', 'rp-det'); det.appendChild(html('summary', null, 'Counts by state (text)'));
    var ul = html('ul', 'rp-list');
    rows.sort(function (x, y) { return x.name < y.name ? -1 : 1; }).forEach(function (r) {
      ul.appendChild(html('li', null, r.name + ': ' + (r.s.house ? 'House ' + label(r.s.house) : '') + (r.s.house && r.s.senate ? '; ' : '') + (r.s.senate ? 'Senate ' + label(r.s.senate) : '')));
    });
    det.appendChild(ul); box.appendChild(det);
    var host = svg.closest('.usmap') || svg.parentNode;
    host.parentNode.insertBefore(box, host.nextSibling);
  }).catch(function () { /* no data or not released: the map stays as it is */ });
})();
