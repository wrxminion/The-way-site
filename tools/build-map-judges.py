#!/usr/bin/env python3
"""Build site/map*/data/judges.json from the state judges pages in the guides.

Run from the repository root:  python tools/build-map-judges.py

The district map shows a "Judges on your ballot" block from data/judges.json.
Statewide judges (on every ballot in the state) are listed for everyone. Judges whose
courts cover only some counties are listed when the click lands in one of those
counties. Anything else (judicial districts and circuits we cannot place from the
guide page) is counted and linked to the state's judges page.
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
STATES = ['ak', 'az', 'ca', 'fl', 'in', 'ks', 'md', 'mi', 'mo', 'ne', 'nm', 'ny', 'ok', 'ut', 'wy']
# states where every judge on the judges page is on every voter's ballot
ALL_STATEWIDE = {'ks'}

STATEWIDE = re.compile(r'every county|every district|statewide|every ballot|every voter|On every', re.I)
LEAD = re.compile(r'^(?:On the ballot in|Decided by(?: voters in)?|Decided by)\s*', re.I)


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()


def parse_counties(what):
    """Return a list of county names if the sentence lists counties, else None."""
    first = what.split('. ')[0]
    t = LEAD.sub('', first)
    t = re.sub(r'^\d+ counties:\s*', '', t)
    t = re.sub(r'\s+voters?$', '', t)
    t = re.sub(r'\s+Count(?:y|ies)\b', '', t)
    t = re.sub(r'^(?:the )?counties of (?:the )?', '', t, flags=re.I)
    parts = [p.strip() for p in re.split(r',\s*(?:and\s+)?|\s+and\s+', t) if p.strip()]
    if not parts:
        return None
    for p in parts:
        if not re.fullmatch(r"[A-Z][A-Za-z.'\- ]*", p):
            return None
        if re.search(r'District|Court|Circuit|Judicial|Division|Appeals|Eastern|Western|Southern|Division', p):
            return None
    return parts


def read_entries(path):
    s = open(path, encoding='utf8').read()
    out = []
    for m in re.finditer(r'<li><span><b>([^<]*)</b><br><b>([^<]*)</b>(.*?)</span><span class="what">(.*?)</span></li>', s, re.S):
        court, name, _, what = (clean(m.group(i)) for i in range(1, 5))
        out.append((court, name, what))
    return out


# New York: the 13 judicial districts and the 62 counties in each (NY Unified Court System, nycourts.gov)
NY_DISTRICTS = {
    1: ['New York'], 2: ['Kings'],
    3: ['Albany', 'Columbia', 'Greene', 'Rensselaer', 'Schoharie', 'Sullivan', 'Ulster'],
    4: ['Clinton', 'Essex', 'Franklin', 'Fulton', 'Hamilton', 'Montgomery', 'St. Lawrence', 'Saratoga', 'Schenectady', 'Warren', 'Washington'],
    5: ['Herkimer', 'Jefferson', 'Lewis', 'Oneida', 'Onondaga', 'Oswego'],
    6: ['Broome', 'Chemung', 'Chenango', 'Cortland', 'Delaware', 'Madison', 'Otsego', 'Schuyler', 'Tioga', 'Tompkins'],
    7: ['Cayuga', 'Livingston', 'Monroe', 'Ontario', 'Seneca', 'Steuben', 'Wayne', 'Yates'],
    8: ['Allegany', 'Cattaraugus', 'Chautauqua', 'Erie', 'Genesee', 'Niagara', 'Orleans', 'Wyoming'],
    9: ['Dutchess', 'Orange', 'Putnam', 'Rockland', 'Westchester'],
    10: ['Nassau', 'Suffolk'], 11: ['Queens'], 12: ['Bronx'], 13: ['Richmond'],
}


def ordinal(n):
    return '%d%s' % (n, 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))


# Michigan: Court of Appeals districts and their counties (MCL 600.302, Michigan Legislature)
MI_DISTRICTS = {
    1: ['Branch', 'Hillsdale', 'Kalamazoo', 'Lenawee', 'Monroe', 'St. Joseph', 'Wayne'],
    2: ['Genesee', 'Macomb', 'Oakland'],
    3: ['Allegan', 'Barry', 'Berrien', 'Calhoun', 'Cass', 'Eaton', 'Ionia', 'Jackson', 'Kent', 'Mason', 'Montcalm', 'Muskegon',
        'Newaygo', 'Oceana', 'Ottawa', 'Van Buren', 'Washtenaw'],
    4: ['Alcona', 'Alger', 'Alpena', 'Antrim', 'Arenac', 'Baraga', 'Bay', 'Benzie', 'Charlevoix', 'Cheboygan', 'Chippewa', 'Clare',
        'Clinton', 'Crawford', 'Delta', 'Dickinson', 'Emmet', 'Gladwin', 'Gogebic', 'Grand Traverse', 'Gratiot', 'Houghton', 'Huron',
        'Ingham', 'Iosco', 'Iron', 'Isabella', 'Kalkaska', 'Keweenaw', 'Lake', 'Lapeer', 'Leelanau', 'Livingston', 'Luce', 'Mackinac',
        'Manistee', 'Marquette', 'Mecosta', 'Menominee', 'Midland', 'Missaukee', 'Montmorency', 'Ogemaw', 'Ontonagon', 'Osceola',
        'Oscoda', 'Otsego', 'Presque Isle', 'Roscommon', 'Saginaw', 'Sanilac', 'Schoolcraft', 'Shiawassee', 'St. Clair', 'Tuscola',
        'Wexford'],
}


# Missouri Court of Appeals districts by county (RSMo 477.050 eastern, 477.060 southern, 477.070 western = every other county)
MO_EASTERN = ['Monroe', 'Shelby', 'Knox', 'Scotland', 'Clark', 'Lewis', 'Marion', 'Ralls', 'Pike', 'Lincoln', 'Montgomery', 'Warren',
              'St. Charles', 'St. Louis', 'Jefferson', 'Ste. Genevieve', 'Perry', 'Cape Girardeau', 'Madison', 'St. Francois',
              'Washington', 'Franklin', 'Audrain', 'Gasconade', 'Osage']
MO_SOUTHERN = ['Barry', 'Barton', 'Bollinger', 'Butler', 'Camden', 'Carter', 'Cedar', 'Christian', 'Crawford', 'Dade', 'Dallas', 'Dent',
               'Douglas', 'Dunklin', 'Greene', 'Hickory', 'Howell', 'Iron', 'Jasper', 'Laclede', 'Lawrence', 'Maries', 'McDonald',
               'Mississippi', 'New Madrid', 'Newton', 'Oregon', 'Ozark', 'Pemiscot', 'Phelps', 'Polk', 'Pulaski', 'Reynolds', 'Ripley',
               'Scott', 'Shannon', 'St. Clair', 'Stoddard', 'Stone', 'Taney', 'Texas', 'Wayne', 'Webster', 'Wright']
# county names as the live Missouri map writes them (the city of St. Louis is also labeled "St. Louis")
MO_COUNTIES = ['Adair', 'Andrew', 'Atchison', 'Audrain', 'Barry', 'Barton', 'Bates', 'Benton', 'Bollinger', 'Boone', 'Buchanan', 'Butler',
               'Caldwell', 'Callaway', 'Camden', 'Cape Girardeau', 'Carroll', 'Carter', 'Cass', 'Cedar', 'Chariton', 'Christian', 'Clark',
               'Clay', 'Clinton', 'Cole', 'Cooper', 'Crawford', 'Dade', 'Dallas', 'Daviess', 'DeKalb', 'Dent', 'Douglas', 'Dunklin',
               'Franklin', 'Gasconade', 'Gentry', 'Greene', 'Grundy', 'Harrison', 'Henry', 'Hickory', 'Holt', 'Howard', 'Howell', 'Iron',
               'Jackson', 'Jasper', 'Jefferson', 'Johnson', 'Knox', 'Laclede', 'Lafayette', 'Lawrence', 'Lewis', 'Lincoln', 'Linn',
               'Livingston', 'McDonald', 'Macon', 'Madison', 'Maries', 'Marion', 'Mercer', 'Miller', 'Mississippi', 'Moniteau', 'Monroe',
               'Montgomery', 'Morgan', 'New Madrid', 'Newton', 'Nodaway', 'Oregon', 'Osage', 'Ozark', 'Pemiscot', 'Perry', 'Pettis', 'Phelps',
               'Pike', 'Platte', 'Polk', 'Pulaski', 'Putnam', 'Ralls', 'Randolph', 'Ray', 'Reynolds', 'Ripley', 'St. Charles', 'St. Clair',
               'Ste. Genevieve', 'St. Francois', 'St. Louis', 'Saline', 'Schuyler', 'Scotland', 'Scott', 'Shannon', 'Shelby', 'Stoddard',
               'Stone', 'Sullivan', 'Taney', 'Texas', 'Vernon', 'Warren', 'Washington', 'Wayne', 'Webster', 'Worth', 'Wright']
MO_WESTERN = [c for c in MO_COUNTIES if c not in MO_EASTERN and c not in MO_SOUTHERN]


# Nebraska: judicial districts and their counties, as listed on the judges' own Nebraska Judicial Branch profile pages.
# The profiles disagree on two counties (Fillmore: 1st vs 10th; Otoe: 1st vs 2nd); both districts are shown for them.
NE_DISTRICTS = {
    1: ['Gage', 'Jefferson', 'Johnson', 'Nemaha', 'Pawnee', 'Richardson', 'Saline', 'Thayer', 'Fillmore', 'Otoe'],
    2: ['Cass', 'Otoe', 'Sarpy'],
    3: ['Lancaster'],
    4: ['Douglas'],
    5: ['Boone', 'Butler', 'Colfax', 'Hamilton', 'Merrick', 'Nance', 'Platte', 'Polk', 'Saunders', 'Seward', 'York'],
    6: ['Burt', 'Cedar', 'Dakota', 'Dixon', 'Dodge', 'Thurston', 'Washington'],
    8: ['Blaine', 'Boyd', 'Brown', 'Cherry', 'Custer', 'Garfield', 'Greeley', 'Holt', 'Howard', 'Keya Paha', 'Loup', 'Rock', 'Sherman', 'Valley', 'Wheeler'],
    9: ['Buffalo', 'Hall'],
    10: ['Adams', 'Clay', 'Fillmore', 'Franklin', 'Harlan', 'Kearney', 'Nuckolls', 'Phelps', 'Webster'],
    11: ['Arthur', 'Chase', 'Dawson', 'Dundy', 'Frontier', 'Furnas', 'Gosper', 'Hayes', 'Hitchcock', 'Hooker', 'Keith', 'Lincoln', 'Logan',
         'McPherson', 'Perkins', 'Red Willow', 'Thomas'],
    12: ['Banner', 'Box Butte', 'Cheyenne', 'Dawes', 'Deuel', 'Garden', 'Grant', 'Kimball', 'Morrill', 'Scotts Bluff', 'Sheridan', 'Sioux'],
}
NE_DISTRICT_COURT = {
    1: ['David J. A. Bargen', 'Rick A. Schreiner', 'Julie D. Smith'], 2: ['Stefanie A. Martinez', 'Michael A. Smith', 'George A. Thompson'],
    3: ['Darla S. Ideus', 'Andrew R. Jacobsen', 'Kevin R. McManaman', 'Matthew O. Mellor'],
    4: ['Katie L. Benson', 'Duane C. Dougherty', 'Molly B. Keane', 'Marlon A. Polk', 'LeAnne M. Srb'],
    6: ['Geoffrey C. Hall'], 9: ['Patrick M. Lee', 'John H. Marsh'], 10: ['Morgan R. Farquhar'],
    11: ['Patrick M. Heng', 'Cindy R. Volkmer'], 12: ['Andrea D. Miller', 'Travis P. O’Gorman'],
}
NE_COUNTY_COURT = {
    1: ['Richard R. Smith'], 2: ['Todd J. Hutton', 'S. Colin Palm'], 3: ['Rodney D. Reuter'],
    4: ['Marcena M. Hendrix', 'John E. Huber', 'Marcela A. Keim', 'Sheryl L. Lohaus', 'Craig Q. McDermott', 'Stephanie S. Shearer'],
    5: ['Denise J. Kracl'], 6: ['Sara E. Bauer', 'Thomas J. Klein'], 8: ['Kale B. Burdick'], 9: ['Alfred E. Corey III', 'Bryan S. McQuay'],
    10: ['Michael P. Burns'], 11: ['Tanya K. Roberts-Connick'], 12: ['Aaron J. Conn', 'Kristen D. Mickey'],
}


def ordinal_ne(n):
    return '%d%s' % (n, 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))


def build_ne():
    counties = {}
    def add(county, court, name):
        counties.setdefault(county, []).append({'court': court, 'name': name})
    for d, cl in NE_DISTRICTS.items():
        for c in cl:
            for n in NE_DISTRICT_COURT.get(d, []):
                add(c, 'District Court, %s Judicial District' % ordinal_ne(d), n)
            for n in NE_COUNTY_COURT.get(d, []):
                add(c, 'County Court, %s Judicial District' % ordinal_ne(d), n)
    add('Douglas', 'Separate Juvenile Court of Douglas County', 'Matthew R. Kahler')
    add('Sarpy', 'Separate Juvenile Court of Sarpy County', 'Sarah M. Moore')
    add('Douglas', 'Court of Appeals', 'Michael W. Pirtle')
    return {'state': 'NE', 'page': 'races/judges.html', 'intro': 'Which Nebraska judges you vote on depends on your county. Counties are listed with their judicial district, as shown on the Nebraska Judicial Branch judge profiles.',
            'statewide': [{'court': 'Workers’ Compensation Court', 'name': 'Dirk V. Block'}, {'court': 'Workers’ Compensation Court', 'name': 'Thomas E. Stine'}],
            'counties': counties, 'dependsCount': 0,
            'countyNote': {'Otoe': 'The Nebraska Judicial Branch profiles list Otoe County under both the 1st and 2nd Judicial Districts, so judges from both are shown; check your sample ballot.',
                           'Fillmore': 'The Nebraska Judicial Branch profiles list Fillmore County under both the 1st and 10th Judicial Districts, so judges from both are shown; check your sample ballot.'}}


def build_ny():
    page = open(os.path.join(SITE, 'guide-ny', 'races', 'judges.html'), encoding='utf8').read()
    counties, notes = {}, {}
    seen = set()
    for m in re.finditer(r'<h3 id="d(\d+)">[^<]*vote for (\d+)</h3>(.*?)(?=<h3 id="d|<!-- chatgpt-slot)', page, re.S):
        d, vf = int(m.group(1)), int(m.group(2))
        names = [clean(n) for n in re.findall(r'<li><span><b>([^<]*\([^<)]*\))</b>', m.group(3))]
        seen.add(d)
        court = 'Supreme Court, %s Judicial District (vote for %d)' % (ordinal(d), vf)
        for c in NY_DISTRICTS[d]:
            counties[c] = [{'court': court, 'name': n} for n in names]
    for d, cl in NY_DISTRICTS.items():
        if d not in seen:
            for c in cl:
                notes[c] = 'No Supreme Court seats are up in the %s Judicial District this year.' % ordinal(d)
    return {'state': 'NY', 'page': 'races/judges.html', 'statewide': [], 'counties': counties, 'countyNote': notes,
            'intro': 'New York Supreme Court justices are elected by judicial district. Your county is listed under its district.',
            'dependsCount': 0}


def build_state(st):
    entries = read_entries(os.path.join(SITE, f'guide-{st}', 'races', 'judges.html'))
    statewide, counties, depends = [], {}, []
    for court, name, what in entries:
        court = re.sub(r', Judge [A-Z]$', '', court)
        if st in ALL_STATEWIDE or STATEWIDE.search(what.split('. ')[0]):
            statewide.append({'court': court, 'name': name})
            continue
        cl = parse_counties(what)
        if cl:
            for c in cl:
                counties.setdefault(c, []).append({'court': court, 'name': name})
        else:
            depends.append({'court': court, 'name': name})
    page = open(os.path.join(SITE, f'guide-{st}', 'races', 'judges.html'), encoding='utf8').read()
    intro = ''
    if st == 'mi':
        for nm in re.findall(r'<b>([^<]+)</b> \((?:[^)]*nominee[^)]*)\)', page):
            statewide.append({'court': 'Michigan Supreme Court (vote for 2)', 'name': clean(nm)})
    if st == 'ny':
        depends = [{'court': 'Supreme Court', 'name': clean(n)} for n in re.findall(r'<li><span><b>([^<]*\([^<)]*\))</b>', page)]
        intro = 'New York Supreme Court justices are elected by judicial district, so the seats on your ballot depend on your district.'
    if st == 'mi':
        keep = []
        for e in depends:
            m = re.match(r'District (\d)', e['court'])
            if m:
                for c in MI_DISTRICTS[int(m.group(1))]:
                    counties.setdefault(c, []).append({'court': 'Court of Appeals, District ' + m.group(1), 'name': e['name']})
            else:
                keep.append(e)
        depends = keep
        intro = 'Michigan Supreme Court candidates are on every ballot. Your county is in one of four Court of Appeals districts.'
    if st == 'mo':
        keep = []
        for e in depends:
            m = re.search(r'(Eastern|Southern|Western) District', e['court'])
            if m:
                tbl = {'Eastern': MO_EASTERN, 'Southern': MO_SOUTHERN, 'Western': MO_WESTERN}[m.group(1)]
                for c in tbl:
                    counties.setdefault(c, []).append({'court': 'Court of Appeals, ' + m.group(1) + ' District', 'name': e['name']})
            else:
                keep.append(e)
        depends = keep
    if st == 'md':
        keep = []
        for e in depends:
            if 'Appellate Circuit 4' in e['court']:
                counties.setdefault("Prince George's", []).append({'court': 'Supreme Court of Maryland, 4th Appellate Circuit', 'name': e['name']})
            else:
                keep.append(e)
        depends = keep
    return {
        'state': st.upper(), 'page': 'races/judges.html', 'intro': intro,
        'statewide': statewide, 'counties': counties, 'dependsCount': len(depends),
    }


# Colorado: judicial districts and the counties they cover (Colorado Judicial Branch, trial courts by district)
CO_DISTRICTS = {
    1: ['Gilpin', 'Jefferson'], 2: ['Denver'], 3: ['Huerfano', 'Las Animas'], 4: ['El Paso', 'Teller'],
    5: ['Clear Creek', 'Eagle', 'Lake', 'Summit'], 6: ['Archuleta', 'La Plata', 'San Juan'],
    7: ['Delta', 'Gunnison', 'Hinsdale', 'Montrose', 'Ouray', 'San Miguel'], 8: ['Jackson', 'Larimer'],
    9: ['Garfield', 'Pitkin', 'Rio Blanco'], 10: ['Pueblo'], 11: ['Chaffee', 'Custer', 'Fremont', 'Park'],
    12: ['Alamosa', 'Conejos', 'Costilla', 'Mineral', 'Rio Grande', 'Saguache'],
    13: ['Kit Carson', 'Logan', 'Morgan', 'Phillips', 'Sedgwick', 'Washington', 'Yuma'],
    14: ['Grand', 'Moffat', 'Routt'], 15: ['Baca', 'Cheyenne', 'Kiowa', 'Prowers'], 16: ['Bent', 'Crowley', 'Otero'],
    17: ['Adams', 'Broomfield'], 18: ['Arapahoe'], 19: ['Weld'], 20: ['Boulder'], 21: ['Mesa'],
    22: ['Dolores', 'Montezuma'], 23: ['Douglas', 'Elbert', 'Lincoln'],
}
CO_TAGS = {
    'William David Alexander': 'Commission: does not meet performance standards (7-3).',
    'Dina M. Christiansen': 'Local commission: does not meet performance standards (5-2); statewide commission: meets under the circumstances (8-0).',
    'Jeremy P Boyce': 'Commission: does not meet performance standards (unanimous).',
    'JenniLynn E. Lawrence': 'Commission: tied 4-4, counted as favorable.',
    'Elizabeth L. Harris': 'Commission: meets standards; concerns raised about timeliness of opinions.',
}


def build_co():
    s = open(os.path.join(SITE, 'guide', 'races', 'judges-rtd.html'), encoding='utf8').read()
    s = s.split('<h2 id="rtd">')[0]
    statewide, counties, seen = [], {}, set()
    for h, body in re.findall(r'<h2>([^<]*)</h2><ul>(.*?)</ul>', s, re.S):
        h = clean(h)
        names = [clean(n) for n in re.findall(r'<li>(.*?)</li>', body, re.S)]
        names = [re.sub(r'\s*(Local commission|Commission):.*$', '', n).strip() for n in names]
        m = re.match(r'District Court, (\d+)\w\w Judicial District', h)
        if h in ('Colorado Supreme Court', 'Colorado Court of Appeals'):
            for n in names:
                e = {'court': h, 'name': n}
                if n in CO_TAGS:
                    e['tag'] = CO_TAGS[n]
                statewide.append(e)
        elif m:
            for c in CO_DISTRICTS[int(m.group(1))]:
                for n in names:
                    e = {'court': h, 'name': n}
                    if n in CO_TAGS:
                        e['tag'] = CO_TAGS[n]
                    counties.setdefault(c, []).append(e)
        else:
            m2 = re.match(r'(?:Associate )?County Court, (.*) County', h)
            if m2:
                for n in names:
                    if (h.split(',')[1].strip(), n) in seen:
                        continue
                    seen.add((h.split(',')[1].strip(), n))
                    e = {'court': 'County Court, ' + m2.group(1) + ' County', 'name': n}
                    if n in CO_TAGS:
                        e['tag'] = CO_TAGS[n]
                    counties.setdefault(m2.group(1), []).append(e)
    return {'state': 'CO', 'page': 'races/judges-rtd.html', 'statewide': statewide, 'counties': counties, 'dependsCount': 0}


def main():
    wrote = []
    co = build_co()
    path = os.path.join(SITE, 'map', 'data', 'judges.json')
    json.dump(co, open(path, 'w', encoding='utf8'), indent=1, ensure_ascii=False)
    wrote.append(('co', len(co['statewide']), sum(len(v) for v in co['counties'].values()), 0))
    for st in STATES:
        d = build_ny() if st == 'ny' else build_ne() if st == 'ne' else build_state(st)
        folder = os.path.join(SITE, f'map-{st}', 'data')
        os.makedirs(folder, exist_ok=True)
        json.dump(d, open(os.path.join(folder, 'judges.json'), 'w', encoding='utf8'), indent=1, ensure_ascii=False)
        wrote.append((st, len(d['statewide']), sum(len(v) for v in d['counties'].values()), d['dependsCount']))
    for w in wrote:
        print('%s statewide=%d by-county-entries=%d depends=%d' % w)


if __name__ == '__main__':
    sys.exit(main())
