#!/usr/bin/env python3
"""The Way: local resources for the district lookup page (/lookup/).

Runs on a home machine with a local Ollama model. No API keys, no tokens, no passwords.
Only public official pages are read. See README.md in this folder.

  python local_resources.py --config config.json seed      # build candidate list from the official .gov registry
  python local_resources.py --config config.json run       # one scheduled run: check sites, find election dates, publish
  python local_resources.py --config config.json publish   # write site data from checked items (and push if allowed)
  python local_resources.py --config config.json report    # write review.md (what failed or needs a person)

Every published link and election date has passed two checks: code checks (page loads, official
domain, quote is word for word on the page, date is real and upcoming) and two different local
models that must both say yes. Anything else goes to review.md, never to the site.
"""
import argparse, csv, datetime as dt, html, html.parser, io, json, os, re, subprocess, sys, time
import urllib.error, urllib.parse, urllib.request, urllib.robotparser

SCHEMA = 'theway-local/1'
REGISTRY_URL = 'https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-full.csv'
KINDS = {
    'election_office': 'Election office',
    'clerk': 'Clerk or recorder',
    'government': 'Official government website',
    'library': 'Public library',
    'state_election_office': 'State election office',
}
KIND_WORDS = {
    'election_office': 'elections or voter registration office',
    'clerk': 'clerk or recorder office',
    'government': 'government home page',
    'library': 'public library',
    'state_election_office': 'elections office',
}
# Words in link text or address that make a page worth checking, per kind.
LINK_WORDS = {
    'election_office': r'\belections?\b|\bvot(e|er|ers|ing)\b|\bballots?\b|registrar|supervisor of elections|board of elections',
    'clerk': r'\bclerk\b|\brecorder\b|\bauditor\b|\bregister of deeds\b',
    'library': r'\blibrar',
}
UPCOMING_MAX_DAYS = 400
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

# ---------------------------------------------------------------- basics

def now_utc():
    return dt.datetime.now(dt.timezone.utc)

def today():
    return now_utc().date()

def log(cfg, *msg):
    line = now_utc().strftime('%Y-%m-%dT%H:%M:%SZ') + ' ' + ' '.join(str(m) for m in msg)
    print(line)
    try:
        with open(os.path.join(cfg['work'], 'local-resources.log'), 'a', encoding='utf-8') as fh:
            fh.write(line + '\n')
    except OSError:
        pass

def read_json(path, default=None):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default

def write_json(path, data, compact=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        if compact:
            json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
        else:
            json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)

def norm(s):
    s = (s or '').lower().replace('&', ' and ')
    s = re.sub(r'\bsaint\b', 'st', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def squash(s):
    return re.sub(r'\s+', ' ', html.unescape(s or '')).strip()

def load_config(path):
    cfg = read_json(path)
    if not cfg:
        sys.exit('config not found or not JSON: ' + path)
    cfg.setdefault('counties_per_run', 20)
    cfg.setdefault('max_run_min', 45)
    cfg.setdefault('request_gap_sec', 3)
    cfg.setdefault('recheck_days', 30)
    cfg.setdefault('election_recheck_days', 7)
    cfg.setdefault('publish_mode', 'hold')
    cfg.setdefault('push', False)
    cfg.setdefault('off_files', [])
    cfg.setdefault('our_models', [cfg.get('finder_model'), cfg.get('checker_model')])
    cfg.setdefault('user_agent', 'TheWayLocalResources/1.0 (+https://michiinstitute.com/lookup/)')
    if cfg.get('finder_model') == cfg.get('checker_model'):
        sys.exit('finder_model and checker_model must be two different models')
    os.makedirs(cfg['work'], exist_ok=True)
    return cfg

def counties_dir(cfg):
    return os.path.join(cfg['repo'], 'site', 'lookup', 'data', 'counties')

def states_list(cfg):
    return read_json(os.path.join(cfg['repo'], 'site', 'lookup', 'data', 'states.json'), [])

def county_label(c):
    k = c.get('k', 'county')
    n = c['n']
    if k == 'parish': return n + ' Parish'
    if k == 'city': return n if n.lower().endswith('city') else n + ' (city)'
    if k == 'borough': return n
    if k == 'district': return n
    return n + ' County'

# ---------------------------------------------------------------- yield rules

def must_yield(cfg):
    """Return a reason to stop, or None. Checked before every county."""
    for f in cfg['off_files']:
        if f and os.path.exists(f):
            return 'off file present: ' + f
    try:
        with urllib.request.urlopen(cfg['ollama_url'].rstrip('/') + '/api/ps', timeout=10) as r:
            ps = json.load(r)
        ours = set(m for m in cfg['our_models'] if m)
        for m in ps.get('models', []):
            if m.get('name') not in ours and m.get('model') not in ours:
                return 'another model is loaded in Ollama: ' + str(m.get('name'))
    except (urllib.error.URLError, OSError, ValueError) as e:
        return 'Ollama not reachable: ' + str(e)
    ps1 = cfg.get('busy_check_ps1')
    if ps1 and os.path.exists(ps1):
        try:
            r = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
                               capture_output=True, text=True, timeout=60)
            # FRAK's busy check prints a reason ("game ...") and exits 0, so printed text that is
            # not a plain "free" or "idle" also counts as busy. A nonzero exit is busy too.
            said = (r.stdout or '').strip()
            if r.returncode != 0 or (said and not re.match(r'^(free|idle|ok|not busy)\b', said, re.I)):
                return 'busy check says busy: ' + (said or r.stderr or 'exit ' + str(r.returncode)).strip()[:200]
        except (OSError, subprocess.TimeoutExpired) as e:
            return 'busy check failed (treated as busy): ' + str(e)
    hours = cfg.get('quiet_hours_local')  # for example [[6, 14]] = do not run 06:00 to 13:59 machine time
    if hours:
        h = dt.datetime.now().hour
        for a, b in hours:
            if a <= h < b:
                return 'quiet hours'
    return None

# ---------------------------------------------------------------- polite fetching

class Fetcher:
    def __init__(self, cfg, state):
        self.cfg = cfg
        self.state = state          # persisted host notes: blocked hosts and robots results
        self.robots = {}
        self.last = 0.0

    def _wait(self):
        gap = self.cfg['request_gap_sec'] - (time.time() - self.last)
        if gap > 0:
            time.sleep(gap)
        self.last = time.time()

    def _allowed(self, url):
        p = urllib.parse.urlsplit(url)
        base = p.scheme + '://' + p.netloc
        if base not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._wait()
                req = urllib.request.Request(base + '/robots.txt', headers={'User-Agent': self.cfg['user_agent']})
                with urllib.request.urlopen(req, timeout=20) as r:
                    rp.parse(r.read(200000).decode('utf-8', 'replace').splitlines())
            except urllib.error.HTTPError as e:
                rp.parse([] if e.code in (404, 410) else ['User-agent: *', 'Disallow: /'])
            except (urllib.error.URLError, OSError, ValueError):
                rp.parse([])
            self.robots[base] = rp
        return self.robots[base].can_fetch(self.cfg['user_agent'], url)

    def get(self, url):
        """Return (final_url, html_text) or raise FetchError. Never retries around a block."""
        host = urllib.parse.urlsplit(url).netloc.lower()
        blocked = self.state.setdefault('blocked', {})
        until = blocked.get(host)
        if until and until > now_utc().isoformat():
            raise FetchError('host paused until ' + until)
        if not self._allowed(url):
            raise FetchError('robots.txt does not allow this page')
        self._wait()
        req = urllib.request.Request(url, headers={'User-Agent': self.cfg['user_agent'], 'Accept': 'text/html,application/xhtml+xml'})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                ctype = r.headers.get('Content-Type', '')
                if 'html' not in ctype:
                    raise FetchError('not a web page (' + ctype[:40] + ')')
                body = r.read(1500000)
                final = r.geturl()
        except urllib.error.HTTPError as e:
            if e.code in (403, 429, 503):
                # A block, a rate limit or a challenge page: stop asking this host for a week. No workarounds.
                blocked[host] = (now_utc() + dt.timedelta(days=7)).isoformat()
            raise FetchError('HTTP ' + str(e.code))
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise FetchError(str(e)[:120])
        charset = 'utf-8'
        m = re.search(r'charset=([\w-]+)', ctype)
        if m:
            charset = m.group(1)
        text = body.decode(charset, 'replace')
        low = text[:5000].lower()
        if 'captcha' in low or 'cf-challenge' in low or 'just a moment...' in low:
            blocked[host] = (now_utc() + dt.timedelta(days=7)).isoformat()
            raise FetchError('challenge page (not bypassed)')
        return final, text

class FetchError(Exception):
    pass

class PageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.links = []
        self.text = []
        self._in = None
        self._href = None
        self._atext = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'svg'):
            self._skip += 1
        elif tag == 'title':
            self._in = 'title'
        elif tag == 'a' and a.get('href'):
            self._href = a['href']
            self._atext = [a.get('aria-label') or a.get('title') or '']
        elif tag in ('p', 'div', 'li', 'br', 'tr', 'h1', 'h2', 'h3', 'h4', 'td', 'section'):
            self.text.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg') and self._skip:
            self._skip -= 1
        elif tag == 'title':
            self._in = None
        elif tag == 'a' and self._href is not None:
            self.links.append((self._href, squash(' '.join(self._atext))))
            self._href = None

    def handle_data(self, data):
        if self._skip:
            return
        if self._in == 'title':
            self.title += data
            return
        if self._href is not None:
            self._atext.append(data)
        self.text.append(data)

def parse_page(base_url, text):
    p = PageParser()
    try:
        p.feed(text)
    except Exception:
        pass
    body = re.sub(r'[ \t\r\f\v]+', ' ', ''.join(p.text))
    body = re.sub(r'\n\s*\n+', '\n', body).strip()
    links = []
    for href, label in p.links:
        u = urllib.parse.urljoin(base_url, href.strip())
        if u.startswith(('http://', 'https://')):
            links.append((urllib.parse.urldefrag(u)[0], label))
    return squash(p.title), body, links

def site_of(url):
    host = urllib.parse.urlsplit(url).netloc.lower().split(':')[0]
    parts = host.split('.')
    if host.endswith('.us') and len(parts) >= 4:
        return '.'.join(parts[-4:])   # co.boulder.co.us style
    return '.'.join(parts[-2:])

def official_domain(url, allowed_sites):
    host = urllib.parse.urlsplit(url).netloc.lower().split(':')[0]
    if host.endswith('.gov') or host.endswith('.us'):
        return True
    return site_of(url) in allowed_sites

# ---------------------------------------------------------------- local models

def ask(cfg, model, prompt):
    data = json.dumps({'model': model, 'prompt': prompt, 'stream': False, 'format': 'json',
                       'options': {'temperature': 0, 'num_ctx': 8192}}).encode()
    req = urllib.request.Request(cfg['ollama_url'].rstrip('/') + '/api/generate', data=data,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            out = json.load(r).get('response', '')
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise FetchError('model call failed: ' + str(e)[:100])
    out = re.sub(r'<think>.*?</think>', '', out, flags=re.S).strip()
    try:
        return json.loads(out)
    except ValueError:
        m = re.search(r'\{.*\}', out, re.S)
        return json.loads(m.group(0)) if m else {}

FIND_PROMPT = """You read one web page for a nonpartisan voter guide. Answer only from the page text below.
Place: {place}, {state}.
Page address: {url}
Page title: {title}

1. kind: which ONE of these is this page? "election_office" (the official office that runs elections or voter registration for this place), "clerk" (the official clerk or recorder office for this place, not mainly about elections), "library" (an official public library for this place), "government" (the official home page of this place's government), or "none".
2. serves: the name of the county, parish, city or town this office serves, copied from the page, or "".
3. elections: upcoming elections the page names for this place, with a full date. For each give "date" as YYYY-MM-DD, "name" copied from the page, and "quote": the exact words from the page (one sentence, copied word for word) that give the date. If none, give [].

Reply with JSON only: {{"kind": "...", "serves": "...", "elections": [{{"date": "...", "name": "...", "quote": "..."}}]}}

Page text:
{text}
"""

CHECK_KIND_PROMPT = """Check one claim about a web page. Answer only from the page text below.
Code has already checked that this address belongs to a government (or is linked from a government site), so do not ask whether the page calls itself "official".
Claim: this page belongs to {place}, {state}, and it is mainly about its {kind_label}.
Page address: {url}
Page title: {title}
Say "yes" if the page text or title shows both parts of the claim. Say "no" if it is about a different place or a different office.
Reply with JSON only: {{"answer": "yes" or "no", "why": "one short sentence"}}

Page text:
{text}
"""

CHECK_ELECTION_PROMPT = """Check one claim. Answer only from the quoted words.
Claim: an election ("{name}") is held in or for {place}, {state} on {date_words}.
Quoted from {url}: "{quote}"
Does the quote itself say this? Reply with JSON only: {{"answer": "yes" or "no", "why": "one short sentence"}}
"""

# ---------------------------------------------------------------- code checks on election dates

def date_words(d):
    return MONTHS[d.month - 1].capitalize() + ' ' + str(d.day) + ', ' + str(d.year)

def quote_has_date(quote, d):
    q = quote.lower()
    m = MONTHS[d.month - 1]
    forms = [
        m + ' ' + str(d.day), m[:3] + ' ' + str(d.day), m[:3] + '. ' + str(d.day),
        '%d/%d/%d' % (d.month, d.day, d.year), '%02d/%02d/%d' % (d.month, d.day, d.year),
        '%d/%d/%02d' % (d.month, d.day, d.year % 100), d.isoformat(), '%d-%d-%d' % (d.month, d.day, d.year),
    ]
    if not any(f in q for f in forms):
        return False
    # The year must be in the quote, unless it uses a numeric form that already has it.
    return str(d.year) in q or ('%02d' % (d.year % 100)) in q

def check_election(e, page_text):
    """Code checks. Returns (ok, why)."""
    try:
        d = dt.date.fromisoformat(str(e.get('date', ''))[:10])
    except ValueError:
        return False, 'date is not YYYY-MM-DD'
    if d < today():
        return False, 'date is in the past'
    if (d - today()).days > UPCOMING_MAX_DAYS:
        return False, 'date is more than 400 days away'
    quote = squash(e.get('quote', ''))
    if len(quote) < 12 or len(quote) > 400:
        return False, 'quote missing or too long'
    if norm(quote) not in norm(page_text):
        return False, 'quote is not word for word on the page'
    if not quote_has_date(quote, d):
        return False, 'quote does not contain the date'
    name = squash(e.get('name', ''))[:120]
    if not name or norm(name) not in norm(page_text):
        return False, 'election name is not on the page'
    return True, ''

# ---------------------------------------------------------------- seed from the official .gov registry

def rank(cands):
    """Election, clerk and library sites first, then the main government site (shortest address), one per address."""
    seen, out = set(), []
    for c in cands:
        key = c['url'].replace('://www.', '://')
        if key not in seen:
            seen.add(key); out.append(c)
    def score(c):
        hay = (c['url'] + ' ' + c['org'] + ' ' + c.get('sub', '')).lower()
        if re.search(r'vote|elect|ballot|registrar', hay): return (0, len(c['url']))
        if re.search(r'clerk|recorder|auditor|librar', hay): return (1, len(c['url']))
        if re.search(r'sheriff|treasurer|assessor|attorney|court|jail|health|hhs|fire|police|recovery|disaster|odm|emergency|parks|water|transit', hay): return (3, len(c['url']))
        return (2, len(c['url']))
    return [c for c in sorted(out, key=score) if score(c)[0] < 3]   # skip sheriff, courts, health and the like

def state_page_links(cfg, name):
    path = os.path.join(cfg['repo'], 'site', 'states', re.sub(r'[^a-z]+', '-', name.lower()).strip('-') + '.html')
    try:
        text = open(path, encoding='utf-8').read()
    except OSError:
        return []
    out = []
    for u in re.findall(r'href="(https://[^"]+)"', text):
        host = urllib.parse.urlsplit(u).netloc.lower()
        if (host.endswith('.gov') or host.endswith('.us')) and host not in ('vote.gov', 'www.vote.gov'):
            root = 'https://' + host + '/'
            if root not in out: out.append(root)
    return out

def seed(cfg):
    reg_path = os.path.join(cfg['work'], 'dotgov-current-full.csv')
    log(cfg, 'downloading the .gov registry from', REGISTRY_URL)
    req = urllib.request.Request(REGISTRY_URL, headers={'User-Agent': cfg['user_agent']})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    with open(reg_path, 'wb') as fh:
        fh.write(raw)
    rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8', 'replace'))))
    by_state = {}
    for r in rows:
        by_state.setdefault(r.get('State', ''), []).append(r)
    total = matched = 0
    for st in states_list(cfg):
        abbr = st['abbr']
        cpath = os.path.join(counties_dir(cfg), abbr.lower() + '.json')
        fc = read_json(cpath, {'features': []})
        orgs = by_state.get(abbr, [])
        out = {'state': abbr, 'name': st['name'], 'seeded_at': now_utc().isoformat(), 'state_candidates': [], 'counties': {}}
        for r in orgs:
            org = norm(r['Organization name'] + ' ' + r.get('Suborganization name', ''))
            if r['Domain type'].startswith('State') and re.search(r'secretary of state|department of state|board of elections|election', org):
                out['state_candidates'].append({'url': 'https://' + r['Domain name'].lower() + '/', 'org': r['Organization name'], 'sub': r.get('Suborganization name', '')})
        # Official election sites already linked from our own state voting-rules page (site/states/<name>.html).
        for u in state_page_links(cfg, st['name']):
            out['state_candidates'].append({'url': u, 'org': 'linked from our ' + st['name'] + ' voting rules page', 'sub': ''})
        out['state_candidates'] = rank(out['state_candidates'])[:3]
        for f in fc['features']:
            p = f['properties']
            n = norm(p['n'])
            pats = [n + ' county', 'county of ' + n, n + ' parish', 'parish of ' + n, n + ' borough', 'borough of ' + n,
                    'municipality of ' + n, n + ' city and county', 'city and county of ' + n]
            if p.get('k') in ('city', 'district'):
                pats += ['city of ' + n, n + ' city', n]
            cands = []
            for r in orgs:
                if r['Domain type'] not in ('County', 'City'):
                    continue
                org = norm(r['Organization name'])
                if any(org == q or org.startswith(q + ' ') for q in pats):
                    cands.append({'url': 'https://' + r['Domain name'].lower() + '/', 'org': r['Organization name'], 'sub': r.get('Suborganization name', '')})
            cands = rank(cands)[:4]
            total += 1
            if cands:
                matched += 1
            out['counties'][p['f']] = {'name': county_label(p), 'candidates': cands}
        write_json(os.path.join(cfg['work'], 'seed', abbr.lower() + '.json'), out)
    log(cfg, 'seed done:', matched, 'of', total, 'counties have at least one .gov registry site')

# ---------------------------------------------------------------- one county

# A page's title or address must say what it is, so a news story or a results page is never listed as an office.
KIND_MUST = {
    'election_office': r'\belections?\b|\bvot(e|er|ers|ing)\b|registrar|supervisor of elections|board of elections',
    'state_election_office': r'\belections?\b|\bvot(e|er|ers|ing)\b|secretary of state|\bsos\b|department of state',
    'clerk': r'\bclerk\b|\brecorder\b|\bauditor\b|register of deeds',
    'library': r'\blibrar',
}
KIND_NEVER = r'\bresults?\b|clarity|canvass|\bnews\b|press release|\bclosures?\b|engagement|calendar of events|/news/|/blog/'

def kind_refused(kind, title, url, item):
    """Code check on what the finder says a page is. Returns a reason, or '' when the page is fine."""
    hay = (title + ' ' + urllib.parse.unquote(urllib.parse.urlsplit(url).path).replace('-', ' ').replace('_', ' ')).lower()
    if re.search(KIND_NEVER, hay):
        return 'title or address looks like news, results or an event, not an office page'
    pat = KIND_MUST.get(kind)
    if pat and not re.search(pat, hay):
        return 'title and address do not name the office'
    if kind == 'government':
        if urllib.parse.urlsplit(url).path.strip('/') not in ('', 'index.html', 'index.php', 'home'):
            return 'not the home page of the site'
    return ''

def check_page(cfg, fetcher, item, place, state_name, allowed_sites, notes):
    """Fetch one candidate page, ask the finder, then the checker. Returns found items."""
    url = item['url']
    try:
        final, text = fetcher.get(url)
    except FetchError as e:
        notes.append({'url': url, 'place': place, 'result': 'not loaded: ' + str(e)})
        return [], []
    if not official_domain(final, allowed_sites) and not item.get('src', '').startswith('linked from'):
        notes.append({'url': final, 'place': place, 'result': 'not an official domain'})
        return [], []
    title, body, links = parse_page(final, text)
    excerpt = body[:6000]
    try:
        f = ask(cfg, cfg['finder_model'], FIND_PROMPT.format(place=place, state=state_name, url=final, title=title, text=excerpt))
    except (FetchError, ValueError) as e:
        notes.append({'url': final, 'place': place, 'result': 'finder failed: ' + str(e)})
        return [], links
    kind = f.get('kind') if f.get('kind') in KINDS else 'none'
    found = []
    why_not = kind_refused(kind, title, final, item) if kind != 'none' else ''
    if why_not:
        notes.append({'url': final, 'place': place, 'result': 'refused by code as ' + kind + ': ' + why_not})
        kind = 'none'
    if kind != 'none':
        try:
            c = ask(cfg, cfg['checker_model'], CHECK_KIND_PROMPT.format(kind_label=KIND_WORDS[kind], place=place, state=state_name, url=final, title=title, text=excerpt))
        except (FetchError, ValueError) as e:
            c = {'answer': 'no', 'why': 'checker failed: ' + str(e)}
        if str(c.get('answer', '')).lower() == 'yes':
            found.append({'k': kind, 't': (title or KINDS[kind])[:120], 'u': final, 'c': today().isoformat(), 's': item.get('src', 'registry')})
        else:
            notes.append({'url': final, 'place': place, 'result': 'models disagree on kind ' + kind + ': ' + str(c.get('why', ''))[:160]})
    for e in (f.get('elections') or [])[:6]:
        if not isinstance(e, dict):
            continue
        ok, why = check_election(e, body)
        if not ok:
            notes.append({'url': final, 'place': place, 'result': 'election refused by code: ' + why, 'quote': str(e.get('quote', ''))[:200]})
            continue
        d = dt.date.fromisoformat(e['date'][:10])
        try:
            c = ask(cfg, cfg['checker_model'], CHECK_ELECTION_PROMPT.format(name=squash(e['name']), place=place, state=state_name, date_words=date_words(d), url=final, quote=squash(e['quote'])))
        except (FetchError, ValueError) as ex:
            c = {'answer': 'no', 'why': 'checker failed: ' + str(ex)}
        if str(c.get('answer', '')).lower() == 'yes':
            found.append({'k': 'election', 'd': d.isoformat(), 'n': squash(e['name'])[:120], 'q': squash(e['quote']), 'u': final, 'c': today().isoformat()})
        else:
            notes.append({'url': final, 'place': place, 'result': 'models disagree on election date: ' + str(c.get('why', ''))[:160], 'quote': squash(e['quote'])[:200]})
    return found, links

def pick_links(links, home, limit_per_kind=2):
    """Pages on the same site whose link text or address points at elections, the clerk or the library."""
    out, seen = [], set()
    for kind, pat in LINK_WORDS.items():
        n = 0
        for u, label in links:
            if n >= limit_per_kind:
                break
            # Election offices and libraries often have their own site (harrisvotes.com, a library .org).
            # They count only because the official site links to them, and both models must still agree.
            if kind == 'clerk' and site_of(u) != site_of(home) and not urllib.parse.urlsplit(u).netloc.endswith('.gov'):
                continue
            hay = (label + ' ' + urllib.parse.unquote(urllib.parse.urlsplit(u).path)).lower()
            if u in seen or not re.search(pat, hay) or re.search(r'\.(pdf|docx?|xlsx?|jpg|png|zip)$', u.lower()):
                continue
            seen.add(u); n += 1
            out.append({'url': u, 'src': 'linked from ' + home})
    return out

def do_place(cfg, fetcher, rec, place, state_name, notes, max_pages=8):
    """Check a county or city: its home pages, then election, clerk and library pages linked from them."""
    allowed = set(site_of(c['url']) for c in rec.get('candidates', []))
    items, queue, done = [], list(rec.get('candidates', []))[:4], set()
    pages = 0
    while queue and pages < max_pages:
        c = queue.pop(0)
        if c['url'] in done:
            continue
        done.add(c['url']); pages += 1
        found, links = check_page(cfg, fetcher, c, place, state_name, allowed, notes)
        items.extend(found)
        if c.get('src', 'registry') == 'registry' or c.get('src') == 'state directory':
            queue.extend(pick_links(links, c['url']))
    # one link per address, newest wins
    uniq = {}
    for it in items:
        uniq[(it['k'], it['u'], it.get('d'))] = it
    return list(uniq.values())

def state_directory(cfg, fetcher, abbr, seedrec, notes):
    """From the state election office site, find a county election office directory and read county links from it (code only)."""
    found, links_all = [], []
    allowed = set(site_of(c['url']) for c in seedrec['state_candidates'])
    for c in seedrec['state_candidates'][:3]:
        f, links = check_page(cfg, fetcher, {'url': c['url'], 'src': 'registry'}, seedrec['name'] + ' (statewide)', seedrec['name'], allowed, notes)
        for it in f:
            if it['k'] in ('election_office', 'government'):
                it['k'] = 'state_election_office'
                found.append(it)
        links_all.extend(links)
    # A directory page: link text like "county clerks", "county election officials", "local election offices".
    dirs = [u for u, label in links_all if re.search(r'(county|local|parish|town).{0,20}(clerk|election|registrar|auditor|official|office)', (label + ' ' + u).lower())][:2]
    county_links = {}
    names = {norm(v['name'].replace(' County', '').replace(' Parish', '')): fips for fips, v in seedrec['counties'].items()}
    for d in dirs:
        try:
            final, text = fetcher.get(d)
        except FetchError as e:
            notes.append({'url': d, 'place': seedrec['name'], 'result': 'directory not loaded: ' + str(e)})
            continue
        _, _, links = parse_page(final, text)
        for u, label in links:
            key = norm(re.sub(r'\b(county|parish|clerk|elections?|office|auditor|recorder|registrar|board)\b', ' ', label, flags=re.I))
            if key in names and site_of(u) != site_of(final):
                county_links.setdefault(names[key], []).append({'url': u, 'org': label, 'src': 'state directory'})
    return found, county_links

# ---------------------------------------------------------------- run

def acquire_lock(cfg):
    path = os.path.join(cfg['work'], 'run.lock')
    try:
        if os.path.exists(path) and time.time() - os.path.getmtime(path) > 4 * 3600:
            os.remove(path)   # a run that died hours ago
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode()); os.close(fd)
        return path
    except OSError:
        return None

def run(cfg):
    lock = acquire_lock(cfg)
    if not lock:
        log(cfg, 'another run is going, exiting'); return
    try:
        _run(cfg)
    finally:
        try: os.remove(lock)
        except OSError: pass

def _run(cfg):
    start = time.time()
    why = must_yield(cfg)
    if why:
        log(cfg, 'not running:', why); return
    hosts = read_json(os.path.join(cfg['work'], 'hosts.json'), {})
    fetcher = Fetcher(cfg, hosts)
    states = [s for s in states_list(cfg) if os.path.exists(os.path.join(cfg['work'], 'seed', s['abbr'].lower() + '.json'))]
    if not states:
        log(cfg, 'no seed files yet: run the seed command first'); return
    order = cfg.get('state_order') or []
    states.sort(key=lambda s: (order.index(s['abbr']) if s['abbr'] in order else len(order), s['name']))
    # Work list: every county and statewide office, oldest check first.
    work = []
    for s in states:
        abbr = s['abbr'].lower()
        found = read_json(os.path.join(cfg['work'], 'found', abbr + '.json'), {'state': [], 'counties': {}, 'checked': {}})
        seedrec = read_json(os.path.join(cfg['work'], 'seed', abbr + '.json'))
        last = found['checked'].get('_state', '')
        work.append((last, s, None))
        for fips in seedrec['counties']:
            work.append((found['checked'].get(fips, ''), s, fips))
    work.sort(key=lambda w: w[0])
    limit = dt.timedelta(days=cfg['election_recheck_days'])
    done = 0
    for last, s, fips in work:
        if done >= cfg['counties_per_run'] or time.time() - start > cfg['max_run_min'] * 60:
            break
        if last and now_utc() - dt.datetime.fromisoformat(last) < limit:
            break   # everything left was checked recently
        why = must_yield(cfg)
        if why:
            log(cfg, 'stopping early:', why); break
        abbr = s['abbr'].lower()
        fpath = os.path.join(cfg['work'], 'found', abbr + '.json')
        found = read_json(fpath, {'state': [], 'counties': {}, 'checked': {}})
        seedrec = read_json(os.path.join(cfg['work'], 'seed', abbr + '.json'))
        notes = []
        if fips is None:
            items, county_links = state_directory(cfg, fetcher, s['abbr'], seedrec, notes)
            found['state'] = items or found.get('state', [])
            found['directory'] = county_links
            found['checked']['_state'] = now_utc().isoformat()
            log(cfg, s['abbr'], 'statewide:', len(items), 'links,', sum(len(v) for v in county_links.values()), 'county links from the state directory')
        else:
            rec = dict(seedrec['counties'][fips])
            extra = (found.get('directory') or {}).get(fips, [])
            rec['candidates'] = list(rec.get('candidates', [])) + extra
            if not rec['candidates']:
                found['checked'][fips] = now_utc().isoformat()
                notes.append({'place': rec['name'], 'result': 'no official site known yet (not in the .gov registry or the state directory)'})
            else:
                items = do_place(cfg, fetcher, rec, rec['name'], s['name'], notes)
                old = found['counties'].get(fips, [])
                # Keep a link we found before if it was not re-checked this time; it ages out after recheck_days * 3.
                keep_until = (today() - dt.timedelta(days=cfg['recheck_days'] * 3)).isoformat()
                urls = set(i['u'] for i in items if i['k'] != 'election')
                for o in old:
                    if o['k'] != 'election' and o['u'] not in urls and o['c'] >= keep_until:
                        items.append(o)
                found['counties'][fips] = items
                found['checked'][fips] = now_utc().isoformat()
                log(cfg, s['abbr'], rec['name'] + ':', len([i for i in items if i['k'] != 'election']), 'links,', len([i for i in items if i['k'] == 'election']), 'election dates')
        write_json(fpath, found)
        if notes:
            npath = os.path.join(cfg['work'], 'notes', abbr + '.json')
            allnotes = read_json(npath, [])
            stamp = now_utc().isoformat()
            allnotes = [n for n in allnotes if n.get('fips') != fips][-3000:] + [dict(n, fips=fips, at=stamp) for n in notes]
            write_json(npath, allnotes)
        write_json(os.path.join(cfg['work'], 'hosts.json'), hosts)
        done += 1
    log(cfg, 'run done:', done, 'places checked in', int(time.time() - start), 'seconds')
    publish(cfg)

# ---------------------------------------------------------------- districts to counties (code only)

def _ring_in(x, y, r):
    inside = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i][0], r[i][1]; xj, yj = r[j][0], r[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def _polys(g):
    if not g: return []
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates'] if g['type'] == 'MultiPolygon' else []

def _contains(polys, x, y):
    for p in polys:
        if _ring_in(x, y, p[0]) and not any(_ring_in(x, y, h) for h in p[1:]):
            return True
    return False

def _bbox(polys):
    xs = [pt[0] for p in polys for pt in p[0]]; ys = [pt[1] for p in polys for pt in p[0]]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

def map_data_dir(cfg, s):
    """The state map's district files. They are not in git, so if the repo copy lacks them,
    copy them from the live site (public files) into the work folder once a month."""
    local = os.path.join(cfg['repo'], 'site', s['map'], 'data')
    if os.path.exists(os.path.join(local, 'us-house.geojson')):
        return local
    base = cfg.get('map_data_url')
    if not base:
        return None
    cache = os.path.join(cfg['work'], 'mapdata', s['abbr'].lower())
    os.makedirs(cache, exist_ok=True)
    for fn in ('us-house.geojson', 'state-senate.geojson', 'state-house.geojson'):
        p = os.path.join(cache, fn)
        if os.path.exists(p) and time.time() - os.path.getmtime(p) < 30 * 86400:
            continue
        url = base.rstrip('/') + '/' + s['map'].strip('/') + '/data/' + fn
        try:
            req = urllib.request.Request(url, headers={'User-Agent': cfg['user_agent']})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read(60000000)
            json.loads(data.decode('utf-8'))
            with open(p + '.tmp', 'wb') as fh:
                fh.write(data)
            os.replace(p + '.tmp', p)
        except (urllib.error.URLError, OSError, ValueError) as e:
            log(cfg, 'map data not copied:', url, str(e)[:100])
    return cache if os.path.exists(os.path.join(cache, 'us-house.geojson')) else None

def district_counties(cfg, abbr, map_dir):
    """Which counties each district touches: sample a grid of points in every county."""
    files = {'us_house': 'us-house.geojson', 'state_senate': 'state-senate.geojson', 'state_house': 'state-house.geojson'}
    counties = read_json(os.path.join(counties_dir(cfg), abbr.lower() + '.json'), {'features': []})['features']
    cache = os.path.join(cfg['work'], 'districts', abbr.lower() + '.json')
    stamp = []
    for f in files.values():
        p = os.path.join(map_dir, f)
        stamp.append(str(os.path.getmtime(p)) if os.path.exists(p) else '-')
    old = read_json(cache)
    if old and old.get('stamp') == stamp:
        return old['districts']
    cpolys = []
    for c in counties:
        polys = _polys(c['geometry']); bb = _bbox(polys)
        if bb: cpolys.append((c['properties']['f'], polys, bb))
    out = {}
    for ch, fn in files.items():
        fc = read_json(os.path.join(map_dir, fn))
        if not fc: continue
        dist = []
        for f in fc['features']:
            polys = _polys(f.get('geometry')); bb = _bbox(polys)
            if bb: dist.append((str(f['properties'].get('d')), polys, bb))
        for fips, polys, bb in cpolys:
            n = 14
            for i in range(n):
                for j in range(n):
                    x = bb[0] + (bb[2] - bb[0]) * (i + 0.5) / n
                    y = bb[1] + (bb[3] - bb[1]) * (j + 0.5) / n
                    if not _contains(polys, x, y):
                        continue
                    for d, dp, db in dist:
                        if db[0] <= x <= db[2] and db[1] <= y <= db[3] and _contains(dp, x, y):
                            lst = out.setdefault(ch + ':' + d, [])
                            if fips not in lst: lst.append(fips)
                            break
    for k in out: out[k].sort()
    write_json(cache, {'stamp': stamp, 'districts': out})
    return out

# ---------------------------------------------------------------- publish

def same_page_once(links):
    """One entry per page: www and no www, http and https, and a trailing slash count as the same page."""
    seen, out = set(), []
    for i in links:
        p = urllib.parse.urlsplit(i['u'])
        key = (p.netloc.lower().removeprefix('www.'), p.path.rstrip('/').lower(), p.query)
        if key not in seen:
            seen.add(key); out.append(i)
    return out

def publish(cfg):
    """Write site/lookup/local/xx.json from checked items. hold mode writes to work/outbox for a person to look at first."""
    live = cfg['publish_mode'] == 'live'
    out_dir = os.path.join(cfg['repo'], 'site', 'lookup', 'local') if live else os.path.join(cfg['work'], 'outbox')
    index = {'schema': SCHEMA, 'updated_at': now_utc().isoformat(), 'states': {}}
    for s in states_list(cfg):
        abbr = s['abbr'].lower()
        found = read_json(os.path.join(cfg['work'], 'found', abbr + '.json'))
        seedrec = read_json(os.path.join(cfg['work'], 'seed', abbr + '.json'))
        if not found or not seedrec:
            continue
        counties = {}
        for fips, items in found.get('counties', {}).items():
            links = sorted([i for i in items if i['k'] != 'election'], key=lambda i: (list(KINDS).index(i['k']) if i['k'] in KINDS else 9, i['t']))
            links = same_page_once(links)
            els = sorted([i for i in items if i['k'] == 'election' and i['d'] >= today().isoformat()], key=lambda i: i['d'])
            if links or els:
                counties[fips] = {'name': seedrec['counties'][fips]['name'], 'links': links, 'elections': els}
        districts = {}
        if s.get('map'):
            map_dir = map_data_dir(cfg, s)
            if map_dir:
                districts = district_counties(cfg, s['abbr'], map_dir)
        data = {'schema': SCHEMA, 'state': s['abbr'], 'name': s['name'], 'updated_at': now_utc().isoformat(),
                'note': 'Links and dates found on official sites by an automatic check on a home computer, then checked by code and a second model. Each shows the day it was last checked. Your election office has the final word.',
                'state_links': found.get('state', []), 'counties': counties, 'districts': districts}
        write_json(os.path.join(out_dir, abbr + '.json'), data, compact=True)
        index['states'][s['abbr']] = {'counties': len(counties), 'links': sum(len(c['links']) for c in counties.values()) + len(data['state_links']),
                                      'elections': sum(len(c['elections']) for c in counties.values())}
    write_json(os.path.join(out_dir, 'index.json'), index)
    log(cfg, 'published to', out_dir, json.dumps({k: v['links'] for k, v in index['states'].items() if v['links']})[:300])
    report(cfg)
    if live and cfg.get('push'):
        push(cfg)

def push(cfg):
    repo, data = cfg['repo'], 'site/lookup/local'
    def git(*a):
        return subprocess.run(['git', '-C', repo] + list(a), capture_output=True, text=True)
    git('add', '--', data)
    if git('diff', '--cached', '--quiet', '--', data).returncode == 0:
        log(cfg, 'push: no change'); return
    msg = 'Local resources data ' + now_utc().strftime('%Y-%m-%dT%H:%MZ')
    r = git('commit', '-m', msg, '--', data)
    if r.returncode:
        log(cfg, 'push: commit failed', r.stderr[:300]); return
    for _ in range(3):
        git('pull', '--rebase', 'origin', 'main')
        p = git('push', 'origin', 'HEAD:main')
        if p.returncode == 0:
            log(cfg, 'pushed', msg); return
    log(cfg, 'push failed:', p.stderr[:300])

def report(cfg):
    lines = ['# Local resources: what needs a person', '', 'Written ' + now_utc().strftime('%Y-%m-%d %H:%M UTC') + '. Nothing below is on the site.', '']
    for s in states_list(cfg):
        notes = read_json(os.path.join(cfg['work'], 'notes', s['abbr'].lower() + '.json'), [])
        if not notes:
            continue
        lines.append('## ' + s['name'])
        for n in notes[-200:]:
            lines.append('- ' + n.get('place', '') + ': ' + n.get('result', '') + ((' ' + n['url']) if n.get('url') else '') + ((' Quote: "' + n['quote'] + '"') if n.get('quote') else ''))
        lines.append('')
    with open(os.path.join(cfg['work'], 'review.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))

# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--config', required=True)
    ap.add_argument('command', choices=['seed', 'run', 'publish', 'report'])
    a = ap.parse_args()
    cfg = load_config(a.config)
    {'seed': seed, 'run': run, 'publish': publish, 'report': report}[a.command](cfg)

if __name__ == '__main__':
    main()
