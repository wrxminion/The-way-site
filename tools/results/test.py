#!/usr/bin/env python3
"""Dry run of the collector on the invented sample files. Run: python3 -I test.py"""
import json, os, shutil, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scrape

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
cfg = json.load(open("config.example.json"))
tmp = tempfile.mkdtemp()
out, st = os.path.join(tmp, "data"), os.path.join(tmp, "state")

def rd(n): return json.load(open(os.path.join(out, n)))
def check(c, msg):
    print(("ok   " if c else "FAIL ") + msg)
    if not c: check.bad += 1
check.bad = 0

scrape.run_once(cfg, out, st)
m = rd("manifest.json")
check(m["mode"] == "live" and all(s["status"] == "ok" for s in m["sources"]), "first pass: live, all sources ok")
co = rd("co.json")
check(len(co["contests"]) == 3 and any(c["kind"] == "measure" for c in co["contests"]), "Colorado: 3 contests incl. measures")
h = rd("house.json")
n_house = len(h["contests"])
check(m["balance"]["house"]["D"] == 1 and m["balance"]["house"]["R"] == 1 and m["balance"]["house"]["O"] == 1, "balance counts only source-called seats")
check(all("called" not in c for c in co["contests"]), "collector never calls a race itself")

b = rd("balance.json")
check(b["house"]["ca"] == {"D": 1, "R": 0, "O": 0, "U": 0} and b["house"]["co"]["U"] == 1 and b["senate"]["tx"]["R"] == 1, "balance.json: per-state called seats")

# a bad scrape must not replace good data: votes drop by more than 5%
bad = os.path.join(tmp, "bad.xml")
txt = open("sample/raw/co-clarity.xml").read().replace('totalVotes="412000"', 'totalVotes="1000"')
open(bad, "w").write(txt)
c2 = json.loads(json.dumps(cfg)); c2["sources"][0]["url"] = "file:" + bad
log = scrape.run_once(c2, out, st)
check(any("votes dropped" in l for l in log), "vote drop of more than 5% is rejected")
check(rd("co.json")["contests"][0]["choices"][0]["votes"] == 412000, "old good copy kept after rejection")

# unreadable source: old copy stays, source flagged
c3 = json.loads(json.dumps(cfg)); c3["sources"][1]["url"] = "file:/nonexistent.csv"
scrape.run_once(c3, out, st)
m = rd("manifest.json")
check([s for s in m["sources"] if s["id"] == "house-sample"][0]["status"] == "error" and len(rd("house.json")["contests"]) == n_house, "failed source flagged, last good copy kept")

# invalid contest (called winner not a choice, negative votes) is refused
open(os.path.join(tmp, "bad.csv"), "w").write("state,district,contest,choice,party,votes\nco,1,X,A,Democratic,-5\n")
c4 = json.loads(json.dumps(cfg)); c4["sources"][1]["url"] = "file:" + os.path.join(tmp, "bad.csv")
scrape.run_once(c4, out, st)
check(len(rd("house.json")["contests"]) == n_house, "invalid rows refused, old copy kept")
# Scytl "results/public" JSON (Georgia, Virginia): real shape, trimmed from the live sites on Nov 3 2026
ga, va = rd("state-ga.json"), rd("state-va.json")
check(len(ga["contests"]) == 5 and len(va["contests"]) == 4, "Scytl: Georgia 5 contests, Virginia 4 contests")
sen = [c for c in ga["contests"] if c["title"] == "U.S. Senate"][0]
check([x["votes"] for x in sen["choices"]] == [1001750, 1657684] and sen["precincts"]["reporting"] == 123 and sen["precincts"]["unit"] == "counties", "Scytl: Georgia Senate votes and counties reporting")
check(any(c["kind"] == "measure" for c in ga["contests"]) and all(c.get("kind") != "measure" or [x["name"] for x in c["choices"]] == ["Yes", "No"] for c in ga["contests"]), "Scytl: amendment is a measure with Yes/No")
check(any(c["kind"] == "local" for c in va["contests"]), "Scytl: Virginia town mayor race is local")
ssen, shouse = rd("senate.json"), rd("house.json")
check(any(c["state"] == "ga" and c["title"] == "U.S. Senate" for c in ssen["contests"]) and any(c["state"] == "va" for c in ssen["contests"]), "Scytl: U.S. Senate races copied to senate scope")
check(any(c["state"] == "va" and c["district"] == "2" for c in shouse["contests"]) and not any(c["title"].startswith("State House") for c in shouse["contests"]), "Scytl: U.S. House only (not State House) copied to house scope")
check(all("called" not in c for c in ga["contests"] + va["contests"]), "Scytl: nothing called when the source marks no winner")
check(all(len(c["choices"]) >= 2 for c in ga["contests"]) and all("(Rep)" not in x["name"] and "(Dem)" not in x["name"] for c in ga["contests"] for x in c["choices"]), "Scytl: party suffix removed from names")
check({x["party_code"] for x in sen["choices"]} == {"D", "R"}, "Scytl: party codes mapped")
# partial page is refused
pb = json.load(open("sample/raw/scytl-ga.json")); pb["totalRecordCount"] = 99
try:
    scrape.a_scytl_json(json.dumps(pb).encode(), {"state": "ga"}); check(False, "Scytl: partial page refused")
except ValueError:
    check(True, "Scytl: partial page refused")
# a winner flag from the source is carried, never invented
wb = json.load(open("sample/raw/scytl-ga.json")); wb["data"][0]["summaryResults"]["ballotOptions"][1]["isWinner"] = True
w = scrape.a_scytl_json(json.dumps(wb).encode(), {"state": "ga", "name": "Georgia Secretary of State"})[0]
check(w["called"]["winner"] == w["choices"][1]["id"] and w["called"]["by"] == "Georgia Secretary of State", "Scytl: source winner flag becomes called")
shutil.rmtree(tmp)
sys.exit(1 if check.bad else 0)
