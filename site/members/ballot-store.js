// The Way: My Ballot storage (window.WayBallot). Shared by the guide pages (ballot-pick.js) and the planner
// (my-ballot.html). One plan per state, kept ONLY in this browser's localStorage. Nothing in this file sends
// anything anywhere. Saving to a member account and sharing for forecasting are separate, explicit buttons in
// my-ballot.js. Everything read back (from storage, a backup file or the account) goes through clean(), so a
// bad or hand-edited file can never put markup or odd values on the page.
(function () {
  'use strict';
  var PREFIX = 'theway.ballot.v1.';
  var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',
    FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
    MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
    NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
    SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  var LIMITS = { contests: 150, options: 60, facts: 400, text: 1200, note: 500, label: 160 };

  function str(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
  function slug(v) { v = typeof v === 'string' ? v : ''; return /^[a-z0-9][a-z0-9-]{0,79}$/.test(v) ? v : ''; }
  // Links we keep: pages on this site (a path under the guide) or an https source. Never javascript: or data:.
  function url(v) {
    if (typeof v !== 'string' || v.length > 600) return '';
    if (/^\/preview\/pages\/guide(-[a-z]{2})?\/[A-Za-z0-9._\/-]*$/.test(v)) return v;
    try { var u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch (e) { return ''; }
  }
  function ckey(v) { return typeof v === 'string' && /^(race|measure):[a-z0-9-]{1,80}(:[a-z0-9-]{1,80})?$/.test(v) ? v : ''; }

  function empty(st) { return { v: 1, state: st, contests: {}, facts: {}, updated: 0 }; }

  // Private "would you vote for this person?" answers and rank numbers, per option id. Only for options the contest lists.
  function leanMap(m, ids) {
    var r = {}; if (!m || typeof m !== 'object') return r;
    Object.keys(m).forEach(function (k) { if (ids[k] && (m[k] === 'yes' || m[k] === 'no' || m[k] === 'maybe')) r[k] = m[k]; });
    return r;
  }
  function rankMap(m, ids) {
    var r = {}; if (!m || typeof m !== 'object') return r;
    Object.keys(m).forEach(function (k) { var n = parseInt(m[k], 10); if (ids[k] && n >= 1 && n <= 99) r[k] = n; });
    return r;
  }

  function clean(d, st) {
    var out = empty(st);
    if (!d || typeof d !== 'object') return out;
    var n = 0, k;
    for (k in (d.contests || {})) {
      if (n >= LIMITS.contests) break;
      var c = d.contests[k];
      if (!c || ckey(k) !== k) continue;
      var opts = [], ids = {}, i;
      var co = Array.isArray(c.options) ? c.options.slice(0, LIMITS.options) : [];
      for (i = 0; i < co.length; i++) {
        var o = co[i], id = slug(o && o.id);
        if (!id || ids[id]) continue;
        ids[id] = true;
        opts.push({ id: id, label: str(o.label, LIMITS.label), sub: str(o.sub, LIMITS.label), url: url(o.url) });
      }
      function pick(list) {
        var r = [];
        (Array.isArray(list) ? list : []).forEach(function (x) { x = slug(x); if (x && r.indexOf(x) < 0 && r.length < LIMITS.options) r.push(x); });
        return r;
      }
      var kind = c.kind === 'measure' ? 'measure' : 'race';
      var seats = Math.max(1, Math.min(20, parseInt(c.seats, 10) || 1));
      var picks = pick(c.picks).slice(0, seats);
      out.contests[k] = { key: k, kind: kind, title: str(c.title, LIMITS.label), url: url(c.url), seats: seats, options: opts,
        picks: picks, undecided: c.undecided === true && !picks.length, compare: pick(c.compare), note: str(c.note, LIMITS.note),
        leans: leanMap(c.leans, ids), ranks: rankMap(c.ranks, ids) };
      n++;
    }
    n = 0;
    for (k in (d.facts || {})) {
      if (n >= LIMITS.facts) break;
      var f = d.facts[k];
      if (!f || !/^[a-f0-9]{8}$/.test(k)) continue;
      var text = str(f.text, LIMITS.text);
      if (!text) continue;
      out.facts[k] = { id: k, kind: f.kind === 'highlight' ? 'highlight' : 'item', text: text,
        contest: ckey(f.contest), subject: slug(f.subject), subjectLabel: str(f.subjectLabel, LIMITS.label),
        pageUrl: url(f.pageUrl), pageTitle: str(f.pageTitle, LIMITS.label), srcUrl: url(f.srcUrl), srcLabel: str(f.srcLabel, 80),
        print: f.print !== false, compare: f.compare !== false, side: f.side === 'yes' || f.side === 'no' ? f.side : '',
        note: str(f.note, LIMITS.note), ts: Math.max(0, Math.min(Date.now() + 864e5, +f.ts || 0)) };
      n++;
    }
    out.updated = Math.max(0, +d.updated || 0);
    return out;
  }

  function read(st) {
    try { return clean(JSON.parse(localStorage.getItem(PREFIX + st) || 'null'), st); } catch (e) { return empty(st); }
  }
  var failed = false;
  function write(d) {
    d.updated = Date.now();
    try { localStorage.setItem(PREFIX + d.state, JSON.stringify(d)); failed = false; } catch (e) { failed = true; }
    try { document.dispatchEvent(new CustomEvent('theway-ballot', { detail: { state: d.state } })); } catch (e) { /* old browser */ }
    return !failed;
  }
  function states() {
    var r = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (k.indexOf(PREFIX) === 0 && STATES[k.slice(PREFIX.length)]) {
          var d = read(k.slice(PREFIX.length));
          if (Object.keys(d.contests).length || Object.keys(d.facts).length) r.push(d.state);
        }
      }
    } catch (e) { /* storage blocked */ }
    return r.sort();
  }
  function clear(st) { try { localStorage.removeItem(PREFIX + st); } catch (e) { /* ignore */ } try { document.dispatchEvent(new CustomEvent('theway-ballot', { detail: { state: st } })); } catch (e) { /* ignore */ } }
  function count(d) { return Object.keys(d.contests).filter(function (k) { var c = d.contests[k]; return c.picks.length || c.undecided || c.compare.length; }).length + Object.keys(d.facts).length; }

  // FNV-1a: a short stable id for a saved fact (page + text). Not security, only a key.
  function factId(page, text) {
    var h = 0x811c9dc5, s = page + '\n' + text;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }


  // ---- reading a race page (used by the guide-page buttons and the planner's marking screen)
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function txt(n) { return (n.textContent || '').replace(/\s+/g, ' ').trim(); }
  function sl(s) { return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function h1Text(doc) {
    var h = doc.querySelector('main h1'); if (!h) return '';
    var c = h.cloneNode(true), s = c.querySelector('.sub'), sub = '';
    if (s) { sub = txt(s); s.remove(); }
    return txt(c) + (sub ? ': ' + sub : '');
  }
  function seatsIn(text) {
    var r = /(?:vote for|choose|select) up to (\d+|[a-z]+)/i.exec(text) || /vote for (\d+)\b/i.exec(text);
    if (!r) return 1;
    var n = /^\d+$/.test(r[1]) ? parseInt(r[1], 10) : (NUM[r[1].toLowerCase()] || 1);
    return n >= 1 && n <= 20 ? n : 1;
  }

  // Race contests on a race page (or a fetched copy of one). A page with two lists (governor + lieutenant governor) has two contests.
  function parseRace(doc, base, raceSlug) {
    var root = doc.querySelector('main'); if (!root) return [];
    var nodes = root.querySelectorAll('h2, h3, ul.cands'), head = '', lists = [], i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].tagName === 'UL') lists.push({ ul: nodes[i], head: head }); else head = txt(nodes[i]);
    }
    var title = h1Text(doc), whole = txt(root), out = [], used = {};
    lists.forEach(function (l) {
      var key = 'race:' + raceSlug;
      if (lists.length > 1) { key += ':' + (sl(l.head) || 'list'); }
      while (used[key]) key += '-2';
      used[key] = true;
      var seg = l.head, n = l.ul.previousElementSibling, k = 0;
      while (n && k++ < 4 && !/^H[1-6]$/.test(n.tagName)) { seg += ' ' + txt(n); n = n.previousElementSibling; }
      n = l.ul.nextElementSibling; k = 0;
      while (n && k++ < 3 && !/^H[1-6]$/.test(n.tagName) && n.tagName !== 'UL') { seg += ' ' + txt(n); n = n.nextElementSibling; }
      var seats = seatsIn(seg);
      if (seats === 1 && lists.length === 1) seats = seatsIn(whole);
      var options = [];
      Array.prototype.forEach.call(l.ul.querySelectorAll(':scope > li'), function (li) {
        var a = li.querySelector('a[href]'); if (!a) return;
        var p;
        try { p = new URL(a.getAttribute('href'), base).pathname; } catch (e) { return; }
        var id = (/\/([a-z0-9-]+)\.html$/.exec(p) || [])[1]; if (!id) return;
        var party = li.querySelector('.party'), what = li.querySelector('.what');
        options.push({ id: id, label: txt(a), sub: [party ? txt(party) : '', what ? txt(what) : ''].filter(Boolean).join(' · '), url: p });
      });
      out.push({ key: key, kind: 'race', title: lists.length > 1 && l.head && l.head !== title ? title + ': ' + l.head : title,
        url: new URL(base).pathname, seats: seats, options: options, ul: l.ul });
    });
    return out;
  }
  function parseMeasure(doc, slug, pageUrl) {
    return { key: 'measure:' + slug, kind: 'measure', title: h1Text(doc), url: pageUrl, seats: 1,
      options: [{ id: 'yes', label: 'Yes', sub: '', url: '' }, { id: 'no', label: 'No', sub: '', url: '' }] };
  }

  window.WayBallot = { STATES: STATES, LIMITS: LIMITS, read: read, write: write, clean: clean, empty: empty, states: states, clear: clear,
    txt: txt, sl: sl, h1Text: h1Text, parseRace: parseRace, parseMeasure: parseMeasure, count: count, factId: factId, ckey: ckey, slug: slug, url: url, stored: function () { return !failed; } };
})();
