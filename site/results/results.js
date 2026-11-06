// Election results page. Reads static JSON written by the results collector (see tools/results/README.md).
// Everything from the data files is untrusted text: it is only ever put on the page with textContent.
(function () {
  'use strict';
  var BASE = '/results/';
  var $ = function (id) { return document.getElementById(id); };
  var cfg = {}, manifest = null, cache = {}, tab = 'senate', timer = null;
  // ?race=<contest id> (with ?state=xx) opens that one result, scrolled into view and marked (deep link from studies and guides).
  var wantRace = String(new URLSearchParams(location.search).get('race') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120), raceDone = false;
  // contest id -> {study, guide}: which Election Study and voter-guide page belong to a ballot measure (results/measure-pages.json).
  var pagesFor = {}, mapDone = false;

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
  // Who says where a race stands. Four different labels, styled differently, so a call is never mistaken for a certified result.
  function statusOf(c) {
    var cl = c.called;
    if (cl && cl.kind === 'certified') return ['cs-cert', 'Certified by the state'];
    if (cl && cl.kind === 'ap') return ['cs-ap', 'What AP is calling (not certified)'];
    if (cl && cl.kind === 'state_leader') return ['cs-lead', 'State shows leader (not certified)'];
    if (cl && cl.winner) return ['cs-ap', 'Called by ' + (cl.by || 'the source') + ' (not certified)'];
    return ['cs-none', 'Not called, not certified'];
  }
  function stateName(code) { var n = ''; STATES.forEach(function (x) { if (x[0] === code) n = x[1]; }); return n; }
  function sourceOf(file) {
    var ids = file && file.source_ids;
    if (!manifest || !Array.isArray(ids) || ids.length !== 1) return null;
    return (manifest.sources || []).filter(function (s) { return s.id === ids[0]; })[0] || null;
  }
  function outLink(href, text) { var a = el('a', null, text); a.href = href; a.rel = 'noopener'; return a; }
  function card(c, file) {
    var li = el('li', 'card');
    if (c.id) { li.id = 'r-' + String(c.id).replace(/[^A-Za-z0-9-]/g, ''); li.tabIndex = -1; }
    var h = el('h3', null, c.title || c.office || 'Contest');
    li.appendChild(h);
    var stx = statusOf(c);
    li.appendChild(el('p', 'cstat ' + stx[0], stx[1]));
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
      if (calledId && calledId === x.id) nm.appendChild(el('span', 'pill call', callText(c.called)));
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
    li.appendChild(el('div', 'meta', meta.join(' · ')));
    // Where the numbers come from: the state's own results site, and when it says it last updated.
    var src = sourceOf(file), offc = c.state && OFFICIAL[c.state];
    var sl = el('p', 'srcline');
    if (src && /^https:\/\//.test(src.url || '')) {
      sl.appendChild(document.createTextNode('Official source: '));
      sl.appendChild(outLink(src.url, src.name || src.id));
      sl.appendChild(document.createTextNode('. Source last updated ' + fmtTime(src.data_updated_at) + '.'));
    } else if (offc) {
      sl.appendChild(document.createTextNode('Official source: '));
      sl.appendChild(outLink(offc, stateName(c.state) + ' official results'));
      sl.appendChild(document.createTextNode('.'));
    }
    if (sl.childNodes.length) li.appendChild(sl);
    var pg = c.id && pagesFor[c.id];
    if (pg || (tab === 'states' && c.id)) {
      var more = el('p', 'morelinks');
      if (pg && pg.study) { var a1 = el('a', null, 'Election study'); a1.href = pg.study; more.appendChild(a1); }
      if (pg && pg.guide) { var a2 = el('a', null, 'Original 2026 voter guide entry'); a2.href = pg.guide; more.appendChild(a2); }
      if (tab === 'states' && c.state) { var a3 = el('a', 'permalink', 'Link to this result'); a3.href = '/results/?state=' + c.state + '&race=' + encodeURIComponent(c.id); more.appendChild(a3); }
      li.appendChild(more);
    }
    li.appendChild(countyBlock(c, s.ch));
    return li;
  }
  // County breakdown: contest.counties = [{name, fips?, choices:[{id,votes}], precincts?:{reporting,total}}] (see tools/results/README.md).
  // Open state, search and sort survive the 60 second refresh.
  var openCounty = {}, countySort = {}, countyFind = {};
  function th(text, cls, scope) { var e = el('th', cls, text); e.scope = scope; return e; }
  function countyBlock(c, ch) {
    var d = el('details', 'cty');
    var list = Array.isArray(c.counties) ? c.counties.filter(function (k) { return k && k.name; }) : [];
    d.appendChild(el('summary', null, list.length ? 'By county (' + list.length + ')' : 'By county'));
    var key = c.id || c.title || '';
    if (openCounty[key]) d.open = true;
    d.addEventListener('toggle', function () { openCounty[key] = d.open; });
    if (!list.length) {
      d.appendChild(el('p', 'cty-empty', 'County numbers for this race have not been collected yet. They appear here when the official source publishes them by county. The state totals above are not affected.'));
      return d;
    }
    var cols = ch.slice(0, 4);
    var tools = el('div', 'cty-tools');
    var inp = el('input'); inp.type = 'search'; inp.placeholder = 'Find a county'; inp.maxLength = 60; inp.value = countyFind[key] || '';
    inp.setAttribute('aria-label', 'Find a county in ' + (c.title || 'this race'));
    var sel = el('select'); sel.setAttribute('aria-label', 'Sort counties');
    [['az', 'A to Z'], ['votes', 'Most votes counted']].forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op); });
    sel.value = countySort[key] || 'az';
    tools.appendChild(inp); tools.appendChild(sel); d.appendChild(tools);
    var wrap = el('div', 'cty-scroll'); d.appendChild(wrap);
    function draw() {
      wrap.textContent = '';
      var f = inp.value.toLowerCase().trim(); countyFind[key] = inp.value; countySort[key] = sel.value;
      var rows = list.map(function (k) {
        var by = {}; (k.choices || []).forEach(function (x) { by[x.id] = x.votes || 0; });
        var tot = (k.choices || []).reduce(function (s, x) { return s + (x.votes || 0); }, 0);
        return { k: k, by: by, tot: tot };
      }).filter(function (r) { return !f || String(r.k.name).toLowerCase().indexOf(f) >= 0; });
      rows.sort(function (a, b) {
        var byName = String(a.k.name).localeCompare(String(b.k.name));
        return sel.value === 'votes' ? (b.tot - a.tot) || byName : byName;
      });
      if (!rows.length) { wrap.appendChild(el('p', 'cty-empty', 'No county matches that search.')); return; }
      var t = el('table', 'cty-tbl');
      t.appendChild(el('caption', 'sr', 'County results for ' + (c.title || 'this race')));
      var hr = el('tr'); hr.appendChild(th('County', null, 'col'));
      cols.forEach(function (x) { hr.appendChild(th(x.name + (x.party ? ' (' + x.party + ')' : ''), 'n', 'col')); });
      hr.appendChild(th('Reporting', 'n', 'col'));
      var hd = el('thead'); hd.appendChild(hr); t.appendChild(hd);
      var tb = el('tbody');
      rows.forEach(function (r) {
        var tr = el('tr'); tr.appendChild(th(r.k.name, null, 'row'));
        var lead = -1, best = 0;
        cols.forEach(function (x, i) { if ((r.by[x.id] || 0) > best) { best = r.by[x.id]; lead = i; } });
        cols.forEach(function (x, i) {
          var v = r.by[x.id] || 0;
          var td = el('td', 'n' + (i === lead ? ' lead' : ''), fmtNum(v));
          if (r.tot) td.appendChild(el('small', null, (v / r.tot * 100).toFixed(1) + '%'));
          tr.appendChild(td);
        });
        var p = r.k.precincts, rep = 'not given';
        if (p && p.total) rep = fmtNum(p.reporting) + ' of ' + fmtNum(p.total) + ' (' + Math.round(p.reporting / p.total * 100) + '%)';
        tr.appendChild(el('td', 'n', rep));
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t);
      if (ch.length > cols.length) wrap.appendChild(el('p', 'cty-empty', 'Showing the top ' + cols.length + ' candidates by state total. Others are in the state totals above.'));
    }
    inp.addEventListener('input', draw); sel.addEventListener('change', draw);
    draw();
    return d;
  }
  // Who says a race is decided. AP calls and state leader marks are not certified results; only "certified" is.
  function callText(cl) {
    if (cl.kind === 'ap') return 'What AP is calling (not certified)';
    if (cl.kind === 'state_leader') return 'State shows leader (not certified)';
    if (cl.kind === 'certified') return 'Certified by the state';
    return 'Called by ' + (cl.by || 'source') + ' (not certified)';
  }
  function groupName(c) {
    if (c.kind === 'measure') return 'Ballot measures';
    if (c.kind === 'judicial') return 'Judges';
    if (c.kind === 'local') return 'Local';
    return c.office || 'Races';
  }
  // One state's header: its official results site, when that site last updated, and the certification status.
  function stateHead(data, code) {
    var box = el('div', 'statehead');
    var name = stateName(code) || data.label || code.toUpperCase();
    box.appendChild(el('h2', null, name + ' results'));
    var src = sourceOf(data), p1 = el('p');
    var href = (src && /^https:\/\//.test(src.url || '')) ? src.url : OFFICIAL[code];
    p1.appendChild(document.createTextNode('Official results: '));
    p1.appendChild(outLink(href, src ? (src.name || name + ' official results') : name + ' official results'));
    p1.appendChild(document.createTextNode('.'));
    box.appendChild(p1);
    var bits = [];
    if (src) bits.push('Source last updated ' + fmtTime(src.data_updated_at) + '. We last checked ' + fmtTime(src.checked_at) + '.');
    else if (data.updated_at) bits.push('Collected ' + fmtTime(data.updated_at) + '.');
    bits.push(data.certified === true ? 'The state has certified these results.' : 'Status: not certified. These are counts so far, and they can change until the state certifies them.');
    box.appendChild(el('p', 'muted', bits.join(' ')));
    return box;
  }
  function renderScope(data) {
    var p = $('panel'); p.textContent = '';
    if (tab === 'states' && $('st').value) p.appendChild(stateHead(data, $('st').value));
    var q = ($('q').value || '').toLowerCase().trim();
    var list = (data.contests || []).filter(function (c) {
      if (!q) return true;
      var hay = [c.title, c.office, c.text, c.district, c.state].concat((c.choices || []).map(function (x) { return x.name; })).join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (!list.length) { p.appendChild(el('p', 'empty', q ? 'No race matches that search.' : 'No results for this group have been collected yet. They appear here as the official source publishes them.')); return; }
    if (wantRace && !raceDone && !q && !list.some(function (c) { return c.id === wantRace; })) {
      raceDone = true;
      p.appendChild(el('p', 'callout', 'The result you followed a link to is not in the collected data. The official results link above has every race.'));
    }
    var order = [], groups = {};
    list.forEach(function (c) { var g = groupName(c); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(c); });
    order.forEach(function (g) {
      p.appendChild(el('div', 'grp', g));
      var ul = el('ul', 'cards');
      groups[g].forEach(function (c) { ul.appendChild(card(c, data)); });
      p.appendChild(ul);
    });
    if (wantRace && !raceDone) {
      var hit = document.getElementById('r-' + wantRace);
      if (hit) {
        raceDone = true;
        hit.classList.add('hit');
        hit.scrollIntoView({ block: 'start' });
        // keep it clear of anything pinned to the top of the screen (the top bar, a notice banner)
        var cover = 0;
        Array.prototype.forEach.call(document.elementsFromPoint(innerWidth / 2, 4), function (n) {
          for (var e = n; e && e !== document.body; e = e.parentElement) {
            var pos = getComputedStyle(e).position;
            if (pos === 'fixed' || pos === 'sticky') { cover = Math.max(cover, e.getBoundingClientRect().bottom); break; }
          }
        });
        if (cover > 0 && cover < innerHeight / 2) window.scrollBy(0, -(cover + 12));
        try { hit.focus({ preventScroll: true }); } catch (e) { hit.focus(); }
      }
    }
  }
  function filesFor(scope) { return (manifest.files || []).filter(function (f) { return f.scope === scope || (scope === 'states' && /^state-/.test(f.scope)) || (scope === 'cities' && /^city-/.test(f.scope)); }); }
  function loadFile(f) {
    return getJSON('data/' + f.path).then(function (d) { cache[f.scope] = d; return d; });
  }
  var STATES = [['al','Alabama'],['ak','Alaska'],['az','Arizona'],['ar','Arkansas'],['ca','California'],['co','Colorado'],['ct','Connecticut'],['de','Delaware'],['dc','District of Columbia'],['fl','Florida'],['ga','Georgia'],['hi','Hawaii'],['id','Idaho'],['il','Illinois'],['in','Indiana'],['ia','Iowa'],['ks','Kansas'],['ky','Kentucky'],['la','Louisiana'],['me','Maine'],['md','Maryland'],['ma','Massachusetts'],['mi','Michigan'],['mn','Minnesota'],['ms','Mississippi'],['mo','Missouri'],['mt','Montana'],['ne','Nebraska'],['nv','Nevada'],['nh','New Hampshire'],['nj','New Jersey'],['nm','New Mexico'],['ny','New York'],['nc','North Carolina'],['nd','North Dakota'],['oh','Ohio'],['ok','Oklahoma'],['or','Oregon'],['pa','Pennsylvania'],['ri','Rhode Island'],['sc','South Carolina'],['sd','South Dakota'],['tn','Tennessee'],['tx','Texas'],['ut','Utah'],['vt','Vermont'],['va','Virginia'],['wa','Washington'],['wv','West Virginia'],['wi','Wisconsin'],['wy','Wyoming']];
  var OFFICIAL = {al:'https://www2.alabamavotes.gov/electionNight/statewideResultsByContest.aspx?ecode=1001305',ak:'https://www.elections.alaska.gov/results/26GENR/',az:'https://results.arizona.vote/',ar:'https://enr.sos.arkansas.gov/',ca:'https://electionresults.sos.ca.gov/',co:'https://results.enr.clarityelections.com/CO/127407/',ct:'https://ctemspublic.tgstg.net/',de:'https://elections.delaware.gov/results/enr/GE2026.html',dc:'https://electionresults.dcboe.org/',fl:'https://floridaelectionwatch.gov/',ga:'https://results.sos.ga.gov/results/public/Georgia/elections/11032026GeneralAndSpecialElection',hi:'https://elections.hawaii.gov/election-results/',id:'https://results.voteidaho.gov/',il:'https://elections.il.gov/electionoperations/ElectionVoteTotals.aspx',in:'https://enr.indianavoters.in.gov/',ia:'https://results.enr.clarityelections.com/IA/127077/',ks:'https://ent.sos.ks.gov/kssos_ent.html',ky:'https://vrsws.sos.ky.gov/liveresults/',la:'https://voterportal.sos.la.gov/graphical',me:'https://www.maine.gov/sos/elections-voting',md:'https://elections.maryland.gov/elections/2026/general_results/',ma:'https://electionstats.state.ma.us/',mi:'https://www.michigan.gov/sos/elections',mn:'https://electionresults.sos.mn.gov/',ms:'https://www.sos.ms.gov/elections-voting/election-results',mo:'https://enr.sos.mo.gov/',mt:'https://electionresults.mt.gov/',ne:'https://electionresults.nebraska.gov/',nv:'https://silverstateelection.nv.gov/',nh:'https://www.sos.nh.gov/2026-general-election-results',nj:'https://nj.gov/state/elections/election-night-results.shtml',nm:'https://electionresults.sos.nm.gov/',ny:'https://nyenr.elections.ny.gov/',nc:'https://er.ncsbe.gov/?election_dt=11/03/2026&county_id=0&office=FED&contest=0',nd:'https://results.sos.nd.gov/',oh:'https://liveresults.ohiosos.gov/',ok:'https://results.okelections.gov/OKER/?elecDate=20261103',or:'https://results.oregonvotes.gov/',pa:'https://www.electionreturns.pa.gov/',ri:'https://electionresults.ri.gov/',sc:'https://www.enr-scvotes.org/SC/127300/',sd:'https://electionresults.sd.gov/',tn:'https://elections.tn.gov/',tx:'https://goelect.txelections.civixapps.com/ivis-enr-ui/races',ut:'https://electionresults.utah.gov/results/public/Utah/General11032026',vt:'https://electionresults.vermont.gov/',va:'https://enr.elections.virginia.gov/results/public/Virginia/elections/2026-November-General',wa:'https://results.votewa.gov/results/public/washington/20261103',wv:'https://results.enr.clarityelections.com/WV/127496/',wi:'https://elections.wi.gov/',wy:'https://sos.wyo.gov/Elections/Docs/2026/2026GeneralResults.aspx'};
  // The page's own list of official links (#official, in the HTML so it works with scripts off) wins over the list above.
  Array.prototype.forEach.call(document.querySelectorAll('a[data-official]'), function (a) {
    var k = a.getAttribute('data-official');
    if (/^[a-z]{2}$/.test(k) && /^https:\/\//.test(a.href)) OFFICIAL[k] = a.href;
  });
  function officialLink(code) {
    var name = stateName(code);
    var p = el('p', 'empty', 'Numbers for ' + name + ' have not been collected here yet. ');
    var a = el('a', null, 'Official results from ' + name + ' election office'); a.href = OFFICIAL[code]; a.target = '_blank'; a.rel = 'noopener';
    p.appendChild(a); return p;
  }
  // A clear message when the data does not load, with the official links and a way to try again.
  function failBox(head, body, code) {
    var box = el('div', 'feed-error-in');
    box.appendChild(el('p', 'fe-h', head));
    box.appendChild(el('p', null, body));
    var acts = el('p', 'fe-acts');
    if (code && OFFICIAL[code]) acts.appendChild(outLink(OFFICIAL[code], 'Official ' + stateName(code) + ' results'));
    var all = el('a', null, 'Official results for every state'); all.href = '#official'; acts.appendChild(all);
    var again = el('button', 'fe-retry', 'Try again'); again.type = 'button';
    again.addEventListener('click', function () { again.disabled = true; again.textContent = 'Trying again'; load(); });
    acts.appendChild(again);
    box.appendChild(acts);
    return box;
  }
  function feedError(on) {
    var box = $('feederr');
    if (!on) { box.hidden = true; box.textContent = ''; return; }
    box.textContent = '';
    box.appendChild(manifest
      ? failBox('The latest update did not load.', 'The numbers below are from the last time the data loaded, ' + fmtTime(manifest.generated_at) + '. They may be out of date.', null)
      : failBox('The election results data did not load.', 'This page could not get the collected numbers just now. The official results sites are not affected.', null));
    box.hidden = false;
  }
  function stateScope(code) { return code === 'co' ? 'co' : 'state-' + code; }
  function fillStates(sel) {
    if (sel.dataset.kind === 'states') return;
    sel.textContent = ''; sel.dataset.kind = 'states';
    var o0 = el('option', null, 'Choose a state'); o0.value = ''; sel.appendChild(o0);
    STATES.forEach(function (x) { var o = el('option', null, x[1]); o.value = x[0]; sel.appendChild(o); });
  }
  function show() {
    var st = $('statepick');
    st.hidden = !(tab === 'states' || tab === 'cities');
    var sel = $('st'), fs;
    if (tab === 'states') {
      fillStates(sel);
      if (!sel.value) { $('panel').textContent = ''; $('panel').appendChild(el('p', 'empty', 'Choose a state above to see its results.')); return; }
      var want = stateScope(sel.value);
      fs = (manifest.files || []).filter(function (f) { return f.scope === want; });
    } else if (tab === 'cities') {
      var cur = sel.dataset.kind === 'cities' ? sel.value : '';
      fs = filesFor(tab);
      sel.textContent = ''; sel.dataset.kind = 'cities';
      fs.forEach(function (f) { var o = el('option', null, f.label || f.scope); o.value = f.scope; sel.appendChild(o); });
      if (cur) sel.value = cur;
      fs = fs.filter(function (f) { return f.scope === sel.value; });
    } else {
      fs = filesFor(tab);
    }
    if (!fs.length && tab === 'states' && OFFICIAL[sel.value]) { $('panel').textContent = ''; $('panel').appendChild(officialLink(sel.value)); return; }
    if (!fs.length) { $('panel').textContent = ''; $('panel').appendChild(el('p', 'empty', 'Nothing collected for this group yet. It appears here as soon as the official source publishes it.')); return; }
    var scodeNow = tab === 'states' ? sel.value : '';
    loadFile(fs[0]).then(renderScope).catch(function () {
      $('panel').textContent = '';
      $('panel').appendChild(failBox('These results did not load.', 'The page could not get this group of results just now. Try again in a minute, or use the official results.', scodeNow));
    });
  }
  var TABS = [['senate', 'U.S. Senate'], ['house', 'U.S. House'], ['states', 'States'], ['cities', 'Cities']];
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
    box.appendChild(el('p', 'muted', 'Seats AP is calling, so far. This is what AP reports, not certified results; certified results come from the states and are shown separately. Not a prediction. Races AP has not called are counted as not called.'));
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
      if (!m || !Array.isArray(m.files)) throw new Error('manifest');
      manifest = m; feedError(false); renderStatus(); renderSources(); renderBalance(); if (window.TWMap) TWMap.update(m, getJSON);
      // /results/#apmap (the "Election Results map" menu link): the map only shows once the data is in, so scroll to it then
      if (!mapDone && location.hash === '#apmap') { mapDone = true; setTimeout(function () { var mp = $('apmap'); if (mp && !mp.hidden) mp.scrollIntoView({ block: 'start' }); }, 50); }
      if (!$('tabs').childNodes.length) renderTabs();
      show();
    }).catch(function () {
      $('status').textContent = manifest ? 'The latest update did not load. Showing the last numbers that did.' : 'The collected results did not load.';
      feedError(true);
    });
  }
  function loadPages() {
    return getJSON('measure-pages.json').then(function (m) {
      var pages = m && m.pages; if (!pages) return;
      Object.keys(pages).forEach(function (k) {
        var e = pages[k]; if (!e || !e.contest || !/^\/[a-z0-9\/-]+\.html$/.test(k)) return;
        var slot = pagesFor[e.contest] || (pagesFor[e.contest] = {});
        if (k.indexOf('/case-studies/') === 0) slot.study = k; else slot.guide = k;
      });
    }).catch(function () { /* the cards just show no study links */ });
  }
  // Open one state's results in the States tab: from /results/?state=co, or a "See every ... race" link on the AP map.
  function openState(code, scroll) {
    code = String(code || '').toLowerCase();
    if (!STATES.some(function (x) { return x[0] === code; })) return false;
    tab = 'states'; fillStates($('st')); $('st').value = code;
    if ($('tabs').childNodes.length) { renderTabs(); show(); }
    if (scroll && $('tabs').scrollIntoView) $('tabs').scrollIntoView({ block: 'start' });
    return true;
  }
  function start() {
    if (gate()) return;
    openState(new URLSearchParams(location.search).get('state'), false);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-state-results]');
      if (!a || !openState(a.getAttribute('data-state-results'), true)) return;
      e.preventDefault();
      try { history.replaceState(null, '', '/results/?state=' + a.getAttribute('data-state-results')); } catch (er) { /* the link still worked */ }
    });
    $('q').addEventListener('input', function () { if (cache[tab] || tab === 'states' || tab === 'cities') show(); });
    $('st').addEventListener('change', show);
    loadPages().then(load);
    timer = setInterval(load, 60000);
  }
  fetch(BASE + 'config.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
    .then(function (r) { return r.json(); }).catch(function () { return {}; })
    .then(function (c) { cfg = c || {}; start(); });
})();
