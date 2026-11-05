// The Way: Passed / Failed / Not yet called on ballot measure pages and Election Studies (Nov 2026).
// Loaded by members/waybar.js on /case-studies/ and /guide*/measures/ pages.
// 1. results/measure-pages.json says which results contest belongs to this page (built by tools/build-measure-outcomes.py).
// 2. The live results file (results/data/*.json, written by the results collector) says whether anyone has called it.
// We never call a measure ourselves. A mark shows only when AP, the official source, or a certified result says so.
// Everything from the data files is untrusted text: it only goes on the page with textContent.
(function () {
  'use strict';
  var path = location.pathname.replace(/\/$/, '/index.html');
  var isIndex = /\/index\.html$/.test(path);

  var STATES = { al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado', ct: 'Connecticut',
    de: 'Delaware', dc: 'D.C.', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa',
    ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota',
    ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey',
    nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon',
    pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah',
    vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming' };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function fmt(n) { return (typeof n === 'number' ? n : 0).toLocaleString('en-US'); }
  function when(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    try { return d.toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' MT'; }
    catch (e) { return d.toUTCString(); }
  }
  var stamp = Math.floor(Date.now() / 60000);
  function getJSON(url) {
    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + stamp, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Which side is YES and which is NO. Sources name them Yes/For/Approve and No/Against/Reject.
  function side(x) {
    var s = String((x && (x.id || '')) + ' ' + (x && (x.name || ''))).toLowerCase().trim();
    if (/^(yes|for|approve)\b/.test(s)) return 'yes';
    if (/^(no|against|reject)\b/.test(s)) return 'no';
    return null;
  }

  // The state of one contest: {word, cls, who, winner (choice), yes, no, total}
  function outcome(c, file) {
    var r = { yes: null, no: null, total: 0, c: c, updated: file && file.updated_at };
    (c.choices || []).forEach(function (x) {
      r.total += x.votes || 0;
      var s = side(x);
      if (s && !r[s]) r[s] = x;
    });
    var cl = c.called;
    var certified = cl && (cl.kind === 'certified' || (file && file.certified === true && cl.kind !== 'ap' && cl.kind !== 'state_leader'));
    var winner = null;
    if (cl && cl.winner && cl.kind !== 'state_leader') {
      (c.choices || []).forEach(function (x) { if (x.id === cl.winner) winner = x; });
    }
    var ws = winner && side(winner);
    if (ws === 'yes' || ws === 'no') {
      r.word = ws === 'yes' ? 'Passed' : 'Failed';
      r.cls = ws === 'yes' ? 'mo-passed' : 'mo-failed';
      r.winSide = ws;
      r.who = certified ? 'Certified by the state' : cl.kind === 'ap' ? 'What AP is calling (not certified)'
        : 'Called by ' + (cl.by || 'the official source') + ' (not certified)';
      r.at = cl.at;
    } else if (!r.total) {
      r.word = 'No count yet'; r.cls = 'mo-wait';
    } else {
      r.word = 'Not yet called'; r.cls = 'mo-wait';
      if (cl && cl.kind === 'state_leader' && winner) r.leaderNote = 'The state’s results page shows ' + (side(winner) === 'yes' ? 'YES' : side(winner) === 'no' ? 'NO' : winner.name) + ' ahead. That is the count so far, not a call.';
    }
    return r;
  }

  function resultsLink(st) {
    var a = el('a', null, 'All ' + (STATES[st] || st.toUpperCase()) + ' results');
    a.href = '/results/?state=' + st + '#tabs';
    return a;
  }

  function countRow(label, x, total, lead) {
    var row = el('div', 'mo-row' + (lead ? ' mo-lead' : ''));
    var pct = total ? (100 * (x.votes || 0) / total) : 0;
    var top = el('div', 'mo-rtop');
    top.appendChild(el('span', 'mo-side', label));
    var n = el('span', 'mo-num', pct.toFixed(1) + '%');
    n.appendChild(el('small', null, ' ' + fmt(x.votes || 0) + ' votes'));
    top.appendChild(n);
    row.appendChild(top);
    var bar = el('div', 'mo-bar'); var i = el('i'); i.style.width = Math.min(100, pct).toFixed(1) + '%'; bar.appendChild(i);
    row.appendChild(bar);
    return row;
  }

  function block(entry, data) {
    var st = entry.state;
    var box = el('section', 'mo');
    box.setAttribute('aria-label', 'Election result');
    box.appendChild(el('p', 'mo-eyebrow', 'Result of the November 3, 2026 vote'));
    if (!data) {
      box.classList.add('mo-wait');
      box.appendChild(el('p', 'mo-word', 'No count yet'));
      var p0 = el('p', 'mo-fine', 'We have not collected vote counts for this measure yet. When we do, the result shows here on its own. ');
      p0.appendChild(resultsLink(st));
      box.appendChild(p0);
      return box;
    }
    var o = data;
    box.classList.add(o.cls);
    box.appendChild(el('p', 'mo-word', o.word));
    if (o.who) box.appendChild(el('p', 'mo-who', o.who + (o.at && when(o.at) ? ', ' + when(o.at) : '')));
    else box.appendChild(el('p', 'mo-who', 'Neither AP nor the state has called this measure yet. This changes on its own when one of them does.'));
    if (o.winSide && entry[o.winSide]) {
      var m = el('p', 'mo-means');
      m.appendChild(el('b', null, (o.winSide === 'yes' ? 'YES' : 'NO') + ' won: '));
      m.appendChild(document.createTextNode(entry[o.winSide]));
      box.appendChild(m);
    }
    if (o.total && o.yes && o.no) {
      var cnt = el('div', 'mo-count');
      cnt.appendChild(countRow('YES', o.yes, o.total, (o.yes.votes || 0) >= (o.no.votes || 0)));
      cnt.appendChild(countRow('NO', o.no, o.total, (o.no.votes || 0) > (o.yes.votes || 0)));
      box.appendChild(cnt);
    }
    if (o.leaderNote) box.appendChild(el('p', 'mo-fine', o.leaderNote));
    var fine = [];
    if (entry.needs) fine.push('Needed to pass, per our voter guide: ' + entry.needs + '.');
    if (o.total) fine.push(fmt(o.total) + ' votes counted' + (o.updated && when(o.updated) ? ', updated ' + when(o.updated) : '') + '.');
    var p = o.c && o.c.precincts;
    if (p && p.total) fine.push(/^%/.test(p.unit || '') ? fmt(p.reporting) + p.unit + '.' : fmt(p.reporting) + ' of ' + fmt(p.total) + ' ' + (p.unit || 'precincts') + ' reporting.');
    if (o.word === 'Passed' || o.word === 'Failed') fine.push(o.who === 'Certified by the state' ? 'This is the certified result.' : 'Results are not final until the state certifies them.');
    else fine.push('The count changes until every vote is counted. Results are not final until the state certifies them.');
    var pf = el('p', 'mo-fine', fine.join(' ') + ' ');
    pf.appendChild(resultsLink(st));
    box.appendChild(pf);
    return box;
  }

  // Election Studies show "Election pending" in the badge row: say what happened instead.
  function badge(o) {
    var b = document.querySelector('.badge-row .badge.pending');
    if (!b) return;
    b.textContent = o && o.winSide ? o.word + ': ' + (o.who === 'Certified by the state' ? 'certified by the state' : o.c.called.kind === 'ap' ? 'what AP is calling (not certified)' : 'called, not certified')
      : 'Election held November 3, 2026: not yet called';
  }

  function chip(o) {
    var t = 'No count yet';
    if (o && o.winSide) t = o.word + (o.who === 'Certified by the state' ? ' (certified)' : o.c.called.kind === 'ap' ? ' (AP call, not certified)' : ' (called, not certified)');
    else if (o) t = o.word;
    return el('span', 'mo-chip ' + (o ? o.cls : 'mo-wait'), t);
  }

  getJSON('/results/measure-pages.json').then(function (map) {
    var pages = map && map.pages;
    if (!pages) return;
    var cache = {};
    function file(name) {
      if (!/^[a-z0-9-]+\.json$/.test(name || '')) return Promise.resolve(null);
      if (!cache[name]) cache[name] = getJSON('/results/data/' + name);
      return cache[name];
    }
    function lookup(entry) {
      if (!entry || !entry.contest) return Promise.resolve(null);
      return file(entry.file).then(function (d) {
        var c = d && (d.contests || []).filter(function (k) { return k.id === entry.contest; })[0];
        return c ? outcome(c, d) : null;
      });
    }

    var entry = pages[path];
    if (entry && !isIndex) {
      var h1 = document.querySelector('main h1') || document.querySelector('h1');
      if (!h1) return;
      lookup(entry).then(function (o) {
        var b = block(entry, o);
        h1.parentNode.insertBefore(b, h1.nextSibling);
        if (path.indexOf('/case-studies/') === 0) badge(o);
      });
      return;
    }

    // List pages: a small mark next to each link to a measure page.
    if (!isIndex) return;
    var root = document.querySelector('main') || document.body;
    Array.prototype.forEach.call(root.querySelectorAll('a[href]'), function (a) {
      var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if (u.origin !== location.origin) return;
      var e2 = pages[u.pathname];
      if (!e2 || a.closest('nav, .crumbs, .toc')) return;
      lookup(e2).then(function (o) {
        if (a.nextSibling && a.nextSibling.className && String(a.nextSibling.className).indexOf('mo-chip') >= 0) return;
        a.parentNode.insertBefore(chip(o), a.nextSibling);
      });
    });
  });
})();
