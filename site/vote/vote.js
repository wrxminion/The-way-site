// VOTE! page. (1) A member who saved a state gets a link straight to that state's voter guide (the bar stores it for drawing links only),
// a small map with their state lit, and My ballot / guide links that match. Everyone else sees the big map.
// (2) The Election results card counts down: to Election Day, then to polls closing. Same dates and rules as the season card on /members/
// (season.json, /results/config.json, poll-close.json), so changing a date there changes it here.
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
      else { label.textContent = 'Polls have closed'; clock.textContent = 'See the results'; clock.className = 'count-done'; clearInterval(timer); return; }
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
