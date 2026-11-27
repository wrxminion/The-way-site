// Barriers to running (D297): map, state card and all-states table.
// Data: states.js (Congress, checked), states-more.js (governor and legislature, second source),
// fee-lines.js (filing fees paid, from the Money web FEC files). Map shapes: /results/ap-map-paths.js.
// All text goes on the page with textContent. No inline styles (CSP).
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var B = window.BARRIERS, MORE = window.BARRIERS_MORE || {}, LINES = window.BARRIER_FEE_LINES || [], P = window.TW_MAP_PATHS;
  if (!B || !B.states) return;
  var S = B.states;
  var CODES = Object.keys(S).sort(function (a, b) { return S[a].n < S[b].n ? -1 : 1; });
  var TILES = ['nh', 'vt', 'ma', 'ri', 'ct', 'nj', 'de', 'md'];
  var CK = {
    o: ['Checked on the official page', 'br-ck-o'],
    p: ['Partly checked on the official page', 'br-ck-p'],
    s: ['Second source only', 'br-ck-s'],
    c: ['Sources disagree', 'br-ck-c']
  };
  var COLS = ['State', 'Fee, party candidate', 'Without a party (last route listed)', 'Fee, U.S. Senate', 'How checked'];
  var SHORT = { o: 'Official page', p: 'Partly official', s: 'Second source', c: 'Sources disagree' };
  var BUCKETS = [
    ['b0', 'No fee'], ['b1', '$1 to $499'], ['b2', '$500 to $1,999'], ['b3', '$2,000 to $4,999'], ['b4', '$5,000 or more'],
    ['bp', 'Set by the party'], ['bc', 'Sources disagree']
  ];
  var nodes = {}, picked = '';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function link(href, text, ext) {
    var a = el('a', null, text + (ext ? ' ↗' : '')); a.href = href;
    if (ext) a.rel = 'noopener';
    return a;
  }
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return '$' + r.toLocaleString('en-US', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function bucket(f) {
    if (f === 'party') return 'bp';
    if (f === 'c') return 'bc';
    if (!f) return 'b0';
    return f < 500 ? 'b1' : f < 2000 ? 'b2' : f < 5000 ? 'b3' : 'b4';
  }
  function feeText(f) {
    if (f === 'party') return 'Set by the party';
    if (f === 'c') return 'Sources disagree';
    return f ? money(f) : 'No fee';
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function day(iso) {
    var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || '');
    return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : (iso || '');
  }
  function bpUrl(name) { return 'https://ballotpedia.org/Ballot_access_requirements_for_political_candidates_in_' + name.replace(/ /g, '_'); }
  function linesFor(c) { return LINES.filter(function (r) { return r[0] === c; }); }

  // ---- map
  function buildMap() {
    var root = document.getElementById('br-map');
    if (!root || !P) return;
    root.textContent = '';
    var svg = sv('svg', { viewBox: '0 0 1072 610', class: 'br-svg', role: 'group', 'aria-label': 'Map of the 50 states colored by the fee a party candidate pays to run for the U.S. House. A table of every state follows below.' });
    sv('title', {}, svg).textContent = 'Fee to run for the U.S. House, party candidate';
    var defs = sv('defs', {}, svg);
    var pp = sv('pattern', { id: 'br-hp', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    sv('rect', { width: 7, height: 7, fill: '#2b4752' }, pp); sv('rect', { width: 3, height: 7, fill: '#8fa6ad' }, pp);
    var pc = sv('pattern', { id: 'br-hc', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(135)' }, defs);
    sv('rect', { width: 7, height: 7, fill: '#3b2f52' }, pc); sv('rect', { width: 3, height: 7, fill: '#c3a8e8' }, pc);
    var g0 = sv('g', {}, svg);
    CODES.forEach(function (c) {
      if (!P[c]) return;
      var g = sv('g', { class: 'br-st ' + bucket(S[c].fee), tabindex: 0, role: 'button', 'aria-label': S[c].n + ': ' + feeText(S[c].fee) }, g0);
      sv('path', { d: P[c].d }, g);
      nodes[c] = [g];
      wire(g, c);
    });
    sv('text', { x: 1014, y: 128, class: 'br-cap', 'text-anchor': 'middle' }, svg).textContent = 'Small states';
    TILES.forEach(function (c, i) {
      var y = 140 + i * 46;
      var g = sv('g', { class: 'br-st br-tile ' + bucket(S[c].fee), tabindex: 0, role: 'button', 'aria-label': S[c].n + ': ' + feeText(S[c].fee) }, svg);
      sv('rect', { x: 975, y: y, width: 78, height: 38, rx: 6 }, g);
      sv('text', { x: 1014, y: y + 25, 'text-anchor': 'middle' }, g).textContent = c.toUpperCase();
      nodes[c].push(g);
      wire(g, c);
    });
    root.appendChild(svg);
    var key = el('ul', 'br-key');
    BUCKETS.forEach(function (b) {
      var n = CODES.filter(function (c) { return bucket(S[c].fee) === b[0]; }).length;
      var li = el('li'); li.appendChild(el('i', 'br-sw ' + b[0])); li.appendChild(document.createTextNode(b[1] + ' (' + n + ')'));
      key.appendChild(li);
    });
    root.appendChild(key);
    var hint = el('p', 'br-hint', 'Tap or click a state to open its card. D.C. is not covered yet.');
    hint.id = 'br-hint'; hint.setAttribute('aria-live', 'polite');
    root.appendChild(hint);
  }
  function wire(g, c) {
    var hint = function () { var h = document.getElementById('br-hint'); if (h) h.textContent = S[c].n + ': ' + feeText(S[c].fee) + ' for a party candidate for the U.S. House.'; };
    g.addEventListener('mouseenter', hint); g.addEventListener('focus', hint);
    g.addEventListener('click', function () { pick(c, true); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c, true); } });
  }

  // ---- card
  function rowsBlock(title, rows, sub) {
    var box = el('div', 'br-office');
    box.appendChild(el('h4', null, title));
    if (sub) box.appendChild(el('p', 'br-sub', sub));
    rows.forEach(function (r) {
      var row = el('div', 'br-row');
      row.appendChild(el('p', 'br-who', r[0]));
      var dl = el('dl');
      [['Signatures', r[1]], ['Fee', r[2]], ['Deadline', r[3]]].forEach(function (p) {
        var d = el('div'); d.appendChild(el('dt', null, p[0])); d.appendChild(el('dd', null, p[1])); dl.appendChild(d);
      });
      row.appendChild(dl);
      box.appendChild(row);
    });
    return box;
  }
  function card(c) {
    var st = S[c], m = MORE[c] || {}, out = document.getElementById('br-card');
    if (!out) return;
    out.textContent = '';
    var head = el('div', 'br-head');
    head.appendChild(el('h3', null, st.n));
    var ck = CK[st.ck] || CK.s;
    head.appendChild(el('span', 'br-ck ' + ck[1], ck[0]));
    out.appendChild(head);
    out.appendChild(el('p', 'br-big', feeText(st.fee) + (typeof st.fee === 'number' && st.fee ? ' to run for the U.S. House as a party candidate' : st.fee === 0 ? ' to run for the U.S. House' : ' (U.S. House, party candidate)')));

    var cong = el('section', 'br-part');
    cong.appendChild(el('h3', 'br-part-h', 'Congress'));
    cong.appendChild(rowsBlock('U.S. House' + (st.h.y !== 2026 ? ' (' + st.h.y + ' rules, the newest found)' : ', 2026'), st.h.r));
    cong.appendChild(rowsBlock('U.S. Senate' + (st.s.y !== 2026 ? ' (' + st.s.y + ' rules, the newest found)' : ', 2026'), st.s.r));
    if (st.note) cong.appendChild(el('p', 'br-note', st.note));
    if (st.diff) { var d = el('p', 'br-diff'); d.appendChild(el('strong', null, 'Where sources differ: ')); d.appendChild(document.createTextNode(st.diff)); cong.appendChild(d); }
    out.appendChild(cong);

    var paid = linesFor(c);
    var pd = el('section', 'br-part');
    pd.appendChild(el('h3', 'br-part-h', 'Fees paid, from FEC filings'));
    if (paid.length) {
      pd.appendChild(el('p', 'br-sub', paid.length + ' payment' + (paid.length === 1 ? '' : 's') + ' to a state election office or party for a filing, qualifying or ballot fee, as the campaigns reported them to the FEC. Largest first.'));
      var ul = el('ul', 'br-paid');
      paid.slice(0, 8).forEach(function (r) {
        var li = el('li');
        li.appendChild(el('strong', null, money(r[5])));
        li.appendChild(document.createTextNode(' ' + r[1] + (r[3] ? ' (' + r[3] + ')' : '') + ' to ' + r[4] + ', ' + day(r[6]) + '. '));
        if (r[8]) li.appendChild(link(r[8], 'FEC filing', true));
        li.appendChild(document.createTextNode(' '));
        li.appendChild(link('/money-trail/?fec=' + encodeURIComponent(r[2]) + '&view=network&hub=' + encodeURIComponent(r[1]), 'Money web'));
        ul.appendChild(li);
      });
      pd.appendChild(ul);
      if (paid.length > 8) pd.appendChild(el('p', 'br-sub', 'Showing 8 of ' + paid.length + '.'));
    } else {
      pd.appendChild(el('p', 'br-sub', 'No filing fee payments found for this state in the FEC files our Money web has loaded so far.'));
    }
    out.appendChild(pd);

    var st2 = el('section', 'br-part');
    st2.appendChild(el('h3', 'br-part-h', 'Governor and state legislature'));
    st2.appendChild(el('p', 'br-sub', c === 'fl' ? 'From the second source (Ballotpedia), with the fees read on Florida’s official list.' : 'From the second source (Ballotpedia) only. Not yet checked on the state’s own page.'));
    var any = false;
    if (m.g) { any = true; st2.appendChild(rowsBlock('Governor, ' + m.g.y, m.g.r)); }
    else st2.appendChild(el('p', 'br-sub', 'Governor: no row for a coming governor race in the second source.'));
    if (m.lo) { any = true; st2.appendChild(rowsBlock(m.lo.h + ', ' + m.lo.y, m.lo.r)); }
    if (m.up) { any = true; st2.appendChild(rowsBlock(m.up.h + ', ' + m.up.y, m.up.r)); }
    if (m.note) st2.appendChild(el('p', 'br-note', m.note));
    if (!any) st2.appendChild(el('p', 'br-sub', 'No rows found.'));
    out.appendChild(st2);

    var src = el('section', 'br-part');
    src.appendChild(el('h3', 'br-part-h', 'Sources'));
    var sl = el('ul', 'br-src');
    (st.src || []).forEach(function (s) { var li = el('li'); li.appendChild(link(s[1], s[0], true)); sl.appendChild(li); });
    var li2 = el('li'); li2.appendChild(link(bpUrl(st.n), 'Second source: Ballotpedia, ballot access requirements in ' + st.n, true)); sl.appendChild(li2);
    src.appendChild(sl);
    out.appendChild(src);
  }

  function pick(c, scroll) {
    if (!S[c]) return;
    if (picked && nodes[picked]) nodes[picked].forEach(function (g) { g.classList.remove('br-on'); });
    picked = c;
    if (nodes[c]) nodes[c].forEach(function (g) { g.classList.add('br-on'); });
    var sel = document.getElementById('br-pick'); if (sel) sel.value = c;
    card(c);
    if (history.replaceState) history.replaceState(null, '', '#' + c);
    if (scroll) { var t = document.getElementById('br-card'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  // ---- picker and table
  function buildPicker() {
    var sel = document.getElementById('br-pick');
    if (!sel) return;
    CODES.forEach(function (c) { var o = el('option', null, S[c].n); o.value = c; sel.appendChild(o); });
    sel.addEventListener('change', function () { if (sel.value) pick(sel.value, false); });
  }
  function noParty(st) {
    var r = st.h.r;
    if (r.length < 2) return 'Same rules for everyone';
    var x = r[r.length - 1];
    return x[0] + ': ' + x[1] + (x[2] && !/^None/.test(x[2]) ? '; fee ' + x[2] : '');
  }
  function buildTable() {
    var box = document.getElementById('br-table');
    if (!box) return;
    box.textContent = '';
    var t = el('table', 'gv-table br-table');
    var cap = el('caption', null, 'Every state: what it takes to run for the U.S. House in 2026');
    t.appendChild(cap);
    var th = el('thead'), tr = el('tr');
    COLS.forEach(function (h) { var x = el('th', null, h); x.scope = 'col'; tr.appendChild(x); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    CODES.forEach(function (c) {
      var st = S[c], r = el('tr');
      var td0 = el('td'); var a = link('#' + c, st.n); a.addEventListener('click', function (e) { e.preventDefault(); pick(c, true); }); td0.appendChild(a); r.appendChild(td0);
      [feeText(st.fee), noParty(st), /^None/.test(st.s.r[0][2]) ? 'No fee' : st.s.r[0][2], SHORT[st.ck] || SHORT.s].forEach(function (v, i) {
        var td = el('td', null, v); td.setAttribute('data-l', COLS[i + 1]); r.appendChild(td);
      });
      tb.appendChild(r);
    });
    t.appendChild(tb);
    box.appendChild(t);
  }

  function start() {
    buildMap();
    buildPicker();
    buildTable();
    var h = (location.hash || '').replace('#', '').toLowerCase();
    pick(S[h] ? h : 'fl', !!S[h]);
    window.addEventListener('hashchange', function () { var k = (location.hash || '').replace('#', '').toLowerCase(); if (S[k] && k !== picked) pick(k, true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
