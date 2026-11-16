#!/usr/bin/env python3
"""Build site/get-involved/contact-your-representative/representatives.js (Get Involved > Contact Your Representative).

Input: legislators-current.yaml from the unitedstates/congress-legislators project, the same file build_senators.py
uses: name, state, district, party, first House term, Washington office phone and website for every House member
(435 representatives, 5 delegates and 1 resident commissioner). Most House offices take messages only through the
contact page on their own website, so the tool links the website.

Our own pages: each member's page in /government/congress/members/ and their campaign committee on the Money web
(site_links.py). Run from the repo root.

Usage: python3 tools/contact-senator/build_reps.py legislators-current.yaml
"""
import json
import sys

import yaml

from site_links import member_pages, money_links

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AS": "American Samoa", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida",
    "GA": "Georgia", "GU": "Guam", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "MP": "Northern Mariana Islands", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "PR": "Puerto Rico", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VI": "U.S. Virgin Islands",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
DELEGATE = {"AS", "DC", "GU", "MP", "VI"}


def ordinal(n):
    return "%d%s" % (n, "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th"))


def main(path):
    data = yaml.safe_load(open(path, encoding="utf-8"))
    pages = member_pages()
    reps = [p for p in data if p["terms"][-1]["type"] == "rep"]
    web = money_links({p["id"]["bioguide"]: p["id"].get("fec", []) for p in reps}, "H")
    out = []
    for p in reps:
        t = p["terms"][-1]
        bid = p["id"]["bioguide"]
        party = {"Democrat": "D", "Republican": "R", "Independent": "I"}[t["party"]]
        st = t["state"]
        dist = int(t.get("district") or 0)
        title = "Resident Commissioner" if st == "PR" else "Delegate" if st in DELEGATE else "Representative"
        seat = STATES[st] if title != "Representative" else (STATES[st] + (", at large" if dist == 0 else "'s " + ordinal(dist) + " District"))
        out.append({
            "id": bid,
            "name": p["name"].get("official_full") or (p["name"]["first"] + " " + p["name"]["last"]),
            "last": p["name"]["last"],
            "st": st,
            "district": dist,
            "seat": seat,
            "stateName": STATES[st],
            "title": title,
            "party": party,
            "dem": party == "D" or t.get("caucus") == "Democrat",
            "phone": t["phone"],
            "form": t.get("contact_form") or t["url"],
            "site": t["url"],
            "office": t.get("office") or t.get("address", "").split(" Washington")[0],
            "since": int(min(x["start"] for x in p["terms"] if x["type"] == "rep")[:4]),
            "page": pages.get(bid),
            "web": web.get(bid, {}).get("url"),
            "webName": web.get(bid, {}).get("name"),
        })
    assert len(out) >= 435, len(out)
    out.sort(key=lambda s: (STATES[s["st"]], s["district"], s["last"]))
    res = {"checked": "November 16, 2026", "chamber": "house", "states": {k: STATES[k] for k in sorted({s["st"] for s in out}, key=lambda k: STATES[k])},
           "members": out}
    js = ("/* Built by tools/contact-senator/build_reps.py. Do not edit by hand. */\n"
          "window.HOUSE_CONTACTS=" + json.dumps(res, ensure_ascii=False, separators=(",", ":")) + ";\n")
    dest = "site/get-involved/contact-your-representative/representatives.js"
    open(dest, "w", encoding="utf-8").write(js)
    print("wrote", dest, len(js), "bytes;", len(out), "members;", sum(1 for s in out if s["dem"]), "Democrats;",
          sum(1 for s in out if s["page"]), "with a page on The Way;", sum(1 for s in out if s["web"]), "on the Money web")


if __name__ == "__main__":
    main(sys.argv[1])
