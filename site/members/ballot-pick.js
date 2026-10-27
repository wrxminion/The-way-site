// The Way: "My Ballot" controls on the voter guide pages (race, candidate and measure pages, any state).
// Loaded by waybar.js together with ballot-store.js and ballot-pick.css. It adds Pick / Compare / Undecided buttons,
// a "Save" button on each fact, and a "Save highlighted text" button. Everything goes to this browser's
// localStorage through WayBallot. This file makes no network request except one read of the race page that a
// candidate page already links to (same site), so it can find the race the candidate is in.
(function () {
  'use strict';
  var WB = window.WayBallot;
  var main = document.querySelector('main');
  var m = /^\/preview\/pages\/guide(-[a-z]{2})?\/(?:(races|measures|candidates)\/([a-z0-9-]+)\.html)?$/.exec(location.pathname);
  if (!WB || !main || !m) return;
  var ST = m[1] ? m[1].slice(1).toUpperCase() : 'CO';
  var KIND = { races: 'race', measures: 'measure', candidates: 'candidate' }[m[2]] || '';
  var PAGE = m[3] || '';
  if (!WB.STATES[ST]) return;

  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function txt(n) { return (n.textContent || '').replace(/\s+/g, ' ').trim(); }
  function sl(s) { return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(cls, text, label) {
    var b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b;
  }
  function h1Text(doc) {
    var h = doc.querySelector('main h1'); if (!h) return '';
    var c = h.cloneNode(true), s = c.querySelector('.sub'), sub = '';
    if (s) { sub = txt(s); s.remove(); }
    return txt(c) + (sub ? ': ' + sub : '');
  }
  function seatsIn(text) {
    var r = /(?:vote for|choose|select) up to (\d+|[a-z]+)/i.exec(text) || /vote for (\d+)\b/i.exec(text);
    if (!r) return 1;
    var n = /^\d+$/.test(r[1]) ? parseInt(r[1], 10) : (NUM[r[1].toLowerCase()] || 1);
    return n >= 1 && n <= 20 ? n : 1;
  }

  // Race contests on a race page (or a fetched copy of one). A page with two lists (governor + lieutenant governor) has two contests.
  function parseRace(doc, base, raceSlug) {
    var root = doc.querySelector('main'); if (!root) return [];
    var nodes = root.querySelectorAll('h2, h3, ul.cands'), head = '', lists = [], i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].tagName === 'UL') lists.push({ ul: nodes[i], head: head }); else head = txt(nodes[i]);
    }
    var title = h1Text(doc), whole = txt(root), out = [], used = {};
    lists.forEach(function (l) {
      var key = 'race:' + raceSlug;
      if (lists.length > 1) { key += ':' + (sl(l.head) || 'list'); }
      while (used[key]) key += '-2';
      used[key] = true;
      var seg = l.head, n = l.ul.previousElementSibling, k = 0;
      while (n && k++ < 4 && !/^H[1-6]$/.test(n.tagName)) { seg += ' ' + txt(n); n = n.previousElementSibling; }
      n = l.ul.nextElementSibling; k = 0;
      while (n && k++ < 3 && !/^H[1-6]$/.test(n.tagName) && n.tagName !== 'UL') { seg += ' ' + txt(n); n = n.nextElementSibling; }
      var seats = seatsIn(seg);
      if (seats === 1 && lists.length === 1) seats = seatsIn(whole);
      var options = [];
      Array.prototype.forEach.call(l.ul.querySelectorAll(':scope > li'), function (li) {
        var a = li.querySelector('a[href]'); if (!a) return;
        var p;
        try { p = new URL(a.getAttribute('href'), base).pathname; } catch (e) { return; }
        var id = (/\/([a-z0-9-]+)\.html$/.exec(p) || [])[1]; if (!id) return;
        var party = li.querySelector('.party'), what = li.querySelector('.what');
        options.push({ id: id, label: txt(a), sub: [party ? txt(party) : '', what ? txt(what) : ''].filter(Boolean).join(' · '), url: p });
      });
      out.push({ key: key, kind: 'race', title: lists.length > 1 && l.head && l.head !== title ? title + ': ' + l.head : title,
        url: new URL(base).pathname, seats: seats, options: options, ul: l.ul });
    });
    return out;
  }
  function measureDef() {
    return { key: 'measure:' + PAGE, kind: 'measure', title: h1Text(document), url: location.pathname, seats: 1,
      options: [{ id: 'yes', label: 'Yes', sub: '', url: '' }, { id: 'no', label: 'No', sub: '', url: '' }] };
  }

  // ---- store helpers: merge the page's view of a contest with what is saved, then apply a change
  function merged(d, def) {
    var c = d.contests[def.key] || { picks: [], undecided: false, compare: [] };
    d.contests[def.key] = { key: def.key, kind: def.kind, title: def.title, url: def.url, seats: def.seats, options: def.options,
      picks: c.picks, undecided: c.undecided, compare: c.compare };
    return d.contests[def.key];
  }
  function change(def, fn) {
    var d = WB.read(ST), c = merged(d, def);
    var msg = fn(c) || '';
    d = WB.clean(d, ST);
    WB.write(d);
    render(msg);
  }
  function toggle(list, id, max) {
    var i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); return true; }
    if (max && list.length >= max) return false;
    list.push(id); return true;
  }
  function pickFn(id) {
    return function (c) {
      if (c.picks.indexOf(id) < 0 && c.picks.length >= c.seats && c.seats > 1) return 'You can pick up to ' + c.seats + ' here. Take one off first.';
      if (c.seats === 1 && c.picks.indexOf(id) < 0) c.picks = [];
      toggle(c.picks, id, c.seats);
      if (c.picks.length) c.undecided = false;
      return '';
    };
  }
  function undecidedFn(c) { c.undecided = !c.undecided; if (c.undecided) c.picks = []; return ''; }
  function compareFn(id) { return function (c) { toggle(c.compare, id, 12); return ''; }; }

  // ---- controls
  var views = [];          // { def, bar|null, rows:[{id,pick,cmp}], status, undec }
  var msgEl = null;

  function statusText(def, c) {
    if (!c) return 'Nothing chosen yet.';
    if (c.undecided) return 'You marked this undecided.';
    if (!c.picks.length) return 'Nothing chosen yet.';
    var names = c.picks.map(function (id) { var o = def.options.filter(function (x) { return x.id === id; })[0]; return o ? o.label : id; });
    return 'Your pick: ' + names.join(', ') + '.';
  }
  function mkBar(def, intro) {
    var bar = el('div', 'bp-bar');
    bar.appendChild(el('span', 'bp-tag', 'My Ballot'));
    if (intro) bar.appendChild(el('span', 'bp-intro', intro));
    var status = el('span', 'bp-status'); status.setAttribute('aria-live', 'polite');
    var undec = btn('bp-btn', 'Not sure yet'); undec.setAttribute('aria-pressed', 'false');
    undec.addEventListener('click', function () { change(def, undecidedFn); });
    var v = { def: def, bar: bar, rows: [], status: status, undec: undec };
    bar.appendChild(status); bar.appendChild(undec);
    bar.appendChild(el('span', 'bp-priv', 'Saved only in this browser.'));
    views.push(v);
    return v;
  }
  function addRowControls(v, id, host) {
    var span = el('span', 'bp-ctl');
    var p = btn('bp-btn', 'Pick'); p.setAttribute('aria-pressed', 'false');
    var c = btn('bp-btn', 'Compare'); c.setAttribute('aria-pressed', 'false');
    var o = v.def.options.filter(function (x) { return x.id === id; })[0];
    var who = o ? o.label : id;
    p.setAttribute('aria-label', 'Pick ' + who + ' for ' + v.def.title);
    c.setAttribute('aria-label', 'Add ' + who + ' to my comparison for ' + v.def.title);
    p.addEventListener('click', function () { change(v.def, pickFn(id)); });
    c.addEventListener('click', function () { change(v.def, compareFn(id)); });
    span.appendChild(p); span.appendChild(c);
    host.appendChild(span);
    v.rows.push({ id: id, pick: p, cmp: c });
  }

  function render(msg) {
    var d = WB.read(ST);
    views.forEach(function (v) {
      var c = d.contests[v.def.key];
      v.rows.forEach(function (r) {
        var on = !!c && c.picks.indexOf(r.id) >= 0, cm = !!c && c.compare.indexOf(r.id) >= 0;
        r.pick.setAttribute('aria-pressed', on ? 'true' : 'false'); r.pick.textContent = on ? 'Picked ✓' : 'Pick';
        r.cmp.setAttribute('aria-pressed', cm ? 'true' : 'false'); r.cmp.textContent = cm ? 'In comparison ✓' : 'Compare';
      });
      v.undec.setAttribute('aria-pressed', c && c.undecided ? 'true' : 'false');
      v.status.textContent = statusText(v.def, c);
    });
    // facts
    factBtns.forEach(function (f) {
      var on = !!d.facts[f.id];
      f.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      f.btn.textContent = on ? 'Saved ✓' : '＋ Save';
    });
    var n = WB.count(d);
    if (dockLink) dockLink.textContent = 'My Ballot' + (n ? ' (' + n + ')' : '');
    if (msgEl) msgEl.textContent = msg || '';
    if (!WB.stored() && msgEl) msgEl.textContent = 'Your browser would not save this (private mode?). Nothing was kept.';
  }

  // ---- page setup per kind
  var racePromise = null;     // candidate pages: resolves to the contest this candidate is in (or null)
  var raceLink = '';

  if (KIND === 'race') {
    parseRace(document, location.href, PAGE).forEach(function (def) {
      if (!def.options.length) return;
      var ul = def.ul; delete def.ul;
      var v = mkBar(def, def.seats > 1 ? 'Pick up to ' + def.seats + '.' : 'Pick one.');
      ul.parentNode.insertBefore(v.bar, ul);
      Array.prototype.forEach.call(ul.querySelectorAll(':scope > li'), function (li) {
        var a = li.querySelector('a[href]'); if (!a) return;
        var id = (/\/([a-z0-9-]+)\.html$/.exec(a.getAttribute('href')) || [])[1];
        if (id) addRowControls(v, id, li);
      });
    });
  } else if (KIND === 'measure') {
    var yesno = main.querySelector('.yesno');
    var def = measureDef();
    var v = mkBar(def, 'How would you vote?');
    ['yes', 'no'].forEach(function (id) {
      var b = btn('bp-btn', id === 'yes' ? 'Yes' : 'No'); b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'I would vote ' + id + ' on ' + def.title);
      b.addEventListener('click', function () { change(def, pickFn(id)); });
      v.bar.insertBefore(b, v.undec);
      v.rows.push({ id: id, pick: b, cmp: el('span') });
    });
    var anchor = main.querySelector('.fulltext-link') || main.querySelector('.meta') || main.querySelector('h1');
    anchor.parentNode.insertBefore(v.bar, anchor.nextSibling);
    void yesno;
  } else if (KIND === 'candidate') {
    var ra = main.querySelector('.eyebrow a[href*="races/"]');
    if (ra) {
      raceLink = new URL(ra.getAttribute('href'), location.href).href;
      var barHost = el('div', 'bp-bar bp-wait'); barHost.appendChild(el('span', 'bp-tag', 'My Ballot'));
      barHost.appendChild(el('span', 'bp-status', 'Looking up this race…'));
      var after = main.querySelector('.meta') || main.querySelector('h1');
      after.parentNode.insertBefore(barHost, after.nextSibling);
      racePromise = fetch(raceLink, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
        var doc = new DOMParser().parseFromString(t, 'text/html');
        var rs = (/\/races\/([a-z0-9-]+)\.html$/.exec(new URL(raceLink).pathname) || [])[1];
        var defs = parseRace(doc, raceLink, rs || '');
        var mine = defs.filter(function (c) { return c.options.some(function (o) { return o.id === PAGE; }); })[0];
        if (!mine) throw 0;
        delete mine.ul;
        return mine;
      }).catch(function () { return null; });
      racePromise.then(function (def) {
        if (!def) {
          barHost.replaceChildren(el('span', 'bp-tag', 'My Ballot'));
          var a = el('a', '', 'Pick this person on the race page'); a.href = raceLink; barHost.appendChild(a);
          return;
        }
        barHost.remove();
        var v = mkBar(def, def.title + '.');
        after.parentNode.insertBefore(v.bar, after.nextSibling);
        var line = el('span', 'bp-ctl');
        var pb = btn('bp-btn', 'Pick'); pb.setAttribute('aria-pressed', 'false');
        var cb = btn('bp-btn', 'Compare'); cb.setAttribute('aria-pressed', 'false');
        pb.setAttribute('aria-label', 'Pick ' + txt(main.querySelector('h1')) + ' for ' + def.title);
        cb.setAttribute('aria-label', 'Add ' + txt(main.querySelector('h1')) + ' to my comparison');
        pb.addEventListener('click', function () { change(def, pickFn(PAGE)); });
        cb.addEventListener('click', function () { change(def, compareFn(PAGE)); });
        line.appendChild(pb); line.appendChild(cb);
        v.bar.insertBefore(line, v.status);
        v.rows.push({ id: PAGE, pick: pb, cmp: cb });
        render();
      });
    }
  }

  // ---- saving facts (a bullet, a table row, a paragraph, or highlighted text)
  var factBtns = [];
  var SEL = 'ul.sourced > li, .lede, section > p:not(.note):not(.meta):not(.fulltext-link), .yesno > div > p, dl.facts > dd, .tablewrap tbody tr, details > p';
  function sourceOf(node) {
    var a = node.querySelector && node.querySelector('a.src[href^="http"]');
    if (!a && node.closest) { var s = node.closest('section'); a = s && s.querySelector('a.src[href^="http"]'); if (a && node.closest('li,tr,p,dd') && !node.contains(a)) a = null; }
    if (!a) return { url: '', label: '' };
    return { url: a.href, label: txt(a).replace(/^source:\s*/i, '') };
  }
  function factText(node) {
    var c = node.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.bp-save, .bp-ctl, a.src, .src'), function (x) { x.remove(); });
    if (node.tagName === 'TR') {
      var table = node.closest('table'), heads = table ? Array.prototype.map.call(table.querySelectorAll('thead th'), txt) : [];
      return Array.prototype.map.call(c.querySelectorAll('td, th'), function (td, i) { return (heads[i] ? heads[i] + ': ' : '') + txt(td); }).join(' · ');
    }
    if (node.tagName === 'DD') { var dt = node.previousElementSibling; return (dt && dt.tagName === 'DT' ? txt(dt) + ': ' : '') + txt(c); }
    return txt(c);
  }
  function subject() {
    if (KIND === 'candidate') return { subject: PAGE, label: txt(main.querySelector('h1')), contest: '' };
    if (KIND === 'measure') return { subject: '', label: '', contest: 'measure:' + PAGE };
    return { subject: '', label: '', contest: '' };
  }
  function saveFact(text, src, kind, id) {
    var s = subject();
    var go = function (contestKey) {
      var d = WB.read(ST);
      if (d.facts[id]) { delete d.facts[id]; WB.write(WB.clean(d, ST)); render(); return; }
      d.facts[id] = { id: id, kind: kind, text: text, contest: contestKey || s.contest, subject: s.subject, subjectLabel: s.label,
        pageUrl: location.pathname, pageTitle: h1Text(document), srcUrl: src.url, srcLabel: src.label, print: true, compare: true, side: '', note: '', ts: Date.now() };
      WB.write(WB.clean(d, ST));
      render('Saved. Open My Ballot to print it or add it to a comparison.');
    };
    if (racePromise) racePromise.then(function (def) {
      if (def) { var d = WB.read(ST); merged(d, def); WB.write(WB.clean(d, ST)); }
      go(def ? def.key : '');
    }); else go('');
  }
  Array.prototype.forEach.call(main.querySelectorAll(SEL), function (node) {
    if (node.closest('.bp-bar, .waybar, nav')) return;
    var text = factText(node);
    if (text.length < 12 || text.length > WB.LIMITS.text) return;
    var id = WB.factId(location.pathname, text);
    var b = btn('bp-save', '＋ Save', 'Save this to My Ballot: ' + text.slice(0, 70));
    b.setAttribute('aria-pressed', 'false');
    var src = sourceOf(node);
    b.addEventListener('click', function () { saveFact(text, src, 'item', id); });
    var host = node.tagName === 'TR' ? (node.lastElementChild || node) : node;
    host.appendChild(document.createTextNode(' '));
    host.appendChild(b);
    factBtns.push({ id: id, btn: b });
  });

  // ---- dock: link to the planner, status line, and "save highlighted text"
  var dock = el('div', 'bp-dock');
  dock.setAttribute('role', 'region'); dock.setAttribute('aria-label', 'My Ballot');
  var dockLink = el('a', 'bp-open', 'My Ballot'); dockLink.href = '/members/my-ballot.html?state=' + ST;
  var hl = btn('bp-hl', 'Save highlighted text'); hl.hidden = true;
  msgEl = el('span', 'bp-msg'); msgEl.setAttribute('role', 'status');
  dock.appendChild(msgEl); dock.appendChild(hl); dock.appendChild(dockLink);
  document.body.appendChild(dock);

  var pending = null;
  document.addEventListener('selectionchange', function () {
    var s = window.getSelection(), t = s && !s.isCollapsed ? s.toString().replace(/(＋ Save|Saved ✓)/g, '').replace(/\s+/g, ' ').trim() : '';
    var node = s && s.rangeCount ? s.getRangeAt(0).commonAncestorContainer : null;
    if (node && node.nodeType === 3) node = node.parentNode;
    if (t.length >= 8 && node && main.contains(node) && !node.closest('.bp-bar, .bp-dock, .bp-save')) {
      pending = { text: t.slice(0, WB.LIMITS.text), src: sourceOf(node.closest('li, p, tr, dd') || node) };
      hl.hidden = false;
    } else { pending = null; hl.hidden = true; }
  });
  hl.addEventListener('mousedown', function (e) { e.preventDefault(); });
  hl.addEventListener('click', function () {
    if (!pending) return;
    var p = pending, id = WB.factId(location.pathname, p.text);
    var d = WB.read(ST);
    if (d.facts[id]) { render('Already saved.'); return; }
    saveFact(p.text, p.src, 'highlight', id);
    var s = window.getSelection(); if (s) s.removeAllRanges();
  });
  document.addEventListener('theway-ballot', function () { render(); });
  window.addEventListener('storage', function () { render(); });
  render();
})();
