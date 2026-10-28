// Print button on case pages. Loaded from a file because the site's
// content security policy does not allow inline scripts.
(function () {
  'use strict';
  var buttons = document.querySelectorAll('[data-print]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      window.print();
    });
  }
})();
