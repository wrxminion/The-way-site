// "Read" and "Review" buttons for an article card, shared by every page that lists articles
// (members home news, front page news, the News page, the case list).
//
//   WayArticleActions.attach(container, { id, title, url, link, own, onChange })
//     container  the card element the buttons are added to (they are appended at the end)
//     id         the story id (lowercase letters, digits . _ -); anything else is turned into "-"
//     title      the headline, passed to the review page
//     url        where "Read" opens the article
//     link       optional: the card's own link. Clicking it starts the reading clock, the same as "Read" does
//     own        true for The Way's own articles. They are stored as news:own-<slug>, so they use the same
//                read marks (0060) and the same review form (0061) as outside news
//     onChange   called after the member marks the article read
//   WayArticleActions.wrap(anchor, item)   for a card that is itself a link: puts the card and the buttons in one box
//   WayArticleActions.ownId(href)          "own-cases-wic" for "/cases/wic.html"
//
// Signed-out visitors see nothing. Rules (a 20 second minimum before "Mark read", rate limits) live in the database (0060).
// Review turns into a plain "Reviewed" label, with no link, once the member has a review on file (read_checks).
(function () {
  'use strict';
  var DEFAULT_SECONDS = 60;
  var WHERE = ['Google or another search', 'Social media', 'A friend or family member sent it', 'The news site or app directly', 'A newsletter or email', 'Somewhere else'];
  var ctxPromise = null, loaded = null;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function normId(raw) { return String(raw || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 120); }
  function ownId(href) {
    var p = '';
    try { p = new URL(href, location.href).pathname; } catch (e) { return ''; }
    p = p.replace(/(^\/|\/index)?(\.html)?\/?$/, '').replace(/^\//, '');
    return p ? normId('own-' + p.replace(/\//g, '-')) : '';
  }
  function seconds() {
    var n = Number(window.THE_WAY_CONFIG && window.THE_WAY_CONFIG.newsReadSeconds);
    return n >= 0 && isFinite(n) ? Math.min(Math.round(n), 600) : DEFAULT_SECONDS;
  }
  function signedIn() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (!/^sb-.+-auth-token$/.test(k)) continue;
        var v = JSON.parse(localStorage.getItem(k) || 'null');
        if (v && v.access_token && (!v.expires_at || v.expires_at * 1000 > Date.now())) return true;
      }
    } catch (e) { /* storage blocked: treated as signed out */ }
    return false;
  }
  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  }
  function style() {
    if (document.getElementById('wa-style')) return;
    var s = document.createElement('style'); s.id = 'wa-style';
    s.textContent = '.wa-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 0}'
      + '.wa-btn{font:600 14px/1.2 system-ui,sans-serif;min-height:36px;padding:6px 14px;border:1px solid #c7ffff66;border-radius:999px;background:#06283a;color:#e9ffff;cursor:pointer}'
      + '.wa-btn:disabled{opacity:.6;cursor:default}.wa-btn:focus-visible{outline:2px solid #e4ffff;outline-offset:2px}'
      + '.wa-label{font:600 14px/1.2 system-ui,sans-serif;color:#a7f0e9}.wa-err{font-size:13px;color:#ffb4b4}'
      + '.wa-wrap{display:flex;flex-direction:column}.wa-wrap>a{flex:1}.wa-wrap>.wa-btns{padding:0 22px 14px;margin:0}'
      + '.wa-dialog{max-width:min(26rem,92vw);border:1px solid #c7ffff66;border-radius:20px;background:#06283a;color:#e9ffff;padding:18px}'
      + '.wa-dialog::backdrop{background:#021520b3}.wa-dialog select,.wa-dialog input{width:100%;box-sizing:border-box;min-height:44px;margin:6px 0}';
    document.head.append(s);
  }

  // One shared, lazy context: the Supabase client, the member's read marks and the set of reviewed stories.
  function context() {
    if (ctxPromise) return ctxPromise;
    ctxPromise = (signedIn() ? Promise.resolve() : Promise.reject()).then(function () {
      return window.THE_WAY_CONFIG ? 0 : loadScript('/members/config.js?v=41');
    }).then(function () {
      return window.supabase ? 0 : loadScript('/members/vendor/supabase-js-2.110.9.js');
    }).then(function () {
      var cfg = window.THE_WAY_CONFIG;
      var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
      var c = { sb: sb, marks: {}, marksOn: false, skew: 0, reviewedSet: null, queue: [], running: 0, perItem: {} };
      return Promise.all([
        sb.rpc('news_my_state').then(function (r) {
          if (r.error || !r.data) return;
          c.marksOn = true;
          c.skew = r.data.now ? Date.parse(r.data.now) - Date.now() : 0;
          (r.data.rows || []).forEach(function (m) {
            c.marks[m.item_id] = { clicked: m.clicked_at ? Date.parse(m.clicked_at) : null, read: m.read_at ? Date.parse(m.read_at) : null, where: m.where_seen || null };
          });
        }),
        sb.from('read_checks').select('item_key').limit(5000).then(function (r) {
          if (r.error || !Array.isArray(r.data)) return;
          c.reviewedSet = {}; r.data.forEach(function (x) { c.reviewedSet[x.item_key] = 1; });
        })
      ]).catch(function () { /* the buttons still work without marks */ }).then(function () { loaded = c; return c; });
    }).catch(function () { return null; });
    return ctxPromise;
  }
  // Is there a review on file for this story? Uses the one bulk read when the database allows it, else asks story by story, four at a time.
  function reviewed(c, key) {
    if (c.reviewedSet) return Promise.resolve(!!c.reviewedSet[key]);
    if (c.perItem[key]) return c.perItem[key];
    c.perItem[key] = new Promise(function (ok) {
      c.queue.push(function (done) {
        c.sb.rpc('my_read_check', { p_item: key }).then(function (r) { ok(!r.error && !!(r.data && r.data[0])); }, function () { ok(false); }).then(done);
      });
      pump(c);
    });
    return c.perItem[key];
  }
  function pump(c) {
    while (c.running < 4 && c.queue.length) {
      c.running++;
      c.queue.shift()(function () { c.running--; pump(c); });
    }
  }

  function attach(container, item) {
    if (!container || !item) return;
    var id = normId(item.id), key = 'news:' + id, sec = seconds();
    if (!id) return;
    context().then(function (c) {
      if (!c || !container.isConnected) return;
      style();
      var box = el('div', 'wa-btns');
      var read = el('button', 'wa-btn', 'Read'); read.type = 'button';
      var review = el('button', 'wa-btn', 'Review'); review.type = 'button'; review.hidden = true;
      var label = el('span', 'wa-label'); label.hidden = true;
      var err = el('span', 'wa-err'); err.setAttribute('role', 'status');
      box.append(read, review, label, err);
      container.append(box);
      var timer = 0;

      function left() { var m = c.marks[id]; return m && m.clicked ? m.clicked + sec * 1000 - (Date.now() + c.skew) : null; }
      function paint() {
        var m = c.marks[id];
        read.hidden = !c.marksOn;
        label.hidden = true;
        if (!c.marksOn) return;
        if (m && m.read) { read.hidden = true; label.hidden = false; label.textContent = 'Read ✓'; return; }
        if (!m || !m.clicked) { read.disabled = false; read.textContent = 'Read'; read.title = 'Opens the article. Then wait ' + sec + ' seconds and mark it read.'; return; }
        var l = left();
        if (l > 0) { read.disabled = true; read.textContent = 'Mark read (' + Math.ceil(l / 1000) + 's)'; read.title = 'You can mark it read when the timer ends.'; clearTimeout(timer); timer = setTimeout(paint, Math.min(1000, l)); return; }
        read.disabled = false; read.textContent = 'Mark read'; read.title = '';
      }
      // The clock starts at the FIRST click on the story (the card's own link, or the Read button).
      function clicked() {
        if (!c.marksOn || (c.marks[id] && c.marks[id].clicked)) return;
        c.marks[id] = { clicked: Date.now() + c.skew, read: null, where: (c.marks[id] || {}).where || null };
        paint();
        c.sb.rpc('news_click', { p_item: id }).then(function (r) {
          if (r.error) { delete c.marks[id]; err.textContent = 'Could not start the timer: ' + r.error.message; paint(); }
          else if (r.data) { c.marks[id].clicked = Date.parse(r.data); paint(); }
        });
      }
      if (item.link) {
        item.link.addEventListener('click', clicked);
        item.link.addEventListener('auxclick', function (e) { if (e.button === 1) clicked(); });
      }
      read.addEventListener('click', function () {
        var m = c.marks[id];
        if (!m || !m.clicked) { if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer'); clicked(); return; }
        read.disabled = true; err.textContent = '';
        c.sb.rpc('news_mark_read', { p_item: id, p_min_seconds: sec }).then(function (r) {
          if (r.error) { err.textContent = r.error.message; paint(); return; }
          c.marks[id].read = Date.parse(r.data) || Date.now();
          paint();
          if (item.onChange) item.onChange();
        });
      });
      review.addEventListener('click', function () {
        var m = c.marks[id];
        if (!c.marksOn || (m && (m.read || m.where))) go(); else ask();
      });
      function go() {
        location.href = '/members/discuss.html?item=' + encodeURIComponent(key) + '&title=' + encodeURIComponent(String(item.title || '').slice(0, 200));
      }
      // "Where did you see this article?" for a Review pressed before the story was marked read.
      function ask() {
        var dlg = el('dialog', 'wa-dialog'), form = el('form'); form.method = 'dialog';
        form.append(el('h3', null, 'Where did you see this article?'),
          el('p', null, 'You have not marked it read here. Tell us where you saw it, then you can go on to review it.'));
        var sel = el('select'); sel.required = true; sel.setAttribute('aria-label', 'Where you saw it');
        var first = el('option', null, 'Choose one…'); first.value = ''; sel.append(first);
        WHERE.forEach(function (w) { var o = el('option', null, w); o.value = w; sel.append(o); });
        var more = el('input'); more.type = 'text'; more.maxLength = 120; more.placeholder = 'Add a few words (optional)'; more.setAttribute('aria-label', 'A few words');
        var msg = el('p', 'wa-err');
        var ok = el('button', 'wa-btn', 'Save and continue'); ok.type = 'submit';
        var cancel = el('button', 'wa-btn', 'Cancel'); cancel.type = 'button';
        var bt = el('div', 'wa-btns'); bt.append(ok, cancel);
        form.append(sel, more, msg, bt); dlg.append(form); document.body.append(dlg);
        function shut() { dlg.close(); dlg.remove(); }
        cancel.addEventListener('click', shut);
        dlg.addEventListener('cancel', function () { dlg.remove(); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!sel.value) { msg.textContent = 'Pick one.'; return; }
          ok.disabled = true;
          var answer = (sel.value + (more.value.trim() ? ': ' + more.value.trim() : '')).slice(0, 200);
          c.sb.rpc('news_where_seen', { p_item: id, p_answer: answer }).then(function (r) {
            if (r.error) { msg.textContent = r.error.message; ok.disabled = false; return; }
            (c.marks[id] = c.marks[id] || { clicked: null, read: null }).where = answer;
            shut(); go();
          });
        });
        dlg.showModal(); sel.focus();
      }

      paint();
      reviewed(c, key).then(function (done) {
        if (done) { var tag = el('span', 'wa-label', 'Reviewed'); review.replaceWith(tag); }   // a label, not a link
        else review.hidden = false;
      });
    });
  }

  // A card that is itself one big link: the card and the buttons go in one box, so the buttons are not inside the link.
  function wrap(anchor, item) {
    if (!anchor || !anchor.parentNode || anchor.parentNode.classList.contains('wa-wrap')) return;
    if (!signedIn()) return;
    style();
    var box = el('div', 'wa-wrap');
    anchor.parentNode.insertBefore(box, anchor); box.append(anchor);
    new MutationObserver(function () { box.hidden = anchor.hidden; }).observe(anchor, { attributes: true, attributeFilter: ['hidden'] });
    item.link = item.link || anchor;
    item.url = item.url || anchor.href;
    attach(box, item);
  }


  // The Way's own article lists: the case list (cards that are links) and the case studies list (article cards).
  function auto() {
    if (!signedIn()) return;
    var p = location.pathname.replace(/index\.html$/, '');
    var t = function (n) { return String(n && n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); };
    if (p === '/cases/') {
      document.querySelectorAll('.cases-hub .hub a.hub-card').forEach(function (a) {
        wrap(a, { id: ownId(a.href), title: t(a.querySelector('b')), own: true });
      });
    } else if (p === '/case-studies/') {
      document.querySelectorAll('article.card').forEach(function (card) {
        var a = card.querySelector('h2 a[href]');
        if (a) attach(card, { id: ownId(a.href), title: t(a), url: a.href, link: a, own: true });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  // ready() resolves when the member's marks are loaded (null when signed out); isRead(id) answers from them.
  function ready() { return context(); }
  function isRead(id) {
    var c = loaded, m = c && c.marks[normId(id)];
    return !!(m && m.read);
  }
  window.WayArticleActions = { attach: attach, wrap: wrap, ownId: ownId, normId: normId, ready: ready, isRead: isRead };
})();
