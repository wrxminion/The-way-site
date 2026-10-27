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
      if (it.ai && it.ai.campaign_source === true) {
        var cs = document.createElement('div');
        cs.className = 'ai ai-campaign';
        cs.textContent = 'Campaign source: written by a campaign, party or press-release service, not independent news. No summary made.';
        li.appendChild(cs);
      } else if (it.ai && typeof it.ai === 'object') {
        // Word-for-word quote (machine-checked) and a short neutral AI synopsis; labelled, with the source and a report link.
        var ai = document.createElement('div');
        ai.className = 'ai';
        var qt = it.ai.quotes && typeof it.ai.quotes[sec.dataset.newsId] === 'string' ? it.ai.quotes[sec.dataset.newsId].slice(0, 340) : '';
        if (qt) {
          var bq = document.createElement('blockquote');
          bq.className = 'ai-quote';
          bq.textContent = '\u201c' + qt + '\u201d';
          var cite = document.createElement('div');
          cite.className = 'ai-cite';
          cite.appendChild(document.createTextNode(String(it.source || u.hostname) + ' \u00b7 '));
          var full = document.createElement('a');
          full.href = u.href;
          full.rel = 'noopener noreferrer';
          full.target = '_blank';
          full.textContent = 'Read the full article';
          cite.appendChild(full);
          ai.appendChild(bq);
          ai.appendChild(cite);
        }
        if (typeof it.ai.synopsis === 'string' && it.ai.synopsis) {
          var sp = document.createElement('p');
          sp.className = 'ai-syn';
          var lb = document.createElement('b');
          lb.textContent = it.ai.review === 'reviewed' ? 'AI synopsis, reviewed by a person: ' : 'AI synopsis, unchecked: ';
          sp.appendChild(lb);
          sp.appendChild(document.createTextNode(it.ai.synopsis.slice(0, 320)));
          ai.appendChild(sp);
        }
        if (ai.children.length) {
          var rep = document.createElement('a');
          rep.className = 'ai-report';
          rep.textContent = 'Report a problem with this quote or summary';
          rep.href = '/members/discuss.html?item=news:' + encodeURIComponent(String(it.id || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 120)) + '&title=' + encodeURIComponent(String(it.title || '').slice(0, 200)) + '&report=ai';
          ai.appendChild(rep);
          li.appendChild(ai);
        }
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
