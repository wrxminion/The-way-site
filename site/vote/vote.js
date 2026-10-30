// VOTE! page: members who saved a state get a link straight to that state's voter guide (the bar stores it for drawing links only).
(function () {
  'use strict';
  var d = window.WayBar && window.WayBar.read && window.WayBar.read();
  var a = document.getElementById('guide');
  if (d && d.ballot && a) a.setAttribute('href', d.ballot);
})();
