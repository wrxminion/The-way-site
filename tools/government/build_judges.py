#!/usr/bin/env python3
"""Every sitting federal judge, from the Federal Judicial Center's Biographical Directory of Article III Federal Judges.

Used by build_courts.py (run that one):
  python3 tools/government/build_courts.py <path to judges.csv>

judges.csv is the FJC's public export: https://www.fjc.gov/sites/default/files/history/judges.csv
Writes site/government/courts/judges/<slug>.html (one per sitting judge, including the justices)
and site/government/courts/court/<slug>.html (one per court, listing its judges).
Pages for judges who are no longer serving are removed so the folders always match the file.
"""
import csv
import json
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import ROOT, SITE_URL, e, long_date, page, slugify  # noqa: E402

OUT = os.path.join(ROOT, 'site', 'government', 'courts')
FJC = 'https://www.fjc.gov/history/judges'
FJC_FILE = 'https://www.fjc.gov/sites/default/files/history/judges.csv'
STATE_TO_CIRCUIT = {}  # filled by build_courts from its CIRCUITS table
STATE_NAMES = {}


def full_name(r):
    parts = [r['First Name'].strip(), r['Middle Name'].strip(), r['Last Name'].strip()]
    n = ' '.join(p for p in parts if p)
    suf = r['Suffix'].strip()
    return n + (', ' + suf if suf else '')


def court_slug(name):
    n = name.replace('U.S. ', '').replace('Supreme Court of the United States', 'Supreme Court')
    n = re.sub(r'\bfor the\b', '', n)
    return slugify(n)


def court_short(name):
    """'Northern District of California' style label used inside lists."""
    m = re.match(r'U\.S\. District Court for the (.+)$', name)
    if m:
        return m.group(1)
    m = re.match(r'U\.S\. Court of Appeals for the (.+)$', name)
    if m:
        return m.group(1)
    return name


def court_state(name):
    m = re.search(r'District of (?:the )?(.+)$', name)
    return m.group(1) if m and name.startswith('U.S. District Court') else None


def vote_words(r, i):
    vt = (r.get('Senate Vote Type (%d)' % i) or '').strip()
    an = (r.get('Ayes/Nays (%d)' % i) or '').strip()
    if an and '/' in an:
        a, n = [x.strip() for x in an.split('/', 1)]
        return 'Roll call, %s to %s' % (a, n)
    if vt:
        return vt[0].upper() + vt[1:].lower()
    return ''


def date_words(s):
    s = (s or '').strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return long_date(s)
    return s


TODAY = datetime.date.today()
FUTURE = {}       # filled by build(): (court, last name) -> vacancy row
FUTURE_META = {}


def years_since(iso):
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return ''
    y = int((TODAY - d).days // 365.25)
    return 'Less than 1 year' if y < 1 else '%d year%s' % (y, '' if y == 1 else 's')


def future_for(j):
    return FUTURE.get((j['court'], j['r']['Last Name'].strip().lower()))

DIR_WORD = {'N': 'Northern', 'S': 'Southern', 'E': 'Eastern', 'W': 'Western', 'M': 'Middle', 'C': 'Central'}
ORD = {1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', 6: 'Sixth', 7: 'Seventh', 8: 'Eighth', 9: 'Ninth',
       10: 'Tenth', 11: 'Eleventh'}


def uscourts_court(code, state_names):
    """'04 - NC-E' -> FJC court name. Returns '' when the code is not understood."""
    m = re.match(r'\s*(\w+)\s*-\s*([A-Z]+)(?:-([A-Z]))?\s*$', code or '')
    if not m:
        return ''
    circ, place, d = m.groups()
    if place == 'CCA':
        if circ.isdigit() and int(circ) in ORD:
            return 'U.S. Court of Appeals for the %s Circuit' % ORD[int(circ)]
        if circ.upper() == 'DC':
            return 'U.S. Court of Appeals for the District of Columbia Circuit'
        if circ.upper() in ('FED', 'FC'):
            return 'U.S. Court of Appeals for the Federal Circuit'
        return ''
    if place == 'IT':
        return 'U.S. Court of International Trade'
    name = state_names.get(place) or {'PR': 'Puerto Rico'}.get(place)
    if not name:
        return ''
    if d:
        return 'U.S. District Court for the %s District of %s' % (DIR_WORD.get(d, d), name)
    return 'U.S. District Court for the District of %s' % name


def mdy(s):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})$', (s or '').strip())
    return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2))) if m else ''


def person(n):
    """'Osteen Jr.,William L.' -> ('osteen', 'William L. Osteen Jr.')"""
    last, _, first = (n or '').partition(',')
    last = last.strip()
    core = re.sub(r'\s+(Jr\.?|Sr\.?|II|III|IV)$', '', last).strip()
    return core.lower(), (first.strip() + ' ' + last).strip()


def load_future(path, state_names, judges):
    if not os.path.exists(path):
        return
    data = json.load(open(path, encoding='utf-8'))
    FUTURE_META.update({'source': data['source'], 'as_of': mdy(data['as_of']) or data['as_of'], 'rows': []})
    by_name = {}
    for j in judges:
        by_name.setdefault(j['r']['Last Name'].strip().lower(), []).append(j)
    for row in data['rows']:
        court = uscourts_court(row['court'], state_names)
        last, shown = person(row['incumbent'])
        date = mdy(row['date'])
        reason = row['reason'].strip().lower()
        when = long_date(date) if date else 'a date not yet set'
        if reason.startswith('senior'):
            words, short = 'Will take senior status on %s.' % when, 'Senior status ' + (long_date(date) if date else 'date not set')
        elif reason.startswith('retir'):
            words, short = 'Will retire on %s.' % when, 'Retiring ' + (long_date(date) if date else 'date not set')
        elif reason.startswith('elevat'):
            words, short = 'Nominated to another court. This seat opens if the Senate confirms.', 'Nominated to another court'
        else:
            words, short = '%s, %s.' % (row['reason'].strip(), when), row['reason'].strip()
        nom_last, nom_shown = person(row['nominee']) if row['nominee'].strip() else ('', '')
        nominee = None
        if nom_shown:
            cand = [j for j in by_name.get(nom_last, [])]
            nominee = {'name': nom_shown, 'date': mdy(row['nomination_date']), 'slug': cand[0]['slug'] if len(cand) == 1 else ''}
            words += ' The president has nominated %s for this seat%s.' % (
                nom_shown, (' on ' + long_date(nominee['date'])) if nominee['date'] else '')
        rec = {'court': court, 'last': last, 'name': shown, 'words': words, 'short': short, 'nominee': nominee, 'date': date,
               'reason': row['reason'].strip(), 'raw_court': row['court']}
        match = [j for j in by_name.get(last, []) if j['court'] == court]
        rec['slug'] = match[0]['slug'] if len(match) == 1 else ''
        if court:
            FUTURE[(court, last)] = rec
        FUTURE_META['rows'].append(rec)



def split_items(text):
    """FJC joins items with '; '. A piece starting in lower case continues the item before it."""
    out = []
    for c in (text or '').split(';'):
        c = c.strip()
        if not c:
            continue
        if out and c[0].islower():
            out[-1] += '; ' + c
        else:
            out.append(c)
    return out


def load(path):
    """Return (judges, courts). judges: list of dicts for each sitting appointment (one per person: their current seat)."""
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig', errors='replace')))
    judges = []
    for r in rows:
        if r['Death Year'].strip():
            continue
        cur = [i for i in range(1, 7) if (r.get('Court Name (%d)' % i) or '').strip() and not (r.get('Termination (%d)' % i) or '').strip()]
        if not cur:
            continue
        i = cur[-1]
        judges.append({'r': r, 'i': i, 'name': full_name(r), 'court': r['Court Name (%d)' % i].strip(),
                       'type': r['Court Type (%d)' % i].strip(), 'title': r['Appointment Title (%d)' % i].strip(),
                       'senior': (r['Senior Status Date (%d)' % i] or '').strip(),
                       'commission': (r['Commission Date (%d)' % i] or '').strip(),
                       'president': (r['Appointing President (%d)' % i] or '').strip()})
    used = set()
    for j in sorted(judges, key=lambda j: j['r']['jid']):
        s = slugify(j['name'].split(',')[0])
        if s in used:
            s += '-' + j['r']['jid']
        used.add(s)
        j['slug'] = s
    courts = {}
    for j in judges:
        courts.setdefault(j['court'], []).append(j)
    latest = max((r['Commission Date (%d)' % i] or '') for r in rows for i in range(1, 7))
    return judges, courts, latest


def chief_now(j):
    r, i = j['r'], j['i']
    for b, en in (('Service as Chief Judge, Begin (%d)', 'Service as Chief Judge, End (%d)'),
                  ('2nd Service as Chief Judge, Begin (%d)', '2nd Service as Chief Judge, End (%d)')):
        if (r.get(b % i) or '').strip() and not (r.get(en % i) or '').strip():
            return r[b % i].strip()
    return ''


def judge_page(j, file_date, keep_justice_title=None):
    r, i = j['r'], j['i']
    court = j['court']
    cslug = court_slug(court)
    is_sc = j['type'] == 'Supreme Court'
    role = j['title'] if is_sc else ('Judge' if j['title'] == 'Judge' else j['title'])
    chief = chief_now(j)
    badges = []
    if chief and not is_sc:
        badges.append('Chief judge since %s' % date_words(chief)[-4:])
    if j['senior']:
        badges.append('Senior status since %s' % date_words(j['senior']))
    badge_html = ''.join('<p class="gv-lead-role">%s</p> ' % e(b) for b in badges)

    tiles = [('Appointed by', 'President ' + j['president'] if j['president'] and not j['president'].startswith('None') else j['president'] or 'Not listed')]
    conf = date_words(r['Confirmation Date (%d)' % i])
    if conf:
        v = vote_words(r, i)
        tiles.append(('Confirmed by the Senate', conf + ('. ' + v if v else '')))
    if j['commission']:
        tiles.append(('Took office (commission)', date_words(j['commission'])))
        tiles.append(('Years on this court', years_since(j['commission'])))
    first = min((r.get('Commission Date (%d)' % k) or '9999').strip() or '9999' for k in range(1, 7))
    if first != '9999' and first != j['commission']:
        tiles.append(('Years as a federal judge', years_since(first) + ' (since %s)' % first[:4]))
    fv = future_for(j)
    if fv:
        tiles.append(('Announced departure', fv['words']))
    tiles.append(('Status', 'Retired from the Supreme Court' if j.get('retired') else ('Senior status since ' + date_words(j['senior'])) if j['senior'] else 'Active'))
    born = ', '.join(x for x in [r['Birth City'].strip(), r['Birth State'].strip()] if x)
    if r['Birth Year'].strip():
        tiles.append(('Born', r['Birth Year'].strip() + (' in ' + born if born else '')))
    tile_html = ''.join('<div class="gv-tile"><span>%s</span><strong>%s</strong></div>' % (e(a), e(b)) for a, b in tiles)

    steps = []
    for lab, key in (('Nominated', 'Nomination Date'), ('Sent to the Judiciary Committee', 'Committee Referral Date'),
                     ('Committee hearing', 'Hearing Date'), ('Committee action', 'Committee Action Date'),
                     ('Confirmed by the Senate', 'Confirmation Date'), ('Received commission', 'Commission Date')):
        v = (r.get('%s (%d)' % (key, i)) or '').strip()
        if v:
            extra = ''
            if key == 'Committee Action Date' and (r.get('Judiciary Committee Action (%d)' % i) or '').strip():
                extra = ': ' + r['Judiciary Committee Action (%d)' % i].strip()
            if key == 'Confirmation Date':
                vv = vote_words(r, i)
                extra = (': ' + vv) if vv else ''
            steps.append('<li><span class="gv-role">%s</span>%s%s</li>' % (e(lab), e(date_words(v)), e(extra)))
    path_html = ''
    if steps:
        path_html = ('<details open><summary>How they got this seat</summary><div class="gw-detail"><ol class="gv-steps">%s</ol>'
                     '<p class="gv-small">The president nominates, the Senate Judiciary Committee reviews, and the full Senate confirms or rejects.</p>'
                     '</div></details>' % ''.join(steps))

    earlier = []
    for k in range(1, 7):
        cn = (r.get('Court Name (%d)' % k) or '').strip()
        if not cn or k == i:
            continue
        t = (r.get('Termination Date (%d)' % k) or '').strip()
        c = (r.get('Commission Date (%d)' % k) or '').strip()
        earlier.append('<li>%s, %s. Appointed by President %s. %s to %s.</li>' % (
            e(r.get('Appointment Title (%d)' % k, '').strip() or 'Judge'), e(cn), e((r.get('Appointing President (%d)' % k) or '').strip()),
            e(c[:4]), e(t[:4] or 'now')))
    for k in range(1, 5):
        o = (r.get('Other Federal Judicial Service (%d)' % k) or '').strip()
        if o:
            earlier.append('<li>%s</li>' % e(o))
    earlier_html = ('<details><summary>Other federal judicial service (%d)</summary><div class="gw-detail"><ul class="gv-list">%s</ul></div></details>' % (
        len(earlier), ''.join(earlier))) if earlier else ''

    edu = []
    for k in range(1, 6):
        s = (r.get('School (%d)' % k) or '').strip()
        if s:
            d = (r.get('Degree (%d)' % k) or '').strip()
            y = (r.get('Degree Year (%d)' % k) or '').strip()
            edu.append('<li>%s%s%s</li>' % (e(s), (', ' + e(d)) if d else '', (', ' + e(y)) if y else ''))
    edu_html = ('<details><summary>Education</summary><div class="gw-detail"><ul class="gv-list">%s</ul></div></details>' % ''.join(edu)) if edu else ''

    career = split_items(r.get('Professional Career'))
    career_html = ('<details><summary>Career before this seat (%d)</summary><div class="gw-detail"><ul class="gv-list">%s</ul></div></details>' % (
        len(career), ''.join('<li>%s</li>' % e(c) for c in career))) if career else ''
    other = split_items(r.get('Other Nominations/Recess Appointments'))
    other_html = ('<details><summary>Other nominations</summary><div class="gw-detail"><ul class="gv-list">%s</ul></div></details>' % ''.join(
        '<li>%s</li>' % e(c) for c in other)) if other else ''

    body = ('<header class="gv-hero"><p class="gw-eyebrow">%s</p><h1>%s</h1>'
            '<p class="gv-key-fact">%s on the <strong>%s</strong></p>%s</header>'
            '<section class="gv-sec"><div class="gv-tiles">%s</div><p class="gv-small">Federal judges have no fixed term. They hold office '
            'during good behavior, so they serve until they retire or take senior status, resign, die, or are impeached and removed. '
            '<a class="gw-source" href="https://www.archives.gov/founding-docs/constitution-transcript">Source: Constitution, Article III ↗</a></p>'
            '<p class="gw-status">%s</p></section>'
            '<section class="gv-sec"><h2>Go deeper</h2>%s%s%s%s%s'
            '<p><a class="gw-source" href="https://www.fjc.gov/node/%s">This judge in the Federal Judicial Center directory ↗</a></p></section>'
            '<nav class="gv-next" aria-label="Keep exploring"><a href="../court/%s.html">← All judges on this court</a> · '
            '<a href="../#judges">Every federal judge</a> · <a href="../">The federal courts</a></nav>') % (
        e(court_short(court) if not is_sc else 'Supreme Court of the United States'), e(j['name']), e(role), e(court), badge_html,
        tile_html, e(SOURCE_NOTE), path_html, earlier_html, edu_html, career_html, other_html, e(r['nid'].strip()), cslug)
    desc = '%s, %s on the %s. Appointment, Senate confirmation, education and career, from the Federal Judicial Center.' % (j['name'], role, court)
    crumbs = [('The Way', '/'), ('Government', '/how-government-works.html'), ('Federal courts', '../'),
              (court_short(court) if not is_sc else 'Supreme Court', '../court/%s.html' % cslug), (j['name'], None)]
    return page(j['name'], desc, '%s/government/courts/judges/%s.html' % (SITE_URL, j['slug']), crumbs, body, 3)


SOURCE_NOTE = ''


def court_page(court, js, circuit_courts=None):
    is_sc = court.startswith('Supreme Court')
    retired = sorted([j for j in js if j.get('retired')], key=lambda j: j['commission'])
    js = [j for j in js if not j.get('retired')]
    active = sorted([j for j in js if not j['senior']], key=lambda j: (j['commission'], j['name']))
    senior = sorted([j for j in js if j['senior']], key=lambda j: (j['commission'], j['name']))

    def li(j):
        chief = chief_now(j)
        tag = ' <em>Chief Judge</em>' if chief and not is_sc else ''
        if is_sc and j['title'].startswith('Chief'):
            tag = ' <em>Chief Justice</em>'
        fv = future_for(j)
        fv_html = (' <em class="gv-leaving">%s</em>' % e(fv['short'])) if fv else ''
        return '<li><a href="../judges/%s.html">%s</a>%s%s <span class="gv-muted">Appointed by %s, took office %s (%s)</span></li>' % (
            j['slug'], e(j['name']), tag, fv_html, e(j['president']), e(j['commission'][:4]), e(years_since(j['commission']).lower()))
    parts = ['<section class="gv-sec"><h2>Active judges</h2><ul class="gv-list">%s</ul></section>' % ''.join(li(j) for j in active)]
    if senior:
        parts.append('<section class="gv-sec"><h2>Judges on senior status</h2><p class="gv-small">These judges have taken senior status '
                     'and are still listed as serving in the directory.</p><ul class="gv-list">%s</ul></section>' % ''.join(li(j) for j in senior))
    leaving = [f for f in FUTURE_META.get('rows', []) if f['court'] == court]
    if leaving:
        lis = ''.join('<li>%s: %s</li>' % (('<a href="../judges/%s.html">%s</a>' % (f['slug'], e(f['name']))) if f['slug'] else e(f['name']), e(f['words']))
                      for f in leaving)
        parts.insert(0, '<section class="gv-sec"><h2>Announced departures</h2><ul class="gv-list">%s</ul>'
                        '<p class="gv-small">As of %s. <a class="gw-source" href="%s">Source: U.S. Courts, future judicial vacancies ↗</a></p></section>' % (
                            lis, e(date_words(FUTURE_META['as_of'])), e(FUTURE_META['source'])))
    if retired:
        parts.append('<section class="gv-sec"><h2>Retired justices</h2><p class="gv-small">They have retired from the Supreme Court. '
                     'The judge directory still lists them without an end date.</p><ul class="gv-list">%s</ul></section>' % ''.join(li(j) for j in retired))
    if circuit_courts:
        parts.append('<section class="gv-sec"><h2>District courts in this circuit</h2><p class="gv-small">Appeals from these trial courts '
                     'go to this court.</p><ul class="gv-list">%s</ul></section>' % ''.join(
                         '<li><a href="%s.html">%s</a> <span class="gv-muted">%d judges</span></li>' % (court_slug(c), e(court_short(c)), n)
                         for c, n in circuit_courts))
    word = 'justices' if is_sc else 'judges'
    body = ('<header class="gv-hero"><p class="gw-eyebrow">%s</p><p class="gv-huge">%d <span>%s serving now</span></p><h1>%s</h1>'
            '<p class="gv-lede">%d active and %d on senior status. Tap a name to open that %s’s page.</p>'
            '<p class="gw-status">%s</p></header>%s'
            '<nav class="gv-next" aria-label="Keep exploring"><a href="../#judges">← Every federal court</a> · <a href="../">The federal courts</a></nav>') % (
        'Supreme Court' if is_sc else ('Court of appeals' if 'Appeals' in court else ('District court' if 'District Court' in court else 'National court')),
        len(js), word, e(court), len(active), len(senior), 'justice' if is_sc else 'judge', e(SOURCE_NOTE), ''.join(parts))
    return page(court, 'Every judge serving on the %s, with who appointed them and when, from the Federal Judicial Center.' % court,
                '%s/government/courts/court/%s.html' % (SITE_URL, court_slug(court)),
                [('The Way', '/'), ('Government', '/how-government-works.html'), ('Federal courts', '../'), (court_short(court), None)], body, 3)


def build(csv_path, circuits, names, current_justices=()):
    """circuits: list of (cid, name, states, territories, judgeships). Returns data for the courts index."""
    global SOURCE_NOTE
    judges, courts, latest = load(csv_path)
    for j in judges:
        j['retired'] = j['type'] == 'Supreme Court' and j['r']['Last Name'].strip() not in current_justices
    for sub in ('judges', 'court'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    load_future(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'future-vacancies.json'), names, judges)
    got = os.environ.get('FJC_DOWNLOADED') or datetime.date.fromtimestamp(os.path.getmtime(csv_path)).isoformat()
    SOURCE_NOTE = ('Source: the Federal Judicial Center’s Biographical Directory of Article III Federal Judges (public file downloaded %s; '
                   'newest commission in it: %s). Nothing here rates or ranks a judge.' % (long_date(got), long_date(latest)))
    for sub in ('judges', 'court'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    written = set()
    for j in judges:
        with open(os.path.join(OUT, 'judges', j['slug'] + '.html'), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(judge_page(j, got))
        written.add(j['slug'] + '.html')
    for fn in os.listdir(os.path.join(OUT, 'judges')):
        if fn.endswith('.html') and fn not in written:
            os.remove(os.path.join(OUT, 'judges', fn))

    # which district courts sit in which circuit
    name_to_code = {v: k for k, v in names.items()}
    by_circuit = {}
    for c in courts:
        st = court_state(c)
        if st:
            code = name_to_code.get(st) or {'Puerto Rico': 'PR', 'Columbia': 'DC'}.get(st)
            cid = next((x[0] for x in circuits if code in x[2]), None)
            if code == 'PR':
                cid = '1'
            by_circuit.setdefault(cid, []).append(c)
    appeals = {('dc' if 'District of Columbia Circuit' in c else 'fed' if 'Federal Circuit' in c else None): c
               for c in courts if c.startswith('U.S. Court of Appeals')}
    num = {'First': '1', 'Second': '2', 'Third': '3', 'Fourth': '4', 'Fifth': '5', 'Sixth': '6', 'Seventh': '7', 'Eighth': '8',
           'Ninth': '9', 'Tenth': '10', 'Eleventh': '11'}
    for c in courts:
        m = re.match(r'U\.S\. Court of Appeals for the (\w+) Circuit$', c)
        if m and m.group(1) in num:
            appeals[num[m.group(1)]] = c
    appeals.pop(None, None)
    cwritten = set()
    for c, js in courts.items():
        cc = None
        for cid, ac in appeals.items():
            if ac == c:
                cc = [(d, len(courts[d])) for d in sorted(by_circuit.get(cid, []), key=court_short)]
        with open(os.path.join(OUT, 'court', court_slug(c) + '.html'), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(court_page(c, js, cc))
        cwritten.add(court_slug(c) + '.html')
    for fn in os.listdir(os.path.join(OUT, 'court')):
        if fn.endswith('.html') and fn not in cwritten:
            os.remove(os.path.join(OUT, 'court', fn))
    return {'judges': judges, 'courts': courts, 'appeals': appeals, 'by_circuit': by_circuit, 'note': SOURCE_NOTE}
