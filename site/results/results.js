// Election results page. Reads static JSON written by the results collector (see tools/results/README.md).
// Everything from the data files is untrusted text: it is only ever put on the page with textContent.
(function () {
  'use strict';
  var BASE = '/results/';
  var $ = function (id) { return document.getElementById(id); };
  var cfg = {}, manifest = null, cache = {}, tab = 'co', timer = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function getJSON(path) {
    var bust = Math.floor(Date.now() / 60000); // new copy at most once a minute
    return fetch(BASE + path + '?t=' + bust, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }
  function fmtNum(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : '0'; }
  function fmtTime(iso) {
    if (!iso) return 'not yet';
    var d = new Date(iso);
    if (isNaN(d)) return 'not yet';
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function ago(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var m = Math.max(0, Math.round((Date.now() - d) / 60000));
    if (m < 2) return 'just now';
    if (m < 90) return m + ' minutes ago';
    return Math.round(m / 60) + ' hours ago';
  }
  function countdown(target) {
    var ms = new Date(target) - Date.now();
    if (isNaN(ms)) return '';
    if (ms <= 0) return 'now';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    return (d ? d + ' d ' : '') + h + ' h ' + m + ' m ' + s + ' s';
  }

  // ---- gate: before release_at, show the message and send people to the ballot map
  function gate() {
    var qs = new URLSearchParams(location.search);
    var rel = new Date(cfg.release_at);
    if (qs.get('preview') === '1' || isNaN(rel) || Date.now() >= rel) return false;
    var top = document.querySelector('.top');
    if (top) top.querySelector('p').textContent = 'Results will be posted as they come in.';
    var wrap = document.querySelector('.wrap');
    wrap.textContent = '';
    var box = el('div', 'notice');
    var p1 = el('p'); p1.appendChild(el('b', null, 'Results will be posted here as they come in.'));
    var p2 = el('p'); var c1 = el('b', null, ''); p2.appendChild(document.createTextNode('Election day ends in ')); p2.appendChild(c1); p2.appendChild(document.createTextNode('.'));
    var p3 = el('p'); var c2 = el('b', null, ''); var dateTxt = el('span', null, '');
    p3.appendChild(document.createTextNode('Most results should be in by ')); p3.appendChild(dateTxt);
    p3.appendChild(document.createTextNode(' (')); p3.appendChild(c2); p3.appendChild(document.createTextNode(' from now).'));
    box.appendChild(p1); box.appendChild(p2); box.appendChild(p3);
    if (cfg.most_results_by_is_placeholder) box.appendChild(el('p', 'muted', 'This time is an estimate and may change.'));
    var go = el('p'); var a = el('a', null, 'Go to the ballot map now'); a.href = cfg.redirect_to || '/states/'; go.appendChild(a);
    box.appendChild(go);
    wrap.appendChild(box);
    dateTxt.textContent = fmtTime(cfg.most_results_by);
    function tick() { c1.textContent = countdown(cfg.election_ends_at); c2.textContent = countdown(cfg.most_results_by); }
    tick(); setInterval(tick, 1000);
    var secs = Number(cfg.redirect_after_seconds);
    if (secs > 0) setTimeout(function () { location.replace(cfg.redirect_to || '/states/'); }, secs * 1000);
    return true;
  }

  // ---- rendering
  function sortedChoices(c) {
    var ch = (c.choices || []).slice();
    var total = ch.reduce(function (s, x) { return s + (x.votes || 0); }, 0);
    ch.forEach(function (x) { x._pct = total ? (x.votes || 0) / total * 100 : 0; });
    ch.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    return { ch: ch, total: total };
  }
  function card(c) {
    var li = el('li', 'card');
    var h = el('h3', null, c.title || c.office || 'Contest');
    li.appendChild(h);
    var sub = [];
    if (c.kind === 'candidate' && c.office && c.title !== c.office) sub.push(c.office);
    if (c.level === 'federal' && c.state) sub.push(c.state.toUpperCase());
    if (c.district) sub.push('District ' + c.district);
    if (c.vote_for > 1) sub.push('Vote for ' + c.vote_for);
    if (c.text) sub.push(c.text);
    if (sub.length) li.appendChild(el('p', 'sub', sub.join(' · ')));
    var s = sortedChoices(c);
    var calledId = c.called && c.called.winner;
    s.ch.forEach(function (x, i) {
      var row = el('div', 'choice' + (i === 0 && s.total ? ' lead' : ''));
      var r = el('div', 'row');
      var nm = el('span', 'name', x.name + (x.party ? ' (' + x.party + ')' : ''));
      if (calledId && calledId === x.id) nm.appendChild(el('span', 'pill call', 'Called by ' + (c.called.by || 'source')));
      var num = el('span', 'num', s.total ? s._pctText : '');
      num.textContent = fmtNum(x.votes || 0) + ' ';
      num.appendChild(el('small', null, s.total ? x._pct.toFixed(1) + '%' : ''));
      r.appendChild(nm); r.appendChild(num);
      var bar = el('div', 'bar'); var fill = el('i'); fill.style.width = Math.min(100, x._pct).toFixed(1) + '%'; bar.appendChild(fill);
      row.appendChild(r); row.appendChild(bar); li.appendChild(row);
    });
    var meta = [];
    var p = c.precincts;
    if (p && p.total) meta.push(fmtNum(p.reporting) + ' of ' + fmtNum(p.total) + ' ' + (p.unit || 'precincts') + ' reporting (' + Math.round(p.reporting / p.total * 100) + '%)');
    meta.push(fmtNum(s.total) + ' votes counted');
    if (!calledId) meta.push('Not called by the source yet');
    li.appendChild(el('div', 'meta', meta.join(' · ')));
    return li;
  }
  function groupName(c) {
    if (c.kind === 'measure') return 'Ballot measures';
    if (c.kind === 'judicial') return 'Judges';
    if (c.kind === 'local') return 'Local';
    return c.office || 'Races';
  }
  function renderScope(data) {
    var p = $('panel'); p.textContent = '';
    var q = ($('q').value || '').toLowerCase().trim();
    var list = (data.contests || []).filter(function (c) {
      if (!q) return true;
      var hay = [c.title, c.office, c.text, c.district, c.state].concat((c.choices || []).map(function (x) { return x.name; })).join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (!list.length) { p.appendChild(el('p', 'empty', q ? 'No race matches that search.' : 'No results for this group have been collected yet. They appear here as the official source publishes them.')); return; }
    var order = [], groups = {};
    list.forEach(function (c) { var g = groupName(c); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(c); });
    order.forEach(function (g) {
      p.appendChild(el('div', 'grp', g));
      var ul = el('ul', 'cards');
      groups[g].forEach(function (c) { ul.appendChild(card(c)); });
      p.appendChild(ul);
    });
  }
  function filesFor(scope) { return (manifest.files || []).filter(function (f) { return f.scope === scope || (scope === 'states' && /^state-/.test(f.scope)) || (scope === 'cities' && /^city-/.test(f.scope)); }); }
  function loadFile(f) {
    return getJSON('data/' + f.path).then(function (d) { cache[f.scope] = d; return d; });
  }
  function show() {
    var st = $('statepick');
    st.hidden = !(tab === 'states' || tab === 'cities');
    var fs = filesFor(tab);
    if (tab === 'states' || tab === 'cities') {
      var sel = $('st'), cur = sel.value;
      sel.textContent = '';
      fs.forEach(function (f) { var o = el('option', null, f.label || f.scope); o.value = f.scope; sel.appendChild(o); });
      if (cur) sel.value = cur;
      fs = fs.filter(function (f) { return f.scope === sel.value; });
    }
    if (!fs.length) { $('panel').textContent = ''; $('panel').appendChild(el('p', 'empty', 'Nothing collected for this group yet. It appears here as soon as the official source publishes it.')); return; }
    loadFile(fs[0]).then(renderScope).catch(function () {
      $('panel').textContent = ''; $('panel').appendChild(el('p', 'empty', 'These results could not be loaded just now. Try again in a minute, or use the official sites listed below.'));
    });
  }
  var TABS = [['co', 'Colorado'], ['house', 'U.S. House'], ['senate', 'U.S. Senate'], ['states', 'Other states'], ['cities', 'Cities']];
  function renderTabs() {
    var t = $('tabs'); t.textContent = '';
    TABS.forEach(function (x) {
      var b = el('button', null, x[1]); b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(x[0] === tab));
      b.onclick = function () { tab = x[0]; renderTabs(); show(); };
      t.appendChild(b);
    });
  }
  function renderSources() {
    var ul = $('sources'); ul.textContent = '';
    (manifest.sources || []).forEach(function (s) {
      var li = el('li');
      var a = el('a', null, s.name || s.id); a.href = /^https:\/\//.test(s.url || '') ? s.url : '#'; a.rel = 'noopener';
      li.appendChild(a);
      var cls = s.status === 'ok' ? 'st-ok' : (s.status === 'waiting' ? 'st-wait' : 'st-bad');
      li.appendChild(document.createTextNode(' · '));
      li.appendChild(el('span', cls, s.status === 'ok' ? 'working' : (s.status === 'waiting' ? 'waiting for results' : (s.status === 'stale' ? 'not updating' : 'problem collecting'))));
      li.appendChild(el('div', 'muted', 'We last looked: ' + fmtTime(s.checked_at) + (s.checked_at ? ' (' + ago(s.checked_at) + ')' : '') + '. Source last updated: ' + fmtTime(s.data_updated_at) + '.'));
      if (s.note) li.appendChild(el('div', 'muted', s.note));
      ul.appendChild(li);
    });
    if (!(manifest.sources || []).length) ul.appendChild(el('li', 'muted', 'No sources are active yet.'));
  }
  // Running count of seats the sources have called. Text and patterns only, no party colors.
  var PARTY = [['D', 'Democratic', 'p-d'], ['R', 'Republican', 'p-r'], ['O', 'Other', 'p-o'], ['U', 'Not called yet', 'p-u']];
  function renderBalance() {
    var box = $('balance'); box.textContent = '';
    var b = manifest.balance;
    if (!b || (!b.house && !b.senate)) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('h2', null, 'Congress count'));
    box.appendChild(el('p', 'muted', 'Seats the official source has called, so far. Not a prediction. Races not yet called are counted as not called.'));
    [['house', 'U.S. House', 'U.S. House (435 seats)'], ['senate', 'U.S. Senate', 'U.S. Senate (seats up in this election)']].forEach(function (x) {
      var d = b[x[0]]; if (!d) return;
      var row = el('div', 'bal');
      row.appendChild(el('h3', null, x[1]));
      var total = (d.D || 0) + (d.R || 0) + (d.O || 0) + (d.U || 0);
      var bar = el('div', 'balbar'); bar.setAttribute('role', 'img');
      var alt = [];
      PARTY.forEach(function (p) {
        var n = d[p[0]] || 0; alt.push(p[1] + ' ' + n);
        if (!n || !total) return;
        var seg = el('i', p[2]); seg.style.width = (n / total * 100).toFixed(2) + '%'; bar.appendChild(seg);
      });
      bar.setAttribute('aria-label', alt.join(', '));
      row.appendChild(bar);
      var key = el('div', 'balkey');
      PARTY.forEach(function (p) { var s = el('span'); s.appendChild(el('i', 'sw ' + p[2])); s.appendChild(document.createTextNode(p[1] + ': ' + fmtNum(d[p[0]] || 0))); key.appendChild(s); });
      row.appendChild(key);
      if (d.note) row.appendChild(el('div', 'muted', d.note));
      box.appendChild(row);
    });
  }

  function renderStatus() {
    var s = $('status'), stale = $('stale');
    var mode = manifest.mode || 'waiting';
    var parts = [];
    if (mode === 'waiting') parts.push('Polls have not closed or no results have been collected yet. Numbers appear here as soon as the official sources publish them.');
    else if (mode === 'final') parts.push('Collection has stopped. Counts may still change until certified.');
    else parts.push('Collecting live.');
    parts.push('Page data updated ' + fmtTime(manifest.generated_at) + (manifest.generated_at ? ' (' + ago(manifest.generated_at) + ')' : '') + '.');
    s.textContent = parts.join(' ');
    var limit = (cfg.stale_after_minutes || 90) * 60000, old = !manifest.generated_at || (Date.now() - new Date(manifest.generated_at)) > limit;
    stale.hidden = !(mode === 'live' && old);
    if (!stale.hidden) stale.textContent = 'These numbers may be out of date. Check the official sources below for the latest.';
  }
  function load() {
    return getJSON('data/manifest.json').then(function (m) {
      manifest = m; renderStatus(); renderSources(); renderBalance();
      if (!$('tabs').childNodes.length) renderTabs();
      show();
    }).catch(function () {
      $('status').textContent = 'Results could not be loaded just now. Try again in a minute.';
    });
  }
  function start() {
    if (gate()) return;
    $('q').addEventListener('input', function () { if (cache[tab] || tab === 'states' || tab === 'cities') show(); });
    $('st').addEventListener('change', show);
    load();
    timer = setInterval(load, 60000);
  }
  fetch(BASE + 'config.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
    .then(function (r) { return r.json(); }).catch(function () { return {}; })
    .then(function (c) { cfg = c || {}; start(); });
})();
