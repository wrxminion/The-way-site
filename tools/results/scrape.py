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
def fetch(url, state):
    """Return (bytes, source_last_modified or None, changed). Uses ETag / Last-Modified when offered."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
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
    rd = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
    contests, order = {}, []
    for row in rd:
        g = lambda k: (row.get(col[k]) or "").strip()
        title = g("contest")
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
        for ch in ct:
            if ch.tag.split("}")[-1] != "Choice":
                continue
            name = pick(ch, "text", "name", "Name") or ""
            votes = to_int(pick(ch, "totalVotes", "TotalVotes", "votes"))
            if not votes:
                votes = sum(to_int(v.get("votes") or v.get("Votes")) for v in ch if v.tag.split("}")[-1] == "VoteType")
            party = pick(ch, "party", "Party")
            c["choices"].append({"id": slug(name), "name": name, "party": party, "party_code": party_code(party), "votes": votes})
        if c["choices"]:
            out.append(c)
    return out


ADAPTERS = {"csv": a_csv, "clarity-xml": a_clarity_xml}


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
            body, lm, changed = fetch(src["url"], st)
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
                    by_scope.setdefault(src["scope"], []).append((src, contests))
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
