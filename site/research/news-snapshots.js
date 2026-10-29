/* News snapshots: pick a day or a short range and download the news feed as it stood then.
   Reads the frozen day files the news cycle already publishes (/news/data/index.json and /news/data/days/YYYY-MM-DD.json).
   Nothing is sent anywhere; the files are built in this browser. Headlines, publishers and links only, never article text. */
(function () {
  'use strict';
  var DATA = '/news/data/', MAX_DAYS = 14, SCHEMA = 'theway-news-snapshot/1';
  var NOTE = 'Headlines, publishers and links only; no article text. Each day holds up to 200 items, not the full day. "Not checked" means a person has not checked the item. ' +
    'Times are UTC and show when we first saw the item, not when it was published. Items marked AI carry text written by a local AI model and are labelled unchecked until a person reviews them.';
  var DAY = /^\d{4}-\d{2}-\d{2}$/;

  function cap(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
  function strs(v, n) { return (Array.isArray(v) ? v : []).filter(function (x) { return typeof x === 'string'; }).map(function (x) { return x.slice(0, 120); }).slice(0, n || 20); }
  function httpUrl(v) { try { var u = new URL(String(v)); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : ''; } catch (e) { return ''; } }
  function checkLabel(s) { s = cap(s, 40); return !s || s === 'Unchecked' ? 'Not checked' : s; }

  // Keep only the public fields. Anything else in a day file is left out of the download.
  function pick(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = httpUrl(raw.source_url || raw.url), title = cap(raw.title, 400).trim();
    if (!url || !title) return null;
    var snap = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : {};
    var ai = raw.ai && typeof raw.ai === 'object' ? raw.ai : null;
    var quotes = [];
    if (ai && ai.quotes && typeof ai.quotes === 'object') Object.keys(ai.quotes).slice(0, 6).forEach(function (k) { if (typeof ai.quotes[k] === 'string') quotes.push({about: cap(k, 80), text: ai.quotes[k].slice(0, 400)}); });
    return {
      id: cap(raw.id, 80), kind: cap(raw.kind, 20) || 'news', title: title, source: cap(raw.source, 120), url: url,
      published_at: cap(raw.published_at, 30), first_seen_at: cap(raw.first_seen_at, 30),
      states: strs(raw.states), topics: strs(raw.topics), measures: strs(raw.measures), candidates: strs(raw.candidates), about: labels(raw.about),
      status: cap(raw.status, 40) || 'Unchecked', status_label: checkLabel(raw.status),
      archive: snap.status === 'snapped' ? {status: 'snapped', captured_at: cap(snap.captured_at, 30), archive_url: httpUrl(snap.archive_url), sha256: /^[0-9a-f]{64}$/.test(snap.sha256 || '') ? snap.sha256 : ''} : {status: 'not_snapped'},
      ai: ai ? {label: cap(ai.label, 80) || 'AI synopsis, unchecked', review: cap(ai.review, 20) || 'unchecked', synopsis: cap(ai.synopsis, 400), quotes: quotes} : null
    };
  }

  // Names of the ballot measures and candidates an item is tied to, kept so the download can be filtered by name.
  function labels(v) { return (Array.isArray(v) ? v : []).filter(function (a) { return a && typeof a === 'object'; }).slice(0, 6).map(function (a) { return {kind: cap(a.kind, 12), label: cap(a.label, 120)}; }); }
  var STATE_NAMES = {al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado', ct: 'Connecticut', de: 'Delaware', dc: 'District of Columbia', fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming'};
  // Runs in the browser on the day files before anything is saved. state: a two letter code or ''. text: words that must all appear in the headline or in the names of the measures and candidates the item is tied to.
  function applyFilter(items, state, text) {
    var words = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; });
    return items.filter(function (it) {
      if (state && it.states.indexOf(state) < 0) return false;
      if (!words.length) return true;
      var hay = (it.title + ' ' + it.measures.join(' ') + ' ' + it.candidates.join(' ') + ' ' + it.about.map(function (a) { return a.label; }).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  function filterText(state, text) { var p = []; if (state) p.push('state ' + (STATE_NAMES[state] || state.toUpperCase())); if (String(text || '').trim()) p.push('matching "' + String(text).trim().slice(0, 60) + '"'); return p.join(', '); }

  function dedupe(items) {
    var m = new Map();
    items.forEach(function (it) { var p = m.get(it.id || it.url); if (!p || it.first_seen_at < p.first_seen_at) m.set(it.id || it.url, it); });
    return Array.from(m.values()).sort(function (a, b) { return a.first_seen_at < b.first_seen_at ? -1 : a.first_seen_at > b.first_seen_at ? 1 : 0; });
  }

  function buildJSON(from, to, days, items, filt) {
    return JSON.stringify({schema: SCHEMA, from: from, to: to, note: NOTE, filter: filt || '', days: days, count: items.length, items: items}, null, 1);
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;          // stop spreadsheets from running a headline as a formula
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var COLS = ['first_seen_at', 'published_at', 'title', 'source', 'url', 'kind', 'check_status', 'ai_label', 'ai_synopsis', 'ai_quotes', 'states', 'topics', 'measures', 'candidates', 'archive_status', 'archive_url', 'archive_sha256', 'id'];
  function buildCSV(items) {
    var rows = [COLS.join(',')];
    items.forEach(function (it) {
      rows.push([it.first_seen_at, it.published_at, it.title, it.source, it.url, it.kind, it.status_label,
        it.ai ? it.ai.label : '', it.ai ? it.ai.synopsis : '', it.ai ? it.ai.quotes.map(function (q) { return q.text; }).join(' | ') : '',
        it.states.join(' '), it.topics.join(' '), it.measures.join(' '), it.candidates.join(' '),
        it.archive.status, it.archive.archive_url || '', it.archive.sha256 || '', it.id].map(csvCell).join(','));
    });
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function buildHTML(from, to, items, filt) {
    var out = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Way news snapshot ' + esc(from) + (to !== from ? ' to ' + esc(to) : '') + '</title>',
      '<style>body{font:16px/1.5 Georgia,serif;max-width:860px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:24px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ccc}li{margin:0 0 12px}small{color:#555}.tag{border:1px solid #888;border-radius:5px;padding:0 6px;font-size:12px;margin-right:4px}.ai{background:#fff4d6}</style></head><body>',
      '<h1>The Way news snapshot: ' + esc(from) + (to !== from ? ' to ' + esc(to) : '') + '</h1><p><small>' + esc(NOTE) + ' ' + items.length + ' items.' + (filt ? ' Filter: ' + esc(filt) + '.' : '') + '</small></p>'];
    var day = '';
    items.forEach(function (it) {
      var d = it.first_seen_at.slice(0, 10);
      if (d !== day) { if (day) out.push('</ul>'); out.push('<h2>' + esc(d) + '</h2><ul>'); day = d; }
      out.push('<li><a href="' + esc(it.url) + '" rel="noopener noreferrer">' + esc(it.title) + '</a><br><small>' + esc(it.source) + ' · first seen ' + esc(it.first_seen_at.slice(11, 16)) + ' UTC · </small><span class="tag">' + esc(it.status_label) + '</span>' +
        it.states.map(function (s) { return '<span class="tag">' + esc(s.toUpperCase()) + '</span>'; }).join('') +
        (it.ai && (it.ai.synopsis || it.ai.quotes.length) ? '<div class="ai"><small><b>' + esc(it.ai.label) + '.</b> ' + esc(it.ai.synopsis) + it.ai.quotes.map(function (q) { return ' Quote: “' + esc(q.text) + '”'; }).join('') + '</small></div>' : '') + '</li>');
    });
    if (day) out.push('</ul>');
    out.push('</body></html>');
    return out.join('\n');
  }

  function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function getDay(entry) {
    var r = await fetch(DATA + 'days/' + entry.date + '.json', {cache: 'no-cache', credentials: 'same-origin'});
    if (!r.ok) throw new Error('day ' + entry.date + ' ' + r.status);
    var buf = await r.arrayBuffer(), ok = null;
    if (entry.sha256 && window.crypto && crypto.subtle) ok = hex(await crypto.subtle.digest('SHA-256', buf)) === entry.sha256;
    var doc = JSON.parse(new TextDecoder().decode(buf));
    return {date: entry.date, checksum_ok: ok, items: (Array.isArray(doc.items) ? doc.items : []).map(pick).filter(Boolean)};
  }

  async function collect(from, to, index) {
    var want = index.filter(function (d) { return d.date >= from && d.date <= to; });
    var got = await Promise.all(want.map(getDay));
    var items = dedupe(got.reduce(function (a, d) { return a.concat(d.items); }, []));
    return {days: got.map(function (d) { return {date: d.date, items: d.items.length, checksum_ok: d.checksum_ok}; }), items: items};
  }

  function save(name, type, text) {
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], {type: type}));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var api = {pick: pick, applyFilter: applyFilter, filterText: filterText, dedupe: dedupe, buildJSON: buildJSON, buildCSV: buildCSV, buildHTML: buildHTML, csvCell: csvCell};
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  var root = document.getElementById('news-snaps');
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var elFrom = $('ns-from'), elTo = $('ns-to'), msg = $('ns-msg'), btns = root.querySelectorAll('button[data-fmt]');
  var elState = $('ns-state'), elFind = $('ns-find');
  Object.keys(STATE_NAMES).sort(function (a, b) { return STATE_NAMES[a] < STATE_NAMES[b] ? -1 : 1; }).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = STATE_NAMES[k]; elState.appendChild(o); });
  var index = [];
  function say(t) { msg.textContent = t; }
  function busy(b) { Array.prototype.forEach.call(btns, function (x) { x.disabled = b || !index.length; }); }

  fetch(DATA + 'index.json', {cache: 'no-cache', credentials: 'same-origin'}).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (doc) {
    index = (Array.isArray(doc.days) ? doc.days : []).filter(function (d) { return d && DAY.test(d.date); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!index.length) throw 0;
    var first = index[0].date, last = index[index.length - 1].date;
    [elFrom, elTo].forEach(function (e) { e.min = first; e.max = last; e.disabled = false; });
    elState.disabled = elFind.disabled = false;
    elFrom.value = elTo.value = last;
    say('Snapshots exist for ' + index.length + ' days, ' + first + ' to ' + last + '.');
    busy(false);
  }).catch(function () { say('The list of snapshot days could not load. Reload the page, or try again later.'); });

  function range() {
    var from = elFrom.value, to = elTo.value || elFrom.value;
    if (!DAY.test(from) || !DAY.test(to)) return say('Pick a day first.'), null;
    if (to < from) { var t = from; from = to; to = t; }
    var n = index.filter(function (d) { return d.date >= from && d.date <= to; });
    if (!n.length) return say('No snapshot was saved for those days. Try days between ' + index[0].date + ' and ' + index[index.length - 1].date + '.'), null;
    if (n.length > MAX_DAYS) return say('Please pick at most ' + MAX_DAYS + ' days at a time.'), null;
    return {from: from, to: to};
  }

  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener('click', async function () {
      var r = range(); if (!r) return;
      busy(true); say('Building your snapshot…');
      try {
        var res = await collect(r.from, r.to, index), tag = r.from === r.to ? r.from : r.from + '_to_' + r.to, fmt = b.getAttribute('data-fmt');
        var st = elState.value, q = elFind.value, filt = filterText(st, q), before = res.items.length;
        if (filt) {
          res.items = applyFilter(res.items, st, q);
          tag += (st ? '_' + st : '') + (String(q).trim() ? '_filtered' : '');
          if (!res.items.length) { say('Nothing in those days matched (' + filt + '). Each day holds up to 200 items; try fewer filters or other days.'); busy(false); return; }
        }
        if (fmt === 'json') save('theway-news-' + tag + '.json', 'application/json', buildJSON(r.from, r.to, res.days, res.items, filt));
        else if (fmt === 'csv') save('theway-news-' + tag + '.csv', 'text/csv;charset=utf-8', buildCSV(res.items));
        else save('theway-news-' + tag + '.html', 'text/html;charset=utf-8', buildHTML(r.from, r.to, res.items, filt));
        var bad = res.days.filter(function (d) { return d.checksum_ok === false; }).length;
        say('Saved ' + res.items.length + (filt ? ' of ' + before : '') + ' items' + (filt ? ' (' + filt + ')' : '') + ' from ' + res.days.length + ' day' + (res.days.length === 1 ? '' : 's') + '.' + (bad ? ' ' + bad + ' day(s) changed after the list was made; the newest days can still gain items.' : ''));
      } catch (e) { say('Could not build that snapshot. Try again, or pick fewer days.'); }
      busy(false);
    });
  });
})();
