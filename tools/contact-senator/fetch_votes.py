#!/usr/bin/env python3
"""Refresh tools/contact-senator/recent_votes/ (the Previous votes on the contact pages) from the official roll calls.

Run it on a home computer: the cloud and the Cowork shell cannot reach clerk.house.gov or senate.gov.
It reads the official XML files, one request every 2 seconds, no key:
  House:  https://clerk.house.gov/evs/<year>/rollNNN.xml
  Senate: https://www.senate.gov/legislative/LIS/roll_call_votes/vote<congress><session>/vote_<congress>_<session>_NNNNN.xml
and rewrites house-<congress>-<session>.txt and senate-<congress>-<session>.txt in the same format as before
(see the header of each file). Then run build_fit.py.

Kept: votes on passage, suspension, concurring, resolutions, nominations, impeachment motions, motions to discharge or
proceed, and cloture votes that failed or have no final vote yet. Left out: amendments, motions to recommit, the
previous question, House rules for a bill, and budget waivers. The same rules for every member and party.

Not yet run against the live sites (written November 27, 2026; the first copy of the files was read in a browser).
If a request fails, it stops and leaves the old files as they were.

Usage: python fetch_votes.py [--year 2026] [--congress 119] [--session 2] [--house-from 270] [--senate-from 240]
       python fetch_votes.py --from-dir DIR   (read saved XML files rollNNN.xml / vote_119_2_NNNNN.xml instead)
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
OUT = HERE / 'recent_votes'
CAST = {'Yea': 'Y', 'Aye': 'Y', 'Nay': 'N', 'No': 'N', 'Present': 'P', 'Not Voting': 'X', 'Guilty': 'Y', 'Not Guilty': 'N'}
UA = 'TheWay-civic-tool/1.0 (public roll call reader)'


def get(url, from_dir, name):
    if from_dir:
        p = Path(from_dir) / name
        return p.read_bytes() if p.exists() else None
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    time.sleep(2)
    return body


def text(el, path):
    x = el.find(path)
    return ' '.join((x.text or '').split()) if x is not None and x.text else ''


def house(year, start, from_dir):
    votes, n = [], start
    while True:
        body = get('https://clerk.house.gov/evs/%d/roll%03d.xml' % (year, n), from_dir, 'roll%03d.xml' % n)
        if not body or b'<rollcall-vote' not in body:
            break
        r = ET.fromstring(body)
        m = r.find('vote-metadata')
        casts = {}
        for rv in r.iter('recorded-vote'):
            leg = rv.find('legislator')
            casts[leg.get('name-id')] = (leg.get('party'), CAST.get(text(rv, 'vote'), '?'))
        tot = {}
        for p in m.iter('totals-by-party'):
            tot[text(p, 'party')[:1]] = [int(text(p, k) or 0) for k in ('yea-total', 'nay-total', 'present-total', 'not-voting-total')]
        votes.append({'n': n, 'date': text(m, 'action-date'), 'bill': text(m, 'legis-num'), 'q': text(m, 'vote-question'),
                      'res': text(m, 'vote-result'), 'desc': text(m, 'vote-desc'), 'casts': casts, 'tot': tot})
        n += 1
    keep = [v for v in votes if not (v['q'] == 'On Ordering the Previous Question' or v['desc'].startswith('Providing for consideration')
                                     or v['q'].endswith('Amendment') or 'Recommit' in v['q'])]
    roster = {}
    for v in keep:
        for k, (p, _) in v['casts'].items():
            roster[k] = p
    ids = sorted(roster)
    lines = ['ROSTER ' + ' '.join(i + roster[i] for i in ids)]
    for v in keep:
        default = defaults(v['casts'])
        ex = []
        for i in ids:
            c = v['casts'].get(i)
            if not c:
                ex.append(i + '-')
            elif c[1] != default.get(c[0]):
                ex.append(i + c[1])
        lines.append('|'.join(['VOTE', str(v['n']), v['date'], v['bill'], v['q'], v['res'], v['desc'], json.dumps(v['tot'], separators=(',', ':')),
                               ','.join('%s=%s' % kv for kv in default.items()), ' '.join(ex)]))
    return lines


def defaults(casts):
    out = {}
    for p in ('R', 'D', 'I'):
        c = Counter(x for pp, x in casts.values() if pp == p)
        if c:
            out[p] = c.most_common(1)[0][0]
    return out


def senate(congress, session, start, from_dir):
    votes, n = [], start
    while True:
        name = 'vote_%d_%d_%05d.xml' % (congress, session, n)
        body = get('https://www.senate.gov/legislative/LIS/roll_call_votes/vote%d%d/%s' % (congress, session, name), from_dir, name)
        if not body or b'<roll_call_vote' not in body:
            break
        r = ET.fromstring(body)
        casts = {}
        for m in r.iter('member'):
            casts[text(m, 'last_name') + '-' + text(m, 'state')] = (text(m, 'party'), CAST.get(text(m, 'vote_cast'), '?'))
        doc = text(r, 'document/document_name') or text(r, 'amendment/amendment_number')
        votes.append({'n': n, 'date': text(r, 'vote_date'), 'q': text(r, 'question'), 'res': text(r, 'vote_result'), 'doc': doc,
                      'title': text(r, 'vote_title'), 'docTitle': text(r, 'document/document_title'),
                      'yea': text(r, 'count/yeas'), 'nay': text(r, 'count/nays'), 'casts': casts})
        n += 1
    final = ('On the Nomination', 'On Passage of the Bill', 'On the Concurrent Resolution', 'On the Joint Resolution', 'On the Resolution')

    def keep(v):
        if v['q'].startswith('On the Amendment') or v['q'] == 'On the Motion' or v['doc'].startswith('S.Amdt'):
            return False
        if ('Cloture' in v['q'] or 'Motion to Proceed' in v['q']) and 'Rejected' not in v['res']:
            if any(y['n'] > v['n'] and y['doc'] == v['doc'] and y['q'].startswith(final) for y in votes):
                return False
        return True
    kept = [v for v in votes if keep(v)]
    roster = {}
    for v in kept:
        for k, (p, _) in v['casts'].items():
            roster[k] = p
    ids = sorted(roster)
    lines = ['ROSTER ' + ' '.join(i.replace(' ', '_') + ':' + roster[i] for i in ids)]
    for v in kept:
        default = defaults(v['casts'])
        ex = []
        for i in ids:
            c = v['casts'].get(i)
            if not c:
                ex.append(i.replace(' ', '_') + ':-')
            elif c[1] != default.get(c[0]):
                ex.append(i.replace(' ', '_') + ':' + c[1])
        lines.append('|'.join(['VOTE', str(v['n']), v['date'], v['q'], v['res'], v['doc'], v['title'], v['docTitle'], v['yea'] + '-' + v['nay'],
                               ','.join('%s=%s' % kv for kv in default.items()), ' '.join(ex)]))
    return lines


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--year', type=int, default=2026)
    a.add_argument('--congress', type=int, default=119)
    a.add_argument('--session', type=int, default=2)
    a.add_argument('--house-from', type=int, default=270)
    a.add_argument('--senate-from', type=int, default=240)
    a.add_argument('--from-dir', default='')
    o = a.parse_args()
    today = date.today().strftime('%B %d, %Y').replace(' 0', ' ')
    h = house(o.year, o.house_from, o.from_dir)
    s = senate(o.congress, o.session, o.senate_from, o.from_dir)
    if len(h) < 2 or len(s) < 2:
        sys.exit('Fewer votes than expected; the old files were left as they were.')
    hp = OUT / ('house-%d-%d.txt' % (o.congress, o.session))
    sp = OUT / ('senate-%d-%d.txt' % (o.congress, o.session))
    hhead = [l for l in hp.read_text(encoding='utf-8').split('\n') if l.startswith('#')] if hp.exists() else []
    shead = [l for l in sp.read_text(encoding='utf-8').split('\n') if l.startswith('#')] if sp.exists() else []
    if hhead:
        hhead[0] = hhead[0].split(', read ')[0] + ', read %s.' % today
    if shead:
        shead[0] = shead[0].split(', read ')[0] + ', read %s.' % today
    hp.write_text('\n'.join(hhead + h) + '\n', encoding='utf-8')
    sp.write_text('\n'.join(shead + s) + '\n', encoding='utf-8')
    print('House: %d votes kept. Senate: %d votes kept. Now run build_fit.py.' % (len(h) - 1, len(s) - 1))


if __name__ == '__main__':
    main()
