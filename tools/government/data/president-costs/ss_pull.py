"""USAspending pull: who the Secret Service paid, every president (FY2008-FY2026).
Stdlib only. No keys. Run: python ss_pull.py   (writes into ./out/)
Step 1: bulk download of every U.S. Secret Service contract transaction, one fiscal year at a time.
Step 2: search awards from ANY agency to president-owned companies (Trump, Biden).
Step 3: summary by president: top payees overall, lodging payees, president-owned payees.
"""
import csv, io, json, os, re, sys, time, zipfile, urllib.request, urllib.error
from collections import defaultdict

API = "https://api.usaspending.gov/api/v2"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
csv.field_size_limit(10**9)
UA = {"Content-Type": "application/json", "User-Agent": "michiinstitute-research"}

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)
    with open(os.path.join(OUT, "log.txt"), "a", encoding="utf-8") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")

def req(method, url, body=None, tries=5):
    for i in range(tries):
        try:
            data = json.dumps(body).encode() if body is not None else None
            r = urllib.request.Request(url, data=data, headers=UA, method=method)
            with urllib.request.urlopen(r, timeout=300) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:500]
            log("HTTP", e.code, url, msg)
            if e.code in (400, 422):
                raise
        except Exception as e:
            log("ERR", url, repr(e))
        time.sleep(5 * (i + 1))
    raise RuntimeError("failed " + url)

def fetch(url, path):
    for i in range(5):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
            with urllib.request.urlopen(r, timeout=900) as resp, open(path, "wb") as f:
                while True:
                    b = resp.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            return
        except Exception as e:
            log("download ERR", repr(e))
            time.sleep(10 * (i + 1))
    raise RuntimeError("download failed " + url)

AGENCY = [{"type": "awarding", "tier": "subtier", "name": "U.S. Secret Service",
           "toptier_name": "Department of Homeland Security"}]

# ---------- Step 1: bulk download per fiscal year ----------
def bulk_year(fy):
    zpath = os.path.join(OUT, f"ss_contracts_fy{fy}.zip")
    if os.path.exists(zpath) and os.path.getsize(zpath) > 0:
        log("have", zpath); return zpath
    body = {"filters": {"prime_award_types": ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A",
                                               "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
                        "date_type": "action_date",
                        "date_range": {"start_date": f"{fy-1}-10-01", "end_date": f"{fy}-09-30"},
                        "agencies": AGENCY},
            "file_format": "csv"}
    j = req("POST", API + "/bulk_download/awards/", body)
    name, url = j.get("file_name"), j.get("file_url")
    log("FY", fy, "requested", name)
    for _ in range(360):
        s = req("GET", API + "/download/status/?file_name=" + name)
        st = s.get("status")
        if st == "finished":
            break
        if st == "failed":
            raise RuntimeError("download failed FY%s %s" % (fy, s.get("message")))
        time.sleep(10)
    fetch(s.get("file_url") or url, zpath)
    log("FY", fy, "saved", os.path.getsize(zpath), "bytes")
    return zpath

def rows_from_zip(zpath):
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            if not n.lower().endswith(".csv"):
                continue
            with z.open(n) as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace")):
                    yield n, row

# ---------- who was president on a date ----------
TERMS = [("2001-01-20", "George W. Bush"), ("2009-01-20", "Barack Obama"),
         ("2017-01-20", "Donald Trump (1st term)"), ("2021-01-20", "Joe Biden"),
         ("2025-01-20", "Donald Trump (2nd term)")]
def president(d):
    p = "before 2001"
    for start, who in TERMS:
        if d >= start:
            p = who
    return p

OWNED = [  # (label, owner, regex on recipient / parent name)
    ("Trump company", "Trump", r"\bTRUMP\b|MAR[- ]?A[- ]?LAGO|SLC TURNBERRY|GOLF RECREATION SCOTLAND|DJT |TRUMP NATIONAL|TRUMP INTERNATIONAL|SEVEN SPRINGS|DORAL"),
    ("Biden owned", "Biden", r"\bBIDEN\b"),
]
LODGING = re.compile(r"LODG|HOTEL|MOTEL|ROOM|SUITE|COTTAGE|ACCOMMODAT|RESORT|INN\b|VVIP", re.I)

def g(row, *keys):
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return ""

def money(x):
    try: return float(x)
    except: return 0.0

# ---------- Step 2: any agency -> president-owned companies ----------
OWNED_SEARCH = ["Trump", "Mar-a-Lago", "SLC Turnberry", "Golf Recreation Scotland", "Biden"]
def owned_awards():
    out = []
    groups = {"contracts": ["A", "B", "C", "D"], "idvs": ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"],
              "grants": ["02", "03", "04", "05"], "direct_payments": ["06", "10"],
              "loans": ["07", "08"], "other_assistance": ["09", "11"]}
    fields = ["Award ID", "Recipient Name", "Award Amount", "Start Date", "End Date", "Awarding Agency",
              "Awarding Sub Agency", "Description", "generated_internal_id", "Place of Performance City Code",
              "Place of Performance State Code", "Place of Performance Country Code"]
    for text in OWNED_SEARCH:
        for gname, codes in groups.items():
            page = 1
            while True:
                body = {"filters": {"recipient_search_text": [text], "award_type_codes": codes,
                                    "time_period": [{"start_date": "2007-10-01", "end_date": "2026-09-30"}]},
                        "fields": fields, "page": page, "limit": 100, "sort": "Award Amount", "order": "desc"}
                if gname == "loans":
                    body["fields"] = [("Loan Value" if x == "Award Amount" else x) for x in fields
                                      if x not in ("Start Date", "End Date")] + ["Issued Date"]
                    body["sort"] = "Loan Value"
                try:
                    j = req("POST", API + "/search/spending_by_award/", body)
                except Exception as e:
                    log("owned search fail", text, gname, e); break
                res = j.get("results", [])
                for r in res:
                    r["_search"] = text; r["_group"] = gname
                    r["_link"] = "https://www.usaspending.gov/award/" + str(r.get("generated_internal_id", ""))
                out.extend(res)
                if not j.get("page_metadata", {}).get("hasNext") or page >= 50:
                    break
                page += 1
            log("owned search", text, gname, "done")
    with open(os.path.join(OUT, "owned_awards_any_agency.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    return out

def main():
    years = list(range(2008, 2027))
    if len(sys.argv) > 1:
        years = [int(y) for y in sys.argv[1:]]
    zips = []
    for fy in years:
        try:
            zips.append(bulk_year(fy))
        except Exception as e:
            log("FY", fy, "FAILED", e)

    by_pres_payee = defaultdict(lambda: defaultdict(float))
    lodging_pres_payee = defaultdict(lambda: defaultdict(float))
    owned_rows, lodging_rows = [], []
    counts = defaultdict(int)
    totals = defaultdict(float)
    for zp in zips:
        for fname, row in rows_from_zip(zp):
            d = g(row, "action_date")[:10]
            amt = money(g(row, "federal_action_obligation"))
            who = president(d)
            payee = (g(row, "recipient_parent_name", "recipient_name") or "UNKNOWN").upper()
            name = g(row, "recipient_name").upper()
            desc = g(row, "transaction_description", "prime_award_base_transaction_description", "award_description")
            psc = g(row, "product_or_service_code")
            pscd = g(row, "product_or_service_code_description")
            counts[who] += 1; totals[who] += amt
            by_pres_payee[who][payee] += amt
            rec = {"president": who, "action_date": d, "amount": amt, "recipient": name, "parent": payee,
                   "description": desc, "psc": psc, "psc_desc": pscd,
                   "city": g(row, "primary_place_of_performance_city_name"),
                   "state": g(row, "primary_place_of_performance_state_code", "primary_place_of_performance_state_name"),
                   "country": g(row, "primary_place_of_performance_country_name", "primary_place_of_performance_country_code"),
                   "piid": g(row, "award_id_piid", "contract_award_unique_key"),
                   "link": g(row, "usaspending_permalink")}
            is_lodging = psc.upper().startswith("V23") or bool(LODGING.search(desc + " " + pscd))
            if is_lodging:
                lodging_pres_payee[who][payee] += amt; lodging_rows.append(rec)
            for label, owner, rx in OWNED:
                if re.search(rx, name + " " + payee, re.I):
                    r2 = dict(rec); r2["flag"] = label; owned_rows.append(r2)

    def write_csv(path, rows):
        if not rows: open(path, "w").close(); return
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    write_csv(os.path.join(OUT, "ss_lodging_transactions.csv"), lodging_rows)
    write_csv(os.path.join(OUT, "ss_president_owned_transactions.csv"), owned_rows)

    owned_any = owned_awards()

    summary = {"source": "USAspending.gov bulk_download/awards, awarding subtier U.S. Secret Service, contracts + IDVs, action_date FY%s-FY%s; pulled %s" % (years[0], years[-1], time.strftime("%Y-%m-%d")),
               "note": "Obligations as reported (can be negative for de-obligations). Purchases at or under the micro-purchase threshold are not in this data. President assigned by action_date.",
               "by_president": {}}
    for who in sorted(counts):
        top = sorted(by_pres_payee[who].items(), key=lambda x: -x[1])[:40]
        topl = sorted(lodging_pres_payee[who].items(), key=lambda x: -x[1])[:40]
        summary["by_president"][who] = {"transactions": counts[who], "obligations": round(totals[who], 2),
                                        "top_payees": [[p, round(a, 2)] for p, a in top],
                                        "top_lodging_payees": [[p, round(a, 2)] for p, a in topl],
                                        "lodging_total": round(sum(lodging_pres_payee[who].values()), 2)}
    summary["secret_service_to_president_owned"] = defaultdict(float)
    for r in owned_rows:
        summary["secret_service_to_president_owned"][r["president"] + " | " + r["flag"] + " | " + r["recipient"]] += r["amount"]
    summary["secret_service_to_president_owned"] = {k: round(v, 2) for k, v in sorted(summary["secret_service_to_president_owned"].items())}
    summary["any_agency_award_hits"] = len(owned_any)
    with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)
    log("DONE. Files in", OUT)

if __name__ == "__main__":
    main()
