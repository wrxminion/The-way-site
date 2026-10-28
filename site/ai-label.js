// Review-status label for pages the AI wrote: voter guides and measures, history cases, the government guide, news pages
// and research packages. Loaded by waybar.js. The status of a page comes from /content-status.json (copied from the
// database by a scheduled Action); a page with no entry shows the file's "default". Pages that already carry a stronger
// label (the "Not yet reviewed by a person" banner) are left alone. Signed-in members whose role may change statuses
// (the database decides) see a dropdown; picking one opens a confirm screen in the members area, because public pages
// cannot call the database. Plain JavaScript; all text goes in with textContent.
(function () {
  'use strict';
  var path = location.pathname.replace(/index\.html$/, '');
  var AI = /^\/(guide(-[a-z]{2})?\/|how-government-works\.html$|news\/|cases\/[^/]+\.html$|cases\/packets\/)|^\/research\/packages\//;
  if (!AI.test(path) || document.querySelector('.ai-label, .review-banner')) return;

  var STATUS = {
    ai_unchecked: { tag: 'AI written, unchecked', level: 'warn', sum: 'Written with AI. No person has looked at it yet.', more: 'Written with AI. No person has looked at it yet, so treat it as a draft.' },
    skimmed: { tag: 'AI written, human skimmed', level: 'info', sum: 'Written with AI. A person skimmed it. Not yet checked against every source.', more: 'Written with AI. A person has skimmed it for obvious problems. Skimmed is lighter than checked: the sources have not all been verified.' },
    read: { tag: 'AI written, human read', level: 'info', sum: 'Written with AI. A person read all of it. Not yet checked against every source.', more: 'Written with AI. A person has read all of it. The sources have not all been verified yet.' },
    under_review: { tag: 'Under review', level: 'info', sum: 'Written with AI. Some sources have been verified by a person.', more: 'Written with AI. A person is checking the sources one by one, and some are verified so far.' },
    confirmed: { tag: 'Confirmed accurate by a human', level: 'info', sum: 'Written with AI. A person verified every source.', more: 'Written with AI. A person verified every source and confirmed the page is accurate.' }
  };
  var ORDER = ['ai_unchecked', 'skimmed', 'read', 'under_review', 'confirmed'];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function b64(s) { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function canChange() {
    try { var d = window.WayBar && window.WayBar.read && window.WayBar.read(); var r = (d && d.roles) || []; return ['admin', 'editor', 'reviewer', 'moderator'].some(function (x) { return r.indexOf(x) >= 0; }); } catch (e) { return false; }
  }

  function draw(key) {
    var s = STATUS[key] || STATUS.skimmed;
    var d = el('details', 'notice ai-label notice-' + s.level);
    d.setAttribute('data-status', STATUS[key] ? key : 'skimmed');
    var sm = el('summary'), more = el('span', 'notice-more');
    more.append(el('span', 'on-closed', 'Details'), el('span', 'on-open', 'Hide details'));
    sm.append(el('span', 'notice-tag', s.tag), el('span', 'notice-sum', s.sum), more);
    var body = el('div', 'notice-body'), p = el('p', null, s.more + ' ');
    var a = el('a', null, 'How we use AI and what these labels mean'); a.href = '/ai/#labels'; p.append(a, '.');
    body.append(p);
    if (canChange()) {
      var row = el('div', 'ai-label-pick'), sel = el('select'), go = el('a', null, 'Change status');
      sel.setAttribute('aria-label', 'Review status for this page');
      ORDER.forEach(function (k) { var o = el('option', null, STATUS[k].tag); o.value = k; if (k === d.getAttribute('data-status')) o.selected = true; sel.append(o); });
      var upd = function () { go.href = '/members/#/status/' + b64(path) + '/' + sel.value; go.setAttribute('aria-disabled', String(sel.value === d.getAttribute('data-status'))); };
      sel.onchange = upd; upd();
      row.append(el('span', null, 'Reviewer:'), sel, go); body.append(row);
    }
    d.append(sm, body);
    var host = document.querySelector('.essay-body') || document.querySelector('main');
    var h1 = host && host.querySelector('h1') || document.querySelector('main h1');
    var cs = host && getComputedStyle(host);
    if (cs && /flex/.test(cs.display)) host.insertAdjacentElement('beforebegin', d); // a flex main would make it a column
    else if (document.querySelector('.essay-body')) host.prepend(d);
    else if (h1) { var top = h1.parentNode.tagName === 'HEADER' ? h1.parentNode : h1; top.insertAdjacentElement('afterend', d); }
    else if (host) host.prepend(d);
  }

  function start() {
    ['/notice.css?v=2', '/ai-label.css?v=2'].forEach(function (h) {
      if (document.querySelector('link[href^="' + h.split('?')[0] + '"]')) return;
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l);
    });
    var done = false, finish = function (k) { if (!done) { done = true; draw(k); } };
    try {
      fetch('/content-status.json', { cache: 'no-cache' }).then(function (r) { return r.json(); })
        .then(function (j) { finish((j.items && STATUS[j.items[path]] ? j.items[path] : (STATUS[j.default] ? j.default : 'skimmed'))); })
        .catch(function () { finish('skimmed'); });
    } catch (e) { finish('skimmed'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
