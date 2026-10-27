// "Follow / email me updates" block for item pages. Loaded by waybar.js. No page needs editing:
// the topic is worked out from the address. Opens /members/email.html, which does the sign-up
// (this page's security policy allows no outside requests, so the form lives there).
(function () {
  'use strict';
  var p = location.pathname, topic = '', kindWord = '', m;
  // news feed ids: Colorado measures keep their plain id; every other state is <st>-<page>; candidates are <st>-<name>
  if ((m = p.match(/^\/preview\/pages\/guide(?:-([a-z]{2}))?\/measures\/([a-z0-9-]+)\.html$/))) { topic = 'measure:' + (m[1] ? m[1] + '-' : '') + m[2]; kindWord = 'this ballot measure'; }
  else if ((m = p.match(/^\/preview\/pages\/guide(?:-([a-z]{2}))?\/candidates\/([a-z0-9-]+)\.html$/))) { topic = 'candidate:' + (m[1] || 'co') + '-' + m[2]; kindWord = 'this candidate (neutral news only)'; }
  else if ((m = p.match(/^\/preview\/pages\/cases\/([a-z0-9-]+)\.html$/))) { topic = 'case:' + m[1]; kindWord = 'this case'; }
  else if ((m = p.match(/^\/research\/packages\/([a-z0-9-]+)\//))) { topic = 'research:' + m[1]; kindWord = 'this research'; }
  else if ((m = p.match(/^\/research\/datasets\/([a-z0-9-]+)\//))) { topic = 'dataset:' + m[1]; kindWord = 'this dataset (a note when a new version is published)'; }
  else if ((m = p.match(/^\/preview\/pages\/guide-([a-z]{2})\/(?:index\.html)?$/)) || p.match(/^\/preview\/pages\/guide\/(?:index\.html)?$/)) { topic = 'state:' + (m ? m[1] : 'co'); kindWord = 'this state'; }
  else if (p === '/research/' || p === '/research/index.html') { topic = 'new:research'; kindWord = 'new research'; }
  else if (/^\/preview\/pages\/news\/(?:index\.html)?$/.test(p)) { topic = 'state:co'; kindWord = 'Colorado news (follow a single story with the link on its card)'; }
  else if (/^\/preview\/pages\/cases\/(?:index\.html)?$/.test(p)) { topic = 'new:cases'; kindWord = 'new cases'; }
  if (!topic || topic.length > 90) return;
  var host = document.querySelector('main') || document.body;
  var box = document.createElement('aside');
  box.className = 'follow-box';
  var a = document.createElement('a');
  a.href = '/members/email.html?follow=' + encodeURIComponent(topic) + '&label=' + encodeURIComponent(document.title.slice(0, 120));
  a.textContent = '✉ Email me updates about ' + kindWord;
  var small = document.createElement('span');
  small.textContent = ' Free. Not a membership. One click to stop.';
  box.appendChild(a); box.appendChild(small);
  host.appendChild(box);
  var css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/members/follow-link.css?v=1';
  document.head.appendChild(css);
})();
