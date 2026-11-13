// Follow the money tag: one "FOLLOW THE MONEY" link on (almost) every page, pointing at the matching Money Trail page.
// Loaded by /members/waybar.js; no page needs editing. The art is the hover logo made with ChatGPT (follow-the-money-hover.html, Nov 5, 2026),
// drawn here in script so the page keeps its strict security policy (no inline styles, no inline scripts). Styles: /follow-money.css.
// Where it points:
//   ballot measure pages and Election Studies -> that measure's trail (follow.html?measure=ID), from the MEASURES table below;
//   cases with a trail (the 2008 rescue, private prisons, ICE) -> that trail; cases with a dot on the Money web -> the web on that dot (CASES);
//   anything tied to one state (its guide, races, candidates, map, state page, results for a state) -> the State tracker for that state;
//   everything else -> the Money Trail front page.
// Not shown on the Money Trail itself or in the member area. Moves only on hover or keyboard focus, never with reduced motion or Pause motion.
(function () {
  'use strict';
  var path = location.pathname.replace(/\/index\.html$/, '/');
  if (/^\/(money-trail|members)\//.test(path) || document.querySelector('.ftm-tag')) return;

  var MEASURES = {
  // MEASURES start (built by tools/follow-money/build_measure_map.py)
  '/case-studies/amendment-81.html': 'CO-81',
  '/case-studies/amendment-82.html': 'CO-82',
  '/case-studies/amendment-83.html': 'CO-83',
  '/case-studies/amendment-84.html': 'CO-84',
  '/case-studies/amendment-85.html': 'CO-85',
  '/case-studies/amendment-86.html': 'CO-86',
  '/case-studies/amendment-87.html': 'CO-87',
  '/case-studies/florida-amendment-1.html': 'FL-1',
  '/case-studies/florida-amendment-2.html': 'FL-2',
  '/case-studies/florida-amendment-3.html': 'FL-3',
  '/case-studies/north-carolina-income-tax-cap-amendment.html': 'NC-INCOME-2026',
  '/case-studies/north-carolina-photo-id-amendment.html': 'NC-ID-2026',
  '/case-studies/north-carolina-property-tax-limit-amendment.html': 'NC-PROPERTY-2026',
  '/case-studies/oklahoma-state-question-845.html': 'OK-845',
  '/case-studies/oklahoma-state-question-847.html': 'OK-847',
  '/case-studies/proposition-132.html': 'CO-132',
  '/case-studies/proposition-133.html': 'CO-133',
  '/case-studies/proposition-134.html': 'CO-134',
  '/case-studies/proposition-135.html': 'CO-135',
  '/case-studies/proposition-136.html': 'CO-136',
  '/case-studies/proposition-137.html': 'CO-137',
  '/case-studies/proposition-nn.html': 'CO-NN',
  '/guide-az/measures/prop-141-vehicle-mileage.html': 'AZ-141',
  '/guide-az/measures/prop-142-preferential-treatment.html': 'AZ-142',
  '/guide-az/measures/prop-144-election-requirements.html': 'AZ-144',
  '/guide-az/measures/prop-316-grocery-taxes.html': 'AZ-316',
  '/guide-az/measures/prop-317-drug-cartels.html': 'AZ-317',
  '/guide-az/measures/prop-318-athletic-teams.html': 'AZ-318',
  '/guide-az/measures/prop-319-photo-enforcement.html': 'AZ-319',
  '/guide-az/measures/prop-320-classroom-spending.html': 'AZ-320',
  '/guide-ca/measures/prop-1.html': 'CA-1',
  '/guide-ca/measures/prop-2.html': 'CA-2',
  '/guide-ca/measures/prop-3.html': 'CA-3',
  '/guide-ca/measures/prop-37.html': 'CA-37',
  '/guide-ca/measures/prop-38.html': 'CA-38',
  '/guide-ca/measures/prop-39.html': 'CA-39',
  '/guide-ca/measures/prop-4.html': 'CA-4',
  '/guide-ca/measures/prop-40.html': 'CA-40',
  '/guide-ca/measures/prop-41.html': 'CA-41',
  '/guide-ca/measures/prop-42.html': 'CA-42',
  '/guide-ca/measures/prop-43.html': 'CA-43',
  '/guide-ca/measures/prop-44.html': 'CA-44',
  '/guide-ca/measures/prop-45.html': 'CA-45',
  '/guide-ca/measures/prop-5.html': 'CA-5',
  '/guide-fl/measures/amendment-1.html': 'FL-1',
  '/guide-fl/measures/amendment-2.html': 'FL-2',
  '/guide-fl/measures/amendment-3.html': 'FL-3',
  '/guide-ga/measures/amendment-1.html': 'GA-1',
  '/guide-ga/measures/amendment-2.html': 'GA-2',
  '/guide-ga/measures/amendment-3.html': 'GA-3',
  '/guide-ia/measures/amendment-1-income-tax-two-thirds-vote.html': 'IA-2026-NOV-SJR11',
  '/guide-ks/measures/citizen-voting-amendment.html': 'KS-2026-NOV-HCR5004',
  '/guide-ma/measures/question-1-public-records-for-the-legislature-and-governor-s.html': 'MA-1',
  '/guide-ma/measures/question-2-union-rights-for-public-defender-agency-workers.html': 'MA-2',
  '/guide-ma/measures/question-3-one-all-party-primary-top-two-advance.html': 'MA-3',
  '/guide-ma/measures/question-4-register-to-vote-on-election-day.html': 'MA-4',
  '/guide-ma/measures/question-5-limit-on-state-tax-revenue-with-rebates.html': 'MA-5',
  '/guide-ma/measures/question-6-conservation-fund-from-sporting-goods-sales-tax.html': 'MA-6',
  '/guide-ma/measures/question-7-allow-single-family-homes-on-5-000-sq-ft-lots.html': 'MA-7',
  '/guide-ma/measures/question-8-end-retail-sales-of-recreational-marijuana.html': 'MA-8',
  '/guide-ma/measures/question-9-keep-or-repeal-the-2024-gun-law.html': 'MA-9',
  '/guide-mi/measures/proposal-1.html': 'MI-2026-1',
  '/guide-mi/measures/proposal-2.html': 'MI-2026-2',
  '/guide-mn/measures/amendment-1-school-fund.html': 'MN-2026-SCHOOL-FUND',
  '/guide-mo/measures/amendment-3.html': 'MO-Amendment-3',
  '/guide-mo/measures/amendment-6.html': 'MO-Amendment-6',
  '/guide-mo/measures/amendment-7.html': 'MO-Amendment-7',
  '/guide-mo/measures/amendment-8.html': 'MO-Amendment-8',
  '/guide-mo/measures/proposition-a.html': 'MO-Proposition-A',
  '/guide-nc/measures/income-tax-cap-amendment.html': 'NC-INCOME-2026',
  '/guide-nc/measures/photo-id-amendment.html': 'NC-ID-2026',
  '/guide-nc/measures/property-tax-limit-amendment.html': 'NC-PROPERTY-2026',
  '/guide-nv/measures/question-6.html': 'NV-Question-6',
  '/guide-nv/measures/question-7.html': 'NV-Question-7',
  '/guide-oh/measures/issue-3.html': 'OH-3',
  '/guide-ok/measures/state-question-845.html': 'OK-845',
  '/guide-ok/measures/state-question-847.html': 'OK-847',
  '/guide-tn/measures/amendment-1-bail.html': 'TN-1',
  '/guide-tn/measures/amendment-2-state-property-tax.html': 'TN-2',
  '/guide-tn/measures/amendment-3-crime-victims-rights.html': 'TN-3',
  '/guide-ut/measures/amendment-a.html': 'UT-Amendment-A',
  '/guide-ut/measures/amendment-b.html': 'UT-Amendment-B',
  '/guide-va/measures/question-1.html': 'VA-NOV-Q1',
  '/guide-va/measures/question-2.html': 'VA-NOV-Q2',
  '/guide-va/measures/question-3.html': 'VA-NOV-Q3',
  '/guide-wa/measures/il26-001-parental-rights.html': 'WA-2026-IL26-001',
  '/guide-wa/measures/il26-638-girls-school-sports.html': 'WA-2026-IL26-638',
  '/guide-wa/measures/ip26-645-income-tax-repeal.html': 'WA-2026-IP26-645',
  '/guide-wi/measures/question-1-partial-veto.html': 'WI-Q1',
  '/guide-wi/measures/question-2-places-of-worship.html': 'WI-Q2',
  '/guide-wi/measures/question-3-government-discrimination.html': 'WI-Q3',
  '/guide/measures/amendment-81.html': 'CO-81',
  '/guide/measures/amendment-82.html': 'CO-82',
  '/guide/measures/amendment-83.html': 'CO-83',
  '/guide/measures/amendment-84.html': 'CO-84',
  '/guide/measures/amendment-85.html': 'CO-85',
  '/guide/measures/amendment-86.html': 'CO-86',
  '/guide/measures/amendment-87.html': 'CO-87',
  '/guide/measures/proposition-132.html': 'CO-132',
  '/guide/measures/proposition-133.html': 'CO-133',
  '/guide/measures/proposition-134.html': 'CO-134',
  '/guide/measures/proposition-135.html': 'CO-135',
  '/guide/measures/proposition-136.html': 'CO-136',
  '/guide/measures/proposition-137.html': 'CO-137',
  '/guide/measures/proposition-nn.html': 'CO-NN',
  // MEASURES end
  };
  // Case pages whose subject has its own trail, or a dot of its own on the Money web.
  var CASES = {
    '/cases/tarp.html': ['follow.html?bill=hr-1424', 'Money trail for the 2008 rescue law (H.R. 1424)'],
    '/cases/private-prisons.html': ['follow.html?agency=ice', 'Money trail for ICE detention awards to CoreCivic and GEO'],
    '/cases/ice-and-local-policing.html': ['follow.html?agency=ice', 'Money trail for ICE detention awards'],
    // D267: cases that name a company or group whose own FEC filings are on the Money web. These are the 2025-2026
    // filings of its political action committee, not money from the events in the case.
    '/cases/pso-rates.html': ['?view=network&fec=C00096842', 'Money web for American Electric Power, the company that owns PSO (its PAC, 2025-2026 FEC filings)'],
    '/cases/love-canal.html': ['?view=network&fec=C00949552', 'Money web for Occidental Chemical, Hooker\u2019s successor (OxyChem PAC, 2025-2026 FEC filings)'],
    '/cases/opioid-crisis.html': ['?view=network&fec=C00108035,C00332833,C00400929,C00010983', 'Money web for McKesson, Cardinal Health, Cencora (formerly AmerisourceBergen) and Johnson & Johnson (their PACs, 2025-2026 FEC filings)'],
    '/cases/citizens-united.html': ['?view=network&fec=C00295527', 'Money web for Citizens United (its PAC, 2025-2026 FEC filings)'],
    '/cases/auto-safety.html': ['?view=network&fec=C00076810', 'Money web for General Motors (GM PAC, 2025-2026 FEC filings)'],
    '/cases/leaded-gasoline.html': ['?view=network&fec=C00076810', 'Money web for General Motors (GM PAC, 2025-2026 FEC filings)'],
    '/cases/epstein-record.html': ['?view=network&fec=C00104299,C00428896', 'Money web for JPMorgan Chase and Deutsche Bank, which settled with victims (their PACs, 2025-2026 FEC filings)'],
    // D267: cases about a federal program that is still paid for today. The link opens the department or agency that runs it,
    // a dot on the Money web with its budget from USAspending.gov. That is its whole budget, not the program's own money.
    '/cases/hava.html': ['?view=network&hub=ELECTION+ASSISTANCE+COMMISSION', 'Money web for the Election Assistance Commission, which the Help America Vote Act created (its whole budget)'],
    '/cases/e-rate.html': ['?view=network&hub=FEDERAL+COMMUNICATIONS+COMMISSION', 'Money web for the FCC, which runs E-rate (its whole budget, not E-rate alone)'],
    '/cases/snap.html': ['?view=network&hub=DEPARTMENT+OF+AGRICULTURE', 'Money web for the Department of Agriculture, which runs SNAP (its whole budget, not SNAP alone)'],
    '/cases/wic.html': ['?view=network&hub=DEPARTMENT+OF+AGRICULTURE', 'Money web for the Department of Agriculture, which runs WIC (its whole budget, not WIC alone)'],
    '/cases/school-lunch.html': ['?view=network&hub=DEPARTMENT+OF+AGRICULTURE', 'Money web for the Department of Agriculture, which runs school lunch (its whole budget, not school lunch alone)'],
    '/cases/chip.html': ['?view=network&hub=DEPARTMENT+OF+HEALTH+AND+HUMAN+SERVICES', 'Money web for Health and Human Services, which runs CHIP (its whole budget, not CHIP alone)'],
    '/cases/vaccines-for-children.html': ['?view=network&hub=DEPARTMENT+OF+HEALTH+AND+HUMAN+SERVICES', 'Money web for Health and Human Services, home of the CDC, which runs Vaccines for Children (its whole budget, not this program alone)'],
    '/cases/community-health-centers.html': ['?view=network&hub=DEPARTMENT+OF+HEALTH+AND+HUMAN+SERVICES', 'Money web for Health and Human Services, home of HRSA, which funds health centers (its whole budget, not health centers alone)'],
    '/cases/welfare-reform-1996.html': ['?view=network&hub=DEPARTMENT+OF+HEALTH+AND+HUMAN+SERVICES', 'Money web for Health and Human Services, which runs TANF (its whole budget, not TANF alone)'],
    '/cases/pepfar.html': ['?view=network&hub=DEPARTMENT+OF+STATE', 'Money web for the State Department, which leads PEPFAR (its whole budget, not PEPFAR alone)'],
    '/cases/earned-income-tax-credit.html': ['?view=network&hub=DEPARTMENT+OF+THE+TREASURY', 'Money web for the Treasury, home of the IRS, which pays the EITC (its whole budget, not the EITC alone)'],
    '/cases/flood-insurance.html': ['?view=network&hub=DEPARTMENT+OF+HOMELAND+SECURITY', 'Money web for Homeland Security, home of FEMA, which runs flood insurance (its whole budget, not flood insurance alone)'],
    '/cases/interstate-highways.html': ['?view=network&hub=DEPARTMENT+OF+TRANSPORTATION', 'Money web for the Department of Transportation (its whole budget, not highways alone)'],
    '/cases/clean-water-act-319.html': ['?view=network&hub=ENVIRONMENTAL+PROTECTION+AGENCY', 'Money web for the EPA, which runs Section 319 grants (its whole budget, not Section 319 alone)'],
    '/cases/tar-creek.html': ['?view=network&hub=ENVIRONMENTAL+PROTECTION+AGENCY', 'Money web for the EPA, which runs Superfund (its whole budget, not Tar Creek alone)'],
    '/cases/title-ix.html': ['?view=network&hub=DEPARTMENT+OF+EDUCATION', 'Money web for the Department of Education, which enforces Title IX (its whole budget)'],
    '/cases/civil-asset-forfeiture.html': ['?view=network&hub=DEPARTMENT+OF+JUSTICE', 'Money web for the Justice Department, which runs the Assets Forfeiture Fund (its whole budget, not the fund alone)']
  };
  var NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

  function stateOf(p) {
    var m;
    if ((m = p.match(/^\/(?:guide|map)-([a-z]{2})\//))) return m[1].toUpperCase();
    if (/^\/(?:guide|map)\//.test(p)) return 'CO';
    if ((m = p.match(/^\/states\/([a-z-]+)\.html$/))) {
      var want = m[1].replace(/-/g, ' ');
      for (var k in NAMES) if (NAMES[k].toLowerCase() === want) return k;
    }
    if (/^\/results\//.test(p)) {
      var q = new URLSearchParams(location.search).get('state');
      if (q && NAMES[q.toUpperCase()]) return q.toUpperCase();
    }
    return '';
  }

  var href = '/money-trail/', label = 'See where the money goes on the Money Trail';
  var id = MEASURES[path], st = stateOf(path);
  // The trail page reads "MO-Amendment-3" as "MO-3", so IDs with a word in them go by their full key ("ballot:MO-Amendment-3").
  if (id) { href = '/money-trail/follow.html?measure=' + encodeURIComponent((/^[A-Z]{2}-(Amendment|Proposition|Measure)-/.test(id) ? 'ballot:' : '') + id); label = 'Money trail for this ballot measure'; }
  else if (CASES[path]) { href = '/money-trail/' + CASES[path][0]; label = CASES[path][1]; }
  else if (st) { href = '/money-trail/?view=states&state=' + st; label = 'Money trail for ' + NAMES[st]; }

  var SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, parent) {
    var n = document.createElementNS(SVG, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function draw() {
    var svg = s('svg', { viewBox: '0 16 960 128', 'aria-hidden': 'true', focusable: 'false', class: 'ftm-art' });
    var f = s('filter', { id: 'ftm-glow', x: '-150%', y: '-150%', width: '400%', height: '400%' }, s('defs', {}, svg));
    s('feGaussianBlur', { stdDeviation: '3', result: 'blur' }, f);
    var mg = s('feMerge', {}, f);
    s('feMergeNode', { in: 'blur' }, mg);
    s('feMergeNode', { in: 'SourceGraphic' }, mg);
    s('rect', { width: '960', height: '180', fill: '#061124' }, svg);
    s('path', { d: 'M 18 94 Q 42 85 65 80 C 120 66 245 115 333 77 C 361 56 391 63 434 92 C 488 128 530 119 590 109 C 658 95 693 97 741 108 C 793 123 832 97 879 87 Q 905 82 939 83',
      fill: 'none', stroke: '#96f9da', 'stroke-width': '2.5' }, svg);
    s('text', { x: '76', y: '87', 'font-family': 'Arial Black,Arial,sans-serif', 'font-weight': '900', 'font-size': '69', 'letter-spacing': '1', fill: '#fff' }, svg)
      .textContent = 'FOLLOW THE MONEY';
    [[60, 82], [360, 67], [438, 94], [535, 115], [640, 100], [758, 110], [879, 87]].forEach(function (c, i) {
      s('circle', { class: 'ftm-node ftm-n' + (i + 1), cx: String(c[0]), cy: String(c[1]), r: '8', stroke: '#a4ffe2', 'stroke-width': '3', fill: '#061124' }, svg);
    });
    s('path', { class: 'ftm-glint', d: 'M889 68v16m-8-8h16', stroke: '#ffd088', 'stroke-width': '2', filter: 'url(#ftm-glow)' }, svg);
    return svg;
  }

  function place() {
    if (document.querySelector('.ftm-tag')) return;
    var a = document.createElement('a');
    a.className = 'ftm-tag';
    a.href = href;
    a.appendChild(draw());
    var cap = document.createElement('span');
    cap.className = 'ftm-cap';
    cap.textContent = label;
    a.appendChild(cap);
    a.setAttribute('aria-label', 'Follow the money: ' + label);
    // Just above the page footer (inside or after the main text), so it sits at the end of what the page says.
    var foot = document.querySelector('main > footer, body > footer, footer.foot');
    var host = document.querySelector('main') || document.body;
    if (foot) foot.parentNode.insertBefore(a, foot); else host.appendChild(a);
  }
  if (!document.querySelector('link[href^="/follow-money.css"]')) {
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/follow-money.css?v=1';
    document.head.appendChild(css);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place); else place();
})();
