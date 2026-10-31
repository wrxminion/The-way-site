// Shark silhouette: more often than the whale, a small dark shark shape swims by behind the page (about half the whale's size, same style and layer).
// Shape only: no papers, no mouth detail. Decorative: aria-hidden, pointer-events none, behind content, off for reduced motion. Loaded by waybar.js or a page.
// Like the whale, it picks one document depth per page load and only swims while that spot is near the screen. No inline scripts or styles.
(function () {
  'use strict';
  if (document.querySelector('.shark-lane')) return;
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) return;
  var host = document.querySelector('[data-whale-host]') || document.querySelector('main.ocean') || document.querySelector('main') || document.body;
  if (!host) return;
  var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/shark-silhouette.css?v=1'; document.head.appendChild(link);
  host.classList.add('shark-host');
  var lane = document.createElement('div'); lane.className = 'shark-lane'; lane.setAttribute('aria-hidden', 'true');
  var sil = document.createElement('div'); sil.className = 'shark-sil';
  sil.innerHTML = '<svg viewBox="0 0 400 210" aria-hidden="true" focusable="false"><g fill="#071f30"><g class="ss-tail"><path d="m267 100 68-54-13 51 24 50-78-25z"/></g><path d="m161 57 32-46 18 52z"/><path d="M36 99C39 46 127 32 196 53q48 13 79 49-20 48-96 51-81 6-127-31z"/><path d="m169 114 30 45 11-53z"/></g></svg>';
  lane.appendChild(sil); host.appendChild(lane);
  var near = false, timer = 0, swimming = false;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  lane.style.top = Math.round(rnd(Math.min(160, host.scrollHeight / 4), Math.max(160, host.scrollHeight - 200))) + 'px';
  function fit() {
    if (document.body.classList.contains('home')) return;
    lane.style.left = Math.round(-host.getBoundingClientRect().left) + 'px'; lane.style.right = 'auto'; lane.style.width = document.documentElement.clientWidth + 'px';
  }
  fit(); window.addEventListener('resize', fit);
  function swim() {
    if (!near || swimming || document.hidden) { schedule(rnd(5000, 12000)); return; }
    swimming = true;
    var dir = Math.random() < .5 ? 1 : -1;
    sil.style.setProperty('--shark-scale', rnd(.7, 1).toFixed(2)); sil.style.setProperty('--shark-flip', dir === 1 ? -1 : 1);
    sil.style.animationName = dir === 1 ? 'shark-ltr' : 'shark-rtl'; sil.style.animationDuration = Math.round(rnd(9, 13)) + 's';
    sil.classList.add('swim');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(swim, ms); }
  sil.addEventListener('animationend', function (e) { if (e.target !== sil) return; sil.classList.remove('swim'); swimming = false; schedule(rnd(12000, 30000)); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { var was = near; near = es[0].isIntersecting; if (near && !was && !swimming) schedule(rnd(1500, 4000)); if (!near) clearTimeout(timer); }).observe(lane);
  }
})();
