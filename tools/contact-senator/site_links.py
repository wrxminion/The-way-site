"""Links from a senator to their pages on our own site (used by build_senators.py and build_votes.py).

member_pages(): Bioguide ID -> slug of their page in site/government/congress/members/ (made by
  tools/government/build_congress.py). Found by the Biographical Directory link on each page, so no ID is guessed.
money_links(fec_ids): Bioguide ID -> link to their campaign committee on the Money web, for senators whose
  campaign committee is in the Money Trail's FEC data. Committees loaded with the page open with ?hub=NAME;
  every other committee opens with ?fec=ID (fec-more.js loads its filings).
"""
import glob
import json
import os
import re
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = os.path.join(ROOT, 'site')
BIO = re.compile(r'bioguide\.congress\.gov/search/bio/([A-Z]\d{6})')


def member_pages():
    out = {}
    for f in sorted(glob.glob(os.path.join(SITE, 'government', 'congress', 'members', '*.html'))):
        m = BIO.search(open(f, encoding='utf-8').read())
        if m:
            out[m.group(1)] = os.path.basename(f)[:-5]
    return out


def _fec_data():
    t = open(os.path.join(SITE, 'money-trail', 'fec-data.js'), encoding='utf-8').read()
    i = t.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
    return json.JSONDecoder().raw_decode(t[i:])[0]


def money_links(fec_ids):
    """fec_ids: Bioguide ID -> list of FEC candidate IDs (from congress-legislators)."""
    cand = {f: b for b, ids in fec_ids.items() for f in ids}
    found = {}

    def take(c, loaded):
        ca = c.get('candidate') or {}
        b = cand.get(ca.get('id'))
        if not b or ca.get('office') != 'S' or c.get('committee_type') != 'Senate':
            return
        rec = (c.get('totals') or {}).get('receipts') or 0
        if b not in found or rec > found[b][2]:
            found[b] = (c['committee_id'], c['name'], rec, loaded)

    for c in _fec_data()['committees']:
        take(c, True)
    for f in glob.glob(os.path.join(SITE, 'money-trail', 'fec-more', '[0-9]*.json')):
        for c in json.load(open(f, encoding='utf-8'))['committees']:
            take(c, False)
    out = {}
    for b, (cid, name, _rec, loaded) in found.items():
        q = 'view=network&hub=' + urllib.parse.quote(name) if loaded else 'fec=' + cid
        out[b] = {'committee': cid, 'name': name, 'url': '/money-trail/?' + q}
    return out
