// State picker (us-build/tools/statepick.py): the dropdown opens a state's guide, or says it is coming soon;
// on the US map, states without a guide say "coming soon" instead of jumping.
// Picking a state in a dropdown moves the gold highlight to it on every US map on the page (sp-pick).
(function () {
  function say(box, name) {
    var m = box && box.querySelector('.sp-msg');
    if (m) m.textContent = name + ': guide coming soon.';
  }
  function light(st) {
    document.querySelectorAll('.sp-map').forEach(function (m) {
      m.querySelectorAll('.sp-pick').forEach(function (a) { a.classList.remove('sp-pick'); });
      var a = st && m.querySelector('a[data-st="' + st + '"]');
      if (a) a.classList.add('sp-pick');
      m.classList.toggle('sp-picking', !!a);
    });
  }
  document.querySelectorAll('.sp-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var o = sel.options[sel.selectedIndex];
      if (!o || sel.selectedIndex === 0) { light(''); return; }
      light(o.getAttribute('data-st'));
      if (o.value) { var u = o.value; setTimeout(function () { window.location.href = u; }, 350); return; }
      say(sel.closest('.statepick'), o.getAttribute('data-name'));
    });
  });
  document.querySelectorAll('.sp-map').forEach(function (map) {
    map.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-st]');
      if (!a) return;
      light(a.getAttribute('data-st'));
      if (!a.hasAttribute('data-soon')) return;
      e.preventDefault();
      var box = map.closest('.sp-mini, #states');
      say(box && box.querySelector('.statepick'), a.getAttribute('data-soon'));
    });
  });
})();
