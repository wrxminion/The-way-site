// Front page money web (Nov 2026, D245): a search box first, then one group's web picked at random.
// The random pick first picks a side at random, then a group on that side, so no side shows up more often.
// Without this script the first web shows and the search box opens a Money Trail search.
(function () {
  'use strict';
  var box = document.getElementById('followmoney');
  if (!box) return;
  var panels = Array.prototype.slice.call(box.querySelectorAll('.mw-panel'));
  var current = null;
  function pick(avoid) {
    var sides = {}, names = [];
    panels.forEach(function (p) { if (p === avoid) return; var s = p.getAttribute('data-side'); if (!sides[s]) { sides[s] = []; names.push(s); } sides[s].push(p); });
    if (avoid && names.length > 1) names = names.filter(function (s) { return s !== avoid.getAttribute('data-side'); });
    if (!names.length) return avoid;
    var list = sides[names[Math.floor(Math.random() * names.length)]];
    return list[Math.floor(Math.random() * list.length)];
  }
  function show(p) { panels.forEach(function (x) { x.hidden = x !== p; }); current = p; }
  if (panels.length) show(pick(null));
  var another = box.querySelector('.mw-another');
  if (another && panels.length > 1) { another.hidden = false; another.addEventListener('click', function () { show(pick(current)); }); }

  // Search: names come from home-names.json the first time the box is used.
  var form = box.querySelector('.mw-search'), input = document.getElementById('mw-q'), list = document.getElementById('mw-names');
  if (!form || !input || !list) return;
  var all = null, loading = false;
  var norm = function (s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  function load() {
    if (all || loading) return;
    loading = true;
    fetch('/money-trail/home-names.json?v=' + (form.getAttribute('data-v') || '1')).then(function (r) { return r.ok ? r.json() : []; }).then(function (n) {
      all = n;
      var frag = document.createDocumentFragment();
      n.forEach(function (name) { var o = document.createElement('option'); o.value = name; frag.appendChild(o); });
      list.appendChild(frag);
    }).catch(function () { all = []; });
  }
  input.addEventListener('focus', load);
  input.addEventListener('input', load);
  form.addEventListener('submit', function (e) {
    var q = input.value.trim(), want = norm(q);
    if (!want) { e.preventDefault(); input.focus(); return; }
    if (!all) return; // names not loaded: the form opens a Money Trail search
    var exact = all.filter(function (n) { return norm(n) === want; });
    var part = exact.length ? exact : all.filter(function (n) { return norm(n).indexOf(want) !== -1; });
    if (part.length === 1) { e.preventDefault(); location.href = '/money-trail/?view=network&hub=' + encodeURIComponent(part[0]); }
  });
})();
