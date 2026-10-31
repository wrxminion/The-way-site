// The Way: slim "we need humans" banner for logged-out visitors.
// One file. Change the words on the TEXT line below. Nothing is tracked: the only thing stored is
// "theway.humanbanner" in this tab's own session storage, so the X lasts until the tab closes. A small
// "Help us review" tab stays on the page after the X; it opens a small menu of bubbles (sign up to hunt,
// the Teacher? Parent? page, show the banner again).
(function () {
  'use strict';
  var TEXT = ['WE NEED HELP! THE HALLUCINATION SHARK ATE THE FACTS!!!', 'A lot of the site is written and checked by AI. We need humans to make sure it is not hallucinating.'];
  var BUTTON = 'Register to hunt him!';
  var TEACH = '/teacher-parent.html';
  var TEACH_LABEL = 'Teacher? Parent? Like to have fun?';
  var JOIN = '/members/#/reviewer';   // the reviewer sign up page (reviewer-signup patch)
  var KEY = 'theway.humanbanner';

  try { localStorage.removeItem(KEY); } catch (e) { /* the old permanent close is cleared so nobody stays hidden */ }
  var closed = false;
  try { closed = !!sessionStorage.getItem(KEY); } catch (e) { /* storage blocked: show it */ }
  try {
    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return; // signed in
    }
  } catch (e) { /* none */ }
  if (location.pathname.indexOf('/members/') === 0) return; // sign-up and member pages need no nudge

  var bar = document.createElement('div');
  bar.className = 'hb-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Help wanted');

  var p = document.createElement('p');
  p.className = 'hb-text';
  var big = document.createElement('strong');
  big.className = 'hb-big';
  big.textContent = TEXT[0];
  var small = document.createElement('span');
  small.className = 'hb-small';
  small.textContent = TEXT[1];
  p.appendChild(big); // block lines, so the call is big and the plain explanation sits under it
  p.appendChild(small);

  var shark = document.createElement('img');
  shark.className = 'hb-shark';
  shark.src = '/members/art/hallucination-shark.svg';
  shark.alt = '';
  shark.width = 96; shark.height = 48;

  var a = document.createElement('a');
  a.className = 'hb-join';
  a.href = JOIN;
  a.textContent = BUTTON;

  var x = document.createElement('button');
  x.type = 'button';
  x.className = 'hb-close';
  x.setAttribute('aria-label', 'Close this message');
  x.textContent = '×';
  x.addEventListener('click', function () {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ }
    bar.remove();
    showTab();
  });
  bar.addEventListener('keydown', function (e) { if (e.key === 'Escape') x.click(); });

  var t = document.createElement('a');
  t.className = 'hb-teach';
  t.href = TEACH;
  t.textContent = TEACH_LABEL;

  bar.appendChild(shark); bar.appendChild(p); bar.appendChild(a); bar.appendChild(t); bar.appendChild(x);

  var tab = null, menu = null;
  function closeMenu() {
    if (menu) { menu.remove(); menu = null; }
    if (tab) tab.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey);
  }
  function outside(e) { if (menu && !menu.contains(e.target) && e.target !== tab) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') { closeMenu(); if (tab) tab.focus(); } }
  function showBar() {
    closeMenu();
    if (tab) { tab.remove(); tab = null; }
    try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    var top = document.getElementById('waybar');
    if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  function bubble(tag, label, href) {
    var el = document.createElement(tag);
    el.className = 'hb-bub';
    el.textContent = label;
    if (href) el.href = href; else el.type = 'button';
    return el;
  }
  function openMenu() {
    menu = document.createElement('div');
    menu.className = 'hb-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Help us hunt the shark');
    menu.appendChild(bubble('a', BUTTON, JOIN));
    menu.appendChild(bubble('a', TEACH_LABEL, TEACH));
    var again = bubble('button', 'Show the message again');
    again.addEventListener('click', showBar);
    menu.appendChild(again);
    document.body.appendChild(menu);
    tab.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', onKey);
    menu.firstChild.focus();
  }
  function showTab() {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hb-tab';
    tab.textContent = 'Help us review';
    tab.setAttribute('aria-haspopup', 'true');
    tab.setAttribute('aria-expanded', 'false');
    tab.addEventListener('click', function () { if (menu) closeMenu(); else openMenu(); });
    document.body.appendChild(tab);
  }
  if (closed) showTab(); else showBar();
})();
