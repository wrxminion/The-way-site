#!/usr/bin/env python3
"""Make every state map open on an address from the nationwide lookup page.

The lookup page links to  ../map-xx/#at=LAT,LNG . This adds a small function to each state map's map.js that
reads that hash after the district files load, centers the map there and runs the normal click lookup.
Usage (from the-way/site):  python3 lookup-build/apply_handoff.py [--dry-run]
Files changed: map/map.js, map-*/map.js and us-build/map/map.js. Safe to run twice."""
import glob, re, sys
FUNC = r'''/* Handoff from the nationwide lookup page: .../map-xx/#at=lat,lng opens the map on that spot. */
function jumpFromHash(){
  const m=/^#at=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(location.hash);
  if(!m)return;
  const lat=+m[1],lng=+m[2];
  if(!(lat>15&&lat<72&&lng>-180&&lng<-60))return;
  map.setView([lat,lng],12);
  lookup(lat,lng,'Your address');
}

'''
MARK = '/* ---------- load data ---------- */'
dry = '--dry-run' in sys.argv
files = sorted(set(glob.glob('map/map.js') + glob.glob('map-*/map.js') + glob.glob('us-build/map/map.js')))
n = 0
for f in files:
    s = open(f, encoding='utf-8').read()
    if 'jumpFromHash' in s:
        print('already', f); continue
    if MARK not in s:
        print('SKIP (no load-data marker)', f); continue
    s2 = s.replace(MARK, FUNC + MARK, 1)
    s2, k = re.subn(r"(\n  status\.textContent='Click anywhere in [^\n]*\n)(\}\)\.catch)", r"\1  jumpFromHash();\n\2", s2, count=1)
    if k != 1:
        print('SKIP (no start-up line)', f); continue
    n += 1
    if not dry: open(f, 'w', encoding='utf-8').write(s2)
    print('patched', f)
print(n, 'files', '(dry run)' if dry else 'changed')
