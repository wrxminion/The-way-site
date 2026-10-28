/* "Open your ballot" banner for the district map pages (map/ and map-xx/).
   Shows under the map once a spot is picked (click, address search or "Use my location"),
   hides again on Clear. Works from the page's own folder name; no data is sent anywhere. */
(function () {
  'use strict';
  var m = location.pathname.match(/\/map(?:-([a-z]{2}))?\/?(?:index\.html)?$/i);
  var wrap = document.querySelector('.map-wrap'), sel = document.getElementById('selected');
  if (!m || !wrap || !sel) return;
  var st = (m[1] || 'co').toUpperCase(), lower = st.toLowerCase();
  var name = ((document.querySelector('.eyebrow') || {}).textContent || '').split('/')[1];
  name = name ? name.trim() : st;
  var guide = lower === 'co' ? '../guide/' : '../guide-' + lower + '/';

  var markHref = '/members/my-ballot.html?state=' + st + '#mark';
  function el(tag, cls, text) { var n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; }
  var spot = document.getElementById('ballot');          // the personal ballot breakdown in the sidebar

  // Remember which races and measures the breakdown lists for this spot (page paths and names only, never the address),
  // so the marking screen can show "your ballot" first. Stays in this browser tab (sessionStorage).
  function stash() {
    if (!spot) return;
    var items = [], seen = {};
    spot.querySelectorAll('a[href]').forEach(function (a) {
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if (u.origin !== location.origin || !/^\/guide(-[a-z]{2})?\/(races|measures|local\/m)\/[a-z0-9-]+\.html$/.test(u.pathname) || seen[u.pathname]) return;
      seen[u.pathname] = true;
      items.push({ p: u.pathname, t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
    });
    try { sessionStorage.setItem('theway.mymarks.v1', JSON.stringify({ state: st, items: items.slice(0, 80) })); } catch (e) { /* private mode */ }
  }

  var box = document.createElement('section');
  box.className = 'ballot-banner';
  box.hidden = true;
  box.setAttribute('aria-label', 'Open your ballot');
  var text = document.createElement('div');
  text.className = 'bb-text';
  var h = document.createElement('h2');
  h.textContent = 'Open your ballot';
  var p = document.createElement('p');
  p.textContent = 'Mark your choices and keep a note for every race and measure on your ' + name + ' ballot for Tuesday, November 3, 2026.';
  text.append(h, p);
  var actions = document.createElement('div');
  actions.className = 'bb-actions';
  var main = document.createElement('a');
  main.className = 'bb-main';
  main.href = markHref;
  main.textContent = 'Open my ballot';
  var alt = document.createElement('a');
  alt.className = 'bb-alt';
  alt.href = guide;
  alt.textContent = 'Read the ' + name + ' voter guide';
  actions.append(main, alt);
  box.append(text, actions);
  wrap.append(box);
  main.addEventListener('click', stash);

  // The same door from inside the breakdown. map.js rebuilds #ballot on every lookup, so put the link back each time.
  if (spot) {
    var putPlan = function () {
      if (!spot.children.length || spot.querySelector('.bb-plan')) return;
      var a = el('a', 'bb-plan', 'Mark your choices and notes \u2192');
      a.href = markHref;
      a.addEventListener('click', stash);
      var wrapA = el('div', 'bb-plan-wrap');
      wrapA.append(a, el('span', 'bb-plan-note', ' Pick what you would choose, add a note to each race, compare, and print. Kept in your browser.'));
      spot.prepend(wrapA);
    };
    new MutationObserver(putPlan).observe(spot, { childList: true });
    putPlan();
  }

  // Picks already saved in this browser, but no address searched yet: say so, since the ballot cards only appear after a search.
  if (spot && spot.parentNode && window.WayBallot) {
    var saved = el('p', 'bb-saved', 'Your picks are saved. Search your address again to see them on the map.');
    saved.hidden = true;
    spot.parentNode.insertBefore(saved, spot);
    var showSaved = function () {
      var d = window.WayBallot.read(st), any = Object.keys(d.contests).some(function (k) {
        var c = d.contests[k]; return c.picks.length || Object.keys(c.leans || {}).length;
      });
      saved.hidden = !(any && !spot.children.length);
    };
    new MutationObserver(showSaved).observe(spot, { childList: true });
    document.addEventListener('theway-ballot', showSaved);
    showSaved();
  }

  function update() { box.hidden = /^\s*No location selected/i.test(sel.textContent) || !sel.textContent.trim(); }
  new MutationObserver(update).observe(sel, { childList: true, characterData: true, subtree: true });
  update();

  // Link from the states page: map/#q=<address>. Fill the search box and run it once the district data is in,
  // then take the address out of the web address bar so it is not left in the history entry.
  (function () {
    var h = location.hash.match(/^#q=(.+)$/), form = document.getElementById('search'), inp = document.getElementById('q'), status = document.getElementById('status');
    if (!h || !form || !inp || !status) return;
    var q; try { q = decodeURIComponent(h[1]).slice(0, 200); } catch (e) { return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    inp.value = q;
    var tries = 0;
    (function wait() {
      if (/Loading/i.test(status.textContent) && tries++ < 80) return setTimeout(wait, 250);
      if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
    })();
  })();
})();
