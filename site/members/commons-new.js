// "New in the Commons" starfish: a small starfish sits on the Commons bubble (and on Your Way and its Commons row on a phone) while there are
// posts by other members that you have not seen. Opening the Commons clears it. Nothing is stored on the server: the newest post time you have
// seen lives in this browser (localStorage), and the newest post by someone else is asked for at most once a minute. Loaded by bubbles.js.
// Styles are in commons-new.css. No inline scripts or styles. If anything fails, no starfish shows.
(function () {
  'use strict';
  var SEEN = 'theway.commons-seen', CACHE = 'theway.commons-new';
  var FISH = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5l2.600 6.800 7.200.4-5.600 4.600 1.900 7-6.100-4-6.100 4 1.900-7L2.200 8.700l7.200-.4z" fill="#ff9d5c" stroke="#b8501f" stroke-width="1.200" stroke-linejoin="round"/><g fill="#ffd9b0"><circle cx="12" cy="9" r=".9"/><circle cx="12" cy="13" r=".9"/><circle cx="8.500" cy="10.600" r=".7"/><circle cx="15.500" cy="10.600" r=".7"/></g></svg>';
  var fresh = false, busy = false, watcher = null;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (/^sb-.+-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && v.access_token && (!v.expires_at || v.expires_at * 1000 > Date.now())) return v.access_token; }
      }
    } catch (e) { /* none */ }
    return null;
  }
  function subject(tok) {
    try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch (e) { return null; }
  }
  function inCommons() {
    var p = location.pathname, h = location.hash;
    return /^\/members\/(discuss|read-checks)/.test(p) || (/^\/members\/?(index\.html)?$/.test(p) && /^#\/(commons|c\/|t\/)/.test(h));
  }
  // newest visible post by someone else (ISO text), '' when none, null when it could not be asked
  function newest(tok, cb) {
    var cfg = window.THE_WAY_CONFIG, me = subject(tok);
    if (!cfg || !me) { cb(null); return; }
    fetch(cfg.supabaseUrl + '/rest/v1/posts?select=created_at&hidden_at=is.null&author_id=neq.' + encodeURIComponent(me) + '&order=created_at.desc&limit=1',
      { headers: { apikey: cfg.supabaseAnonKey, authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { cb(rows && rows.length ? String(rows[0].created_at) : (rows ? '' : null)); })
      .catch(function () { cb(null); });
  }
  function later(a, b) { return !!a && (!b || Date.parse(a) > Date.parse(b)); }

  function check() {
    if (busy) return;
    var tok = token(); if (!tok) { fresh = false; paint(); return; }
    var me = subject(tok), key = SEEN + ':' + me, onPage = inCommons(), cached = null;
    try { cached = JSON.parse(get(CACHE) || 'null'); } catch (e) { /* none */ }
    var use = function (latest) {
      var seen = get(key);
      if (latest === null) return;
      if (onPage || seen === null) { put(key, latest || '0'); fresh = false; }   // opening the Commons, or the first time ever here: nothing is new yet
      else fresh = later(latest, seen === '0' ? '' : seen);
      paint();
    };
    if (!onPage && cached && cached.u === me && Date.now() - cached.t < 60000) { use(cached.l); return; }
    var go = function () {
      busy = true;
      newest(tok, function (l) { busy = false; if (l !== null) put(CACHE, JSON.stringify({ u: me, t: Date.now(), l: l })); use(l); });
    };
    if (window.THE_WAY_CONFIG) go();
    else { var sc = document.createElement('script'); sc.src = '/members/config.js?v=40'; sc.onload = go; document.head.appendChild(sc); }
  }

  function star() { var s = document.createElement('span'); s.className = 'wb-newfish'; s.innerHTML = FISH; return s; }
  function mark(host, on, title) {
    if (!host) return;
    var cur = host.querySelector(':scope > .wb-newfish, :scope > span > .wb-newfish');
    if (on && !cur) {
      var s = star(), t = document.createElement('span'); t.className = 'wb-newfish-sr'; t.textContent = ' (' + title + ')';
      s.appendChild(t);
      var go = host.querySelector(':scope > .wb-fan-go'); host.insertBefore(s, go);
    } else if (!on && cur) cur.remove();
  }
  function paint() {
    var title = 'new posts';
    mark(document.querySelector('.way-bubble[data-icon="commons"]'), fresh, title);
    mark(document.querySelector('.wb-phone .way-bubble[data-icon="my-side"]'), fresh, 'new posts in the Commons');
    document.querySelectorAll('.wb-fan-row').forEach(function (r) {
      var l = r.querySelector('span:not(.wb-fan-go)');
      if (r.getAttribute('aria-haspopup') && l && l.textContent === 'Commons' && r.querySelector('svg')) mark(r, fresh, title);
    });
  }
  // the phone lists are drawn when opened, so watch the left bubbles and put the starfish back on anything new
  function watch() {
    var nav = document.querySelector('.wb-bubs-l');
    if (!nav || watcher === nav || !window.MutationObserver) return;
    watcher = nav;
    var q = 0;
    new MutationObserver(function () { if (!q) q = requestAnimationFrame(function () { q = 0; paint(); }); }).observe(nav, { childList: true, subtree: true });
  }

  window.addEventListener('hashchange', check);
  window.WayCommonsNew = { apply: function () { watch(); paint(); check(); } };
  window.WayCommonsNew.apply();
})();
