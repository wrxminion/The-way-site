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
check([s for s in m["sources"] if s["id"] == "house-sample"][0]["status"] == "error" and len(rd("house.json")["contests"]) == 4, "failed source flagged, last good copy kept")

# invalid contest (called winner not a choice, negative votes) is refused
open(os.path.join(tmp, "bad.csv"), "w").write("state,district,contest,choice,party,votes\nco,1,X,A,Democratic,-5\n")
c4 = json.loads(json.dumps(cfg)); c4["sources"][1]["url"] = "file:" + os.path.join(tmp, "bad.csv")
scrape.run_once(c4, out, st)
check(len(rd("house.json")["contests"]) == 4, "invalid rows refused, old copy kept")
shutil.rmtree(tmp)
sys.exit(1 if check.bad else 0)
