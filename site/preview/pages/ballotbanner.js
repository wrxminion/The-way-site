/* "Open your ballot" banner for the district map pages (map/ and map-xx/).
   Shows under the map once a spot is picked (click, address search or "Use my location"),
   hides again on Clear. Works from the page's own folder name; no data is sent anywhere. */
(function () {
  'use strict';
  var m = location.pathname.match(/\/pages\/map(?:-([a-z]{2}))?\/?(?:index\.html)?$/i);
  var wrap = document.querySelector('.map-wrap'), sel = document.getElementById('selected');
  if (!m || !wrap || !sel) return;
  var st = (m[1] || 'co').toUpperCase(), lower = st.toLowerCase();
  var name = ((document.querySelector('.eyebrow') || {}).textContent || '').split('/')[1];
  name = name ? name.trim() : st;
  var guide = lower === 'co' ? '../guide/' : '../guide-' + lower + '/';

  var planHref = '/members/my-ballot.html?state=' + st;
  function el(tag, cls, text) { var n = document.createElement(tag); n.className = cls; if (text) n.textContent = text; return n; }
  var spot = document.getElementById('ballot');          // the personal ballot breakdown in the sidebar

  var box = document.createElement('section');
  box.className = 'ballot-banner';
  box.hidden = true;
  box.setAttribute('aria-label', 'Open your ballot');
  var text = document.createElement('div');
  text.className = 'bb-text';
  var h = document.createElement('h2');
  h.textContent = 'Open your ballot';
  var p = document.createElement('p');
  p.textContent = 'See every race and measure on your ' + name + ' ballot for Tuesday, November 3, 2026.';
  text.append(h, p);
  var actions = document.createElement('div');
  actions.className = 'bb-actions';
  var main = document.createElement('a');
  main.className = 'bb-main';
  main.href = '#ballot';
  main.textContent = 'Open my ballot';
  var plan = el('a', 'bb-alt', 'Plan your vote');
  plan.href = planHref;
  var alt = document.createElement('a');
  alt.className = 'bb-alt';
  alt.href = guide;
  alt.textContent = 'Read the ' + name + ' voter guide';
  actions.append(main, plan, alt);
  box.append(text, actions);
  wrap.append(box);

  // "Open my ballot" goes to the breakdown for the picked spot (it fills in beside the map), not to the planner.
  main.addEventListener('click', function (ev) {
    if (!spot) return;
    ev.preventDefault();
    spot.setAttribute('tabindex', '-1');
    spot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    spot.focus({ preventScroll: true });
  });
  // The planner is a link from inside the breakdown. map.js rebuilds #ballot on every lookup, so put the link back each time.
  if (spot) {
    var putPlan = function () {
      if (!spot.children.length || spot.querySelector('.bb-plan')) return;
      var a = el('a', 'bb-plan', 'Plan your vote with this ballot \u2192');
      a.href = planHref;
      var wrapA = el('div', 'bb-plan-wrap');
      wrapA.append(a, el('span', 'bb-plan-note', ' Pick what you would choose, save facts, compare, and print. Kept in your browser.'));
      spot.prepend(wrapA);
    };
    new MutationObserver(putPlan).observe(spot, { childList: true });
    putPlan();
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
