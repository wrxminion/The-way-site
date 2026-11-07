"""Follow laws from the vote to the money (D208, Nov 2026). Standard library only. Public data only, no keys.

  python -I tools/money-trail/follow_laws.py pull  DATA_DIR    fetch, check and save one file per law
  python -I tools/money-trail/follow_laws.py build DATA_DIR    write site/money-trail/laws.js from the saved laws

Which laws: tools/money-trail/laws.json. Sources, all public:
  * Library of Congress bill record (govinfo.gov BILLSTATUS XML): title, public law number, date signed, sponsor,
    the official summary, and every floor action with its vote count.
  * House Clerk roll call XML: how each House member voted. Checked to be the same bill and the same count as the
    Library of Congress record before use.
  * D226: the sponsor and cosponsors with their Bioguide IDs (same Library of Congress bill record), and how each
    senator voted (senate.gov roll call XML, same checks as the House). Senate files name senators by their Senate
    (LIS) ID, so the congress-legislators list (unitedstates.github.io) turns that into the Bioguide ID. A senator
    whose ID cannot be turned into a Bioguide ID stops the Senate list for that law: nobody is matched by name.
    A Senate list that fails a check is left out and noted in report.json; the rest of the law still saves.
  * USAspending.gov: the spending code list, and the dollars tagged to each law's codes (given to agencies, promised,
    paid out, by agency, by account, and by recipient where a page counts only the law's dollars).
A law is saved only when every check passes. When a check fails, the last good file for that law stays and the
reason is written to DATA_DIR/report.json. Nothing is estimated: a value that is missing stays missing.
"""
import hashlib, html, json, os, re, sys, time, urllib.error, urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
UA = {"User-Agent": "michi-institute-money-web/1.0 (public records research)", "Accept": "*/*"}
US = "https://api.usaspending.gov/api/v2"
NOW = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def fetch(url, body=None, raw_path=None, tries=5, timeout=180):
    """Returns (status, text). Saves the raw reply next to the law's other raw files."""
    data = json.dumps(body).encode() if body is not None else None
    h = dict(UA)
    if data:
        h["Content-Type"] = "application/json"
    status, text = None, None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=timeout) as r:
                status, text = r.status, r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            status, text = e.code, e.read()[:600].decode("utf-8", "replace")
            if e.code in (400, 403, 404, 422):
                break
        except Exception as e:
            status, text = None, "%s: %s" % (type(e).__name__, e)
        time.sleep(15 * (attempt + 1))
    if raw_path:
        os.makedirs(os.path.dirname(raw_path), exist_ok=True)
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump({"url": url, "body": body, "status": status, "retrieved": NOW(), "text": text}, f)
    time.sleep(1)
    return status, text


def jget(url, body=None, raw_path=None, tries=5):
    s, t = fetch(url, body, raw_path, tries=tries)
    if s != 200:
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


# ---------- Library of Congress bill record ----------
BILL_KIND = {"hr": ("H R", "H.R.", "house-bill"), "s": ("S", "S.", "senate-bill")}
ORD = lambda n: "%d%s" % (n, "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th"))
HOUSE_FINAL = re.compile(r"^On (passage|motion (that the House |to )(suspend the rules and )?(pass|agree|concur))")
SENATE_FINAL = re.compile(r"^(Passed Senate|Senate (concurred|agreed to the House amendment))")


def usd(n):
    a = abs(n)
    return ("$%.2f trillion" % (a / 1e12)) if a >= 1e12 else ("$%.1f billion" % (a / 1e9)) if a >= 1e9 else ("$%.1f million" % (a / 1e6))


def plain(s):
    s = re.sub(r"<[^>]+>", " ", html.unescape(s or ""))
    return re.sub(r"\s+", " ", s).strip()


def summary_lead(b):
    sums = list(b.find("summaries") or [])
    if not sums:
        return None
    last = sorted(sums, key=lambda x: (x.findtext("actionDate") or "", x.findtext("updateDate") or ""))[-1]
    body = html.unescape(last.findtext("text") or "")
    # The first paragraph that is not the bold title line, word for word. A lead that runs into a list ("including for")
    # takes the list items with it, cut at a whole item.
    for m in re.finditer(r"<p>(.*?)</p>(\s*<ul>(.*?)</ul>)?", body, re.S):
        inner = m.group(1).strip()
        if re.fullmatch(r"<(b|strong)>.*</\1>", inner, re.S) or len(plain(inner)) < 40:
            continue
        lead = plain(inner)
        if not lead.endswith(".") and m.group(3):
            items = [plain(x).rstrip(";,. ") for x in re.findall(r"<li>(.*?)</li>", m.group(3), re.S)]
            out = lead
            for it in items:
                if len(out) + len(it) > 400:
                    out += "; …"
                    break
                out += (" " if out == lead else "; ") + it
            lead = out if out.endswith("…") else out + "."
        elif len(lead) > 420:
            cut = lead[:420].rfind(". ")
            lead = lead[:cut + 1] if cut > 100 else lead[:420].rsplit(" ", 1)[0] + "…"
        return {"text": lead, "version": last.findtext("actionDesc"), "date": last.findtext("actionDate")}
    return None


def final_votes(b):
    """The last passage or agreement action in each chamber, with its count, from the bill record."""
    out = {}
    # the chamber's own action sometimes lacks the vote link that the Library of Congress copy of it carries
    links = {(v.findtext("chamber"), v.findtext("rollNumber")): v.findtext("url") for v in b.iter("recordedVote")}
    for a in b.find("actions"):  # newest first
        src, t, d = a.findtext("sourceSystem/name"), (a.findtext("text") or "").strip(), a.findtext("actionDate")
        chamber = "house" if src == "House floor actions" and HOUSE_FINAL.search(t) else "senate" if src == "Senate" and SENATE_FINAL.search(t) else None
        if not chamber or chamber in out:
            continue
        v = {"date": d, "text": t, "roll": None, "totals": None, "how": None}
        rv = a.find("recordedVotes/recordedVote")
        if rv is not None:
            v["roll"], v["record_url"] = int(rv.findtext("rollNumber")), rv.findtext("url")
        m = re.search(r"(?:Yeas and Nays|recorded vote)(?: \(2/3 required\))?: (?:\(2/3 required\): )?(\d+) - (\d+)(?:, (\d+) Present)?", t)
        ms = re.search(r"Yea-Nay Vote\. (\d+) - (\d+)\. Record Vote Number: (\d+)", t)
        if m:
            v["totals"], v["how"] = {"Yea": int(m.group(1)), "Nay": int(m.group(2)), "Present": int(m.group(3) or 0)}, "roll call"
        elif ms:
            v["totals"], v["how"] = {"Yea": int(ms.group(1)), "Nay": int(ms.group(2))}, "roll call"
            v["roll"] = v["roll"] or int(ms.group(3))
        elif re.search(r"(?i)voice vote", t):
            v["how"] = "voice vote"
        elif re.search(r"(?i)unanimous consent|without objection", t):
            v["how"] = "unanimous consent"
        if v["roll"] and not v.get("record_url"):
            v["record_url"] = links.get((chamber.capitalize(), str(v["roll"])))
        v["question"] = re.split(r" (?:Agreed to|Passed|Failed) by | by (?:Yea-Nay|Voice|Unanimous)", t)[0]
        out[chamber] = v
    return out


def house_roll(law, v, raw_dir, checks, problems):
    """Members' votes from the House Clerk. Used only if it is the same bill and the same count."""
    url = v.get("record_url")
    if not url or "clerk.house.gov" not in url:
        problems.append("House roll call link missing from the bill record")
        return
    s, t = fetch(url, raw_path=os.path.join(raw_dir, "house_roll.json"))
    if s != 200:
        problems.append("House Clerk roll call %s not readable (%s)" % (v["roll"], s))
        return
    root = ET.fromstring(t.encode("utf-8"))
    m = root.find("vote-metadata")
    want = BILL_KIND[law["type"]][0] + " " + str(law["number"])
    got = re.sub(r"\s+", " ", m.findtext("legis-num", "")).strip()
    tv = m.find("vote-totals/totals-by-vote")
    tot = {"Yea": int(tv.findtext("yea-total")), "Nay": int(tv.findtext("nay-total")), "Present": int(tv.findtext("present-total")), "Not Voting": int(tv.findtext("not-voting-total"))}
    if got != want or m.findtext("congress") != str(law["congress"]) or int(m.findtext("rollcall-num")) != v["roll"]:
        problems.append("House roll %s is %s in Congress %s, not %s" % (v["roll"], got, m.findtext("congress"), want))
        return
    if (tot["Yea"], tot["Nay"]) != (v["totals"]["Yea"], v["totals"]["Nay"]):
        problems.append("House roll %s count %s-%s differs from the bill record %s-%s" % (v["roll"], tot["Yea"], tot["Nay"], v["totals"]["Yea"], v["totals"]["Nay"]))
        return
    party = {}
    for tp in m.iter("totals-by-party"):
        party[tp.findtext("party")] = {"Yea": int(tp.findtext("yea-total")), "Nay": int(tp.findtext("nay-total")),
                                       "Present": int(tp.findtext("present-total")), "Not Voting": int(tp.findtext("not-voting-total"))}
    members = []
    for rv in root.iter("recorded-vote"):
        lg = rv.find("legislator")
        members.append([lg.get("name-id"), lg.get("unaccented-name") or lg.text, lg.get("party"), lg.get("state"), rv.findtext("vote")])
    v.update({"totals": tot, "by_party": party, "members": members, "question": m.findtext("vote-question") or v["question"],
              "result": m.findtext("vote-result"), "source": "https://clerk.house.gov/Votes/%s%d" % (m.findtext("action-date", "")[-4:], v["roll"]), "data": url})
    checks.append("House roll call %d (House Clerk) is %s and matches the Library of Congress count %d-%d" % (v["roll"], want, tot["Yea"], tot["Nay"]))


def people_of(b, tag):
    """D226: sponsors or cosponsors from the bill record: [Bioguide ID, name, party, state, date, original cosponsor]."""
    out = []
    for it in b.findall(tag + "/item"):
        bid = (it.findtext("bioguideId") or "").strip()
        if not re.match(r"^[A-Z][0-9]{6}$", bid) or (it.findtext("sponsorshipWithdrawnDate") or "").strip():
            continue
        nm = " ".join(x for x in [it.findtext("firstName"), it.findtext("middleName"), it.findtext("lastName")] if x and x.strip())
        out.append([bid, nm or it.findtext("fullName"), it.findtext("party"), it.findtext("state"), (it.findtext("sponsorshipDate") or "")[:10],
                    (it.findtext("isOriginalCosponsor") or "").lower() == "true"])
    return out


LIS = {}


def lis_map(data_dir):
    """D226: Senate (LIS) ID -> Bioguide ID, from the congress-legislators current and historical lists."""
    if LIS:
        return LIS
    for f in ("legislators-current.json", "legislators-historical.json"):
        d = jget("https://unitedstates.github.io/congress-legislators/" + f, raw_path=os.path.join(data_dir, "raw", f))
        for p in d or []:
            i = p.get("id") or {}
            if i.get("lis") and i.get("bioguide"):
                LIS[i["lis"]] = i["bioguide"]
    return LIS


def senate_roll(law, v, raw_dir, data_dir, checks, problems):
    """D226: how each senator voted, from senate.gov. Used only if it is the same vote and the same count."""
    url = v.get("record_url") or ""
    if "senate.gov" not in url or not url.endswith(".xml"):
        problems.append("Senate roll call link missing from the bill record")
        return
    s, t = fetch(url, raw_path=os.path.join(raw_dir, "senate_roll.xml"))
    if s != 200:
        problems.append("Senate roll call %s not readable (%s)" % (v["roll"], s))
        return
    root = ET.fromstring(t.encode("utf-8"))
    num, cong = int(root.findtext("vote_number") or 0), root.findtext("congress")
    yea, nay = int(root.findtext("count/yeas") or -1), int(root.findtext("count/nays") or -1)
    if num != v["roll"] or cong != str(law["congress"]):
        problems.append("Senate roll %s is vote %s in Congress %s" % (v["roll"], num, cong))
        return
    if (yea, nay) != (v["totals"]["Yea"], v["totals"]["Nay"]):
        problems.append("Senate roll %s count %s-%s differs from the bill record %s-%s" % (v["roll"], yea, nay, v["totals"]["Yea"], v["totals"]["Nay"]))
        return
    ids = lis_map(data_dir)
    members, missing = [], []
    for m in root.iter("member"):
        lis = (m.findtext("lis_member_id") or "").strip()
        bid = ids.get(lis)
        if not bid:
            missing.append(lis or m.findtext("member_full") or "?"); continue
        members.append([bid, m.findtext("last_name"), m.findtext("party"), m.findtext("state"), m.findtext("vote_cast")])
    if missing:
        problems.append("Senate roll %s: no Bioguide ID for %s, so no senator list" % (v["roll"], ", ".join(missing[:5])))
        return
    v.update({"members": members, "data": url})
    checks.append("Senate roll call %d (senate.gov) matches the Library of Congress count %d-%d; %d senators matched by ID" % (v["roll"], yea, nay, len(members)))


# ---------- USAspending ----------
def code_list(data_dir):
    d = jget(US + "/references/def_codes/", raw_path=os.path.join(data_dir, "raw", "def_codes.json"))
    return {c["code"]: c for c in (d or {}).get("codes") or []}


def spending(law, raw_dir):
    flt = {"def_codes": law["codes"]}
    pg = lambda: {"limit": 100, "page": 1, "sort": "obligation", "order": "desc"}
    r = {"overview": jget(US + "/disaster/overview/?def_codes=" + ",".join(law["codes"]), raw_path=os.path.join(raw_dir, "overview.json"), tries=3)}
    for name, url, kind in (("agencies", "/disaster/agency/spending/", "total"), ("accounts", "/disaster/federal_account/spending/", "total")):
        r[name] = jget(US + url, {"filter": flt, "spending_type": kind, "pagination": pg()}, os.path.join(raw_dir, name + ".json"))
    return r


def recipients_disaster(law, raw_dir):
    d = jget(US + "/disaster/recipient/spending/", {"filter": {"def_codes": law["codes"]}, "spending_type": "award",
             "pagination": {"limit": 100, "page": 1, "sort": "obligation", "order": "desc"}}, os.path.join(raw_dir, "recipients.json"))
    if not d:
        return None
    rows = [{"description": x.get("description"), "code": x.get("code"), "id": next((i for i in (x.get("id") or []) if str(i).endswith("-C")), (x.get("id") or [None])[0]),
             "obligation": x.get("obligation"), "outlay": x.get("outlay"), "award_count": x.get("award_count")} for x in d.get("results") or []]
    rows = [x for x in rows if (x["obligation"] or 0) > 0][:25]
    plain_names = {"REDACTED DUE TO PII": "Individual people (USAspending withholds their names for privacy)",
                   "MULTIPLE RECIPIENTS": "Many recipients reported together (USAspending groups them)"}
    for x in rows:
        x["description"] = plain_names.get((x["description"] or "").strip().upper(), x["description"])
    t = d.get("totals") or {}
    return {"rows": rows, "note": "The %d recipients with the most award money tagged to this law, from USAspending's disaster recipient page, which counts only this law's tagged dollars." % len(rows),
            "shown_total": round(sum(x["obligation"] for x in rows), 2), "all_award_obligation": t.get("obligation"), "all_award_count": t.get("award_count")}


def recipients_infrastructure(law, raw_dir):
    """The disaster recipient page returns zero for the infrastructure codes, so rank the largest awards by the
    dollars tagged to the law ("Infrastructure Obligations"): contracts, grants, loans and other aid, two pages each.
    A kind the search refuses is skipped and left out of the note."""
    fields = ["Award ID", "Recipient Name", "Recipient UEI", "recipient_id", "Awarding Agency", "Infrastructure Obligations",
              "Infrastructure Outlays", "Description", "Place of Performance State Code", "generated_internal_id"]
    groups = {"contracts": ["A", "B", "C", "D"], "grants": ["02", "03", "04", "05"], "loans": ["07", "08"], "direct payments": ["06", "10"], "other aid": ["09", "11"]}
    awards, got = {}, []
    for g, types in groups.items():
        for page in (1, 2):
            body = {"filters": {"def_codes": law["codes"], "award_type_codes": types, "time_period": [{"start_date": law.get("start", "2008-10-01"), "end_date": time.strftime("%Y-%m-%d")}]},
                    "fields": fields, "sort": "Infrastructure Obligations", "order": "desc", "limit": 100, "page": page, "spending_level": "awards"}
            d = jget(US + "/search/spending_by_award/", body, os.path.join(raw_dir, "awards_%s_%d.json" % (g, page)))
            if not d:
                break  # this kind of award is not searchable this way; the note names the kinds that were counted
            if page == 1:
                got.append(g)
            for a in d.get("results") or []:
                awards.setdefault(a.get("generated_internal_id"), a)
    if not got:
        return None
    by = {}
    for a in awards.values():
        ob = a.get("Infrastructure Obligations") or 0
        if ob <= 0:
            continue
        key = a.get("Recipient UEI") or a.get("Recipient Name")
        r = by.setdefault(key, {"description": a.get("Recipient Name"), "code": a.get("Recipient UEI"), "id": a.get("recipient_id"), "obligation": 0, "outlay": 0, "award_count": 0})
        r["obligation"] = round(r["obligation"] + ob, 2)
        r["outlay"] = round(r["outlay"] + (a.get("Infrastructure Outlays") or 0), 2)
        r["award_count"] += 1
    rows = sorted(by.values(), key=lambda r: -r["obligation"])
    return {"rows": rows[:60], "note": "From the %d largest awards (%s) ranked by the dollars tagged to the law. Not every award is counted." % (len(awards), ", ".join(got)),
            "shown_total": round(sum(r["obligation"] for r in rows), 2), "all_award_obligation": None, "all_award_count": None}


# ---------- one law ----------
def follow(law, codes, data_dir):
    key = law["key"]
    raw_dir = os.path.join(data_dir, "raw", key)
    checks, problems = [], []
    kind = BILL_KIND[law["type"]]
    bs_url = "https://www.govinfo.gov/bulkdata/BILLSTATUS/%d/%s/BILLSTATUS-%d%s%d.xml" % (law["congress"], law["type"], law["congress"], law["type"], law["number"])
    s, t = fetch(bs_url, raw_path=os.path.join(raw_dir, "billstatus.json"))
    if s != 200:
        return None, ["Library of Congress bill record not readable (%s)" % s], checks
    b = ET.fromstring(t.encode("utf-8")).find("bill")
    if b.findtext("congress") != str(law["congress"]) or b.findtext("number") != str(law["number"]) or b.findtext("type", "").lower() != law["type"]:
        return None, ["bill record is not %s %d" % (kind[1], law["number"])], checks
    pls = [i.findtext("number") for i in (b.find("laws") or []) if i.findtext("type") == "Public Law"]
    if len(pls) != 1:
        return None, ["bill record lists %d public laws" % len(pls)], checks
    pl = "P.L. " + pls[0]
    signed = next((a.findtext("actionDate") for a in b.find("actions") if (a.findtext("text") or "").startswith("Became Public Law No: " + pls[0])), None)
    checks.append("Library of Congress record: %s %d became %s on %s" % (kind[1], law["number"], pl, signed))
    # every spending code must belong to this law and only this law
    labels = []
    for c in law["codes"]:
        rec = codes.get(c)
        if not rec:
            problems.append("spending code %s is not on USAspending's list" % c); continue
        p = rec.get("public_law") or ""
        if "|" in p or not re.search(r"\bP\.L\. %s$" % re.escape(pls[0]), p):
            problems.append("spending code %s is for '%s', not only %s" % (c, p, pl)); continue
        labels.append(p)
        checks.append("USAspending spending code %s is %s (%s)" % (c, p, rec.get("title")))
    lt = next((u for c in law["codes"] for u in (codes.get(c) or {}).get("urls") or []), None)
    out = {"key": key, "slug": "%s-%d" % (law["type"], law["number"]), "name": b.findtext("title"), "bill": "%s %d" % (kind[1], law["number"]),
           "congress": law["congress"], "public_law": pl, "signed": signed, "codes": law["codes"], "code_labels": labels, "code_note": law.get("code_note"),
           "sponsor": b.findtext("sponsors/item/fullName"), "summary": summary_lead(b),
           "law_text": lt.replace("http://", "https://") if lt else None,
           "bill_page": "https://www.congress.gov/bill/%s-congress/%s/%d" % (ORD(law["congress"]), kind[2], law["number"]),
           "bill_record": bs_url, "retrieved": NOW()}
    # votes
    votes = final_votes(b)
    for ch in ("house", "senate"):
        if ch not in votes:
            problems.append("no final %s vote found in the bill record" % ch)
    h = votes.get("house")
    if h and h["how"] == "roll call":
        house_roll(law, h, raw_dir, checks, problems)
    elif h:
        checks.append("House final action was by %s (no member-by-member record): %s" % (h["how"], h["text"][:120]))
    sv = votes.get("senate")
    if sv:
        sv["source"] = sv.get("record_url")
        checks.append("Senate final action %s: %s" % (sv["date"], sv["text"][:140]))
        if sv["how"] == "roll call":
            soft = []  # a Senate list that fails its checks is left out; the law's money still updates
            senate_roll(law, sv, raw_dir, data_dir, checks, soft)
            checks.extend("Senate members left out: " + x for x in soft)
    out["sponsors"], out["cosponsors"] = people_of(b, "sponsors"), people_of(b, "cosponsors")
    checks.append("Bill record: %d sponsor, %d cosponsors with Bioguide IDs" % (len(out["sponsors"]), len(out["cosponsors"])))
    out["votes"] = votes
    # money
    sp = spending(law, raw_dir)
    ov, at = sp["overview"], (sp["agencies"] or {}).get("totals") or {}
    if ov and ov.get("total_budget_authority") is not None:
        out["overview"] = {"total_budget_authority": ov.get("total_budget_authority"), **(ov.get("spending") or {})}
    else:
        # It times out now and then (502). The agency page's totals are not a safe stand-in: for some COVID-19 codes
        # its promised total is far from the summary's. So the law waits for the next pass or the next run.
        problems.append("USAspending overview not readable")
    if out.get("overview") and not (out["overview"]["total_budget_authority"] or 0) > 0:
        problems.append("USAspending shows no money for codes %s" % ",".join(law["codes"]))
    keep = ["code", "description", "obligation", "outlay", "total_budgetary_resources", "award_count"]
    for n in ("agencies", "accounts"):
        d = sp[n]
        if d is None:
            problems.append("USAspending %s not readable" % n); continue
        out[n] = [{k: x.get(k) for k in keep} for x in d.get("results") or []][:40]
    if out.get("overview") and out.get("agencies") and not out["overview"].get("from"):
        # The agency page and the summary page should agree on the money the law gave agencies. A small gap is
        # noted on the page; a gap over 10% means something is wrong with the pull, so the law is not saved.
        a_tbr, o_tbr = at.get("total_budgetary_resources") or 0, out["overview"]["total_budget_authority"] or 0
        if o_tbr and abs(a_tbr - o_tbr) / o_tbr > 0.10:
            problems.append("agency page budget authority %.0f differs from the summary page %.0f" % (a_tbr, o_tbr))
        elif o_tbr and abs(a_tbr - o_tbr) / o_tbr > 0.01:
            out["agency_tbr_note"] = "USAspending's agency list shows %s given to agencies, and its summary page shows %s. The summary figure is used above." % (usd(a_tbr), usd(o_tbr))
            checks.append("agency page budget authority %.2f billion vs summary %.2f billion (noted on the page)" % (a_tbr / 1e9, o_tbr / 1e9))
        else:
            checks.append("agency page and summary page agree on budget authority (%.2f billion)" % (o_tbr / 1e9))
        # For the COVID-19 codes the agency page's "promised" column adds to less than the summary page. Both are
        # USAspending's own numbers, so both are kept and the page says how far apart they are.
        a_sum, o_sum = at.get("obligation") or sum(x["obligation"] or 0 for x in out["agencies"]), out["overview"].get("total_obligations") or 0
        out["agency_promised_total"] = a_sum
        if o_sum and abs(a_sum - o_sum) / o_sum > 0.02:
            out["agency_gap_note"] = ("USAspending's agency list adds up to %s promised, %s the %s on its summary page for this law. "
                                      "Both are USAspending's own numbers; the agency list is shown as it reports it.") % (usd(a_sum), "less than" if a_sum < o_sum else "more than", usd(o_sum))
            checks.append("agency list promised %.1f billion vs summary %.1f billion (noted on the page)" % (a_sum / 1e9, o_sum / 1e9))
        else:
            checks.append("agency rows add to the USAspending total promised (%.1f billion)" % (o_sum / 1e9))
    rec = None
    if law["recipients"] == "disaster":
        rec = recipients_disaster(law, raw_dir)
    elif law["recipients"] == "infrastructure":
        rec = recipients_infrastructure(law, raw_dir)
    if law["recipients"] != "none" and rec is None:
        problems.append("USAspending recipients not readable")
    if rec:
        ao = (out.get("overview") or {}).get("award_obligations") or 0
        if ao and rec["shown_total"] > ao * 1.01:
            problems.append("recipients add to more than all award money")
        rec["all_award_obligation"] = rec["all_award_obligation"] or ao
    out["recipients"] = rec
    out["checks"] = checks
    return (None if problems else out), problems, checks


def pull(data_dir):
    cfg = json.load(open(os.path.join(HERE, "laws.json"), encoding="utf-8"))
    os.makedirs(os.path.join(data_dir, "laws"), exist_ok=True)
    codes = code_list(data_dir)
    report = {"started": NOW(), "laws": {}}
    if not codes:
        report["error"] = "USAspending spending code list not readable; nothing changed"
    todo = list(cfg["laws"]) if codes else []
    for attempt in (1, 2):  # a second pass, ten minutes later, for laws a busy server failed
        if attempt == 2:
            todo = [l for l in todo if not report["laws"][l["key"]]["saved"] and any("not readable" in p for p in report["laws"][l["key"]]["problems"])]
            if not todo:
                break
            time.sleep(600)
        for law in todo:
            try:
                out, problems, checks = follow(law, codes, data_dir)
            except Exception as e:
                out, problems, checks = None, ["%s: %s" % (type(e).__name__, e)], []
            dest = os.path.join(data_dir, "laws", law["key"] + ".json")
            if out:
                tmp = dest + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(out, f, ensure_ascii=False, indent=1)
                os.replace(tmp, dest)
            report["laws"][law["key"]] = {"saved": bool(out), "problems": problems, "checks": checks, "kept_old": (not out) and os.path.exists(dest), "pass": attempt}
            print(law["key"], "saved" if out else "NOT saved", "; ".join(problems)[:300], flush=True)
    report["finished"] = NOW()
    with open(os.path.join(data_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    return report


def build(data_dir):
    cfg = json.load(open(os.path.join(HERE, "laws.json"), encoding="utf-8"))
    laws = []
    for law in cfg["laws"]:
        p = os.path.join(data_dir, "laws", law["key"] + ".json")
        if os.path.exists(p):
            d = json.load(open(p, encoding="utf-8"))
            # the page shows 12 agencies and accounts and up to 25 recipients; the full lists stay in DATA_DIR
            d["agencies"], d["accounts"] = d["agencies"][:20], d["accounts"][:12]
            if d.get("recipients"):
                d["recipients"]["rows"] = d["recipients"]["rows"][:25]
            laws.append(d)
    out = {"built": NOW()[:10], "built_from": "Public records pulled by tools/money-trail/follow_laws.py", "laws": laws}
    body = json.dumps(out, separators=(",", ":"), ensure_ascii=False)
    dest = os.path.join(ROOT, "site", "money-trail", "laws.js")
    old = open(dest, encoding="utf-8").read() if os.path.exists(dest) else ""
    new = ("// Money Trail laws followed (D208, Nov 2026). Built by tools/money-trail/follow_laws.py from the Library of Congress\n"
           "// bill records, House Clerk roll calls and USAspending.gov. Do not edit by hand.\n"
           "window.TW_LAWS=" + body + ";\n")
    # the build date alone is not a change
    strip = lambda s: re.sub(r'"built":"[^"]*",', "", s)
    if strip(old) == strip(new):
        print("laws.js unchanged")
        return False
    with open(dest, "w", encoding="utf-8") as f:
        f.write(new)
    print("wrote", dest, len(new), "bytes,", len(laws), "laws, sha256", hashlib.sha256(new.encode()).hexdigest()[:12])
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("pull", "build"):
        sys.exit(__doc__)
    if sys.argv[1] == "pull":
        pull(sys.argv[2])
    else:
        build(sys.argv[2])
