#!/usr/bin/env python3
"""Keeps the FEC money on the Money web current, with no one picking batches by hand. Standard library only, no API key.

Made to run on FRAK as the scheduled task "TheWay FEC Money Web" (install-fec-task.ps1 sets it up), but it runs on any
computer with Python 3 and git:

  python -I tools/money-trail/fec_auto.py --repo D:\\theway\\fec-auto\\repo --bulk D:\\theway\\fec-auto\\bulk
         [--drop D:\\theway\\drop\\fec] [--push]

What one run does:
  1. Makes or updates its own copy of the site repository (--repo), on main. It never works in another copy.
  2. Downloads the FEC 2025-2026 bulk files that changed (fec_bulk.py --download, into --bulk). If none changed
     since the last run, it stops there ("no change").
  3. fec_bulk.py picks the committees and their largest records, the same rule for every side.
  4. add_fec_batch.py rebuilds site/money-trail/fec-data.js, then build_home_web.py and add_money_links.py run,
     the same steps as every FEC batch before.
  5. Safety checks: fewer than 100 committees, or fewer than 60 percent of the records the site has now, stops the
     run with a note and nothing is published.
  6. With --push: commits only the data files below and pushes them to main, like the results data job.
     Without --push, or if the push fails: writes a patch to --drop for the push queue.
A log of every run is kept in --bulk/fec_auto.log. Nothing here stores a password or key: git uses the login
already on the computer.
"""
import argparse, datetime, json, os, re, subprocess, sys

REPO_URL = 'https://github.com/wrxminion/The-way-site.git'
DATA = ['site/money-trail/fec-data.js', 'site/money-trail/index.html', 'site/money-trail/home-names.json',
        'site/money-trail/home-panels.json', 'site/index.html', 'site/case-studies/index.html']

ap = argparse.ArgumentParser()
ap.add_argument('--repo', required=True)
ap.add_argument('--bulk', required=True)
ap.add_argument('--drop', default='')
ap.add_argument('--push', action='store_true')
ap.add_argument('--force', action='store_true', help='rebuild even if the FEC files did not change')
ap.add_argument('--source', default=REPO_URL, help='where to clone from (for a test)')
a = ap.parse_args()
os.makedirs(a.bulk, exist_ok=True)
LOG = os.path.join(a.bulk, 'fec_auto.log')


def log(*x):
    line = datetime.datetime.now().strftime('%Y-%m-%d %H:%M ') + ' '.join(str(i) for i in x)
    print(line, flush=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def run(cmd, cwd=None, ok=(0,)):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode not in ok:
        log('FAILED', ' '.join(cmd), (r.stdout or '')[-1500:], (r.stderr or '')[-1500:])
        sys.exit(1)
    return r


def git(*x, ok=(0,)):
    return run(['git', '-C', a.repo, *x], ok=ok)


def fec_meta():
    p = os.path.join(a.repo, 'site/money-trail/fec-data.js')
    t = open(p, encoding='utf-8').read()
    i = t.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
    return json.JSONDecoder().raw_decode(t[i:])[0]['meta']


# 1. own copy of the repository, on the newest main
if not os.path.isdir(os.path.join(a.repo, '.git')):
    log('cloning', a.source)
    run(['git', 'clone', '--depth', '50', '-b', 'main', a.source, a.repo])
git('fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main')
git('checkout', '-B', 'main', 'origin/main')
git('reset', '--hard', 'origin/main')  # this copy belongs to the job only
before = fec_meta()
old_records = before.get('records') or 0

# 2 and 3. FEC bulk files and the pick
tools = os.path.join(a.repo, 'tools', 'money-trail')
out = os.path.join(a.bulk, 'fec_bulk.json')
r = run([sys.executable, '-I', os.path.join(tools, 'fec_bulk.py'), a.bulk, out, '--download'])
log(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else 'fec_bulk.py done')
pulled = json.load(open(out, encoding='utf-8'))
was = {k: (v or {}).get('last_modified') for k, v in (before.get('files') or {}).items()}
now = {k: (v or {}).get('last_modified') for k, v in (pulled.get('files') or {}).items()}
if was == now and not a.force:
    log('no change: the FEC files are the same as the ones on the site')
    sys.exit(0)

# 4. the same steps as every batch
r = run([sys.executable, '-I', os.path.join(tools, 'add_fec_batch.py'), 'site', out, '--skip', 'C00530766'], cwd=a.repo)
log('add_fec_batch:', ' | '.join(x for x in r.stdout.strip().splitlines() if x.startswith(('records:', 'committees:'))))
run([sys.executable, '-I', os.path.join(tools, 'build_home_web.py'), 'site'], cwd=a.repo)
run([sys.executable, os.path.join(a.repo, 'tools', 'case-studies', 'add_money_links.py')], cwd=a.repo)

# 5. safety checks
after = fec_meta()
if (after.get('committees') or 0) < 100 or (after.get('records') or 0) < 0.6 * old_records:
    log('STOPPED, nothing published: committees', after.get('committees'), 'records', after.get('records'), 'before', old_records)
    git('reset', '--hard', 'origin/main')
    sys.exit(2)

# 6. publish only the data files
git('add', '--', *DATA)
if git('diff', '--cached', '--quiet', ok=(0, 1)).returncode == 0:
    log('no change in the site files')
    sys.exit(0)
day = after.get('updated') or datetime.date.today().isoformat()
msg = f"FEC data {day}: {after.get('records')} records, {after.get('committees')} committees"
git('commit', '-m', msg, '--', *DATA)  # the git name and login already set up on this computer
if a.push:
    for i in range(3):
        git('pull', '--rebase', 'origin', 'main', ok=(0, 1, 128))
        p = git('push', 'origin', 'HEAD:main', ok=(0, 1, 128))
        if p.returncode == 0:
            log('pushed:', msg)
            sys.exit(0)
    log('push failed:', (p.stderr or '')[-500:])
if a.drop:
    os.makedirs(a.drop, exist_ok=True)
    pf = os.path.join(a.drop, 'fec-data-' + re.sub(r'[^0-9-]', '', day) + '.patch')
    with open(pf, 'w', encoding='utf-8', newline='\n') as f:
        f.write(git('format-patch', '-1', '--stdout', 'HEAD').stdout)
    log('patch for the push queue:', pf)
else:
    log('not pushed and no --drop folder given')
