// VOTE! page. (1) A member who saved a state gets a link straight to that state's voter guide (the bar stores it for drawing links only),
// a small map with their state lit, and My ballot / guide links that match. Everyone else sees the big map.
// (2) The Election results card counts down: to Election Day, then to polls closing. Same dates and rules as the season card on /members/
// (season.json, /results/config.json, poll-close.json), so changing a date there changes it here.
// (3) "Your next upcoming vote" under the Voter guide: the soonest date for the visitor's state from season.json "upcoming" (federal and state),
// plus, if they ask for it, their county's upcoming elections from /lookup/local/<st>.json (found on official county pages and checked
// word for word). Nothing is guessed: no date in the data means the card says so. The choice is kept on this device only.
(function () {
  'use strict';
  var NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
  function $(id) { return document.getElementById(id); }

  // ---- member's state
  var abbr = '';
  var d = window.WayBar && window.WayBar.read && window.WayBar.read();
  var a = $('guide');
  if (d && d.ballot && a) {
    a.setAttribute('href', d.ballot);
    var m = /^\/guide(?:-([a-z]{2}))?\/$/.exec(d.ballot);   // /guide/ is the Colorado guide
    abbr = m ? (m[1] || 'co').toUpperCase() : '';
  }
  if (abbr && NAMES[abbr]) {
    var mapHref = abbr === 'CO' ? '/map/' : '/map-' + abbr.toLowerCase() + '/';   // the Colorado district map is /map/
    var st = document.querySelector('.us-st[href="' + mapHref + '"]');
    document.querySelector('main').classList.add('has-state');
    if (st) st.classList.add('mine');
    $('map-note').textContent = 'Your state is lit. Tap another to look at it.';
    var mine = $('map-mine-a');
    mine.textContent = 'Pick your ' + NAMES[abbr] + ' district';
    mine.setAttribute('href', mapHref);
    $('map-mine').hidden = false;
  }

  // ---- your next upcoming vote
  (function nextVote() {
    var box = $('next');
    if (!box || !window.fetch) { if (box) box.hidden = true; return; }
    var ALL = {}; Object.keys(NAMES).forEach(function (k) { ALL[k] = NAMES[k]; }); ALL.DC = 'District of Columbia';
    var PREF = 'theway.nextvote';
    var pref = { st: '', scope: 'state', county: '' };
    try { var sv = JSON.parse(localStorage.getItem(PREF) || 'null'); if (sv && sv.v === 1) pref = { st: ALL[sv.st] ? sv.st : '', scope: sv.scope === 'local' ? 'local' : 'state', county: /^\d{5}$/.test(sv.county || '') ? sv.county : '' }; } catch (e) { /* private mode */ }
    if (!pref.st && abbr) pref.st = abbr;
    function keep() { try { localStorage.setItem(PREF, JSON.stringify({ v: 1, st: pref.st, scope: pref.scope, county: pref.county })); } catch (e) { /* private mode */ } }

    var sel = $('next-state'), csel = $('next-county'), crow = $('next-county-row');
    Object.keys(ALL).sort(function (x, y) { return ALL[x] < ALL[y] ? -1 : 1; }).forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = ALL[k]; sel.appendChild(o);
    });
    sel.value = pref.st;
    var radios = document.querySelectorAll('input[name="next-scope"]');
    Array.prototype.forEach.call(radios, function (r) { r.checked = r.value === pref.scope; });

    var season = null, tzs = {}, localIndex = null, localCache = {}, timer = null;
    function json(url) { return fetch(url, { credentials: 'omit', cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
    function iso(ms, tz) {   // the calendar date (YYYY-MM-DD) at a moment, in a time zone (the visitor's own when tz is empty)
      var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }), v = {};
      f.formatToParts(new Date(ms)).forEach(function (x) { v[x.type] = x.value; });
      return v.year + '-' + v.month + '-' + v.day;
    }
    function longDate(d) {
      var p = d.split('-').map(Number);
      return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    function okUrl(u) { try { var x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch (e) { return false; } }
    function local(st) {
      if (localCache[st]) return localCache[st];
      localCache[st] = (localIndex && localIndex[st] ? json('/lookup/local/' + st.toLowerCase() + '.json') : Promise.resolve(null)).catch(function () { return null; });
      return localCache[st];
    }
    function show(id, text) { var n = $(id); n.textContent = text || ''; n.hidden = !text; }
    function stopClock() { if (timer) clearInterval(timer); timer = null; $('next-clock').hidden = true; }

    function draw() {
      stopClock();
      $('next-src').hidden = true;
      var st = pref.st, tz = tzs[st] ? tzs[st].tz : '';
      crow.hidden = !(pref.scope === 'local' && st);
      if (!st) { $('next-date').textContent = 'Pick your state'; show('next-name', 'Then we show the date of your next vote and count down to it.'); return; }
      var today = iso(Date.now(), tz);
      var list = [];
      ((season && season.upcoming) || []).forEach(function (u) {
        if (!u || typeof u.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.date)) return;
        if (u.state !== 'all' && u.state !== st) return;
        if (u.date >= today) list.push({ d: u.date, n: String(u.name || 'Election'), local: false });
      });
      var wantLocal = pref.scope === 'local';
      (wantLocal ? local(st) : Promise.resolve(null)).then(function (L) {
        if (st !== pref.st) return;   // the visitor changed state while this loaded
        var counties = (L && L.counties) || {}, keys = Object.keys(counties);
        // County list: only counties our checker has read. Rebuilt when the state changes.
        if (wantLocal && csel.getAttribute('data-st') !== st) {
          while (csel.options.length > 1) csel.remove(1);
          keys.sort(function (x, y) { return counties[x].name < counties[y].name ? -1 : 1; }).forEach(function (f) {
            var o = document.createElement('option'); o.value = f; o.textContent = counties[f].name; csel.appendChild(o);
          });
          csel.setAttribute('data-st', st);
        }
        if (wantLocal) csel.value = counties[pref.county] ? pref.county : '';
        var C = wantLocal ? counties[pref.county] : null;
        if (C) (C.elections || []).forEach(function (e) {
          if (e && typeof e.d === 'string' && e.d >= today && okUrl(e.u)) list.push({ d: e.d, n: String(e.n || 'Local election'), local: true, u: e.u, c: e.c, where: C.name });
        });
        list.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
        var notes = [];
        if (wantLocal && !keys.length) notes.push('We have no checked county pages for ' + ALL[st] + ' yet, so county and local votes are not shown.');
        else if (wantLocal && !C) notes.push('Pick your county to add its votes. Only counties our checker has read so far are listed.');
        else if (wantLocal && C && !list.some(function (x) { return x.local; })) notes.push('No upcoming election was found on ' + C.name + "'s official pages the last time we checked. That does not mean there is none.");
        var next = list[0];
        if (!next) {
          $('next-date').textContent = 'No date in our data yet';
          show('next-name', 'We have no upcoming ' + (wantLocal ? 'vote' : 'federal or state vote') + ' for ' + ALL[st] + ' in our data. We only add dates from official sources. Your state election office has the official calendar.' + (notes.length ? ' ' + notes.join(' ') : ''));
          return;
        }
        $('next-date').textContent = longDate(next.d);
        show('next-name', next.n + (next.local ? ' (' + next.where + ')' : '') + (notes.length ? '. ' + notes.join(' ') : ''));
        if (next.local) {
          var s = $('next-src'); s.replaceChildren();
          var a = document.createElement('a'); a.href = next.u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Official source';
          s.appendChild(a);
          s.appendChild(document.createTextNode(next.c ? ' (checked ' + longDate(next.c) + ')' : ''));
          s.hidden = false;
        }
        // Count down to the start of that day in the state's time zone (the visitor's own when we do not have one).
        var start = tz ? zoned(next.d, '00:00', tz) : new Date(next.d + 'T00:00:00').getTime();
        function tick() {
          var ms = start - Date.now();
          if (ms <= 0) { stopClock(); show('next-name', 'Today: ' + next.n + (next.local ? ' (' + next.where + ')' : '') + '. Check your polling place and hours with your election office.'); return; }
          var sec = Math.floor(ms / 1000), day = Math.floor(sec / 86400); sec -= day * 86400;
          var h = Math.floor(sec / 3600); sec -= h * 3600;
          var mi = Math.floor(sec / 60); sec -= mi * 60;
          $('nx-d').textContent = day; $('nx-h').textContent = h; $('nx-m').textContent = mi; $('nx-s').textContent = sec;
        }
        $('next-clock').hidden = false;
        tick(); timer = setInterval(tick, 1000);
      });
    }

    sel.addEventListener('change', function () { pref.st = sel.value; pref.county = ''; keep(); draw(); });
    csel.addEventListener('change', function () { pref.county = csel.value; keep(); draw(); });
    Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', function () { if (r.checked) { pref.scope = r.value; keep(); draw(); } }); });

    Promise.all([json('/members/season.json').catch(function () { return {}; }), json('/members/poll-close.json').catch(function () { return {}; }),
      json('/lookup/local/index.json').catch(function () { return {}; })]).then(function (r) {
      season = r[0] || {}; tzs = (r[1] && r[1].states) || {}; localIndex = (r[2] && r[2].states) || {};
      draw();
    });
  })();

  // ---- countdown
  function get(url) { return fetch(url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  function t(v) { var n = Date.parse(v); return isFinite(n) ? n : null; }
  function zoned(date, hhmm, tz) {   // 'HH:MM' on a calendar date in an IANA zone, as a UTC timestamp (handles daylight saving)
    var p = date.split('-').map(Number), q = hhmm.split(':').map(Number), guess = Date.UTC(p[0], p[1] - 1, p[2], q[0], q[1]);
    function offset(ms) {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }), v = {};
      f.formatToParts(new Date(ms)).forEach(function (x) { v[x.type] = Number(x.value); });
      return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) - ms;
    }
    var o = offset(guess); return guess - offset(guess - o);
  }
  if (!window.fetch || !$('count')) return;
  Promise.all([get('/members/season.json').catch(function () { return {}; }), get('/results/config.json').catch(function () { return {}; }),
    get('/members/poll-close.json').catch(function () { return {}; })]).then(function (r) {
    var s = r[0] || {}, c = r[1] || {}, pc = r[2] || {};
    var row = (pc.states || {})[abbr];
    var polls = row && pc.election_date && row.tz ? zoned(pc.election_date, row.close, row.tz) : t(c.election_ends_at);
    var dayStart = t(s.election_day_starts_at);
    var label = $('count-label'), clock = $('count-clock');
    function tick() {
      var now = Date.now(), target, text;
      if (dayStart != null && now < dayStart) { target = dayStart; text = 'Election Day in'; }
      else if (polls != null && now < polls) { target = polls; text = 'Polls close in'; }
      else { $('count').hidden = true; clearInterval(timer); return; }   // after polls close the bubble picture and the title say it all
      var ms = target - now, sec = Math.floor(ms / 1000), day = Math.floor(sec / 86400); sec -= day * 86400;
      var h = Math.floor(sec / 3600); sec -= h * 3600;
      var mi = Math.floor(sec / 60); sec -= mi * 60;
      label.textContent = text;
      $('cd-d').textContent = day; $('cd-h').textContent = h; $('cd-m').textContent = mi; $('cd-s').textContent = sec;
    }
    if (dayStart == null && polls == null) { $('count').hidden = true; return; }
    var timer = setInterval(tick, 1000); tick();
  });
})();
