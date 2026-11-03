// News feed on the members home page (#/): the election news files the front page box already reads, with a "Mark read"
// control and a "Review" button on every story (both from article-actions.js, which must be loaded first). app.js calls WayHomeFeed.mount(...).
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
  var VISIBLE_ROWS = 5;
  var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  var DAY = 86400000;
  var WINDOWS = [['all', 'All time', 0], ['month', 'Last month', 30 * DAY], ['week', 'Last week', 7 * DAY], ['day', 'Last day', DAY]];

  // Links are cleaned by link-clean.js (WayLink): trackers out, Google News never used.
  function cleanUrl(u) { return window.WayLink ? window.WayLink.cleanUrl(u) : ''; }

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
  function norm(t) { return t.toLowerCase().replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').replace(/[^a-z0-9 ]/g, '').trim(); }
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
    var abbr = String(opts.abbr || '').toUpperCase();

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

    function row(item) {
      var li = el('li', 'hf-item');
      var a = el('a', 'hf-link', item.title);
      a.href = item.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      var meta = el('div', 'hf-meta small muted', [item.source, fmtDate(item)].filter(Boolean).join(' · '));
      li.append(a, meta);
      // Read / Mark read and Review / Reviewed come from the shared module (article-actions.js)
      window.WayArticleActions.attach(li, { id: item.id, title: item.title, url: item.url, link: a, onChange: function () { if (hideRead.checked) draw(); } });
      return li;
    }

    // ---- the list ----
    var current = [];
    function draw() {
      var win = WINDOWS.filter(function (w) { return w[0] === span.value; })[0], cutoff = win[2] ? Date.now() - win[2] : 0;
      var items = current.items.filter(function (i) { return (!cutoff || i.when >= cutoff) && !(hideRead.checked && window.WayArticleActions.isRead(i.id)); });
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
    window.WayArticleActions.ready().then(pick);
    return root;
  }

  window.WayHomeFeed = { mount: mount, cleanUrl: cleanUrl };
})();
