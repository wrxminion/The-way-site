// Results block for the state judges pages. Reads the same static files the /results/ page uses
// (site/results/data/state-<xx>.json, co.json; see tools/results/README.md) and shows the judge contests.
// Everything from the data files is untrusted text: it only goes on the page with textContent.
// If the file is missing or has no judge contests the block stays empty and invisible.
(function () {
  'use strict';
  var box = document.getElementById('judges-results');
  if (!box) return;
  var file = box.getAttribute('data-file');
  if (!file || !/^[a-z0-9-]+\.json$/.test(file)) return;
  var JUDGE = /court|judge|justice|retain|retention/i;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : '0'; }
  function when(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function isJudge(c) {
    return c && (c.kind === 'judicial' || JUDGE.test(String(c.office || '') + ' ' + String(c.title || '')));
  }
  function render(d) {
    var list = (d.contests || []).filter(isJudge);
    var total = 0;
    list.forEach(function (c) { (c.choices || []).forEach(function (x) { total += x.votes || 0; }); });
    if (!list.length || !total) return;       // nothing counted yet: show nothing
    list.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    box.appendChild(el('h2', null, 'Results so far'));
    box.appendChild(el('p', 'jr-note', 'Unofficial results' + (d.updated_at ? ', updated ' + when(d.updated_at) : '') +
      '. They change as votes are counted and are not final until certified. We do not call races; a winner is shown only when the official source marks the race decided. '));
    var more = el('a', null, 'All results');
    more.href = '/results/';
    box.lastChild.appendChild(more);
    list.forEach(function (c) {
      var wrap = el('section', 'jr-race');
      wrap.appendChild(el('h3', null, c.title || c.office || 'Contest'));
      var sub = [];
      if (c.vote_for && c.vote_for > 1) sub.push('Vote for ' + c.vote_for);
      if (c.precincts && c.precincts.total) sub.push(fmt(c.precincts.reporting) + ' of ' + fmt(c.precincts.total) + ' ' + (c.precincts.unit || 'precincts') + ' reporting');
      if (sub.length) wrap.appendChild(el('p', 'jr-sub', sub.join('. ') + '.'));
      var sum = 0;
      (c.choices || []).forEach(function (x) { sum += x.votes || 0; });
      var rows = (c.choices || []).slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
      var t = el('table', 'jr-table');
      var head = el('tr');
      ['Choice', 'Votes', 'Share of votes'].forEach(function (h) { head.appendChild(el('th', null, h)); });
      t.appendChild(head);
      rows.forEach(function (x) {
        var tr = el('tr');
        var name = (x.name || '') + (x.party_code && x.party_code !== 'O' && c.kind !== 'judicial' ? ' (' + x.party_code + ')' : '');
        var cell = el('td', null, name);
        if (c.called && c.called.winner === x.id) cell.appendChild(el('span', 'jr-called', ' Decided, per ' + (c.called.by || 'the source')));
        tr.appendChild(cell);
        tr.appendChild(el('td', 'jr-num', fmt(x.votes || 0)));
        tr.appendChild(el('td', 'jr-num', sum ? (100 * (x.votes || 0) / sum).toFixed(1) + '%' : ''));
        t.appendChild(tr);
      });
      wrap.appendChild(t);
      box.appendChild(wrap);
    });
  }
  fetch('/results/data/' + file + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d) render(d); })
    .catch(function () {});
})();
