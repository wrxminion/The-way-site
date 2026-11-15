#!/usr/bin/env python3
"""Senate votes we track: one page for all of them, and a votes section on each senator's own page.

Writes:
  site/government/congress/votes.html   every tracked roll call: what it was, the result, how each senator
                                        voted (names link to their page on The Way), and the official record
  site/government/congress/members/<slug>.html   a "Senate votes we track" section (between the
                                        <!-- tw-votes --> markers) on every current senator's page, plus a link
                                        to their campaign committee on the Money web when we have it.

Inputs:
  legislators-current.yaml (congress-legislators), to match each name on a roll call to a senator; a name is
    matched only when the vote date falls inside that person's Senate term, so a senator who left is never
    credited to whoever holds the seat now.
  tools/contact-senator/rollcalls.txt: every senator's vote on each tracked roll call, copied from the official
    senate.gov roll call files (format below). Totals are checked against the file.
  VOTES below: what each vote was, in plain words.

build_congress.py rewrites the member pages without this section. Run this script again after it.
Usage (from the repo root): python3 tools/contact-senator/build_votes.py legislators-current.yaml
"""
import html
import os
import re
import sys
import unicodedata

import yaml

from site_links import ROOT, member_pages, money_links

SENATE = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote119%s/vote_119_%s_%05d.htm'
OUT = os.path.join(ROOT, 'site', 'government', 'congress')
e = lambda s: html.escape(str(s), quote=True)

# Each tracked vote: (session, number, title, what it was about, short line name).
# The short name is what the vote lists show: "YES: <short> · date · Democratic caucus: 22 yes, 25 no".
VOTES = [
    (1, 7, 'Laken Riley Act, final passage', 'Final passage of the Laken Riley Act (S. 5), an immigration detention bill.',
     'Laken Riley Act (S. 5), final passage'),
    (1, 17, 'Kristi Noem, Secretary of Homeland Security', 'Confirming Kristi Noem as Secretary of Homeland Security.',
     'Kristi Noem for Secretary of Homeland Security'),
    (1, 128, 'March 2025 funding bill, ending debate', 'Ending debate (cloture) on H.R. 1968, the full-year funding bill for 2025. It needed 60 votes.',
     'March 2025 funding bill (H.R. 1968), ending debate'),
    (1, 318, 'GENIUS Act, final passage', 'Final passage of the GENIUS Act (S. 1582), rules for payment stablecoins.',
     'GENIUS Act, stablecoin rules (S. 1582), final passage'),
    (1, 455, 'Blocking a weapons sale to Israel', 'A motion to bring up S.J.Res. 34, which would have blocked a weapons sale to Israel.',
     'Blocking a weapons sale to Israel (S.J.Res. 34), bringing it up'),
    (1, 618, 'Funding bill that ended the fall 2025 shutdown', 'Passage of H.R. 5371, the funding bill that ended the fall 2025 shutdown.',
     'Funding bill that ended the 2025 shutdown (H.R. 5371), passage'),
    (2, 203, 'Michael C. Martin, federal judge, ending debate', 'Ending debate (cloture) on Michael C. Martin, a nominee for federal judge in the Eastern District of Michigan.',
     'Judge nominee Michael C. Martin (Michigan), ending debate'),
    (2, 205, 'Antonio M. Pozos, federal judge, ending debate', 'Ending debate (cloture) on Antonio M. Pozos, a nominee for federal judge in the Eastern District of Pennsylvania.',
     'Judge nominee Antonio M. Pozos (Pennsylvania), ending debate'),
    (2, 254, 'Who pays grid upgrades for large power users', 'Ending debate (cloture) on moving to H.R. 9340, a federal rule for who pays grid upgrades for large power users. It needed 60 votes.',
     'Grid upgrade costs for large power users (H.R. 9340), ending debate'),
    (2, 257, 'Permitting reform bill (BAAJA), ending debate on taking it up', 'Ending debate (cloture) on taking up the permitting reform bill, the Bipartisan American Affordability and Jobs Act (S. 5653). The Senate used a House bill, H.R. 2347, as the vehicle; its original title is about a tax rule. It needed 60 votes.',
     'Permitting reform bill (BAAJA, S. 5653), ending debate'),
    (2, 258, 'Permitting reform bill (BAAJA), taking it up', 'Taking up H.R. 2347, the House bill used to carry the permitting reform bill (BAAJA, S. 5653).',
     'Permitting reform bill (BAAJA, S. 5653), taking it up'),
]
# Former senators on these roll calls, named in full where a current senator shares the last name and state.
# The senate.gov file for roll call 128 gives first_name Lindsey for Graham (SC); from roll call 203 on it is Darline.
FORMER = {('Graham', 'SC'): 'Lindsey Graham'}
# Party of the former senators on these roll calls, as the senate.gov files list them.
FORMER_PARTY = {('Graham', 'SC'): 'R', ('Rubio', 'FL'): 'R', ('Mullin', 'OK'): 'R'}
GROUPS = (('dem', 'Democratic caucus'), ('rep', 'Republicans'))
SHORT_CAST = {'Yea': 'YES', 'Nay': 'NO', 'Not Voting': 'DID NOT VOTE', 'Present': 'PRESENT'}
CAST = {'Yea': 'Yes', 'Nay': 'No', 'Not Voting': 'Did not vote', 'Present': 'Present'}


def norm(s):
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c)).lower().strip()


def parse_rollcalls(path):
    """Blocks of: ROLL n / DATE ... / QUESTION ... / RESULT ... YEA n NAY n NV n / Yea: ... / Nay: ... / Not Voting: ..."""
    out, cur = {}, None
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('ROLL '):
            cur = {'n': int(line.split()[1]), 'casts': {}}
            out[cur['n']] = cur
        elif line.startswith('DATE '):
            cur['date_text'] = line[5:].strip()
        elif line.startswith('QUESTION '):
            cur['question'] = line[9:].strip()
        elif line.startswith('RESULT '):
            m = re.match(r'RESULT (.+?) YEA (\d+) NAY (\d+) NV (\d+)', line)
            cur['result'], cur['yea'], cur['nay'], cur['nv'] = m.group(1).strip(), int(m.group(2)), int(m.group(3)), int(m.group(4))
        else:
            key, _, names = line.partition(':')
            if key not in CAST:
                raise SystemExit('Unknown line: ' + line)
            for n in [x.strip() for x in names.split(',') if x.strip()]:
                last, st = n.rsplit('-', 1)
                cur['casts'][(last.strip(), st.strip())] = key
    for r in out.values():
        c = list(r['casts'].values())
        got = (c.count('Yea'), c.count('Nay'), c.count('Not Voting'))
        assert got == (r['yea'], r['nay'], r['nv']), (r['n'], got, (r['yea'], r['nay'], r['nv']))
        assert len(c) in (99, 100), (r['n'], len(c))
    return out


MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


def iso_date(text):
    """'November 9, 2026, 05:31 PM' or 'November 9, 2026' -> ('2026-11-09', 'November 9, 2026')."""
    m = re.match(r'([A-Za-z]+) (\d+), (\d{4})', text)
    mon = MONTHS.index(m.group(1).capitalize()) + 1
    return '%s-%02d-%02d' % (m.group(3), mon, int(m.group(2))), '%s %d, %s' % (MONTHS[mon - 1], int(m.group(2)), m.group(3))


def load(yaml_path):
    """Senators, the tracked votes (with each caucus's split) and each senator's votes."""
    leg = yaml.safe_load(open(yaml_path, encoding='utf-8'))
    sens = {}
    for p in leg:
        terms = [t for t in p['terms'] if t['type'] == 'sen']
        if not terms or p['terms'][-1]['type'] != 'sen':
            continue
        sens[p['id']['bioguide']] = {
            'name': p['name'].get('official_full') or (p['name']['first'] + ' ' + p['name']['last']),
            'last': norm(p['name']['last']), 'st': terms[-1]['state'], 'terms': [(t['start'], t['end']) for t in terms],
            'fec': p['id'].get('fec', []),
            'group': 'dem' if terms[-1]['party'] == 'Democrat' or terms[-1].get('caucus') == 'Democrat' else 'rep'}
    rolls = parse_rollcalls(os.path.join(os.path.dirname(__file__), 'rollcalls.txt'))

    def who(last, st, day):
        for b, s in sens.items():
            if s['st'] != st:
                continue
            if s['last'] != norm(last) and not s['last'].startswith(norm(last) + ' '):
                continue
            if any(a <= day <= z for a, z in s['terms']):
                return b
        return None

    votes, by_sen = [], {b: [] for b in sens}
    for sess, n, title, what, short in VOTES:
        r = rolls[n]
        day, long_day = iso_date(r['date_text'])
        rows = []
        split = {g: {'Yea': 0, 'Nay': 0, 'Not Voting': 0, 'Present': 0} for g, _ in GROUPS}
        for (last, st), cast in sorted(r['casts'].items(), key=lambda x: (x[0][1], x[0][0])):
            b = who(last, st, day)
            rows.append((last, st, cast, b))
            if b:
                by_sen[b].append((sess, n, cast))
                g = sens[b]['group']
            else:
                g = 'rep' if FORMER_PARTY[(last, st)] == 'R' else 'dem'
            split[g][cast] += 1
        votes.append({'sess': sess, 'n': n, 'title': title, 'what': what, 'short': short, 'day': day, 'date': long_day, 'r': r, 'rows': rows,
                      'id': 'rc-119-%d-%d' % (sess, n), 'url': SENATE % (sess, sess, n), 'split': split})
    return sens, votes, by_sen


def split_text(v, group):
    """'Democratic caucus: 22 yes, 25 no, 1 did not vote'"""
    c = v['split'][group]
    parts = ['%d yes' % c['Yea'], '%d no' % c['Nay']]
    if c['Not Voting']:
        parts.append('%d did not vote' % c['Not Voting'])
    if c['Present']:
        parts.append('%d present' % c['Present'])
    return dict(GROUPS)[group] + ': ' + ', '.join(parts)


def short_date(long_day):
    m, d, y = long_day.replace(',', '').split()
    return '%s %s, %s' % (m[:3] + ('.' if len(m) > 3 else ''), d, y) if m not in ('May', 'June', 'July') else long_day


def main(yaml_path):
    pages = member_pages()
    sens, votes, by_sen = load(yaml_path)
    web = money_links({b: s['fec'] for b, s in sens.items()})
    unmatched = [(v['n'], last, st) for v in votes for last, st, _c, b in v['rows'] if not b]
    print('names not matched to a current senator (former senators):', unmatched)
    write_votes_page(votes, pages)
    vote_by = {(v['sess'], v['n']): v for v in votes}
    changed = 0
    for b, s in sens.items():
        slug = pages.get(b)
        assert slug, b
        changed += write_member_section(slug, s, by_sen[b], vote_by, web.get(b))
    print('votes page written; member pages updated:', changed)


HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#176b85">
<title>Senate votes we track - The Way</title>
<meta name="description" content="Senate roll call votes The Way tracks: what each vote was, the result, and how every senator voted, with a link to the official record on senate.gov.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/pages-style.css?v=3">
<link rel="stylesheet" href="/members/waybar.css?v=29">
<link rel="stylesheet" href="/government-works.css?v=2">
<link rel="stylesheet" href="/government/government.css?v=8">
<link rel="canonical" href="https://michiinstitute.com/government/congress/votes.html">
<meta property="og:type" content="website">
<meta property="og:title" content="Senate votes we track - The Way">
<meta property="og:description" content="What each vote was, the result, and how every senator voted, with a link to the official record.">
<meta property="og:url" content="https://michiinstitute.com/government/congress/votes.html">
<meta property="og:site_name" content="The Way | Michi Institute">
<meta property="og:image" content="https://michiinstitute.com/og-logo.png">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<header id="waybar" class="waybar"><a class="wb-logo" href="/">The Way</a><nav class="wb-right" aria-label="Sign in"><a class="wb-pill" href="/members/">Sign in</a></nav></header>
<a class="gw-skip" href="#top">Skip to content</a><main class="gw gv" id="top">
'''
FOOT = '''<nav class="gv-next" aria-label="Keep exploring"><a href="./">← All of Congress</a> · <a href="/how-government-works.html">How government works</a></nav>
</main><script src="/government/government.js?v=2" defer></script><script src="/members/waybar.js?v=79" defer></script></body></html>
'''


def write_votes_page(votes, pages):
    def name(last, st, b):
        label = '%s (%s)' % (last, st)
        if b:
            return '<a href="members/%s.html">%s</a>' % (e(pages[b]), e(label))
        return e('%s (%s)' % (FORMER[(last, st)], st) if (last, st) in FORMER else label) + ' <em>former senator</em>'
    out = [HEAD,
           '<nav class="crumbs" aria-label="Breadcrumb"><a href="/">The Way</a> / <a href="/how-government-works.html">Government</a> / <a href="./">Congress</a> / Senate votes we track</nav>\n',
           '<header class="gv-hero"><p class="gw-eyebrow">Congress · Senate roll call votes</p><h1>Senate votes we track</h1>',
           '<p class="gv-lede">How every senator voted on the roll calls The Way uses, newest first. Each vote links to the official record on senate.gov, so you can check us. Names link to each senator\'s page on The Way.</p></header>\n',
           '<section class="gv-sec"><h2>The votes</h2><ul class="gv-list">']
    order = sorted(votes, key=lambda v: (v['day'], v['n']), reverse=True)
    for v in order:
        out.append('<li><a href="#%s">%s: %s</a></li>' % (v['id'], e(v['date']), e(v['title'])))
    out.append('</ul></section>\n')
    for v in order:
        r = v['r']
        out.append('<section class="gv-sec" id="%s"><h2>%s</h2>' % (v['id'], e(v['title'])))
        out.append('<p class="gw-eyebrow">Roll call %d · %s</p>' % (v['n'], e(v['date'])))
        out.append('<p>%s</p>' % e(v['what']))
        out.append('<div class="gv-tiles"><div class="gv-tile"><span>Result</span><strong>%s</strong></div>'
                   '<div class="gv-tile"><span>Yes</span><strong>%d</strong></div><div class="gv-tile"><span>No</span><strong>%d</strong></div>'
                   '<div class="gv-tile"><span>Did not vote</span><strong>%d</strong></div></div>' % (e(r['result']), r['yea'], r['nay'], r['nv']))
        out.append('<p><strong>By party:</strong> %s. %s.</p>' % (e(split_text(v, 'dem')), e(split_text(v, 'rep'))))
        out.append('<p class="gw-status">Bill or nomination: %s. Question on the official record: %s</p>' % (e(v['short']), e(r['question'])))
        for key in ('Yea', 'Nay', 'Not Voting', 'Present'):
            names = [name(last, st, b) for last, st, c, b in v['rows'] if c == key]
            if names:
                out.append('<details%s><summary>%s (%d)</summary><div class="gw-detail"><p>%s</p></div></details>' % (
                    ' open' if key != 'Not Voting' else '', CAST[key], len(names), ', '.join(names)))
        out.append('<p class="gv-links"><a href="%s">Official record: Senate roll call %d ↗</a></p></section>\n' % (e(v['url']), v['n']))
    out.append('<p class="gw-status">Votes copied from the official senate.gov roll call files and checked against their totals. '
               'A name is matched to a senator only when the vote date falls inside that senator\'s term. Being listed here does not imply anything beyond the vote itself.</p>\n')
    out.append(FOOT)
    open(os.path.join(OUT, 'votes.html'), 'w', encoding='utf-8').write(''.join(out))


def vote_line(v, cast, group, page):
    """One line: YES: <short name> · <date> · <party split>, all one link to our page for the vote."""
    return '<li><a href="%s#%s"><strong>%s</strong>: %s · %s · %s</a></li>' % (
        e(page), v['id'], SHORT_CAST[cast], e(v['short']), e(short_date(v['date'])), e(split_text(v, group)))


START, END = '<!-- tw-votes -->', '<!-- /tw-votes -->'


def write_member_section(slug, s, mine, vote_by, web):
    path = os.path.join(OUT, 'members', slug + '.html')
    page = open(path, encoding='utf-8').read()
    rows = []
    for sess, n, cast in sorted(mine, key=lambda x: (vote_by[(x[0], x[1])]['day'], x[1]), reverse=True):
        rows.append(vote_line(vote_by[(sess, n)], cast, s['group'], '../votes.html'))
    parts = [START, '<section class="gv-sec" id="votes"><h2>Senate votes we track</h2>']
    if rows:
        parts.append('<p>How this senator voted on the roll calls The Way tracks so far, newest first, with how their party voted. '
                     'Each line links to our page for that vote, which says what it was, shows every senator\'s vote, and links to the official record on senate.gov.</p>')
        parts.append('<ul class="gv-list gv-votes">%s</ul>' % ''.join(rows))
    else:
        parts.append('<p>None of the roll calls The Way tracks so far took place while this senator was in office.</p>')
    parts.append('<p class="gv-links"><a href="../votes.html">All Senate votes we track →</a>')
    if web:
        parts.append(' <a href="%s">Their campaign committee, %s, on the Money web →</a>' % (e(web['url']), e(web['name'])))
    parts.append('</p><a class="gw-source" href="https://www.senate.gov/legislative/votes_new.htm">Source: Senate roll call votes, senate.gov ↗</a></section>')
    parts.append(END)
    block = ''.join(parts)
    if START in page:
        new = re.sub(re.escape(START) + '.*?' + re.escape(END), lambda m: block, page, flags=re.S)
    else:
        anchor = '<nav class="gv-next"'
        assert page.count(anchor) == 1, slug
        new = page.replace(anchor, block + '\n' + anchor)
    if new != page:
        open(path, 'w', encoding='utf-8').write(new)
        return 1
    return 0


if __name__ == '__main__':
    main(sys.argv[1])
