// The Way: slim "we need humans" banner for logged-out visitors.
// One file. Change the words on the TEXT line below. Nothing is tracked: the only thing stored is
// "theway.humanbanner" in this tab's own session storage, so the X lasts until the tab closes. A small
// "Help us review" tab stays on the page after the X and brings the banner back.
(function () {
  'use strict';
  var TEXT = ['A lot of the site is reviewed and written by AI (LLMs).', 'We need humans to make sure it\'s not hallucinating.'];
  var BUTTON = 'Register to be a reviewer and help';
  var JOIN = '/members/join.html';
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
  p.appendChild(document.createTextNode(TEXT[0] + ' ')); // the space keeps it readable if the break is ever dropped
  p.appendChild(document.createElement('br'));
  p.appendChild(document.createTextNode(TEXT[1]));

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

  bar.appendChild(p); bar.appendChild(a); bar.appendChild(x);

  var tab = null;
  function showBar() {
    if (tab) { tab.remove(); tab = null; }
    try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    var top = document.getElementById('waybar');
    if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  function showTab() {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hb-tab';
    tab.textContent = 'Help us review';
    tab.addEventListener('click', showBar);
    document.body.appendChild(tab);
  }
  if (closed) showTab(); else showBar();
})();
