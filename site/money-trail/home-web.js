// Front page money web (Nov 2026, D245): a search box first, then one group's web picked at random.
// The random pick first picks a side at random, then a group on that side, so no side shows up more often. D246: Show another goes through every group.
// Without this script the first web shows and the search box opens a Money Trail search.
(function () {
  'use strict';
  var box = document.getElementById('followmoney');
  if (!box) return;
  var panels = Array.prototype.slice.call(box.querySelectorAll('.mw-panel'));
  // D246: a deck that holds every group once, with each side spread evenly through it. "Show another" goes down the deck, so every group shows before any repeats.
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function deal(avoid) {
    var sides = {}, names = [];
    panels.forEach(function (p) { var s = p.getAttribute('data-side'); if (!sides[s]) { sides[s] = []; names.push(s); } sides[s].push(p); });
    names.forEach(function (s) { shuffle(sides[s]); });
    // each side is spread evenly over the deck, so a side with many groups does not bunch up at the end
    var out = [];
    names.forEach(function (s) { var k = sides[s].length; sides[s].forEach(function (p, j) { out.push({ p: p, key: (j + Math.random()) / k }); }); });
    out.sort(function (a, b) { return a.key - b.key; });
    out = out.map(function (x) { return x.p; });
    // the first group on page load: a side at random first, then a group on that side, so no side shows more often
    if (!avoid) { var side = names[Math.floor(Math.random() * names.length)], first = sides[side][0]; out.splice(out.indexOf(first), 1); out.unshift(first); }
    else if (out.length > 1 && out[0] === avoid) out.push(out.shift());
    return out;
  }
  var deck = [], at = 0;
  function show(p) { panels.forEach(function (x) { x.hidden = x !== p; }); }
  function next() { if (at >= deck.length) { deck = deal(deck[deck.length - 1]); at = 0; } show(deck[at++]); }
  if (panels.length) next();
  var another = box.querySelector('.mw-another');
  if (another && panels.length > 1) { another.hidden = false; another.addEventListener('click', next); }

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
