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

  var box = document.createElement('section');
  box.className = 'ballot-banner';
  box.hidden = true;
  box.setAttribute('aria-label', 'Open your ballot');
  var text = document.createElement('div');
  text.className = 'bb-text';
  var h = document.createElement('h2');
  h.textContent = 'Open your ballot';
  var p = document.createElement('p');
  p.textContent = 'See every race and measure on your ' + name + ' ballot for Tuesday, November 3, 2026, then plan your picks.';
  text.append(h, p);
  var actions = document.createElement('div');
  actions.className = 'bb-actions';
  var main = document.createElement('a');
  main.className = 'bb-main';
  main.href = '/members/my-ballot.html?state=' + st;
  main.textContent = 'Open my ballot';
  var alt = document.createElement('a');
  alt.className = 'bb-alt';
  alt.href = guide;
  alt.textContent = 'Read the ' + name + ' voter guide';
  actions.append(main, alt);
  box.append(text, actions);
  wrap.after(box);

  function update() { box.hidden = /^\s*No location selected/i.test(sel.textContent) || !sel.textContent.trim(); }
  new MutationObserver(update).observe(sel, { childList: true, characterData: true, subtree: true });
  update();
})();
