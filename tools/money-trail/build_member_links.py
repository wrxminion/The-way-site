#!/usr/bin/env python3
"""D225: which House members in the law votes (site/money-trail/laws.js) have a page on this site.

Reads each site/government/congress/members/<slug>.html, takes the Bioguide ID from its
bioguide.congress.gov link, and writes site/money-trail/member-pages.js:
window.TW_MEMBER_PAGES = {"<Bioguide ID>": "<slug>", ...} and (D226) window.TW_MEMBER_NAMES = {"<Bioguide ID>": "<full name from the page's h1>"},
only for IDs that appear in the laws (votes, sponsors, cosponsors).
Rerun after build_congress.py or follow_laws.py changes the member pages or the laws.
"""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = ROOT / 'site'
pages, names = {}, {}
for f in sorted((SITE / 'government/congress/members').glob('*.html')):
    ids = set(re.findall(r'bioguide\.congress\.gov/search/bio/([A-Z][0-9]{6})', f.read_text(encoding='utf-8')))
    if len(ids) == 1:
        i = ids.pop(); pages[i] = f.stem
        h1 = re.search(r'<h1[^>]*>([^<]+)</h1>', f.read_text(encoding='utf-8'))
        if h1: names[i] = html.unescape(h1.group(1).strip())
laws_js = (SITE / 'money-trail/laws.js').read_text(encoding='utf-8')
voters = set(re.findall(r'\["([A-Z][0-9]{6})",', laws_js))  # members, sponsors and cosponsors all start with the Bioguide ID
out = {i: pages[i] for i in sorted(voters) if i in pages}
(SITE / 'money-trail/member-pages.js').write_text(
    '// Built by tools/money-trail/build_member_links.py. Bioguide ID -> page in /government/congress/members/.\n'
    'window.TW_MEMBER_PAGES=' + json.dumps(out, separators=(',', ':')) + ';\n'
    'window.TW_MEMBER_NAMES=' + json.dumps({i: names[i] for i in out if i in names}, separators=(',', ':'), ensure_ascii=False) + ';\n', encoding='utf-8')
print(len(pages), 'member pages;', len(voters), 'House members in the law votes;', len(out), 'have a page')
