#!/usr/bin/env python3
"""Commit and push only the results data folder to main. No keys: uses the git login already on the machine.
Run after scrape.py. Does nothing if nothing changed. Never touches any other path.

  python3 publish.py --repo D:\\path\\to\\repo
"""
import argparse, subprocess, sys
from datetime import datetime, timezone

DATA = "site/results/data"

def git(repo, *a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)

ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True)
a = ap.parse_args()
git(a.repo, "add", "--", DATA)
if git(a.repo, "diff", "--cached", "--quiet", "--", DATA).returncode == 0:
    print("no change"); sys.exit(0)
msg = "Results data " + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
r = git(a.repo, "commit", "-m", msg, "--", DATA)
if r.returncode: sys.exit(r.stderr)
for i in range(3):
    git(a.repo, "pull", "--rebase", "origin", "main")
    p = git(a.repo, "push", "origin", "HEAD:main")
    if p.returncode == 0:
        print("pushed", msg); sys.exit(0)
sys.exit("push failed: " + p.stderr)
