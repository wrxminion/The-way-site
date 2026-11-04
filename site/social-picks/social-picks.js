(function () {
  var list = document.getElementById('list');
  var status = document.getElementById('status');
  var tabs = document.querySelectorAll('.modes button');
  var posts = [], filter = 'all';
  var LIMIT = { bluesky: 300, facebook: 63206 };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function copyText(text, btn) {
    function done(ok) {
      btn.textContent = ok ? 'Copied' : 'Press and hold the text to copy';
      setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      var t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(t); done(ok);
    }
  }

  function card(p, platform) {
    var c = el('article', 'card');
    c.appendChild(el('span', 'tag ' + (platform === 'facebook' ? 'fb' : 'bs'), platform === 'facebook' ? 'Facebook' : 'Bluesky'));
    var full = String(p.text || '') + (p.link ? '\n' + p.link : '');
    c.appendChild(el('p', 'text', full));
    var meta = [];
    if (p.created) meta.push('Suggested ' + p.created);
    if (p.source) meta.push('Source: ' + p.source);
    meta.push(full.length + ' characters' + (LIMIT[platform] ? ' of ' + LIMIT[platform] : ''));
    var m = el('p', 'meta', meta.join(' · '));
    if (LIMIT[platform] && full.length > LIMIT[platform]) m.className += ' count';
    c.appendChild(m);
    var b = el('button', 'copy', 'Copy');
    b.type = 'button';
    b.addEventListener('click', function () { copyText(full, b); });
    c.appendChild(b);
    return c;
  }

  function render() {
    list.textContent = '';
    var n = 0;
    posts.forEach(function (p) {
      var plats = p.platform === 'both' ? ['facebook', 'bluesky'] : [p.platform];
      plats.forEach(function (pl) {
        if (filter !== 'all' && filter !== pl) return;
        list.appendChild(card(p, pl)); n++;
      });
    });
    if (!n) status.textContent = 'No recommended posts for this platform yet.';
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      filter = t.getAttribute('data-p');
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      status.textContent = '';
      render();
    });
  });

  fetch('data.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      posts = (d && d.posts) || [];
      status.textContent = posts.length
        ? 'Last updated ' + (d.updated || 'unknown') + '. ' + posts.length + ' recommended.'
        : 'No recommended posts yet.';
      render();
    })
    .catch(function () { status.textContent = 'Could not load the recommended posts.'; });
})();
