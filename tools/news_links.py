"""Link helpers for the news files: strip trackers, spot Google News redirect links, look up publisher links found by
resolve-news-links.py. Same tracker list as site/members/link-clean.js (keep the two in step)."""
import json, os, re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

TRACK_EXACT = {
    'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'gclsrc', 'ved', 'usg', '_ga', '_gl', 'msclkid', 'yclid', 'twclid', 'ref_src', 'ref_url',
    'ttclid', 'igshid', 'li_fat_id', 'rdt_cid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'vero_id', 'vero_conv', 'ref', 'referrer',
    'referer', 'source', 'src', 'smid', 'smtyp', 'ocid', 'oc', 'ncid', 'cmpid', 'cmp', 'cmp_id', 's_cid', 'cid', 'spm', 'share', 'sr_share',
    'taid', 'soc_src', 'soc_trk', 'partner', 'guccounter', 'rss', 'intcmp', 'fromrss', 'outputtype', 'amp_js_v', 'usqp'}
TRACK_PREFIX = re.compile(r'^(utm_|fb_|mc_|hsa_|guce_|pk_|piwik_|mtm_|matomo_|icid|itm_|vero_|oly_|_bta|trk_|at_|sc_|wt\.|ga_)', re.I)
GOOGLE_NEWS = re.compile(r'^https?://news\.google\.com/(rss/)?articles/([A-Za-z0-9_-]+)')

def strip_trackers(url):
    """The link without tracking parameters or a #fragment. Returns '' for anything that is not an http(s) link."""
    try:
        s = urlsplit(url.strip())
    except ValueError:
        return ''
    if s.scheme not in ('http', 'https') or not s.netloc:
        return ''
    q = [(k, v) for k, v in parse_qsl(s.query, keep_blank_values=True) if k.lower() not in TRACK_EXACT and not TRACK_PREFIX.match(k)]
    host = s.netloc.rsplit('@', 1)[-1]
    return urlunsplit((s.scheme, host, s.path, urlencode(q), ''))

def google_news_id(url):
    m = GOOGLE_NEWS.match(url or '')
    return m.group(2) if m else None

def cache_path(data_dir):
    return os.path.join(data_dir, 'direct-links.json')

def load_cache(data_dir):
    try:
        with open(cache_path(data_dir), encoding='utf-8') as f:
            d = json.load(f)
        return {'ok': dict(d.get('ok', {})), 'failed': dict(d.get('failed', {}))}
    except (OSError, ValueError):
        return {'ok': {}, 'failed': {}}

def direct_url(item_url, cache):
    """The publisher's own clean link for a news item, or the cleaned original when it is not a Google News link.
    Returns '' when it IS a Google News link that has not been resolved yet (the members feed leaves those out)."""
    gid = google_news_id(item_url)
    if gid:
        return strip_trackers(cache['ok'].get(gid, ''))
    return strip_trackers(item_url)
