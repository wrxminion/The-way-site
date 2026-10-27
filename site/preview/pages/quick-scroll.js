(function () {
  'use strict';
  var links = document.querySelector('.essay-quick-links');
  if (!links) return;
  function update() { links.hidden = window.scrollY <= 80; }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();
