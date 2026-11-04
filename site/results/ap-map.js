// AP map for the results page. Colors each state by what AP is calling (not certified), using only data the site already has:
// manifest.balance (Senate and House seats per state) and, for the Governor view, the AP call inside each state file.
// All text from data files goes on the page with textContent. Shapes: ap-map-paths.js (Census states, Albers, 975x610).
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var NAMES = {al:'Alabama',ak:'Alaska',az:'Arizona',ar:'Arkansas',ca:'California',co:'Colorado',ct:'Connecticut',de:'Delaware',dc:'District of Columbia',fl:'Florida',ga:'Georgia',hi:'Hawaii',id:'Idaho',il:'Illinois',in:'Indiana',ia:'Iowa',ks:'Kansas',ky:'Kentucky',la:'Louisiana',me:'Maine',md:'Maryland',ma:'Massachusetts',mi:'Michigan',mn:'Minnesota',ms:'Mississippi',mo:'Missouri',mt:'Montana',ne:'Nebraska',nv:'Nevada',nh:'New Hampshire',nj:'New Jersey',nm:'New Mexico',ny:'New York',nc:'North Carolina',nd:'North Dakota',oh:'Ohio',ok:'Oklahoma',or:'Oregon',pa:'Pennsylvania',ri:'Rhode Island',sc:'South Carolina',sd:'South Dakota',tn:'Tennessee',tx:'Texas',ut:'Utah',vt:'Vermont',va:'Virginia',wa:'Washington',wv:'West Virginia',wi:'Wisconsin',wy:'Wyoming'};
  var CODES = Object.keys(NAMES).sort(function (a, b) { return NAMES[a] < NAMES[b] ? -1 : 1; });
  // States with a U.S. Senate seat on the ballot in this election (35 seats, including the Florida and Ohio specials).
  var SEN = 'al ak ar co de fl ga id il ia ks ky la me ma mi mn ms mt ne nh nj nm nc oh ok or ri sc sd tn tx va wv wy'.split(' ');
  // States electing a governor in this election.
  var GOV = 'al ak az ar ca co ct fl ga hi id il ia ks me md ma mi mn ne nv nh nm ny oh ok or pa ri sc sd tn tx vt wi wy'.split(' ');
  var TILES = ['nh', 'vt', 'ma', 'ri', 'ct', 'nj', 'de', 'md', 'dc'];
  var PNAME = { D: 'Democratic', R: 'Republican', O: 'Other', U: 'not called yet' };
  var VIEWS = [['senate', 'Senate'], ['governor', 'Governor'], ['house', 'House']];
  var view = 'senate', balance = null, gov = {}, govAt = 0, govBusy = false, getJSON = null, manifestFiles = [], pinned = null;
  var root, svg, detail, listEl, built = false, nodes = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function has(arr, c) { return arr.indexOf(c) >= 0; }

  // What each state shows in the current view: {kind: 'none'|'wait'|'U'|'D'|'R'|'O'|'split', parts, text}
  function info(c) {
    var n = NAMES[c];
    if (view === 'senate') {
      if (!has(SEN, c)) return { kind: 'none', text: n + ': no U.S. Senate race in this election.' };
      var b = balance && balance.senate && balance.senate[c];
      if (!b) return { kind: 'wait', text: n + ', U.S. Senate: no AP data collected yet.' };
      var w = ['D', 'R', 'O'].filter(function (p) { return b[p] > 0; });
      if (w.length === 1) return { kind: w[0], text: n + ', U.S. Senate: AP is calling it for the ' + PNAME[w[0]] + ' candidate (not certified).' };
      return { kind: 'U', text: n + ', U.S. Senate: AP has not called it yet.' };
    }
    if (view === 'governor') {
      if (!has(GOV, c)) return { kind: 'none', text: n + ': no governor race in this election.' };
      var g = gov[c];
      if (g === undefined) return { kind: 'wait', text: n + ', Governor: ' + (govBusy ? 'loading.' : 'no AP data collected yet.') };
      if (g === null || !g.p) return { kind: 'U', text: n + ', Governor: AP has not called it yet.' };
      return { kind: g.p, text: n + ', Governor: AP is calling it for ' + g.name + ' (' + PNAME[g.p] + ') (not certified).' };
    }
    if (!balance || !balance.house || !balance.house[c]) return { kind: 'wait', text: n + ', U.S. House: no AP data collected yet.' };
    var h = balance.house[c], tot = (h.D || 0) + (h.R || 0) + (h.O || 0) + (h.U || 0);
    var t = n + ', U.S. House: AP is calling Democratic ' + (h.D || 0) + ', Republican ' + (h.R || 0) + ', Other ' + (h.O || 0) + '; ' + (h.U || 0) + ' of ' + tot + ' not called yet (not certified).';
    return { kind: 'split', parts: h, total: tot, text: t };
  }
  var FILL = { D: 'url(#apm-d)', R: 'url(#apm-r)', O: '#8fa6ad', U: '#0d2c3b', none: '#050f17', wait: '#050f17' };

  function fillInto(g, c, box, i, forTile) {
    // remove old fill nodes
    while (g.firstChild && g.firstChild.getAttribute('data-fill')) g.removeChild(g.firstChild);
    var d = info(c), frag = [];
    if (d.kind === 'split' && d.total) {
      var x = box[0], order = ['D', 'R', 'O', 'U'], w = box[2] - box[0];
      order.forEach(function (p) {
        var n = d.parts[p] || 0; if (!n) return;
        var r = s('rect', { x: x.toFixed(1), y: box[1], width: (w * n / d.total).toFixed(1), height: box[3] - box[1], fill: FILL[p], 'data-fill': '1' });
        if (!forTile) r.setAttribute('clip-path', 'url(#apm-clip-' + c + ')');
        frag.push(r); x += w * n / d.total;
      });
    } else {
      var r0 = forTile ? s('rect', { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], fill: FILL[d.kind] || FILL.U, 'data-fill': '1' }) : null;
      if (r0) frag.push(r0);
    }
    frag.reverse().forEach(function (f) { g.insertBefore(f, g.firstChild); });
    return d;
  }

  function build() {
    root = document.getElementById('apmap');
    var P = window.TW_MAP_PATHS;
    if (!root || !P) return false;
    root.textContent = '';
    root.appendChild(el('h2', null, 'What AP is calling (not certified)'));
    root.appendChild(el('p', 'muted', 'A map of AP calls so far. Not a prediction and not a certified result. Uncalled states stay dark. Tap or hover a state for details.'));
    var tabs = el('div', 'modes apm-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Map view');
    VIEWS.forEach(function (v) {
      var b = el('button', null, v[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('data-v', v[0]);
      b.addEventListener('click', function () { view = v[0]; pinned = null; if (view === 'governor') loadGov(); render(); });
      tabs.appendChild(b);
    });
    root.appendChild(tabs);
    svg = s('svg', { viewBox: '0 0 1060 610', role: 'group', 'aria-label': 'Map of the 50 states and D.C. colored by what AP is calling. A list of states follows the map.', class: 'apm-svg' });
    s('title', {}, svg).textContent = 'What AP is calling (not certified)';
    var defs = s('defs', {}, svg);
    var pd = s('pattern', { id: 'apm-d', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    s('rect', { width: 6, height: 6, fill: '#4f8fa0' }, pd); s('rect', { width: 3, height: 6, fill: '#cfeff0' }, pd);
    var pr = s('pattern', { id: 'apm-r', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(135)' }, defs);
    s('rect', { width: 6, height: 6, fill: '#9a8a5c' }, pr); s('rect', { width: 3, height: 6, fill: '#f0e6cf' }, pr);
    CODES.forEach(function (c) {
      if (!P[c]) return;
      var cp = s('clipPath', { id: 'apm-clip-' + c }, defs); s('path', { d: P[c].d }, cp);
    });
    var gs = s('g', {}, svg);
    CODES.forEach(function (c) {
      if (!P[c] || c === 'dc') return;
      var g = s('g', { class: 'apm-st', tabindex: 0, role: 'button', 'data-s': c }, gs);
      s('path', { d: P[c].d, class: 'apm-sh' }, g);
      nodes[c] = { g: g, box: P[c].b };
      wire(g, c);
    });
    // D.C. marker on the map
    var dcp = P.dc ? P.dc.c : [820, 270];
    var dg = s('g', { class: 'apm-st', tabindex: 0, role: 'button', 'data-s': 'dc' }, gs);
    s('circle', { cx: dcp[0], cy: dcp[1], r: 6, class: 'apm-sh' }, dg);
    nodes.dc = { g: dg, box: [dcp[0] - 6, dcp[1] - 6, dcp[0] + 6, dcp[1] + 6], circle: true };
    wire(dg, 'dc');
    // labeled tiles for the small Northeast states and D.C.
    s('text', { x: 1014, y: 128, class: 'apm-cap', 'text-anchor': 'middle' }, svg).textContent = 'Small states';
    TILES.forEach(function (c, i) {
      var y = 140 + i * 46;
      var g = s('g', { class: 'apm-st apm-tile', tabindex: 0, role: 'button', 'data-s': c + '-tile' }, svg);
      s('rect', { x: 975, y: y, width: 78, height: 38, rx: 6, class: 'apm-sh' }, g);
      var t = s('text', { x: 1014, y: y + 24, 'text-anchor': 'middle', class: 'apm-lab' }, g); t.textContent = c.toUpperCase();
      nodes[c + '-tile'] = { g: g, box: [975, y, 1053, y + 38], tile: true, code: c, label: t };
      wire(g, c);
    });
    root.appendChild(svg);
    var leg = el('div', 'balkey apm-key');
    [['p-d', 'Democratic'], ['p-r', 'Republican'], ['p-o', 'Other'], ['p-u', 'Not called yet'], ['p-n', 'No race / no data']].forEach(function (x) {
      var sp = el('span'); sp.appendChild(el('i', 'sw ' + x[0])); sp.appendChild(document.createTextNode(x[1])); leg.appendChild(sp);
    });
    root.appendChild(leg);
    detail = el('p', 'apm-detail', 'Tap or hover a state to see what AP is calling.'); detail.setAttribute('aria-live', 'polite');
    root.appendChild(detail);
    var dt = el('details', 'apm-list'); dt.appendChild(el('summary', null, 'List of all states as text'));
    listEl = el('ul'); dt.appendChild(listEl); root.appendChild(dt);
    return true;
  }
  function wire(g, c) {
    var show = function () { if (!pinned) detail.textContent = info(c).text; };
    g.addEventListener('mouseenter', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', function () { if (!pinned) detail.textContent = 'Tap or hover a state to see what AP is calling.'; });
    g.addEventListener('click', function () { pinned = c; detail.textContent = info(c).text; });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinned = c; detail.textContent = info(c).text; } });
  }

  function render() {
    if (!built) return;
    var P = window.TW_MAP_PATHS;
    root.querySelectorAll('.apm-tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-v') === view)); });
    Object.keys(nodes).forEach(function (k) {
      var n = nodes[k], c = n.code || k, d = info(c);
      if (n.tile) {
        fillInto(n.g, c, n.box, 0, true);
        n.label.setAttribute('class', 'apm-lab' + (d.kind === 'D' || d.kind === 'R' || d.kind === 'O' || d.kind === 'split' ? ' on' : ''));
      } else if (n.circle) {
        // plain fill on the marker
        var cir = n.g.querySelector('circle'); cir.setAttribute('fill', d.kind === 'split' ? FILL[majority(c)] : (FILL[d.kind] || FILL.U));
      } else {
        fillInto(n.g, c, n.box, 0, false);
        var path = n.g.querySelector('path'); path.setAttribute('fill', d.kind === 'split' ? 'none' : (FILL[d.kind] || FILL.U));
      }
      n.g.setAttribute('aria-label', d.text);
      n.g.setAttribute('class', 'apm-st' + (n.tile ? ' apm-tile' : '') + ' k-' + d.kind);
    });
    listEl.textContent = '';
    CODES.forEach(function (c) { listEl.appendChild(el('li', null, info(c).text)); });
    if (pinned) detail.textContent = info(pinned.replace('-tile', '')).text;
  }
  function majority(c) { var h = balance && balance.house && balance.house[c]; if (!h) return 'U'; return (h.D || 0) >= (h.R || 0) ? 'D' : 'R'; }

  function pickGov(d, c) {
    var list = (d.contests || []).filter(function (x) { return /^governor\b/i.test(x.office || x.title || '') && !/lieutenant/i.test(x.title || ''); });
    if (!list.length) return undefined;
    var k = list[0], cl = k.called, w = null;
    if (cl && cl.winner && cl.kind === 'ap') (k.choices || []).forEach(function (ch) { if (ch.id === cl.winner) w = ch; });
    return w ? { p: w.party_code === 'D' || w.party_code === 'R' ? w.party_code : 'O', name: w.name } : null;
  }
  // Governor calls live inside each state file; load them only when that view is opened, then at most every 5 minutes.
  function loadGov() {
    if (govBusy || (Date.now() - govAt < 300000 && Object.keys(gov).length)) return;
    var scopes = {};
    manifestFiles.forEach(function (f) { var m = /^state-([a-z]{2})$/.exec(f.scope || ''); if (m && has(GOV, m[1])) scopes[m[1]] = f.path; });
    if (manifestFiles.some(function (f) { return f.scope === 'co'; })) scopes.co = manifestFiles.filter(function (f) { return f.scope === 'co'; })[0].path;
    var todo = Object.keys(scopes); govBusy = true; render();
    var next = function () {
      var c = todo.shift();
      if (!c) { govBusy = false; govAt = Date.now(); render(); return; }
      getJSON('data/' + scopes[c]).then(function (d) { gov[c] = pickGov(d, c); }).catch(function () {}).then(function () { render(); next(); });
    };
    next(); next(); next();
  }

  window.TWMap = {
    update: function (manifest, fetcher) {
      getJSON = fetcher;
      manifestFiles = manifest.files || [];
      var box = document.getElementById('apmap');
      if (!box) return;
      fetcher('data/balance.json').then(function (b) { balance = b; }).catch(function () {}).then(function () {
        if (!balance || (!balance.house && !balance.senate) || !window.TW_MAP_PATHS) { box.hidden = true; return; }
        box.hidden = false;
        if (!built) built = build();
        if (view === 'governor') loadGov();
        render();
      });
    }
  };
})();
