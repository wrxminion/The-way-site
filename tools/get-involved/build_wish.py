#!/usr/bin/env python3
"""Builds site/get-involved/wish-we-had-this/index.html ("We wish we had this", D310, Nov 27 2026).

Public records that are hidden, partial or hard to get, each with a fact we could check and a button to the
letter tool (?issue=ID, issues in site/get-involved/contact-your-senator/issues-wish.js).

Rules (Frank, Nov 27 2026): every number comes from a real record we read, with its sources (two sources and one
official record where we could find them; when we could not, the card says so). Neutral "If you think ..." wording,
the same for every party. For a judge or any named person, say only what records show. Plain words, no em dashes.

To update: change CARDS below, then run  python tools/get-involved/build_wish.py  (no network, no keys).
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'site', 'get-involved', 'wish-we-had-this', 'index.html')
CHECKED = 'November 27, 2026'
HOUSE = '../contact-your-representative/?issue='
SENATE = '../contact-your-senator/?issue='


def e(s):
    return html.escape(s, quote=True)


def src(name, date, url):
    return (name, date, url)


# Sources
BOULDER_MEMO = src('City of Boulder, City Council agenda item 3G: $2,000,000 Franco settlement (official record)', 'June 21, 2022', 'https://webappsprod.bouldercolorado.gov/mailing-lists/mailman-archive/bouldercouncilhotline/attachments/20220617/54aed551/attachment.pdf')
BB_2022 = src('Boulder Beat: Stewart $1.3 million and Franco $2 million', 'July 15, 2022', 'https://boulderbeat.news/2022/07/15/police-payouts/')
BB_2021 = src('Boulder Beat: Mahan $875,000, from notes to city council', 'January 2, 2021', 'https://boulderbeat.news/2021/01/02/city-settles-with-man-tased-by-boulder-police-officer/')
IJ_2021 = src('Insurance Journal (Associated Press): Mahan $875,000, from a city staff memo', 'January 11, 2021', 'https://www.insurancejournal.com/news/west/2021/01/11/597018.htm')
WW_STEWART = src('Westword: Stewart $1.3 million, and Atkinson, Lawrence, Mahan and Franco', '2022', 'https://www.westword.com/news/boulder-pays-13-million-to-settle-coleman-stewart-police-shooting-lawsuit-14624473/')
WW_LAWRENCE = src('Westword: Lawrence $95,000 and Atkinson $125,000', '2022', 'https://www.westword.com/news/boulder-police-excessive-force-lawsuit-settlement-update-13163808/')
BRL_2024 = src('Boulder Reporting Lab: Cronin $1 million, Montoya $75,000, Lawrence $95,000, Atkinson $125,000', 'May 2, 2024', 'https://boulderreportinglab.org/?p=66559')
BW_2024 = src('Boulder Weekly: Cronin $1 million and Montoya $75,000, from a city memo', 'May 8, 2024', 'https://boulderweekly.com/news/boco-briefly-may-8-2024/')
MARSHALL = src('The Marshall Project, with NBC News: Colorado\'s 5 percent, up to $25,000 rule', 'December 18, 2020', 'https://www.themarshallproject.org/2020/12/18/colorado-tries-new-way-to-punish-rogue-cops')
KUNC = src('KUNC: liability insurance offered to Colorado officers', 'September 10, 2021', 'https://www.kunc.org/kunc/2021-09-10/company-pitches-liability-insurance-for-colorado-cops-following-passage-of-police-reform-law')
SB217 = src('Colorado General Assembly, SB20-217 (official record)', '2020', 'https://leg.colorado.gov/bills/sb20-217')
BJS = src('Bureau of Justice Statistics, National Law Enforcement Accountability Database (official record)', 'read ' + CHECKED, 'https://bjs.ojp.gov/national-law-enforcement-accountability-database')
NPR_NLEAD = src('NPR', 'February 28, 2025', 'https://www.npr.org/2025/02/28/nx-s1-5305281/trump-police-misconduct-database-background-checks')
CJ_GUIDE = src('Colorado Judicial Branch, access guide to public records (official record)', 'read ' + CHECKED, 'https://www.coloradojudicial.gov/access-guide-public-records')
COCOURTS = src('CoCourts (LexisNexis), price list', 'read ' + CHECKED, 'https://cocourts.com/cocourts/pricing.xhtml')
CFOIC = src('Colorado Freedom of Information Coalition', 'February 9, 2021', 'https://coloradofoic.org/heres-why-the-cost-of-a-statewide-cocourts-search-just-went-up-43-percent/')
BRENNAN = src('Brennan Center for Justice', 'May 7, 2025', 'https://www.brennancenter.org/our-work/research-reports/dark-money-hit-record-high-19-billion-2024-federal-races')
TPR = src('Texas Public Radio, The Source', 'July 29, 2026', 'https://www.tpr.org/podcast/the-source/2026-07-29/dark-money-becomes-a-formidable-force-in-american-elections')
JOFA = src('Journal of Accountancy: the 2020 IRS donor rule', 'May 27, 2020', 'https://www.journalofaccountancy.com/news/2020/may/irs-reporting-by-tax-exempt-organizations.html')
VENABLE = src('Venable LLP: the 2020 IRS donor rule', 'May 29, 2020', 'https://www.venable.com/insights/publications/2020/05/irs-issues-final-regulations-on-nonprofit-donor')
STRIPES = src('Stars and Stripes, opinion by Heather Lauer, People United for Privacy Foundation (the case for donor privacy)', 'January 6, 2025', 'https://www.stripes.com/opinion/2025-01-06/dark-money-not-the-boogeyman-16392703.html')
GAO_EAR = src('U.S. Government Accountability Office, GAO-26-107944 (official record)', 'July 16, 2026', 'https://www.gao.gov/products/gao-26-107944')
LEGIS1 = src('Legis1', 'July 21, 2026', 'https://legis1.com/news/congressional-earmarks-spending-return-with-catch')
RC_EAR = src('Roll Call: fiscal 2026 earmarks', 'February 17, 2026', 'https://rollcall.com/2026/02/17/earmarks-flood-spending-bills-after-a-years-hiatus/')
CASE_OMB = src('Court record, Protect Democracy Project v. OMB, No. 1:25-cv-01111 (D.D.C.), Civil Rights Litigation Clearinghouse (official record)', 'read ' + CHECKED, 'https://clearinghouse.net/case/46392/')
RC_APP = src('Roll Call', 'August 19, 2025', 'https://rollcall.com/2025/08/19/white-house-restores-spending-database-it-sought-to-keep-secret/')
GOVEXEC = src('Government Executive (States Newsroom)', 'July 21, 2025', 'https://www.govexec.com/management/2025/07/judge-orders-trump-administration-stop-violating-law-and-publish-spending-details/406876/')
ODNI = src('Office of the Director of National Intelligence, release 39-25 (official record)', 'October 31, 2025', 'https://www.odni.gov/4623/pr-39-25/')
EG_NIP = src('ExecutiveGov: $73.3 billion', 'November 3, 2025', 'https://www.executivegov.com/?p=278729')
EG_MIP = src('ExecutiveGov: Military Intelligence Program $27.8 billion', 'November 4, 2025', 'https://www.executivegov.com/articles/dod-fy2025-military-intelligence-program-budget')
FOX_LOGS = src('Fox News', 'February 11, 2025', 'https://www.foxnews.com/politics/white-house-not-release-visitor-logs-during-trumps-second-term')
PW_LOGS = src('Political Wire, citing the Washington Examiner', 'February 11, 2025', 'https://politicalwire.com/2025/02/11/white-house-will-not-release-visitor-logs/')
PBS_LOGS = src('PBS NewsHour (Associated Press): the 2017 decision and the 2009 to 2017 releases', 'April 14, 2017', 'https://www.pbs.org/newshour/nation/white-house-says-wont-release-visitor-records')
WH_VD = src('whitehouse.gov, Voluntary Disclosure Policy, the 2021 policy that is still posted (official record)', 'read ' + CHECKED, 'https://www.whitehouse.gov/VoluntaryDisclosure')
SKADDEN = src('Skadden, Arps, Slate, Meagher & Flom', 'February 6, 2025', 'https://www.skadden.com/insights/publications/2025/02/attorney-general-announces-shift-in-foreign-agents')
CYBERSCOOP = src('CyberScoop', 'February 6, 2025', 'https://cyberscoop.com/doj-disbands-foreign-influence-task-force/')
SALON = src('Salon', 'February 6, 2025', 'https://salon.com/2025/02/06/an-invitation-to-foreign-actors-bondi-tells-doj-to-quit-worrying-about-foreign-lobbying-campaigns')
FARA = src('U.S. Department of Justice, FARA eFile public filings (official record)', 'read ' + CHECKED, 'https://efile.fara.gov/ords/fara/f?p=1381:1')
LAW_13104 = src('The law: 5 U.S.C. 13104(a)(5)(A), Cornell Legal Information Institute (official record)', 'read ' + CHECKED, 'https://www.law.cornell.edu/uscode/text/5/13104')
LWV = src('League of Women Voters of the United States, paper on judges\' financial disclosure', 'undated, after 2023', 'https://my.lwv.org/sites/default/files/leagues/new-orleans/fjspolicypaperfinancialdisclosure1.pdf')
JEFS = src('U.S. Courts, Federal Judicial Financial Disclosure Reports (official record)', 'read ' + CHECKED, 'https://pub.jefs.uscourts.gov/')

BOULDER_COUNCIL = ('Contact Boulder City Council', 'https://bouldercolorado.gov/contact-city-council-and-staff')
CO_LAWMAKERS = ('Find your Colorado lawmakers', 'https://leg.colorado.gov/find-my-legislator')

CARDS = [
    {
        'id': 'boulder-police', 'where': 'Boulder, Colorado', 'group': 'local', 'issue': 'wish-police-payouts',
        'title': 'Police misconduct payouts',
        'num': '$5.47 million', 'numnote': 'in 7 settlements, 2020 to 2024',
        'hook': 'We have a record of at least $5,470,000 of Boulder tax dollars paid to settle lawsuits and claims about Boulder police from 2020 to 2024.',
        'gap': 'We found no single city list of these payments. We added them up from city council papers and news reports, so the real total may be higher.',
        'more': 'Under Colorado law, an officer who did not act in good faith may pay 5 percent of the damages, up to $25,000. The city pays the rest. In 2021 a company offered Colorado officers their own liability insurance for about $25 a month.',
        'if': 'If you think police should carry their own liability insurance, or that every city should post what it pays each year, contact your representatives and ask for it.',
        'local': [BOULDER_COUNCIL, CO_LAWMAKERS],
        'list_title': 'The 7 payments we could confirm in at least two sources',
        'list': [
            '2020: $125,000, Zayd Atkinson (Boulder Reporting Lab; Westword)',
            'January 2021: $875,000, Christopher Mahan (Boulder Beat, from notes to council; Insurance Journal, from a city staff memo)',
            'January 2022: $95,000, Sammie Lawrence (Boulder Reporting Lab; Westword)',
            'June 2022: $2,000,000, the estate of Seth Franco (City Council agenda item, the official record; Boulder Beat; Westword)',
            'July 2022: $1,300,000, Coleman Stewart (Boulder Beat; Westword)',
            'April 2024: $75,000, Joslynn Montoya, a claim about a sign language interpreter (Boulder Reporting Lab; Boulder Weekly)',
            'May 2024: $1,000,000, Benjamin Cronin (Boulder Reporting Lab; Boulder Weekly, from a city memo)',
            'Left out: a report of $220,000 for two 2019 cases had only one source.',
            'A settlement is not a finding that anyone broke the law. Each payment is listed as the records show it.',
        ],
        'sources': [BOULDER_MEMO, BB_2021, IJ_2021, BB_2022, WW_LAWRENCE, WW_STEWART, BRL_2024, BW_2024, MARSHALL, SB217, KUNC],
    },
    {
        'id': 'colorado-courts', 'where': 'Colorado', 'group': 'local', 'issue': None,
        'title': 'State court records',
        'num': '$10.50', 'numnote': 'to search every Colorado state court for one name',
        'hook': 'Colorado state court records are public, but the courts do not offer a case search on their own website. A statewide name search on CoCourts, a private company, costs $10.50.',
        'gap': 'In the courts\' own words: "Access to court records is not available directly through the Colorado Judicial Branch website." The documents themselves are not on the paid sites. You ask the court that has the case.',
        'more': 'The price was $10 in 2021, after a rise from $7.',
        'if': 'If you think Colorado court records should be free to search online, contact your Colorado lawmakers and ask for it. State courts are run by the state, so Congress cannot change this.',
        'local': [CO_LAWMAKERS],
        'sources': [CJ_GUIDE, COCOURTS, CFOIC],
    },
    {
        'id': 'police-database', 'where': 'National', 'group': 'national', 'issue': 'wish-police-payouts',
        'title': 'Federal police misconduct records',
        'num': 'Shut down', 'numnote': 'January 20, 2025',
        'hook': 'A federal database of misconduct records, commendations and awards for federal officers opened in December 2023. It was shut down when the order that created it was revoked on January 20, 2025.',
        'gap': 'There is no national public record of police misconduct cases or of what cities pay to settle them.',
        'more': 'NPR reported that without the database it is harder for agencies to catch job applicants with problems in their past. A separate list of decertified officers, run outside the federal government, still exists.',
        'if': 'If you think there should be a national record of police misconduct and payouts, contact your representatives and ask for it.',
        'note': 'We found two sources for this card, one of them the official record.',
        'sources': [BJS, NPR_NLEAD],
    },
    {
        'id': 'dark-money', 'where': 'National', 'group': 'national', 'issue': 'wish-dark-money',
        'title': 'Dark money donors',
        'num': '$1.9 billion', 'numnote': 'in 2024 federal races, a record',
        'hook': 'Groups that do not have to name their donors, like some nonprofits and shell companies, put $1.9 billion into 2024 federal races. That is about double the 2020 record of $1 billion.',
        'gap': 'Who gave the money. Since May 2020, tax-exempt groups other than charities and political groups do not even list big donors on their IRS forms. They keep the names and give them to the IRS only if asked.',
        'more': 'About $1.2 billion of it backed Democrats and about $664 million backed Republicans. People who favor donor privacy point to NAACP v. Alabama (1958), where the Supreme Court protected a group\'s member list.',
        'if': 'If you think voters should know who pays for election ads, contact your representatives and ask for it.',
        'note': 'The Federal Register page for the 2020 IRS rule would not open for our tools, so the rule is cited from two reports on it.',
        'sources': [BRENNAN, TPR, JOFA, VENABLE, STRIPES],
    },
    {
        'id': 'earmarks', 'where': 'National', 'group': 'national', 'issue': 'wish-earmarks',
        'title': 'Earmarks, followed to the end',
        'num': '$39 billion', 'numnote': 'for 20,000+ earmarked projects since 2022',
        'hook': 'Since 2022, Congress set aside about $39 billion for more than 20,000 earmarked projects back home. By September 30, 2024, about 16 percent of it had been paid out.',
        'gap': 'An easy way to follow each earmark from the bill to the money spent and what it built. Sixteen of 19 agencies told GAO they had problems that affected their oversight.',
        'more': 'For fiscal 2026, Congress has enacted nearly $15.5 billion more in earmarks.',
        'if': 'If you think every earmarked dollar should be tracked in public, contact your representatives and ask where your area\'s earmarks went.',
        'sources': [GAO_EAR, LEGIS1, RC_EAR],
    },
    {
        'id': 'spending', 'where': 'National', 'group': 'national', 'issue': 'wish-spending-detail',
        'title': 'How agencies get their money',
        'num': '5 months', 'numnote': 'offline in 2025, March to August',
        'hook': 'The White House budget office releases money to agencies in steps. A law says it must post each step online. It took the website down in March 2025, and it came back in August 2025 after a court order.',
        'gap': 'Spending detail from the agencies. On July 21, 2025, Judge Emmet Sullivan ruled the takedown broke the law. The government is appealing.',
        'more': 'The administration said posting meant sharing "sensitive, pre-decisional and deliberative information" and takes staff time.',
        'if': 'If you think spending decisions should be posted for everyone to see, whoever is President, contact your representatives and ask for it.',
        'sources': [CASE_OMB, RC_APP, GOVEXEC],
    },
    {
        'id': 'black-budget', 'where': 'National', 'group': 'national', 'issue': 'wish-black-budget',
        'title': 'The black budget',
        'num': '$73.3 billion', 'numnote': 'one number, fiscal 2025',
        'hook': 'The intelligence budget for fiscal 2025 was $73.3 billion. That one number is all the public was told. The Defense Department\'s separate intelligence budget was $27.8 billion, also with no detail.',
        'gap': 'Where the money goes, even totals by agency. The Director of National Intelligence said "there will be no other disclosures of currently classified NIP budget information."',
        'if': 'If you think more of the intelligence budget can be shown without risk, such as totals by agency, contact your representatives and ask for it.',
        'note': 'The $27.8 billion figure has one source, a report on the Defense Department\'s announcement.',
        'sources': [ODNI, EG_NIP, EG_MIP],
    },
    {
        'id': 'visitor-logs', 'where': 'National', 'group': 'national', 'issue': 'wish-visitor-logs',
        'title': 'White House visitor logs',
        'num': 'Not released', 'numnote': 'since January 2025',
        'hook': 'On February 11, 2025, the White House said it will not release visitor logs during President Trump\'s second term. It said a records law protects them until five years after the President leaves office.',
        'gap': 'Who visits the White House and whom they meet. Releases have changed with each President: from 2009 under Obama, stopped in 2017, again from 2021 under Biden, stopped in 2025.',
        'if': 'If you think every White House should release its visitor logs, whoever is President, contact your representatives and ask for it.',
        'sources': [FOX_LOGS, PW_LOGS, PBS_LOGS, WH_VD],
    },
    {
        'id': 'fara', 'where': 'National', 'group': 'national', 'issue': 'wish-fara',
        'title': 'Foreign lobbying (FARA)',
        'num': 'Feb. 5, 2025', 'numnote': 'when enforcement narrowed',
        'hook': 'People who lobby here for foreign governments must register, and their filings are public. Since February 5, 2025, the Justice Department brings criminal charges under the law only for "conduct similar to more traditional espionage by foreign government actors."',
        'gap': 'Who is working for foreign governments without registering. The same memo disbanded the FBI\'s Foreign Influence Task Force. The memo said the change frees resources for more pressing priorities.',
        'if': 'If you think the foreign agent law should be fully enforced again, contact your representatives and ask for it.',
        'note': 'The memo itself is described in three reports; the filings site is the official record.',
        'sources': [FARA, SKADDEN, CYBERSCOOP, SALON],
    },
    {
        'id': 'judges', 'where': 'National', 'group': 'national', 'issue': 'wish-judge-homes',
        'title': 'Judges\' homes and finances',
        'num': 'Not on the form', 'numnote': 'a judge\'s own home',
        'hook': 'When a federal judge buys or sells the home they live in, the law does not require it on their yearly financial report. Rental and investment property over $1,000 must be reported.',
        'gap': 'How big purchases like a home were paid for. To read judges\' reports online, you must register with your name and address each visit, and reports are destroyed six years after they are filed.',
        'if': 'If you think judges should report home purchases and how they paid for them, contact your representatives and ask for it.',
        'note': 'This card is about the rules, not about any one judge.',
        'sources': [LAW_13104, LWV, JEFS],
    },
]


def card(c):
    out = ['<article class="ww-card" id="%s">' % e(c['id'])]
    out.append('<p class="gw-eyebrow ww-where">%s</p><h3>%s</h3>' % (e(c['where']), e(c['title'])))
    out.append('<p class="ww-num">%s<small>%s</small></p>' % (e(c['num']), e(c['numnote'])))
    out.append('<p class="ww-hook">%s</p>' % e(c['hook']))
    out.append('<p class="ww-gap"><strong>What we wish we had:</strong> %s</p>' % e(c['gap']))
    if c.get('more'):
        out.append('<p class="ww-gap">%s</p>' % e(c['more']))
    out.append('<p class="ww-if">%s</p>' % e(c['if']))
    links = []
    if c['issue']:
        links.append('<a class="ww-go" href="%s%s">Contact your rep to ask for this →</a>' % (HOUSE, e(c['issue'])))
        links.append('<a href="%s%s">Write to your senators →</a>' % (SENATE, e(c['issue'])))
    for i, (t, u) in enumerate(c.get('local', [])):
        cls = ' class="ww-go"' if not c['issue'] and i == 0 else ''
        links.append('<a%s href="%s">%s ↗</a>' % (cls, e(u), e(t)))
    out.append('<p class="gv-links">%s</p>' % ' '.join(links))
    if c.get('list'):
        out.append('<details><summary>%s</summary><ul>%s</ul></details>' % (e(c['list_title']), ''.join('<li>%s</li>' % e(x) for x in c['list'])))
    srcs = ''.join('<li><a href="%s">%s, %s ↗</a></li>' % (e(u), e(n), e(d)) for n, d, u in c['sources'])
    note = ('<li>%s</li>' % e(c['note'])) if c.get('note') else ''
    out.append('<details><summary>Sources (%d)</summary><ul>%s%s</ul></details>' % (len(c['sources']), srcs, note))
    out.append('</article>')
    return ''.join(out)


HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#176b85">
<title>We wish we had this - The Way</title>
<meta name="description" content="{desc}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/pages-style.css?v=3">
<link rel="stylesheet" href="/members/waybar.css?v=29">
<link rel="stylesheet" href="/government-works.css?v=2">
<link rel="stylesheet" href="/government/government.css?v=8">
<link rel="stylesheet" href="/get-involved/get-involved.css?v=2">
<link rel="stylesheet" href="/get-involved/wish-we-had-this/wish.css?v=1">
<link rel="canonical" href="https://michiinstitute.com/get-involved/wish-we-had-this/">
<meta property="og:type" content="website">
<meta property="og:title" content="We wish we had this - The Way">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://michiinstitute.com/get-involved/wish-we-had-this/">
<meta property="og:site_name" content="The Way | Michi Institute">
<meta property="og:image" content="https://michiinstitute.com/og-logo.png">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<!-- Generated by tools/get-involved/build_wish.py. Do not edit by hand. -->
<header id="waybar" class="waybar" data-here="involved"><a class="wb-logo" href="/">The Way</a><nav class="wb-right" aria-label="Sign in"><a class="wb-pill" href="/members/">Sign in</a></nav></header>
<a class="gw-skip" href="#top">Skip to content</a><main class="gw gv gi" id="top">
'''

DESC = 'Public records we wish everyone could see: police settlement payouts, dark money donors, earmarks, the black budget, White House visitor logs and more. Each has a fact you can check and a way to ask your representatives for it.'


def main():
    loc = [c for c in CARDS if c['group'] == 'local']
    nat = [c for c in CARDS if c['group'] == 'national']
    body = [HEAD.replace('{desc}', e(DESC))]
    body.append('<nav class="crumbs" aria-label="Breadcrumb"><a href="/">The Way</a> / <a href="../">Get Involved</a> / We wish we had this</nav>')
    body.append('<header class="gv-hero"><p class="gw-eyebrow">Get Involved · Public records</p><h1>We wish we had this</h1>'
                '<p class="gv-lede">Some public records are hidden, only partly public, or hard to get. Here are %d we wish everyone could see. '
                'Each one has a fact we checked, with sources, and a button to ask the people who represent you for it. '
                'The letter tool lets you take either side. The Way does not take a side.</p></header>' % len(CARDS))
    body.append('<nav class="gi-jump" aria-label="On this page"><a href="#local">Boulder and Colorado</a><a href="#national">National</a><a href="#how">How we checked</a></nav>')
    body.append('<section class="gv-sec" id="local"><h2>Boulder and Colorado</h2><p>We start close to home, with Boulder. More cities and states will be added as we check their records.</p><div class="ww-grid">')
    body.extend(card(c) for c in loc)
    body.append('</div></section>')
    body.append('<section class="gv-sec" id="national"><h2>National</h2><div class="ww-grid">')
    body.extend(card(c) for c in nat)
    body.append('</div></section>')
    body.append('<section class="gv-sec" id="how"><h2>How we checked</h2>'
                '<p>Every number on this page comes from a record we read, listed under Sources on its card. We look for two sources and one official record for each number. When we found fewer, the card says so.</p>'
                '<p>A settlement, a filing or a rule is not proof that anyone did something wrong. We say only what the records show, and we write about every party the same way.</p>'
                '<p>The buttons open our letter tool with the issue picked. You pick your representative and your side, check the facts you want, and copy a letter or a call script. Nothing you type is saved or sent.</p>'
                '<p class="gw-status">Last checked %s. Records change; if one here is out of date, please tell us.</p></section>' % e(CHECKED))
    body.append('<nav class="gv-next" aria-label="Keep exploring"><a href="../">← Get Involved</a> · <a href="../contact-your-representative/">Contact Your Representative</a> · <a href="../contact-your-senator/">Contact Your Senator</a> · <a href="/money-trail/">Money Trail</a></nav>')
    body.append('</main><script src="/members/waybar.js?v=79" defer></script></body></html>\n')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(body))
    print('wrote', OUT, len(CARDS), 'cards')


if __name__ == '__main__':
    main()
