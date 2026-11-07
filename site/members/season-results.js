// Results inside the "Election results" card on the members home (Frank, Nov 7 2026: "put the bars and a little map in the
// election results card"). season.js calls WaySeasonResults.mount() after the polls close.
// Three parts, all from files the results page already uses, nothing new and no numbers made here:
//   1. Your state: the U.S. Senate and Governor races from that state's file (/results/data/co.json or state-xx.json),
//      with the same vote-share bars and the same four status labels as /results/.
//   2. Congress so far: the House and Senate count bars from /results/data/manifest.json "balance" (same as /results/ and /vote/).
//   3. Next to the bars, a little map of what AP is calling for the U.S. Senate, from /results/data/balance.json, shapes from /results/ap-map-paths.js
//      (loaded only when this part is shown). The member's state is outlined.
// AP calls are labeled as AP calls, never as certified results. Stripes and plain shades, no party colors.
// Everything from the data files goes on the page with textContent. A part with no data is left out.
(function () {
  'use strict';
  var BASE = '/results/', NS = 'http://www.w3.org/2000/svg';
  var PATHS_SRC = '/results/ap-map-paths.js?v=d116';
  var PARTY = [['D', 'Democratic', 'p-d'], ['R', 'Republican', 'p-r'], ['O', 'Other', 'p-o'], ['U', 'Not called yet', 'p-u']];
  var PNAME = { D: 'Democratic', R: 'Republican', O: 'Other' };
  var NAMES = {al:'Alabama',ak:'Alaska',az:'Arizona',ar:'Arkansas',ca:'California',co:'Colorado',ct:'Connecticut',de:'Delaware',dc:'District of Columbia',fl:'Florida',ga:'Georgia',hi:'Hawaii',id:'Idaho',il:'Illinois',in:'Indiana',ia:'Iowa',ks:'Kansas',ky:'Kentucky',la:'Louisiana',me:'Maine',md:'Maryland',ma:'Massachusetts',mi:'Michigan',mn:'Minnesota',ms:'Mississippi',mo:'Missouri',mt:'Montana',ne:'Nebraska',nv:'Nevada',nh:'New Hampshire',nj:'New Jersey',nm:'New Mexico',ny:'New York',nc:'North Carolina',nd:'North Dakota',oh:'Ohio',ok:'Oklahoma',or:'Oregon',pa:'Pennsylvania',ri:'Rhode Island',sc:'South Carolina',sd:'South Dakota',tn:'Tennessee',tx:'Texas',ut:'Utah',vt:'Vermont',va:'Virginia',wa:'Washington',wv:'West Virginia',wi:'Wisconsin',wy:'Wyoming'};
  // States with a U.S. Senate seat on the ballot in this election (the same list as /results/ap-map.js).
  var SEN = 'al ak ar co de fl ga id il ia ks ky la me ma mi mn ms mt ne nh nj nm nc oh ok or ri sc sd tn tx va wv wy'.split(' ');
  var FILL = { D: 'url(#srm-d)', R: 'url(#srm-r)', O: '#8fa6ad', U: '#0d2c3b', none: '#050f17' };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function s(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
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
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function resultsLink(code, race) { return '/results/?state=' + code + (race ? '&race=' + encodeURIComponent(race) : '') + '#tabs'; }

  // ---- 1. the member's state: U.S. Senate and Governor
  // The same four labels as /results/ (results.js statusOf), so a call is never mistaken for a certified result.
  function statusOf(c) {
    var cl = c.called;
    if (cl && cl.kind === 'certified') return ['cs-cert', 'Certified by the state'];
    if (cl && cl.kind === 'ap') return ['cs-ap', 'What AP is calling (not certified)'];
    if (cl && cl.kind === 'state_leader') return ['cs-lead', 'State shows leader (not certified)'];
    if (cl && cl.winner) return ['cs-ap', 'Called by ' + (cl.by || 'the source') + ' (not certified)'];
    return ['cs-none', 'Not called, not certified'];
  }
  function total(c) { return (c.choices || []).reduce(function (t, x) { return t + (x.votes || 0); }, 0); }
  // Some state files list a race more than once (per county or per district part); the statewide one has the most votes.
  function biggest(list) { return list.sort(function (a, b) { return total(b) - total(a); })[0] || null; }
  function pickRaces(d) {
    var cs = (d && d.contests || []).filter(function (c) { return c && c.kind === 'candidate' && Array.isArray(c.choices) && c.choices.length; });
    var name = function (c) { return String(c.office || '') + ' ' + String(c.title || ''); };
    var sen = biggest(cs.filter(function (c) { return c.level === 'federal' && /\b(u\.?\s?s\.?|united states)\s+senat/i.test(name(c)); }));
    var gov = biggest(cs.filter(function (c) {
      var t = String(c.title || c.office || '');
      return /^\s*(for\s+)?governor\b/i.test(t) && !/^\s*(for\s+)?governor\s+of\b/i.test(t) && !/^\s*lieutenant/i.test(t) && !/board|university|college/i.test(t);
    }));
    return [sen, gov].filter(Boolean);
  }
  // One race, kept short for the card: the top two by votes (the results page has the rest).
  function raceBox(c, code) {
    var box = el('div', 'sr-race');
    var head = el('div', 'sr-race-h');
    var h = el('a', 'sr-race-t', c.title || c.office || 'Race'); h.href = resultsLink(code, c.id);
    var st = statusOf(c);
    head.appendChild(h); head.appendChild(el('span', 'sr-stat ' + st[0], st[1]));
    box.appendChild(head);
    var t = total(c), ch = c.choices.slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    var win = c.called && c.called.winner;
    ch.slice(0, 2).forEach(function (x, i) {
      var pct = t ? (x.votes || 0) / t * 100 : 0;
      var row = el('div', 'sr-choice' + (i === 0 && t ? ' lead' : ''));
      var r = el('div', 'sr-row');
      var nm = el('span', 'sr-name', x.name + (x.party ? ' (' + x.party + ')' : ''));
      if (win && win === x.id) nm.appendChild(el('span', 'sr-called', { ap: 'AP call', certified: 'certified', state_leader: 'leader' }[c.called.kind] || 'called'));
      var n = el('span', 'sr-num', t ? pct.toFixed(1) + '%' : '');
      r.appendChild(nm); r.appendChild(n); row.appendChild(r);
      var bar = el('div', 'sr-bar'); bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', x.name + ': ' + num(x.votes || 0) + ' votes' + (t ? ', ' + pct.toFixed(1) + ' percent' : ''));
      var f = el('i'); f.style.width = Math.min(100, pct).toFixed(1) + '%'; bar.appendChild(f);
      row.appendChild(bar); box.appendChild(row);
    });
    var more = ch.length > 2 ? ' · ' + (ch.length - 2) + ' more candidate' + (ch.length - 2 === 1 ? '' : 's') : '';
    box.appendChild(el('p', 'sr-meta', num(t) + ' votes counted' + more));
    return box;
  }

  // ---- 2. Congress count bars (the same seats and wording as /results/ and /vote/). One legend, shared with the map.
  function congress(b) {
    var wrap = el('div', 'sr-cong');
    [['house', 'U.S. House'], ['senate', 'U.S. Senate']].forEach(function (x) {
      var d = b[x[0]]; if (!d) return;
      var row = el('div', 'sr-bal');
      var tot = (d.D || 0) + (d.R || 0) + (d.O || 0) + (d.U || 0);
      var head = el('p', 'sr-bal-t'); head.appendChild(el('span', null, x[1]));
      var counts = [['D', 'D'], ['R', 'R'], ['O', 'Other'], ['U', 'not called']].filter(function (p) { return p[0] !== 'O' || d.O; }).map(function (p) { return p[1] + ' ' + num(d[p[0]] || 0); });
      head.appendChild(el('span', 'sr-bal-n', counts.join(' · ')));
      row.appendChild(head);
      var bar = el('div', 'sr-balbar'); bar.setAttribute('role', 'img');
      var alt = [];
      PARTY.forEach(function (p) {
        var n = d[p[0]] || 0; alt.push(p[1] + ' ' + n);
        if (!n || !tot) return;
        var seg = el('i', p[2]); seg.style.width = (n / tot * 100).toFixed(2) + '%'; bar.appendChild(seg);
      });
      bar.setAttribute('aria-label', x[1] + ', what AP is calling (not certified): ' + alt.join(', '));
      row.appendChild(bar);
      wrap.appendChild(row);
    });
    return wrap;
  }
  function legend(mine, withMap) {
    var cap = el('p', 'sr-key');
    [['p-d', 'Democratic'], ['p-r', 'Republican'], ['p-o', 'Other'], ['p-u', 'Not called yet']].concat(withMap ? [['p-n', 'No Senate race']] : []).forEach(function (x) {
      var sp = el('span'); sp.appendChild(el('i', 'sr-sw ' + x[0])); sp.appendChild(document.createTextNode(x[1])); cap.appendChild(sp);
    });
    if (mine && NAMES[mine] && mine !== 'dc') { var me = el('span', 'sr-me'); me.appendChild(el('i', 'sr-sw sr-sw-mine')); me.appendChild(document.createTextNode(NAMES[mine])); cap.appendChild(me); }
    return cap;
  }

  // ---- 3. the little map: U.S. Senate calls by state
  function senKind(bal, c) {
    if (SEN.indexOf(c) < 0) return 'none';
    var b = bal && bal.senate && bal.senate[c];
    if (!b) return 'none';
    var w = ['D', 'R', 'O'].filter(function (p) { return b[p] > 0; });
    return w.length === 1 ? w[0] : 'U';
  }
  function senText(bal, c) {
    var n = NAMES[c] || c.toUpperCase(), k = senKind(bal, c);
    if (SEN.indexOf(c) < 0) return n + ': no U.S. Senate race in this election.';
    if (k === 'none') return n + ', U.S. Senate: no AP data collected yet.';
    if (k === 'U') return n + ', U.S. Senate: AP has not called it yet.';
    return n + ', U.S. Senate: AP is calling it for the ' + PNAME[k] + ' candidate (not certified).';
  }
  function littleMap(bal, mine) {
    var P = window.TW_MAP_PATHS; if (!P) return null;
    var fig = el('figure', 'sr-map');
    var svg = s('svg', { viewBox: '0 0 975 610', class: 'sr-svg', role: 'group', 'aria-label': 'Little map of what AP is calling for the U.S. Senate, by state. Each state links to its results.' });
    s('title', {}, svg).textContent = 'U.S. Senate: what AP is calling (not certified)';
    var defs = s('defs', {}, svg);
    var pd = s('pattern', { id: 'srm-d', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    s('rect', { width: 10, height: 10, fill: '#4f8fa0' }, pd); s('rect', { width: 5, height: 10, fill: '#cfeff0' }, pd);
    var pr = s('pattern', { id: 'srm-r', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(135)' }, defs);
    s('rect', { width: 10, height: 10, fill: '#9a8a5c' }, pr); s('rect', { width: 5, height: 10, fill: '#f0e6cf' }, pr);
    Object.keys(NAMES).forEach(function (c) {
      if (!P[c] || c === 'dc') return;
      var a = s('a', { href: resultsLink(c), class: 'sr-st', 'aria-label': senText(bal, c) }, svg);
      s('title', {}, a).textContent = senText(bal, c);
      s('path', { d: P[c].d, fill: FILL[senKind(bal, c)] || FILL.U, class: 'sr-sh' }, a);
    });
    if (mine && P[mine] && mine !== 'dc') {   // the member's state: a dark edge under a white one, so it shows on light and dark fills
      s('path', { d: P[mine].d, class: 'sr-mine sr-mine-o', 'aria-hidden': 'true' }, svg);
      s('path', { d: P[mine].d, class: 'sr-mine sr-mine-i', 'aria-hidden': 'true' }, svg);
    }
    fig.appendChild(svg);
    return fig;
  }
  var pathsP = null;
  function loadPaths() {
    if (window.TW_MAP_PATHS) return Promise.resolve();
    if (!pathsP) pathsP = new Promise(function (ok) {
      var sc = document.createElement('script'); sc.src = PATHS_SRC; sc.defer = true;
      sc.onload = function () { ok(); }; sc.onerror = function () { ok(); };
      document.head.appendChild(sc);
    });
    return pathsP;
  }

  // mount(into, { abbr: 'CO', stateName: 'Colorado' }): fills `into` and refreshes it every minute (the state file every 5 minutes).
  function mount(into, o) {
    if (!into || !window.fetch) return;
    var code = String(o && o.abbr || '').toLowerCase(), name = o && o.stateName || NAMES[code] || '';
    var stateBox = el('div', 'sr-part sr-state'), congBox = el('div', 'sr-part'), upd = el('p', 'sr-meta sr-upd');
    into.replaceChildren(stateBox, congBox, upd);
    into.hidden = true;
    var stateAt = 0, scopeFile = null;

    function drawState() {
      if (!code || !scopeFile || Date.now() - stateAt < 300000) return;
      stateAt = Date.now();
      getJSON('data/' + scopeFile).then(function (d) {
        var races = pickRaces(d);
        stateBox.textContent = '';
        stateBox.appendChild(el('h3', 'sr-h', name ? 'Your state: ' + name : 'Your state'));
        races.forEach(function (c) { stateBox.appendChild(raceBox(c, code)); });
        var all = el('a', 'sr-all', races.length ? 'All ' + (name || 'state') + ' results' : 'See the ' + (name || 'state') + ' results we collected');
        all.href = resultsLink(code); stateBox.appendChild(all);
      }).catch(function () { stateAt = 0; });
    }
    var timer = null;
    function load() {
      if (timer && !into.isConnected) { clearInterval(timer); return; }   // the home page was drawn again; that copy has its own timer
      getJSON('data/manifest.json').then(function (m) {
        var b = m && m.balance;
        var files = (m && m.files) || [];
        var want = code === 'co' ? 'co' : 'state-' + code;
        scopeFile = (files.filter(function (f) { return f.scope === want; })[0] || {}).path || null;
        if (!b || (!b.house && !b.senate)) { if (!scopeFile) { into.hidden = true; return; } }
        into.hidden = false;
        drawState();
        var mode = m.mode === 'final' ? 'Collection has stopped. Counts may change until certified.' : m.mode === 'live' ? 'Collecting live.' : '';
        upd.textContent = (mode ? mode + ' ' : '') + (m.generated_at ? 'Updated ' + when(m.generated_at) + '.' : '');
        return Promise.all([getJSON('data/balance.json').catch(function () { return null; }), loadPaths()]).then(function (a) {
          var bal = a[0], fig = bal && bal.senate ? littleMap(bal, code) : null;
          var hasBars = b && (b.house || b.senate);
          if (!hasBars && !fig) return;
          var full = el('a', 'sr-all', 'Open the full results map'); full.href = '/results/#apmap';
          var side = el('div', 'sr-cong-side');
          if (hasBars) side.appendChild(congress(b));
          side.appendChild(legend(fig ? code : '', !!fig));
          var grid = el('div', 'sr-cong-grid'); grid.appendChild(side);
          if (fig) { fig.insertBefore(el('figcaption', 'sr-meta', 'U.S. Senate by state. Tap a state for its results.'), fig.firstChild); grid.appendChild(fig); }
          congBox.replaceChildren(el('h3', 'sr-h', 'Congress so far'), el('p', 'sr-meta', 'Seats AP is calling, not certified. D is Democratic, R is Republican.'), grid, full);
        });
      }).catch(function () { /* the buttons below still open the results page */ });
    }
    load();
    timer = setInterval(load, 60000);
  }

  window.WaySeasonResults = { mount: mount, pickRaces: pickRaces, statusOf: statusOf };
})();
