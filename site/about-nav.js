(function () {
  'use strict';
  var form = document.querySelector('.about-search');
  if (!form) return;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = form.querySelector('input[name="q"]').value.trim();
    location.href = '/search/' + (query ? '?q=' + encodeURIComponent(query) : '');
  });
})();
