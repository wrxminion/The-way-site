// The Way: My Ballot planner (my-ballot.html). Your picks, saved facts, a side-by-side comparison for races you have
// not decided, and a printable sheet. The plan lives in this browser's localStorage (ballot-store.js).
// Nothing is sent anywhere unless you press one of two clearly labelled buttons:
//   1. "Save to my account" (signed-in members only): your own row in public.ballot_plans, owner-only.
//   2. "Share my picks" (anyone, separate and optional): state + contest ids + choice ids only, no account, no facts, no notes.
// The Supabase files are loaded only when one of those panels is used.
(function () {
  'use strict';
  var WB = window.WayBallot;
  var app = document.getElementById('app');
  if (!WB) { app.textContent = 'Could not load. Try reloading the page.'; return; }
  var cfg = null, sbLib = null;
  var qs = new URLSearchParams(location.search);
  var ST = (qs.get('state') || '').toUpperCase();
  var ui = { defs: {}, open: {}, all: null, notice: null, includeNotes: true, includeCompare: true, includeFacts: true, ack: false, busy: false, shareMsg: null, acctMsg: null, session: undefined };

  function h(tag, attrs) {
    var n = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2), k;
    for (k in (attrs || {})) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.forEach(function add(x) { if (Array.isArray(x)) x.forEach(add); else if (x != null && x !== false) n.append(x instanceof Node ? x : document.createTextNode(String(x))); });
    return n;
  }
  function dayLong() { return new Date().toLocaleDateString(undefined, { dateStyle: 'long' }); }
  function guideBase(st) { return '/preview/pages/guide' + (st === 'CO' ? '' : '-' + st.toLowerCase()) + '/'; }
  function optLabel(c, id) { var o = c.options.filter(function (x) { return x.id === id; })[0]; return o ? o.label : id; }
  function link(href, text, ext) { return h('a', { href: href, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null, text: text }); }

  // ---- data helpers
  function touched(d) {
    return Object.keys(d.contests).map(function (k) { return d.contests[k]; })
      .filter(function (c) { return c.picks.length || c.undecided || c.compare.length || c.note || Object.keys(c.leans || {}).length || Object.keys(c.ranks || {}).length || Object.keys(c.whys || {}).length || c.why; })
      .sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'race' ? -1 : 1) || (a.title < b.title ? -1 : 1); });
  }
  function contestOf(d, f) {
    if (f.contest && d.contests[f.contest]) return d.contests[f.contest];
    if (f.subject) {
      var ks = Object.keys(d.contests);
      for (var i = 0; i < ks.length; i++) if (d.contests[ks[i]].options.some(function (o) { return o.id === f.subject; })) return d.contests[ks[i]];
    }
    return null;
  }
  function factList(d) { return Object.keys(d.facts).map(function (k) { return d.facts[k]; }).sort(function (a, b) { return a.ts - b.ts; }); }
  function update(fn, msg) {
    var d = WB.read(ST); fn(d); WB.write(WB.clean(d, ST));
    ui.notice = msg ? { cls: 'ok', text: msg } : null;
    draw();
  }
  var LEAN = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
  // "My leanings: 1. Name (Yes), 2. Name (Maybe), Name (No)" in rank order, then the unranked.
  function leanLine(c) {
    var ids = Object.keys(c.leans || {}).concat(Object.keys(c.ranks || {}).filter(function (k) { return !(c.leans || {})[k]; }));
    if (!ids.length) return '';
    var rk = c.ranks || {};
    ids.sort(function (a, b) { return (rk[a] || 999) - (rk[b] || 999) || (a < b ? -1 : 1); });
    return 'My leanings (private): ' + ids.map(function (id) { return (rk[id] ? rk[id] + '. ' : '') + optLabel(c, id) + ((c.leans || {})[id] ? ' (' + LEAN[c.leans[id]] + ')' : ''); }).join('; ') + '.';
  }
  // The reasons, on the sheet: "Why: text" for a measure, "Why (Name): text" for each candidate.
  function whyLines(c) {
    var out = [];
    if (c.why) out.push('Why: ' + c.why);
    Object.keys(c.whys || {}).forEach(function (id) { out.push('Why (' + optLabel(c, id) + '): ' + c.whys[id]); });
    return out;
  }
  function choiceText(c) {
    if (c.picks.length) return c.picks.map(function (id) { return optLabel(c, id); }).join(', ');
    return c.undecided ? 'Undecided' : 'Not chosen yet';
  }

  // ---- fact blocks (used on screen and on the sheet)
  function sourceLink(f) {
    return f.srcUrl ? [' ', link(f.srcUrl, 'source: ' + (f.srcLabel || new URL(f.srcUrl).hostname), true)] : null;
  }
  function factLine(f, showWho) {
    return h('li', { class: 'mb-fact' },
      showWho && f.subjectLabel ? h('b', { text: f.subjectLabel + ': ' }) : null,
      f.text, sourceLink(f),
      f.note && ui.includeNotes ? h('span', { class: 'mb-note-print', text: ' My note: ' + f.note }) : null);
  }

  // ---- comparison
  function compareColumns(d, c, facts) {
    if (c.kind === 'measure') {
      var cols = [{ label: 'Weighs toward Yes', facts: [] }, { label: 'Weighs toward No', facts: [] }, { label: 'Not sorted yet', facts: [] }];
      facts.forEach(function (f) { cols[f.side === 'yes' ? 0 : f.side === 'no' ? 1 : 2].facts.push(f); });
      return cols.filter(function (x) { return x.facts.length; });
    }
    var ids = c.compare.slice();
    facts.forEach(function (f) { if (f.subject && ids.indexOf(f.subject) < 0) ids.push(f.subject); });
    return ids.map(function (id) {
      var o = c.options.filter(function (x) { return x.id === id; })[0];
      var mine = [(c.leans || {})[id] ? 'My lean: ' + LEAN[c.leans[id]] : '', (c.ranks || {})[id] ? 'rank ' + c.ranks[id] : ''].filter(Boolean).join(' · ');
      return { label: o ? o.label : id, sub: o ? o.sub : '', mine: mine, url: o ? o.url : '', facts: facts.filter(function (f) { return f.subject === id; }) };
    });
  }
  function compareBlock(d, c) {
    var facts = factList(d).filter(function (f) { return f.compare && contestOf(d, f) === c; });
    var cols = compareColumns(d, c, facts);
    var head = h('h3', {}, c.url ? link(c.url, c.title) : c.title, ' ', h('span', { class: 'tag', text: choiceText(c) }));
    if (!cols.length) {
      return h('div', { class: 'mb-cmp' }, head, h('p', { class: 'muted small' }, 'Nothing to compare yet. Use the Compare button on a candidate, or save facts, on ', c.url ? link(c.url, 'the page for this race') : 'its page', '.'));
    }
    return h('div', { class: 'mb-cmp' }, head,
      h('table', { class: 'mb-table' },
        h('thead', {}, h('tr', {}, cols.map(function (col) {
          return h('th', { scope: 'col' }, col.url ? link(col.url, col.label) : col.label, col.sub ? h('span', { class: 'mb-sub', text: col.sub }) : null, col.mine ? h('span', { class: 'mb-sub', text: col.mine }) : null);
        }))),
        h('tbody', {}, h('tr', {}, cols.map(function (col) {
          return h('td', { 'data-label': col.label },
            col.facts.length ? h('ul', { class: 'mb-facts' }, col.facts.map(function (f) { return factLine(f, false); })) : h('p', { class: 'muted small', text: 'No facts saved yet.' }));
        })))));
  }

  // ---- sections
  function privacy() {
    return h('section', { class: 'panel mb-priv noprint' },
      h('h2', { text: 'Who can see this' }),
      h('ul', { class: 'mb-plain' },
        h('li', {}, h('b', { text: 'Only you, by default. ' }), 'Your picks, facts and notes are kept in this browser on this device. They are not sent to our servers and we cannot see them. You do not need an account.'),
        h('li', {}, h('b', { text: 'If you clear your browser data, or use another device, they are gone. ' }), 'To keep them, download a backup below, or (if you are a member) save a copy to your account.'),
        h('li', {}, h('b', { text: 'Two buttons send something, and only when you press them. ' }), 'Save to my account (members) stores your plan so only you can read it. Share my picks (anyone) sends your state and your choices, nothing else, as one anonymous answer in a combined count. Both are explained below.'),
        h('li', {}, h('b', { text: 'This is not your ballot. ' }), 'Vote on the official ballot you receive. The Way takes no side on any race or measure; picking here is your own note to yourself.')));
  }

  function statePicker(have) {
    var sel = h('select', { id: 'mb-state', 'aria-label': 'State' },
      Object.keys(WB.STATES).map(function (c) { return h('option', { value: c, selected: c === ST, text: WB.STATES[c] + (have.indexOf(c) >= 0 ? ' (saved)' : '') }); }));
    sel.addEventListener('change', function () { ST = sel.value; history.replaceState(null, '', '?state=' + ST); ui.notice = null; ui.acctMsg = null; ui.shareMsg = null; ui.defs = {}; ui.open = {}; ui.all = null; draw(); });
    return h('div', { class: 'mb-state noprint' }, h('label', { for: 'mb-state', text: 'State' }), sel,
      h('a', { class: 'button', href: guideBase(ST), text: 'Open the ' + WB.STATES[ST] + ' voter guide' }));
  }


  // ---- the marking screen: every race and measure, with picks and a note, all saved in this browser
  var MARKS = 'theway.mymarks.v1';
  function handoff() {
    try {
      var j = JSON.parse(sessionStorage.getItem(MARKS) || 'null');
      if (!j || j.state !== ST || !Array.isArray(j.items)) return [];
      return j.items.filter(function (i) { return i && /^\/preview\/pages\/guide(-[a-z]{2})?\/(races|measures|local\/m)\/[a-z0-9-]+\.html$/.test(i.p); }).slice(0, 80);
    } catch (e) { return []; }
  }
  function slugOf(p) { return (/\/([a-z0-9-]+)\.html$/.exec(p) || [])[1] || ''; }
  function defsFor(path) {
    var e = ui.defs[path];
    if (e === undefined) {
      ui.defs[path] = 'loading';
      fetch(path, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
        var doc = new DOMParser().parseFromString(t, 'text/html'), kind = /\/(measures|local\/m)\//.test(path) ? 'measure' : 'race';
        var defs = kind === 'measure' ? [WB.parseMeasure(doc, slugOf(path), path)] : WB.parseRace(doc, location.origin + path, slugOf(path));
        defs.forEach(function (x) { delete x.ul; });
        ui.defs[path] = defs.filter(function (x) { return x.options.length; });
      }).catch(function () { ui.defs[path] = 'error'; }).then(draw);
    }
    return ui.defs[path];
  }
  function mergeDef(d, def) {
    var c = d.contests[def.key] || { picks: [], undecided: false, compare: [], note: '' };
    d.contests[def.key] = { key: def.key, kind: def.kind, title: def.title, url: def.url, seats: def.seats, options: def.options, picks: c.picks, undecided: c.undecided, compare: c.compare, note: c.note || '', why: c.why || '', leans: c.leans || {}, ranks: c.ranks || {}, whys: c.whys || {} };
    return d.contests[def.key];
  }
  function markForm(d, def) {
    var c = d.contests[def.key] || { picks: [], undecided: false, compare: [], note: '' };
    var multi = def.seats > 1, group = 'mk-' + def.key;
    var opts = def.options.map(function (o) {
      var on = c.picks.indexOf(o.id) >= 0;
      var i = h('input', { type: multi ? 'checkbox' : 'radio', name: group, checked: on, 'data-k': def.key + o.id });
      i.addEventListener('change', function () {
        update(function (x) {
          var k = mergeDef(x, def);
          if (multi) { var at = k.picks.indexOf(o.id); if (at >= 0) k.picks.splice(at, 1); else if (k.picks.length < k.seats) k.picks.push(o.id); }
          else k.picks = [o.id];
          if (k.picks.length) k.undecided = false;
        });
      });
      var cm = h('input', { type: 'checkbox', checked: c.compare.indexOf(o.id) >= 0, 'data-k': def.key + o.id + 'c' });
      cm.addEventListener('change', function () { update(function (x) { var k = mergeDef(x, def), at = k.compare.indexOf(o.id); if (at >= 0) k.compare.splice(at, 1); else k.compare.push(o.id); }); });
      var lean = null, rank = null;
      if (def.kind === 'race') {
        lean = h('select', { 'aria-label': 'Would you vote for ' + o.label + '?', 'data-k': def.key + o.id + 'l' },
          [['', 'Not answered'], ['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']].map(function (x) { return h('option', { value: x[0], selected: (c.leans || {})[o.id] === x[0] || (!(c.leans || {})[o.id] && x[0] === ''), text: x[1] }); }));
        lean.addEventListener('change', function () { update(function (x) { var k = mergeDef(x, def); if (lean.value) k.leans[o.id] = lean.value; else delete k.leans[o.id]; }); });
        rank = h('input', { type: 'number', min: 1, max: 99, step: 1, inputmode: 'numeric', class: 'mk-rank', 'aria-label': 'Your ranking number for ' + o.label + ' in this race (1 is first)', placeholder: '#', 'data-k': def.key + o.id + 'r' });
        if ((c.ranks || {})[o.id]) rank.value = c.ranks[o.id];
        rank.addEventListener('change', function () { update(function (x) { var k = mergeDef(x, def), n = parseInt(rank.value, 10); if (n >= 1 && n <= 99) k.ranks[o.id] = n; else delete k.ranks[o.id]; }); });
      }
      var pn = null;
      if (def.kind === 'race') {
        var cur = (c.whys || {})[o.id] || '';
        var ta = h('textarea', { rows: 2, maxlength: WB.LIMITS.note, placeholder: on || (c.leans || {})[o.id] ? 'Why this pick? (optional, just for you)' : 'Why you lean this way (optional, just for you)', 'aria-label': 'Your reason for ' + o.label, 'data-k': def.key + o.id + 'n' });
        ta.value = cur;
        ta.addEventListener('change', function () { update(function (x) { var k = mergeDef(x, def); if (ta.value.trim()) k.whys[o.id] = ta.value; else delete k.whys[o.id]; }); });
        pn = h('details', { class: 'mk-pnote' }, h('summary', { text: cur ? 'Why \u2713' : 'Add why' }), ta);
        if (cur) pn.open = true;
      }
      return h('li', { class: 'mk-opt' },
        h('label', { class: 'mb-check mk-name' }, i, h('span', {}, h('b', { text: o.label }), o.sub ? h('span', { class: 'mb-sub', text: o.sub }) : null)),
        lean ? h('div', { class: 'mk-lean' }, h('span', { class: 'mk-q', text: 'Would you vote for this person?' }), lean, h('label', { class: 'mk-rk' }, h('span', { text: 'Rank' }), rank)) : null,
        def.kind === 'race' ? h('label', { class: 'mb-check mk-cmp' }, cm, h('span', { text: 'Compare' })) : null,
        o.url ? link(o.url, 'facts', false) : null,
        pn);
    });
    var un = h('input', { type: 'checkbox', checked: c.undecided, 'data-k': def.key + 'u' });
    un.addEventListener('change', function () { update(function (x) { var k = mergeDef(x, def); k.undecided = un.checked; if (un.checked) k.picks = []; }); });
    var why = null;
    if (def.kind === 'measure') {
      why = h('textarea', { rows: 2, maxlength: WB.LIMITS.note, placeholder: 'Why this pick? (optional, just for you)', 'aria-label': 'Your reason for ' + def.title, 'data-k': def.key + 'w' });
      why.value = c.why || '';
      why.addEventListener('change', function () { var d3 = WB.read(ST), k3 = mergeDef(d3, def); k3.why = why.value; WB.write(WB.clean(d3, ST)); });
    }
    var note = h('textarea', { rows: 2, maxlength: WB.LIMITS.note, placeholder: 'Notes for this ' + (def.kind === 'measure' ? 'measure' : 'race') + ' (only on this device). Text you save from guide pages shows on your sheet too.', 'aria-label': 'Your notes for ' + def.title });
    note.value = c.note || '';
    note.addEventListener('change', function () { var d2 = WB.read(ST), k = mergeDef(d2, def); k.note = note.value; WB.write(WB.clean(d2, ST)); });
    return h('div', { class: 'mk-form' },
      h('h4', { class: 'mk-title', text: def.title }), h('p', { class: 'mb-ft' }, multi ? '(pick up to ' + def.seats + ')' : '(pick one)', ' ', def.url ? link(def.url, 'open the guide page') : null),
      h('ul', { class: 'mk-opts' }, opts),
      h('label', { class: 'mb-check' }, un, h('span', { text: 'Not sure yet' })),
      why,
      note);
  }
  // What is already saved for a race or measure page, in a few words, so a collapsed row shows it without opening.
  // the saved contests that belong to one race or measure page
  function contestsOf(d, it) {
    var slug = (/\/([a-z0-9-]+)\.html$/.exec(it.p) || [])[1];
    return Object.keys(d.contests).filter(function (k) {
      var c = d.contests[k];
      return c.url === it.p || (slug && (k === 'race:' + slug || k === 'measure:' + slug || k.indexOf('race:' + slug + ':') === 0));
    }).map(function (k) { return d.contests[k]; });
  }
  function glance(d, it) {
    var out = [], noted = false, why = false;
    contestsOf(d, it).forEach(function (c) {
      if (c.picks.length) out.push('Your pick: ' + c.picks.map(function (id) { return optLabel(c, id); }).join(', '));
      else {
        var L = Object.keys(c.leans || {}).map(function (id) { return optLabel(c, id) + ' ' + ({ yes: 'Yes', maybe: 'Maybe', no: 'No' })[c.leans[id]]; });
        if (L.length) out.push('Leaning: ' + L.join(', '));
        else if (c.undecided) out.push('Not sure yet');
      }
      if (c.why || Object.keys(c.whys || {}).length) why = true;
      if (c.note || Object.keys(d.facts).some(function (id) { return contestOf(d, d.facts[id]) === c; })) noted = true;
    });
    if (why) out.push('Why');
    if (noted) out.push('Notes');
    return out.join(' · ');
  }
  // Clear my choice / Remove from my ballot, for whatever is saved on this race or measure
  function rowActions(d, it) {
    var cs = contestsOf(d, it);
    if (!cs.length) return null;
    var picked = cs.some(function (c) { return c.picks.length || c.undecided || Object.keys(c.leans || {}).length || Object.keys(c.ranks || {}).length; });
    function each(fn) { update(function (x) { contestsOf(x, it).forEach(fn); }); }
    return h('div', { class: 'btns' },
      picked ? h('button', { class: 'quiet', type: 'button', text: 'Clear my choice', onclick: function () { each(function (k) { k.picks = []; k.undecided = false; k.leans = {}; k.ranks = {}; }); } }) : null,
      h('button', { class: 'quiet', type: 'button', text: 'Remove from my ballot', onclick: function () { update(function (x) { contestsOf(x, it).forEach(function (k) { delete x.contests[k.key]; }); }); } }));
  }
  function markRow(d, it) {
    var open = !!ui.open[it.p], defs = open ? defsFor(it.p) : (Array.isArray(ui.defs[it.p]) ? ui.defs[it.p] : null);
    var chosen = Array.isArray(defs) && defs.length ? defs.map(function (x) { var c = d.contests[x.key]; return c ? choiceText(c) : 'Not chosen yet'; }).join(' · ') : null;
    var saved = glance(d, it);
    if (saved) chosen = saved;
    var b = h('button', { type: 'button', class: 'quiet', 'aria-expanded': open ? 'true' : 'false', 'data-k': 'mk' + it.p, text: open ? 'Close' : 'Mark' });
    b.addEventListener('click', function () { ui.open[it.p] = !ui.open[it.p]; draw(); });
    return h('li', {},
      h('div', { class: 'row' }, h('strong', { class: 'mk-race', text: it.t }), chosen ? h('span', { class: 'tag', text: chosen }) : null, b),
      open ? (defs === 'loading' || defs === undefined ? h('p', { class: 'muted small', text: 'Loading…' })
        : defs === 'error' ? h('p', { class: 'muted small' }, 'Could not load this page. ', link(it.p, 'Open it in the guide'), ' and use the My Ballot buttons there.')
        : defs.map(function (x) { return markForm(d, x); })) : null,
      open ? rowActions(d, it) : null);
  }
  function loadAll() {
    ui.all = 'loading'; draw();
    var b = guideBase(ST), items = [];
    function parse(path, kind) {
      return fetch(path, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
        var doc = new DOMParser().parseFromString(t, 'text/html'), head = '';
        doc.querySelectorAll('main h2, main ul.cards a, main ul.grid a').forEach(function (n) {
          if (n.tagName === 'H2') { head = WB.txt(n); return; }
          var p; try { p = new URL(n.getAttribute('href'), location.origin + path).pathname; } catch (e) { return; }
          if (!/\/(races|measures)\/[a-z0-9-]+\.html$/.test(p) || /\/index\.html$/.test(p)) return;
          var name = WB.txt(n);
          items.push({ p: p, t: kind === 'race' && /^District/i.test(name) && head ? head + ': ' + name : name });
        });
      });
    }
    Promise.all([parse(b + 'measures/index.html', 'measure'), parse(b + 'races/index.html', 'race')]).then(function () { ui.all = items; }).catch(function () { ui.all = items.length ? items : 'error'; }).then(draw);
  }
  function markPanel(d) {
    var mine = handoff(), kids = [], seen = {};
    mine.forEach(function (i) { seen[i.p] = true; });
    var extra = touched(d).filter(function (c) { return c.url && !seen[c.url] && !mine.some(function (i) { return contestsOf(d, i).indexOf(c) >= 0; }); })
      .filter(function (c) { if (seen[c.url]) return false; seen[c.url] = true; return true; })
      .map(function (c) { return { p: c.url, t: c.title }; });
    kids.push(h('h2', { text: 'Mark your ballot' }),
      h('p', { class: 'muted' }, 'This is where you choose, and keep a note for each race and measure. Open one, pick, write a note if you like. Your Yes, Maybe, No and ranking numbers are private notes to yourself: nothing is totaled, scored or shown to anyone. Everything saves in this browser as you go. Nothing is sent to us.'));
    if (mine.length) {
      kids.push(h('h3', { text: 'Your ballot (from the spot you picked on the map)' }),
        h('ul', { class: 'list' }, mine.map(function (i) { return markRow(d, { p: i.p, t: i.t || slugOf(i.p) }); })));
    }
    if (extra.length) {
      kids.push(h('h3', { text: mine.length ? 'Also on your plan' : 'Your plan so far' }),
        h('ul', { class: 'list' }, extra.map(function (i) { return markRow(d, i); })));
    }
    if (!mine.length && !extra.length) {
      kids.push(h('p', { class: 'notice warn' }, 'Not sure which races are yours? ', link('/preview/pages/states/', 'Pick your state or enter your address'), ' on the map and press "Open my ballot". Your own races will be listed here. Until then you can open any race below.'));
    }
    kids.push(h('h3', { text: 'Every race and measure in ' + WB.STATES[ST] }));
    if (ui.all === 'loading') kids.push(h('p', { class: 'muted', text: 'Loading the list…' }));
    else if (ui.all === 'error') kids.push(h('p', { class: 'muted' }, 'Could not load the list. ', link(guideBase(ST), 'Open the voter guide'), '.'));
    else if (Array.isArray(ui.all)) kids.push(h('ul', { class: 'list' }, ui.all.map(function (i) { return markRow(d, i); })));
    else kids.push(h('div', { class: 'btns' }, h('button', { type: 'button', id: 'mk-all', onclick: loadAll, text: 'Show every race and measure' })));
    return h('section', { class: 'panel noprint', id: 'mark' }, kids);
  }

  function factCard(d, f) {
    var c = contestOf(d, f), k = f.id;
    function set(prop, val) { update(function (x) { if (x.facts[k]) x.facts[k][prop] = val; }); }
    var ck = function (prop, text) {
      var i = h('input', { type: 'checkbox', 'data-k': k + prop, checked: f[prop] }); i.addEventListener('change', function () { set(prop, i.checked); });
      return h('label', { class: 'mb-check' }, i, h('span', { text: text }));
    };
    var side = null;
    if (c && c.kind === 'measure') {
      var s = h('select', { 'aria-label': 'This fact weighs toward', 'data-k': k + 'side' },
        [['', 'Not sorted'], ['yes', 'Weighs toward Yes'], ['no', 'Weighs toward No']].map(function (o) { return h('option', { value: o[0], selected: f.side === o[0], text: o[1] }); }));
      s.addEventListener('change', function () { set('side', s.value); });
      side = s;
    }
    var note = h('textarea', { rows: 2, maxlength: WB.LIMITS.note, placeholder: 'Your own note (only on this device)', 'aria-label': 'Your note on this fact' });
    note.value = f.note;
    note.addEventListener('change', function () { var d2 = WB.read(ST); if (d2.facts[k]) { d2.facts[k].note = note.value; WB.write(WB.clean(d2, ST)); } });
    return h('li', { class: 'mb-card' },
      h('p', { class: 'mb-ft' }, f.kind === 'highlight' ? h('span', { class: 'tag', text: 'highlight' }) : null, ' ', f.text, sourceLink(f)),
      h('p', { class: 'muted small' }, (f.subjectLabel ? f.subjectLabel + ' · ' : ''), f.pageUrl ? link(f.pageUrl, f.pageTitle || 'page') : f.pageTitle),
      h('div', { class: 'mb-ctl' }, ck('print', 'Put on my printed sheet'), ck('compare', 'Use in comparison'), side,
        h('button', { class: 'quiet danger', type: 'button', onclick: function () { update(function (x) { delete x.facts[k]; }); }, text: 'Remove' })),
      note);
  }
  function factsPanel(d) {
    var fs = factList(d), groups = {}, order = [];
    fs.forEach(function (f) {
      var c = contestOf(d, f), g = c ? c.title : 'Other pages';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(f);
    });
    return h('section', { class: 'panel noprint' },
      h('h2', { text: 'Facts you saved' }),
      h('p', { class: 'muted small' }, 'Press "＋ Save" next to any bullet, table row or paragraph in the voter guide, or highlight text and press "Save highlighted text". Each fact keeps its source link.'),
      fs.length ? order.map(function (g) { return h('div', {}, h('h3', { text: g }), h('ul', { class: 'mb-cards' }, groups[g].map(function (f) { return factCard(d, f); }))); })
        : h('p', { class: 'muted', text: 'No facts saved yet.' }));
  }
  function comparePanel(d) {
    var cs = touched(d).filter(function (c) { return c.undecided || c.compare.length || factList(d).some(function (f) { return f.compare && contestOf(d, f) === c; }); });
    return h('section', { class: 'panel noprint' },
      h('h2', { text: 'Compare what you have not decided' }),
      h('p', { class: 'muted small' }, 'Races you marked "Not sure yet", or people you added with Compare, appear side by side with the facts you saved. The Way does not rank or recommend anyone.'),
      cs.length ? cs.map(function (c) { return compareBlock(d, c); }) : h('p', { class: 'muted', text: 'Nothing to compare yet.' }));
  }

  function sheet(d) {
    var printable = factList(d).filter(function (f) { return f.print; });
    var cs = touched(d), grabbed = function (c) { return printable.filter(function (f) { return contestOf(d, f) === c; }); };
    var picked = cs.filter(function (c) { return c.picks.length || c.undecided || c.why || Object.keys(c.whys || {}).length || c.note || grabbed(c).length; });
    var cmp = cs.filter(function (c) { return c.undecided || c.compare.length; });
    var opt = function (prop, text) {
      var i = h('input', { type: 'checkbox', checked: ui[prop] }); i.addEventListener('change', function () { ui[prop] = i.checked; draw(); });
      return h('label', { class: 'mb-check' }, i, h('span', { text: text }));
    };
    var gp = {}, gOrder = [];
    printable.filter(function (f) { return picked.indexOf(contestOf(d, f)) < 0; }).forEach(function (f) { var c = contestOf(d, f), g = c ? c.title : (f.pageTitle || 'Other'); if (!gp[g]) { gp[g] = []; gOrder.push(g); } gp[g].push(f); });
    return h('section', { class: 'mb-sheet-wrap' },
      h('div', { class: 'noprint' },
        h('h2', { text: 'Your printable sheet' }),
        h('p', { class: 'muted small' }, 'This is what prints. Links show their full address on paper.'),
        h('div', { class: 'mb-opts' }, opt('includeFacts', 'Facts I marked for printing'), opt('includeCompare', 'Comparison for undecided races'), opt('includeNotes', 'My reasons and notes')),
        h('div', { class: 'btns' }, h('button', { class: 'primary', type: 'button', onclick: function () { window.print(); }, text: 'Print this sheet' }))),
      h('article', { class: 'mb-sheet', 'aria-label': 'Printable ballot sheet' },
        h('h2', { class: 'mb-sheet-title', text: 'My ballot plan: ' + WB.STATES[ST] }),
        h('p', { class: 'mb-sheet-meta', text: 'Made ' + dayLong() + ' at michiinstitute.com. This is my own plan, not an official ballot. I will vote on the ballot I receive.' }),
        picked.length ? h('table', { class: 'mb-table mb-plan' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Race or measure' }), h('th', { scope: 'col', text: 'My pick, my reason, my notes' }))),
          h('tbody', {}, picked.map(function (c) {
            var mine = grabbed(c);
            return h('tr', {}, h('td', { 'data-label': 'Race or measure', text: c.title }), h('td', { 'data-label': 'My choice' }, h('span', { class: 'mb-box', 'aria-hidden': 'true', text: c.picks.length ? '☑' : '☐' }), ' ', choiceText(c), leanLine(c) ? h('span', { class: 'mb-note-print', text: ' ' + leanLine(c) }) : null, ui.includeNotes ? whyLines(c).map(function (t) { return h('div', { class: 'mb-note-print mb-why', text: t }); }) : null,
              ui.includeNotes && c.note ? h('div', { class: 'mb-note-print', text: 'Notes: ' + c.note }) : null,
              ui.includeFacts && mine.length ? h('ul', { class: 'mb-facts mb-grab' }, mine.map(function (f) { return factLine(f, true); })) : null));
          }))) : h('p', { text: 'No choices yet.' }),
        ui.includeCompare && cmp.length ? h('div', {}, h('h3', { text: 'Still deciding' }), cmp.map(function (c) { return compareBlock(d, c); })) : null,
        ui.includeFacts && gOrder.length ? h('div', {}, h('h3', { text: 'Other facts I want with me' }), gOrder.map(function (g) {
          return h('div', {}, h('h4', { text: g }), h('ul', { class: 'mb-facts' }, gp[g].map(function (f) { return factLine(f, true); })));
        })) : null,
        h('p', { class: 'mb-sheet-foot', text: 'Sample ballot and polling places: check your state or county election office. The Way is a nonpartisan research project and takes no side on any candidate or measure.' })));
  }

  // ---- backup, account
  function keepPanel(d) {
    var file = h('input', { type: 'file', accept: 'application/json,.json', id: 'mb-file', class: 'mb-file' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 1000000) { ui.notice = { cls: 'error', text: 'That file is too big to be a My Ballot backup.' }; draw(); return; }
      var r = new FileReader();
      r.onload = function () {
        try {
          var j = JSON.parse(String(r.result)), st = typeof j.state === 'string' && WB.STATES[j.state.toUpperCase()] ? j.state.toUpperCase() : ST;
          var c = WB.clean(j, st);
          if (!WB.count(c)) throw 0;
          ST = st; WB.write(c); history.replaceState(null, '', '?state=' + ST);
          ui.notice = { cls: 'ok', text: 'Backup loaded for ' + WB.STATES[ST] + '.' };
        } catch (e) { ui.notice = { cls: 'error', text: 'That file is not a My Ballot backup.' }; }
        draw();
      };
      r.readAsText(f);
    });
    return h('section', { class: 'panel noprint' },
      h('h2', { text: 'Keep it, move it, or erase it' }),
      h('div', { class: 'btns' },
        h('button', { type: 'button', onclick: function () {
          var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
          var a = h('a', { href: URL.createObjectURL(blob), download: 'my-ballot-' + ST.toLowerCase() + '.json' });
          document.body.appendChild(a); a.click(); a.remove();
        }, text: 'Download a backup (' + ST + ')' }),
        h('label', { class: 'button', for: 'mb-file', text: 'Restore from a backup' }),
        h('button', { type: 'button', class: 'danger', onclick: function () {
          if (!ui.confirmErase) { ui.confirmErase = true; ui.notice = { cls: 'warn', text: 'Press "Erase" again to delete the ' + WB.STATES[ST] + ' plan from this browser. A saved account copy is not touched.' }; draw(); return; }
          ui.confirmErase = false; WB.clear(ST); ui.notice = { cls: 'ok', text: 'Erased from this browser.' }; draw();
        }, text: ui.confirmErase ? 'Erase' : 'Erase from this browser' })),
      file);
  }

  function loadScript(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  function lib() {
    if (sbLib) return sbLib;
    sbLib = (window.THE_WAY_CONFIG ? Promise.resolve() : loadScript('config.js?v=40')).then(function () {
      return window.supabase ? null : loadScript('vendor/supabase-js-2.110.9.js');
    }).then(function () { cfg = window.THE_WAY_CONFIG; if (!cfg || !window.supabase) throw 0; });
    return sbLib;
  }
  var accountClient = null, anonClient = null;
  function acct() { return lib().then(function () { return accountClient || (accountClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } })); }); }
  function anon() { return lib().then(function () { return anonClient || (anonClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })); }); }
  function hasSbKey() { try { for (var i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true; } catch (e) { /* ignore */ } return false; }
  function sbError(e) {
    var m = e && (e.code || '') + ' ' + (e && e.message || '');
    return /42P01|PGRST205|PGRST202|42883|does not exist|schema cache/.test(m) ? 'This part is not switched on yet. Try again after the site update.' : 'That did not work. Nothing was changed. Try again later.';
  }

  function accountPanel(d) {
    var body;
    if (!hasSbKey()) {
      body = h('p', { class: 'muted' }, 'Members can save a copy of this plan to their account to use on another device. ', link('/members/', 'Sign in'), ' to turn it on. It is optional; the browser copy works without it.');
    } else if (ui.session === undefined) {
      body = h('p', { class: 'muted', text: 'Checking your sign-in…' });
      acct().then(function (c) { return c.auth.getSession(); }).then(function (r) { ui.session = r.data && r.data.session ? r.data.session : null; draw(); }).catch(function () { ui.session = null; draw(); });
    } else if (!ui.session) {
      body = h('p', { class: 'muted' }, 'Your sign-in has expired. ', link('/members/', 'Sign in again'), ' to save to your account.');
    } else {
      var uid = ui.session.user.id;
      var run = function (fn) {
        if (ui.busy) return; ui.busy = true;
        acct().then(fn).catch(function (e) { ui.acctMsg = { cls: 'error', text: sbError(e) }; }).then(function () { ui.busy = false; draw(); });
      };
      body = h('div', {},
        h('p', { class: 'muted small' }, 'Stored in your own row of our database. Only you can read it: not other members, moderators or admins. Delete it any time. Only the state shown above is saved or replaced.'),
        h('div', { class: 'btns' },
          h('button', { type: 'button', class: 'primary', onclick: function () {
            run(function (c) { return c.from('ballot_plans').upsert({ member_id: uid, state: ST, plan: d }).then(function (r) { if (r.error) throw r.error; ui.acctMsg = { cls: 'ok', text: 'Saved a copy of your ' + WB.STATES[ST] + ' plan to your account.' }; }); });
          }, text: 'Save to my account' }),
          h('button', { type: 'button', onclick: function () {
            run(function (c) { return c.from('ballot_plans').select('plan').eq('member_id', uid).eq('state', ST).maybeSingle().then(function (r) {
              if (r.error) throw r.error;
              if (!r.data) { ui.acctMsg = { cls: 'warn', text: 'No saved copy for ' + WB.STATES[ST] + '.' }; return; }
              WB.write(WB.clean(r.data.plan, ST)); ui.acctMsg = { cls: 'ok', text: 'Loaded your saved copy. It replaced this browser\'s ' + WB.STATES[ST] + ' plan.' };
            }); });
          }, text: 'Load my saved copy' }),
          h('button', { type: 'button', class: 'danger', onclick: function () {
            run(function (c) { return c.from('ballot_plans').delete().eq('member_id', uid).eq('state', ST).then(function (r) { if (r.error) throw r.error; ui.acctMsg = { cls: 'ok', text: 'Deleted your account copy for ' + WB.STATES[ST] + '.' }; }); });
          }, text: 'Delete my account copy' })));
    }
    return h('section', { class: 'panel noprint' }, h('h2', { text: 'Save to my account (optional)' }), body,
      ui.acctMsg ? h('p', { class: 'notice ' + ui.acctMsg.cls, role: 'status', text: ui.acctMsg.text }) : null);
  }

  // ---- forecasting share
  var SHARE = 'theway.ballot.share.v1';
  function shareState() { try { return JSON.parse(localStorage.getItem(SHARE) || 'null'); } catch (e) { return null; } }
  function newToken() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sharePayload(d) {
    var p = {};
    touched(d).forEach(function (c) { if (c.picks.length) p[c.key] = c.picks.slice(); });
    return p;
  }
  function sharePanel(d) {
    var payload = sharePayload(d), n = Object.keys(payload).length, prev = shareState();
    var ack = h('input', { type: 'checkbox', id: 'mb-ack', checked: ui.ack });
    ack.addEventListener('change', function () { ui.ack = ack.checked; draw(); });
    var send = h('button', { type: 'button', class: 'primary', disabled: !ui.ack || !n || ui.busy, text: prev && prev.state === ST ? 'Update my shared picks' : 'Share my picks' });
    send.addEventListener('click', function () {
      if (ui.busy) return; ui.busy = true;
      var tok = prev && prev.token ? prev.token : newToken();
      anon().then(function (c) { return c.rpc('share_intended_votes', { p_state: ST, p_token: tok, p_picks: payload }); })
        .then(function (r) {
          if (r.error) throw r.error;
          try { localStorage.setItem(SHARE, JSON.stringify({ token: tok, state: ST, at: Date.now() })); } catch (e) { /* ignore */ }
          ui.shareMsg = { cls: 'ok', text: 'Shared. Thank you. You can update or take it back any time on this device.' };
        }).catch(function (e) { ui.shareMsg = { cls: 'error', text: sbError(e) }; })
        .then(function () { ui.busy = false; draw(); });
    });
    var withdraw = prev && prev.token ? h('button', { type: 'button', class: 'danger', disabled: ui.busy, text: 'Take my shared picks back', onclick: function () {
      if (ui.busy) return; ui.busy = true;
      anon().then(function (c) { return c.rpc('withdraw_intended_votes', { p_token: prev.token }); }).then(function (r) {
        if (r.error) throw r.error;
        try { localStorage.removeItem(SHARE); } catch (e) { /* ignore */ }
        ui.shareMsg = { cls: 'ok', text: 'Your shared picks were deleted.' };
      }).catch(function (e) { ui.shareMsg = { cls: 'error', text: sbError(e) }; }).then(function () { ui.busy = false; draw(); });
    } }) : null;
    return h('section', { class: 'panel noprint' },
      h('h2', { text: 'Share your intended votes (optional)' }),
      h('p', {}, 'If you want, you can add your picks to a combined, anonymous count that helps us study how the vote might go. It is a separate choice from everything above. You can use My Ballot without ever doing this.'),
      h('div', { class: 'notice warn' }, h('b', { text: 'This is not a poll. ' }), 'The people who choose to share are not a fair sample of voters, so a count of them cannot tell you who will win, and we will never present it that way. Any totals we show will be labelled as self-selected and will appear only when many people in a state have shared.'),
      h('h3', { text: 'What is sent' }),
      h('ul', { class: 'mb-plain' },
        h('li', {}, 'Your state (' + WB.STATES[ST] + '). Nothing finer: no ZIP code, city, county or address.'),
        h('li', {}, 'For each race or measure where you picked, the id of the race and the id of your pick (the list below, word for word).'),
        h('li', {}, 'A random code made in this browser, so that sharing again replaces your earlier answer instead of counting twice, and so you can take it back. Our database keeps only a scrambled form of it.')),
      h('h3', { text: 'What is not sent' }),
      h('p', { class: 'muted' }, 'Not your name, email or account (even if you are signed in), not your facts or notes, not the races you marked undecided. We do not save your network address in the table. Like any website, our database host handles your connection and may keep ordinary technical logs.'),
      h('details', {}, h('summary', { text: 'Show exactly what would be sent' }), h('pre', { class: 'mb-pre', text: n ? JSON.stringify({ state: ST, picks: payload }, null, 2) : 'Nothing yet. Pick something first.' })),
      h('label', { class: 'mb-check', for: 'mb-ack' }, ack, h('span', { text: 'I understand this is a self-selected sample, not a poll, and I want to share my picks anonymously.' })),
      h('div', { class: 'btns' }, send, withdraw),
      !n ? h('p', { class: 'muted small', text: 'Pick at least one race or measure to share.' }) : null,
      ui.shareMsg ? h('p', { class: 'notice ' + ui.shareMsg.cls, role: 'status', text: ui.shareMsg.text }) : null);
  }

  // ---- page
  function draw() {
    var focus = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-k');
    var have = WB.states();
    var kids = [h('p', { class: 'overline noprint', text: 'My Ballot' }), h('h1', { class: 'noprint', text: 'Plan your vote' }),
      h('p', { class: 'lede noprint', text: 'Pick what you would choose, save the facts you care about, compare the races you have not decided, and print a sheet to take with you.' }),
      privacy()];
    if (ui.notice) kids.push(h('p', { class: 'notice ' + ui.notice.cls + ' noprint', role: 'status', text: ui.notice.text }));
    if (!WB.STATES[ST]) {
      ST = have[0] || '';
      if (!ST) {
        kids.push(h('section', { class: 'panel noprint' }, h('h2', { text: 'Start in the voter guide' }),
          h('p', {}, 'Nothing saved yet. Open any state\'s guide, then use the My Ballot buttons on races, candidates and ballot measures.'),
          h('div', { class: 'btns' }, h('a', { class: 'button primary', href: guideBase('CO'), text: 'Colorado voter guide' }), h('a', { class: 'button', href: '/preview/pages/states/', text: 'Pick another state' }))));
        app.replaceChildren.apply(app, kids); return;
      }
    }
    var d = WB.read(ST);
    kids.push(statePicker(have), markPanel(d), factsPanel(d), comparePanel(d), sheet(d), keepPanel(d), accountPanel(d), sharePanel(d));
    app.replaceChildren.apply(app, kids);
    if (focus) { var f = app.querySelector('[data-k="' + focus.replace(/"/g, '') + '"]'); if (f) f.focus(); }
  }
  document.addEventListener('theway-ballot', function () { /* own writes redraw themselves */ });
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('theway.ballot.v1.') === 0) draw(); });
  draw();
  if (location.hash === '#mark') { var m = document.getElementById('mark'); if (m) m.scrollIntoView(); }
})();
