#!/usr/bin/env python3
"""Front page money web (site/index.html, section #followmoney): a search box first, then one group's web.

Usage (from repo root):
  python3 -I tools/money-trail/build_home_web.py site

Re-run it after every new batch of records (FEC batches, state filings), so the front page stays accurate.

What it makes:
- A big search box. Typing shows names from the archive (site/money-trail/home-names.json, made here).
  A name from the list opens its money web on the Money Trail page; anything else opens a Money Trail search.
- A web for one group, picked at random each time the page opens (site/money-trail/home-web.js).
  The random pick is fair by side: it first picks a side at random (Democratic side, Republican side,
  ballot measure Yes, ballot measure No, no side recorded), then a group on that side, so a side with more
  groups in the archive does not show up more often. "Show another" then takes turns between the sides and
  goes through every group once before any group repeats.
- The records are the same ones the Money Trail page loads: money-trail/data.js (the Nov 5 archive),
  money-trail/fec-data.js (FEC batches) and money-trail/mi-filings.js (Michigan state filings).
- A group can be picked only when its own filings are in the archive and its web has at least 4 names.
- Each web shows up to 8 of the largest amounts in or out, by dollars. People are never shown.
Styles live in site/home.css (.mw-*).
"""
import collections, hashlib, html, json, math, sys, urllib.parse
from datetime import date

ROOT = (sys.argv[1] if len(sys.argv) > 1 else 'site').rstrip('/') + '/'
MT = ROOT + 'money-trail/'


def load(name, var):
    s = open(MT + name, encoding='utf-8').read()
    a = s.index(var + '=') + len(var) + 1
    return json.JSONDecoder().raw_decode(s[a:])[0]


R = load('data.js', 'const RESEARCH')
F = load('fec-data.js', 'const FEC_FILINGS')
M = load('mi-filings.js', 'const MI_FILINGS')

# The same merge the Money Trail page does in the browser (see the end of fec-data.js and mi-filings.js).
TX = list(R['transactions'])
seen = {t['transaction_id'] for t in TX}
for t in F['transactions']:
    if t['transaction_id'] not in seen:
        TX.append(t); seen.add(t['transaction_id'])
mi_id = lambda c: 'mitn:' + c['committee_id']
for item, side, kind, other, amount, day, rep, notes in M['rows']:
    c = M['committees'][side]; out = kind == 2
    tid = ('MITN-X-' if out else 'MITN-') + item
    if tid in seen: continue
    seen.add(tid)
    oname = (M['entities'].get(other) or [other])[0]
    TX.append({'transaction_id': tid, 'source_entity_id': mi_id(c) if out else other, 'recipient_entity_id': other if out else mi_id(c),
               'source_name': c['name'] if out else oname, 'recipient_name': oname if out else c['name'], 'amount_usd': amount})

# Readable names for committees known by initials on their filings.
READABLE = {'fec:C00000935': 'DCCC', 'fec:C00042366': 'DSCC', 'fec:C00010603': 'Democratic National Committee',
            'fec:C00484642': 'Senate Majority PAC', 'fec:C00495028': 'House Majority PAC', 'fec:C00669259': 'Future Forward PAC',
            'fec:C00492140': 'American Bridge 21st Century', 'fec:C00004036': 'SEIU COPE', 'fec:C00193433': "EMILY's List",
            'fec:C00486845': 'LCV Victory Fund', 'fec:C00495861': 'Priorities USA Action',
            'fec:C00075820': 'NRCC', 'fec:C00027466': 'NRSC', 'fec:C00003418': 'Republican National Committee',
            'fec:C00571703': 'Senate Leadership Fund', 'fec:C00504530': 'Congressional Leadership Fund'}

# Which groups have their own filings in the archive, and the date their records were pulled.
def own_filer(t):
    t = (t or '').lower()
    return any(k in t for k in ('party', 'super pac', 'hybrid pac', 'referendum committee', 'ballot committee', 'issue committee',
                                'ballot question committee', 'ballot support committee', 'ballot opposition committee',
                                'political action committee', ' pac'))


ARCHIVE_DAY = R['meta']['generated_on']
filer = {}  # entity id -> as-of date
for e in R['entities']:
    if own_filer(e['entity_type']): filer[e['entity_id']] = ARCHIVE_DAY
for c in F['committees']:
    filer['fec:' + c['committee_id']] = c['retrieved'][:10]
for c in M['committees']:
    filer[mi_id(c)] = M['meta']['updated']

# Sides, used only to keep the random pick fair. Federal: the two lists the FEC pull was built from
# (money-trail-research/fec_pull.py, TARGETS and OTHER_SIDES; Fairshake is cross-party and left out), plus GOPAC.
# Ballot measures: the committee's own stance in the archive (positions) or the Michigan filing.
DEM = {'C00484642', 'C00495028', 'C00669259', 'C00000935', 'C00042366', 'C00010603', 'C00492140', 'C00495861', 'C00530766',
       'C00193433', 'C00486845', 'C00004036'}
REP = {'C00571703', 'C00504530', 'C00003418', 'C00075820', 'C00027466', 'C00487470', 'C00687103', 'C00559740'}
SIDES = [('D', 'Democratic side'), ('R', 'Republican side'), ('yes', 'Ballot measure, Yes side'), ('no', 'Ballot measure, No side'), ('x', 'No side recorded')]
stance = {}
for p_ in R['positions']:
    stance.setdefault(p_['entity_name'].upper(), set()).add(p_['stance'])
for c in M['committees']:
    stance.setdefault(c['name'].upper(), set()).add(c['stance'])


def side_of(i, name):
    if i.startswith('fec:') and i[4:] in DEM: return 'D'
    if i.startswith('fec:') and i[4:] in REP: return 'R'
    st = stance.get(name.upper(), set())
    if st == {'support'}: return 'yes'
    if st == {'oppose'}: return 'no'
    return None


# follow.html has its own record list; ids not in it open on the Money Trail web instead.
fh = open(MT + 'follow.html', encoding='utf-8').read()
a = fh.index('id="way-trail-records">') + len('id="way-trail-records">')
FOLLOW_IDS = {e[0] for e in json.loads(fh[a:fh.index('</script>', a)])['entities']}

cnt = collections.Counter(); amt = collections.Counter(); names = {}
for t in TX:
    for k in ('source', 'recipient'):
        i = t[k + '_entity_id']; cnt[i] += 1; amt[i] += t['amount_usd']; names.setdefault(i, t[k + '_name'])

def person(n):
    return ', ' in n or ' MR.' in n or ' MS.' in n or ' MRS.' in n


def short(v):
    if not v: return '$0'
    return '$%.1fM' % (v / 1e6) if v >= 1e6 else '$%dK' % round(v / 1e3)


def title(n, i=None):
    if i in READABLE: return READABLE[i]
    if n.isupper():
        n = n.title().replace('Gopac', 'GOPAC').replace('Pac', 'PAC').replace(' Fl', ' FL')
    return n.replace(' Inc.', '').replace(' Inc', '').replace('Seiu', 'SEIU')


def href(i, n):
    if i in FOLLOW_IDS: return '/money-trail/follow.html?group=' + urllib.parse.quote(i, safe='')
    return '/money-trail/?view=network&hub=' + urllib.parse.quote(n, safe='')


def when(d):
    y, m, dd = map(int, d.split('-'))
    return date(y, m, dd).strftime('%B ') + str(dd) + ', ' + str(y)


def web(hub):
    agg = {}
    rec = sent = 0
    for t in TX:
        if hub not in (t['source_entity_id'], t['recipient_entity_id']): continue
        out = t['source_entity_id'] == hub
        if out: sent += t['amount_usd']
        else: rec += t['amount_usd']
        cid = t['recipient_entity_id'] if out else t['source_entity_id']
        nm = t['recipient_name'] if out else t['source_name']
        g = agg.setdefault((cid, out), {'id': cid, 'name': nm, 'out': out, 'amt': 0}); g['amt'] += t['amount_usd']
    orgs = []
    for g in sorted(agg.values(), key=lambda g: -g['amt']):
        if person(g['name']): continue
        if any(o['name'].upper().startswith(g['name'].upper()) or g['name'].upper().startswith(o['name'].upper()) for o in orgs): continue
        orgs.append(g)
        if len(orgs) == 8: break
    H = 600; cx, cy = 380, 300; mx = max([g['amt'] for g in orgs] or [1])
    lines = []; nodes = []
    n_ = max(len(orgs), 1)
    hubname = title(names[hub], hub)
    for i, g in enumerate(orgs):
        ang = -math.pi / 2 + 2 * math.pi * i / n_
        x = cx + math.cos(ang) * 250; y = cy + math.sin(ang) * 205
        col = '#7ff0d4' if g['out'] else '#e9c97f'
        w = 2.5 + 9 * math.sqrt(g['amt'] / mx)
        lines.append(f'<line x1="{cx}" y1="{cy}" x2="{x:.0f}" y2="{y:.0f}" stroke="{col}" stroke-width="{w:.1f}" stroke-opacity=".75"/>')
        c = math.cos(ang); sn = math.sin(ang)
        anchor = 'start' if c > 0.35 else 'end' if c < -0.35 else 'middle'
        lx = x + (22 if anchor == 'start' else -22 if anchor == 'end' else 0)
        ly = y + (-48 if (anchor == 'middle' and sn < 0) else 46 if anchor == 'middle' else -6)
        full = title(g['name'], g['id'])
        nm = full if len(full) <= 18 else full[:17].rstrip() + '…'
        lab = f'{hubname} {"sent" if g["out"] else "received"} {short(g["amt"])} {"to" if g["out"] else "from"} {full}'
        nodes.append(f'<a href="{html.escape(href(g["id"], g["name"]))}" class="mw-node" aria-label="{html.escape(lab)}"><circle cx="{x:.0f}" cy="{y:.0f}" r="15" fill="{col}"/><text x="{lx:.0f}" y="{ly:.0f}" text-anchor="{anchor}" class="mw-amt" fill="{col}">{short(g["amt"])}</text><text x="{lx:.0f}" y="{ly + 24:.0f}" text-anchor="{anchor}" class="mw-name">{html.escape(nm)}</text></a>')
    hn = html.escape(hubname); hh = html.escape(href(hub, names[hub]))
    hubnode = f'<a href="{hh}" class="mw-node mw-hub" aria-label="{hn}: open its money trail"><circle cx="{cx}" cy="{cy}" r="30" fill="#0a2a3a" stroke="#ffffff" stroke-width="4"/></a>'
    svg = f'<svg class="moneyweb-svg" viewBox="-130 0 1020 {H}" role="group" aria-label="Money web for {hn}: the largest itemized amounts it received and sent in this research archive. Choose a name to follow its trail.">' + ''.join(lines) + hubnode + ''.join(nodes) + '</svg>'
    tin = f'<span class="mw-tin"><span class="mw-lab">Recorded in</span><b>{short(rec)}</b></span>' if rec else '<span class="mw-tin mw-none"><span class="mw-lab">Recorded in</span>No incoming records in this archive.</span>'
    tout = f'<span class="mw-tout"><span class="mw-lab">Recorded out</span><b>{short(sent)}</b></span>' if sent else '<span class="mw-tout mw-none"><span class="mw-lab">Recorded out</span>No outgoing records in this archive.</span>'
    head = (f'<div class="mw-head"><a class="mw-hubname" href="{hh}">{hn}</a>'
            f'<div class="mw-totals">{tin}{tout}<span class="mw-recs">{cnt[hub]:,} records in the archive</span>'
            f'<span class="mw-asof">Records as of {when(filer[hub])}</span></div></div>')
    return head + svg, len(orgs)


pool = []  # (side, hub) for every group that can be the random pick
for i in sorted(cnt, key=lambda i: (-cnt[i], -amt[i])):
    if i not in filer: continue
    sd = side_of(i, names[i]) or 'x'  # no guessing: a group with no known side gets its own turn
    w, n_spokes = web(i)
    if n_spokes >= 4: pool.append((sd, i, w))
order = [k for k, _ in SIDES]
pool.sort(key=lambda x: order.index(x[0]))  # without JavaScript the first one shows
panels = []
for k, (sd, hub, w) in enumerate(pool):
    panels.append(f'<div class="mw-panel" id="mw-p{k + 1}" data-side="{sd}"' + ('' if k == 0 else ' hidden') + '>' + w + '</div>')

# Names for the search box: every group in the records, people left out.
seen_n = set(); search_names = []
for i in sorted(cnt, key=lambda i: (-cnt[i], -amt[i])):
    n = names[i]
    if person(n) or not n.strip(): continue
    key = ''.join(ch for ch in n.upper() if ch.isalnum())
    if key in seen_n: continue
    seen_n.add(key); search_names.append(n)
names_json = json.dumps(search_names, ensure_ascii=False, separators=(',', ':')) + '\n'
open(MT + 'home-names.json', 'w', encoding='utf-8').write(names_json)
NAMES_V = hashlib.sha1(names_json.encode('utf-8')).hexdigest()[:8]  # cache stamp, changes when the list does

band = ('<section class="mapband moneyband" id="followmoney" aria-labelledby="fm-h"><div class="mapband-text"><div class="depth">Follow the money</div><h2 id="fm-h">Where the money flows.</h2>'
        '<p>Who gave, who received, and the public filing behind each line. Type a name to open its money web.</p>'
        '<form class="mw-search" action="/money-trail/" method="get" role="search" data-v="' + NAMES_V + '"><label for="mw-q">Type any name: a politician, a company, a PAC</label>'
        '<div class="mw-search-row"><input id="mw-q" name="q" type="search" list="mw-names" autocomplete="off" spellcheck="false" placeholder="Try GOPAC or DCCC"><button type="submit">Follow</button></div>'
        '<datalist id="mw-names"></datalist></form>'
        '</div>\n'
        '<div class="moneyweb"><p class="mw-random"><span>A group picked at random from ' + str(len(pool)) + '</span><button type="button" class="mw-another" hidden>Show another</button></p>' + ''.join(panels) + '<p class="mw-key"><span class="mw-in">Recorded in</span> <span class="mw-out">Recorded out</span></p>'
        '<a class="cta join-cta" href="/money-trail/">Open the Money Trail <span aria-hidden="true">&rarr;</span></a><a class="text-link" href="/money-trail/?view=network">See the full money web</a>'
        '<p class="mw-note">Amounts are the itemized records in Michi’s research archive, added up. They are not each group’s full totals. '
        'The first group is picked fairly between sides, not by size. Show another goes through all ' + str(len(pool)) + ' groups before any repeats. More committees are still being added. A link between two names does not mean anyone did anything wrong.</p></div></section>\n')

p = ROOT + 'index.html'; t = open(p, encoding='utf-8').read()
a = t.index('<section class="mapband moneyband"'); b = t.index('</section>\n', a) + len('</section>\n')
t = t[:a] + band + t[b:]
open(p, 'w', encoding='utf-8').write(t)
for sd, hub, w in pool:
    print(sd, title(names[hub], hub), cnt[hub])
print(len(search_names), 'names for the search box')
