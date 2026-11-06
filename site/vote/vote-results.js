// Election results at the top of the VOTE! page, right under the heading (Frank, Nov 2026).
// The same Congress count bars and AP map as /results/, from the same files: /results/data/manifest.json and
// /results/data/balance.json, drawn by /results/ap-map.js with shapes from /results/ap-map-paths.js. Nothing here is new data.
// AP calls are labeled as AP calls, never as certified results. Stripes and plain shades, no party colors.
// Everything from the data files goes on the page with textContent. If there is no data the section stays hidden.
(function () {
  'use strict';
  var BASE = '/results/';
  var box = document.getElementById('vote-results');
  if (!box || !window.fetch) return;
  var PARTY = [['D', 'Democratic', 'p-d'], ['R', 'Republican', 'p-r'], ['O', 'Other', 'p-o'], ['U', 'Not called yet', 'p-u']];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function num(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : '0'; }
  function getJSON(path) {
    var bust = Math.floor(Date.now() / 60000);   // a new copy at most once a minute, like the results page
    return fetch(BASE + path + '?t=' + bust, { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }
  function when(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var m = Math.max(0, Math.round((Date.now() - d) / 60000));
    var ago = m < 2 ? 'just now' : m < 90 ? m + ' minutes ago' : Math.round(m / 60) + ' hours ago';
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) + ' (' + ago + ')';
  }

  // Congress count bars: the same seats and wording as the results page.
  function bars(b) {
    var wrap = $('vr-bars'); wrap.textContent = '';
    [['house', 'U.S. House'], ['senate', 'U.S. Senate']].forEach(function (x) {
      var d = b[x[0]]; if (!d) return;
      var row = el('div', 'bal');
      row.appendChild(el('h3', null, x[1]));
      var total = (d.D || 0) + (d.R || 0) + (d.O || 0) + (d.U || 0);
      var bar = el('div', 'balbar'); bar.setAttribute('role', 'img');
      var alt = [];
      PARTY.forEach(function (p) {
        var n = d[p[0]] || 0; alt.push(p[1] + ' ' + n);
        if (!n || !total) return;
        var seg = el('i', p[2]); seg.style.width = (n / total * 100).toFixed(2) + '%'; bar.appendChild(seg);
      });
      bar.setAttribute('aria-label', x[1] + ', what AP is calling (not certified): ' + alt.join(', '));
      row.appendChild(bar);
      var key = el('div', 'balkey');
      PARTY.forEach(function (p) { var s = el('span'); s.appendChild(el('i', 'sw ' + p[2])); s.appendChild(document.createTextNode(p[1] + ': ' + num(d[p[0]] || 0))); key.appendChild(s); });
      row.appendChild(key);
      if (d.note) row.appendChild(el('p', 'muted', d.note));
      wrap.appendChild(row);
    });
  }

  function load() {
    return getJSON('data/manifest.json').then(function (m) {
      var b = m && m.balance;
      if (!b || (!b.house && !b.senate)) { box.hidden = true; return; }
      box.hidden = false;
      var mode = m.mode === 'final' ? 'Collection has stopped. Counts may still change until certified.' : m.mode === 'live' ? 'Collecting live.' : '';
      $('vr-status').textContent = (mode ? mode + ' ' : '') + (m.generated_at ? 'Updated ' + when(m.generated_at) + '.' : '');
      bars(b);
      if (window.TWMap) window.TWMap.update(m, getJSON);
    }).catch(function () { /* the results page and the card below still link to everything */ });
  }
  load();
  setInterval(load, 60000);
})();
