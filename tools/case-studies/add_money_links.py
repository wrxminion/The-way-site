"""Put the Money Trail links on the Election Studies cards (site/case-studies/index.html).

Each card whose measure has money in the Money Trail archive gets two links, the same pictures
as the Follow the money box on the Money Trail page:
  the blue filing cabinet -> that measure's trail (/money-trail/follow.html?measure=ID)
  the open cabinet with the web -> the money web full screen, centered on the measure, which
  shows the committees for and against it and the money into them.
A measure "has money" when a committee tied to it (a registered position, or a line to the
measure in the web) has at least one dollar record, or a dollar record is tagged to the measure.
Cards with no money get no links, so nobody is sent to an empty trail.

Rerun after each Money Trail data batch, from the repository root:
  python3 tools/case-studies/add_money_links.py
It replaces the links it wrote before and prints which cards got links and which got none.
"""
import html as H
import json
import pathlib
import re
from collections import defaultdict

SITE = pathlib.Path('site')
PAGE = SITE / 'case-studies' / 'index.html'
CABINET = '/money-trail/art/records-cabinet.webp'
WEB_CABINET = '/money-trail/art/money-web-cabinet.webp'
NAMED = {  # guide page -> trail ID, where the file name does not carry the number
    ('nc', 'income-tax-cap-amendment'): 'NC-INCOME-2026',
    ('nc', 'photo-id-amendment'): 'NC-ID-2026',
    ('nc', 'property-tax-limit-amendment'): 'NC-PROPERTY-2026',
}

src = (SITE / 'money-trail' / 'follow.html').read_text(encoding='utf-8')
rec = json.loads(re.search(r'<script[^>]*id="way-trail-records"[^>]*>(.*?)</script>', src, re.S).group(1))
ballots = {b[0] for b in rec['ballots']}


def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('’', "'")).strip().upper()


committees = defaultdict(set)
for measure, name, _stance, _url in rec['positions']:
    committees[measure].add(norm(name))
for e in rec['edges']:
    if e[1] in ballots:
        committees[e[1]].add(norm(e[0]))
dollars = defaultdict(int)
tagged = defaultdict(int)
for e in rec['edges']:
    if e[3]:
        dollars[norm(e[0])] += 1
        dollars[norm(e[1])] += 1
        if e[6]:
            tagged[e[6]] += 1
for t in rec['tx']:
    dollars[norm(t[4])] += 1
    dollars[norm(t[5])] += 1


def has_money(mid):
    return bool(tagged[mid]) or any(dollars[c] for c in committees[mid])


def trail_id(href):
    m = re.match(r'\.\./guide(?:-([a-z]{2}))?/measures/([a-z0-9-]+)\.html$', href)
    if not m:
        return None
    st, slug = (m.group(1) or 'co'), m.group(2)
    if (st, slug) in NAMED:
        return NAMED[(st, slug)]
    n = re.match(r'(?:amendment|proposition|state-question|question)-([0-9a-z]+?)(?:-|$)', slug)
    tid = n and st.upper() + '-' + n.group(1).upper()
    return tid if tid in ballots else None


def links(mids):
    img = '<img src="%s" alt="" width="40" height="44" loading="lazy" decoding="async">'
    rows = []
    for mid in mids:
        short = mid.replace('-', ' ', 1)
        trail = '/money-trail/follow.html?measure=' + H.escape(mid)
        web = '/money-trail/?view=network&amp;hub=' + H.escape(mid) + '&amp;full=1'
        if len(mids) == 1:
            rows.append('<li><a href="%s">%sOpen the trail for %s</a></li>' % (trail, img % CABINET, short))
            rows.append('<li><a href="%s">%sMoney web full screen</a></li>' % (web, img % WEB_CABINET))
        else:  # a card with several measures: one short row each
            rows.append('<li class="cs-money-row"><span>%s</span><a href="%s" aria-label="Open the trail for %s">%sTrail</a>'
                        '<a href="%s" aria-label="Money web full screen for %s">%sMoney web</a></li>'
                        % (short, trail, short, img % CABINET, web, short, img % WEB_CABINET))
    return '<div class="cs-money"><p class="cs-money-h">Follow the money</p><ul>' + ''.join(rows) + '</ul></div>'


page = PAGE.read_text(encoding='utf-8')
page = re.sub(r'<div class="cs-money">.*?</ul></div>', '', page, flags=re.S)
got, none = [], []


def card(m):
    art = m.group(0)
    title = re.search(r'<h2[^>]*><a href="[^"]+">([^<]+)', art).group(1)
    mids = []
    for href in re.findall(r'href="(\.\./guide[^"]*)"', art):
        tid = trail_id(href)
        if tid and tid not in mids:
            mids.append(tid)
    withm = [x for x in mids if has_money(x)]
    if not withm:
        none.append(title)
        return art
    got.append('%s (%s)' % (title, ', '.join(withm)))
    return art.replace('</article>', links(withm) + '</article>')


page = re.sub(r'<article class="card".*?</article>', card, page, flags=re.S)
PAGE.write_text(page, encoding='utf-8')
print('Cards with money links:')
for g in got:
    print('  ' + g)
print('Cards with no money records yet (no links):')
for n in none:
    print('  ' + H.unescape(n))
