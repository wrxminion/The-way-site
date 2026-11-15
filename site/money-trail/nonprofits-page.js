// D280 (Nov 2026): the Nonprofit Trail page (/money-trail/nonprofits.html). With no ?ein= it lists every group; with ?ein=
// it follows one group through its latest reachable IRS Form 990 return. Data: nonprofits.js (window.TW_NONPROFITS), built by
// tools/money-trail/build_nonprofits.py. Text goes in with textContent. Every number is copied from the return. Donor names are
// never shown or guessed, because the IRS public copy of the return leaves them out.
(function () {
  'use strict';
  const N = window.TW_NONPROFITS, out = document.getElementById('np-out');
  if (!N || !out) return;
  const PP = 'https://projects.propublica.org/nonprofits/organizations/';
  const FECC = 'https://www.fec.gov/data/committee/';
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
  const ext = (text, href) => { const a = el('a', null, text + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const lnk = (text, href) => { const a = el('a', null, text); a.href = href; return a; };
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('en-US');
  const short = n => { const a = Math.abs(n || 0), s = n < 0 ? '-$' : '$'; return a >= 1e9 ? s + (a / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' billion' : a >= 1e6 ? s + (a / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' million' : money(n); };
  const ein = s => String(s || '').replace(/^(\d{2})(\d{7})$/, '$1-$2');
  const day = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : d; };
  const filing = o => PP + o.ein.replace(/^0+/, '') + '/' + o.object_id + '/full';
  const xml = o => N.meta.xml_base + o.object_id + '_public.xml';
  const web = name => './?view=network&hub=' + encodeURIComponent(name);
  const pol = o => { const p = o.politics || {}; return Math.max(p.exempt_function_total || 0, p.political_expenditures || 0); };
  const pay = p => (p[2] || 0) + (p[3] || 0) + (p[4] || 0);
  const BY = new Map(N.orgs.map(o => [o.ein, o]));
  const ORGS = N.orgs.slice().sort((a, b) => a.label.localeCompare(b.label));

  // Money from the other groups in this set (their Schedule I lines and Schedule C lines that name this group).
  function received(o) {
    const rows = [];
    N.orgs.forEach(x => {
      if (x === o) return;
      x.grants.forEach(g => { if (g.ein === o.ein || g.to_id === o.web_id) rows.push([x, g.cash + g.noncash, 'grant (Schedule I)', g.purpose]); });
      (x.politics.p527 || []).forEach(p => { if ((p.ein === o.ein || p.to_id === o.web_id) && !x.grants.some(g => g.ein && g.ein === p.ein)) rows.push([x, p.paid + p.passed_on, 'payment to a political group (Schedule C)', '']); });
    });
    return rows.filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  }

  function big(o) {
    const T = o.totals, box = el('div', 'trail-big np-big');
    [['Revenue', T.revenue, 'Money in during the tax year'], ['Expenses', T.expenses, 'Money out during the tax year'], ['Grants it paid', T.grants, 'To other groups and people'],
     ['Political spending', o.politics.filed ? pol(o) : null, o.politics.filed ? 'As reported on Schedule C' : 'No Schedule C in this return']].forEach(([k, v, sub]) => {
      const d = el('div'); d.append(el('b', null, v == null ? 'None filed' : short(v)), el('span', null, k), el('p', null, sub + (v != null && Math.abs(v) >= 1e6 ? '. Exact: ' + money(v) + '.' : '.'))); box.append(d);
    });
    return box;
  }

  function section(title, kids) { const s = el('section', 'np-sec'); s.append(el('h3', null, title)); kids.filter(Boolean).forEach(k => s.append(k)); return s; }

  function one(o) {
    const T = o.totals, P = o.politics, frag = document.createDocumentFragment();
    document.title = o.label + ' | The Nonprofit Trail | The Way';
    frag.append(el('h2', null, o.label));
    frag.append(el('p', 'np-id', o.section + ' nonprofit · EIN ' + ein(o.ein) + ' · ' + [o.city, o.state].filter(Boolean).join(', ') + (o.formed ? ' · formed ' + o.formed : '') + (o.employees != null ? ' · ' + o.employees.toLocaleString('en-US') + ' employees' : '')));
    frag.append(el('p', 'trail-small', 'From its IRS Form 990 return for the tax year ' + day(o.begin) + ' to ' + day(o.end) + ', filed ' + day(o.filed) + '. This is the latest return we could reach.' + (o.note ? ' ' + o.note : '')));
    frag.append(big(o));
    const links = el('ul', 'trail-web np-links');
    const li = (...k) => { const x = el('li'); x.append(...k); links.append(x); };
    li(lnk('See it in the Money web →', web(o.web_name)));
    li(ext('Open the return (ProPublica view of the IRS file)', filing(o)));
    li(ext('The IRS XML file of the return', xml(o)));
    if (o.website) li(ext('Its own website', /^https?:/i.test(o.website) ? o.website : 'https://' + o.website.replace(/^\/+/, '').toLowerCase()));
    frag.append(links);
    if (o.mission) { const q = el('blockquote', 'np-quote', '“' + o.mission + '”'); frag.append(section('In its own words', [q, el('p', 'trail-small', 'How the group describes its mission or main work on line 1 of its return, copied as written.')])); }

    // Money in
    const rec = received(o), inK = [];
    inK.push(el('p', null, 'Gifts and grants received: ' + money(T.gifts) + ' of ' + money(T.revenue) + ' in revenue.'));
    inK.push(el('p', 'np-donor', 'Who gave: not public. ' + (o.schedule_b.filed ? 'The return includes Schedule B, the list of large donors, but the IRS public copy leaves out names and addresses' + (o.schedule_b.amounts_hidden ? ' and the amounts' : '') + '.' : 'No Schedule B is in this public copy.') + ' Federal tax law does not make 501(c)(3) and 501(c)(4) groups publish their donors, so this page never names or guesses them.'));
    if (rec.length) {
      inK.push(el('p', null, 'What other groups on this page say they gave it, from their own returns (their tax years can differ from this one):'));
      const ul = el('ul', 'np-list');
      rec.forEach(([x, v, kind, why]) => { const l = el('li'); l.append(el('b', null, money(v)), document.createTextNode(' from '), lnk(x.label, '?ein=' + x.ein), document.createTextNode(', ' + kind + ', tax year ending ' + day(x.end) + (why ? '. Purpose as written: ' + why : '') + '.')); ul.append(l); });
      inK.push(ul);
    }
    frag.append(section('Money in', inK));

    // Money out: grants
    const gK = [];
    if (o.grants_all.lines) {
      gK.push(el('p', null, 'Schedule I lists ' + o.grants_all.lines.toLocaleString('en-US') + ' grants to U.S. groups, ' + money(o.grants_all.total) + ' in all.' + (o.grants_all.lines > o.grants.length ? ' The ' + o.grants.length + ' largest are below, the same depth for every group.' : '')));
      const ol = el('ol', 'np-list');
      o.grants.forEach(g => {
        const l = el('li'), inSet = BY.get(g.ein);
        l.append(el('b', null, money(g.cash + g.noncash)), document.createTextNode(' to '));
        l.append(inSet ? lnk(inSet.label, '?ein=' + inSet.ein) : document.createTextNode(g.name));
        l.append(document.createTextNode((g.section ? ' (' + g.section + (g.ein ? ', EIN ' + ein(g.ein) : '') + ')' : g.ein ? ' (EIN ' + ein(g.ein) + ')' : '') + (g.state ? ', ' + g.state : '') + '. ' + (g.purpose ? 'Purpose as written: ' + g.purpose + '.' : '')));
        if (g.fec_id) { l.append(document.createTextNode(' ')); l.append(ext('FEC committee', FECC + g.fec_id + '/')); }
        ol.append(l);
      });
      gK.push(ol);
    } else gK.push(el('p', null, T.grants ? 'It reports ' + money(T.grants) + ' in grants but no Schedule I lines to U.S. groups in this copy.' : 'No grants to U.S. groups are listed on this return.'));
    if (o.foreign_grants) gK.push(el('p', 'trail-small', 'It also filed Schedule F (money spent or granted outside the United States). Those lines are not listed here.'));
    gK.push(el('p', 'trail-small', 'Each line is the total for one recipient in the tax year, as the group wrote it. Grants to people are not listed by name on Form 990 and are not shown.'));
    frag.append(section('Money out: grants to other groups', gK));

    // Politics
    const pK = [];
    if (P.filed) {
      const ul = el('ul', 'np-list');
      const row = (k, v) => { if (v != null) ul.append(el('li', null, k + ': ' + money(v))); };
      row('Spent on political campaign activity (Part I-A)', P.political_expenditures);
      row('Spent directly on political activity (Part I-C line 1)', P.spent_directly);
      row('Its own money given to political organizations (Part I-C line 2)', P.given_to_527s);
      row('Total for political purposes (Part I-C line 3)', P.exempt_function_total);
      row('Lobbying', P.lobbying);
      if (P.volunteer_hours) ul.append(el('li', null, 'Volunteer hours for political activity: ' + P.volunteer_hours.toLocaleString('en-US')));
      pK.push(el('p', null, 'Schedule C is where a nonprofit reports political campaign spending and lobbying.'), ul);
      const L = P.p527 || [];
      if (L.length) {
        pK.push(el('p', null, 'Political organizations it paid (Part I-C line 5): ' + P.p527_all.lines + ' in all, ' + money(P.p527_all.paid) + ' from its own funds' + (P.p527_all.passed_on ? ' and ' + money(P.p527_all.passed_on) + ' of gifts it collected and passed on' : '') + '.' + (P.p527_all.lines > L.length ? ' The ' + L.length + ' largest are below.' : '')));
        const ol = el('ol', 'np-list');
        L.forEach(p => {
          const l = el('li'), inSet = BY.get(p.ein);
          l.append(el('b', null, money(p.paid + p.passed_on)), document.createTextNode(' to '), inSet ? lnk(inSet.label, '?ein=' + inSet.ein) : document.createTextNode(p.name));
          l.append(document.createTextNode((p.ein ? ' (EIN ' + ein(p.ein) + ')' : '') + (p.state ? ', ' + p.state : '') + (p.passed_on ? '. ' + money(p.passed_on) + ' of it was gifts passed on' : '') + '.'));
          if (p.fec_id) { l.append(document.createTextNode(' Same name as an FEC committee: ')); l.append(ext(p.to_name, FECC + p.fec_id + '/')); }
          ol.append(l);
        });
        pK.push(ol);
      }
      pK.push(el('p', 'trail-small', 'A payment to a political organization or super PAC can also show on FEC filings. FEC links here are matched by name only, and the two are never added together.'));
    } else pK.push(el('p', null, 'This return has no Schedule C, so it reports no political campaign spending and no lobbying.'));
    frag.append(section('Political spending and lobbying', pK));

    // People and pay
    const paid = o.people.filter(p => pay(p) > 0), unpaid = o.people.filter(p => !(pay(p) > 0));
    const kK = [el('p', null, 'Part VII lists ' + o.people.length + ' officers, directors, key employees and highest paid employees. ' + paid.length + ' got pay. Amounts are for the calendar year the tax year ends in, as filed.')];
    if (paid.length) {
      const ol = el('ol', 'np-list np-people');
      paid.forEach(p => { const l = el('li'); l.append(el('b', null, money(pay(p))), document.createTextNode(' ' + p[0] + ', ' + p[1] + (p[5] ? ' (' + p[5] + ')' : '') + '. From the group ' + money(p[2]) + (p[3] ? ', from related groups ' + money(p[3]) : '') + (p[4] ? ', other pay and benefits ' + money(p[4]) : '') + '.')); ol.append(l); });
      kK.push(ol);
    }
    if (unpaid.length) {
      const d = el('details'); d.append(el('summary', null, unpaid.length + ' more people listed with no pay'));
      const ul = el('ul', 'np-list'); unpaid.forEach(p => ul.append(el('li', null, p[0] + ', ' + p[1] + (p[5] ? ' (' + p[5] + ')' : '')))); d.append(ul); kK.push(d);
    }
    frag.append(section('Who runs it and what they are paid', kK));

    // Related groups
    const rK = [];
    if (o.related.length) {
      const ul = el('ul', 'np-list');
      o.related.forEach(r => { const l = el('li'), inSet = BY.get(r.ein); l.append(inSet ? lnk(inSet.label, '?ein=' + inSet.ein) : document.createTextNode(r.name)); l.append(document.createTextNode(' (' + [r.kind, r.ein ? 'EIN ' + ein(r.ein) : '', r.state].filter(Boolean).join(', ') + ')' + (r.activity ? ': ' + r.activity : '') + (r.controlled ? '. ' + o.label + ' controls it.' : '.'))); ul.append(l); });
      rK.push(ul);
    } else rK.push(el('p', null, 'No related groups are listed on Schedule R of this return.'));
    if (o.related_money.length) {
      rK.push(el('p', null, 'Money and services moved between it and related groups (Schedule R Part V):'));
      const ul = el('ul', 'np-list');
      o.related_money.forEach(r => ul.append(el('li', null, (r.amount != null ? money(r.amount) : 'No amount') + ': ' + r.what + ', with ' + r.name + '.')));
      rK.push(ul);
    }
    frag.append(section('Related groups', rK));
    return frag;
  }

  function list(q) {
    const frag = document.createDocumentFragment();
    document.title = 'The Nonprofit Trail | The Way';
    frag.append(el('h2', null, 'Every nonprofit on the trail'));
    frag.append(el('p', null, N.meta.rule));
    frag.append(el('p', 'np-donor', N.meta.donors));
    const qq = (q || '').trim().toLowerCase();
    const rows = ORGS.filter(o => !qq || (o.label + ' ' + o.filed_name + ' ' + o.ein + ' ' + ein(o.ein) + ' ' + o.people.map(p => p[0]).join(' ')).toLowerCase().includes(qq));
    const ul = el('ul', 'np-cards');
    rows.forEach(o => {
      const l = el('li', 'np-card'), a = lnk(o.label, '?ein=' + o.ein);
      l.append(a, el('span', 'np-card-id', o.section + ' · EIN ' + ein(o.ein) + ' · tax year ending ' + day(o.end)));
      l.append(el('span', 'np-card-num', 'Revenue ' + short(o.totals.revenue) + ' · Grants paid ' + short(o.totals.grants || 0) + ' · Political spending ' + (o.politics.filed ? short(pol(o)) : 'none filed')));
      ul.append(l);
    });
    if (!rows.length) ul.append(el('li', 'np-card', 'No group matches. Try fewer letters.'));
    frag.append(ul);
    return frag;
  }

  function sources() {
    const s = $('#np-sources'); if (!s) return;
    s.replaceChildren(el('h3', null, 'Where the numbers come from, and what they leave out'));
    const ul = el('ul', 'np-list');
    N.meta.sources.forEach(x => { const l = el('li'); l.append(ext(x.name, x.url), document.createTextNode('. Covers: ' + x.covers + ' Does not cover: ' + x.not)); ul.append(l); });
    s.append(ul);
    s.append(el('p', 'trail-small', 'A nonprofit files Form 990 once a year, months after its year ends, so these numbers are not live. Names on other groups\' returns are matched by EIN; names matched to FEC committees are matched by name only and say so. Being on this page, or getting money from a group on it, does not mean anyone did anything wrong. Checked ' + day(N.meta.checked) + '.'));
  }

  const pickSel = $('#np-pick'), find = $('#np-find');
  pickSel.append(new Option('All nonprofits', ''));
  ORGS.forEach(o => pickSel.append(new Option(o.label, o.ein)));
  function show() {
    const e = new URLSearchParams(location.search).get('ein') || '';
    const o = BY.get(e.replace(/\D/g, '').padStart(9, '0'));
    pickSel.value = o ? o.ein : '';
    out.replaceChildren(o ? one(o) : list(find.value));
  }
  pickSel.addEventListener('change', () => { history.pushState(null, '', pickSel.value ? '?ein=' + pickSel.value : location.pathname); show(); window.scrollTo({ top: 0 }); });
  find.addEventListener('input', () => { if (new URLSearchParams(location.search).get('ein')) history.replaceState(null, '', location.pathname); out.replaceChildren(list(find.value)); pickSel.value = ''; });
  window.addEventListener('popstate', show);
  sources();
  show();
})();
