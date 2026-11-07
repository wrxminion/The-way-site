#!/usr/bin/env python3
"""Building photos for the Government pages and the Money Trail department cards (D230, Nov 2026).

Every photo is public domain or Creative Commons. License, author and file page were read from the
Wikimedia Commons API on November 7, 2026 (tools: fetch_licenses.py in the project files). The image files
in site/government/photos/ are resized copies (640 px wide, or 1280 px for the four big ones), saved as webp.

Run this file to rewrite site/government/photos/photos.js, which the Money Trail page reads:
  python3 tools/government/photos.py
"""
import html
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CHECKED = 'November 7, 2026'

PHOTOS = {
    'white-house': dict(src='/government/photos/white-house-1280.webp', w=1280, h=838, alt='The north side of the White House in Washington, D.C.', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:The_White_House,_Washington,_D.C_LCCN2011632870.tif'),
    'capitol': dict(src='/government/photos/capitol-1280.webp', w=1280, h=664, alt='The west front of the U.S. Capitol in Washington, D.C.', author='Architect of the Capitol', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:United_States_Capitol_-_west_front.jpg'),
    'supreme-court': dict(src='/government/photos/supreme-court-1280.webp', w=1280, h=993, alt='The front of the Supreme Court Building in Washington, D.C.', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:U.S._Supreme_Court_building-m.jpg'),
    'eeob': dict(src='/government/photos/eeob.webp', w=640, h=509, alt='The Eisenhower Executive Office Building, next to the White House', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Old_Executive_Office_Building,_Washington,_D.C_LCCN2011630608.tif'),
    'state': dict(src='/government/photos/state.webp', w=640, h=346, alt='The Harry S Truman Building, headquarters of the Department of State', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:United_States_Department_of_State_Building_26.jpg'),
    'treasury': dict(src='/government/photos/treasury.webp', w=640, h=510, alt='The Treasury Building, headquarters of the Department of the Treasury', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:U.S._Treasury_building,_Washington,_D.C_LCCN2011631001.tif'),
    'defense': dict(src='/government/photos/defense.webp', w=640, h=417, alt='The Pentagon, headquarters of the Department of Defense, from the air', author='U.S. Navy', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:US_Navy_030926-F-2828D-405_Aerial_view_of_the_Pentagon.jpg'),
    'justice': dict(src='/government/photos/justice.webp', w=640, h=295, alt='The Robert F. Kennedy Department of Justice Building', author='APK', license='CC BY 4.0', license_url='https://creativecommons.org/licenses/by/4.0/', page='https://commons.wikimedia.org/wiki/File:Robert_F._Kennedy_Department_of_Justice_Building.jpg'),
    'interior': dict(src='/government/photos/interior.webp', w=640, h=377, alt='The Main Interior Building, headquarters of the Department of the Interior', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Department_of_Interior_headquarters_building,_Washington,_D.C_LCCN2011634641.tif'),
    'agriculture': dict(src='/government/photos/agriculture.webp', w=640, h=280, alt='The Jamie L. Whitten Building, headquarters of the Department of Agriculture', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Front_exterior,_James_L._Whitten_Federal_Building,_Washington,_D.C_LCCN2010719789.tif'),
    'commerce': dict(src='/government/photos/commerce.webp', w=640, h=292, alt='The Herbert C. Hoover Building, headquarters of the Department of Commerce', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Exterior,_Herbert_C._Hoover_Building,_U.S._Department_of_Commerce,_Washington,_D.C_LCCN2010719582.tif'),
    'labor': dict(src='/government/photos/labor.webp', w=640, h=427, alt='The Frances Perkins Building, headquarters of the Department of Labor', author='US Department of Labor', license='CC BY 2.0', license_url='https://creativecommons.org/licenses/by/2.0/', page='https://commons.wikimedia.org/wiki/File:Frances_Perkins_Building_of_the_United_States_Department_of_Labor_in_Washington,_D.C._-_8.jpg'),
    'hhs': dict(src='/government/photos/hhs.webp', w=640, h=347, alt='The Hubert H. Humphrey Building, headquarters of the Department of Health and Human Services', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Hubert_H._Humphrey_Building,_located_at_the_foot_of_Capitol_Hill,_Washington,_D.C_LCCN2013634632.jpg'),
    'hud': dict(src='/government/photos/hud.webp', w=640, h=510, alt='The Robert C. Weaver Federal Building, headquarters of the Department of Housing and Urban Development', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Robert_C._Weaver_Federal_Building,_headquarters_of_HUD,_the_U.S._Department_of_Housing_and_Urban_Development,_Washington,_D.C.,_LCCN2011633627.tiff'),
    'dot': dict(src='/government/photos/dot.webp', w=640, h=480, alt='The Department of Transportation headquarters in the Navy Yard area of Washington, D.C.', author='AgnosticPreachersKid', license='CC BY-SA 3.0', license_url='https://creativecommons.org/licenses/by-sa/3.0/', page='https://commons.wikimedia.org/wiki/File:USDOT_headquarters_-_Navy_Yard.jpg'),
    'energy': dict(src='/government/photos/energy.webp', w=640, h=494, alt='The James V. Forrestal Building, headquarters of the Department of Energy', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:The_James_Forrestal_Building,_headquarters_of_the_U.S._Department_of_Energy_on_Independence_Avenue,_Washington,_D.C_LCCN2011635887.tif'),
    'education': dict(src='/government/photos/education.webp', w=640, h=427, alt='The Lyndon Baines Johnson Building, headquarters of the Department of Education', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Lyndon_Baines_Johnson_Federal_Building,_Washington,_D.C_LCCN2016648206.tif'),
    'va': dict(src='/government/photos/va.webp', w=640, h=673, alt='The Department of Veterans Affairs headquarters building on Vermont Avenue', author='APK', license='CC BY 4.0', license_url='https://creativecommons.org/licenses/by/4.0/', page='https://commons.wikimedia.org/wiki/File:Veterans_Administration_Building_-_November_2023.jpg'),
    'dhs': dict(src='/government/photos/dhs.webp', w=640, h=311, alt='The Center Building on the St. Elizabeths campus, headquarters of the Department of Homeland Security', author='Tia Duffour', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:DHS_St_Elizabeth%27s_Building_1.jpg'),
    'epa': dict(src='/government/photos/epa.webp', w=640, h=480, alt='The William Jefferson Clinton Federal Building, headquarters of the Environmental Protection Agency', author='Moreau1', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:EPA_HQ_-_WJ_Clinton_Building_-_Main_entrance_-_2018d.jpg'),
    'fed': dict(src='/government/photos/fed-1280.webp', w=1280, h=871, alt='The Marriner S. Eccles Building, home of the Federal Reserve Board', author='Federal Reserve', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Eccles_Building_(26088200676).jpg'),
    'archives': dict(src='/government/photos/archives.webp', w=640, h=463, alt='The National Archives Building on Pennsylvania Avenue', author='Carol M. Highsmith, Library of Congress', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:Pennsylvania_Avenue_view_of_the_National_Archives_building,_Washington,_D.C_LCCN2011633826.tif'),
    'nasa': dict(src='/government/photos/nasa.webp', w=640, h=495, alt='The Mary W. Jackson NASA Headquarters building', author='NASA', license='Public domain', license_url='', page='https://commons.wikimedia.org/wiki/File:NASA_HQ_Building.jpg'),
    'gao': dict(src='/government/photos/gao.webp', w=640, h=380, alt='The Government Accountability Office building', author='AgnosticPreachersKid', license='CC BY-SA 4.0', license_url='https://creativecommons.org/licenses/by-sa/4.0/', page='https://commons.wikimedia.org/wiki/File:General_Accounting_Office_Building.jpg'),
    'gsa': dict(src='/government/photos/gsa.webp', w=640, h=457, alt='The General Services Administration headquarters building', author='APK', license='CC BY 4.0', license_url='https://creativecommons.org/licenses/by/4.0/', page='https://commons.wikimedia.org/wiki/File:United_States_General_Services_Administration_Building_-_Washington,_D.C.jpg'),
}

# Money Trail budget rows (USAspending agency abbreviation) that show a building photo. SSA and OPM have none:
# no free photo of their headquarters was found.
BUDGET_ABBR = {'TREAS': 'treasury', 'HHS': 'hhs', 'DOD': 'defense', 'DHS': 'dhs', 'VA': 'va', 'USDA': 'agriculture',
               'HUD': 'hud', 'DOT': 'dot', 'ED': 'education', 'DOE': 'energy', 'DOI': 'interior', 'DOS': 'state',
               'DOL': 'labor', 'DOJ': 'justice', 'GSA': 'gsa', 'EPA': 'epa', 'DOC': 'commerce', 'NASA': 'nasa',
               'GAO': 'gao', 'NARA': 'archives', 'EOP': 'eeob'}


def credit_html(key):
    """The credit line. Creative Commons photos name the author, the license (linked) and the source (linked)."""
    p, e = PHOTOS[key], html.escape
    if p['license'] == 'Public domain':
        return 'Photo: <a href="%s">%s ↗</a>. Public domain.' % (e(p['page']), e(p['author']))
    return 'Photo: %s, <a href="%s">%s ↗</a>, via <a href="%s">Wikimedia Commons ↗</a>.' % (
        e(p['author']), e(p['license_url']), e(p['license']), e(p['page']))


def figure_html(key, cls='gv-photo', lazy=True):
    p, e = PHOTOS[key], html.escape
    return ('<figure class="%s"><img src="%s" width="%d" height="%d" alt="%s" decoding="async"%s>'
            '<figcaption>%s</figcaption></figure>') % (cls, e(p['src']), p['w'], p['h'], e(p['alt']),
                                                   ' loading="lazy"' if lazy else '', credit_html(key))


def main():
    data = {abbr: PHOTOS[k] for abbr, k in BUDGET_ABBR.items()}
    out = os.path.join(ROOT, 'site', 'government', 'photos', 'photos.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Built by tools/government/photos.py. Building photos for Money Trail department cards (D230).\n')
        fh.write('// Licenses checked on Wikimedia Commons, ' + CHECKED + '. Public domain or Creative Commons only.\n')
        fh.write('window.TW_BUILDING_PHOTOS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('wrote', out, len(data), 'photos')


if __name__ == '__main__':
    main()
