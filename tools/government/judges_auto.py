#!/usr/bin/env python3
"""Keeps the federal judges on the Government page current, with no one downloading files by hand. Standard library only, no key.

The cloud cannot reach fjc.gov or uscourts.gov, so this runs on a home computer as the scheduled task
"TheWay Judges Refresh" (install-judges-task.ps1 sets it up):

  python -I tools/government/judges_auto.py --repo D:\\theway\\judges-auto\\repo --files D:\\theway\\judges-auto\\files [--push]

What one run does:
  1. Makes or updates its own copy of the site repository (--repo), on main. It never works in another copy.
  2. Downloads the Federal Judicial Center's judges.csv and the U.S. Courts "Future Judicial Vacancies" page into --files.
     If both are the same as last run (same SHA-256), it stops there ("no change").
  3. future_vacancies.py, then build_courts.py <judges.csv>: the same two steps as a refresh by hand.
  4. Safety checks: fewer than 1,200 judge pages, or fewer than 90 percent of the pages the site has now,
     stops the run with a note and nothing is published.
  5. With --push: commits only the courts pages and the vacancies file and pushes them to main, like the FEC data job.
     Without --push, or if the push fails: leaves the commit in --repo and says so in the log.
A log of every run is kept in --files/judges_auto.log. Nothing here stores a password or key: git uses the login
already on the computer.
"""
import argparse, datetime, hashlib, json, os, subprocess, sys, urllib.request

REPO_URL = 'https://github.com/wrxminion/The-way-site.git'
FJC_FILE = 'https://www.fjc.gov/sites/default/files/history/judges.csv'
VAC_PAGE = 'https://www.uscourts.gov/data-news/judicial-vacancies/future-judicial-vacancies'
DATA = ['site/government/courts', 'tools/government/data/future-vacancies.json']
UA = 'Mozilla/5.0 (TheWay judges refresh; public data)'

ap = argparse.ArgumentParser()
ap.add_argument('--repo', required=True)
ap.add_argument('--files', required=True)
ap.add_argument('--push', action='store_true')
ap.add_argument('--force', action='store_true', help='rebuild even if the files did not change')
ap.add_argument('--source', default=REPO_URL, help='where to clone from (for a test)')
ap.add_argument('--test-csv', default='', help='use this judges.csv instead of downloading one (for a test; never pushes)')
a = ap.parse_args()
os.makedirs(a.files, exist_ok=True)
LOG = os.path.join(a.files, 'judges_auto.log')
STATE = os.path.join(a.files, 'last_run.json')


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


def fetch(url, path, min_bytes):
    tmp = path + '.part'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r, open(tmp, 'wb') as f:
            f.write(r.read())
    except Exception as ex:  # a failed download publishes nothing
        log('FAILED download', url, ex)
        sys.exit(1)
    if os.path.getsize(tmp) < min_bytes:
        log('FAILED download', url, 'only', os.path.getsize(tmp), 'bytes')
        sys.exit(1)
    os.replace(tmp, path)
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def judge_pages():
    d = os.path.join(a.repo, 'site', 'government', 'courts', 'judges')
    return len([f for f in os.listdir(d) if f.endswith('.html')]) if os.path.isdir(d) else 0


# 1. own copy of the repository, on the newest main
if not os.path.isdir(os.path.join(a.repo, '.git')):
    log('cloning', a.source)
    run(['git', 'clone', '--depth', '50', '-b', 'main', a.source, a.repo])
    git('config', 'core.autocrlf', 'false')
git('fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main')
git('checkout', '-B', 'main', 'origin/main')
git('reset', '--hard', 'origin/main')  # this copy belongs to the job only
before = judge_pages()

# 2. the two public files
csv_path = os.path.join(a.files, 'judges.csv')
vac_path = os.path.join(a.files, 'future-vacancies.html')
if a.test_csv:
    csv_path, a.push, a.force = a.test_csv, False, True
now = {'judges.csv': a.test_csv or fetch(FJC_FILE, csv_path, 1_000_000), 'future-vacancies.html': fetch(VAC_PAGE, vac_path, 20_000)}
was = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {}
if was.get('sha') == now and not a.force:
    log('no change: the FJC file and the vacancies page are the same as last run')
    sys.exit(0)

# 3. the same steps as a refresh by hand
env = dict(os.environ, FJC_DOWNLOADED=datetime.date.today().isoformat())
tools = os.path.join(a.repo, 'tools', 'government')
r = run([sys.executable, '-I', os.path.join(tools, 'future_vacancies.py'), vac_path], cwd=a.repo)
log(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else 'future_vacancies.py done')
r = subprocess.run([sys.executable, '-I', os.path.join(tools, 'build_courts.py'), csv_path], cwd=a.repo, capture_output=True, text=True, env=env)
if r.returncode != 0:
    log('FAILED build_courts.py', (r.stderr or '')[-1500:])
    git('reset', '--hard', 'origin/main')
    sys.exit(1)

# 4. safety checks
after = judge_pages()
if after < 1200 or after < 0.9 * before:
    log('STOPPED, nothing published: judge pages', after, 'before', before)
    git('reset', '--hard', 'origin/main')
    git('clean', '-fdq', '--', 'site/government/courts')
    sys.exit(2)

# 5. publish only the courts files
git('add', '-A', '--', *DATA)
if git('diff', '--cached', '--quiet', ok=(0, 1)).returncode == 0:
    log('no change in the site files')
    json.dump({'sha': now, 'run': datetime.datetime.now().isoformat(timespec='minutes')}, open(STATE, 'w', encoding='utf-8'))
    sys.exit(0)
msg = 'Federal judges data %s: %d judge pages (was %d)' % (datetime.date.today().isoformat(), after, before)
git('commit', '-m', msg)  # the git name and login already set up on this computer
if a.push:
    for i in range(3):
        git('pull', '--rebase', 'origin', 'main', ok=(0, 1, 128))
        p = git('push', 'origin', 'HEAD:main', ok=(0, 1, 128))
        if p.returncode == 0:
            log('published:', msg)
            json.dump({'sha': now, 'run': datetime.datetime.now().isoformat(timespec='minutes')}, open(STATE, 'w', encoding='utf-8'))
            sys.exit(0)
    log('FAILED push after 3 tries; the commit is waiting in', a.repo)
    sys.exit(1)
log('built, not pushed (no --push):', msg)
