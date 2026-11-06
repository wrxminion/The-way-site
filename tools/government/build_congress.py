#!/usr/bin/env python3
"""Builds the Congress layer of the Government page.

Reads the public-domain congress-legislators dataset (github.com/unitedstates/congress-legislators,
compiled from official House, Senate and Congress.gov records) and writes:
  site/government/congress/index.html          chamber maps, leadership, committees, every member, the Capitol
  site/government/congress/members/<slug>.html one page per member of Congress

Run (from the repo root, with a fresh checkout of the dataset somewhere):
  git clone --depth 1 https://github.com/unitedstates/congress-legislators ../congress-legislators
  python3 tools/government/build_congress.py ../congress-legislators

Needs Python 3 and PyYAML. Old member pages that are no longer current are removed from
site/government/congress/members/ so the folder always matches the dataset.
"""
import datetime
import html
import math
import os
import re
import subprocess
import sys
import unicodedata

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'site', 'government', 'congress')
SITE_URL = 'https://michiinstitute.com'
CSS_V = '2'
JS_V = '1'

STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado',
    'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina',
    'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
    'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
    'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming',
}
TERRITORIES = {
    'DC': 'District of Columbia', 'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'U.S. Virgin Islands',
    'AS': 'American Samoa', 'MP': 'Northern Mariana Islands',
}
ALL_PLACES = dict(STATES, **TERRITORIES)
PARTY_CLASS = {'Democrat': 'p-d', 'Republican': 'p-r', 'Independent': 'p-i'}
PARTY_PLURAL = {'Democrat': 'Democrats', 'Republican': 'Republicans', 'Independent': 'independents'}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']

e = lambda s: html.escape(str(s), quote=True)


def long_date(iso):
    d = datetime.date.fromisoformat(iso)
    return '%s %d, %d' % (MONTHS[d.month - 1], d.day, d.year)


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suf = 'th'
    else:
        suf = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return '%d%s' % (n, suf)


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def full_name(m):
    n = m['name']
    if n.get('official_full'):
        return n['official_full']
    parts = [n.get('first', ''), n.get('middle', ''), n.get('last', '')]
    name = ' '.join(p for p in parts if p)
    return name + (', ' + n['suffix'] if n.get('suffix') else '')


def sort_name(m):
    return (m['name'].get('last', ''), m['name'].get('first', ''))


def seat_label(t):
    """Short label for a term's seat, e.g. 'Washington' or "Colorado's 8th District"."""
    place = ALL_PLACES.get(t['state'], t['state'])
    if t['type'] == 'sen':
        return place
    if t['state'] in TERRITORIES:
        return place
    d = t.get('district', 0)
    return place + (' at-large' if d == 0 else "'s " + ordinal(d) + ' District')


def role_title(t):
    if t['type'] == 'sen':
        return 'U.S. Senator'
    if t['state'] == 'PR':
        return 'Resident Commissioner'
    if t['state'] in TERRITORIES:
        return 'Delegate'
    return 'U.S. Representative'


def party_words(t):
    p = t.get('party', 'Unknown')
    if p == 'Independent' and t.get('caucus'):
        return 'Independent (caucuses with the %ss)' % t['caucus']
    return p


def election_day(year):
    """Federal Election Day: the Tuesday after the first Monday in November."""
    d = datetime.date(year, 11, 1)
    while d.weekday() != 0:
        d += datetime.timedelta(days=1)
    return d + datetime.timedelta(days=1)


def ballot_tile(year):
    day = election_day(year)
    when = '%s %d, %d' % (MONTHS[day.month - 1], day.day, day.year)
    if day <= datetime.date.today():
        return ('Seat was on the ballot', when + '. The winner takes office January 3, %d.' % (year + 1))
    return ('Seat is next on the ballot', when)


def member_slugs(L):
    """bioguide id -> page slug (name-state), stable across builds."""
    slugs, used = {}, set()
    for m in sorted(L, key=lambda m: m['id']['bioguide']):
        t = m['terms'][-1]
        s = slugify(full_name(m).split(',')[0]) + '-' + t['state'].lower()
        if s in used:
            s += '-' + m['id']['bioguide'].lower()
        used.add(s)
        slugs[m['id']['bioguide']] = s
    return slugs


def git_info(path):
    try:
        out = subprocess.check_output(['git', '-C', path, 'log', '-1', '--format=%h %cs'], text=True).split()
        return out[0], out[1]
    except Exception:
        return 'unknown', datetime.date.today().isoformat()


# ---------- page shell ----------

def page(title, desc, canonical, crumbs, body, depth):
    up = '../' * depth  # unused for assets (absolute paths), kept for clarity
    crumb_html = ' / '.join(('<a href="%s">%s</a>' % (e(h), e(t))) if h else e(t) for t, h in crumbs)
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<meta name="color-scheme" content="dark">\n<meta name="theme-color" content="#176b85">\n'
            '<title>%s - The Way</title>\n<meta name="description" content="%s">\n'
            '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
            '<link rel="stylesheet" href="/pages-style.css?v=3">\n'
            '<link rel="stylesheet" href="/members/waybar.css?v=29">\n'
            '<link rel="stylesheet" href="/government-works.css?v=2">\n'
            '<link rel="stylesheet" href="/government/government.css?v=%s">\n'
            '<link rel="canonical" href="%s">\n'
            '<meta property="og:type" content="website">\n<meta property="og:title" content="%s - The Way">\n'
            '<meta property="og:description" content="%s">\n<meta property="og:url" content="%s">\n'
            '<meta property="og:site_name" content="The Way | Michi Institute">\n'
            '<meta property="og:image" content="https://michiinstitute.com/og-logo.png">\n'
            '<meta name="twitter:card" content="summary_large_image">\n</head>\n<body>\n'
            '<header id="waybar" class="waybar"><a class="wb-logo" href="/">The Way</a>'
            '<nav class="wb-right" aria-label="Sign in"><a class="wb-pill" href="/members/">Sign in</a></nav></header>\n'
            '<a class="gw-skip" href="#top">Skip to content</a><main class="gw gv" id="top">\n'
            '<nav class="crumbs" aria-label="Breadcrumb">%s</nav>\n%s\n</main>'
            '<script src="/government/government.js?v=%s" defer></script>'
            '<script src="/members/waybar.js?v=75" defer></script></body></html>\n') % (
        e(title), e(desc), CSS_V, e(canonical), e(title), e(desc), e(canonical), crumb_html, body, JS_V)


# ---------- chamber diagram ----------

def hemicycle(seats, width=600, rows=None, r_in=0.36):
    """Place len(seats) dots on concentric half circles. seats: list of dicts (in left-to-right order)."""
    n = len(seats)
    if rows is None:
        rows = max(4, int(round(math.sqrt(n / 2.2))))
    cx, cy = width / 2, width / 2 * 0.98
    r_out = width / 2 * 0.96
    radii = [r_out * (r_in + (1 - r_in) * i / (rows - 1)) for i in range(rows)]
    total = sum(radii)
    counts = [int(n * r / total) for r in radii]
    i = rows - 1
    while sum(counts) < n:
        counts[i] += 1
        i = (i - 1) % rows
    gap = (radii[-1] - radii[0]) / max(rows - 1, 1)
    dot = min(gap * 0.42, math.pi * radii[0] / max(counts[0], 1) * 0.42)
    pts = []
    for r, c in zip(radii, counts):
        for k in range(c):
            a = math.pi - (math.pi * (k + 0.5) / c)
            pts.append((a, r, cx + r * math.cos(a), cy - r * math.sin(a)))
    pts.sort(key=lambda p: (-p[0], p[1]))
    out = []
    for seat, (a, r, x, y) in zip(seats, pts):
        circ = '<circle cx="%.1f" cy="%.1f" r="%.1f"/>' % (x, y, dot)
        if seat.get('href'):
            out.append('<a href="%s" class="%s" aria-label="%s">%s<title>%s</title></a>' % (
                e(seat['href']), seat['cls'], e(seat['label']), circ, e(seat['label'])))
        else:
            out.append('<g class="%s" role="img" aria-label="%s">%s<title>%s</title></g>' % (
                seat['cls'], e(seat['label']), circ, e(seat['label'])))
    h = cy + dot + 4
    return '<svg class="gv-hemi" viewBox="0 0 %d %.0f" role="group" aria-label="%s">%s</svg>' % (
        width, h, '%d seats' % n, ''.join(out))


def chamber_seats(members, slugs, voting_total=None, prefix='members/'):
    order = {'Democrat': 0, 'Independent': 1, 'Republican': 3}
    ms = sorted(members, key=lambda m: (order.get(m['terms'][-1].get('party'), 2),
                                        m['terms'][-1]['state'], m['terms'][-1].get('district', 0)))
    seats = []
    for m in ms:
        t = m['terms'][-1]
        seats.append({'href': prefix + slugs[m['id']['bioguide']] + '.html',
                      'cls': PARTY_CLASS.get(t.get('party'), 'p-o'),
                      'label': '%s, %s, %s' % (full_name(m), t.get('party', ''), seat_label(t))})
    if voting_total and voting_total > len(seats):
        vac = [{'cls': 'p-v', 'label': 'Vacant seat on the data date'}] * (voting_total - len(seats))
        # vacant seats sit between the groups so they are easy to spot
        idx = sum(1 for s in seats if s['cls'] in ('p-d', 'p-i'))
        seats = seats[:idx] + vac + seats[idx:]
    return seats


def legend(counts):
    items = []
    for party, cls in (('Democrat', 'p-d'), ('Independent', 'p-i'), ('Republican', 'p-r')):
        if counts.get(party):
            items.append('<li><span class="gv-key %s"></span>%d %s</li>' % (
                cls, counts[party], PARTY_PLURAL[party] if counts[party] != 1 else party.lower() if party == 'Independent' else party))
    if counts.get('vacant'):
        items.append('<li><span class="gv-key p-v"></span>%d vacant</li>' % counts['vacant'])
    return '<ul class="gv-legend">%s</ul>' % ''.join(items)


# ---------- build ----------

def main():
    if len(sys.argv) < 2:
        sys.exit('usage: build_congress.py <path to congress-legislators checkout>')
    src = sys.argv[1]
    commit, data_date = git_info(src)
    load = lambda f: yaml.safe_load(open(os.path.join(src, f), encoding='utf-8'))
    L = load('legislators-current.yaml')
    C = load('committees-current.yaml')
    M = load('committee-membership-current.yaml')
    data_long = long_date(data_date)

    slugs = member_slugs(L)
    by_id = {m['id']['bioguide']: m for m in L}

    sen = [m for m in L if m['terms'][-1]['type'] == 'sen']
    reps = [m for m in L if m['terms'][-1]['type'] == 'rep']
    house_voting = [m for m in reps if m['terms'][-1]['state'] not in TERRITORIES]
    delegates = [m for m in reps if m['terms'][-1]['state'] in TERRITORIES]

    def pcount(ms):
        c = {}
        for m in ms:
            p = m['terms'][-1].get('party', 'Other')
            c[p] = c.get(p, 0) + 1
        return c
    sc, hc = pcount(sen), pcount(house_voting)
    hc['vacant'] = 435 - len(house_voting)
    sc['vacant'] = 100 - len(sen)

    # committees: membership per member
    comm_by_id = {}
    for c in C:
        comm_by_id[c['thomas_id']] = (c, None)
        for sc_ in c.get('subcommittees', []) or []:
            comm_by_id[c['thomas_id'] + sc_['thomas_id']] = (c, sc_)
    member_comms = {}
    for cid, rows in M.items():
        if cid not in comm_by_id:
            continue
        for r in rows or []:
            member_comms.setdefault(r.get('bioguide'), []).append((cid, r))

    def comm_name(cid):
        c, s = comm_by_id[cid]
        return c['name'] if s is None else s['name'] + ' (subcommittee of ' + c['name'] + ')'

    def comm_short_name(cid):
        c, s = comm_by_id[cid]
        return c['name'] if s is None else s['name']

    os.makedirs(os.path.join(OUT, 'members'), exist_ok=True)
    source_note = ('Member data: the congress-legislators dataset, a public-domain list compiled from official House, '
                   'Senate and Congress.gov records (snapshot %s, version %s).' % (data_long, commit))
    ds_link = '<a class="gw-source" href="https://github.com/unitedstates/congress-legislators">Source: congress-legislators dataset ↗</a>'

    # ---------- member pages ----------
    written = set()
    for m in L:
        bid = m['id']['bioguide']
        t = m['terms'][-1]
        name = full_name(m)
        role = role_title(t)
        seat = seat_label(t)
        chamber = 'Senate' if t['type'] == 'sen' else 'House'
        first_any = m['terms'][0]['start']
        first_here = next(x['start'] for x in m['terms'] if x['type'] == t['type'])
        yrs = int((datetime.date.fromisoformat(data_date) - datetime.date.fromisoformat(first_any)).days // 365.25)
        end = t['end']
        next_election = int(end[:4]) - 1
        fec = m['id'].get('fec') or []

        tiles = [
            ('Party', party_words(t)),
            ('Current term ends', long_date(end)),
            ballot_tile(next_election),
            ('First took office in Congress', long_date(first_any)),
        ]
        if first_here != first_any:
            tiles.append(('First took office in the ' + chamber, long_date(first_here)))
        if t['type'] == 'sen':
            tiles.append(('Senate seat class', 'Class %d (%s senator)' % (t['class'], t.get('state_rank', '')) if t.get('state_rank') else 'Class %d' % t['class']))
        tile_html = ''.join('<div class="gv-tile"><span>%s</span><strong>%s</strong></div>' % (e(a), e(b)) for a, b in tiles)

        lead = [r for r in m.get('leadership_roles', []) or [] if not r.get('end')]
        lead_html = ''
        if lead:
            lead_html = '<p class="gv-lead-role">%s</p>' % ' · '.join(e(r['title']) for r in lead)

        # committees
        comms = sorted(member_comms.get(bid, []), key=lambda x: (comm_by_id[x[0]][1] is not None, comm_name(x[0])))
        if comms:
            li = []
            for cid, r in comms:
                c, s = comm_by_id[cid]
                title = (' <em>%s</em>' % e(r['title'])) if r.get('title') else ''
                li.append('<li%s><a href="../#c-%s">%s</a>%s</li>' % (
                    ' class="gv-sub"' if s else '', e(c['thomas_id']), e(comm_short_name(cid)) if s is None else e(s['name']) + ' <span class="gv-muted">(' + e(c['name']) + ')</span>', title))
            comm_html = ('<details open><summary>Committees (%d)</summary><div class="gw-detail"><ul class="gv-list">%s</ul>%s</div></details>'
                         % (len(comms), ''.join(li), ds_link))
        else:
            comm_html = '<details><summary>Committees</summary><div class="gw-detail"><p>No committee assignments are listed for this member in the dataset snapshot.</p>%s</div></details>' % ds_link

        # contact
        contact = []
        if t.get('address'):
            contact.append('<p><strong>Washington office:</strong> %s</p>' % e(t['address']))
        if t.get('phone'):
            contact.append('<p><strong>Phone:</strong> <a href="tel:+1%s">%s</a></p>' % (e(t['phone'].replace('-', '')), e(t['phone'])))
        links = []
        if t.get('url'):
            links.append('<a href="%s">Official website ↗</a>' % e(t['url']))
        if t.get('contact_form'):
            links.append('<a href="%s">Contact form ↗</a>' % e(t['contact_form']))
        if links:
            contact.append('<p class="gv-links">%s</p>' % ' '.join(links))
        if not contact:
            contact.append('<p>No office contact is listed in the dataset snapshot. The Capitol Switchboard can connect you: <a href="tel:+12022243121">202-224-3121</a>.</p>')

        # terms
        trows = []
        for x in reversed(m['terms']):
            trows.append('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s to %s</td></tr>' % (
                'Senate' if x['type'] == 'sen' else 'House', e(seat_label(x)), e(x.get('party', '')),
                e(x['start'][:4]), e(x['end'][:4])))
        terms_html = ('<details><summary>Every term in Congress (%d)</summary><div class="gw-detail gv-scroll">'
                      '<table class="gv-table"><thead><tr><th>Chamber</th><th>Seat</th><th>Party</th><th>Years</th></tr></thead>'
                      '<tbody>%s</tbody></table>%s</div></details>' % (len(m['terms']), ''.join(trows), ds_link))

        # official records
        rec = ['<li><a href="https://bioguide.congress.gov/search/bio/%s">Official biography (Biographical Directory of Congress) ↗</a></li>' % e(bid),
               '<li><a href="https://www.congress.gov/member/%s/%s">Bills sponsored and votes (Congress.gov) ↗</a></li>' % (e(slugify(name.split(',')[0])), e(bid))]
        for f in fec:
            rec.append('<li><a href="https://www.fec.gov/data/candidate/%s/">Campaign finance filings, FEC ID %s ↗</a></li>' % (e(f), e(f)))
        place_page = slugify(ALL_PLACES.get(t['state'], ''))
        if os.path.exists(os.path.join(ROOT, 'site', 'states', place_page + '.html')):
            rec.append('<li><a href="/states/%s.html">%s on The Way →</a></li>' % (e(place_page), e(ALL_PLACES[t['state']])))
        records_html = '<details><summary>Official records</summary><div class="gw-detail"><ul class="gv-list">%s</ul></div></details>' % ''.join(rec)

        note = ''
        if t['state'] in TERRITORIES:
            note = ('<p class="gv-note">%s represents %s in the House. Delegates and the Resident Commissioner serve on committees '
                    'but do not have a vote on final passage of bills.</p>' % (e(name), e(ALL_PLACES[t['state']])))

        body = ('<header class="gv-hero"><p class="gw-eyebrow">%s · %s</p><h1>%s</h1>'
                '<p class="gv-key-fact">%s for <strong>%s</strong></p>%s</header>%s'
                '<section class="gv-sec"><div class="gv-tiles">%s</div>'
                '<p class="gw-status">%s</p></section>'
                '<section class="gv-sec"><h2>Reach this office</h2>%s</section>'
                '<section class="gv-sec"><h2>Go deeper</h2>%s%s%s</section>'
                '<nav class="gv-next" aria-label="Keep exploring"><a href="../">← All of Congress</a> · '
                '<a href="../#chambers">Chamber maps</a> · <a href="/how-government-works.html">How government works</a></nav>') % (
            e(role), e(ALL_PLACES.get(t['state'], t['state'])), e(name), e(role), e(seat), lead_html, note,
            tile_html, e(source_note), ''.join(contact), comm_html, terms_html, records_html)
        desc = '%s, %s for %s. Term, committees, office contact and official records.' % (name, role, seat)
        html_out = page(name, desc, '%s/government/congress/members/%s.html' % (SITE_URL, slugs[bid]),
                        [('The Way', '/'), ('Government', '/how-government-works.html'), ('Congress', '../'), (name, None)],
                        body, 3)
        fn = slugs[bid] + '.html'
        with open(os.path.join(OUT, 'members', fn), 'w', encoding='utf-8') as fh:
            fh.write(html_out)
        written.add(fn)
    for fn in os.listdir(os.path.join(OUT, 'members')):
        if fn.endswith('.html') and fn not in written:
            os.remove(os.path.join(OUT, 'members', fn))

    # ---------- index ----------
    def mlink(bid, prefix='members/'):
        m = by_id[bid]
        t = m['terms'][-1]
        return '<a href="%s%s.html">%s</a> <span class="gv-muted">(%s, %s)</span>' % (
            prefix, slugs[bid], e(full_name(m)), e(t.get('party', '')[:1]), e(t['state']))

    def party_sentence(c, total):
        bits = []
        for p in ('Republican', 'Democrat', 'Independent'):
            if c.get(p):
                bits.append('%d %s' % (c[p], PARTY_PLURAL[p] if c[p] != 1 else p.lower() if p == 'Independent' else p))
        s = ', '.join(bits)
        if c.get('vacant'):
            s += ', %d vacant' % c['vacant']
        return s

    ind_sen = [m for m in sen if m['terms'][-1].get('party') == 'Independent']
    ind_note = ''
    if ind_sen:
        cau = sorted(set(m['terms'][-1].get('caucus') or 'no party' for m in ind_sen))
        ind_note = ' The %d independent senators caucus with the %s.' % (len(ind_sen), ' and '.join(x + 's' for x in cau)) if len(ind_sen) > 1 else ''

    chambers = (
        '<section id="chambers" class="gv-sec"><div class="gw-heading"><span>Layer 1 / The two chambers</span>'
        '<h2>Every dot is a member.</h2><p>Hover or tap a dot to open that member’s page. The diagram groups members by party, '
        'then by state. It is not the official seating chart.</p></div><div class="gv-two">'
        '<article class="gw-card gv-chamber"><p class="gw-eyebrow">North wing of the Capitol</p><h3>Senate</h3>'
        '<p class="gv-big">100 <span>senators</span></p><p>Two per state, six-year terms.</p>%s%s<p class="gv-small">%s</p></article>'
        '<article class="gw-card gv-chamber"><p class="gw-eyebrow">South wing of the Capitol</p><h3>House of Representatives</h3>'
        '<p class="gv-big">435 <span>voting seats</span></p><p>Divided among the states by population, two-year terms.</p>%s%s'
        '<details><summary>Plus %d non-voting members</summary><div class="gw-detail"><p>Washington, D.C., and the five territories each '
        'send one member to the House. They serve on committees but do not have a vote on final passage of bills.</p>'
        '<ul class="gv-list">%s</ul></div></details></article></div>'
        '<p class="gw-status">%s Members elected on November 3, 2026, take office on January 3, 2027.</p></section>') % (
        hemicycle(chamber_seats(sen, slugs, 100), rows=5, r_in=0.42), legend(sc), ind_note.strip(),
        hemicycle(chamber_seats(house_voting, slugs, 435), rows=11, r_in=0.3), legend(hc),
        len(delegates), ''.join('<li>%s, %s</li>' % (mlink(m['id']['bioguide']), e(role_title(m['terms'][-1])))
                                for m in sorted(delegates, key=lambda m: m['terms'][-1]['state'])),
        e(source_note))

    # leadership
    lead_rows = []
    rank = ['Speaker of the House', 'House Majority Leader', 'House Minority Leader', 'House Majority Whip',
            'House Minority Whip', 'President Pro Tempore of the Senate', 'Senate Majority Leader',
            'Senate Minority Leader', 'Senate Majority Whip', 'Senate Minority Whip']
    for m in L:
        for r in m.get('leadership_roles', []) or []:
            if not r.get('end') and r['title'] in rank:
                lead_rows.append((rank.index(r['title']), r['title'], m['id']['bioguide']))
    lead_rows.sort()
    leadership = ('<section id="leaders" class="gv-sec"><div class="gw-heading"><span>Layer 2 / Who leads</span>'
                  '<h2>Leaders are chosen by the members.</h2><p>The House elects its Speaker. Each party in each chamber picks its own '
                  'leader and whip. The vice president is President of the Senate and votes only to break a tie.</p></div>'
                  '<ul class="gv-leaders">%s</ul>'
                  '<p>%s <a class="gw-source" href="https://www.house.gov/leadership">House leadership ↗</a> '
                  '<a class="gw-source" href="https://www.senate.gov/senators/leadership.htm">Senate leadership ↗</a> '
                  '<a class="gw-source" href="https://www.archives.gov/founding-docs/constitution-transcript">Constitution, Article I, Sections 2 and 3 ↗</a></p></section>') % (
        ''.join('<li><span class="gv-role">%s</span>%s</li>' % (e(title), mlink(bid)) for _, title, bid in lead_rows), ds_link)

    # find a member, by state
    groups = []
    for code in sorted(ALL_PLACES, key=lambda c: ALL_PLACES[c]):
        ss = sorted([m for m in sen if m['terms'][-1]['state'] == code], key=sort_name)
        rr = sorted([m for m in reps if m['terms'][-1]['state'] == code], key=lambda m: m['terms'][-1].get('district', 0))
        if not ss and not rr:
            continue
        items = []
        for m in ss:
            items.append('<li data-q="%s">%s <span class="gv-muted">Senator</span></li>' % (
                e((full_name(m) + ' ' + ALL_PLACES[code] + ' ' + code + ' senator').lower()), mlink(m['id']['bioguide'])))
        for m in rr:
            t = m['terms'][-1]
            lab = role_title(t) if code in TERRITORIES else ('At-large' if t.get('district', 0) == 0 else 'District %d' % t['district'])
            items.append('<li data-q="%s">%s <span class="gv-muted">%s</span></li>' % (
                e((full_name(m) + ' ' + ALL_PLACES[code] + ' ' + code + ' ' + lab).lower()), mlink(m['id']['bioguide']), e(lab)))
        groups.append('<details class="gv-state" data-place="%s"><summary>%s <span class="gv-muted">%d</span></summary>'
                      '<ul class="gv-list">%s</ul></details>' % (e(ALL_PLACES[code].lower()), e(ALL_PLACES[code]), len(items), ''.join(items)))
    finder = ('<section id="members" class="gv-sec"><div class="gw-heading"><span>Layer 2 / Every member</span>'
              '<h2>Find any member of Congress.</h2><p>Open a state, or type a name, state or district. Each name opens a page with '
              'that member’s term, committees, office contact and official records.</p></div>'
              '<div class="gv-search" hidden><label for="gv-q">Search members</label><input id="gv-q" type="search" '
              'autocomplete="off" placeholder="Name, state or district"><span class="gv-muted" aria-live="polite" id="gv-count"></span></div>'
              '<div class="gv-states">%s</div><p class="gv-small">Not sure which district you live in? '
              '<a href="/lookup/">Find your district →</a></p></section>') % ''.join(groups)

    # committees
    comm_secs = []
    for ctype, label in (('senate', 'Senate committees'), ('house', 'House committees'), ('joint', 'Joint committees')):
        cs = sorted([c for c in C if c['type'] == ctype], key=lambda c: c['name'])
        items = []
        for c in cs:
            rows = M.get(c['thomas_id'], []) or []
            chair = [r for r in rows if (r.get('title') or '').startswith('Chair')]
            rank_m = [r for r in rows if (r.get('title') or '') == 'Ranking Member']
            vice = [r for r in rows if (r.get('title') or '').startswith('Vice Chair')]
            lines = []
            if c.get('jurisdiction'):
                lines.append('<p>%s</p>' % e(c['jurisdiction']))
            for lab, rs in (('Chair', chair), ('Vice chair', vice), ('Ranking member', rank_m)):
                for r in rs:
                    if r.get('bioguide') in by_id:
                        lines.append('<p><strong>%s:</strong> %s</p>' % (lab, mlink(r['bioguide'])))
            mem = [r for r in rows if r.get('bioguide') in by_id]
            if mem:
                maj = [r for r in mem if r.get('party') == 'majority']
                mino = [r for r in mem if r.get('party') == 'minority']
                lines.append('<details><summary>All %d members</summary><div class="gv-cols"><div><p class="gw-eyebrow">Majority</p><ul class="gv-list">%s</ul></div>'
                             '<div><p class="gw-eyebrow">Minority</p><ul class="gv-list">%s</ul></div></div></details>' % (
                                 len(mem), ''.join('<li>%s</li>' % mlink(r['bioguide']) for r in maj),
                                 ''.join('<li>%s</li>' % mlink(r['bioguide']) for r in mino)))
            subs = c.get('subcommittees') or []
            if subs:
                lines.append('<details><summary>%d subcommittees</summary><ul class="gv-list">%s</ul></details>' % (
                    len(subs), ''.join('<li>%s</li>' % e(s['name']) for s in subs)))
            if c.get('url'):
                lines.append('<a class="gw-source" href="%s">Official committee website ↗</a>' % e(c['url']))
            items.append('<details class="gv-comm" id="c-%s"><summary>%s</summary><div class="gw-detail">%s</div></details>' % (
                e(c['thomas_id']), e(c['name']), ''.join(lines)))
        comm_secs.append('<article class="gw-card"><h3>%s <span class="gv-muted">%d</span></h3>%s</article>' % (label, len(cs), ''.join(items)))
    committees = ('<section id="committees" class="gv-sec"><div class="gw-heading"><span>Layer 3 / Where bills are studied</span>'
                  '<h2>Committees do the detailed work.</h2><p>Most bills go to a committee first. Committees hold hearings, change bill text '
                  'and decide whether a bill moves to a floor vote. Open one to see who leads it and who serves on it.</p></div>'
                  '<div class="gw-grid">%s</div><p>%s <a class="gw-source" href="https://www.house.gov/the-house-explained/the-legislative-process">House: legislative process ↗</a></p></section>') % (
        ''.join(comm_secs), ds_link)

    aoc = 'https://www.aoc.gov/explore-capitol-campus/buildings-grounds/capitol-building'
    capitol = (
        '<section id="capitol" class="gv-sec"><div class="gw-heading"><span>Layer 3 / The building</span>'
        '<h2>The U.S. Capitol.</h2><p>Both chambers meet in one building on Capitol Hill in Washington, D.C.</p></div>'
        '<div class="gv-two"><figure class="gv-capitol">'
        '<svg viewBox="0 0 600 300" role="img" aria-labelledby="cap-t"><title id="cap-t">Simple diagram of the Capitol: the Senate chamber '
        'is in the north wing, the House chamber is in the south wing, and the dome is in the center.</title>'
        '<path class="gv-cap-ground" d="M20 262h560"/>'
        '<rect class="gv-cap-wing" x="40" y="170" width="190" height="92" rx="4"/>'
        '<rect class="gv-cap-wing" x="370" y="170" width="190" height="92" rx="4"/>'
        '<rect class="gv-cap-center" x="230" y="150" width="140" height="112" rx="4"/>'
        '<path class="gv-cap-dome" d="M250 150q0-78 50-90q50 12 50 90Z"/><path class="gv-cap-dome" d="M292 60h16v-18h-16Z"/>'
        '<path class="gv-cap-dome" d="M300 42v-20"/>'
        '<text x="135" y="212">Senate</text><text x="135" y="236" class="gv-cap-sm">north wing</text>'
        '<text x="465" y="212">House</text><text x="465" y="236" class="gv-cap-sm">south wing</text>'
        '<text x="300" y="212">Rotunda</text><text x="300" y="236" class="gv-cap-sm">under the dome</text></svg>'
        '<figcaption>A simple diagram, not to scale. The two chambers are on the second floor.</figcaption></figure>'
        '<div class="gv-facts">'
        '<details open><summary>When was it built?</summary><div class="gw-detail"><p>President George Washington selected the design in 1793, '
        'and construction began shortly after. British troops burned the building in 1814, and it was rebuilt.</p>'
        '<a class="gw-source" href="%s">Source: Architect of the Capitol ↗</a></div></details>'
        '<details><summary>What about the dome?</summary><div class="gw-detail"><p>The first dome was finished in 1824. The cast-iron dome you see '
        'today was designed by Thomas U. Walter and built from 1856 to 1866, at a total cost of $1,047,291.</p>'
        '<a class="gw-source" href="%s/capitol-dome">Source: Architect of the Capitol: dome ↗</a></div></details>'
        '<details><summary>Who is on top?</summary><div class="gw-detail"><p>The Statue of Freedom. Its last section was put in place on December 2, '
        '1863. The bronze statue is 19 feet 6 inches tall.</p><a class="gw-source" href="%s/capitol-dome">Source: Architect of the Capitol: dome ↗</a></div></details>'
        '<details><summary>How big is it?</summary><div class="gw-detail"><p>About 288 feet from the east front base line to the top of the Statue '
        'of Freedom, with a floor area of about 16 and a half acres.</p><a class="gw-source" href="%s">Source: Architect of the Capitol ↗</a></div></details>'
        '<details><summary>Where does each chamber meet?</summary><div class="gw-detail"><p>The House chamber is in the south wing and the Senate '
        'chamber is in the north wing, both on the second floor. The 100 senators sit at individual desks on a tiered half circle facing a raised rostrum.</p>'
        '<a class="gw-source" href="%s">Source: Architect of the Capitol ↗</a> <a class="gw-source" href="%s/senate-wing">Senate wing ↗</a></div></details>'
        '<details><summary>Can I visit?</summary><div class="gw-detail"><p>Tours of the Capitol are free and start at the Capitol Visitor Center. '
        'Your senators’ or representative’s office can also help arrange a tour.</p><a class="gw-source" href="https://www.visitthecapitol.gov/">Source: Capitol Visitor Center ↗</a></div></details>'
        '</div></div></section>') % (aoc, aoc, aoc, aoc, aoc, aoc)

    total_voting = len(sen) + len(house_voting)
    body = ('<header class="gv-hero"><p class="gw-eyebrow">Congress · Makes federal laws</p>'
            '<p class="gv-huge">535 <span>voting members</span></p><h1>Congress</h1>'
            '<p class="gv-lede">100 senators and 435 representatives, plus 6 non-voting members from D.C. and the territories. '
            'Each click goes one layer deeper, down to every member’s own page.</p>'
            '<p class="gw-status">%d voting members were serving on %s. Article I of the Constitution sets up Congress.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#chambers">Chamber maps</a><a href="#members">Find a member</a>'
            '<a href="#leaders">Leaders</a><a href="#committees">Committees</a><a href="#capitol">The Capitol</a></nav>'
            '%s%s%s%s%s'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>%s Building facts come from the Architect of the Capitol. '
            'Leadership titles were checked against house.gov and senate.gov. Rules about the chambers come from the Constitution. '
            'Nothing here rates or ranks a member.</p>'
            '<nav aria-label="Keep exploring"><a href="/how-government-works.html">How government works</a> · '
            '<a href="/lookup/">Find your district</a> · <a href="#top">Return to surface ↑</a></nav></section>') % (
        total_voting, e(data_long), chambers, finder, leadership, committees, capitol, e(source_note))
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as fh:
        fh.write(page('Congress', 'The House and Senate, layer by layer: chamber maps, every member of Congress with their own page, '
                                  'leaders, committees and the Capitol building. Official public data.',
                      SITE_URL + '/government/congress/',
                      [('The Way', '/'), ('Government', '/how-government-works.html'), ('Congress', None)], body, 2))
    print('wrote %d member pages and the Congress index (data %s, %s)' % (len(written), data_date, commit))


if __name__ == '__main__':
    main()
