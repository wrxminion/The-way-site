#!/usr/bin/env python3
"""Election results collector. Standard library only. No keys, tokens or logins.

Reads a config file listing public official sources, fetches each one, converts it to the
theway-results/1 files described in README.md, and writes them under an output folder
(site/results/data/ when run for real). Run once, or with --loop to repeat.

  python3 scrape.py --config config.json --out ../../site/results/data
"""
import argparse, csv, gzip, io, json, os, re, sys, time, urllib.request, urllib.error, zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

SCHEMA = "theway-results/1"
UA = "TheWayResultsCollector/1 (+https://michiinstitute.com/results/)"
PARTY_CODE = {"d": "D", "dem": "D", "democrat": "D", "democratic": "D", "democratic party": "D",
              "r": "R", "rep": "R", "gop": "R", "republican": "R", "republican party": "R"}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")[:80]


def party_code(label):
    if not label:
        return "O"
    return PARTY_CODE.get(str(label).strip().lower(), "O")


def to_int(v):
    try:
        return int(str(v).replace(",", "").strip() or 0)
    except ValueError:
        return 0


# ---------------------------------------------------------------- fetching
def resolve_url(src, ua):
    """Clarity election pages publish a new version folder on every update; current_ver.txt names it."""
    base = src.get("clarity_base")
    if not base:
        return src["url"]
    req = urllib.request.Request(base + "current_ver.txt", headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=30) as r:
        ver = r.read().decode().strip()
    return "%s%s/reports/%s" % (base, ver, src.get("report", "detail.xml"))


def fetch_many(urls, ua):
    """Fetch several small urls and return one JSON list of {"url", "body"}; a url that fails (404/500) is skipped."""
    parts = []
    for u in urls:
        req = urllib.request.Request(u, headers={"User-Agent": ua or UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                parts.append({"url": u, "body": r.read().decode("utf-8", "replace")})
        except urllib.error.HTTPError as e:
            if e.code >= 500 or e.code == 404:
                continue
            raise
        time.sleep(0.15)
    if not parts:
        raise ValueError("no url answered")
    return json.dumps(parts).encode("utf-8")


def fetch(url, state, ua=None):
    """Return (bytes, source_last_modified or None, changed). Uses ETag / Last-Modified when offered."""
    req = urllib.request.Request(url, headers={"User-Agent": ua or UA, "Accept-Encoding": "gzip"})
    if not url.startswith("file:"):
        if state.get("etag"):
            req.add_header("If-None-Match", state["etag"])
        if state.get("last_modified"):
            req.add_header("If-Modified-Since", state["last_modified"])
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            state["etag"] = r.headers.get("ETag")
            state["last_modified"] = r.headers.get("Last-Modified")
            return body, state.get("last_modified"), True
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return None, state.get("last_modified"), False
        raise


def unzip_first(body, suffixes=(".xml", ".csv", ".json")):
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        for n in z.namelist():
            if n.lower().endswith(suffixes):
                return z.read(n)
    raise ValueError("no data file inside zip")


# ---------------------------------------------------------------- adapters
def a_csv(body, src):
    """One row per contest choice. Header names are mapped in src['columns'] (see README)."""
    col = {"contest": "contest", "choice": "choice", "party": "party", "votes": "votes",
           "precincts_reporting": "precincts_reporting", "precincts_total": "precincts_total",
           "winner": "winner", "state": "state", "district": "district", "office": "office", "kind": "kind"}
    col.update(src.get("columns", {}))
    if body[:2] == b"PK":
        body = unzip_first(body)
    try:
        text = body.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = body.decode("cp1252", "replace")
    rd = csv.DictReader(io.StringIO(text))
    contests, order = {}, []
    for row in rd:
        g = lambda k: (row.get(col[k]) or "").strip()
        title = g("contest")
        vf = re.search(r"\s*\(Vote For (\d+)\)\s*$", title)
        if vf:
            title = title[:vf.start()].strip()
        if not title or not g("choice"):
            continue
        state = (g("state") or src.get("state") or "").lower()
        key = slug(state + "-" + title + "-" + g("district")) if state else slug(title + "-" + g("district"))
        c = contests.get(key)
        if not c:
            c = {"id": key, "kind": g("kind") or src.get("kind", "candidate"), "level": src.get("level", "state"),
                 "state": state, "office": g("office") or title, "district": g("district") or None,
                 "title": title, "choices": [],
                 "precincts": {"reporting": to_int(g("precincts_reporting")), "total": to_int(g("precincts_total"))}}
            contests[key] = c
            order.append(key)
        name = g("choice")
        ch = {"id": slug(name), "name": name, "party": g("party") or None, "party_code": party_code(g("party")),
              "votes": to_int(g("votes"))}
        c["choices"].append(ch)
        if g("winner").lower() in ("1", "true", "yes", "y", "x", "winner"):
            c["called"] = {"winner": ch["id"], "by": src.get("name", "source"), "at": None}
    for c in contests.values():
        if {x["name"].strip().lower() for x in c["choices"]} <= {"yes", "no", "for", "against", "yes/for", "no/against"}:
            c["kind"] = "judicial" if re.search(r"(judge|justice|retention)", c["title"], re.I) else "measure"
    return [contests[k] for k in order]


def a_clarity_xml(body, src):
    """Clarity ENR 'detail.xml' style: Contest > Choice with vote totals. UNVERIFIED against a live file
    (the build machine cannot reach election sites): attribute names are matched loosely, and the
    dry run on the real Colorado file on Monday must confirm the counts match the official page."""
    if body[:2] == b"PK":
        body = unzip_first(body)
    root = ET.fromstring(body)
    pick = lambda e, *names: next((e.get(n) for n in names if e.get(n) not in (None, "")), None)
    out = []
    for ct in root.iter():
        if ct.tag.split("}")[-1] != "Contest":
            continue
        title = pick(ct, "text", "name", "Name") or ""
        if not title:
            continue
        question = str(pick(ct, "isQuestion", "IsQuestion") or "").lower() == "true"
        pr = to_int(pick(ct, "precinctsReported", "PrecinctsReported", "precinctsParticipating", "PrecinctsParticipating"))
        pt = to_int(pick(ct, "totalPrecincts", "TotalPrecincts", "precinctsTotal", "PrecinctsTotal"))
        c = {"id": slug(src.get("state", "") + "-" + (pick(ct, "key", "Key") or title)),
             "kind": "measure" if question else src.get("kind", "candidate"), "level": src.get("level", "state"),
             "state": src.get("state", ""), "office": title, "district": None, "title": title,
             "vote_for": to_int(pick(ct, "voteFor", "VoteFor")) or 1, "choices": [],
             "precincts": {"reporting": pr, "total": pt}}
        for pcs in ct:
            if pcs.tag.split("}")[-1] == "ParticipatingCounties":
                for k in pcs:
                    pn = pick(k, "name", "Name")
                    if pn:
                        _cty_add(c, pn, None, 0, {"reporting": to_int(pick(k, "precinctsReported")), "total": to_int(pick(k, "precinctsParticipating"))})
        for ch in ct:
            if ch.tag.split("}")[-1] != "Choice":
                continue
            name = pick(ch, "text", "name", "Name") or ""
            votes = to_int(pick(ch, "totalVotes", "TotalVotes", "votes"))
            if not votes:
                votes = sum(to_int(v.get("votes") or v.get("Votes")) for v in ch if v.tag.split("}")[-1] == "VoteType")
            party = pick(ch, "party", "Party")
            c["choices"].append({"id": slug(name), "name": name, "party": party, "party_code": party_code(party), "votes": votes})
            vts = [v for v in ch if v.tag.split("}")[-1] == "VoteType"]
            tv = [v for v in vts if (v.get("name") or "").lower() == "total votes"] or vts
            for v in (tv[:1] if tv and (tv[0].get("name") or "").lower() == "total votes" else tv):
                for k in v:
                    if k.tag.split("}")[-1] == "County" and k.get("name"):
                        _cty_add(c, k.get("name"), slug(name), to_int(k.get("votes")))
        if c["choices"]:
            _cty_finish(c)
            out.append(c)
    return out


def _en(v):
    """Scytl text fields are lists of {languageId, text}. Return the English text."""
    if isinstance(v, list):
        for t in v:
            if isinstance(t, dict) and t.get("languageId", "en").startswith("en") and t.get("text"):
                return str(t["text"]).strip()
        for t in v:
            if isinstance(t, dict) and t.get("text"):
                return str(t["text"]).strip()
        return ""
    return str(v or "").strip()


RE_US_SEN = re.compile(r"^(?:member,\s*)?(?:u\.?s\.?|united states)\s+senate\b", re.I)
RE_US_HOUSE = re.compile(r"^(?:(?:u\.?s\.?|united states)\s+house\b|member,\s*house of representatives)", re.I)
RE_STATE_LEVEL = re.compile(r"governor|lieutenant|attorney general|secretary of state|commissioner|superintendent|"
                            r"state senate|state house|house of delegates|public service|\bpsc\b|treasurer|auditor|comptroller|"
                            r"supreme court|court of appeals|constitutional amendment", re.I)


def _scytl_counties(src, c, item_id):
    """Per-county rows for one Scytl contest from the public site's own breakdown feed (data/ballot-item/<id>, breakdownResults).
    Fails soft: if the call or the shape is wrong the contest just has no counties."""
    try:
        base = src["url"].split("/ballot-items")[0]
        body, _, _ = fetch(base + "/data/ballot-item/" + str(item_id), {}, src.get("user_agent"))
        br = (json.loads(body.decode("utf-8-sig")).get("ballotItemWithBreakdown") or {}).get("breakdownResults") or []
    except Exception:
        return
    ids = [x["id"] for x in c["choices"]]
    rows = []
    for b in br:
        name = _en((b.get("locality") or {}).get("name"))
        if not name:
            continue
        by = {}
        for o in b.get("ballotOptions") or []:
            nm = _en(o.get("name"))
            abbr = _en((o.get("party") or {}).get("abbreviation")) or _en((o.get("party") or {}).get("name"))
            if abbr:
                nm = re.sub(r"\s*\(" + re.escape(abbr) + r"\)\s*$", "", nm)
            by[slug(nm) or "option"] = max(0, to_int(o.get("voteCount")))
        row = {"name": name, "choices": [{"id": i, "votes": by.get(i, 0)} for i in ids]}
        ps = b.get("precinctReportingStatus") or {}
        if ps.get("totalUnits"):
            row["precincts"] = {"reporting": to_int(ps.get("reportingUnits")), "total": to_int(ps.get("totalUnits"))}
        rows.append(row)
    if rows:
        c["counties"] = sorted(rows, key=lambda r: r["name"])
    time.sleep(0.2)


def a_scytl_json(body, src):
    """Scytl 'results/public' election-night sites (Georgia, Virginia and others). Source url is the
    ballot-items endpoint: https://<host>/results/public/api/elections/<Jurisdiction>/<publicElectionId>/ballot-items
    Checked by hand against the live Georgia and Virginia pages (see README). U.S. Senate and U.S. House
    contests are also emitted for the 'senate' and 'house' scopes (key '_scope'). A race is only 'called'
    when the official source marks an option isWinner; we never call one ourselves."""
    d = json.loads(body.decode("utf-8-sig"))
    items = d.get("data") if isinstance(d, dict) else None
    if not isinstance(items, list):
        raise ValueError("scytl: no data list")
    if d.get("totalRecordCount") is not None and d["totalRecordCount"] > len(items):
        raise ValueError("scytl: partial page (%d of %d); refusing" % (len(items), d["totalRecordCount"]))
    state = (src.get("state") or "").lower()
    unit = src.get("unit") or "reporting units"
    out, seen = [], set()
    for it in items:
        opts = (it.get("summaryResults") or {}).get("ballotOptions") or []
        title = _en(it.get("name"))
        if not title or not opts:
            continue
        if "/ " in title and re.search(r"\b(Distrito|Para la|Senador)\b", title):
            title = title.split("/ ")[0].strip()
        yn = {_en(o.get("name")).lower() for o in opts} <= {"yes", "no", "si", "sí"}
        measure = it.get("contestType") == "BallotMeasure" or bool(it.get("referendum")) or yn
        sen, hse = bool(RE_US_SEN.match(title)), bool(RE_US_HOUSE.match(title))
        m = re.search(r"District\s+(\d+)|\((\d+)(?:st|nd|rd|th) District\)", title)
        district = (m.group(1) or m.group(2)) if m else None
        if sen:
            office, shown, level = "U.S. Senate", "U.S. Senate", "federal"
        elif hse:
            office = "U.S. House"
            shown = "U.S. House District " + district if district else "U.S. House"
            level = "federal"
        else:
            office, shown = title, title
            level = "state" if RE_STATE_LEVEL.search(title) else "local"
        if measure:
            kind = "judicial" if re.search(r"\b(judge|justice|retention)\b", title, re.I) else "measure"
        elif level == "local":
            kind = "local"
        else:
            kind = "candidate"
        cid = slug(state + "-" + title)
        n = 2
        while cid in seen:
            cid = slug(state + "-" + title)[:70] + "-" + str(n)
            n += 1
        seen.add(cid)
        rs = it.get("reportingStatus") or {}
        vf = re.search(r"\d+", _en(it.get("voteFor")))
        c = {"id": cid, "kind": kind, "level": level, "state": state, "office": office,
             "district": district if (sen or hse) else None, "title": shown,
             "vote_for": int(vf.group()) if vf else 1, "choices": [],
             "precincts": {"reporting": to_int(rs.get("reportingUnits")), "total": to_int(rs.get("totalUnits")), "unit": unit}}
        cids = set()
        for o in opts:
            name = _en(o.get("name"))
            pt = o.get("party") or {}
            abbr = _en(pt.get("abbreviation")) or _en(pt.get("name"))
            if abbr:
                name = re.sub(r"\s*\(" + re.escape(abbr) + r"\)\s*$", "", name)
            oid = slug(name) or "option"
            if oid in cids:
                oid = oid + "-" + str(o.get("nativeId") or len(cids))
            cids.add(oid)
            ch = {"id": oid, "name": name, "party": abbr or None, "party_code": party_code(abbr),
                  "votes": max(0, to_int(o.get("voteCount")))}
            c["choices"].append(ch)
            if o.get("isWinner") is True:
                c["called"] = {"winner": oid, "by": src.get("name", "source"), "at": None}
        if level != "local" and src.get("counties", True) and len([1 for x in out if x.get("counties")]) < int(src.get("county_max", 60)):
            _scytl_counties(src, c, it.get("id"))
        out.append(c)
        if sen or hse:
            f = json.loads(json.dumps(c))
            f["_scope"] = "senate" if sen else "house"
            out.append(f)
    return out


def a_ca_sos_json(body, src):
    """California Secretary of State api.sos.ca.gov/returns/<race> JSON. The source lists many race urls ("urls");
    the collector fetches each and hands this adapter a JSON list of {"url", "body"}. Nothing is called here:
    this feed has no winner flag, so California contests are never marked called."""
    out = []
    for part in json.loads(body.decode("utf-8")):
        try:
            d = json.loads(part["body"])
        except ValueError:
            continue
        url = part["url"]
        title = str(d.get("raceTitle") or "").split(" - ")[0].strip()
        m = re.search(r"\(([\d,]+) of ([\d,]+)\)", str(d.get("Reporting") or ""))
        prec = {"reporting": to_int(m.group(1)) if m else 0, "total": to_int(m.group(2)) if m else 0, "unit": "precincts"}
        base = slug("ca-" + url.split("/returns/")[-1])
        house = bool(re.match(r"U\.S\. House", title))
        if isinstance(d.get("candidates"), list):
            ch = []
            for x in d["candidates"]:
                nm = str(x.get("Name") or "").strip()
                if nm:
                    ch.append({"id": slug(nm) or "option", "name": nm, "party": x.get("Party") or None,
                               "party_code": party_code(x.get("Party")), "votes": to_int(x.get("Votes"))})
            if ch:
                c = {"id": base, "kind": "candidate", "level": "federal" if house else "state", "state": "ca",
                     "office": "U.S. House" if house else title, "district": (re.search(r"District (\d+)", title) or [None, None])[1] if house else None,
                     "title": title, "vote_for": 1, "choices": ch, "precincts": prec}
                out.append(c)
                if house:
                    f = json.loads(json.dumps(c)); f["_scope"] = "house"; out.append(f)
            continue
        for key, items in d.items():
            if not isinstance(items, list) or not items or "yesVotes" not in items[0]:
                continue
            judge = key in ("supreme-court", "court-of-appeal") or "Court" in title
            for it in items:
                nm = str(it.get("Name") or "").strip()
                num = str(it.get("Number") or "").strip()
                label = ("Proposition %s: %s" % (num.lstrip("0") or num, nm)) if num else (title + ": " + nm)
                out.append({"id": slug(base + "-" + (num or nm)), "kind": "judicial" if judge else "measure", "level": "state",
                            "state": "ca", "office": label, "district": None, "title": label, "text": nm, "vote_for": 1,
                            "choices": [{"id": "yes", "name": "Yes", "party": None, "party_code": "O", "votes": to_int(it.get("yesVotes"))},
                                        {"id": "no", "name": "No", "party": None, "party_code": "O", "votes": to_int(it.get("noVotes"))}],
                            "precincts": prec})
    return out


def a_ncsbe_pct(body, src):
    """North Carolina State Board of Elections results_pct zip: one tab-separated row per precinct, contest and choice.
    Votes are summed over precincts by contest name and choice. The file has no winner flag, so nothing is called."""
    if body[:2] == b"PK":
        body = unzip_first(body, (".txt", ".csv"))
    lines = body.decode("latin-1").split("\n")
    hdr = lines[0].rstrip("\r").split("\t")
    ix = {n: hdr.index(n) for n in ("Contest Type", "Contest Name", "Choice", "Choice Party", "Vote For", "Total Votes")}
    cix = hdr.index("County") if "County" in hdr else None
    contests, order = {}, []
    for ln in lines[1:]:
        if not ln.strip():
            continue
        r = ln.rstrip("\r").split("\t")
        if len(r) < len(hdr) - 1:
            continue
        title = r[ix["Contest Name"]].strip()
        name = r[ix["Choice"]].strip()
        if not title or not name:
            continue
        c = contests.get(title)
        if not c:
            up = title.upper()
            fed = up.startswith("US ")
            c = {"id": slug("nc-" + title), "kind": "candidate", "level": "federal" if fed else ("state" if r[ix["Contest Type"]] == "S" else "county"),
                 "state": "nc", "office": title.title() if title.isupper() else title, "district": None, "title": title.title() if title.isupper() else title,
                 "vote_for": to_int(r[ix["Vote For"]]) or 1, "choices": {}, "precincts": {}}
            m = re.search(r"DISTRICT (\d+)", up)
            if fed and m:
                c["district"] = str(int(m.group(1)))
            contests[title] = c
            order.append(title)
        ch = c["choices"].get(name)
        if not ch:
            party = r[ix["Choice Party"]].strip() or None
            ch = c["choices"][name] = {"id": slug(name) or "option", "name": name, "party": party, "party_code": party_code(party), "votes": 0}
        ch["votes"] += to_int(r[ix["Total Votes"]])
        if cix is not None and r[cix].strip():
            _cty_add(c, r[cix].strip().title(), ch["id"], to_int(r[ix["Total Votes"]]))
    out = []
    for t in order:
        c = contests[t]
        c["choices"] = list(c["choices"].values())
        _cty_finish(c)
        names = {x["name"].strip().lower() for x in c["choices"]}
        if names <= {"for", "against", "yes", "no"}:
            c["kind"] = "measure"
        elif c["level"] == "county":
            c["kind"] = "local"
        for x in c["choices"]:
            if x["party"] in ("DEM", "REP", "LIB", "GRE", "CST", "UNA", "NLB"):
                pass
        for k in ("office", "title"):
            c[k] = re.sub(r"^Us ", "U.S. ", c[k]).replace(" Id ", " ID ")
        out.append(c)
        if c["level"] == "federal":
            f = json.loads(json.dumps(c))
            f["_scope"] = "senate" if t.upper().startswith("US SENATE") else "house"
            out.append(f)
    return out


def _cty_add(c, county, ch_id, votes, precincts=None):
    """Per-county rows for the page: c["_cty"][county] = {"choices": {id: votes}, "precincts": {...}}; finished by _cty_finish."""
    k = c.setdefault("_cty", {}).setdefault(county, {"choices": {}, "precincts": None})
    if ch_id:
        k["choices"][ch_id] = k["choices"].get(ch_id, 0) + votes
    if precincts and not k["precincts"]:
        k["precincts"] = precincts


def _cty_finish(c):
    d = c.pop("_cty", None)
    if not d:
        return
    ids = [x["id"] for x in c["choices"]]
    c["counties"] = []
    for n, v in sorted(d.items()):
        row = {"name": n, "choices": [{"id": i, "votes": v["choices"].get(i, 0)} for i in ids]}
        if v["precincts"]:
            row["precincts"] = v["precincts"]
        c["counties"].append(row)


def a_fl_dos_tab(body, src):
    """Florida Division of Elections election-night tab file (one row per county, race and candidate).
    Votes are summed over counties; precincts are summed from each county's own count. The file has no winner flag."""
    rd = csv.DictReader(io.StringIO(body.decode("latin-1")), delimiter="\t")
    contests, order, seen_cty = {}, [], set()
    for r in rd:
        g = lambda k: (r.get(k) or "").strip()
        code, title = g("RaceCode"), g("RaceName")
        if not code or not title:
            continue
        key = code + "|" + title
        c = contests.get(key)
        if not c:
            fed = code in ("USS", "USR")
            kind = "measure" if code == "AMD" else ("judicial" if code in ("SCJ", "DCJ") or re.match(r"Shall (Justice|Judge)", title) else "candidate")
            c = {"id": slug("fl-" + code + "-" + title), "kind": kind,
                 "level": "federal" if fed else ("local" if code not in ("GOV", "ATG", "CFO", "AGR", "SCJ", "DCJ", "AMD", "STS", "STR") and not re.match(r"(State|Governor|Attorney|Chief|Commissioner)", title) else "state"),
                 "state": "fl", "office": title, "district": None, "title": title, "vote_for": 1, "choices": {},
                 "precincts": {"reporting": 0, "total": 0, "unit": "precincts"}}
            m = re.search(r"District (\d+)", title)
            if code == "USR" and m:
                c["district"] = m.group(1)
            contests[key] = c
            order.append(key)
        cname = g("CountyName").title()
        ck = (key, g("CountyCode"))
        if ck not in seen_cty:
            seen_cty.add(ck)
            c["precincts"]["total"] += to_int(g("Precincts"))
            c["precincts"]["reporting"] += to_int(g("PrecinctsReporting"))
        last, first, mid = g("CanNameLast"), g("CanNameFirst"), g("CanNameMiddle")
        name = " ".join(x for x in (first, mid, last) if x)
        if not name:
            continue
        party = g("PartyCode")
        party = None if party in ("", "NOP") else party
        ch = c["choices"].get(name)
        if not ch:
            ch = c["choices"][name] = {"id": slug(name) or "option", "name": name, "party": party, "party_code": party_code(party), "votes": 0}
        ch["votes"] += to_int(g("CanVotes"))
        if cname:
            _cty_add(c, cname, ch["id"], to_int(g("CanVotes")), {"reporting": to_int(g("PrecinctsReporting")), "total": to_int(g("Precincts"))})
    out = []
    for k in order:
        c = contests[k]
        c["choices"] = list(c["choices"].values())
        _cty_finish(c)
        if not c["choices"]:
            continue
        out.append(c)
        if c["level"] == "federal":
            f = json.loads(json.dumps(c))
            f["_scope"] = "senate" if k.startswith("USS") else "house"
            out.append(f)
    return out


def a_nist1622(body, src):
    """NIST 1622 election-results XML as published by Ohio ("SummaryContest"). The first VoteCounts in each selection is
    the statewide total (county totals follow). No winner flag is read, so nothing is called. Precincts are not given per contest."""
    root = ET.fromstring(body)
    loc = lambda e: e.tag.split("}")[-1]
    def kids(e, n):
        return [k for k in e if loc(k) == n]
    def text_of(e):
        for t in e.iter():
            if loc(t) == "LanguageString" and (t.text or "").strip():
                return t.text.strip()
        return ""
    gpu = {}
    for g in root.iter():
        if loc(g) == "GpUnit" and g.get("Type") == "County" and g.get("ObjectId"):
            gpu[g.get("ObjectId")] = (g.get("Name") or "").strip(), to_int(g.get("SubUnitsReported")), to_int(g.get("TotalSubUnits"))
    parties, cands = {}, {}
    for p in root.iter():
        if loc(p) == "Party":
            parties[p.get("ObjectId")] = (p.get("Abbreviation") or "").strip()
    for c in root.iter():
        if loc(c) == "Candidate" and c.get("ObjectId"):
            pid = (kids(c, "PartyId") or [None])[0]
            ab = parties.get(pid.text.strip()) if pid is not None and pid.text else ""
            cands[c.get("ObjectId")] = (text_of(kids(c, "BallotName")[0]) if kids(c, "BallotName") else "", None if ab in ("", "None") else ab)
    out = []
    for ct in root.iter():
        if loc(ct) != "Contest":
            continue
        title = (ct.get("Name") or "").strip()
        measure = (ct.get("{http://www.w3.org/2001/XMLSchema-instance}type") or "").endswith("BallotMeasureContest")
        ch = []
        cty = {}
        for bs in kids(ct, "BallotSelection"):
            vc = None
            for coll in kids(bs, "VoteCountsCollection"):
                for v in kids(coll, "VoteCounts"):
                    if v.get("Type") == "Total":
                        vc = to_int(v.get("Count"))
                        break
                break
            cvotes = {}
            for coll in kids(bs, "VoteCountsCollection"):
                for v in kids(coll, "VoteCounts"):
                    if v.get("Type") != "Total":
                        continue
                    gid = next((x.text.strip() for x in kids(v, "GpUnitId") if x.text), None)
                    if gid in gpu:
                        cvotes[gid] = cvotes.get(gid, 0) + to_int(v.get("Count"))
                break
            if vc is None:
                continue
            if measure:
                nm = (bs.get("Selection") or "").title()
                party = None
            else:
                ids = [i.text.strip() for i in kids(bs, "CandidateId") if i.text]
                names = [cands.get(i, ("", None))[0] for i in ids if cands.get(i, ("", None))[0]]
                nm = " / ".join(names) if names else ("Write-in" if bs.get("IsWriteIn") == "true" else "")
                party = (cands.get(ids[0], ("", None))[1] if ids else None)
            if not nm:
                continue
            ch.append({"id": slug(nm) or "option", "name": nm, "party": party, "party_code": party_code(party), "votes": vc})
            for gid, n in cvotes.items():
                cty.setdefault(gid, {})[ch[-1]["id"]] = n
        if len(ch) < 1:
            continue
        up = title.upper()
        fed = up.startswith("U.S.") or up.startswith("REPRESENTATIVE TO CONGRESS")
        m = re.search(r"District (\d+)", title)
        c = {"id": slug("oh-" + (ct.get("ObjectId") or title))[:60], "kind": "measure" if measure else ("judicial" if re.search(r"retain|retention", title, re.I) else "candidate"),
             "level": "federal" if fed else "state", "state": "oh", "office": title, "district": m.group(1) if (fed and m) else None,
             "title": title, "vote_for": to_int(ct.get("VotesAllowed")) or 1, "choices": ch, "precincts": {"reporting": 0, "total": 0}}
        if cty:
            c["_cty"] = {}
            for gid, by in cty.items():
                nm_, rp, tt = gpu[gid]
                c["_cty"][nm_] = {"choices": by, "precincts": {"reporting": rp, "total": tt} if tt else None}
            _cty_finish(c)
        # ids from ObjectId are unique per contest; keep readable ones stable across passes
        out.append(c)
        if fed:
            f = json.loads(json.dumps(c)); f["_scope"] = "senate" if up.startswith("U.S. SENATOR") else "house"; out.append(f)
    return out


ADAPTERS = {"csv": a_csv, "clarity-xml": a_clarity_xml, "scytl-json": a_scytl_json, "ca-sos-json": a_ca_sos_json, "ncsbe-pct": a_ncsbe_pct, "fl-dos-tab": a_fl_dos_tab, "nist1622": a_nist1622}


# ---------------------------------------------------------------- validation and merge
def validate_contest(c):
    errs = []
    for k in ("id", "kind", "title", "choices"):
        if not c.get(k):
            errs.append("missing " + k)
    if c.get("kind") not in ("measure", "candidate", "judicial", "local"):
        errs.append("bad kind %r" % c.get("kind"))
    ids = [x["id"] for x in c.get("choices", [])]
    if len(ids) != len(set(ids)):
        errs.append("duplicate choice ids")
    for x in c.get("choices", []):
        if not isinstance(x.get("votes"), int) or x["votes"] < 0:
            errs.append("bad votes for " + str(x.get("name")))
    p = c.get("precincts") or {}
    if p.get("total") and p.get("reporting", 0) > p["total"]:
        errs.append("precincts reporting exceed total")
    if c.get("called") and c["called"].get("winner") not in ids:
        errs.append("called winner is not a choice")
    return errs


def regression(old, new):
    """True if a contest's counted votes dropped by more than 5% (a bad scrape, not a normal correction)."""
    o = sum(x["votes"] for x in old["choices"])
    n = sum(x["votes"] for x in new["choices"])
    return o > 200 and n < o * 0.95


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")
    os.replace(tmp, path)


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def balance(out_dir, cfg):
    """Seats the sources have called, by party code. Never our own call."""
    res = {}
    for scope, label in (("house", "house"), ("senate", "senate")):
        d = read_json(os.path.join(out_dir, scope + ".json"), None)
        total = cfg.get("seats_expected", {}).get(scope)
        if not d or not total:
            continue
        cnt = {"D": 0, "R": 0, "O": 0}
        for c in d.get("contests", []):
            w = (c.get("called") or {}).get("winner")
            for x in c["choices"]:
                if x["id"] == w:
                    cnt[x.get("party_code", "O")] += 1
        cnt["U"] = max(0, total - sum(cnt.values()))
        cnt["note"] = "Called seats only. %d seats expected." % total
        res[label] = cnt
    return res


def balance_by_state(out_dir):
    """Per state: seats the source called, by party code, and races collected but not called yet."""
    res = {"schema": SCHEMA, "generated_at": now(), "house": {}, "senate": {}}
    for scope in ("house", "senate"):
        d = read_json(os.path.join(out_dir, scope + ".json"), None)
        for c in (d or {}).get("contests", []):
            st = (c.get("state") or "").lower()
            if not st:
                continue
            cnt = res[scope].setdefault(st, {"D": 0, "R": 0, "O": 0, "U": 0})
            w = (c.get("called") or {}).get("winner")
            hit = [x for x in c["choices"] if x["id"] == w]
            cnt[hit[0].get("party_code", "O") if hit else "U"] += 1
    return res


# ---------------------------------------------------------------- one pass
def run_once(cfg, out_dir, state_dir):
    os.makedirs(state_dir, exist_ok=True)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = read_json(mpath, {})
    prev_sources = {s["id"]: s for s in manifest.get("sources", [])}
    st_path = os.path.join(state_dir, "fetch-state.json")
    fstate = read_json(st_path, {})
    by_scope = {}
    log = []
    for src in cfg["sources"]:
        sid = src["id"]
        rec = dict(prev_sources.get(sid, {}))
        rec.update({"id": sid, "name": src["name"], "url": src.get("public_url", src["url"]), "checked_at": now()})
        st = fstate.setdefault(sid, {})
        try:
            ua = cfg.get("user_agent") or UA
            if src.get("urls"):
                body, lm, changed = fetch_many(src["urls"], ua), None, True
            else:
                body, lm, changed = fetch(resolve_url(src, ua), st, ua)
            if changed:
                contests = ADAPTERS[src["adapter"]](body, src)
                bad = [(c.get("id"), validate_contest(c)) for c in contests]
                bad = [b for b in bad if b[1]]
                if bad:
                    raise ValueError("invalid contests: %s" % bad[:3])
                if not contests:
                    rec["status"] = "waiting"
                    rec["note"] = "Source has no results yet."
                else:
                    routed = {}
                    for c in contests:
                        routed.setdefault(c.pop("_scope", None) or src["scope"], []).append(c)
                    for sc, cs in routed.items():
                        by_scope.setdefault(sc, []).append((src, cs))
                    rec["status"] = "ok"
                    rec["note"] = ""
                rec["data_updated_at"] = (lm and httpdate(lm)) or src.get("updated_at") or now()
            else:
                rec["status"] = "ok"
            rec.pop("error", None)
            log.append("%s ok%s" % (sid, "" if changed else " (not modified)"))
        except Exception as e:  # keep serving the last good copy; never publish a half-read file
            rec["status"] = "error"
            rec["note"] = "Last attempt failed; showing the last good copy."
            log.append("%s FAILED: %s" % (sid, e))
        prev_sources[sid] = rec

    for scope, parts in by_scope.items():
        path = os.path.join(out_dir, scope + ".json")
        old = read_json(path, {"contests": []})
        old_by_id = {c["id"]: c for c in old["contests"]}
        merged = dict(old_by_id)
        for src, contests in parts:
            for c in contests:
                o = old_by_id.get(c["id"])
                if o and regression(o, c):
                    log.append("%s: kept old copy of %s (votes dropped)" % (src["id"], c["id"]))
                    continue
                merged[c["id"]] = c
        data = {"schema": SCHEMA, "scope": scope, "label": cfg["scopes"].get(scope, scope),
                "source_ids": sorted({s["id"] for s, _ in parts} | set(old.get("source_ids", []))),
                "updated_at": now(), "certified": False, "contests": list(merged.values())}
        write_json(path, data)

    files = []
    for scope, label in cfg["scopes"].items():
        d = read_json(os.path.join(out_dir, scope + ".json"), None)
        if d:
            files.append({"scope": scope, "label": label, "path": scope + ".json",
                          "contests": len(d["contests"]), "updated_at": d.get("updated_at")})
    any_data = any(f["contests"] for f in files)
    mode = cfg.get("mode") or ("live" if any_data else "waiting")
    new_manifest = {"schema": SCHEMA, "election": cfg["election"], "generated_at": now(), "mode": mode,
                    "certified": False, "sources": list(prev_sources.values()), "files": files,
                    "balance": balance(out_dir, cfg)}
    write_json(mpath, new_manifest)
    write_json(os.path.join(out_dir, "balance.json"), balance_by_state(out_dir))
    write_json(st_path, fstate)
    return log


def httpdate(s):
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True, help="folder for manifest.json and scope files")
    ap.add_argument("--state", default=None, help="folder for the collector's own bookkeeping (default: next to config)")
    ap.add_argument("--loop", type=int, default=0, help="repeat every N seconds (0 = once)")
    a = ap.parse_args()
    cfg = read_json(a.config, None)
    if not cfg:
        sys.exit("cannot read config")
    state_dir = a.state or os.path.join(os.path.dirname(os.path.abspath(a.config)), ".state")
    while True:
        for line in run_once(cfg, a.out, state_dir):
            print(now(), line, flush=True)
        if not a.loop:
            break
        time.sleep(max(60, a.loop))


if __name__ == "__main__":
    main()
