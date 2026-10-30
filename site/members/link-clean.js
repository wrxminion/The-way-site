// Link cleaning shared by the members home news feed and the article submit form.
//   WayLink.analyze(url) -> { clean, types, params, googleNews }
//     clean      the link with every tracking parameter and the #fragment removed ('' when it cannot be used)
//     types      what kind of tracker the link carried, e.g. ['google'], ['facebook'], ['newsletter'] (sorted, no duplicates)
//     params     the tracking parameters that were removed, as one query string (kept only in the admin-only provenance table, 0060)
//     googleNews true for a Google News redirect link: those are never used, the publisher's own address is needed
//   WayLink.cleanUrl(url) -> the clean link or ''
// A google.com/url?q=... wrapper is unwrapped to its target and counted as a 'google' tracker.
(function () {
  'use strict';
  var EXACT = { fbclid: 'facebook', gclid: 'google', dclid: 'google', gbraid: 'google', wbraid: 'google', gclsrc: 'google', ved: 'google', usg: 'google', _ga: 'google', _gl: 'google',
    msclkid: 'microsoft', yclid: 'yahoo', twclid: 'twitter', ref_src: 'twitter', ref_url: 'twitter', ttclid: 'tiktok', igshid: 'instagram', li_fat_id: 'linkedin', rdt_cid: 'reddit',
    mc_cid: 'newsletter', mc_eid: 'newsletter', _hsenc: 'newsletter', _hsmi: 'newsletter', mkt_tok: 'newsletter', vero_id: 'newsletter', vero_conv: 'newsletter',
    ref: 'other', referrer: 'other', referer: 'other', source: 'other', src: 'other', smid: 'other', smtyp: 'other', ocid: 'other', oc: 'other', ncid: 'other', cmpid: 'other',
    cmp: 'other', cmp_id: 'other', s_cid: 'other', cid: 'other', spm: 'other', share: 'other', sr_share: 'other', taid: 'other', soc_src: 'other', soc_trk: 'other',
    partner: 'other', guccounter: 'other', rss: 'rss', intcmp: 'other', fromrss: 'rss', outputtype: 'other', amp_js_v: 'other', usqp: 'other' };
  var PREFIX = [[/^utm_/i, 'utm'], [/^fb_/i, 'facebook'], [/^mc_/i, 'newsletter'], [/^hsa_/i, 'google'], [/^guce_/i, 'yahoo'], [/^(pk_|piwik_|mtm_|matomo_)/i, 'other'],
    [/^(icid|itm_|vero_|oly_|_bta|trk_|at_|sc_|wt\.|ga_)/i, 'other']];
  // utm_source / utm_medium values say where the link was shared
  function fromUtm(value) {
    var v = String(value || '').toLowerCase();
    if (/google/.test(v)) return 'google';
    if (/facebook|^fb$|meta/.test(v)) return 'facebook';
    if (/twitter|^x$|^t\.co/.test(v)) return 'twitter';
    if (/reddit/.test(v)) return 'reddit';
    if (/instagram/.test(v)) return 'instagram';
    if (/tiktok/.test(v)) return 'tiktok';
    if (/linkedin/.test(v)) return 'linkedin';
    if (/news.?letter|e-?mail|mailchimp|substack/.test(v)) return 'newsletter';
    if (/rss|feed/.test(v)) return 'rss';
    return 'utm';
  }
  function kindOf(name) {
    var k = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(EXACT, k)) return EXACT[k];
    for (var i = 0; i < PREFIX.length; i++) if (PREFIX[i][0].test(k)) return PREFIX[i][1];
    return null;
  }
  function analyze(u) {
    var out = { clean: '', types: [], params: '', googleNews: false };
    if (typeof u !== 'string' || u.length > 2048) return out;
    var x; try { x = new URL(u.trim()); } catch (e) { return out; }
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return out;
    var types = {}, host = x.hostname.toLowerCase();
    if (host === 'news.google.com' || host === 'news.url.google.com') { out.googleNews = true; return out; }
    if ((host === 'google.com' || host === 'www.google.com') && x.pathname === '/url') {
      var target = x.searchParams.get('q') || x.searchParams.get('url');
      types.google = 1;
      try { x = new URL(target); } catch (e) { return out; }
      if (x.protocol !== 'https:' && x.protocol !== 'http:') return out;
      host = x.hostname.toLowerCase();
      if (host === 'news.google.com') { out.googleNews = true; return out; }
    }
    var drop = [], raw = [];
    x.searchParams.forEach(function (v, k) {
      var t = kindOf(k);
      if (!t) return;
      drop.push(k); raw.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      if (t === 'utm' && /^utm_(source|medium)$/i.test(k)) { t = fromUtm(v); if (t === 'utm' && /medium/i.test(k)) return; }   // a plain medium (social, cpc) adds nothing
      types[t] = 1;
    });
    drop.forEach(function (k) { x.searchParams.delete(k); });
    x.hash = ''; x.username = ''; x.password = '';
    out.clean = x.href;
    out.types = Object.keys(types).sort();
    out.params = raw.join('&').slice(0, 2000);
    return out;
  }
  window.WayLink = { analyze: analyze, cleanUrl: function (u) { return analyze(u).clean; } };
})();
