#!/usr/bin/env python3
"""Front page money web (site/index.html, section #followmoney).

Usage (from repo root):
  python3 -I tools/money-trail/build_home_web.py site

Re-run it after every new batch of records (FEC batches, state filings), so the front page stays accurate.

What it shows: the two groups with the most records from each kind of group, so one kind cannot fill the list.
- The records are the same ones the Money Trail page loads: money-trail/data.js (the Nov 5 archive),
  money-trail/fec-data.js (FEC batches) and money-trail/mi-filings.js (Michigan state filings).
- Only groups whose own filings are in the archive can be picked. Vendors, banks and donors that only
  show up on someone else's filing are not picked, because the archive holds only part of their records.
- Kinds: ballot measure committees, party committees, super PACs (and hybrid PACs), other PACs.
- Ranking inside a kind: the number of records the group appears in, as giver or receiver. Ties go to more dollars.
- Each web shows up to 8 of the largest amounts in or out, by dollars. People are never shown.
Styles live in site/home.css (.mw-*), tab switching in site/money-trail/home-web.js.
"""
import collections, html, json, math, sys, urllib.parse
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

# Which groups have their own filings in the archive, what kind each is, and the date its records were pulled.
KINDS = [('ballot', 'Ballot measure committees', 'Ballot measure committee'),
         ('party', 'Party committees', 'Party committee'),
         ('super', 'Super PACs', 'Super PAC'),
         ('pac', 'Other PACs', 'PAC')]


def kind_of(t):
    t = (t or '').lower()
    if 'party' in t: return 'party'
    if 'super pac' in t or 'hybrid pac' in t: return 'super'
    if 'referendum committee' in t or 'ballot committee' in t or 'issue committee' in t or 'ballot question committee' in t \
            or 'ballot support committee' in t or 'ballot opposition committee' in t: return 'ballot'
    if 'pac' in t or 'political action committee' in t: return 'pac'
    return None


ARCHIVE_DAY = R['meta']['generated_on']
filer = {}  # entity id -> (kind, as-of date)
for e in R['entities']:
    k = kind_of(e['entity_type'])
    if k: filer[e['entity_id']] = (k, ARCHIVE_DAY)
for c in F['committees']:
    k = kind_of(c['committee_type'])
    if k: filer['fec:' + c['committee_id']] = (k, c['retrieved'][:10])
for c in M['committees']:
    filer[mi_id(c)] = ('ballot', M['meta']['updated'])

# follow.html has its own record list; ids not in it open on the Money Trail web instead.
fh = open(MT + 'follow.html', encoding='utf-8').read()
a = fh.index('id="way-trail-records">') + len('id="way-trail-records">')
FOLLOW_IDS = {e[0] for e in json.loads(fh[a:fh.index('</script>', a)])['entities']}

cnt = collections.Counter(); amt = collections.Counter(); names = {}
for t in TX:
    for k in ('source', 'recipient'):
        i = t[k + '_entity_id']; cnt[i] += 1; amt[i] += t['amount_usd']; names.setdefault(i, t[k + '_name'])

GROUPS = []  # (kind key, plural label, singular label, [hub ids])
for key, plural, single in KINDS:
    ranked = sorted((i for i in cnt if filer.get(i, (None,))[0] == key), key=lambda i: (-cnt[i], -amt[i]))
    if ranked: GROUPS.append((key, plural, single, ranked[:2]))


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


def web(hub, single):
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
    head = (f'<div class="mw-head"><span class="mw-kindtag">{html.escape(single)}</span><a class="mw-hubname" href="{hh}">{hn}</a>'
            f'<div class="mw-totals">{tin}{tout}<span class="mw-recs">{cnt[hub]:,} records in the archive</span>'
            f'<span class="mw-asof">Records as of {when(filer[hub][1])}</span></div></div>')
    return head + svg


panels = []; tabgroups = []; k = 0
for key, plural, single, hubs in GROUPS:
    tabs = []
    for hub in hubs:
        k += 1; hid = 'mw-p' + str(k)
        tabs.append(f'<button type="button" class="mw-tab" role="tab" id="{hid}-t" aria-controls="{hid}" aria-selected="{"true" if k == 1 else "false"}"><span>{k}</span>{html.escape(title(names[hub], hub))}</button>')
        panels.append(f'<div class="mw-panel" role="tabpanel" id="{hid}" aria-labelledby="{hid}-t"' + ('' if k == 1 else ' hidden') + '>' + web(hub, single) + '</div>')
    gid = 'mw-k-' + key
    tabgroups.append(f'<p class="mw-kind" id="{gid}">{html.escape(plural)}</p><div class="mw-tabs" role="tablist" aria-labelledby="{gid}">' + ''.join(tabs) + '</div>')

low = lambda x: x[0].lower() + x[1:]  # 'Super PACs' -> 'super PACs'
kinds_text = ', '.join(low(p) for _, p, _, _ in GROUPS[:-1]) + ' and ' + low(GROUPS[-1][1])
band = ('<section class="mapband moneyband" id="followmoney" aria-labelledby="fm-h"><div class="mapband-text"><div class="depth">Follow the money</div><h2 id="fm-h">Where the money flows.</h2>'
        f'<p>Who gave, who received, and the public filing behind each line. For each kind of group ({html.escape(kinds_text)}), these are the two with the most records in Michi’s archive. They are ranked by the number of records, not by dollars. Choose a name to follow its trail.</p>'
        + ''.join(tabgroups) +
        '</div>\n'
        '<div class="moneyweb">' + ''.join(panels) + '<p class="mw-key"><span class="mw-in">Recorded in</span> <span class="mw-out">Recorded out</span></p>'
        '<a class="cta join-cta" href="/money-trail/">Open the Money Trail <span aria-hidden="true">&rarr;</span></a><a class="text-link" href="/money-trail/?view=network">See the full money web</a>'
        '<p class="mw-note">Amounts are the itemized records in Michi’s research archive, added up. They are not each group’s full totals. '
        'Only groups whose own filings are in the archive are ranked, by the number of records only. For federal committees the archive holds up to 100 of the largest gifts in and 100 of the largest payments out from each committee’s own filings. '
        'More committees are still being added. A link between two names does not mean anyone did anything wrong.</p></div></section>\n')

p = ROOT + 'index.html'; t = open(p, encoding='utf-8').read()
a = t.index('<section class="mapband moneyband"'); b = t.index('</section>\n', a) + len('</section>\n')
t = t[:a] + band + t[b:]
open(p, 'w', encoding='utf-8').write(t)
for key, plural, single, hubs in GROUPS:
    print(plural + ':', '; '.join(f'{title(names[h], h)} ({cnt[h]} records, {short(amt[h])})' for h in hubs))
