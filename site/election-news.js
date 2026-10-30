'use strict';
// Election news on the front page: headline, source and date only, linking out to the publisher.
// Reads the static feed the news cycle already publishes (/news/data/). All text goes in via textContent.
// "Your ballot" reads My Ballot plans from this browser's localStorage only; nothing is sent anywhere.
(function () {
  var root = document.getElementById('enews');
  if (!root) return;
  var sel = document.getElementById('enews-sel');
  var list = document.getElementById('enews-list');
  var note = document.getElementById('enews-note');
  var DATA = '/news/data/election/';   // small files from tools/build-election-news.py, not the 2 MB latest.json
  var SHOW = 40;
  var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  var ELECTION = /\b(elections?|ballots?|voters?|voting|votes?|candidates?|primary|primaries|runoff|polls?|polling|campaigns?|midterms?|amendment|proposition|referendum|congressional|secretary of state|redistricting)\b/i;
  var cache = {};

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function safeUrl(u) { if (typeof u !== 'string' || u.length > 2048) return ''; try { var x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch (e) { return ''; } }
  function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  function norm(t) { return t.toLowerCase().replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').replace(/[^a-z0-9 ]/g, '').trim(); }

  function clean(raw) {
    var title = str(raw && raw.title, 300), url = safeUrl(raw && raw.url);
    if (!title || !url) return null;
    var pub = Date.parse(raw.published_at), seen = Date.parse(raw.first_seen_at);
    return { title: title, url: url, source: str(raw.source, 80), states: Array.isArray(raw.states) ? raw.states.filter(function (s) { return typeof s === 'string'; }).map(function (s) { return s.slice(0, 2).toUpperCase(); }) : [],
      measures: Array.isArray(raw.measures) ? raw.measures.filter(function (m) { return typeof m === 'string'; }) : [],
      dateOnly: typeof raw.published_at === 'string' && raw.published_at.length <= 10, pub: isFinite(pub) ? pub : null, sort: isFinite(pub) ? pub : (isFinite(seen) ? seen : 0) };
  }
  function load(path) {
    if (cache[path]) return cache[path];
    cache[path] = fetch(DATA + path, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      return (Array.isArray(d && d.items) ? d.items : []).slice(0, 100).map(clean).filter(Boolean);
    });
    return cache[path];
  }
  function tidy(items) {
    var seen = {}, out = [];
    items.filter(function (i) { return ELECTION.test(i.title); }).sort(function (a, b) { return b.sort - a.sort; }).forEach(function (i) {
      var k = norm(i.title); if (seen[k]) return; seen[k] = 1; out.push(i);
    });
    return out;
  }

  // Saved ballots: {STATE: {measures:[slug], names:[text]}} from My Ballot in this browser.
  function ballots() {
    var out = {};
    try {
      for (var n = 0; n < localStorage.length; n++) {
        var k = localStorage.key(n), m = /^theway\.ballot\.v1\.([A-Z]{2})$/.exec(k || '');
        if (!m) continue;
        var d = JSON.parse(localStorage.getItem(k)), cs = d && d.contests || {}, b = { measures: [], names: [] };
        Object.keys(cs).slice(0, 150).forEach(function (ck) {
          var c = cs[ck]; if (!c) return;
          if (/^measure:/.test(ck)) { b.measures.push(ck.slice(8)); var t = str(c.title, 160); if (t) b.names.push(t); }
          (Array.isArray(c.options) ? c.options : []).slice(0, 60).forEach(function (o) {
            var lab = str(o && o.label, 120);
            if (c.kind === 'measure' || !lab || /^(yes|no)$/i.test(lab)) return;
            b.names.push(lab);
            var parts = lab.split(' ');
            if (parts.length > 1 && parts[parts.length - 1].length >= 5) b.names.push(parts[parts.length - 1]);
          });
        });
        if (b.measures.length || b.names.length) out[m[1]] = b;
      }
    } catch (e) { return {}; }
    return out;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function render(items, emptyMsg) {
    list.textContent = '';
    list.scrollTop = 0;
    if (!items.length) { list.appendChild(el('li', 'enews-empty', emptyMsg)); return; }
    items.slice(0, SHOW).forEach(function (i) {
      var li = el('li', 'enews-item'), a = el('a', 'enews-title', i.title);
      a.href = i.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
      var meta = el('div', 'enews-meta');
      meta.appendChild(el('span', null, i.source || 'Source not listed'));
      if (i.pub != null) {
        var d = new Date(i.pub);
        meta.appendChild(el('span', null, i.dateOnly ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
      }
      li.append(a, meta); list.appendChild(li);
    });
  }

  function show(choice) {
    note.textContent = '';
    list.setAttribute('aria-busy', 'true');
    var done = function (items, msg) { list.removeAttribute('aria-busy'); render(items, msg); };
    var fail = function () { list.removeAttribute('aria-busy'); render([], 'The election news could not load right now. Try the full news page.'); };
    if (choice === 'ballot') {
      var b = ballots(), sts = Object.keys(b);
      if (!sts.length) { done([], 'No saved ballot in this browser yet. Build one in My Ballot and its stories show up here.'); return; }
      Promise.all(sts.map(function (s) {
        return load(s.toLowerCase() + '.json').then(function (items) {
          var names = b[s].names.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 80);
          var re = names.length ? new RegExp('\\b(' + names.map(esc).join('|') + ')\\b', 'i') : null;
          return items.filter(function (i) { return b[s].measures.some(function (m) { return i.measures.indexOf(m) >= 0; }) || (re && re.test(i.title)); });
        }).catch(function () { return []; });
      })).then(function (all) { done(tidy([].concat.apply([], all)), 'No stories matched your saved races and measures yet.'); });
      return;
    }
    if (choice === 'national') {
      load('national.json').then(function (items) { done(tidy(items), 'No national election stories right now.'); }, fail);
      return;
    }
    if (STATES[choice]) {
      load(choice.toLowerCase() + '.json').then(function (items) { done(tidy(items), 'No election stories for ' + STATES[choice] + ' right now.'); }, fail);
    }
  }

  var g1 = el('optgroup'); g1.label = 'Choose';
  var o1 = el('option', null, 'Your ballot'); o1.value = 'ballot'; var o2 = el('option', null, 'National'); o2.value = 'national';
  g1.append(o1, o2); sel.appendChild(g1);
  var g2 = el('optgroup'); g2.label = 'A state';
  Object.keys(STATES).forEach(function (s) { var o = el('option', null, STATES[s]); o.value = s; g2.appendChild(o); });
  sel.appendChild(g2);

  var start = Object.keys(ballots()).length ? 'ballot' : 'national';
  try { var saved = localStorage.getItem('theway.enews.choice'); if (saved && (saved === 'ballot' || saved === 'national' || STATES[saved])) start = saved; } catch (e) {}
  sel.value = start;
  sel.addEventListener('change', function () { try { localStorage.setItem('theway.enews.choice', sel.value); } catch (e) {} show(sel.value); });
  show(start);
})();
