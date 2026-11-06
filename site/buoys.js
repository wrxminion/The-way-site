// Buoys (Frank, Nov 6 2026; art from ChatGPT). Loaded by footer-quick.js. Decorative, no clicks except the counter link. No inline scripts or styles.
//  1. Footer depth counter: when footer-quick.js has added "Depth: N articles saved" (.michi-footer-depth), that line is replaced by the depth buoy.
//     The live count sits in the buoy's DEPTH window; the buoy links to the news archive and its label reads the count. It sits off to the side of the footer
//     (left of the tentacle scene on wide screens) and its chain runs down to the very bottom of the page. If the art fails to load, the text line comes back.
//  2. Floating buoys at random heights on the pages in FLOAT_PAGES: they bob and little bubbles rise from the lamp. Side margins on wide screens,
//     wherever a buoy covers no text, picture or card on wide screens (never under the side bubbles), the gaps between sections on narrow ones.
// Pause motion (html.wb-motion-off) and reduced motion show still art: no bob, no bubbles.
(function () {
  'use strict';
  if (window.MichiBuoys) return; window.MichiBuoys = true;
  // Floating buoys are off for now (Frank, Nov 6 2026: far too many on the front page). To bring them back, list pages here, e.g. ['/teacher-parent.html'].
  var FLOAT_PAGES = [];
  var WIDE = 1100;
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/buoys.css?v=2'; document.head.appendChild(css);
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function img(src, cls) { var i = el('img', 'michi-buoy-img ' + cls); i.src = src; i.alt = ''; i.decoding = 'async'; i.setAttribute('loading', 'lazy'); return i; }
  function docTop(e) { return e.getBoundingClientRect().top + window.pageYOffset; }

  // 1. the counter buoy
  function counter(depth) {
    if (document.querySelector('.michi-buoy')) return;
    var strong = depth.querySelector('strong'); if (!strong) return;
    var n = strong.textContent, nav = depth.closest('.michi-footer-nav') || depth.parentNode;
    var wrap = el('div', 'michi-buoy'), a = el('a', 'michi-buoy-link'), art = el('span', 'michi-buoy-art'), num = el('span', 'michi-buoy-num'), chain = el('span', 'michi-buoy-chain');
    a.href = depth.getAttribute('href') || '/news/'; a.setAttribute('aria-label', 'Depth: ' + n + ' articles saved. Open the news archive.');
    var anim = img('/art/buoy-counter.webp?v=2', 'michi-buoy-anim'), still = img('/art/buoy-counter-still.webp?v=2', 'michi-buoy-still');
    art.appendChild(anim); art.appendChild(still);
    num.textContent = n; num.setAttribute('aria-hidden', 'true'); art.appendChild(num);
    chain.setAttribute('aria-hidden', 'true');
    a.appendChild(art); wrap.appendChild(a); wrap.appendChild(chain);
    function giveUp() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); depth.classList.remove('has-buoy'); }
    still.addEventListener('error', giveUp); anim.addEventListener('error', function () { if (!window.matchMedia || !matchMedia('(prefers-reduced-motion: reduce)').matches) giveUp(); });
    document.body.appendChild(wrap); depth.classList.add('has-buoy');
    var queued = false;
    function place() {
      queued = false; if (!wrap.parentNode) return;
      var W = document.documentElement.clientWidth, wide = W >= WIDE;
      wrap.classList.toggle('is-narrow', !wide && W >= 360); wrap.classList.toggle('is-tiny', !wide && W < 360);
      var bw = wrap.offsetWidth || 190, artH = bw * 360 / 260, pTop = wrap.offsetParent && wrap.offsetParent !== document.body ? docTop(wrap.offsetParent) : 0;
      var navTop = docTop(nav), x, y;
      if (wide) {
        var tent = document.querySelector('.wb-tent-wrap.is-ready'), stripL = tent && tent.offsetWidth ? tent.getBoundingClientRect().left : W / 2 - 260;
        x = Math.max(110, stripL - bw - 50); y = navTop - 70;
      } else { x = 4; y = navTop + 34; }
      wrap.style.left = Math.round(x) + 'px'; wrap.style.top = Math.round(y - pTop) + 'px';
      chain.style.top = Math.round(artH * 0.96) + 'px'; chain.style.height = '0px';
      var H = document.documentElement.scrollHeight;
      chain.style.height = Math.max(0, Math.round(H - y - artH * 0.96)) + 'px';
    }
    function later() { if (!queued) { queued = true; requestAnimationFrame(place); } }
    place(); window.addEventListener('resize', later); window.addEventListener('load', later);
    if (window.ResizeObserver) new ResizeObserver(later).observe(document.body);
    setTimeout(later, 1500); setTimeout(later, 5000);
  }
  function watchDepth() {
    var d = document.querySelector('.michi-footer-depth');
    if (d) return counter(d);
    var nav = document.querySelector('.michi-footer-nav'); if (!nav || !window.MutationObserver) return;
    var mo = new MutationObserver(function () { var x = nav.querySelector('.michi-footer-depth'); if (x) { mo.disconnect(); counter(x); } });
    mo.observe(nav, { childList: true }); setTimeout(function () { mo.disconnect(); }, 20000);
  }

  // 2. floating buoys
  var seed = 0; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  function floater(size) {
    var f = el('div', 'michi-float'); f.setAttribute('aria-hidden', 'true'); f.style.width = size + 'px';
    f.appendChild(img('/art/buoy-float.webp', '')); f.firstChild.className = 'michi-buoy-img';
    for (var i = 0; i < 3; i++) f.appendChild(el('span', 'michi-float-bub'));
    f.style.animationDelay = (-rnd() * 5.4).toFixed(1) + 's';
    return f;
  }
  function obstacles(main) {
    var Y = window.pageYOffset, obs = [];
    Array.prototype.slice.call(main.querySelectorAll('p, h1, h2, h3, h4, li, a, button, input, select, label, img, svg, canvas, video, figure, .gw-card'), 0, 2500).forEach(function (e) {
      var r = e.getBoundingClientRect();
      if (/^(P|H1|H2|H3|H4|LABEL)$/.test(e.tagName)) { var rg = document.createRange(); rg.selectNodeContents(e); var t = rg.getBoundingClientRect(); if (t.width) r = t; }
      if (r.width < 2 || r.height < 2) return;
      obs.push([r.left - 14, r.right + 14, r.top + Y - 14, r.bottom + Y + 14]);
    });
    return obs;
  }
  function hits(obs, x, y, sz) { var h = sz * 1.35 + 20; for (var k = 0; k < obs.length; k++) { var o = obs[k]; if (x < o[1] && x + sz > o[0] && y - 30 < o[3] && y + h > o[2]) return true; } return false; }
  // content that loads later (news lists, cards) can move into a buoy's spot: those buoys are taken away
  function prune() {
    var main = document.querySelector('main'), fl = document.querySelectorAll('body > .michi-float'); if (!main || !fl.length) return;
    var obs = obstacles(main);
    Array.prototype.forEach.call(fl, function (f) { if (hits(obs, parseFloat(f.style.left), parseFloat(f.style.top), f.offsetWidth)) f.parentNode.removeChild(f); });
  }
  function floats() {
    if (FLOAT_PAGES.indexOf(location.pathname) < 0 || document.querySelector('.michi-float')) return;
    var main = document.querySelector('main'); if (!main) return;
    seed = Math.floor(Math.random() * 233280);
    var W = document.documentElement.clientWidth;
    if (W >= WIDE) {
      // everything the page shows (text measured by its own lines, plus pictures, cards and list rows); a buoy only goes where it covers none of it
      var nav = document.querySelector('.michi-footer-nav'), obs = obstacles(main);
      var stop = (nav ? docTop(nav) : document.documentElement.scrollHeight) - 500, top = docTop(main) + 650 + rnd() * 300;
      while (top < stop) {
        var size = Math.round(52 + rnd() * 40), placed = false;
        for (var tries = 0; tries < 10 && !placed; tries++) {
          var x = 104 + rnd() * (W - 208 - size);
          if (!hits(obs, x, top, size)) { var f = floater(size); f.style.left = Math.round(x) + 'px'; f.style.top = Math.round(top) + 'px'; document.body.appendChild(f); placed = true; }
        }
        top += placed ? 520 + rnd() * 900 : 90;
      }
      var q = false;
      if (window.ResizeObserver) new ResizeObserver(function () { if (!q) { q = true; setTimeout(function () { q = false; prune(); }, 300); } }).observe(main);
      setTimeout(prune, 4000); setTimeout(prune, 10000);
      return;
    }
    var secs = main.querySelectorAll(':scope > section, :scope > header');
    Array.prototype.forEach.call(secs, function (sec, k) {
      if (k === 0 || k === secs.length - 1 || rnd() < 0.35) return;
      var gap = el('div', 'michi-float-gap'); gap.setAttribute('aria-hidden', 'true'); sec.parentNode.insertBefore(gap, sec.nextSibling);
      var size = Math.round(44 + rnd() * 24), f = floater(size);
      f.style.left = 'calc(' + Math.round(6 + rnd() * 82) + '% - ' + Math.round(size / 2) + 'px)'; f.style.top = Math.round(rnd() * Math.max(0, 80 - size)) + 'px';
      gap.appendChild(f);
    });
  }
  function start() { watchDepth(); function go() { setTimeout(floats, 1200); } if (document.readyState === 'complete') go(); else window.addEventListener('load', go); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
