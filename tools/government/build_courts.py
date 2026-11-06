#!/usr/bin/env python3
"""Builds the federal courts layer of the Government page: site/government/courts/index.html

Run from the repo root:  python3 tools/government/build_courts.py

Justices, circuits and building facts are typed below from official pages, each with its source URL
and the date it was checked. The U.S. map reuses the state outlines already drawn for /lookup/.
"""
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import ROOT, SITE_URL, e, long_date, page  # noqa: E402

OUT = os.path.join(ROOT, 'site', 'government', 'courts')
CHECKED = 'November 6, 2026'
BIOS = 'https://www.supremecourt.gov/about/biographies.aspx'
MEMBERS = 'https://www.supremecourt.gov/about/members_text.aspx'
STRUCT = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure'
APPEALS = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure/about-us-courts-appeals'
LINKS = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure/court-website-links'
S41 = 'https://www.law.cornell.edu/uscode/text/28/41'
S44 = 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title28-section44&num=0&edition=prelim'
S1 = 'https://www.law.cornell.edu/uscode/text/28/1'
CONST = 'https://www.archives.gov/founding-docs/constitution-transcript'

# From the Supreme Court's members page, in the order it lists them (Chief Justice, then by oath date).
JUSTICES = [
    ('John G. Roberts, Jr.', 'Chief Justice of the United States', 'George W. Bush', '2005-09-29'),
    ('Clarence Thomas', 'Associate Justice', 'George H. W. Bush', '1991-10-23'),
    ('Samuel A. Alito, Jr.', 'Associate Justice', 'George W. Bush', '2006-01-31'),
    ('Sonia Sotomayor', 'Associate Justice', 'Barack Obama', '2009-08-08'),
    ('Elena Kagan', 'Associate Justice', 'Barack Obama', '2010-08-07'),
    ('Neil M. Gorsuch', 'Associate Justice', 'Donald J. Trump', '2017-04-10'),
    ('Brett M. Kavanaugh', 'Associate Justice', 'Donald J. Trump', '2018-10-06'),
    ('Amy Coney Barrett', 'Associate Justice', 'Donald J. Trump', '2020-10-27'),
    ('Ketanji Brown Jackson', 'Associate Justice', 'Joseph R. Biden, Jr.', '2022-06-30'),
]

# 28 U.S.C. 41 (states and territories) and 28 U.S.C. 44 (circuit judgeships).
CIRCUITS = [
    ('1', 'First Circuit', ['ME', 'MA', 'NH', 'RI'], ['Puerto Rico'], 6),
    ('2', 'Second Circuit', ['CT', 'NY', 'VT'], [], 13),
    ('3', 'Third Circuit', ['DE', 'NJ', 'PA'], ['Virgin Islands'], 14),
    ('4', 'Fourth Circuit', ['MD', 'NC', 'SC', 'VA', 'WV'], [], 15),
    ('5', 'Fifth Circuit', ['LA', 'MS', 'TX'], [], 17),
    ('6', 'Sixth Circuit', ['KY', 'MI', 'OH', 'TN'], [], 16),
    ('7', 'Seventh Circuit', ['IL', 'IN', 'WI'], [], 11),
    ('8', 'Eighth Circuit', ['AR', 'IA', 'MN', 'MO', 'NE', 'ND', 'SD'], [], 11),
    ('9', 'Ninth Circuit', ['AK', 'AZ', 'CA', 'ID', 'MT', 'NV', 'OR', 'WA', 'HI'], ['Guam'], 29),
    ('10', 'Tenth Circuit', ['CO', 'KS', 'NM', 'OK', 'UT', 'WY'], [], 12),
    ('11', 'Eleventh Circuit', ['AL', 'FL', 'GA'], [], 12),
    ('dc', 'D.C. Circuit', ['DC'], [], 11),
    ('fed', 'Federal Circuit', [], [], 12),
]
NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado',
    'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
    'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
}


def src(url, label):
    return '<a class="gw-source" href="%s">Source: %s ↗</a>' % (e(url), e(label))


def state_paths():
    """State outline paths from the /lookup/ page's US map (viewBox 0 0 975 610)."""
    s = open(os.path.join(ROOT, 'site', 'lookup', 'index.html'), encoding='utf-8').read()
    i = s.find('<svg class="sp-map"')
    svg = s[i:s.find('</svg>', i)]
    out = {}
    for attrs, inner in re.findall(r'<a ([^>]*)>(.*?)</a>', svg, re.S):
        st = re.search(r'data-st="(\w+)"', attrs).group(1)
        out[st] = ''.join(re.findall(r'<path[^>]*/?>(?:</path>)?', inner))
    return out


def circuit_map():
    paths = state_paths()
    of = {st: (cid, name) for cid, name, sts, _, _ in CIRCUITS for st in sts}
    parts = []
    for st, p in paths.items():
        cid, name = of[st]
        label = '%s: %s' % (NAMES[st], name)
        parts.append('<a href="#circuit-%s" class="gv-c%s" aria-label="%s"><title>%s</title>%s</a>' % (
            cid, cid, e(label), e(label), p))
    labels = {'1': (905, 140), '2': (838, 168), '3': (850, 235), '4': (815, 300), '5': (470, 470), '6': (720, 270),
              '7': (628, 225), '8': (500, 210), '9': (140, 250), '10': (330, 290), '11': (720, 450), 'dc': (900, 300)}
    tags = ''.join('<text x="%d" y="%d">%s</text>' % (x, y, c) for c, (x, y) in labels.items() if c != 'dc')
    tags += '</g><a href="#circuit-dc" class="gv-usmap-dc" aria-label="District of Columbia: D.C. Circuit"><text x="%d" y="%d">D.C.</text></a><g>' % labels['dc']
    return ('<svg class="gv-usmap" viewBox="0 0 975 610" role="group" aria-label="Map of the 12 regional federal circuits. '
            'Each state links to its circuit below.">%s<g class="gv-usmap-tags" aria-hidden="true">%s</g></svg>' % (''.join(parts), tags))


def main():
    today = datetime.date.today()

    def years_on(d):
        y = int((today - datetime.date.fromisoformat(d)).days // 365.25)
        return '%d year%s' % (y, '' if y == 1 else 's')

    jcards = []
    for name, title, by, took in JUSTICES:
        slug = re.sub(r'[^a-z]+', '-', name.lower().split(',')[0]).strip('-')
        jcards.append(
            '<li id="j-%s"><span class="gv-role">%s</span><strong>%s</strong>'
            '<details><summary>More</summary><div class="gw-detail"><p>Appointed by President %s. Took the judicial oath on %s, '
            'about %s on the Court.</p>%s</div></details></li>' % (
                slug, e(title), e(name), e(by), e(long_date(took)), e(years_on(took)), src(BIOS, 'Supreme Court biographies')))

    supreme = (
        '<section id="supreme-court" class="gv-sec"><div class="gw-heading"><span>Layer 2 / The top court</span>'
        '<h2>The Supreme Court.</h2><p>By law, the Court has a Chief Justice and eight associate justices. Any six make a quorum. '
        'Justices are nominated by the president, confirmed by the Senate, and serve during good behavior.</p></div>'
        '<ol class="gv-line gv-justices">%s</ol>'
        '<p>%s %s %s</p>'
        '<div class="gv-two"><figure class="gv-capitol"><svg viewBox="0 0 600 300" role="img" aria-labelledby="sc-t"><title id="sc-t">Simple '
        'diagram of the Supreme Court Building: a wide stairway leads to a row of columns under a triangular roof.</title>'
        '<path class="gv-cap-ground" d="M20 270h560"/><path class="gv-cap-wing" d="M90 270h420v-14H90Zm20-14h380v-12H110Z"/>'
        '<path class="gv-cap-center" d="M140 244h320V110H140Z"/><path class="gv-cap-dome" d="M128 110h344L300 50Z"/>'
        '<path class="gv-cap-ground" d="M165 240V122m30 118V122m30 118V122m30 118V122m30 118V122m30 118V122m30 118V122m30 118V122m30 118V122"/>'
        '</svg><figcaption>A simple diagram, not to scale. One First Street NE, Washington, D.C.</figcaption></figure><div class="gv-facts">'
        '<details open><summary>When was it built?</summary><div class="gw-detail"><p>The cornerstone was laid on October 13, 1932. The building '
        'was completed in 1935, when the Court was finally able to occupy its own building.</p>%s</div></details>'
        '<details><summary>Who designed it?</summary><div class="gw-detail"><p>Architect Cass Gilbert, at the request of Chief Justice William '
        'Howard Taft. A classical Corinthian style was chosen.</p>%s</div></details>'
        '</div></div></section>') % (
        ''.join(jcards), src(S1, '28 U.S.C. § 1'), src(MEMBERS, 'Supreme Court members'), src(CONST, 'Constitution, Articles II and III'),
        src('https://www.supremecourt.gov/about/buildinghistory.aspx', 'Supreme Court building history'),
        src('https://www.supremecourt.gov/about/buildinghistory.aspx', 'Supreme Court building history'))

    ccards = []
    for cid, name, sts, terr, judges in CIRCUITS:
        if cid == 'fed':
            where = 'Nationwide. The law assigns it all federal judicial districts, for certain kinds of cases.'
        else:
            places = [NAMES[s] for s in sts] + terr
            where = ', '.join(places) + '.'
        ccards.append('<article class="gw-card gv-circuit gv-c%s-card" id="circuit-%s"><p class="gw-eyebrow">Court of appeals</p><h3>%s</h3>'
                      '<p class="gv-big">%d <span>judgeships set by law</span></p><p>%s</p></article>' % (
                          cid, cid, e(name), judges, e(where)))
    circuits = (
        '<section id="circuits" class="gv-sec"><div class="gw-heading"><span>Layer 3 / Where appeals go</span>'
        '<h2>13 courts of appeals.</h2><p>The 94 district courts are organized into 12 regional circuits. The 13th, the Federal Circuit, '
        'has nationwide reach for certain kinds of cases. Tap a state to jump to its circuit.</p></div>'
        '<figure class="gv-capitol gv-mapfig">%s<figcaption>Colors show circuits only. Alaska and Hawaii are drawn in insets.</figcaption></figure>'
        '<div class="gw-grid gv-top">%s</div>'
        '<p class="gv-small">Together these add up to 179 circuit judgeships. %s %s %s %s</p></section>') % (
        circuit_map(), ''.join(ccards), src(S41, '28 U.S.C. § 41'), src(S44, '28 U.S.C. § 44'), src(APPEALS, 'uscourts.gov: courts of appeals'),
        '<a class="gw-source" href="%s">Every court’s website (uscourts.gov) ↗</a>' % e(LINKS))

    ladder = (
        '<section id="levels" class="gv-sec"><div class="gw-heading"><span>Layer 1 / How a case moves</span>'
        '<h2>Three levels, from trial to the top.</h2><p>District courts are the trial courts. The courts of appeals sit '
        'above them, and the Supreme Court sits above the courts of appeals.</p></div>'
        '<ol class="gv-ladder"><li><span class="gv-big">94</span><strong>District courts</strong><span>The trial courts, where most federal '
        'cases start.</span></li><li><span class="gv-big">13</span><strong>Courts of appeals</strong><span>Hear appeals from the '
        'district courts. <a href="#circuits">See the circuit map</a></span></li><li><span class="gv-big">1</span><strong>Supreme Court</strong>'
        '<span>The highest court. <a href="#supreme-court">Meet the nine justices</a></span></li></ol>'
        '<details><summary>Who chooses federal judges, and for how long?</summary><div class="gw-detail"><p>The president nominates judges for the '
        'Supreme Court, the courts of appeals and the district courts, and the Senate confirms or rejects them. These judges hold their offices '
        'during good behavior, so they have no fixed term. Congress creates appeals and district judgeships by law.</p>%s %s</div></details>'
        '<p>%s</p></section>') % (
        src(CONST, 'Constitution, Articles II and III'),
        src('https://www.uscourts.gov/about-federal-courts/about-federal-judges/authorized-judgeships', 'uscourts.gov: judgeships'),
        src(STRUCT, 'uscourts.gov: court structure'))

    body = ('<header class="gv-hero"><p class="gw-eyebrow">The federal courts · Interpret federal laws</p>'
            '<p class="gv-huge">9 <span>Supreme Court justices</span></p><h1>The federal courts</h1>'
            '<p class="gv-lede">94 district courts, 13 courts of appeals and one Supreme Court. Each click goes one layer deeper.</p>'
            '<p class="gw-status">Article III of the Constitution sets up the federal courts. Checked against supremecourt.gov, uscourts.gov '
            'and the U.S. Code on %s.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#levels">How a case moves</a><a href="#supreme-court">The Supreme Court</a>'
            '<a href="#circuits">Circuit map</a></nav>%s%s%s'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>Justices and the building: supremecourt.gov. Court structure: uscourts.gov. '
            'Circuits and judgeships: 28 U.S.C. §§ 1, 41 and 44. Checked %s. The 179 total is our sum of the counts in § 44. The map reuses the '
            'state outlines from our district lookup. Nothing here rates or ranks a judge.</p>'
            '<nav aria-label="Keep exploring"><a href="/how-government-works.html">How government works</a> · <a href="/government/congress/">Congress</a> · '
            '<a href="/government/executive/">The executive branch</a> · <a href="#top">Return to surface ↑</a></nav></section>') % (
        CHECKED, ladder, supreme, circuits, CHECKED)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as fh:
        fh.write(page('The federal courts', 'The Supreme Court, the 13 courts of appeals and the 94 district courts, layer by layer: '
                      'the nine justices, the circuit map, the Supreme Court Building and how a case moves. Official sources.',
                      SITE_URL + '/government/courts/',
                      [('The Way', '/'), ('Government', '/how-government-works.html'), ('Federal courts', None)], body, 2))
    print('wrote the courts page')


if __name__ == '__main__':
    main()
