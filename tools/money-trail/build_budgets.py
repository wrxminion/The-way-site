"""Build site/money-trail/budgets.js from the public budget pulls (D201, Nov 2026).

python3 -I tools/money-trail/build_budgets.py PULL1.json [PULL2.json]

PULL1 = budget_pull_results.json (USAspending agencies, Treasury Monthly Treasury Statement, Debt to the Penny).
PULL2 = budget_pull2_results.json (USAspending dollars tagged to P.L. 117-58, House and Senate votes).
Every number keeps the public URL it came from. Nothing is estimated; a value that is missing stays missing.
"""
import json, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p1 = json.load(open(sys.argv[1], encoding="utf-8"))
p2 = json.load(open(sys.argv[2], encoding="utf-8")) if len(sys.argv) > 2 else None
p3 = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else None
c1 = p1["calls"]
f = lambda v: None if v in (None, "null", "") else round(float(v), 2)

# 1. Department budgets
top = c1["toptier_agencies"]
deps = []
for a in top["data"]["results"]:
    code = a["toptier_code"]
    yrs = []
    br = (c1.get("budgetary_resources_" + code) or {}).get("data") or {}
    for y in br.get("agency_data_by_year") or []:
        if y.get("agency_budgetary_resources") is not None:
            yrs.append([y["fiscal_year"], f(y["agency_budgetary_resources"]), f(y.get("agency_total_obligated")), f(y.get("agency_total_outlayed"))])
    yrs.sort()
    deps.append({"code": code, "name": a["agency_name"], "abbr": a.get("abbreviation") or "", "slug": a.get("agency_slug") or "",
                 "fy": int(a["active_fy"]), "fq": int(a["active_fq"]), "resources": f(a["budget_authority_amount"]),
                 "obligated": f(a["obligated_amount"]), "outlays": f(a["outlay_amount"]),
                 "share": round(a["percentage_of_total_budget_authority"] or 0, 6), "years": yrs})
deps.sort(key=lambda d: (-(d["resources"] or 0), d["name"]))
fy = max(d["fy"] for d in deps)
fq = max(d["fq"] for d in deps if d["fy"] == fy)

# 2. Where federal money comes from: Monthly Treasury Statement Table 9, last month of the fiscal year in the file
t9 = c1["mts_table_9_summary"]
rows = t9["data"]["data"]
last = max(r["record_date"] for r in rows if r["record_calendar_month"] == "09")
rr = [r for r in rows if r["record_date"] == last]
seq = lambda r: [int(x) for x in r["sequence_number_cd"].split(".")]
receipts = [{"name": r["classification_desc"].rstrip(":"), "level": len(seq(r)), "fytd": f(r["current_fytd_rcpt_outly_amt"]), "prior": f(r["prior_fytd_rcpt_outly_amt"])}
            for r in sorted(rr, key=seq) if r["record_type_cd"] == "RSG"]
outlays = [{"name": r["classification_desc"], "fytd": f(r["current_fytd_rcpt_outly_amt"]), "prior": f(r["prior_fytd_rcpt_outly_amt"])}
           for r in sorted(rr, key=seq) if r["record_type_cd"] == "F"]
tot = {r["sequence_number_cd"]: r for r in rr if r["record_type_cd"] == "SL" and r["classification_desc"] == "Total"}
rec_total, out_total = f(tot["1.8"]["current_fytd_rcpt_outly_amt"]), f(tot["2.20"]["current_fytd_rcpt_outly_amt"])
# Social insurance has its parts listed under it; fill its total from its parts so the list adds up.
for i, r in enumerate(receipts):
    if r["fytd"] is None and r["level"] == 2:
        parts = [x for x in receipts[i + 1:] if x["level"] == 3]
        r["fytd"] = round(sum(x["fytd"] or 0 for x in parts), 2)
        r["prior"] = round(sum(x["prior"] or 0 for x in parts), 2)
        r["sum_of_parts"] = True
debt = c1["debt_to_penny"]["data"]["data"][0]
money_in = {"fiscal_year": int(rr[0]["record_fiscal_year"]), "through": last, "receipts": receipts, "receipts_total": rec_total,
            "outlays": outlays, "outlays_total": out_total, "gap": round(out_total - rec_total, 2),
            "source": "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/",
            "api": t9["url"].split("?")[0], "retrieved": t9["retrieved"],
            "debt": {"date": debt["record_date"], "total": f(debt["tot_pub_debt_out_amt"]), "public": f(debt["debt_held_public_amt"]),
                     "intragov": f(debt["intragov_hold_amt"]), "source": "https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/",
                     "retrieved": c1["debt_to_penny"]["retrieved"]}}

out = {"built_from": "Public pulls run on a Michi Institute computer, " + p1["started"][:10],
       "departments": {"fiscal_year": fy, "quarter": fq, "rows": deps, "retrieved": top["retrieved"],
                       "source": "https://www.usaspending.gov/agency", "api": top["url"]},
       "money_in": money_in, "law": None}

# 3. One law, followed: P.L. 117-58 (only from pull 2, which counts only the dollars tagged to the law)
if p2:
    c2 = p2["calls"]
    ok = lambda n: (c2.get(n) or {}).get("status") == 200
    codes = [d for d in c1["def_codes"]["data"]["codes"] if d["code"] in p2["def_codes"]]
    law = {"name": "Infrastructure Investment and Jobs Act", "bill": "H.R. 3684", "public_law": "P.L. 117-58", "codes": [d["code"] for d in codes],
           "code_labels": [d["public_law"] for d in codes], "law_text": "https://www.govinfo.gov/content/pkg/PLAW-117publ58/pdf/PLAW-117publ58.pdf",
           "bill_page": "https://www.congress.gov/bill/117th-congress/house-bill/3684", "retrieved": p2["started"]}
    if ok("overview"): law["overview"] = c2["overview"]["data"]
    def rows_of(n, keep):
        if not ok(n): return None
        d = c2[n]["data"]; r = d.get("results") or []
        return [{k: x.get(k) for k in keep} for x in r]
    law["agencies"] = rows_of("agency_total", ["id", "code", "description", "obligation", "outlay", "total_budgetary_resources", "award_count"])
    law["agencies_award"] = rows_of("agency_award", ["id", "code", "description", "obligation", "outlay", "award_count"])
    law["accounts"] = (rows_of("federal_account_total", ["id", "code", "description", "obligation", "outlay", "total_budgetary_resources"]) or [])[:40]
    # The award-level disaster pages return zero for this law's codes, so recipients come from pull 3:
    # the largest awards ranked by the dollars tagged to the law ("Infrastructure Obligations").
    law["recipients"] = None
    if p3:
        awards, kinds = {}, {}
        for n, rec in p3["calls"].items():
            if rec.get("status") != 200: continue
            kind = n.split("_")[0]
            for a in rec["data"].get("results") or []:
                if a.get("generated_internal_id") in awards: continue
                awards[a.get("generated_internal_id")] = a; kinds[a.get("generated_internal_id")] = kind
        by = {}
        for gid, a in awards.items():
            ob = a.get("Infrastructure Obligations") or 0
            if ob <= 0: continue
            key = a.get("Recipient UEI") or a.get("Recipient Name")
            r = by.setdefault(key, {"description": a.get("Recipient Name"), "code": a.get("Recipient UEI"), "id": a.get("recipient_id"),
                                    "obligation": 0, "outlay": 0, "award_count": 0, "kinds": [], "agencies": [], "states": [], "top_award": None})
            r["obligation"] = round(r["obligation"] + ob, 2); r["outlay"] = round(r["outlay"] + (a.get("Infrastructure Outlays") or 0), 2)
            r["award_count"] += 1
            for k, v in (("kinds", kinds[gid]), ("agencies", a.get("Awarding Agency")), ("states", a.get("Place of Performance State Code"))):
                if v and v not in r[k]: r[k].append(v)
            if not r["top_award"] or ob > r["top_award"][1]:
                r["top_award"] = [gid, ob, (a.get("Description") or "")[:160]]
        law["recipients"] = sorted(by.values(), key=lambda r: -r["obligation"])[:60]
        got = sorted({n.split("_")[0] for n, rec in p3["calls"].items() if rec.get("status") == 200})
        law["recipients_awards"] = len(awards)
        law["recipients_total"] = round(sum(r["obligation"] for r in by.values()), 2)
        law["recipients_count"] = len(by)
        law["recipients_kinds"] = got
        law["recipients_note"] = "From the %d largest awards (%s) ranked by the dollars tagged to the law. Not every award is counted." % (len(awards), ", ".join(got))
        law["recipients_retrieved"] = p3["started"]
    law["programs"] = None
    for n, k in (("state_obligation", "states_obligation"), ("state_outlay", "states_outlay")):
        if ok(n) and sum((x.get("amount") or 0) for x in c2[n]["data"].get("results") or []) > 0: law[k] = [{"code": x.get("shape_code"), "name": x.get("display_name"), "amount": x.get("amount"), "per_capita": x.get("per_capita")} for x in c2[n]["data"].get("results") or []]
    if ok("award_amount"): law["award_amount"] = c2["award_amount"]["data"]
    votes = {}
    # House roll call from the House Clerk's XML (pull 1). Checked to be H.R. 3684 before use.
    hx = (c1.get("house_roll_2021_369") or {})
    if hx.get("status") == 200:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(hx["data"].encode("utf-8"))
        m = root.find("vote-metadata")
        if m.findtext("legis-num", "").replace(" ", "") == "HR3684" and m.findtext("congress") == "117":
            party = {}
            for tp in m.iter("totals-by-party"):
                party[tp.findtext("party")] = {"Yea": int(tp.findtext("yea-total")), "Nay": int(tp.findtext("nay-total")),
                                               "Present": int(tp.findtext("present-total")), "Not Voting": int(tp.findtext("not-voting-total"))}
            tv = m.find("vote-totals/totals-by-vote")
            members = []
            for rv in root.iter("recorded-vote"):
                lg = rv.find("legislator")
                members.append([lg.get("name-id"), lg.get("unaccented-name") or lg.text, lg.get("party"), lg.get("state"), rv.findtext("vote")])
            votes["house"] = {"date": "2021-11-05", "date_text": m.findtext("action-date"), "question": m.findtext("vote-question"),
                              "result": m.findtext("vote-result"), "roll": int(m.findtext("rollcall-num")),
                              "totals": {"Yea": int(tv.findtext("yea-total")), "Nay": int(tv.findtext("nay-total")),
                                         "Present": int(tv.findtext("present-total")), "Not Voting": int(tv.findtext("not-voting-total"))},
                              "by_party": party, "members": members,
                              "source": "https://clerk.house.gov/Votes/2021369", "data": hx["url"]}
        else:
            print("SKIP House roll: not H.R. 3684")
    law["votes"] = votes
    out["law"] = law

dest = os.path.join(ROOT, "site", "money-trail", "budgets.js")
with open(dest, "w", encoding="utf-8") as fh:
    fh.write("// Money Trail budgets (D201, Nov 2026). Built by tools/money-trail/build_budgets.py from public USAspending,\n"
             "// Treasury and vote records. Do not edit by hand: rebuild from the pull files.\n")
    fh.write("window.TW_BUDGETS=" + json.dumps(out, separators=(",", ":"), ensure_ascii=False) + ";\n")
print("wrote", dest, os.path.getsize(dest), "bytes;", len(deps), "agencies; FY", fy, "Q", fq)
