// Pages with more than one piece of art for a banner: pick one per visit. Every piece is 4:1 and the figure keeps its
// aspect ratio, so nothing moves. Without JavaScript the first piece (already in the page) shows.
(() => {
  'use strict';
  document.querySelectorAll('figure.case-banner[data-rotate]').forEach((fig) => {
    let list;
    try { list = JSON.parse(fig.getAttribute('data-rotate')); } catch { return; }
    if (!Array.isArray(list) || list.length < 2) return;
    const p = list[Math.floor(Math.random() * list.length)];
    const img = fig.querySelector('img'), credit = fig.querySelector('.case-banner-credit');
    if (!img || !p || typeof p.s !== 'string' || p.s.indexOf('/img/case-banners/') !== 0) return;
    img.src = p.s + '-1600.webp';
    img.srcset = p.s + '-800.webp 800w, ' + p.s + '-1600.webp 1600w';
    img.alt = p.a || '';
    if (!credit) return;
    const name = document.createElement(/^https:\/\//.test(p.u || '') ? 'a' : 'span');
    name.className = 'case-banner-credit';
    name.textContent = p.c || '';
    if (name.tagName === 'A') { name.href = p.u; name.rel = 'noopener nofollow ugc'; }
    credit.replaceWith(name);
  });
})();
