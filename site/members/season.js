// The season card at the very top of the members home (Frank, Oct 30). One card, four phases, switched by dates in
// season.json and /results/config.json, never by hand:
//   My ballot (until Election day starts) > Election day (until polls close) > Election results (until results_ends_at) > Accountability.
// Also on the card, in every phase: a countdown to the next vote in the member's state, and the upcoming votes we know about
// (season.json "upcoming": add a line there for each vote as it is confirmed, "state" is a two-letter code or "all").
// If either file cannot be read the card falls back to the My ballot phase with no countdown.
(function () {
  'use strict';
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function get(url) { return fetch(url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
  function t(v) { var n = Date.parse(v); return isFinite(n) ? n : null; }
  function span(ms) {
    if (ms <= 0) return 'now';
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); m = m % 60;
    if (d >= 1) return d + (d === 1 ? ' day ' : ' days ') + h + (h === 1 ? ' hour' : ' hours');
    return h >= 1 ? h + (h === 1 ? ' hour ' : ' hours ') + m + ' min' : m + ' min';
  }
  function dateText(iso) {   // "2026-11-03" is a calendar date, shown as written; a full time is shown in the viewer's time zone
    return iso.length <= 10 ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'full' })
      : new Date(iso).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  }
  // The moment a calendar-date vote starts counting down to: the start of that day in the viewer's time zone.
  function startOf(iso) { return iso.length <= 10 ? new Date(iso + 'T00:00:00').getTime() : Date.parse(iso); }

  // The moment 'HH:MM' on a calendar date happens in an IANA time zone, as a UTC timestamp (handles daylight saving).
  function zoned(date, hhmm, tz) {
    var p = date.split('-').map(Number), q = hhmm.split(':').map(Number), guess = Date.UTC(p[0], p[1] - 1, p[2], q[0], q[1]);
    function offset(ms) {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }), v = {};
      f.formatToParts(new Date(ms)).forEach(function (x) { v[x.type] = Number(x.value); });
      return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) - ms;
    }
    var o = offset(guess); return guess - offset(guess - o);
  }
  function clockIn(ms, tz) { return new Date(ms).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }

  // phase(now, season, closeMs) -> 'ballot' | 'election_day' | 'results' | 'accountability'
  // closeMs: when polls close for this member (their state's close from poll-close.json, else /results/config.json election_ends_at)
  function phase(now, s, closeMs) {
    var dayStart = t(s.election_day_starts_at), close = closeMs, end = t(s.results_ends_at);
    if (dayStart == null || now < dayStart) return 'ballot';
    if (close == null || now < close) return 'election_day';
    if (end == null || now < end) return 'results';
    return 'accountability';
  }

  // mount(into, { abbr, stateName, guideHref: function, now: optional function for tests })
  function mount(into, o) {
    var clock = o.now || Date.now, abbr = String(o.abbr || '').toUpperCase();
    Promise.all([get('/members/season.json').catch(function () { return {}; }), get('/results/config.json').catch(function () { return {}; }),
      get('/members/poll-close.json').catch(function () { return {}; })])
      .then(function (a) { draw(a[0] || {}, a[1] || {}, a[2] || {}); });

    function draw(s, r, pc) {
      var card = el('section', 'season'); card.setAttribute('aria-labelledby', 'season-title');
      var title = el('h2', 'season-title'); title.id = 'season-title';
      var sub = el('p', 'season-sub'), count = el('p', 'season-count'), btns = el('div', 'btns season-btns');
      // Polls close at the member's own state close (state time zone) when the table has it; otherwise the site-wide time.
      var row = (pc.states || {})[abbr], pollsOwn = !!(row && pc.election_date), tz = row && row.tz;
      var polls = pollsOwn ? zoned(pc.election_date, row.close, tz) : t(r.election_ends_at);
      var which = phase(clock(), s, polls);
      function btn(text, href, primary) { var a = el('a', primary ? 'button primary' : 'button', text); a.href = typeof href === 'function' ? href() : href; if (typeof href === 'function') a.addEventListener('click', function () { a.href = href(); }); btns.append(a); }
      var mine = '/members/my-ballot.html', guide = o.guideHref || function () { return '/states/'; };
      var dayStart = t(s.election_day_starts_at);
      var released = t(r.release_at) != null && clock() >= t(r.release_at);

      if (which === 'ballot') {
        title.textContent = 'My ballot';
        sub.textContent = '';
        btn('Open My ballot', mine, true); btn(abbr ? 'Open your voter guide' : 'Choose your state', guide);
        if (released) btn('Election results', '/results/');
      } else if (which === 'election_day') {
        title.textContent = 'Election day';
        sub.textContent = 'Polls are open today. Check your ballot picks and find your polling information in your voter guide.';
        btn('Find polling info', guide, true); btn('Open My ballot', mine);
        if (released) btn('Election results', '/results/');
      } else if (which === 'results') {
        title.textContent = 'Election results';
        sub.textContent = 'Unofficial counts, collected automatically and updated as they come in.';
        btn('Open election results', '/results/', true); btn('Open My ballot', mine);
      } else {
        title.textContent = 'Election accountability';
        sub.textContent = 'What winners promised, and what they do. This section is being built and will fill in after the results.';
      }

      // countdown line
      function line() {
        var now = clock();
        if (which === 'election_day') {
          if (!polls || now >= polls) return '';
          var when = pollsOwn ? ' (' + clockIn(polls, tz) + (tz === Intl.DateTimeFormat().resolvedOptions().timeZone ? '' : ', ' + clockIn(polls, Intl.DateTimeFormat().resolvedOptions().timeZone) + ' for you') + ')' : '';
          return 'Polls close in ' + span(polls - now) + when + '.';
        }
        var nxt = upcoming(now)[0];
        if (nxt) return (abbr && o.stateName ? 'Next vote in ' + o.stateName : 'Next vote') + ': ' + nxt.name + ' in ' + span(startOf(nxt.date) - now) + '.';
        return abbr && o.stateName ? 'No upcoming vote on file for ' + o.stateName + ' yet.' : '';
      }
      function upcoming(now) {
        return (Array.isArray(s.upcoming) ? s.upcoming : []).filter(function (u) {
          return u && typeof u.name === 'string' && typeof u.date === 'string' && startOf(u.date) > now - 86400000 && (u.state === 'all' || String(u.state).toUpperCase() === abbr || !abbr && u.state === 'all');
        }).sort(function (a, b) { return startOf(a.date) - startOf(b.date); });
      }
      function paint() { count.textContent = line(); }
      paint(); setInterval(paint, 60000);

      // The top of this member's ballot plan for their state (kept in this browser by ballot-store.js): up to 5 contests
      // with the pick, "Undecided", or "Not picked yet". Nothing here leaves the browser.
      function picksBox() {
        var WB = window.WayBallot, d;
        if (!WB || !abbr) return null;
        try { d = WB.read(abbr); } catch (e) { return null; }
        var list = Object.keys(d.contests).map(function (k) { return d.contests[k]; }).filter(function (c) { return c.title; })
          .sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'race' ? -1 : 1) || (a.title < b.title ? -1 : 1); });
        var box = el('div', 'season-picks'), ul = el('ul', 'season-picklist');
        if (!list.length) { box.append(el('p', 'season-fine', 'Mark races and measures in your voter guide and your top questions show up here.')); return box; }
        box.append(el('p', 'season-picks-head', 'Your top questions'));
        list.slice(0, 5).forEach(function (c) {
          var name = c.picks.map(function (id) { var o = c.options.filter(function (x) { return x.id === id; })[0]; return o ? o.label : ''; }).filter(Boolean).join(', ');
          var li = el('li', null), a = el('a', 'season-q', c.title);
          a.href = '/members/my-ballot.html?state=' + encodeURIComponent(abbr);
          li.append(a, el('span', 'season-a', name || (c.undecided ? 'Undecided' : 'Not picked yet')));
          ul.append(li);
        });
        box.append(ul);
        if (list.length > 5) box.append(el('p', 'season-fine', '+' + (list.length - 5) + ' more in My ballot'));
        return box;
      }

      var fine = el('p', 'season-fine', which === 'election_day' ? (pollsOwn && row.note ? row.note + ' ' : '') + 'Confirm your polling place and closing time with your state election office.' : '');
      var picks = which === 'accountability' ? null : picksBox();
      card.append(title, sub, count, fine); if (picks) card.append(picks); card.append(btns);
      var ups = upcoming(clock());
      if (ups.length) {
        var ul = el('ul', 'season-ups');
        ups.slice(0, 6).forEach(function (u) { ul.append(el('li', null, dateText(u.date) + ': ' + u.name + (u.state === 'all' ? '' : ' (' + String(u.state).toUpperCase() + ')'))); });
        var d = el('details', 'season-more'); d.append(el('summary', null, 'Upcoming votes we know about'), ul);
        card.append(d);
      }
      card.setAttribute('data-phase', which);
      into.replaceChildren(card);
    }
  }
  window.WaySeason = { mount: mount, phase: phase, zoned: zoned };
})();
