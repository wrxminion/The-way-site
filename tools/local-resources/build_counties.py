#!/usr/bin/env python3
"""Build one county outline file per state for the district lookup page.

Input: counties-10m.json from the us-atlas npm package (U.S. Census Bureau
cartographic boundaries, 1:10,000,000). Output: site/lookup/data/counties/xx.json
(GeoJSON FeatureCollection, properties f = 5 digit FIPS, n = name, k = kind).
These outlines are coarse (good to about a few hundred meters). The page uses
them only to guess the county; it prefers the county name the address search returns.

  python build_counties.py --atlas counties-10m.json --out site/lookup/data/counties
"""
import argparse, json, os

FIPS = {'01':'al','02':'ak','04':'az','05':'ar','06':'ca','08':'co','09':'ct','10':'de','11':'dc','12':'fl',
 '13':'ga','15':'hi','16':'id','17':'il','18':'in','19':'ia','20':'ks','21':'ky','22':'la','23':'me','24':'md',
 '25':'ma','26':'mi','27':'mn','28':'ms','29':'mo','30':'mt','31':'ne','32':'nv','33':'nh','34':'nj','35':'nm',
 '36':'ny','37':'nc','38':'nd','39':'oh','40':'ok','41':'or','42':'pa','44':'ri','45':'sc','46':'sd','47':'tn',
 '48':'tx','49':'ut','50':'vt','51':'va','53':'wa','54':'wv','55':'wi','56':'wy'}

def kind(fips, name):
    st, co = fips[:2], int(fips[2:])
    if st == '22': return 'parish'
    if st == '02': return 'borough'          # Alaska boroughs and census areas
    if st == '11': return 'district'
    if (st == '51' and co >= 500) or fips in ('24510', '29510', '32510'): return 'city'
    return 'county'

def decode(topo):
    sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
    arcs = []
    for arc in topo['arcs']:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append([round(x * sx + tx, 4), round(y * sy + ty, 4)])
        arcs.append(pts)
    def ring(ix):
        out = []
        for i in ix:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out
    return ring

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--atlas', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    topo = json.load(open(a.atlas, encoding='utf-8'))
    ring = decode(topo)
    by = {}
    for g in topo['objects']['counties']['geometries']:
        fips = g['id']; st = FIPS.get(fips[:2])
        if not st or not g.get('arcs'): continue
        if g['type'] == 'Polygon': geom = {'type': 'Polygon', 'coordinates': [ring(r) for r in g['arcs']]}
        else: geom = {'type': 'MultiPolygon', 'coordinates': [[ring(r) for r in p] for p in g['arcs']]}
        name = g['properties']['name']
        by.setdefault(st, []).append({'type': 'Feature', 'properties': {'f': fips, 'n': name, 'k': kind(fips, name)}, 'geometry': geom})
    os.makedirs(a.out, exist_ok=True)
    for st, feats in sorted(by.items()):
        feats.sort(key=lambda f: f['properties']['f'])
        with open(os.path.join(a.out, st + '.json'), 'w', encoding='utf-8') as fh:
            json.dump({'type': 'FeatureCollection', 'source': 'U.S. Census Bureau via us-atlas 3.0.1 (counties-10m)', 'features': feats}, fh, separators=(',', ':'))
    print(len(by), 'states,', sum(len(v) for v in by.values()), 'counties')

if __name__ == '__main__':
    main()
