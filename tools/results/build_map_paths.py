"""Builds site/results/ap-map-paths.js from us-atlas states-albers-10m.json (public domain Census shapes, pre-projected 975x610).
Usage: py build_map_paths.py states-albers-10m.json > ../../site/results/ap-map-paths.js"""
import json, sys
FIPS = {"01":"al","02":"ak","04":"az","05":"ar","06":"ca","08":"co","09":"ct","10":"de","11":"dc","12":"fl","13":"ga","15":"hi","16":"id","17":"il","18":"in","19":"ia","20":"ks","21":"ky","22":"la","23":"me","24":"md","25":"ma","26":"mi","27":"mn","28":"ms","29":"mo","30":"mt","31":"ne","32":"nv","33":"nh","34":"nj","35":"nm","36":"ny","37":"nc","38":"nd","39":"oh","40":"ok","41":"or","42":"pa","44":"ri","45":"sc","46":"sd","47":"tn","48":"tx","49":"ut","50":"vt","51":"va","53":"wa","54":"wv","55":"wi","56":"wy"}
t = json.load(open(sys.argv[1], encoding="utf-8"))
sx, sy = t["transform"]["scale"]; tx, ty = t["transform"]["translate"]
arcs = []
for a in t["arcs"]:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)
def arc(i):
    return arcs[i] if i >= 0 else arcs[~i][::-1]
def ring(idx):
    pts = []
    for i in idx:
        a = arc(i); pts.extend(a if not pts else a[1:])
    out = [pts[0]]
    for p in pts[1:-1]:
        if abs(p[0]-out[-1][0]) + abs(p[1]-out[-1][1]) >= 0.7: out.append(p)
    out.append(pts[-1])
    return out
def path(rings):
    s = ""
    for r in rings:
        if len(r) < 4: continue
        s += "M" + "L".join("%.1f %.1f" % p for p in r[:-1]) + "Z"
    return s
res = {}
for g in t["objects"]["states"]["geometries"]:
    code = FIPS.get(g["id"])
    if not code: continue
    polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
    rings = [ring(r) for poly in polys for r in poly]
    allp = [p for r in rings for p in r]
    xs = [p[0] for p in allp]; ys = [p[1] for p in allp]
    # drop tiny islands (< 1.2 px box) except for DC, which gets its own marker
    res[code] = {"d": path(rings), "c": [round(sum(xs)/len(xs),1), round(sum(ys)/len(ys),1)], "b": [round(min(xs),1), round(min(ys),1), round(max(xs),1), round(max(ys),1)]}
print("window.TW_MAP_PATHS=" + json.dumps(res, separators=(",", ":")) + ";")
