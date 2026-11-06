// State map on the Elections page (/case-studies/). Tap a state, or pick it from the list, to see that state's
// election studies (read from the cards on this page, by their data-state), its voter guide, its results and its
// voting rules page. Neutral colors only: a state is lit when it has at least one election study.
// Shapes: /results/ap-map-paths.js (Census states, Albers, 975x610), the same file the results map uses.
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var NAMES = {al:'Alabama',ak:'Alaska',az:'Arizona',ar:'Arkansas',ca:'California',co:'Colorado',ct:'Connecticut',de:'Delaware',dc:'District of Columbia',fl:'Florida',ga:'Georgia',hi:'Hawaii',id:'Idaho',il:'Illinois',in:'Indiana',ia:'Iowa',ks:'Kansas',ky:'Kentucky',la:'Louisiana',me:'Maine',md:'Maryland',ma:'Massachusetts',mi:'Michigan',mn:'Minnesota',ms:'Mississippi',mo:'Missouri',mt:'Montana',ne:'Nebraska',nv:'Nevada',nh:'New Hampshire',nj:'New Jersey',nm:'New Mexico',ny:'New York',nc:'North Carolina',nd:'North Dakota',oh:'Ohio',ok:'Oklahoma',or:'Oregon',pa:'Pennsylvania',ri:'Rhode Island',sc:'South Carolina',sd:'South Dakota',tn:'Tennessee',tx:'Texas',ut:'Utah',vt:'Vermont',va:'Virginia',wa:'Washington',wv:'West Virginia',wi:'Wisconsin',wy:'Wyoming'};
  var CODES = Object.keys(NAMES).sort(function (a, b) { return NAMES[a] < NAMES[b] ? -1 : 1; });
  var TILES = ['nh', 'vt', 'ma', 'ri', 'ct', 'nj', 'de', 'md', 'dc'];
  var root, svg, panel, sel, nodes = {}, studies = {}, picked = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function slug(c) { return NAMES[c].toLowerCase().replace(/\s+/g, '-'); }
  function guideUrl(c) { return c === 'co' ? '/guide/' : c === 'dc' ? null : '/guide-' + c + '/'; }
  function link(href, text, cls) { var a = el('a', cls || 'smap-go', text); a.href = href; return a; }

  // Election studies on this page, grouped by state: [{title, href}]
  function readStudies() {
    document.querySelectorAll('.cards .card[data-state]').forEach(function (card) {
      var c = card.getAttribute('data-state'), a = card.querySelector('h2 a');
      if (!a || !NAMES[c]) return;
      (studies[c] = studies[c] || []).push({ title: a.textContent, href: a.getAttribute('href'), a: a });
    });
  }
  function count(c) { return (studies[c] || []).length; }
  function says(c) {
    var n = count(c);
    return NAMES[c] + ': ' + (n ? n + ' election ' + (n === 1 ? 'study' : 'studies') : 'no election study yet') + '.';
  }

  function build() {
    var P = window.TW_MAP_PATHS;
    root = document.getElementById('smap');
    if (!root || !P) return false;
    root.textContent = '';

    var pickRow = el('div', 'smap-pick');
    var lab = el('label', null, 'Or pick a state from the list');
    lab.setAttribute('for', 'smap-sel');
    sel = el('select'); sel.id = 'smap-sel';
    var o0 = el('option', null, 'Choose a state'); o0.value = ''; sel.appendChild(o0);
    CODES.forEach(function (c) { var o = el('option', null, NAMES[c] + (count(c) ? ' (' + count(c) + ')' : '')); o.value = c; sel.appendChild(o); });
    sel.addEventListener('change', function () { if (sel.value) pick(sel.value, true); });
    pickRow.appendChild(lab); pickRow.appendChild(sel);

    svg = s('svg', { viewBox: '0 0 1060 610', role: 'group', class: 'smap-svg', 'aria-label': 'Map of the 50 states and D.C. Lit states have at least one election study. Each state is a button.' });
    s('title', {}, svg).textContent = 'Pick your state';
    var gs = s('g', {}, svg);
    CODES.forEach(function (c) {
      if (!P[c] || c === 'dc') return;
      var g = s('g', { class: 'smap-st', tabindex: 0, role: 'button', 'data-s': c }, gs);
      s('path', { d: P[c].d, class: 'smap-sh' }, g);
      add(c, g);
    });
    var dcp = P.dc ? P.dc.c : [820, 270];
    var dg = s('g', { class: 'smap-st', tabindex: 0, role: 'button', 'data-s': 'dc' }, gs);
    s('circle', { cx: dcp[0], cy: dcp[1], r: 6, class: 'smap-sh' }, dg);
    add('dc', dg);
    s('text', { x: 1014, y: 128, class: 'smap-cap', 'text-anchor': 'middle' }, svg).textContent = 'Small states';
    TILES.forEach(function (c, i) {
      var y = 140 + i * 46;
      var g = s('g', { class: 'smap-st smap-tile', tabindex: 0, role: 'button', 'data-s': c }, svg);
      s('rect', { x: 975, y: y, width: 78, height: 38, rx: 6, class: 'smap-sh' }, g);
      s('text', { x: 1014, y: y + 24, 'text-anchor': 'middle', class: 'smap-lab' }, g).textContent = c.toUpperCase();
      add(c, g);
    });

    var key = el('div', 'smap-key');
    [['k-has', 'Has an election study'], ['k-none', 'Voter guide and results only'], ['k-on', 'The state you picked']].forEach(function (x) {
      var sp = el('span'); sp.appendChild(el('i', 'sw ' + x[0])); sp.appendChild(document.createTextNode(x[1])); key.appendChild(sp);
    });

    panel = el('div', 'smap-panel'); panel.setAttribute('aria-live', 'polite');
    panel.appendChild(el('p', 'smap-hint', 'Tap or hover a state.'));

    var dt = el('details', 'smap-list'); dt.appendChild(el('summary', null, 'List of all states as text'));
    var ul = el('ul');
    CODES.forEach(function (c) {
      var li = el('li'), b = el('button', 'smap-li', says(c)); b.type = 'button';
      b.addEventListener('click', function () { pick(c, true); });
      li.appendChild(b); ul.appendChild(li);
    });
    dt.appendChild(ul);

    root.appendChild(svg); root.appendChild(key); root.appendChild(pickRow); root.appendChild(panel); root.appendChild(dt);
    return true;
  }
  function add(c, g) {
    (nodes[c] = nodes[c] || []).push(g);
    g.setAttribute('aria-label', says(c));
    g.classList.add(count(c) ? 'k-has' : 'k-none');
    g.addEventListener('mouseenter', function () { if (!picked) hint(says(c)); });
    g.addEventListener('mouseleave', function () { if (!picked) hint('Tap or hover a state.'); });
    g.addEventListener('click', function () { pick(c, false); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c, false); } });
  }
  function hint(t) { panel.textContent = ''; panel.appendChild(el('p', 'smap-hint', t)); }

  // The picked state stays lit and its box shows everything the site has for it.
  function pick(c, fromList) {
    if (!NAMES[c]) return;
    if (picked && nodes[picked]) nodes[picked].forEach(function (g) { g.classList.remove('on'); });
    picked = c;
    nodes[c].forEach(function (g) { g.classList.add('on'); });
    sel.value = c;
    panel.textContent = '';
    panel.appendChild(el('h3', 'smap-name', NAMES[c]));
    var list = studies[c] || [];
    if (list.length) {
      panel.appendChild(el('p', 'smap-num', list.length + ' election ' + (list.length === 1 ? 'study' : 'studies')));
      var ul = el('ul', 'smap-studies');
      list.forEach(function (x) {
        var li = el('li'); li.appendChild(link(x.href, x.title, 'smap-study'));
        // Copy the Passed / Failed / Not yet called mark (outcome.js) from the card, when it has one by now.
        var mark = x.a.nextSibling;
        if (mark && mark.className && String(mark.className).indexOf('mo-chip') >= 0) li.appendChild(mark.cloneNode(true));
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    } else {
      panel.appendChild(el('p', 'smap-num', 'No election study for ' + NAMES[c] + ' yet.'));
    }
    var go = el('div', 'smap-links');
    var g = guideUrl(c);
    if (g) go.appendChild(link(g, NAMES[c] + ' voter guide'));
    var r = link('/results/?state=' + c + '#tabs', 'Results: what AP is calling (not certified)');
    go.appendChild(r);
    go.appendChild(link('/states/' + slug(c) + '.html', 'How voting works in ' + NAMES[c]));
    panel.appendChild(go);
    try { history.replaceState(null, '', '?state=' + c + '#state-map'); } catch (e) { /* the box still shows */ }
    if (fromList && panel.scrollIntoView && window.matchMedia && window.matchMedia('(max-width: 700px)').matches) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function start() {
    readStudies();
    if (!build()) return;
    var q = '';
    try { q = String(new URLSearchParams(location.search).get('state') || '').toLowerCase(); } catch (e) { q = ''; }
    if (NAMES[q]) pick(q, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
