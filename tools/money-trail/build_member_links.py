#!/usr/bin/env python3
"""D225: which House members in the law votes (site/money-trail/laws.js) have a page on this site.

Reads each site/government/congress/members/<slug>.html, takes the Bioguide ID from its
bioguide.congress.gov link, and writes site/money-trail/member-pages.js:
window.TW_MEMBER_PAGES = {"<Bioguide ID>": "<slug>", ...}, only for IDs that appear in the votes.
Rerun after build_congress.py or follow_laws.py changes the member pages or the laws.
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / 'site'
pages = {}
for f in sorted((SITE / 'government/congress/members').glob('*.html')):
    ids = set(re.findall(r'bioguide\.congress\.gov/search/bio/([A-Z][0-9]{6})', f.read_text(encoding='utf-8')))
    if len(ids) == 1:
        pages[ids.pop()] = f.stem
laws_js = (SITE / 'money-trail/laws.js').read_text(encoding='utf-8')
voters = set(re.findall(r'\["([A-Z][0-9]{6})",', laws_js))
out = {i: pages[i] for i in sorted(voters) if i in pages}
(SITE / 'money-trail/member-pages.js').write_text(
    '// Built by tools/money-trail/build_member_links.py. Bioguide ID -> page in /government/congress/members/.\n'
    'window.TW_MEMBER_PAGES=' + json.dumps(out, separators=(',', ':')) + ';\n', encoding='utf-8')
print(len(pages), 'member pages;', len(voters), 'House members in the law votes;', len(out), 'have a page')
