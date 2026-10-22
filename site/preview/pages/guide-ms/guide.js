// Live "Latest news": replaces the built-in list with the pushed feed when one exists.
// Feed: <guide root>/../news/data/<kind>/<id>.json, kind = measures (default) or candidates (schema theway-news/1).
// 404 or bad data = keep the built-in list.
(function () {
  var sec = document.getElementById('news');
  if (!sec || !sec.dataset.newsId || !window.fetch) return;
  var kind = sec.dataset.newsKind === 'candidates' ? 'candidates' : 'measures';
  var url = sec.dataset.root + '../news/data/' + kind + '/' + encodeURIComponent(sec.dataset.newsId) + '.json';
  function link(raw) {
    var u;
    try { u = new URL(String(raw)); } catch (e) { return null; }
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u : null;
  }
  function pill(tag, cls, text) {
    var s = document.createElement(tag);
    s.className = 'pill ' + cls;
    s.textContent = text;
    return s;
  }
  fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw 0;
    return r.json();
  }).then(function (d) {
    if (!d || d.schema !== 'theway-news/1' || !Array.isArray(d.items) || !d.items.length) return;
    var ul = document.createElement('ul');
    ul.className = 'news';
    d.items.slice(0, 8).forEach(function (it) {
      var u = link(it.source_url) || link(it.url);
      if (!u) return;
      var li = document.createElement('li');
      var date = document.createElement('span');
      date.className = 'date';
      date.textContent = String(it.published_at || it.first_seen_at || '').slice(0, 10);
      var a = document.createElement('a');
      a.href = u.href;
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      a.textContent = String(it.title || u.hostname);
      li.appendChild(date);
      li.appendChild(document.createTextNode(' ' + String(it.source || u.hostname) + ': '));
      li.appendChild(a);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(pill('span', 'unchecked', 'Unchecked'));
      li.appendChild(document.createTextNode(' '));
      var snap = it.snapshot || {};
      if (snap.status === 'snapped' && /^[0-9a-f]{64}$/.test(String(snap.sha256 || ''))) {
        var arch = link(snap.archive_url);
        if (arch && arch.protocol === 'https:' && arch.hostname === 'web.archive.org') {
          var sa = pill('a', 'snapped', 'Snapped');
          sa.href = arch.href;
          sa.rel = 'noopener noreferrer';
          sa.target = '_blank';
          sa.title = 'A saved copy of the page as it was when we found it';
          li.appendChild(sa);
        } else {
          li.appendChild(pill('span', 'snapped', 'Snapped'));
        }
      } else {
        li.appendChild(pill('span', 'notsnapped', 'Not snapped'));
      }
      ul.appendChild(li);
    });
    if (!ul.children.length) return;
    var own = sec.querySelector('.news-own');
    if (!own) return;
    own.replaceWith(ul);
    var key = document.createElement('p');
    key.className = 'note';
    key.appendChild(document.createTextNode('Unchecked: found automatically, not yet reviewed by a person. Snapped: a copy of the page was saved. '));
    var all = document.createElement('a');
    all.href = sec.dataset.root + '../news/';
    all.textContent = 'All news';
    key.appendChild(all);
    ul.after(key);
  }).catch(function () {});
})();
