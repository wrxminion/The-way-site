#!/usr/bin/env python3
"""Write a dated outcome summary into each Election Study that has a results contest (D204, Nov 2026).

Why: the live Passed / Failed / Not yet called box (site/results/outcome.js) needs JavaScript and the
results feed. This writes the same facts into the page itself, with the date they were true, so the
outcome, the official source and the original voter-guide entry are there even with scripts off.
When outcome.js runs it replaces this summary with the live box.

Reads only site/results/measure-pages.json and site/results/data/*.json (the collector's files).
Never calls a measure: a call comes only from the data ("called" by AP or the state, or certified).

Run from the repository root after the results files update:
    python3 tools/build-study-outcomes.py           # rewrites the summaries
    python3 tools/build-study-outcomes.py --check   # lists what would change, writes nothing
"""
import datetime, html, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
START, END = '<!-- outcome-summary:start (tools/build-study-outcomes.py) -->', '<!-- outcome-summary:end -->'
CSS = '<link rel="stylesheet" href="/results/outcome.css?v=d204">'
MT = datetime.timezone(datetime.timedelta(hours=-7))  # Mountain Standard Time after Nov 1, 2026


def mt(iso):
    if not iso:
        return ''
    d = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00'))
    tz = MT if d >= datetime.datetime(2026, 11, 1, 8, tzinfo=datetime.timezone.utc) else datetime.timezone(datetime.timedelta(hours=-6))
    d = d.astimezone(tz)
    h = d.hour % 12 or 12
    return '%s %d, %d, %d:%02d %s %s' % (d.strftime('%B'), d.day, d.year, h, d.minute, 'AM' if d.hour < 12 else 'PM', 'MT')


def side(c):
    s = ('%s %s' % (c.get('id', ''), c.get('name', ''))).lower().strip()
    if re.match(r'^(yes|for|approve)\b', s):
        return 'yes'
    if re.match(r'^(no|against|reject)\b', s):
        return 'no'
    return None


def esc(t):
    return html.escape(str(t), quote=True)


def summary(entry, contest, data, source):
    st = entry['state']
    cl = contest.get('called') or {}
    yes = next((c for c in contest.get('choices', []) if side(c) == 'yes'), None)
    no = next((c for c in contest.get('choices', []) if side(c) == 'no'), None)
    total = sum(c.get('votes') or 0 for c in contest.get('choices', []))
    winner = next((c for c in contest.get('choices', []) if cl.get('winner') and c.get('id') == cl['winner']), None)
    ws = side(winner) if winner and cl.get('kind') != 'state_leader' else None
    certified = cl.get('kind') == 'certified' or (data.get('certified') is True and cl.get('kind') not in ('ap', 'state_leader'))
    if ws:
        word = 'Passed' if ws == 'yes' else 'Failed'
        who = 'certified by the state' if certified else 'what AP is calling (not certified)' if cl.get('kind') == 'ap' else 'called by %s (not certified)' % (cl.get('by') or 'the official source')
        cls = 'mo-passed' if ws == 'yes' else 'mo-failed'
    elif total:
        word, who, cls = 'Not yet called', 'not called and not certified', 'mo-wait'
    else:
        word, who, cls = 'No count yet', 'no count collected yet', 'mo-wait'
    when = mt(source.get('data_updated_at') if source else data.get('updated_at'))
    out = [START, '<section class="mo %s mo-static" aria-label="Election result">' % cls,
           '<p class="mo-eyebrow">Result of the November 3, 2026 vote</p>',
           '<p class="mo-word">%s</p>' % word,
           '<p class="mo-asof">As of %s (when the official source last updated): %s.</p>' % (esc(when), esc(who))]
    fine = []
    if total and yes and no:
        fine.append('Count so far, as collected from the official source: YES %s (%.1f%%), NO %s (%.1f%%).' % (
            format(yes.get('votes') or 0, ','), 100.0 * (yes.get('votes') or 0) / total,
            format(no.get('votes') or 0, ','), 100.0 * (no.get('votes') or 0) / total))
    if cl.get('kind') == 'state_leader' and winner:
        fine.append('The state results page shows %s ahead. That is the count so far, not a call.' % ({'yes': 'YES', 'no': 'NO'}.get(side(winner)) or winner.get('name')))
    if entry.get('needs'):
        fine.append('Needed to pass, per our voter guide: %s.' % entry['needs'])
    fine.append('This is the certified result.' if certified else 'The count changes until every vote is counted. Results are not final until the state certifies them.')
    out.append('<p class="mo-fine">%s</p>' % esc(' '.join(fine)))
    links = []
    if source and str(source.get('url', '')).startswith('https://'):
        links.append('<a href="%s" rel="noopener">Official result: %s</a>' % (esc(source['url']), esc(source.get('name') or 'state results site')))
    links.append('<a href="/results/?state=%s&amp;race=%s">This result on our results page</a>' % (esc(st), esc(entry['contest'])))
    if entry.get('guide'):
        links.append('<a href="%s">Original 2026 voter guide entry</a>' % esc(entry['guide']))
    out += ['<p class="mo-links">%s</p>' % ' '.join(links), '</section>', END]
    badge = 'Election held November 3, 2026: %s' % (who if ws else 'not yet called')
    return '\n'.join(out), badge


def main():
    check = '--check' in sys.argv
    pages = json.load(open(os.path.join(ROOT, 'results', 'measure-pages.json')))['pages']
    manifest = json.load(open(os.path.join(ROOT, 'results', 'data', 'manifest.json')))
    sources = {s.get('id'): s for s in manifest.get('sources', [])}
    files, changed = {}, []
    for page, entry in sorted(pages.items()):
        if not page.startswith('/case-studies/') or not entry.get('contest'):
            continue
        fn = entry.get('file', '')
        if not re.match(r'^[a-z0-9-]+\.json$', fn):
            continue
        if fn not in files:
            files[fn] = json.load(open(os.path.join(ROOT, 'results', 'data', fn)))
        data = files[fn]
        contest = next((c for c in data.get('contests', []) if c.get('id') == entry['contest']), None)
        if not contest:
            print('no contest', page, entry['contest'])
            continue
        ids = data.get('source_ids') or []
        source = sources.get(ids[0]) if len(ids) == 1 else None
        box, badge = summary(entry, contest, data, source)
        path = os.path.join(ROOT, page.lstrip('/'))
        s = open(path, encoding='utf-8').read()
        new = s
        if START in new:
            new = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda m: box, new, flags=re.S)
        else:
            new = re.sub(r'(<h1[^>]*>.*?</h1>\n?)', lambda m: m.group(1) + box + '\n', new, count=1, flags=re.S)
        new = re.sub(r'<span class="badge pending">[^<]*</span>', '<span class="badge pending">%s</span>' % esc(badge), new, count=1)
        if CSS not in new:
            new = new.replace('</head>', CSS + '\n</head>', 1)
        if new != s:
            changed.append(page)
            if not check:
                open(path, 'w', encoding='utf-8').write(new)
    print(('would change' if check else 'changed'), len(changed))
    for p in changed:
        print(' ', p)


if __name__ == '__main__':
    main()
