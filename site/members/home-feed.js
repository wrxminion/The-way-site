// News feed on the members home page (#/): the election news files the front page box already reads, with a "Mark read"
// control and a "Review" button on every story. Loaded before app.js; app.js calls WayHomeFeed.mount(...).
//
// Rules (Frank, Oct 30):
//  - Story links open in a new window (target=_blank, rel=noopener noreferrer). Text only, no images.
//  - Every outbound link is cleaned of trackers (utm_*, fbclid, gclid, mc_*, ref and the like). Google News links are never used:
//    a story whose link is still a Google News link is left out until the news cycle has found the publisher's own address.
//  - "Mark read" can be pressed only after the member clicked the story link here AND the timer has run out. The time is
//    window.THE_WAY_CONFIG.newsReadSeconds (default 60). The clock starts at the first click and is kept in the database (0060),
//    so it survives a reload; the database also refuses a mark that comes too soon.
//  - "Review" before the story is marked read asks "Where did you see this article?" and records the answer (0060), then opens
//    the story's discussion and read-check page.
// Without 0060 the list still works: no Mark read, and Review goes straight to the discussion page.
(function () {
  'use strict';
  var DATA = '/news/data/election/';
  var DEFAULT_SECONDS = 60;
  var VISIBLE_ROWS = 5;
  var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  var DAY = 86400000;
  var WINDOWS = [['all', 'All time', 0], ['month', 'Last month', 30 * DAY], ['week', 'Last week', 7 * DAY], ['day', 'Last day', DAY]];
  var WHERE = ['Google or another search', 'Social media', 'A friend or family member sent it', 'The news site or app directly', 'A newsletter or email', 'Somewhere else'];

  // Links are cleaned by link-clean.js (WayLink): trackers out, Google News never used.
  function cleanUrl(u) { return window.WayLink ? window.WayLink.cleanUrl(u) : ''; }

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  function norm(t) { return t.toLowerCase().replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').replace(/[^a-z0-9 ]/g, '').trim(); }
  function seconds() {
    var n = Number(window.THE_WAY_CONFIG && window.THE_WAY_CONFIG.newsReadSeconds);
    return n >= 0 && isFinite(n) ? Math.min(Math.round(n), 600) : DEFAULT_SECONDS;
  }
  function pref(k, v) {
    try { if (v === undefined) return localStorage.getItem('theway.homefeed.' + k); localStorage.setItem('theway.homefeed.' + k, v); } catch (e) { /* a remembered choice is only a convenience */ }
    return null;
  }

  function clean(raw) {
    var id = str(raw && raw.id, 120).toLowerCase(), title = str(raw && raw.title, 300), url = cleanUrl(raw && raw.url);
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(id) || !title || !url) return null;   // no id or no direct link: not shown
    var pub = Date.parse(raw.published_at), seen = Date.parse(raw.first_seen_at);
    return { id: id, title: title, url: url, source: str(raw.source, 80),
      dateOnly: typeof raw.published_at === 'string' && raw.published_at.length <= 10, when: isFinite(pub) ? pub : (isFinite(seen) ? seen : 0) };
  }
  var cache = {};
  function load(file) {
    if (!cache[file]) cache[file] = fetch(DATA + file, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (d) {
        var items = Array.isArray(d && d.items) ? d.items : [], out = [], hidden = 0;
        items.slice(0, 100).forEach(function (r) { var c = clean(r); if (c) out.push(c); else hidden++; });
        return { items: out, hidden: hidden };
      });
    return cache[file];
  }

  function fmtDate(i) {
    if (!i.when) return '';
    return new Date(i.when).toLocaleDateString(undefined, i.dateOnly ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium' });
  }

  // mount(into, { sb, abbr }) : sb = the signed-in Supabase client, abbr = the member's saved state ('CO') or ''
  function mount(into, opts) {
    var sb = opts.sb, abbr = String(opts.abbr || '').toUpperCase();
    var marks = {};           // item id -> { clicked: ms, read: ms|null, where: text|null }
    var marksOn = false;      // false until the database answers (0060 not run, or offline)
    var skew = 0;             // server clock minus this browser's clock
    var timers = {};          // item id -> button refresher
    var sec = seconds();

    var root = el('section', 'hf');
    root.setAttribute('aria-labelledby', 'hf-title');
    var head = el('div', 'hf-head');
    var h2 = el('h2', null, 'News'); h2.id = 'hf-title';
    var scope = el('select'); scope.setAttribute('aria-label', 'Which news');
    var span = el('select'); span.setAttribute('aria-label', 'How far back');
    var hideRead = el('input'); hideRead.type = 'checkbox';
    var hideLab = el('label', 'hf-check'); hideLab.append(hideRead, ' Hide the ones I marked read');
    function opt(sel, value, label) { var o = el('option', null, label); o.value = value; sel.append(o); }
    opt(scope, 'national', 'National');
    if (abbr && STATES[abbr]) opt(scope, 'own', 'Your state (' + STATES[abbr] + ')');
    Object.keys(STATES).forEach(function (k) { opt(scope, k, STATES[k]); });
    WINDOWS.forEach(function (w) { opt(span, w[0], w[1]); });
    var saved = pref('scope'); scope.value = saved && Array.prototype.some.call(scope.options, function (o) { return o.value === saved; }) ? saved : (abbr && STATES[abbr] ? 'own' : 'national');
    var savedSpan = pref('span'); span.value = WINDOWS.some(function (w) { return w[0] === savedSpan; }) ? savedSpan : 'all';
    head.append(h2, el('div', 'hf-filters'));
    head.lastChild.append(scope, span, hideLab);
    var note = el('p', 'hf-note small muted');
    var list = el('ul', 'hf-list');
    list.setAttribute('tabindex', '0'); list.setAttribute('aria-label', 'News stories, scroll for more');
    root.append(head, note, list);
    into.append(root);

    // ---- read marks (0060) ----
    function loadMarks() {
      return sb.rpc('news_my_state').then(function (r) {
        if (r.error || !r.data) { marksOn = false; return; }
        marksOn = true;
        skew = r.data.now ? Date.parse(r.data.now) - Date.now() : 0;
        marks = {};
        (r.data.rows || []).forEach(function (m) {
          marks[m.item_id] = { clicked: m.clicked_at ? Date.parse(m.clicked_at) : null, read: m.read_at ? Date.parse(m.read_at) : null, where: m.where_seen || null };
        });
      }).catch(function () { marksOn = false; });
    }
    function leftMs(m) { return m && m.clicked ? m.clicked + sec * 1000 - (Date.now() + skew) : null; }

    function paintMark(btn, status, item) {
      var m = marks[item.id];
      status.textContent = '';
      if (!marksOn) { btn.hidden = true; return; }
      if (m && m.read) { btn.hidden = true; status.textContent = 'Read ✓'; return; }
      btn.hidden = false;
      if (!m || !m.clicked) { btn.disabled = true; btn.textContent = 'Mark read'; btn.title = 'Open the story first. Then wait ' + sec + ' seconds.'; return; }
      var left = leftMs(m);
      if (left > 0) { btn.disabled = true; btn.textContent = 'Mark read (' + Math.ceil(left / 1000) + 's)'; btn.title = 'You can mark it read when the timer ends.'; return; }
      btn.disabled = false; btn.textContent = 'Mark read'; btn.title = '';
    }

    function row(item) {
      var li = el('li', 'hf-item');
      var a = el('a', 'hf-link', item.title);
      a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      var meta = el('div', 'hf-meta small muted', [item.source, fmtDate(item)].filter(Boolean).join(' · '));
      var btns = el('div', 'hf-btns');
      var mark = el('button', 'hf-btn', 'Mark read'); mark.type = 'button';
      var review = el('button', 'hf-btn', 'Review'); review.type = 'button';
      var status = el('span', 'hf-status small');
      btns.append(mark, review, status);
      li.append(a, meta, btns);
      paintMark(mark, status, item);

      function tick() {
        paintMark(mark, status, item);
        var left = leftMs(marks[item.id]);
        if (left != null && left > 0 && !(marks[item.id] && marks[item.id].read)) timers[item.id] = setTimeout(tick, Math.min(1000, left));
        else delete timers[item.id];
      }
      if (marksOn && leftMs(marks[item.id]) > 0) tick();

      // The clock starts at the FIRST click on the story link (left click, Enter, or middle click).
      function clicked() {
        if (!marksOn) return;
        if (marks[item.id] && marks[item.id].clicked) return;
        marks[item.id] = { clicked: Date.now() + skew, read: null, where: (marks[item.id] || {}).where || null };
        clearTimeout(timers[item.id]); tick();
        sb.rpc('news_click', { p_item: item.id }).then(function (r) {
          if (r.error) { delete marks[item.id]; paintMark(mark, status, item); note.textContent = 'Could not start the timer: ' + r.error.message; }
          else if (r.data) { marks[item.id].clicked = Date.parse(r.data); clearTimeout(timers[item.id]); tick(); }
        });
      }
      a.addEventListener('click', clicked);
      a.addEventListener('auxclick', function (e) { if (e.button === 1) clicked(); });

      mark.addEventListener('click', function () {
        mark.disabled = true;
        sb.rpc('news_mark_read', { p_item: item.id, p_min_seconds: sec }).then(function (r) {
          if (r.error) { note.textContent = r.error.message; paintMark(mark, status, item); return; }
          marks[item.id].read = Date.parse(r.data) || Date.now();
          paintMark(mark, status, item);
          if (hideRead.checked) draw();
        });
      });
      review.addEventListener('click', function () {
        var m = marks[item.id];
        if (!marksOn || (m && m.read) || (m && m.where)) go(item);
        else ask(item);
      });
      return li;
    }

    function go(item) {
      location.href = '/members/discuss.html?item=' + encodeURIComponent('news:' + item.id) + '&title=' + encodeURIComponent(item.title.slice(0, 200));
    }

    // "Where did you see this article?" for a Review pressed before the story was marked read here.
    function ask(item) {
      var dlg = el('dialog', 'hf-dialog');
      var form = el('form'); form.method = 'dialog';
      form.append(el('h3', null, 'Where did you see this article?'),
        el('p', 'small muted', 'You have not marked it read here. Tell us where you saw it, then you can go on to review it.'));
      var sel = el('select'); sel.required = true; sel.setAttribute('aria-label', 'Where you saw it');
      var first = el('option', null, 'Choose one…'); first.value = ''; sel.append(first);
      WHERE.forEach(function (w) { opt(sel, w, w); });
      var more = el('input'); more.type = 'text'; more.maxLength = 120; more.placeholder = 'Add a few words (optional)'; more.setAttribute('aria-label', 'A few words');
      var err = el('p', 'small hf-err');
      var okb = el('button', 'hf-btn primary', 'Save and continue'); okb.type = 'submit';
      var cancel = el('button', 'hf-btn', 'Cancel'); cancel.type = 'button';
      var bt = el('div', 'hf-btns'); bt.append(okb, cancel);
      form.append(sel, more, err, bt); dlg.append(form); document.body.append(dlg);
      function shut() { dlg.close(); dlg.remove(); }
      cancel.addEventListener('click', shut);
      dlg.addEventListener('cancel', function () { dlg.remove(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!sel.value) { err.textContent = 'Pick one.'; return; }
        okb.disabled = true;
        var answer = (sel.value + (more.value.trim() ? ': ' + more.value.trim() : '')).slice(0, 200);
        sb.rpc('news_where_seen', { p_item: item.id, p_answer: answer }).then(function (r) {
          if (r.error) { err.textContent = r.error.message; okb.disabled = false; return; }
          (marks[item.id] = marks[item.id] || { clicked: null, read: null }).where = answer;
          shut(); go(item);
        });
      });
      dlg.showModal(); sel.focus();
    }

    // ---- the list ----
    var current = [];
    function draw() {
      Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; });
      var win = WINDOWS.filter(function (w) { return w[0] === span.value; })[0], cutoff = win[2] ? Date.now() - win[2] : 0;
      var items = current.items.filter(function (i) { return (!cutoff || i.when >= cutoff) && !(hideRead.checked && marks[i.id] && marks[i.id].read); });
      list.replaceChildren();
      items.forEach(function (i) { list.append(row(i)); });
      note.textContent = items.length ? ''
        : (current.hidden && !current.items.length ? 'No stories with a direct publisher link yet. Google News links are not used; the list fills in as the publisher links are found.'
          : 'Nothing in this time range.');
      list.style.setProperty('--hf-rows', String(Math.min(VISIBLE_ROWS, Math.max(items.length, 1))));
    }
    function pick() {
      pref('scope', scope.value); pref('span', span.value);
      var file = scope.value === 'national' ? 'national.json' : (scope.value === 'own' ? abbr : scope.value).toLowerCase() + '.json';
      note.textContent = 'Loading…'; list.replaceChildren();
      load(file).then(function (d) {
        var seen = {}, out = [];
        d.items.slice().sort(function (a, b) { return b.when - a.when; }).forEach(function (i) { var k = norm(i.title); if (!seen[k]) { seen[k] = 1; out.push(i); } });
        current = { items: out, hidden: d.hidden }; draw();
      }).catch(function () { note.textContent = 'Could not load the news just now.'; });
    }
    scope.addEventListener('change', pick); span.addEventListener('change', function () { pref('span', span.value); draw(); });
    hideRead.addEventListener('change', draw);
    loadMarks().then(pick);
    return root;
  }

  window.WayHomeFeed = { mount: mount, cleanUrl: cleanUrl };
})();
