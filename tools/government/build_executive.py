#!/usr/bin/env python3
"""Builds the executive-branch layer of the Government page: site/government/executive/index.html

Run from the repo root, with the same congress-legislators checkout used for Congress:
  python3 tools/government/build_executive.py ../congress-legislators

Presidents, vice presidents, the Speaker and the President pro tempore come from the dataset.
Department heads, missions and founding years are typed below from official pages, each with
its source URL and the date it was checked. Update CHECKED and the rows when the cabinet changes.
"""
import datetime
import os
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import (ROOT, SITE_URL, e, full_name, git_info, long_date, member_slugs, ordinal,  # noqa: E402
                            page)

OUT = os.path.join(ROOT, 'site', 'government', 'executive')
CHECKED = 'November 6, 2026'
WH_CABINET = 'https://www.whitehouse.gov/administration/cabinet/'
SUCCESSION = 'https://www.law.cornell.edu/uscode/text/3/19'

# Ordered as in 3 U.S.C. 19(d)(1), the presidential line of succession.
# head_url: the head's own page on the department site, checked Nov 6, 2026. Where the department site had no page
# naming them (Defense, Commerce, Education, Veterans Affairs, Homeland Security), the White House cabinet page, which names them.
# year/year_src left empty where no official page confirming it could be read.
DEPARTMENTS = [
    dict(name='Department of State', title='Secretary of State', head_url='https://www.state.gov/secretary/', head='Marco Rubio', head_src=WH_CABINET,
         year='1789', year_note='Created in 1789 as the Department of Foreign Affairs and renamed State the same year.',
         year_src='https://www.doi.gov/about/history',
         mission='Leading U.S. foreign policy to advance the interests and security of the American people.',
         mission_src='https://www.state.gov/', url='https://www.state.gov/'),
    dict(name='Department of the Treasury', title='Secretary of the Treasury', head_url='https://home.treasury.gov/about/general-information/officials/scott-bessent', head='Scott Bessent', head_src=WH_CABINET,
         year='1789', year_note='Established by an act of Congress in 1789.',
         year_src='https://home.treasury.gov/about/history-overview',
         mission='The Treasury’s mission is to maintain a strong economy and create economic and job opportunities.',
         mission_src='https://home.treasury.gov/about/general-information/role-of-the-treasury', url='https://home.treasury.gov/'),
    dict(name='Department of Defense', title='Secretary of Defense', head_url=WH_CABINET, head='Pete Hegseth', head_src=WH_CABINET,
         note='The White House cabinet page calls this office the Secretary of War. The succession law names the Secretary of Defense.',
         mission='Our mission is to provide the military forces needed to deter war and ensure our nation’s security.',
         mission_src='https://www.defense.gov/About/', url='https://www.defense.gov/'),
    dict(name='Department of Justice', title='Attorney General', head_url='https://www.justice.gov/ag/staff-profile/meet-attorney-general', head='Todd Blanche', head_src='https://www.justice.gov/ag',
         year='1870', year_note='An 1870 act established Justice as an executive department. The office of Attorney General dates from 1789.',
         year_src='https://www.justice.gov/ag',
         mission='To uphold the rule of law, to keep our country safe, and to protect civil rights.',
         mission_src='https://www.justice.gov/about', url='https://www.justice.gov/'),
    dict(name='Department of the Interior', title='Secretary of the Interior', head_url='https://www.doi.gov/interior-leadership', head='Doug Burgum',
         head_src='https://www.doi.gov/interior-leadership', year='1849',
         year_note='A bill creating the department passed on March 3, 1849.', year_src='https://www.doi.gov/about/history',
         mission='Protects and manages the Nation’s natural resources and cultural heritage.',
         mission_src='https://www.doi.gov/about', url='https://www.doi.gov/'),
    dict(name='Department of Agriculture', title='Secretary of Agriculture', head_url='https://www.usda.gov/our-agency/about-usda/our-secretary', head='Brooke Rollins', head_src=WH_CABINET,
         mission='Provides leadership on food, agriculture, natural resources, and related issues.',
         mission_src='https://www.usa.gov/agencies/u-s-department-of-agriculture', url='https://www.usda.gov/'),
    dict(name='Department of Commerce', title='Secretary of Commerce', head_url=WH_CABINET, head='Howard Lutnick', head_src=WH_CABINET,
         mission='To create the conditions for economic growth and opportunity for all communities.',
         mission_src='https://www.commerce.gov/about', url='https://www.commerce.gov/'),
    dict(name='Department of Labor', title='Secretary of Labor', head_url='https://www.dol.gov/agencies/osec/keith-sonderling', head='Keith Sonderling',
         head_src='https://www.dol.gov/agencies/osec/keith-sonderling',
         note='Confirmed by the Senate on September 30, 2026, and sworn in on October 2, 2026.',
         mission='To foster, promote, and develop the welfare of the wage earners, job seekers, and retirees of the United States.',
         mission_src='https://www.dol.gov/general/aboutdol', url='https://www.dol.gov/'),
    dict(name='Department of Health and Human Services', title='Secretary of Health and Human Services', head_url='https://www.hhs.gov/about/leadership/robert-kennedy.html',
         head='Robert F. Kennedy, Jr.', head_src='https://www.hhs.gov/about/index.html', year='1953',
         year_note='Created as Health, Education, and Welfare on April 11, 1953. Renamed Health and Human Services on May 4, 1980.',
         year_src='https://www.hhs.gov/about/historical-highlights/index.html',
         mission='To enhance the health and well-being of all Americans.',
         mission_src='https://www.hhs.gov/about/index.html', url='https://www.hhs.gov/'),
    dict(name='Department of Housing and Urban Development', title='Secretary of Housing and Urban Development', head_url='https://www.hud.gov/aboutus/secretary',
         head='Scott Turner', head_src=WH_CABINET, url='https://www.hud.gov/'),
    dict(name='Department of Transportation', title='Secretary of Transportation', head_url='https://www.transportation.gov/meet-secretary/us-transportation-secretary-sean-duffy', head='Sean Duffy', head_src=WH_CABINET,
         year='1966', year_note='Established by an act of Congress on October 15, 1966. It began operating on April 1, 1967.',
         year_src='https://www.transportation.gov/mission/about-dot',
         mission='To improve the quality of life for all American people and communities, from rural to urban.',
         mission_src='https://www.transportation.gov/about', url='https://www.transportation.gov/'),
    dict(name='Department of Energy', title='Secretary of Energy', head_url='https://www.energy.gov/person/chris-wright', head='Chris Wright',
         head_src='https://www.energy.gov/person/chris-wright', year='1977',
         year_note='In existence since 1977. It traces its lineage to the Manhattan Project.',
         year_src='https://www.energy.gov/lm/history',
         mission='To ensure America’s security and prosperity by addressing its energy, environmental and nuclear challenges.',
         mission_src='https://www.energy.gov/about', url='https://www.energy.gov/'),
    dict(name='Department of Education', title='Secretary of Education', head_url=WH_CABINET, head='Linda McMahon', head_src=WH_CABINET,
         mission='To promote student achievement and preparation for global competitiveness.',
         mission_src='https://www.ed.gov/about', url='https://www.ed.gov/'),
    dict(name='Department of Veterans Affairs', title='Secretary of Veterans Affairs', head_url=WH_CABINET, head='Doug Collins', head_src=WH_CABINET,
         year='1989', year_note='The Veterans Administration was created in 1930. It became a Cabinet department in 1989.',
         year_src='https://department.va.gov/about/',
         mission='To fulfill President Lincoln’s promise to care for those who have served in our nation’s military and for their families, caregivers, and survivors.',
         mission_src='https://department.va.gov/about/', url='https://www.va.gov/'),
    dict(name='Department of Homeland Security', title='Secretary of Homeland Security', head_url=WH_CABINET, head='Markwayne Mullin',
         head_src=WH_CABINET, year='2002', year_note='Established in 2002, combining 22 federal departments and agencies.',
         year_src='https://www.dhs.gov/about-dhs',
         mission='With honor and integrity, we will safeguard the American people, our homeland, and our values.',
         mission_src='https://www.dhs.gov/about-dhs', url='https://www.dhs.gov/'),
]


def src(url, label='Source'):
    host = url.split('/')[2].replace('www.', '')
    return '<a class="gw-source" href="%s">%s: %s ↗</a>' % (e(url), e(label), e(host))


def presidencies(E):
    """[(number, person, first_start, last_end, parties, hows)] merging back-to-back terms of one person."""
    terms = sorted(((t, x) for x in E for t in x['terms'] if t['type'] == 'prez'), key=lambda p: p[0]['start'])
    out = []
    for t, x in terms:
        if out and out[-1]['person'] is x and out[-1]['end'] == t['start']:
            out[-1]['end'] = t['end']
            out[-1]['parties'].append(t.get('party', ''))
            out[-1]['hows'].append(t.get('how', ''))
        else:
            out.append({'person': x, 'start': t['start'], 'end': t['end'], 'parties': [t.get('party', '')],
                        'hows': [t.get('how', '')]})
    for i, p in enumerate(out):
        p['n'] = i + 1
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: build_executive.py <path to congress-legislators checkout>')
    srcdir = sys.argv[1]
    commit, data_date = git_info(srcdir)
    E = yaml.safe_load(open(os.path.join(srcdir, 'executive.yaml'), encoding='utf-8'))
    L = yaml.safe_load(open(os.path.join(srcdir, 'legislators-current.yaml'), encoding='utf-8'))
    slugs = member_slugs(L)
    today = datetime.date.today().isoformat()

    pres = presidencies(E)
    cur = [p for p in pres if p['start'] <= today < p['end']][-1]
    vps = sorted(((t, x) for x in E for t in x['terms'] if t['type'] == 'viceprez'), key=lambda p: p[0]['start'])
    vp_t, vp = [p for p in vps if p[0]['start'] <= today < p[0]['end']][-1]
    people = len({id(p['person']) for p in pres})

    def leader(title):
        for m in L:
            for r in m.get('leadership_roles', []) or []:
                if r['title'] == title and not r.get('end'):
                    return '<a href="/government/congress/members/%s.html">%s</a>' % (slugs[m['id']['bioguide']], e(full_name(m)))
        return ''

    ds = '<a class="gw-source" href="https://github.com/unitedstates/congress-legislators">Source: congress-legislators dataset ↗</a>'
    const = 'https://www.archives.gov/founding-docs/constitution-transcript'
    amend = 'https://www.archives.gov/founding-docs/amendments-11-27'

    from build_presidents import PRESIDENTS  # page slugs (imported here: build_presidents imports this file)

    def more(p):
        slug = PRESIDENTS[p['person']['id']['govtrack']][0]
        return '<a href="/government/presidents/%s.html">Open %s’s page: the money during their years and who they appointed →</a>' % (
            slug, e(full_name(p['person'])))

    # Dropdown to show any presidency in the two cards (/government/executive/pick.js). Data rides on each option.
    opts = []
    for p in reversed(pres):
        party = ' / '.join(dict.fromkeys(x for x in p['parties'] if x))
        vlist = []
        for t, x in vps:
            if t['start'] < p['end'] and t['end'] > p['start'] and x is not p['person']:
                vslug = PRESIDENTS.get(x['id'].get('govtrack'), ('',))[0]  # vice presidents who later became president link to their page
                vlist.append('%s|%s|%s|%s' % (full_name(x), long_date(max(t['start'], p['start'])),
                                              long_date(min(t['end'], p['end'])) if min(t['end'], p['end']) <= today else 'now', vslug))
        merged = []
        for v in vlist:  # back-to-back terms of one vice president read as one line
            if merged and merged[-1].split('|')[0] == v.split('|')[0]:
                merged[-1] = '|'.join(merged[-1].split('|')[:2] + v.split('|')[2:])
            else:
                merged.append(v)
        how = {'election': 'Elected', 'succession': 'Succeeded to the office', 'appointment': 'Appointed'}.get(p['hows'][0], p['hows'][0])
        opts.append('<option value="%d"%s data-name="%s" data-slug="%s" data-start="%s" data-end="%s" data-party="%s" data-how="%s" '
                    'data-vps="%s">%d. %s (%s)</option>' % (
                        p['n'], ' selected' if p is cur else '', e(full_name(p['person'])), PRESIDENTS[p['person']['id']['govtrack']][0],
                        e(long_date(p['start'])), e(long_date(p['end'])) if p['end'] <= today else ('now|' + e(long_date(p['end']))),
                        e('No party' if party == 'no party' else party), e(how), e('~'.join(merged)), p['n'],
                        e(full_name(p['person'])), e(p['start'][:4] + ' to ' + (p['end'][:4] if p['end'] <= today else 'now'))))
    cur_party = ' / '.join(dict.fromkeys(x for x in cur['parties'] if x))
    cur_how = {'election': 'Elected', 'succession': 'Succeeded to the office', 'appointment': 'Appointed'}.get(cur['hows'][0], cur['hows'][0])
    pick = ('<div class="gv-search gv-pick" hidden><label for="gv-pres">Show a president</label>'
            '<select id="gv-pres" data-current="%d">%s</select></div>') % (cur['n'], ''.join(opts))

    leaders = (
        '<section id="leaders" class="gv-sec"><div class="gw-heading"><span>Layer 1 / Who leads</span>'
        '<h2>The president and the vice president.</h2><p>Both are chosen by electors for four-year terms.</p></div>'
        '%s<div class="gv-two">'
        '<article class="gw-card" id="gv-pcard"><p class="gw-eyebrow" data-k="pn">%s president</p><h3 data-k="pname">%s</h3><p class="gv-small" data-k="pmeta">%s</p>'
        '<div class="gv-tiles gv-tiles-in"><div class="gv-tile"><span data-k="pl1">In office since</span><strong data-k="ps">%s</strong></div>'
        '<div class="gv-tile"><span data-k="pl2">Current term ends</span><strong data-k="pe">%s</strong></div></div>'
        '<p class="gv-small" data-k="pmore">%s</p>'
        '<details><summary>What can the president do?</summary><div class="gw-detail"><p>The president carries out federal laws, '
        'commands the armed forces, makes treaties with the consent of two-thirds of the Senate, nominates judges and other officers '
        'for Senate confirmation, and can sign or veto bills.</p>%s</div></details>'
        '<details><summary>Who can be president?</summary><div class="gw-detail"><p>A natural-born citizen, at least 35 years old, '
        'who has lived in the United States for 14 years. No one can be elected president more than twice.</p>%s %s</div></details>'
        '</article>'
        '<article class="gw-card" id="gv-vcard"><p class="gw-eyebrow" data-k="vn">Vice president</p><h3 data-k="vname">%s</h3>'
        '<div class="gv-tiles gv-tiles-in" data-k="vtiles"><div class="gv-tile"><span>In office since</span><strong>%s</strong></div>'
        '<div class="gv-tile"><span>Current term ends</span><strong>%s</strong></div></div><ul class="gv-list" data-k="vlist" hidden></ul>'
        '<details><summary>What does the vice president do?</summary><div class="gw-detail"><p>The vice president is first in line '
        'to become president and is President of the Senate, with a vote only to break a tie. See the Senate on the '
        '<a href="/government/congress/#chambers">Congress page</a>.</p>%s %s</div></details>'
        '</article></div><p>%s</p></section>') % (
        pick, e(ordinal(cur['n'])), '<a href="/government/presidents/%s.html">%s</a>' % (
            PRESIDENTS[cur['person']['id']['govtrack']][0], e(full_name(cur['person']))),
        e(' · '.join(x for x in [cur_party, cur_how] if x)), e(long_date(cur['start'])), e(long_date(cur['end'])), more(cur),
        src(const, 'Constitution, Article II'), src(const, 'Article II'), src(amend, 'Twenty-second Amendment'),
        ('<a href="https://www.whitehouse.gov/administration/jd-vance/">%s ↗</a>' % e(full_name(vp))) if full_name(vp) == 'J.D. Vance' else e(full_name(vp)),
        e(long_date(vp_t['start'])), e(long_date(vp_t['end'])),
        src(const, 'Constitution, Article I, Section 3'), src(amend, 'Twenty-fifth Amendment'), ds)

    cards = []
    for i, d in enumerate(DEPARTMENTS):
        bits = []
        if d.get('mission'):
            bits.append('<details><summary>What does it do?</summary><div class="gw-detail"><p>In its own words: “%s”</p>%s</div></details>' % (
                e(d['mission']), src(d['mission_src'])))
        if d.get('year'):
            bits.append('<details><summary>When was it created?</summary><div class="gw-detail"><p>%s</p>%s</div></details>' % (
                e(d['year_note']), src(d['year_src'])))
        bits.append('<details><summary>Who leads it?</summary><div class="gw-detail"><p>%s, %s. Cabinet secretaries are nominated by the '
                    'president and confirmed by the Senate.</p>%s%s</div></details>' % (
                        '<a href="%s">%s ↗</a>' % (e(d['head_url']), e(d['head'])), e(d['title']), ('<p>%s</p>' % e(d['note'])) if d.get('note') else '', src(d['head_src'])))
        bits.append('<details><summary>Where is it in the line of succession?</summary><div class="gw-detail"><p>%s in the line to act as '
                    'president, after the vice president, the Speaker and the President pro tempore.</p><p><a href="#succession">See the whole line</a></p>%s</div></details>' % (
                        e(ordinal(i + 4)).capitalize(), src(SUCCESSION, '3 U.S.C. § 19')))
        cards.append('<article class="gw-card gv-dept" id="d-%d"><p class="gw-eyebrow">%s</p><h3>%s</h3>'
                     '<p class="gv-dept-head"><span>%s</span>%s</p>%s<a class="gv-open" href="%s">Official website ↗</a></article>' % (
                         i + 1, ('Created ' + e(d['year'])) if d.get('year') else 'Executive department', e(d['name']),
                         e(d['title']), '<a href="%s">%s</a>' % (e(d['head_url']), e(d['head'])), ''.join(bits), e(d['url'])))
    depts = ('<section id="departments" class="gv-sec"><div class="gw-heading"><span>Layer 2 / The departments</span>'
             '<h2>15 departments do most of the work.</h2><p>Their heads form most of the president’s Cabinet. They are listed in the '
             'order of the presidential line of succession. Open a question for the next layer.</p></div>'
             '<div class="gw-grid gv-top">%s</div><p class="gw-status">Department heads checked against the White House cabinet page and the departments’ '
             'own sites on %s. Where a founding year could not be confirmed on an official page, it is left out.</p></section>') % (''.join(cards), CHECKED)

    line = [('Vice President', e(full_name(vp)), src(const, 'Constitution, Article II'))]
    line.append(('Speaker of the House', leader('Speaker of the House'), src(SUCCESSION, '3 U.S.C. § 19')))
    line.append(('President pro tempore of the Senate', leader('President Pro Tempore of the Senate'), src(SUCCESSION, '3 U.S.C. § 19')))
    for i, d in enumerate(DEPARTMENTS):
        line.append((d['title'], '<a href="#d-%d">%s</a>' % (i + 1, e(d['head'])), ''))
    lis = ''.join('<li><span class="gv-role">%s</span>%s</li>' % (e(t), who) for t, who, _ in line)
    succession = ('<section id="succession" class="gv-sec"><div class="gw-heading"><span>Layer 3 / If the office is empty</span>'
                  '<h2>Who takes over?</h2><p>If the presidency becomes vacant, the vice president becomes president. After the vice '
                  'president, a federal law sets the order. An officer must meet the constitutional requirements for president to act as president.</p></div>'
                  '<ol class="gv-line">%s</ol><p>%s %s %s</p></section>') % (
        lis, src(amend, 'Twenty-fifth Amendment'), src(SUCCESSION, '3 U.S.C. § 19'), ds)

    wh = 'https://www.whitehouse.gov/about-the-white-house/the-white-house/'
    house = (
        '<section id="white-house" class="gv-sec"><div class="gw-heading"><span>Layer 3 / The building</span>'
        '<h2>The White House.</h2><p>The president’s home and office, at 1600 Pennsylvania Avenue in Washington, D.C.</p></div>'
        '<div class="gv-two"><figure class="gv-capitol"><svg viewBox="0 0 600 300" role="img" aria-labelledby="wh-t"><title id="wh-t">Simple diagram of the White '
        'House: the Residence in the center, the West Wing with the Oval Office on one side, and the East Wing on the other.</title>'
        '<path class="gv-cap-ground" d="M20 262h560"/>'
        '<rect class="gv-cap-wing" x="30" y="196" width="150" height="66" rx="4"/>'
        '<rect class="gv-cap-wing" x="420" y="196" width="150" height="66" rx="4"/>'
        '<rect class="gv-cap-center" x="180" y="120" width="240" height="142" rx="4"/>'
        '<path class="gv-cap-dome" d="M260 120h80v-16h-80Z"/><path class="gv-cap-dome" d="M300 104v-18"/>'
        '<ellipse class="gv-cap-dome" cx="105" cy="250" rx="22" ry="9"/>'
        '<text x="300" y="186">Residence</text><text x="300" y="210" class="gv-cap-sm">132 rooms, 6 levels</text>'
        '<text x="105" y="228">West Wing</text><text x="105" y="282" class="gv-cap-sm">Oval Office</text>'
        '<text x="495" y="228">East Wing</text><text x="495" y="282" class="gv-cap-sm">being replaced</text></svg>'
        '<figcaption>A simple diagram, not to scale.</figcaption></figure><div class="gv-facts">'
        '<details open><summary>When was it built?</summary><div class="gw-detail"><p>George Washington selected the site in 1791, and the '
        'cornerstone was laid the following year. President John Adams and Abigail Adams moved into the still-unfinished house.</p>%s</div></details>'
        '<details><summary>Was it ever burned?</summary><div class="gw-detail"><p>Yes. During the War of 1812 the British set fire to the '
        'President’s House. James Hoban, its original architect, was appointed to rebuild it.</p>%s</div></details>'
        '<details><summary>How big is it?</summary><div class="gw-detail"><p>The Residence has 132 rooms, 35 bathrooms and 6 levels.</p>%s</div></details>'
        '<details><summary>Where does the president work?</summary><div class="gw-detail"><p>In the West Wing, first built as a temporary '
        'office building. President William Howard Taft had the Oval Office built inside an enlarged office wing.</p>%s</div></details>'
        '<details><summary>What is changing?</summary><div class="gw-detail"><p>The White House says a new ballroom will replace the East '
        'Wing, which was built in 1902. It says construction began in September 2025.</p>%s</div></details>'
        '<details><summary>Who takes care of it?</summary><div class="gw-detail"><p>The White House is owned by the American people and '
        'cared for by the National Park Service.</p>%s</div></details>'
        '</div></div></section>') % (src(wh), src(wh), src(wh), src(wh), src(wh), src('https://www.nps.gov/whho/index.htm'))

    rows = []
    for p in reversed(pres):
        party = ' / '.join(dict.fromkeys(x for x in p['parties'] if x))
        how = p['hows'][0]
        how_w = {'election': 'Elected', 'succession': 'Succeeded to the office', 'appointment': 'Appointed'}.get(how, how)
        rows.append('<tr><td>%d</td><td>%s</td><td>%s to %s</td><td>%s</td><td>%s</td></tr>' % (
            p['n'], '<a href="/government/presidents/%s.html">%s</a>' % (PRESIDENTS[p['person']['id']['govtrack']][0], e(full_name(p['person']))),
            e(p['start'][:4]), e(p['end'][:4]) if p['end'] > today else e(p['end'][:4]),
            e(party.capitalize() if party == 'no party' else party), e(how_w)))
    every = ('<section id="presidents" class="gv-sec"><div class="gw-heading"><span>Layer 4 / History</span>'
             '<h2>%d presidencies, %d people.</h2><p>Grover Cleveland and Donald J. Trump each served two terms that were not back to back, so '
             'each holds two numbers. “Succeeded” means a vice president took over after a president died or resigned.</p>'
             '<p><a href="/government/presidents/">Open any president</a> for the national debt, the budget and the judges from their years, '
             'or follow the money to <a href="/government/federal-reserve/">the Federal Reserve</a>.</p></div>'
             '<details><summary>Show every president</summary><div class="gw-detail gv-scroll"><table class="gv-table"><thead><tr><th>No.</th>'
             '<th>President</th><th>Years</th><th>Party</th><th>How they took office</th></tr></thead><tbody>%s</tbody></table>%s</div></details></section>') % (
        len(pres), people, ''.join(rows), ds)

    body = ('<header class="gv-hero"><p class="gw-eyebrow">The executive branch · Carries out federal laws</p>'
            '<p class="gv-huge">15 <span>executive departments</span></p><h1>The executive branch</h1>'
            '<p class="gv-lede">The president leads it, with the vice president and the heads of 15 departments. Each click goes one layer deeper.</p>'
            '<p class="gw-status">Article II of the Constitution sets up the presidency. Names checked against official sites on %s.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#leaders">President and vice president</a><a href="#departments">Departments</a>'
            '<a href="#succession">Who takes over?</a><a href="#white-house">The White House</a><a href="#presidents">Every president</a></nav>'
            '%s%s%s%s%s'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>Presidents, vice presidents and congressional leaders: the public-domain '
            'congress-legislators dataset (snapshot %s, version %s). Department heads, missions and founding years: the White House cabinet page and '
            'each department’s own site, checked %s. The building: whitehouse.gov. The line of succession: 3 U.S.C. § 19. Nothing here rates or ranks anyone.</p>'
            '<nav aria-label="Keep exploring"><a href="/how-government-works.html">How government works</a> · <a href="/government/congress/">Congress</a> · '
            '<a href="#top">Return to surface ↑</a></nav></section>') % (
        CHECKED, leaders, depts, succession, house, every, e(long_date(data_date)), e(commit), CHECKED)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as fh:
        html_out = page('The executive branch', 'The president, vice president and 15 executive departments, layer by layer: who leads each one, '
                      'what it does, the line of succession, the White House and every president. Official sources.',
                      SITE_URL + '/government/executive/',
                      [('The Way', '/'), ('Government', '/how-government-works.html'), ('Executive branch', None)], body, 2)
        html_out = html_out.replace('<link rel="canonical"', '<link rel="stylesheet" href="/government/executive/pick.css?v=1">\n<link rel="canonical"', 1)
        fh.write(html_out.replace('<script src="/members/waybar.js', '<script src="/government/executive/pick.js?v=1" defer></script><script src="/members/waybar.js', 1))
    print('wrote the executive page (%d presidencies)' % len(pres))


if __name__ == '__main__':
    main()
