#!/usr/bin/env python3
"""Builds the Get Involved section pages (D279, Nov 2026). The Contact Your Senator tool in
site/get-involved/contact-your-senator/ is built separately (D278).

Reads:
  tools/get-involved/upcoming.json                 the hand-checked list of upcoming votes and bill records
  site/government/congress/members/*.html        the member pages (made by tools/government/build_congress.py)
Writes:
  site/get-involved/index.html                     the Get Involved landing page
  site/get-involved/bills/index.html               upcoming votes in Congress
  site/get-involved/bills/<slug>.html              one page per upcoming bill
  site/get-involved/reps.html                      contact your senators and representative, state by state
  site/government/congress/members/*.html        an "Upcoming votes" section on every member page (between
                                                 <!-- tw-upcoming --> markers), for the people who sponsor, sit on the
                                                 committee for, or vote on each upcoming item

Run order after a member page rebuild: tools/government/build_congress.py, then tools/contact-senator/build_votes.py,
then this script.

Run from the repo root:  python3 tools/get-involved/build_get_involved.py
Every fact in upcoming.json must come from an official record (Library of Congress bill status files on govinfo,
the House Majority Leader schedule, docs.house.gov, the House Clerk, senate.gov). Add the source link with it.
To update for a new week: edit upcoming.json (schedule days, items and bill records), then run this script.
"""
import datetime
import glob
import html
import json
import os
import re
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = os.path.join(ROOT, 'site')
OUT = os.path.join(SITE, 'get-involved')
MEMBERS = os.path.join(SITE, 'government', 'congress', 'members')
SITE_URL = 'https://michiinstitute.com'
WAYBAR_JS = '79'
WAYBAR_CSS = '29'
GI_CSS = '2'
GI_JS = '2'
WEB_V = 'd282'

e = lambda s: html.escape(str(s), quote=True)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']
GLOSSARY = 'https://www.congress.gov/help/legislative-glossary'


def nice_date(iso):
    y, m, d = [int(x) for x in iso[:10].split('-')]
    return '%s %d, %d' % (MONTHS[m - 1], d, y)


def slug_of(number):
    m = re.match(r'^(H\.R\.|S\.|H\.Res\.|S\.Res\.)\s*(\d+)$', number.replace(' ', ' '))
    kind = {'H.R.': 'hr', 'S.': 's', 'H.Res.': 'hres', 'S.Res.': 'sres'}[m.group(1)]
    return '%s-%s' % (kind, m.group(2))


def congress_url(number):
    s = slug_of(number)
    kind, n = s.split('-')
    path = {'hr': 'house-bill', 's': 'senate-bill', 'hres': 'house-resolution', 'sres': 'senate-resolution'}[kind]
    return 'https://www.congress.gov/bill/119th-congress/%s/%s' % (path, n)


def govinfo_url(number):
    kind, n = slug_of(number).split('-')
    return 'https://www.govinfo.gov/bulkdata/BILLSTATUS/119/%s/BILLSTATUS-119%s%s.xml' % (kind, kind, n)


# ---- member pages -> people we can link to and contact ----
def text(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def read_members():
    people = []
    for f in sorted(glob.glob(os.path.join(MEMBERS, '*.html'))):
        s = open(f, encoding='utf-8').read()
        slug = os.path.basename(f)[:-5]
        eb = re.search(r'<p class="gw-eyebrow">([^<]*)</p>', s)
        if not eb:
            continue
        role, _, state = html.unescape(eb.group(1)).partition(' · ')
        name = text(re.search(r'<h1>(.*?)</h1>', s).group(1))
        key = re.search(r'<p class="gv-key-fact">(.*?)</p>', s)
        party = re.search(r'<span>Party</span><strong>([^<]*)</strong>', s)
        ends = re.search(r'<span>Current term ends</span><strong>([^<]*)</strong>', s)
        phone = re.search(r'<a href="tel:([^"]+)">([^<]+)</a>', s)
        web = re.search(r'<a href="([^"]+)">Official website ↗</a>', s)
        form = re.search(r'<a href="([^"]+)">Contact form ↗</a>', s)
        bio = re.search(r'bioguide\.congress\.gov/search/bio/([A-Z0-9]+)"', s)
        fec = re.findall(r'<a href="(https://www\.fec\.gov/data/candidate/([A-Z0-9]+)/)">', s)
        seat = text(key.group(1)) if key else ''
        dist = 0
        m = re.search(r"(\d+)(st|nd|rd|th) District", seat)
        if m:
            dist = int(m.group(1))
        people.append({
            'slug': slug, 'name': name, 'role': role.strip(), 'state': state.strip(), 'seat': seat,
            'party': party.group(1) if party else '', 'ends': ends.group(1) if ends else '',
            'phone': (phone.group(1), phone.group(2)) if phone else None,
            'web': html.unescape(web.group(1)) if web else None, 'form': html.unescape(form.group(1)) if form else None,
            'bioguide': bio.group(1) if bio else None, 'fec': [(html.unescape(u), i) for u, i in fec], 'dist': dist,
            'committees': set(html.unescape(m) for m in re.findall(r'<li><a href="\.\./#c-[A-Z0-9]+">([^<]+)</a></li>', s)),
        })
    return people


# ---- campaign money from the Money Trail's own FEC data (site/money-trail/fec-data.js and fec-more/) ----
def fec_committees():
    t = open(os.path.join(SITE, 'money-trail', 'fec-data.js'), encoding='utf-8').read()
    i = t.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
    d = json.JSONDecoder().raw_decode(t[i:])[0]
    out = [(c, True) for c in d['committees']]
    for f in sorted(glob.glob(os.path.join(SITE, 'money-trail', 'fec-more', '[0-9]*.json'))):
        out += [(c, False) for c in json.load(open(f, encoding='utf-8'))['committees']]
    return out


def money_for(people):
    """Bioguide ID -> the member's campaign committee with the most receipts in our FEC data (House or Senate)."""
    cand = {}
    for p in people:
        for _u, i in p['fec']:
            cand[i] = p['bioguide']
    found = {}
    for c, loaded in fec_committees():
        ca = c.get('candidate') or {}
        b = cand.get(ca.get('id'))
        if not b or c.get('committee_type') not in ('House', 'Senate'):
            continue
        tot = c.get('totals') or {}
        if isinstance(tot, str):
            continue
        rec = tot.get('receipts') or 0
        if b not in found or rec > found[b]['receipts']:
            q = 'view=network&hub=' + urllib.parse.quote(c['name']) if loaded else 'fec=' + c['committee_id']
            found[b] = {'id': c['committee_id'], 'name': c['name'], 'receipts': rec, 'through': tot.get('through'),
                        'web': '/money-trail/?' + q, 'fec': 'https://www.fec.gov/data/committee/%s/' % c['committee_id']}
    return found


def money_txt(n):
    return '${:,.0f}'.format(n)


# ---- page shell ----
def page(path_rel, title, desc, crumbs, body, extra_js=None):
    canon = SITE_URL + '/get-involved/' + path_rel.replace('index.html', '')
    c = ' / '.join(['<a href="%s">%s</a>' % (e(h), e(t)) if h else e(t) for t, h in crumbs])
    js = ''.join('<script src="%s" defer></script>' % e(j) for j in (extra_js or ['/get-involved/get-involved.js?v=%s' % GI_JS]))
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="color-scheme" content="dark">\n'
            '<meta name="theme-color" content="#176b85">\n<title>%(t)s - The Way</title>\n'
            '<meta name="description" content="%(d)s">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
            '<link rel="stylesheet" href="/pages-style.css?v=3">\n<link rel="stylesheet" href="/members/waybar.css?v=%(wc)s">\n'
            '<link rel="stylesheet" href="/government-works.css?v=2">\n<link rel="stylesheet" href="/government/government.css?v=8">\n'
            '<link rel="stylesheet" href="/get-involved/get-involved.css?v=%(gc)s">\n'
            '<link rel="canonical" href="%(u)s">\n<meta property="og:type" content="website">\n'
            '<meta property="og:title" content="%(t)s - The Way">\n<meta property="og:description" content="%(d)s">\n'
            '<meta property="og:url" content="%(u)s">\n<meta property="og:site_name" content="The Way | Michi Institute">\n'
            '<meta property="og:image" content="https://michiinstitute.com/og-logo.png">\n<meta name="twitter:card" content="summary_large_image">\n'
            '</head>\n<body>\n<header id="waybar" class="waybar" data-here="involved"><a class="wb-logo" href="/">The Way</a>'
            '<nav class="wb-right" aria-label="Sign in"><a class="wb-pill" href="/members/">Sign in</a></nav></header>\n'
            '<a class="gw-skip" href="#top">Skip to content</a><main class="gw gv gi" id="top">\n'
            '<nav class="crumbs" aria-label="Breadcrumb">%(c)s</nav>\n%(b)s\n</main>%(js)s'
            '<script src="/members/waybar.js?v=%(wj)s" defer></script></body></html>\n') % {
        't': e(title), 'd': e(desc), 'u': e(canon), 'c': c, 'b': body, 'js': js, 'wj': WAYBAR_JS, 'wc': WAYBAR_CSS,
        'gc': GI_CSS}


def countdown(at, label, day=False):
    """A live countdown. The page shows the date in words; get-involved.js adds "in 2 days, 3 hours" next to it."""
    return '<span class="gi-count" data-at="%s"%s data-label="%s"></span>' % (e(at), ' data-day="1"' if day else '', e(label))


def src_link(label, url):
    return '<a class="gw-source" href="%s">Source: %s ↗</a>' % (e(url), e(label))


HOW = {
    'suspension': ('Under suspension of the rules',
                   'Debate is short, no changes can be offered on the floor, and the bill needs two thirds of the members voting to pass.'),
    'rule': ('Under a rule',
             'The House first votes on a resolution (a "rule") that sets the terms for debate. The bill then needs a simple majority to pass.'),
}


def sponsor_html(sp, by_bio):
    p = by_bio.get(sp.get('bioguide'))
    name = e(sp['name'])
    if p:
        return '<a href="/government/congress/members/%s.html">%s</a>' % (e(p['slug']), name)
    return name + ' <span class="gv-muted">(not in the current member list we use)</span>'


def cosponsor_text(c):
    if not c:
        return 'Not counted: the official record we read was cut off before the list ended'
    if not c['total']:
        return 'None'
    parts = []
    for k, w in (('D', 'Democrat'), ('R', 'Republican'), ('I', 'independent')):
        if c.get(k):
            parts.append('%d %s%s' % (c[k], w, '' if c[k] == 1 else 's'))
    return '%d (%s)' % (c['total'], ', '.join(parts))


def find_schedule(data, number):
    for day in data['house']['days']:
        for it in day['items']:
            if it['bill'] == number:
                return 'house', day, it
    for it in data['senate'].get('pending', []):
        if it['bill'] == number:
            return 'senate', None, it
    return None, None, None


LDA_SEARCH = 'https://lda.gov/'
PERIOD = {'first_quarter': ('1st quarter', '-03-31'), 'second_quarter': ('2nd quarter', '-06-30'),
          'third_quarter': ('3rd quarter', '-09-30'), 'fourth_quarter': ('4th quarter', '-12-31'),
          'mid_year': ('first half', '-06-30'), 'year_end': ('second half', '-12-31'), 'registration': ('registration', '')}


def hub_of(b):
    """The bill's name on the Money web (no parentheses, so the web's name matching stays simple)."""
    return re.sub(r'\s*\([^)]*\)', '', '%s: %s' % (b['number'], b['title'])).upper().strip()


def hub_url(b):
    return '/money-trail/?view=network&hub=' + urllib.parse.quote(hub_of(b))


def lda_for(num):
    d = CTX.get('lda') or {}
    return (d.get('status') or {}).get(num), [x for x in d.get('filings', []) if x['bill'] == num]


def lda_money(x):
    if x.get('income'):
        return 'The lobbying firm reported %s in income from this client for the %s, for every issue on the report, not only this bill.' % (money_txt(x['income']), PERIOD.get(x['period'], (x['period'],))[0])
    if x.get('expenses'):
        return 'The group reported spending %s on its own lobbying in the %s, for every issue on the report, not only this bill.' % (money_txt(x['expenses']), PERIOD.get(x['period'], (x['period'],))[0])
    return 'No amount on this filing.'
CTX = {}  # filled in main(): people, money, by_bio


def short_comm(c):
    for pre in ('House Committee on the ', 'House Committee on ', 'Senate Committee on the ', 'Senate Committee on '):
        if c.startswith(pre):
            return ('Senate ' if c.startswith('Senate') else 'House ') + c[len(pre):]
    return c


def web_svg(b, chamber, sponsor, comms):
    """A small picture of this bill's spot on the web: the bill in the middle, the people and groups around it. Every node is a link."""
    nodes = []
    if sponsor:
        nodes.append(('Sponsor', sponsor['name'], '/government/congress/members/%s.html' % sponsor['slug'], 'gi-n-person'))
    for c in comms:
        nodes.append(('Committee', short_comm(c), '#people', 'gi-n-comm'))
    m = CTX['money'].get(b['sponsor'].get('bioguide'))
    if m:
        nodes.append(('Sponsor\'s campaign money', money_txt(m['receipts']), m['web'], 'gi-n-money'))
    nodes.append(('Who votes', 'All 100 senators' if chamber == 'senate' else 'All House members', '../reps.html', 'gi-n-people'))
    st, fl = lda_for(b['number'])
    groups = sorted(set(x['client'] for x in fl))
    nodes.append(('Lobby groups', ('%d found so far' % len(groups) if not st.get('complete') else '%d found' % len(groups)) if st else 'Not checked yet', '#lobby', 'gi-n-lobby'))
    return draw_web(b['number'], nodes, hub_url(b))


def draw_web(center, nodes, center_href=None):
    import math
    W, H, cx, cy, r = 720, 380, 360, 190, 135
    out = ['<svg class="gi-web gi-web-wide" viewBox="0 0 %d %d" role="img" aria-labelledby="gi-web-t"><title id="gi-web-t">%s and the people and money around it</title>' % (W, H, e(center))]
    pts = []
    for i, n in enumerate(nodes):
        ang = -math.pi / 2 + 2 * math.pi * i / len(nodes)
        x, y = cx + r * 1.75 * math.cos(ang), cy + r * math.sin(ang)
        pts.append((x, y))
        out.append('<line class="gi-edge" x1="%d" y1="%d" x2="%d" y2="%d"/>' % (cx, cy, x, y))
    mid = '<circle class="gi-n-bill" cx="%d" cy="%d" r="52"/><text class="gi-t-bill" x="%d" y="%d" text-anchor="middle">%s</text>' % (cx, cy, cx, cy + 6, e(center))
    out.append('<a href="%s">%s</a>' % (e(center_href), mid) if center_href else mid)
    for (k, v, href, cls), (x, y) in zip(nodes, pts):
        v2 = v if len(v) <= 27 else v[:26] + '…'
        out.append('<a href="%s"><rect class="gi-node %s" x="%d" y="%d" width="210" height="50" rx="12"/><text class="gi-t-k" x="%d" y="%d" text-anchor="middle">%s</text><text class="gi-t-v" x="%d" y="%d" text-anchor="middle">%s</text></a>' % (
            e(href), cls, x - 105, y - 25, x, y - 6, e(k), x, y + 14, e(v2)))
    out.append('</svg>')
    # phone: the bill on top and the boxes in a column under it, so the words stay big enough to read
    PW, rowh = 360, 66
    PH = 120 + rowh * len(nodes)
    out.append('<svg class="gi-web gi-web-phone" viewBox="0 0 %d %d" role="img" aria-labelledby="gi-webp-t"><title id="gi-webp-t">%s and the people and money around it</title>' % (PW, PH, e(center)))
    for i in range(len(nodes)):
        y = 120 + rowh * i + 25
        out.append('<path class="gi-edge" d="M180 92 C 40 %d, 40 %d, 60 %d"/>' % (y - 30, y, y))
    mid = '<circle class="gi-n-bill" cx="180" cy="52" r="46"/><text class="gi-t-bill" x="180" y="58" text-anchor="middle">%s</text>' % e(center)
    out.append('<a href="%s">%s</a>' % (e(center_href), mid) if center_href else mid)
    for i, (k, v, href, cls) in enumerate(nodes):
        y = 120 + rowh * i
        v2 = v if len(v) <= 30 else v[:29] + '…'
        out.append('<a href="%s"><rect class="gi-node %s" x="60" y="%d" width="290" height="52" rx="12"/><text class="gi-t-k" x="205" y="%d" text-anchor="middle">%s</text><text class="gi-t-v" x="205" y="%d" text-anchor="middle">%s</text></a>' % (
            e(href), cls, y, y + 20, e(k), y + 40, e(v2)))
    out.append('</svg>')
    return ''.join(out)


def chain_html(b, chamber, ctx):
    by_bio, money, people = ctx['by_bio'], ctx['money'], ctx['people']
    sponsor = by_bio.get(b['sponsor'].get('bioguide'))
    comms = list(b['committees']) if chamber != 'senate' else list(b.get('senate_committees', []))
    out = []
    # 1. web
    out.append('<section class="gv-sec" id="web"><h2>Its spot on the web</h2><p>The bill in the middle, with the people, money and groups around it. Tap any box to follow it.</p>%s'
               '<p class="gv-links"><a href="%s">See %s on the Money web →</a></p>'
               '<p class="gw-status">This picture is made from the sections below. On the Money web, the bill is a dot with lines to its sponsor, its committees and the groups that lobbied on it, and from the sponsor to their campaign money.</p></section>' % (web_svg(b, chamber, sponsor, comms), e(hub_url(b)), e(b['number'])))
    # 2. money
    out.append('<section class="gv-sec" id="money"><h2>The money</h2>')
    m = money.get(b['sponsor'].get('bioguide'))
    if sponsor and m:
        out.append('<p>The sponsor, %s, has a campaign committee, <strong>%s</strong>, that reported <strong>%s</strong> in receipts to the Federal Election Commission for 2025 to 2026, through %s.</p>' % (
            e(sponsor['name']), e(m['name']), e(money_txt(m['receipts'])), e(nice_date(m['through'])) if m.get('through') else 'the latest filing we have'))
        out.append('<p class="gv-links"><a href="%s">%s on the Money web →</a> <a href="%s">%s on FEC.gov ↗</a></p>' % (e(m['web']), e(m['name']), e(m['fec']), e(m['id'])))
    elif sponsor:
        out.append('<p>We have no campaign committee for the sponsor, %s, in our FEC data.</p>' % e(sponsor['name']))
    else:
        out.append('<p>The sponsor is not in the current member list we use, so we have no campaign money to show.</p>')
    rows = []
    for c in comms:
        for p in people:
            if c in p['committees']:
                mm = money.get(p['bioguide'])
                rows.append((mm['receipts'] if mm else -1, p, mm, c))
    if rows:
        rows.sort(key=lambda r: -r[0])
        seen, tr = set(), []
        for rec, p, mm, c in rows:
            if p['slug'] in seen:
                continue
            seen.add(p['slug'])
            tr.append('<tr><td><a href="/government/congress/members/%s.html">%s</a></td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
                e(p['slug']), e(p['name']), e(p['party']), e(short_comm(c)),
                ('<a href="%s">%s</a>' % (e(mm['web']), e(money_txt(mm['receipts'])))) if mm else 'Not in our FEC data'))
        out.append('<details><summary>Campaign money of the committee members who handled it (%d)</summary><div class="gw-detail gv-scroll"><table class="gv-table"><thead><tr><th>Member</th><th>Party</th><th>Committee</th><th>Campaign receipts, 2025 to 2026</th></tr></thead><tbody>%s</tbody></table></div></details>' % (len(tr), ''.join(tr)))
    out.append('<p class="gw-status">Receipts are everything the campaign committee reported taking in, from all donors, not money tied to this bill. From FEC bulk data in the Money Trail (totals through the date shown). Check any figure on FEC.gov.</p></section>')
    # 3. people
    out.append('<section class="gv-sec" id="people"><h2>People involved</h2><ul class="gv-list">')
    if sponsor:
        out.append('<li><strong>Sponsor:</strong> <a href="/government/congress/members/%s.html">%s</a> (%s, %s)</li>' % (e(sponsor['slug']), e(sponsor['name']), e(sponsor['party']), e(sponsor['seat'].replace('U.S. Representative for ', '').replace('U.S. Senator for ', ''))))
    else:
        out.append('<li><strong>Sponsor:</strong> %s</li>' % e(b['sponsor']['name']))
    out.append('<li><strong>Cosponsors:</strong> %s. <a href="%s/cosponsors">Names on Congress.gov ↗</a></li>' % (e(cosponsor_text(b.get('cosponsors'))), e(congress_url(b['number']))))
    out.append('<li><strong>Who votes:</strong> %s <a href="../reps.html">Find yours →</a></li>' % (
        'All 100 senators.' if chamber == 'senate' else 'All 435 House members. The 5 delegates and the resident commissioner cannot vote on final passage.'))
    out.append('</ul>')
    for c in comms:
        mem = sorted([p for p in people if c in p['committees']], key=lambda p: (p['party'], p['name']))
        if not mem:
            continue
        lis = ', '.join('<a href="/government/congress/members/%s.html">%s</a> (%s)' % (e(p['slug']), e(p['name']), e(p['party'][:1])) for p in mem)
        out.append('<details><summary>Members of the %s (%d)</summary><div class="gw-detail"><p>%s</p></div></details>' % (e(c), len(mem), lis))
    if b.get('senate_committees_note'):
        out.append('<p class="gw-status">%s</p>' % e(b['senate_committees_note']))
    out.append('<p class="gw-status">Committee seats come from our member pages (congress-legislators dataset). Each member\'s page also lists this vote under Upcoming votes.</p></section>')
    # 4. lobby groups (Lobbying Disclosure Act reports from lda.gov, collected by fetch_lda.py)
    st, fl = lda_for(b['number'])
    out.append('<section class="gv-sec" id="lobby"><h2>Lobby groups</h2><p>Groups that pay lobbyists must report which bills they lobbied on, under the Lobbying Disclosure Act. These are the reports that name %s.</p>' % e(b['number']))
    if not st:
        out.append('<p>We have not checked the lobbying reports for this bill yet. Our home computer checks them from the official lobbying database; until then you can search it yourself.</p>')
    else:
        if fl:
            tr = ''.join('<tr><td>%s</td><td>%s</td><td>%s %s</td><td>%s</td><td>&quot;%s&quot; <a href="%s">Report ↗</a></td></tr>' % (
                e(x['client']), e(x['registrant'] if x['registrant'] != x['client'] else 'Itself'), e(PERIOD.get(x['period'], (x['period'],))[0]), e(str(x.get('year', ''))),
                e(money_txt(x['income']) + ' fee' if x.get('income') else money_txt(x['expenses']) + ' spent' if x.get('expenses') else 'None given'), e(x['text']), e(x['url'])) for x in fl)
            out.append('<div class="gv-scroll"><table class="gv-table"><thead><tr><th>Group or company</th><th>Lobbying firm</th><th>Report</th><th>Amount on the report</th><th>What it says</th></tr></thead><tbody>%s</tbody></table></div>' % tr)
            out.append('<p class="gw-status">An amount is for the whole report, every issue on it, not money spent on this one bill. A lobbying report does not say whether the group is for or against a bill unless its own words say so.</p>')
        else:
            out.append('<p>No lobbying reports for 2025 or 2026 name this bill so far.</p>')
        msg = 'Checked %s.' % nice_date(st['checked'])
        if not st.get('complete'):
            msg += ' Not finished yet: ' + (st.get('note') or 'some searches are still to run.')
        elif st.get('note'):
            msg += ' ' + st['note']
        out.append('<p class="gw-status">%s From the official lobbying database at lda.gov, read with no key.</p>' % e(msg))
    out.append('<p class="gv-links"><a href="%s">Search lobbying reports on LDA.gov ↗</a></p><p class="gw-status">Tip: search the lobbying issue text for &quot;%s&quot;.</p></section>' % (LDA_SEARCH, e(b['number'])))
    return '\n'.join(out)



def bill_page(b, data, by_bio):
    num = b['number']
    slug = slug_of(num)
    chamber, day, it = find_schedule(data, num)
    checked = nice_date(data['checked'])
    title = b['title']
    out = []
    eyebrow = ('Senate' if chamber == 'senate' else 'House') + ' vote coming up · ' + num + ' · 119th Congress'
    out.append('<header class="gv-hero"><p class="gw-eyebrow">%s</p><h1>%s</h1>' % (e(eyebrow), e(title)))
    if b.get('title_is_ours'):
        out.append('<p class="gv-lede">This bill has no short title, so the name above is ours. Its official title: "%s"</p>' % e(b['official_title']))
    elif b.get('official_title'):
        out.append('<p class="gv-lede">Official title: "%s"</p>' % e(b['official_title']))
    elif b.get('title_note'):
        out.append('<p class="gv-lede">%s</p>' % e(b['title_note']))
    out.append('</header>')

    # when is the vote
    out.append('<section class="gv-sec gi-when"><h2>When the vote is</h2>')
    if chamber == 'house':
        how_t, how_d = HOW[it['how']]
        what = 'The Senate\'s changes to this bill are' if it.get('senate_amendment') else 'This bill is'
        out.append('<p class="gv-note"><strong>%s listed for a House vote: %s, 2026.</strong> %s %s</p>' % (e(what), e(day['label']), e(day['note']), countdown(day['at'], day['at_label'])))
        out.append('<p><strong>%s.</strong> %s <a href="%s">What these words mean (Congress.gov glossary) ↗</a></p>' % (e(how_t), e(how_d), GLOSSARY))
        if it.get('senate_amendment'):
            out.append('<p>The House already passed this bill. The Senate passed it with changes, so the House now votes on the Senate\'s changes. The schedule calls it the "Pit River Land Transfer Act of 2026." The Library of Congress record we read (updated August 6, 2026) does not show the Senate vote yet.</p>')
        elif it.get('amended'):
            out.append('<p>The schedule says the House will vote on it "as amended," which means a changed version, usually the one the committee approved. The bill text the House will vote on is on the House floor documents page below.</p>')
        out.append('<p class="gw-status">From the House Majority Leader\'s weekly schedule and the House floor documents page, checked %s. Schedules change. %s</p>' % (
            e(checked), e(data['house'].get('more', ''))))
    elif chamber == 'senate':
        out.append('<p class="gv-note"><strong>In the Senate.</strong> %s %s</p>' % (e(it['when']), countdown(it['at'], it['at_label']) if it.get('at') else ''))
        out.append('<p class="gw-status">From the Library of Congress record, the U.S. Senate floor schedule and the Senate Executive Calendar, checked %s. Schedules change.</p>' % e(checked))
    out.append('</section>')

    if b.get('vehicle_note'):
        out.append('<section class="gv-sec"><h2>Why this bill matters in the Senate</h2><p>%s</p>' % e(b['vehicle_note']))
        bs = b.get('baaja_summary')
        if bs:
            out.append('<p><strong>What the permitting bill (S. 5653) does, in plain words.</strong> %s</p>' % e(bs['text']))
            out.append('<p>S. 5653 sponsor: %s. Cosponsors: %s.</p>' % (e(bs['sponsor']), e(bs['cosponsors'])))
            out.append('<p class="gw-status">Plain-words version by The Way of the Congressional Research Service summary (%s, %s). <a href="%s">S. 5653 on Congress.gov ↗</a> · <a href="%s">S. 5653 official record (govinfo) ↗</a></p>' % (
                e(bs['version']), e(nice_date(bs['date'])), e(congress_url('S. 5653')), e(govinfo_url('S. 5653'))))
        if b.get('rollcalls'):
            rc = ' · '.join('<a href="https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_%05d.htm">Senate roll call %s (%s) ↗</a>' % (int(n), n, e(nice_date(dt))) for n, dt in b['rollcalls'])
            out.append('<p class="gv-links">%s <a href="/government/congress/votes.html">How every senator voted →</a></p>' % rc)
        out.append('</section>')

    # facts
    la = b['latest_action']
    out.append('<section class="gv-sec"><h2>The bill</h2><div class="gv-tiles">')
    out.append('<div class="gv-tile"><span>Latest official step</span><strong>%s</strong><p class="gv-muted">%s</p></div>' % (e(nice_date(la['date'])), e(la['text'])))
    out.append('<div class="gv-tile"><span>Sponsor</span><strong>%s</strong></div>' % sponsor_html(b['sponsor'], by_bio))
    out.append('<div class="gv-tile"><span>Cosponsors</span><strong>%s</strong></div>' % e(cosponsor_text(b.get('cosponsors'))))
    out.append('<div class="gv-tile"><span>Introduced</span><strong>%s</strong></div>' % e(nice_date(b['introduced'])))
    out.append('<div class="gv-tile"><span>Committee%s</span><strong>%s</strong></div>' % ('s' if len(b['committees']) > 1 else '', '<br>'.join(e(c) for c in b['committees'])))
    if b.get('policy_area'):
        out.append('<div class="gv-tile"><span>Subject</span><strong>%s</strong></div>' % e(b['policy_area']))
    out.append('</div>')
    if b.get('title_source'):
        out.append('<p class="gw-status">The name comes from the %s.</p>' % e(b['title_source']))
    out.append('</section>')

    # what it does
    out.append('<section class="gv-sec"><h2>What it does</h2>')
    sm = b.get('summary')
    if sm:
        out.append('<p>%s</p>' % e(sm['text']))
        if sm['version'].startswith('The Way'):
            out.append('<p class="gw-status">Written by The Way from the sources below, %s.</p>' % e(nice_date(sm['date'])))
        else:
            note = ''
            if sm['version'] == 'Introduced in House' and la['text'].startswith(('Reported', 'Placed', 'Ordered', 'Supplemental', 'Committee', 'Cloture', 'Motion')):
                note = ' This summary is of the bill as first written; the committee or the House may have changed it since.'
            out.append('<p class="gw-status">Plain-words version by The Way of the Congressional Research Service summary (version: %s, %s). The official summary is on Congress.gov.%s</p>' % (
                e(sm['version']), e(nice_date(sm['date'])), e(note)))
    else:
        out.append('<p>The Congressional Research Service has not published a summary of this bill yet. Read the bill text on the House floor documents page below.</p>')
    if b.get('short_titles'):
        out.append('<p>The bill also has these short titles, one for each part: %s.</p>' % e('; '.join(b['short_titles'])))
    out.append('</section>')

    # steps
    out.append('<section class="gv-sec"><h2>Steps so far</h2><details open><summary>Official actions (%d)</summary><div class="gw-detail gv-scroll"><table class="gv-table"><thead><tr><th>Date</th><th>What happened</th></tr></thead><tbody>' % len(b['actions']))
    for dt, t in b['actions']:
        out.append('<tr><td>%s</td><td>%s</td></tr>' % (e(nice_date(dt)), e(t)))
    out.append('</tbody></table>%s</div></details></section>' % src_link('Library of Congress bill record, updated %s' % nice_date(b['update_date']), govinfo_url(num)))

    # the chain: web -> money -> people -> lobby groups
    out.append(chain_html(b, chamber, CTX))
    # sides
    out.append('<section class="gv-sec"><h2>Arguments for and against</h2><p>We have not added arguments for or against this bill yet. When we do, each side will be shown in its own words with a source, the same way for every side. The Way does not take a side.</p></section>')

    # act
    letter = ''
    if b.get('contact_issue'):
        letter = '<a href="../contact-your-senator/?issue=%s">Write to your senators about this bill →</a> ' % e(b['contact_issue'])
    out.append('<section class="gv-sec gi-act"><h2>Tell your representatives what you think</h2><p>Your two senators and your representative in the House take calls, letters and messages from people they represent.</p><p class="gv-links">%s<a href="../reps.html">Find and contact your representatives →</a></p></section>' % letter)

    # check us
    out.append('<section class="gv-sec"><h2>Check us</h2><p>Every fact on this page comes from these official records. Please check them yourself.</p><ul class="gv-list">')
    out.append('<li><a href="%s">%s on Congress.gov (text, summary, actions) ↗</a></li>' % (e(congress_url(num)), e(num)))
    out.append('<li><a href="%s">%s official bill record from the Library of Congress (govinfo) ↗</a></li>' % (e(govinfo_url(num)), e(num)))
    srcs = data['house']['sources'] if chamber == 'house' else data['senate']['sources']
    for label, url in srcs:
        out.append('<li><a href="%s">%s ↗</a></li>' % (e(url), e(label)))
    for label, url in b.get('extra_sources', []):
        out.append('<li><a href="%s">%s ↗</a></li>' % (e(url), e(label)))
    out.append('</ul><p class="gw-status">Last checked %s. Being listed here does not mean The Way supports or opposes the bill.</p></section>' % e(checked))
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="./">← All upcoming votes</a> · <a href="../">Get Involved</a> · <a href="/government/congress/">Congress</a></nav>')

    desc = '%s (%s): when Congress votes on it, what it does, who sponsors it, and the official records to check.' % (title, num)
    return slug, page('bills/%s.html' % slug, '%s, %s' % (title, num), desc,
                      [('The Way', '/'), ('Get Involved', '../'), ('Upcoming votes', './'), (num, None)], '\n'.join(out))


def bills_index(data, bills, by_bio):
    checked = nice_date(data['checked'])
    by = {b['number']: b for b in bills}
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Congress</p><h1>Upcoming votes in Congress</h1>'
           '<p class="gv-lede">The bills and nominations Congress has scheduled for a vote, with a page for each bill. Every item links to the official schedule so you can check us.</p>'
           '<p class="gw-status">Last checked %s. Schedules change, sometimes the same day. The official links show the current plan.</p></header>' % e(checked)]
    out.append('<nav class="gi-jump" aria-label="On this page"><a href="#house">House</a><a href="#senate">Senate</a><a href="#how">How a vote works</a></nav>')
    h = data['house']
    out.append('<section class="gv-sec" id="house"><h2>House of Representatives: %s</h2><p>%s %s</p>' % (e(h['week']), e(h['status']), '<a href="%s">Check ↗</a>' % e(h['status_src'][1])))
    for day in h['days']:
        out.append('<h3>%s</h3><p class="gv-muted">%s %s</p><ul class="gi-bills">' % (e(day['label']), e(day['note']), countdown(day['at'], day['at_label'])))
        for it in day['items']:
            b = by[it['bill']]
            tag = HOW[it['how']][0]
            if it.get('senate_amendment'):
                tag = 'Senate changes, ' + tag[0].lower() + tag[1:]
            p = by_bio.get(b['sponsor'].get('bioguide'))
            sp = b['sponsor']['name']
            out.append('<li><a href="%s.html"><span class="gi-num">%s</span> <strong>%s</strong></a><span class="gi-meta">%s · Sponsor: %s</span></li>' % (
                e(slug_of(b['number'])), e(b['number']), e(b['title']), e(tag), e(sp)))
        out.append('</ul>')
    out.append('<p>%s</p><p class="gv-links">%s</p></section>' % (e(h.get('more', '')), ' '.join('<a href="%s">%s ↗</a>' % (e(u), e(l)) for l, u in h['sources'])))

    s = data['senate']
    out.append('<section class="gv-sec" id="senate"><h2>Senate: %s</h2><p>%s <a href="%s">Check ↗</a></p>' % (e(s['week']), e(s['status']), e(s['status_src'][1])))
    for day in s['days']:
        out.append('<h3>%s</h3><ul class="gi-bills">' % e(day['label']))
        for it in day['items']:
            out.append('<li><strong>%s</strong><span class="gi-meta">Nomination · %s %s <a href="%s">%s ↗</a></span></li>' % (e(it['what']), e(it['when']), countdown(it['at'], it['at_label']) if it.get('at') else '', e(it['src'][1]), e(it['src'][0])))
        out.append('</ul>')
    out.append('<h3>Bills waiting in the Senate</h3><ul class="gi-bills">')
    for it in s['pending']:
        b = by[it['bill']]
        out.append('<li><a href="%s.html"><span class="gi-num">%s</span> <strong>%s</strong></a><span class="gi-meta">%s %s</span></li>' % (
            e(slug_of(b['number'])), e(b['number']), e(it['what']), e(it['when']), countdown(it['at'], it['at_label']) if it.get('at') else ''))
    out.append('</ul><p>%s <a href="%s">Check ↗</a></p>' % (e(s['breaks']), e(s['breaks_src'][1])))
    out.append('<p class="gv-links">%s <a href="/government/congress/votes.html">Past Senate votes we track →</a></p>' % ' '.join('<a href="%s">%s ↗</a>' % (e(u), e(l)) for l, u in s['sources']))
    out.append('<p class="gw-status">%s</p></section>' % e(s['not_read']))

    out.append('<section class="gv-sec" id="how"><h2>How a vote works</h2><div class="gv-two">'
               '<div><h3>House</h3><p><strong>%s:</strong> %s</p><p><strong>%s:</strong> %s</p></div>'
               '<div><h3>Senate</h3><p><strong>Cloture:</strong> a vote to end debate so the Senate can move to a final vote. It needs three fifths of senators (60 when every seat is filled) for most bills, and a simple majority for nominations.</p>'
               '<p><strong>Nominations:</strong> the president picks judges and officials, and the Senate votes to confirm them.</p></div></div>'
               '<p class="gv-links"><a href="%s">Congress.gov legislative glossary ↗</a></p></section>' % (
                   e(HOW['suspension'][0]), e(HOW['suspension'][1]), e(HOW['rule'][0]), e(HOW['rule'][1]), GLOSSARY))
    out.append('<section class="gv-sec gi-act"><h2>Have a view on one of these?</h2><p class="gv-links"><a href="../reps.html">Contact your representatives →</a></p></section>')
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="../">← Get Involved</a> · <a href="/government/congress/">Congress</a> · <a href="/how-government-works.html">How government works</a></nav>')
    return page('bills/index.html', 'Upcoming votes in Congress',
                'The bills and nominations Congress has scheduled for a vote, each with official links to check.',
                [('The Way', '/'), ('Get Involved', '../'), ('Upcoming votes', None)], '\n'.join(out))


def reps_page(people, checked):
    states = {}
    for p in people:
        states.setdefault(p['state'], []).append(p)
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Contact</p><h1>Contact your representatives</h1>'
           '<p class="gv-lede">Everyone in a state has two U.S. senators and one member of the U.S. House. D.C. and the territories have a delegate or resident commissioner in the House instead. Pick your state to see phone numbers, websites and contact forms.</p></header>']
    out.append('<section class="gv-sec"><div class="gi-pick" hidden><label for="gi-state">Your state</label><select id="gi-state"><option value="">Pick a state</option>')
    for st in sorted(states):
        out.append('<option value="%s">%s</option>' % (e(re.sub(r'[^a-z]+', '-', st.lower()).strip('-')), e(st)))
    out.append('</select></div>'
               '<p>Not sure which House district you live in? <a href="/lookup/">Find your district by address</a>.</p>'
               '<div class="gv-note"><p><strong>Tips that help your message count.</strong> Say you live in their state or district and give your town. Name the bill (for example, H.R. 7954) and say yes or no. Keep it short and polite. Most contact forms accept only people who live in that state or district, and many ask for your street address.</p></div>'
               '<p class="gw-status">House members\' current terms end January 3, 2027. The winners of the November 3, 2026 election take office then, and this list will change.</p></section>')
    out.append('<section class="gv-sec" id="states"><h2>Every state</h2>')
    for st in sorted(states):
        sid = re.sub(r'[^a-z]+', '-', st.lower()).strip('-')
        ps = states[st]
        sen = [p for p in ps if p['role'] == 'U.S. Senator']
        house = sorted([p for p in ps if p['role'] != 'U.S. Senator'], key=lambda p: p['dist'])
        out.append('<details class="gi-state" id="st-%s"><summary>%s <span class="gv-muted">(%s)</span></summary><div class="gw-detail">' % (
            e(sid), e(st), e(('%d senators, ' % len(sen) if sen else '') + '%d in the House' % len(house))))
        for label, group in (('Senators', sen), ('House', house)):
            if not group:
                continue
            out.append('<h3>%s</h3><ul class="gi-people">' % e(label))
            for p in group:
                bits = []
                if p['phone']:
                    bits.append('<a href="tel:%s">Call %s</a>' % (e(p['phone'][0]), e(p['phone'][1])))
                if p['form']:
                    bits.append('<a href="%s">Contact form ↗</a>' % e(p['form']))
                if p['web']:
                    bits.append('<a href="%s">Website ↗</a>' % e(p['web']))
                bits.append('<a href="/government/congress/members/%s.html">Their page on The Way</a>' % e(p['slug']))
                for u, i in p['fec'][:1]:
                    bits.append('<a href="%s">Campaign money (FEC) ↗</a>' % e(u))
                seat = p['seat'].replace('U.S. Representative for ', '').replace('U.S. Senator for ', '')
                out.append('<li><p class="gi-who"><strong>%s</strong> <span class="gv-muted">%s · %s</span></p><p class="gi-ways">%s</p></li>' % (
                    e(p['name']), e(p['party']), e(seat if label == 'House' else p['role']), ' · '.join(bits)))
            out.append('</ul>')
        out.append('</div></details>')
    out.append('<p class="gw-status">Names, phone numbers, websites and contact forms come from our member pages, built from the congress-legislators dataset, a public-domain list compiled from official House, Senate and Congress.gov records. Each member\'s page names the snapshot date. Check a number on the member\'s official website before you call. Listed %s.</p></section>' % e(checked))
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="./">← Get Involved</a> · <a href="bills/">Upcoming votes</a> · <a href="/government/congress/">Congress</a></nav>')
    return page('reps.html', 'Contact your representatives',
                'Phone numbers, websites and contact forms for your two U.S. senators and your member of the U.S. House, state by state.',
                [('The Way', '/'), ('Get Involved', './'), ('Contact your representatives', None)], '\n'.join(out),
                ['/get-involved/get-involved.js?v=%s' % GI_JS])


def dates_html(data, h='h2'):
    out = ['<section class="gv-sec" id="dates"><%s>Dates to watch</%s><ul class="gi-dates">' % (h, h)]
    for dt in data.get('dates', []):
        srcs = ' '.join('<a href="%s">%s ↗</a>' % (e(u), e(l)) for l, u in dt['src'])
        link = ''
        ev = next((x for x in data.get('events', []) if x.get('at') == dt['at']), None)
        if ev:
            link += ' <a class="gi-go" href="/get-involved/dates/%s.html">Who is involved, the money and the records →</a>' % e(ev['slug'])
        if dt.get('link'):
            link += ' <a class="gi-go" href="%s">%s →</a>' % (e(dt['link'][0]), e(dt['link'][1]))
        out.append('<li><p class="gi-date"><strong>%s</strong> %s</p><p>%s%s</p><p class="gi-meta">%s Source: %s</p></li>' % (
            e(dt['label']), countdown(dt['at'], 'Countdown', dt.get('day')), e(dt['what']), link, e(dt['note']), srcs))
    out.append('</ul><p class="gv-links"><a href="/get-involved/dates/">All dates to watch, with the people and money involved →</a></p></section>')
    return '\n'.join(out)


# ---- date pages: votes and deadlines that are not a single bill (D279) ----
def group_people(kind, people):
    sen = [p for p in people if p['role'] == 'U.S. Senator']
    if kind == 'senate':
        return sen
    if kind == 'dem_caucus':
        return [p for p in sen if p['party'] == 'Democrat' or p['party'].startswith('Independent')]
    if kind == 'senate_term_ends':
        return [p for p in sen if p['ends'] == 'January 3, 2027']
    return []


def people_table(group, money):
    rows = sorted(group, key=lambda p: -(money.get(p['bioguide'], {}).get('receipts', -1)))
    tr = []
    for p in rows:
        mm = money.get(p['bioguide'])
        tr.append('<tr><td><a href="/government/congress/members/%s.html">%s</a></td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
            e(p['slug']), e(p['name']), e(p['party']), e(p['state']),
            ('<a href="%s">%s</a>' % (e(mm['web']), e(money_txt(mm['receipts'])))) if mm else 'Not in our FEC data'))
    return '<div class="gv-scroll"><table class="gv-table"><thead><tr><th>Member</th><th>Party</th><th>State</th><th>Campaign receipts, 2025 to 2026</th></tr></thead><tbody>%s</tbody></table></div>' % ''.join(tr)


def event_page(ev, data):
    people, money, by_bio = CTX['people'], CTX['money'], CTX['by_bio']
    group = group_people(ev.get('voters'), people)
    comm_people = {c: [p for p in people if c in p['committees']] for c in ev.get('committees', [])}
    out = ['<header class="gv-hero"><p class="gw-eyebrow">%s</p><h1>%s</h1></header>' % (e(ev['eyebrow']), e(ev['title']))]
    out.append('<section class="gv-sec gi-when"><h2>When</h2><p class="gv-note"><strong>%s.</strong> %s</p></section>' % (
        e(ev['date_label']), countdown(ev['at'], ev.get('at_label', 'Countdown'), ev.get('day')) if ev.get('at') else ''))
    out.append('<section class="gv-sec"><h2>What it is</h2>%s</section>' % ''.join('<p>%s</p>' % e(w) for w in ev['what']))
    law = ev.get('law')
    if law:
        tr = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td></tr>' % (e(nice_date(dt)), e(t), ('<a href="%s">%s ↗</a>' % (e(u), e(l))) if u else '') for dt, t, l, u in law['votes'])
        sp = by_bio.get(law['sponsor_bioguide'])
        spl = ('<a href="/government/congress/members/%s.html">%s</a>' % (e(sp['slug']), e(law['sponsor_name']))) if sp else e(law['sponsor_name'])
        out.append('<section class="gv-sec"><h2>The bill: %s</h2><p>Sponsor: %s. <a href="%s">%s on Congress.gov ↗</a></p><div class="gv-scroll"><table class="gv-table"><thead><tr><th>Date</th><th>What happened</th><th>Official record</th></tr></thead><tbody>%s</tbody></table></div>%s</section>' % (
            e(law['bill']), spl, e(congress_url(law['bill'])), e(law['bill']), tr, src_link('Library of Congress bill record', govinfo_url(law['bill']))))
    # web
    nodes = []
    for p in ev.get('people_links', []):
        mp = next((x for x in people if x['slug'] == p[1]), None)
        if mp:
            nodes.append(('Person', p[0], '/government/congress/members/%s.html' % p[1], 'gi-n-person'))
    if law:
        sp = by_bio.get(law['sponsor_bioguide'])
        if sp:
            nodes.append(('Sponsor', sp['name'], '/government/congress/members/%s.html' % sp['slug'], 'gi-n-person'))
    for c in ev.get('committees', []):
        nodes.append(('Committee', short_comm(c), '#people', 'gi-n-comm'))
    if group:
        tot = sum(money[p['bioguide']]['receipts'] for p in group if p['bioguide'] in money)
        nodes.append(('Their campaign money', money_txt(tot), '#money', 'gi-n-money'))
        nodes.append(('Who votes' if ev.get('voters') != 'senate_term_ends' else 'Terms ending', '%d senators' % len(group), '#people', 'gi-n-people'))
    elif ev.get('voters') == 'both':
        tot = sum(money[p['bioguide']]['receipts'] for c in comm_people for p in comm_people[c] if p['bioguide'] in money)
        nodes.append(('Committee campaign money', money_txt(tot), '#money', 'gi-n-money'))
        nodes.append(('Who votes', 'House and Senate', '../reps.html', 'gi-n-people'))
    lb = (ev.get('law') or {}).get('bill')
    if lb:
        st, fl = lda_for(lb)
        nodes.append(('Lobby groups', ('%d found' % len(set(x['client'] for x in fl))) if st else 'Not checked yet', '#lobby', 'gi-n-lobby'))
    else:
        nodes.append(('Lobby groups', 'See below', '#lobby', 'gi-n-lobby'))
    out.append('<section class="gv-sec" id="web"><h2>Its spot on the web</h2><p>This vote or date in the middle, with the people, money and groups around it. Tap any box to follow it.</p>%s</section>' % draw_web(ev['short'], nodes))
    # money
    out.append('<section class="gv-sec" id="money"><h2>The money</h2>')
    if group:
        tot = sum(money[p['bioguide']]['receipts'] for p in group if p['bioguide'] in money)
        n = sum(1 for p in group if p['bioguide'] in money)
        out.append('<p>The campaign committees of these %d senators reported <strong>%s</strong> in receipts for 2025 to 2026 (%d of them are in our FEC data).</p>' % (len(group), e(money_txt(tot)), n))
        out.append('<details><summary>Each senator\'s campaign money (%d)</summary><div class="gw-detail">%s</div></details>' % (len(group), people_table(group, money)))
    for c, mem in comm_people.items():
        tot = sum(money[p['bioguide']]['receipts'] for p in mem if p['bioguide'] in money)
        out.append('<details><summary>%s: %d members, %s in campaign receipts</summary><div class="gw-detail">%s</div></details>' % (e(c), len(mem), e(money_txt(tot)), people_table(mem, money)))
    out.append('<p class="gw-status">Receipts are everything each campaign committee reported taking in, from all donors, not money tied to this vote. From FEC bulk data in the Money Trail, totals through October 14, 2026 for most committees. Check any figure on FEC.gov.</p></section>')
    # people
    out.append('<section class="gv-sec" id="people"><h2>People involved</h2><p>%s</p>' % e(ev['voters_text']))
    if ev.get('people_links'):
        out.append('<p class="gv-links">%s</p>' % ' '.join('<a href="/government/congress/members/%s.html">%s →</a>' % (e(s_), e(n_)) for n_, s_ in ev['people_links']))
    if group:
        out.append('<details><summary>The %d senators</summary><div class="gw-detail"><p>%s</p></div></details>' % (len(group), ', '.join(
            '<a href="/government/congress/members/%s.html">%s</a> (%s, %s)' % (e(p['slug']), e(p['name']), e(p['party'][:1]), e(p['state'])) for p in sorted(group, key=lambda p: (p['state'], p['name'])))))
    for c, mem in comm_people.items():
        out.append('<details><summary>Members of the %s (%d)</summary><div class="gw-detail"><p>%s</p></div></details>' % (e(c), len(mem), ', '.join(
            '<a href="/government/congress/members/%s.html">%s</a> (%s)' % (e(p['slug']), e(p['name']), e(p['party'][:1])) for p in sorted(mem, key=lambda p: (p['party'], p['name'])))))
    out.append('<p class="gw-status">Names, parties and committee seats come from our member pages (congress-legislators dataset).</p></section>')
    out.append('<section class="gv-sec" id="lobby"><h2>Lobby groups</h2><p>%s</p><p class="gv-links"><a href="%s">Search lobbying reports on LDA.gov ↗</a> <a href="https://www.fec.gov/data/">FEC data ↗</a></p></section>' % (e(ev['lobby']), LDA_SEARCH))
    act = '<a href="../reps.html">Find and contact your representatives →</a>'
    if ev.get('contact_issue'):
        act = '<a href="../contact-your-senator/?issue=%s">Write to your senators about this →</a> ' % e(ev['contact_issue']) + act
    out.append('<section class="gv-sec gi-act"><h2>Tell them what you think</h2><p class="gv-links">%s</p></section>' % act)
    out.append('<section class="gv-sec"><h2>Check us</h2><ul class="gv-list">%s</ul><p class="gw-status">Last checked %s. Being listed here does not mean The Way takes a side.</p></section>' % (
        ''.join('<li><a href="%s">%s ↗</a></li>' % (e(u), e(l)) for l, u in ev['src']), e(nice_date(data['checked']))))
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="./">← All dates to watch</a> · <a href="../">Get Involved</a> · <a href="../bills/">Upcoming votes</a></nav>')
    return page('dates/%s.html' % ev['slug'], ev['title'], '%s: when it is, what it is, the money and people involved, and official records to check.' % ev['title'],
                [('The Way', '/'), ('Get Involved', '../'), ('Dates to watch', './'), (ev['short'], None)], '\n'.join(out))


def dates_index(data):
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Calendar</p><h1>Dates to watch</h1><p class="gv-lede">Votes and deadlines coming up in Congress, each with a countdown, the people and money involved, and official records to check.</p></header>']
    out.append('<section class="gv-sec"><ul class="gi-dates">')
    for ev in data['events']:
        out.append('<li><p class="gi-date"><a href="%s.html"><strong>%s</strong></a> %s</p><p class="gi-meta">%s</p></li>' % (
            e(ev['slug']), e(ev['title']), countdown(ev['at'], ev.get('at_label', 'Countdown'), ev.get('day')) if ev.get('at') else '', e(ev['date_label'])))
    out.append('<li><p class="gi-date"><a href="../bills/"><strong>House votes on 15 bills, November 17 to 20</strong></a></p><p class="gi-meta">Each bill has its own page.</p></li>')
    out.append('<li><p class="gi-date"><strong>Senate out for Thanksgiving, November 23 to 27, and December 21 to 31</strong></p><p class="gi-meta">%s <a href="%s">Check ↗</a></p></li>' % (e(data['senate']['breaks']), e(data['senate']['breaks_src'][1])))
    out.append('</ul><p class="gw-status">Last checked %s. Dates change; the official links on each page show the current plan.</p></section>' % e(nice_date(data['checked'])))
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="../">← Get Involved</a> · <a href="../bills/">Upcoming votes</a></nav>')
    return page('dates/index.html', 'Dates to watch', 'Votes and deadlines coming up in Congress, each with a countdown and official records.',
                [('The Way', '/'), ('Get Involved', '../'), ('Dates to watch', None)], '\n'.join(out))



def landing(data, bills):
    checked = nice_date(data['checked'])
    nh = sum(len(d['items']) for d in data['house']['days'])
    ns = sum(len(d['items']) for d in data['senate']['days'])
    cards = [
        ('Congress', 'Upcoming votes', '%d House bills and %d Senate votes are on the schedule for the week of November 16, 2026, each with a countdown. Every bill has its own page with what it does, who sponsors it and the official records.' % (nh, ns),
         'bills/', 'See upcoming votes'),
        ('Your voice', 'Contact Your Senator', 'Pick an issue and where you stand, and build a letter to your senators with sourced facts. Copy it, then send it through their contact form or call their office.',
         'contact-your-senator/', 'Write to your senators'),
        ('Your voice', 'Contact Your Representative', 'The same letter and call script writer for your member of the House. First issue: should Hakeem Jeffries lead House Democrats as Speaker? Yes or no, with sourced facts on both sides.',
         'contact-your-representative/', 'Write to your House member'),
        ('Your voice', 'Contact your representatives', 'Phone numbers, contact forms and websites for your two senators and your member of the House, state by state.',
         'reps.html', 'Find your representatives'),
        ('Public records', 'We wish we had this', 'Records that are hidden or hard to get, like police settlement payouts, dark money donors and where earmarks went. Each has a fact you can check and a button to ask your representatives for it.',
         'wish-we-had-this/', 'See what we wish we had'),
        ('Your area', 'Where you live', 'Your state: your members of Congress and their upcoming votes, elections, the state legislature and public meetings. Then find your county and districts.',
         'states/', 'Pick your state'),
        ('Your area', 'Groups on all sides', 'Political party committees registered in your state, from every party, listed the same way with their campaign money and official filings. No endorsements.',
         'states/', 'See groups by state'),
        ('Your area', 'Town halls and public meetings', 'Hearings in Congress this week, federal agency meetings open to the public, and how to find your county and city meetings.',
         'meetings.html', 'See public meetings'),
    ]
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved</p><h1>Get Involved</h1>'
           '<p class="gv-lede">What is coming up for a vote, who represents you, and how to reach them. Every fact links to an official record so you can check us. The Way does not tell you how to vote or which side to take.</p></header>']
    out.append('<section class="gv-sec"><div class="gw-grid gi-cards">')
    for eb, h, p, href, cta in cards:
        cls = 'gw-card' + ('' if href else ' gi-soon')
        out.append('<article class="%s"><p class="gw-eyebrow">%s</p><h2>%s</h2><p>%s</p>%s</article>' % (
            cls, e(eb), e(h), e(p), ('<a class="gv-open" href="%s">%s →</a>' % (e(href), e(cta))) if href else '<p class="gi-badge">Coming later</p>'))
    out.append('</div></section>')
    by = {b['number']: b for b in bills}
    out.append('<section class="gv-sec"><h2>This week in Congress</h2><ul class="gi-bills">')
    sd = data['senate']['days'][0]
    it0 = sd['items'][0]
    out.append('<li><strong>%s</strong><span class="gi-meta">Senate · %s · %s %s</span></li>' % (e(it0['what']), e(sd['label']), e(it0['when']), countdown(it0['at'], it0['at_label'])))
    first = data['house']['days'][0]
    for it in first['items'][:4]:
        b = by[it['bill']]
        out.append('<li><a href="bills/%s.html"><span class="gi-num">%s</span> <strong>%s</strong></a><span class="gi-meta">House · %s %s</span></li>' % (
            e(slug_of(b['number'])), e(b['number']), e(b['title']), e(first['label']), countdown(first['at'], first['at_label'])))
    out.append('</ul><p class="gv-links"><a href="bills/">All upcoming votes (%d bills) →</a> <a href="/government/congress/votes.html">Past Senate votes we track →</a></p>' % len(bills))
    out.append('<p class="gw-status">Last checked %s. Schedules change.</p></section>' % e(checked))
    out.append(dates_html(data))
    out.append('<section class="gv-sec"><h2>Follow the money</h2><p>See who funds the campaigns of the people voting on these bills. Every bill page links to its sponsor\'s campaign filings, and every member page links to theirs.</p><p class="gv-links"><a href="/money-trail/">Open the Money web →</a></p></section>')
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="/vote/">VOTE!</a> · <a href="/how-government-works.html">How government works</a> · <a href="/government/congress/">Congress</a></nav>')
    return page('index.html', 'Get Involved',
                'Upcoming votes in Congress with countdowns, a page for each bill, key dates, and how to contact your senators and representative, with official records to check.',
                [('The Way', '/'), ('Get Involved', None)], '\n'.join(out))


# ---- member pages: an "Upcoming votes" section for everyone who sponsors, sits on the committee for, or votes on an item ----
START, END = '<!-- tw-upcoming -->', '<!-- /tw-upcoming -->'
VOTERS_NOTE = {
    'Delegate': 'As a delegate, this member cannot vote on final passage of bills in the House.',
    'Resident Commissioner': 'As the resident commissioner, this member cannot vote on final passage of bills in the House.',
}


def member_committees(page_html):
    return set(html.unescape(m) for m in re.findall(r'<li><a href="\.\./#c-[A-Z0-9]+">([^<]+)</a></li>', page_html))


def member_block(p, page_html, data, by):
    comms = member_committees(page_html)
    rows = []
    if p['role'] == 'U.S. Senator':
        sd = data['senate']['days'][0]
        for it in sd['items']:
            why = ['Votes on it as a senator']
            if it.get('committee') in comms:
                why.insert(0, 'Sits on the %s Committee, which handles judicial nominations' % short_comm(it['committee']))
            when = '%s. %s' % (sd['label'], it['when'])
            jud = next((x['slug'] for x in data['events'] if x['slug'].startswith('senate-judges')), None)
            rows.append((1 if len(why) > 1 else 0, '<li><p>%s</p><p class="gi-meta">Nomination · %s %s</p><p class="gi-why">%s</p></li>' % (
                ('<a href="/get-involved/dates/%s.html"><strong>%s</strong></a>' % (e(jud), e(it['what']))) if jud else '<strong>%s</strong>' % e(it['what']), e(when), countdown(it['at'], it['at_label']) if it.get('at') else '', e('. '.join(why) + '.'))))
        for it in data['senate']['pending']:
            b = by[it['bill']]
            why = ['Votes on it as a senator']
            for c in b.get('senate_committees', []):
                if c in comms:
                    why.insert(0, 'Sits on the %s Committee' % short_comm(c))
            rows.append((1 if len(why) > 1 else 0, '<li><p><a href="/get-involved/bills/%s.html"><span class="gi-num">%s</span> <strong>%s</strong></a></p><p class="gi-meta">%s %s</p><p class="gi-why">%s</p></li>' % (
                e(slug_of(b['number'])), e(b['number']), e(it['what']), e(it['when']), countdown(it['at'], it['at_label']) if it.get('at') else '', e('. '.join(why) + '.'))))
    else:
        for day in data['house']['days']:
            for it in day['items']:
                b = by[it['bill']]
                why = []
                if b['sponsor'].get('bioguide') == p['bioguide']:
                    why.append('Sponsor of this bill')
                hit = [c for c in b['committees'] if c in comms]
                for c in hit:
                    why.append('Sits on the %s Committee, which handled it' % short_comm(c))
                why.append(VOTERS_NOTE.get(p['role'], 'Votes on it as a member of the House'))
                tag = HOW[it['how']][0]
                rank = 2 if b['sponsor'].get('bioguide') == p['bioguide'] else (1 if hit else 0)
                rows.append((rank, '<li><p><a href="/get-involved/bills/%s.html"><span class="gi-num">%s</span> <strong>%s</strong></a></p><p class="gi-meta">%s · %s %s</p><p class="gi-why">%s</p></li>' % (
                    e(slug_of(b['number'])), e(b['number']), e(b['title']), e(day['label']), e(tag), countdown(day['at'], day['at_label']), e('. '.join(why) + '.'))))
    rows += event_rows(p)
    if not rows:
        return ''
    rows.sort(key=lambda r: -r[0])
    involved = sum(1 for r in rows if r[0])
    chamber = 'Senate' if p['role'] == 'U.S. Senator' else 'House'
    lead = 'Votes and dates coming up in the %s that involve this member' % chamber
    if involved:
        lead += ', with the ones they sponsor, whose committee they sit on, or that only some members take part in first'
    out = [START, '<section class="gv-sec gi-member" id="upcoming"><h2>Upcoming votes and dates</h2><p>%s. Each has a countdown and a page on The Way with the official records.</p><ul class="gi-bills">' % e(lead)]
    out += [r[1] for r in rows]
    out.append('</ul><p class="gv-links"><a href="/get-involved/bills/">All upcoming votes →</a> <a href="/get-involved/dates/">Dates to watch →</a> <a href="/get-involved/reps.html">Contact your representatives →</a></p>')
    out.append('<p class="gw-status">From the House Majority Leader schedule, the Senate floor schedule and Executive Calendar, and Library of Congress bill records, checked %s. Committee seats from this page. Schedules change. How they voted is added after the vote.</p></section>' % e(nice_date(data['checked'])))
    out.append('<script src="/get-involved/get-involved.js?v=%s" defer></script>' % GI_JS)
    out.append(END)
    return '\n'.join(out)


EVENT_WHY = {
    'dem_caucus': 'Votes in it as a senator in the Democratic caucus',
    'both': None,
    'senate_term_ends': 'Their current term ends that day at noon',
}


def event_rows(p):
    rows = []
    for ev in CTX.get('events', []):
        kind = ev.get('voters')
        if not ev.get('at') or ev['slug'].startswith('senate-judges'):
            continue
        if kind == 'both':
            why = VOTERS_NOTE.get(p['role']) or ('Votes on any new funding as a senator' if p['role'] == 'U.S. Senator' else 'Votes on any new funding as a member of the House')
        elif kind == 'senate_term_ends':
            if p['ends'] != 'January 3, 2027':
                continue
            why = EVENT_WHY[kind]
        elif p in group_people(kind, CTX['people']):
            why = EVENT_WHY[kind]
        else:
            continue
        rows.append((1 if (kind == 'dem_caucus' or (kind == 'senate_term_ends' and p['role'] == 'U.S. Senator')) else 0, '<li><p><a href="/get-involved/dates/%s.html"><strong>%s</strong></a></p><p class="gi-meta">%s %s</p><p class="gi-why">%s</p></li>' % (
            e(ev['slug']), e(ev['title']), e(ev['date_label']), countdown(ev['at'], ev.get('at_label', 'Countdown'), ev.get('day')), e(why + '.'))))
    return rows


def update_member_pages(people, data, bills):
    by = {b['number']: b for b in bills}
    n = 0
    for p in people:
        f = os.path.join(MEMBERS, p['slug'] + '.html')
        s = open(f, encoding='utf-8').read()
        s2 = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', s, flags=re.S)
        s2 = re.sub(r'<link rel="stylesheet" href="/get-involved/get-involved\.css\?v=[0-9]+">\n?', '', s2)
        block = member_block(p, s2, data, by)
        if block:
            s2 = s2.replace('</head>', '<link rel="stylesheet" href="/get-involved/get-involved.css?v=%s">\n</head>' % GI_CSS, 1)
            anchor = '<nav class="gv-next"'
            assert anchor in s2, f
            s2 = s2.replace(anchor, block + '\n' + anchor, 1)
        if s2 != s:
            open(f, 'w', encoding='utf-8').write(s2)
            n += 1
    return n


# ---- D282: Money web spots for every upcoming bill ----
def write_web_data(bills, by_bio):
    out = []
    for b in bills:
        p = by_bio.get(b['sponsor'].get('bioguide'))
        m = CTX['money'].get(b['sponsor'].get('bioguide'))
        party = {'Democrat': 'D', 'Republican': 'R'}.get(p['party'], 'I') if p else ''
        abbr = STATE_ABBR.get(p['state'], '') if p else ''
        st, fl = lda_for(b['number'])
        lobby = []
        for x in fl:
            per, end = PERIOD.get(x['period'], (x['period'], ''))
            lobby.append({'client': x['client'], 'registrant': x['registrant'], 'income': x.get('income'), 'period': '%s %s' % (per, x.get('year', '')),
                          'end': (str(x.get('year')) + end) if end else '', 'url': x['url'], 'text': x['text'], 'money': lda_money(x)})
        out.append({'slug': slug_of(b['number']), 'number': b['number'], 'hub': hub_of(b), 'page': '/get-involved/bills/%s.html' % slug_of(b['number']),
                    'record': govinfo_url(b['number']), 'introduced': b.get('introduced', ''),
                    'sponsor': {'bioguide': p['bioguide'], 'name': p['name'], 'party': party, 'st': abbr,
                                'page': '/government/congress/members/%s.html' % p['slug']} if p else None,
                    'campaign': {'name': m['name'], 'receipts': money_txt(m['receipts']), 'through': m.get('through') or '', 'fec': m['fec']} if (p and m) else None,
                    'committees': list(b['committees']) + [c for c in b.get('senate_committees', []) if c not in b['committees']],
                    'lobby': lobby})
    js = ('// Upcoming bills on the Money web (D282). Built by tools/get-involved/build_get_involved.py. Do not edit by hand.\n'
          'window.TW_UPCOMING_WEB=' + json.dumps({'built': datetime.date.today().isoformat(), 'bills': out}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(os.path.join(SITE, 'money-trail', 'upcoming-web-data.js'), 'w', encoding='utf-8').write(js)
    # load it on the Money Trail page, after budgets-view.js and before app.js (idempotent)
    ix = os.path.join(SITE, 'money-trail', 'index.html')
    t = open(ix, encoding='utf-8').read()
    t2 = re.sub(r'<script src="upcoming-web(-data)?\.js\?v=[^"]*"></script>\n', '', t)
    tag = '<script src="upcoming-web-data.js?v=%s"></script>\n<script src="upcoming-web.js?v=%s"></script>\n' % (WEB_V, WEB_V)
    t2 = re.sub(r'(<script src="app\.js\?v=[^"]*"></script>)', lambda m: tag + m.group(1), t2, count=1)
    assert 'upcoming-web.js' in t2
    if t2 != t:
        open(ix, 'w', encoding='utf-8').write(t2)


# ---- D282: public meetings (Congress committees and federal agencies) ----
def meetings_page(mt):
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Public meetings</p><h1>Public meetings and hearings</h1>'
           '<p class="gv-lede">Meetings the public can watch or attend: committee hearings in Congress and federal agency meetings. Most hearings stream live on the committee\'s website. For town halls with your own members of Congress, check their websites, which you can find on the contact page.</p></header>']
    out.append('<p class="gv-links"><a href="#senate">Senate committees</a> <a href="#house">House committees</a> <a href="#agency">Federal agencies</a> <a href="#local">Local meetings</a></p>')
    def day(d):
        return nice_date(d)
    S = mt['senate']
    out.append('<section class="gv-sec" id="senate"><h2>Senate committee hearings, week of November 16</h2><div class="gv-scroll"><table class="gv-table"><thead><tr><th>Day</th><th>Time (Eastern)</th><th>Committee</th><th>What</th><th>Room</th></tr></thead><tbody>%s</tbody></table></div><p class="gw-status">%s %s</p></section>' % (
        ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (e(day(x['date'])), e(x['time']), e(x['committee']), e(x['what']), e(x['room'])) for x in S['items']),
        e(S['note']), src_link('Senate committee hearings and meetings', S['src'])))
    H = mt['house']
    out.append('<section class="gv-sec" id="house"><h2>House committee meetings, week of November 16</h2><div class="gv-scroll"><table class="gv-table"><thead><tr><th>Day</th><th>Time (Eastern)</th><th>Committee</th><th>Details</th></tr></thead><tbody>%s</tbody></table></div><p class="gw-status">%s %s</p></section>' % (
        ''.join('<tr><td>%s</td><td>%s</td><td>%s%s</td><td><a href="%s">Title, room and video ↗</a></td></tr>' % (e(day(x['date'])), e(x['time']), e(x['committee']), (' · ' + e(x['sub'])) if x['sub'] else '', e(x['url'])) for x in H['items']),
        e(H['note']), src_link('House committee calendar', H['src'])))
    A = mt['agency']
    out.append('<section class="gv-sec" id="agency"><h2>Federal agency meetings open to the public</h2><div class="gv-scroll"><table class="gv-table"><thead><tr><th>Day</th><th>Time</th><th>Who</th><th>What</th><th>How to attend</th></tr></thead><tbody>%s</tbody></table></div><p class="gw-status">%s %s</p></section>' % (
        ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td><a href="%s">%s ↗</a></td><td>%s</td></tr>' % (e(day(x['date'])), e(x['time']), e(x['agency']), e(x['url']), e(x['what']), e(x['how'])) for x in A['items']),
        e(A['note']), src_link('Federal Register', A['src'])))
    out.append('<section class="gv-sec" id="local"><h2>Local meetings: county boards, councils and school boards</h2>'
               '<p>City councils, county commissions and school boards post their meetings on their own websites. Our district lookup finds your county\'s official sites, and its home computer job is adding their public meeting pages and dates, each checked against the official page.</p>'
               '<p class="gv-links"><a href="/lookup/">Find your county →</a> <a href="states/">Your state on Get Involved →</a></p></section>')
    out.append('<p class="gw-status">Checked %s. Meetings change or get canceled; the official page has the final word.</p>' % e(nice_date(mt['checked'])))
    return page('meetings.html', 'Public meetings and hearings',
                'Congressional committee hearings and federal agency meetings open to the public, with times and official links.',
                [('The Way', '/'), ('Get Involved', '/get-involved/'), ('Public meetings', None)], '\n'.join(out))


# ---- D282: a Get Involved page for each state ----
STATE_ABBR = {}
ABBR_STATE = {}
FEC_PARTY = {'DEM': 'Democratic', 'REP': 'Republican', 'LIB': 'Libertarian', 'GRE': 'Green', 'GRN': 'Green', 'CON': 'Constitution',
             'WOR': 'Working Families', 'WFP': 'Working Families', 'WF': 'Working Families', 'CRV': 'Conservative', 'FWD': 'Forward',
             'IND': 'Independent', 'AIP': 'American Independent', 'DFL': 'Democratic-Farmer-Labor', 'REF': 'Reform', 'PRG': 'Progressive',
             'NPA': 'No party affiliation', 'UN': 'Unaffiliated', 'OTH': 'Other', 'SUB': 'Other', '': 'Party not given'}


def place_by_name(name, states):
    """The state named in a committee's registered name, or ''. A county or city with a state's name does not count."""
    up = ' ' + re.sub(r'[^A-Z ]', ' ', name.upper()) + ' '
    for st in sorted(states, key=len, reverse=True):
        for m in re.finditer(r'(?<= )' + re.escape(st.upper()) + r'(?= )', up):
            after = up[m.end():].lstrip()
            before = up[:m.start()].rstrip()
            if re.match(r'(COUNTY|CITY|PARISH|TOWNSHIP|TOWN)\b', after) or (st in ('Virginia',) and before.endswith('WEST')) \
                    or (st in ('Kansas',) and before.endswith('AR')):
                continue
            return st
    # A name that starts with a state's postal code and a party word (DC REPUBLICAN PARTY, NY REPUBLICAN ...).
    m = re.match(r'^([A-Z]{2}) (DEMOCRATIC|DEMOCRATS|REPUBLICAN|REPUBLICANS|GOP|LIBERTARIAN|GREEN|STATEHOOD)\b', name.upper())
    if m and m.group(1) in ABBR_STATE:
        return ABBR_STATE[m.group(1)]
    return ''


def party_groups(states):
    by = {}
    unplaced = 0
    for c, loaded in fec_committees():
        if not str(c.get('committee_type', '')).startswith('Party'):
            continue
        tot = c.get('totals') if isinstance(c.get('totals'), dict) else {}
        # The FEC mailing state when the daily FEC job has saved it (add_fec_batch.py, D282), else the state the name says.
        # National party committees (DNC, RNC, DCCC and the like) are national, wherever their office is.
        national = re.search(r'NATIONAL|\bDCCC\b|\bNRCC\b|\bDSCC\b|\bNRSC\b|\bDNC\b|\bRNC\b|OF THE UNITED STATES|OF AMERICA', c['name'].upper())
        st = '' if national else (ABBR_STATE.get(c.get('state') or '') or place_by_name(c['name'], states))
        if not st:
            unplaced += 1
            continue
        q = 'view=network&hub=' + urllib.parse.quote(c['name']) if loaded else 'fec=' + c['committee_id']
        by.setdefault(st, []).append({'name': c['name'], 'party': FEC_PARTY.get(c.get('party') or '', 'Other'), 'id': c['committee_id'],
                                      'receipts': tot.get('receipts') or 0, 'through': tot.get('through'), 'web': '/money-trail/?' + q})
    return by, unplaced


def person_li(p, show_seat):
    bits = []
    if p['phone']:
        bits.append('<a href="tel:%s">Call %s</a>' % (e(p['phone'][0]), e(p['phone'][1])))
    if p['form']:
        bits.append('<a href="%s">Contact form ↗</a>' % e(p['form']))
    if p['web']:
        bits.append('<a href="%s">Website ↗</a>' % e(p['web']))
    bits.append('<a href="/government/congress/members/%s.html#upcoming">Their upcoming votes</a>' % e(p['slug']))
    m = CTX['money'].get(p['bioguide'])
    if m:
        bits.append('<a href="%s">Campaign money: %s</a>' % (e(m['web']), e(money_txt(m['receipts']))))
    seat = p['seat'].replace('U.S. Representative for ', '').replace('U.S. Senator for ', '')
    return '<li><p class="gi-who"><strong>%s</strong> <span class="gv-muted">%s · %s</span></p><p class="gi-ways">%s</p></li>' % (
        e(p['name']), e(p['party']), e(seat if show_seat else p['role']), ' · '.join(bits))


def official_links(state_slug):
    f = os.path.join(SITE, 'states', state_slug + '.html')
    if not os.path.exists(f):
        return []
    t = open(f, encoding='utf-8').read()
    m = re.search(r'id="links".*?</ul>', t, re.S)
    found = re.findall(r'href="(https://[^"]+)"[^>]*>([^<]+)</a>', m.group(0)) if m else []
    return [(u, t) for u, t in found if not t.strip().startswith('http')][:5]


def state_page(st, abbr, slug, people, groups, info, checked):
    sen = [p for p in people if p['role'] == 'U.S. Senator']
    house = sorted([p for p in people if p['role'] != 'U.S. Senator'], key=lambda p: p['dist'] or 0)
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · %s</p><h1>Get involved in %s</h1>'
           '<p class="gv-lede">Who represents %s in Congress and what they vote on next, elections and the state legislature, public meetings, and the political party groups registered here from every side, each with official records to check.</p></header>' % (e(abbr), e(st), e(st))]
    out.append('<p class="gv-links"><a href="#members">Your members of Congress</a> <a href="#elections">Elections</a> <a href="#legislature">State legislature</a> <a href="#meetings">Public meetings</a> <a href="#groups">Groups on all sides</a></p>')
    out.append('<section class="gv-sec" id="members"><h2>Your members of Congress</h2>')
    for label, g in (('Senators', sen), ('House', house)):
        if g:
            out.append('<h3>%s</h3><ul class="gi-people">%s</ul>' % (label, ''.join(person_li(p, label == 'House') for p in g)))
    out.append('<p class="gv-links"><a href="/get-involved/bills/">All upcoming votes in Congress →</a> <a href="/get-involved/dates/">Dates to watch →</a></p></section>')
    # elections
    out.append('<section class="gv-sec" id="elections"><h2>Elections coming up</h2>')
    els = [x for x in info.get('elections', []) if x['date'] >= datetime.date.today().isoformat()]
    if els:
        out.append('<ul class="gi-dates">%s</ul>' % ''.join('<li><p class="gi-date"><strong>%s</strong> %s</p><p>%s</p><p class="gi-meta">%s</p></li>' % (
            e(nice_date(x['date'])), countdown(x['date'] + 'T00:00:00-05:00', 'Countdown', True), e(x['what']), src_link('official state page', x['src'])) for x in els))
    if info.get('elections_note'):
        out.append('<p class="gw-status">%s %s</p>' % (e(info['elections_note']), src_link('official state page', info['elections_src']) if info.get('elections_src') else ''))
    if not els and not info.get('elections_note'):
        out.append('<p>We have not checked the state election calendar for upcoming elections yet. Your state and county election offices have the dates.</p>')
    out.append('<h3>County and city elections and meetings</h3><div id="gi-local" data-state="%s"><p class="gi-local-wait">Loading what our county checker has found on official county sites…</p></div>' % e(abbr.lower()))
    links = official_links(slug)
    lk = ['<a href="/lookup/">Find your county and districts →</a>']
    if info.get('local'):
        lk.append('<a href="%s">County election offices (state list) ↗</a>' % e(info['local']))
    lk += ['<a href="%s">%s ↗</a>' % (e(u), e(t)) for u, t in links]
    lk.append('<a href="/states/%s.html">Voting rules in %s →</a>' % (e(slug), e(st)))
    out.append('<p class="gv-links">%s</p></section>' % ' '.join(lk))
    # legislature
    lg = info.get('leg') or {}
    out.append('<section class="gv-sec" id="legislature"><h2>State legislature</h2>')
    if lg.get('start'):
        out.append('<p class="gv-note"><strong>Next session begins %s.</strong> %s %s</p>' % (e(nice_date(lg['start'])), countdown(lg['start'] + 'T00:00:00-05:00', 'Countdown', True), e(lg.get('note', ''))))
    else:
        out.append('<p>We have not checked when the next session begins yet.</p>')
    ll = []
    if lg.get('home'):
        ll.append('<a href="%s">Legislature website ↗</a>' % e(lg['home']))
    if lg.get('bills'):
        ll.append('<a href="%s">Search state bills ↗</a>' % e(lg['bills']))
    if ll:
        out.append('<p class="gv-links">%s</p>' % ' '.join(ll))
    out.append('<p class="gw-status">From the legislature\'s own website%s. State bills will get their own pages here later.</p></section>' % (', checked ' + e(nice_date(checked)) if lg else ''))
    # meetings
    out.append('<section class="gv-sec" id="meetings"><h2>Public meetings</h2>')
    if info.get('meetings'):
        out.append('<p>%s posts meetings of state boards and agencies on one official calendar.</p><p class="gv-links"><a href="%s">State public meetings calendar ↗</a></p>' % (e(st), e(info['meetings'])))
    out.append('<p>County commissions, city councils and school boards post their own meetings. Find your county\'s official site with the district lookup.</p><p class="gv-links"><a href="/lookup/">Find your county →</a> <a href="/get-involved/meetings.html">Hearings in Congress and federal meetings this week →</a></p></section>')
    # groups
    out.append('<section class="gv-sec" id="groups"><h2>Groups on all sides</h2>'
               '<p>Political party committees in %s registered with the Federal Election Commission, from every party, listed the same way. Amounts are what each committee reported taking in for 2025 to 2026. The Way does not endorse any party or group.</p>' % e(st))
    if groups:
        parties = {}
        for g in groups:
            parties.setdefault(g['party'], []).append(g)
        for pn in sorted(parties):
            gs = sorted(parties[pn], key=lambda g: -g['receipts'])
            out.append('<h3>%s</h3><ul class="gv-list">%s</ul>' % (e(pn), ''.join(
                '<li><a href="%s">%s</a> · %s%s · <a href="https://www.fec.gov/data/committee/%s/">FEC ↗</a></li>' % (
                    e(g['web']), e(g['name']), e(money_txt(g['receipts'])), (' through ' + e(nice_date(g['through']))) if g.get('through') else '', e(g['id'])) for g in gs)))
    else:
        out.append('<p>No party committee in our FEC data has %s in its name.</p>' % e(st))
    out.append('<p class="gw-status">From FEC bulk data in the Money Trail. A committee is placed in a state by the mailing address it gives the FEC, or, until our daily FEC update has saved that address, only when its registered name names the state, so some county and city party committees are not listed yet. National party committees are not on state pages. Issue groups and PACs from every side will be added the same way.</p></section>')
    out.append('<nav class="gv-next" aria-label="Keep exploring"><a href="/get-involved/states/">All states</a> · <a href="/get-involved/">Get Involved</a> · <a href="/states/%s.html">Voting in %s</a></nav>' % (e(slug), e(st)))
    return page('states/%s.html' % slug, 'Get involved in %s' % st,
                'Members of Congress for %s and their upcoming votes, elections, the state legislature, public meetings and party groups from every side.' % st,
                [('The Way', '/'), ('Get Involved', '/get-involved/'), ('States', '/get-involved/states/'), (st, None)], '\n'.join(out))


def states_index(rows, unplaced):
    out = ['<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Where you live</p><h1>Get involved where you live</h1>'
           '<p class="gv-lede">Pick your state for your members of Congress and their upcoming votes, elections, the state legislature, public meetings and party groups from every side.</p></header>']
    out.append('<section class="gv-sec"><ul class="gi-statelist">%s</ul></section>' % ''.join(
        '<li><a href="%s.html">%s</a> <span class="gv-muted">%d party groups</span></li>' % (e(slug), e(st), n) for st, slug, n in rows))
    out.append('<p class="gw-status">%d party committees in our FEC data are national, or are county and city parties whose state we do not have yet, so they are not on a state page yet.</p>' % unplaced)
    return page('states/index.html', 'Get involved where you live', 'Every state and D.C.: members of Congress, upcoming votes, elections, legislature, public meetings and party groups from every side.',
                [('The Way', '/'), ('Get Involved', '/get-involved/'), ('States', None)], '\n'.join(out))


def main():
    data = json.load(open(os.path.join(os.path.dirname(__file__), 'upcoming.json'), encoding='utf-8'))
    people = read_members()
    by_bio = {p['bioguide']: p for p in people if p['bioguide']}
    here = os.path.dirname(__file__)
    lda = json.load(open(os.path.join(here, 'lda.json'), encoding='utf-8')) if os.path.exists(os.path.join(here, 'lda.json')) else {}
    CTX.update(people=people, by_bio=by_bio, money=money_for(people), events=data['events'], lda=lda)
    st_list = json.load(open(os.path.join(SITE, 'lookup', 'data', 'states.json'), encoding='utf-8'))
    STATE_ABBR.update({x['name']: x['abbr'] for x in st_list})
    ABBR_STATE.update({x['abbr']: x['name'] for x in st_list})
    bills = data['bills']
    os.makedirs(os.path.join(OUT, 'bills'), exist_ok=True)
    for old in glob.glob(os.path.join(OUT, 'bills', '*.html')):
        os.remove(old)
    for b in bills:
        slug, h = bill_page(b, data, by_bio)
        open(os.path.join(OUT, 'bills', slug + '.html'), 'w', encoding='utf-8').write(h)
    open(os.path.join(OUT, 'bills', 'index.html'), 'w', encoding='utf-8').write(bills_index(data, bills, by_bio))
    open(os.path.join(OUT, 'reps.html'), 'w', encoding='utf-8').write(reps_page(people, nice_date(data['checked'])))
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(landing(data, bills))
    os.makedirs(os.path.join(OUT, 'dates'), exist_ok=True)
    for old in glob.glob(os.path.join(OUT, 'dates', '*.html')):
        os.remove(old)
    for ev in data['events']:
        open(os.path.join(OUT, 'dates', ev['slug'] + '.html'), 'w', encoding='utf-8').write(event_page(ev, data))
    open(os.path.join(OUT, 'dates', 'index.html'), 'w', encoding='utf-8').write(dates_index(data))
    write_web_data(bills, by_bio)
    mt = json.load(open(os.path.join(here, 'meetings.json'), encoding='utf-8'))
    open(os.path.join(OUT, 'meetings.html'), 'w', encoding='utf-8').write(meetings_page(mt))
    sj = json.load(open(os.path.join(here, 'states.json'), encoding='utf-8'))
    names = [x['name'] for x in st_list]
    groups, unplaced = party_groups(names)
    os.makedirs(os.path.join(OUT, 'states'), exist_ok=True)
    rows = []
    for x in st_list:
        st, abbr = x['name'], x['abbr']
        slug = re.sub(r'[^a-z]+', '-', st.lower()).strip('-')
        ps = [p for p in people if p['state'] == st]
        open(os.path.join(OUT, 'states', slug + '.html'), 'w', encoding='utf-8').write(
            state_page(st, abbr, slug, ps, groups.get(st, []), sj['states'].get(abbr, {}), sj['checked']))
        rows.append((st, slug, len(groups.get(st, []))))
    open(os.path.join(OUT, 'states', 'index.html'), 'w', encoding='utf-8').write(states_index(rows, unplaced))
    n = update_member_pages(people, data, bills)
    print('Get Involved: %d bill pages, %d members, %d member pages updated' % (len(bills), len(people), n))


if __name__ == '__main__':
    main()
