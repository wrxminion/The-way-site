"""Builds site/get-involved/contact-your-senator/words.js, the English word list the "your own words" box uses
to fix spelling in the browser (D286, Nov 2026). Nothing typed on the page is sent anywhere; the list is a static file.

Source: the English word frequency list in pyspellchecker (MIT license, https://github.com/barrust/pyspellchecker),
built from OpenSubtitles word counts (P. Lison and J. Tiedemann, 2016). Pass the path to its en.json.gz:

    python3 tools/contact-senator/build_words.py path/to/spellchecker/resources/en.json.gz

Words are written most common first, so a word's place in the list is its rank."""
import gzip
import json
import os
import re
import sys

TOP = 60000
# Civic words that must count as spelled right even when they are rare in film subtitles.
CIVIC = '''medicare medicaid filibuster gerrymandering gerrymander tariff tariffs senator senators congressman congresswoman
congresspeople representative representatives bipartisan appropriations caucus constituent constituents legislation legislator
legislators subpoena impeachment impeach veterans veteran's ssi snap wic obamacare aca deportation deportations immigration
immigrants asylum citizenship ballot ballots redistricting lobbyist lobbyists lobbying pac pacs dark corruption accountability
infrastructure permitting pipeline pipelines climate emissions renewable solar wind fracking groundwater wildfire wildfires
affordable housing rent rents mortgage tuition student loans childcare pre-k healthcare premiums deductible deductibles copay
prescription prescriptions insulin pharmaceutical opioid fentanyl tinnitus apnea disability disabilities ssdi'''.split()
DROP = {'u', 'ur', 'r', 'n', 'b', 'c', 'y', 'k', 'yr', 'thx', 'pls', 'plz', 'cuz', 'cos', 'coz', 'tho', 'wat', 'wut', 'dat', 'dis', 'ya', 'yall'}


def main(path):
    d = json.load(gzip.open(path, 'rt'))
    words = sorted((k for k in d if re.fullmatch(r"[a-z]+(?:'[a-z]+)?", k) and k not in DROP), key=lambda k: (-d[k], k))[:TOP]
    have = set(words)
    words += [w for w in CIVIC if w not in have and re.fullmatch(r"[a-z'-]+", w)]
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    out = os.path.join(root, 'site', 'get-involved', 'contact-your-senator', 'words.js')
    with open(out, 'w') as f:
        f.write('// English words, most common first, for spelling fixes in the "your own words" box. Built by\n'
                '// tools/contact-senator/build_words.py from pyspellchecker (MIT) word counts from OpenSubtitles. Do not edit by hand.\n')
        f.write('window.CS_WORDS=' + json.dumps(' '.join(words)) + ';\n')
    print('words.js:', len(words), 'words,', os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main(sys.argv[1])
