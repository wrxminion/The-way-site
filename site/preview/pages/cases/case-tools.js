// Case page tools: Print button and "Email me updates" in the report row.
// Loaded from a file because the site's content security policy does not allow inline scripts.
(function () {
  'use strict';
  var m = window.location.pathname.match(/^\/preview\/pages\/cases\/([a-z0-9-]+)\.html$/);

  var buttons = document.querySelectorAll('[data-print]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      window.print();
    });
  }

  if (!m) return;
  // Same sign-up link the follow box uses (/members/email.html does the sign-up; sending is still off).
  var href = '/members/email.html?follow=' + encodeURIComponent('case:' + m[1]) +
    '&label=' + encodeURIComponent(document.title.slice(0, 120));
  var boxes = document.querySelectorAll('.report-box');
  for (var j = 0; j < boxes.length; j++) {
    var tools = boxes[j].querySelector('.report-tools');
    if (!tools) continue;
    var a = document.createElement('a');
    a.className = 'report-btn';
    a.href = href;
    a.textContent = '✉ Email me updates';
    tools.insertBefore(a, tools.firstChild);
    var note = boxes[j].querySelector('.report-note');
    if (note) {
      note.textContent += ' Email updates: coming soon. Sign up now and we will confirm by email when they begin. Free, not a membership, one click to stop.';
    }
  }

  // The older follow box is replaced by the buttons above; remove it if it was added.
  function dropFollowBox() {
    var old = document.querySelectorAll('aside.follow-box');
    for (var k = 0; k < old.length; k++) old[k].parentNode.removeChild(old[k]);
  }
  dropFollowBox();
  if (window.MutationObserver) {
    var host = document.querySelector('main') || document.body;
    var obs = new window.MutationObserver(dropFollowBox);
    obs.observe(host, { childList: true });
    window.setTimeout(function () { obs.disconnect(); }, 5000);
  }
})();
