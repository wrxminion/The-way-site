#!/usr/bin/env python3
"""Build site/members/senator-letters/senators.js (Admin > Contact Your Senator preview).

Input: legislators-current.yaml from the unitedstates/congress-legislators
project (https://github.com/unitedstates/congress-legislators), used for names,
state, party, first Senate term and a cross-check of phone and contact link.

Phone numbers, offices and contact links were checked against senate.gov on
Nov 15, 2026:
  - senators_cfm.xml (https://www.senate.gov/general/contact_information/senators_cfm.xml)
    for Alsobrooks through Rounds (76 senators, every one matched the dataset),
  - the senate.gov state pages (https://www.senate.gov/states/XX/intro.htm) for
    17 more, and the same XML checked earlier the same day for the last 7.
Where senate.gov lists only a home page, CONTACT_PAGE below is the contact page
linked from that senator's own home page (opened Nov 15, 2026).

Votes: official senate.gov roll call XML files, listed in VOTES.

Usage: python3 build_senators.py legislators-current.yaml
"""
import json
import sys

import yaml

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
    "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina",
    "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
    "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

# senate.gov gives a newer contact link than the dataset for these.
SENATE_GOV_LINK = {
    "W000817": "https://www.warren.senate.gov/contact/",
    "S000033": "https://www.sanders.senate.gov/contact/",
}

# senate.gov lists only the home page. Contact page linked from the senator's home page.
CONTACT_PAGE = {
    "S001150": "https://www.schiff.senate.gov/contact/",
    "G000574": "https://www.gallego.senate.gov/connect/get-in-touch/",
    "B001303": "https://www.bluntrochester.senate.gov/contact/write-to-lbr/",
    "B001299": "https://www.banks.senate.gov/contact/share-your-opinion/",
    "C001114": "https://www.curtis.senate.gov/contact/share-your-opinion/",
    "S001208": "https://www.slotkin.senate.gov/contact/",
    "K000394": "https://www.kim.senate.gov/contact/",
    "S001232": "https://www.sheehy.senate.gov/contact/",
    "M001242": "https://www.moreno.senate.gov/contact/share-your-opinion/",
    "J000312": "https://www.justice.senate.gov/contact/write-to-jim/",
    "H001104": "https://www.husted.senate.gov/contact/contact-jon/",
    "M001244": "https://www.moody.senate.gov/contact-us/",
    "A000383": "https://www.armstrong.senate.gov/contact/",
    "A000382": "https://www.alsobrooks.senate.gov/contact/get-in-touch/",
    "M001243": "https://www.mccormick.senate.gov/contact/contact-dave/",
}

# Senators-elect and others with no Senate office are not in the dataset.
DISPLAY_NAME = {"G000608": "Darline Graham"}

# Reported public positions. Only ones checked in a named source.
TIME = "TIME, Nov 13, 2026"
STANCE = {
    "S001194": ("backs", TIME), "W000802": ("backs", TIME), "B001277": ("backs", TIME),
    "B001230": ("backs", TIME), "K000383": ("backs", TIME), "K000377": ("backs", TIME),
    "G000574": ("backs", TIME), "G000555": ("backs", TIME), "R000608": ("backs", TIME),
    "C001113": ("backs", TIME), "K000384": ("backs", TIME), "A000382": ("backs", TIME),
    "B001288": ("backs", "Al Jazeera, Nov 5, 2026"),
    "V000128": ("challenger", TIME),
    "S000148": ("self", TIME),
}

# Roll calls. "yea" lists Democrats and independents who voted Yea; "nv" who did not vote.
# Everyone else in the 47 member caucus voted Nay.
VOTES = [
    {"id": "1191-00007", "date": "January 20, 2025", "what": "final passage of the Laken Riley Act (S. 5), an immigration detention bill",
     "yea": "Cortez Masto,Fetterman,Gallego,Hassan,Kelly,Ossoff,Peters,Rosen,Shaheen,Slotkin,Warner,Warnock", "nv": ""},
    {"id": "1191-00017", "date": "January 25, 2025", "what": "confirming Kristi Noem as Secretary of Homeland Security",
     "yea": "Fetterman,Hassan,Kaine,Kim,Peters,Shaheen,Slotkin", "nv": "King,Merkley,Schatz,Smith,Warnock,Wyden"},
    {"id": "1191-00128", "date": "March 14, 2025", "what": "ending debate on H.R. 1968, the March 2025 full-year funding bill",
     "yea": "Cortez Masto,Durbin,Fetterman,Gillibrand,Hassan,King,Peters,Schatz,Schumer,Shaheen", "nv": ""},
    {"id": "1191-00318", "date": "June 17, 2025", "what": "final passage of the GENIUS Act (S. 1582), rules for stablecoins",
     "yea": "Alsobrooks,Booker,Cortez Masto,Fetterman,Gallego,Gillibrand,Hassan,Heinrich,Hickenlooper,Kim,Lujan,Ossoff,Padilla,Rosen,Schiff,Slotkin,Warner,Warnock", "nv": "Kelly"},
    {"id": "1191-00455", "date": "July 30, 2025", "what": "the motion to bring up S.J.Res. 34, which would block a weapons sale to Israel",
     "yea": "Alsobrooks,Baldwin,Blunt Rochester,Duckworth,Durbin,Heinrich,Hirono,Kaine,Kim,King,Klobuchar,Lujan,Markey,Merkley,Murphy,Murray,Sanders,Schatz,Shaheen,Smith,Van Hollen,Warnock,Warren,Welch", "nv": "Gallego,Kelly,Slotkin"},
    {"id": "1191-00618", "date": "November 10, 2025", "what": "passing H.R. 5371, the funding bill that ended the fall 2025 shutdown",
     "yea": "Cortez Masto,Durbin,Fetterman,Hassan,Kaine,King,Rosen,Shaheen", "nv": ""},
    {"id": "1192-00203", "date": "July 22, 2026", "what": "ending debate on Michael C. Martin for federal judge in the Eastern District of Michigan",
     "yea": "Durbin,Fetterman,Heinrich,Hirono,Kaine,King,Peters,Rosen,Shaheen,Slotkin,Whitehouse", "nv": "Coons"},
    {"id": "1192-00205", "date": "July 22, 2026", "what": "ending debate on Antonio M. Pozos for federal judge in the Eastern District of Pennsylvania",
     "yea": "Durbin,Fetterman,Shaheen", "nv": ""},
    {"id": "1192-00254", "date": "September 30, 2026", "what": "moving to H.R. 9340, a federal rule for who pays grid upgrades for large power users",
     "yea": "Hassan,Klobuchar,Ossoff,Warnock", "nv": ""},
]


def vote_url(vid):
    sess, num = vid.split("-")
    return ("https://www.senate.gov/legislative/LIS/roll_call_votes/vote%s/vote_119_%s_%s.xml"
            % (sess, sess[-1], num))


def key(last):
    return last.replace("á", "a").replace("é", "e")


def main(path):
    data = yaml.safe_load(open(path, encoding="utf-8"))
    sens = []
    for p in data:
        sen_terms = [t for t in p["terms"] if t["type"] == "sen"]
        if not sen_terms or p["terms"][-1]["type"] != "sen":
            continue
        t = p["terms"][-1]
        bid = p["id"]["bioguide"]
        party = {"Democrat": "D", "Republican": "R", "Independent": "I"}[t["party"]]
        caucus = party == "D" or t.get("caucus") == "Democrat"
        last = p["name"]["last"]
        if bid == "G000608":
            last = "Graham"
        form = SENATE_GOV_LINK.get(bid) or CONTACT_PAGE.get(bid) or t.get("contact_form") or t["url"]
        sens.append({
            "id": bid,
            "name": DISPLAY_NAME.get(bid, p["name"].get("official_full")),
            "last": last,
            "st": t["state"],
            "party": party,
            "dem": caucus,
            "phone": t["phone"],
            "form": form,
            "site": t["url"],
            "office": t.get("address", "").split(" Washington")[0],
            "since": int(sen_terms[0]["start"][:4]),
            "stance": STANCE.get(bid),
        })
    assert len(sens) == 100, len(sens)
    caucus_keys = {key(s["last"]): s for s in sens if s["dem"]}
    assert len(caucus_keys) == 47, len(caucus_keys)
    votes = []
    for v in VOTES:
        yea = set(x for x in v["yea"].split(",") if x)
        nv = set(x for x in v["nv"].split(",") if x)
        for n in yea | nv:
            assert n in caucus_keys, n
        nay = set(caucus_keys) - yea - nv
        maj = "Yea" if len(yea) > len(nay) else "Nay"
        votes.append({"id": v["id"], "date": v["date"], "what": v["what"], "url": vote_url(v["id"]),
                      "yes": len(yea), "no": len(nay), "nv": len(nv), "most": maj})
        for k, s in caucus_keys.items():
            cast = "Yea" if k in yea else ("Not Voting" if k in nv else "Nay")
            if cast != "Not Voting" and cast != maj:
                s.setdefault("breaks", []).append({"v": v["id"], "cast": cast})
    for s in sens:
        if s["dem"]:
            s.setdefault("breaks", [])
    sens.sort(key=lambda s: (STATES[s["st"]], s["last"]))
    out = {"checked": "November 15, 2026", "states": STATES, "votes": votes, "senators": sens}
    js = ("/* Built by tools/contact-senator/build_senators.py. Do not edit by hand. */\n"
          "window.SENATE_CONTACTS=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    dest = "site/members/senator-letters/senators.js"
    open(dest, "w", encoding="utf-8").write(js)
    print("wrote", dest, len(js), "bytes")
    for s in sens:
        if s["dem"]:
            print(s["last"], s["st"], [b["v"] + ":" + b["cast"] for b in s["breaks"]])


if __name__ == "__main__":
    main(sys.argv[1])
