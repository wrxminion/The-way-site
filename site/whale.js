/* Whale: a faint silhouette that swims behind the page on its own, at random intervals,
   once the visitor is near the bottom. Reusable: add whale.css + whale.js to any page.
   Host: [data-whale-host], else main.ocean, else main, else body. Off under prefers-reduced-motion. */
(function () {
  var mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) return;
  var host = document.querySelector('[data-whale-host]') || document.querySelector('main.ocean') || document.querySelector('main') || document.body;
  var lane = document.createElement('div');
  lane.className = 'whale-lane';
  lane.setAttribute('aria-hidden', 'true');
  var whale = document.createElement('div');
  whale.className = 'whale';
  whale.innerHTML = '<svg viewBox="0 0 640 240" focusable="false"><defs><linearGradient id="whale-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3d8fa3" stop-opacity=".5"/><stop offset="1" stop-color="#0a3548" stop-opacity=".3"/></linearGradient></defs><path class="whale-fin" d="M430 168C420 196 392 222 352 232C372 208 380 188 384 168Z" fill="url(#whale-fill)"/><path d="M628 128C612 100 560 84 480 82C400 80 320 90 250 108C200 120 150 134 112 146C96 151 84 156 72 160C84 166 98 164 112 162C170 158 230 176 310 184C400 192 500 182 570 160C602 150 622 140 628 128Z" fill="url(#whale-fill)"/><g class="whale-tail"><path d="M82 158C64 146 40 126 14 96C14 118 26 136 46 150C30 148 14 150 4 158C26 164 52 164 70 166C54 178 46 194 44 214C62 196 80 178 96 168Z" fill="url(#whale-fill)"/></g><circle cx="560" cy="128" r="2.6" fill="#02121c" fill-opacity=".55"/></svg>';
  lane.appendChild(whale);
  var zone = document.createElement('div');
  zone.className = 'whale-zone';
  zone.setAttribute('aria-hidden', 'true');
  host.appendChild(lane);
  host.appendChild(zone);

  var near = false, timer = 0, swimming = false;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function swim() {
    if (!near || swimming || document.hidden) { schedule(rnd(6000, 15000)); return; }
    swimming = true;
    var dir = Math.random() < 0.5 ? 1 : -1;
    whale.style.top = rnd(8, 70) + '%';
    whale.style.setProperty('--whale-scale', rnd(0.6, 1.0).toFixed(2));
    whale.style.setProperty('--whale-flip', dir === 1 ? 1 : -1);
    whale.style.animationName = dir === 1 ? 'whale-ltr' : 'whale-rtl';
    whale.style.animationDuration = Math.round(rnd(20, 30)) + 's';
    whale.classList.add('swim');
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(swim, ms); }
  whale.addEventListener('animationend', function (e) {
    if (e.target !== whale) return;
    whale.classList.remove('swim');
    swimming = false;
    schedule(rnd(14000, 40000));
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      var was = near;
      near = es[0].isIntersecting;
      if (near && !was && !swimming) schedule(rnd(2500, 8000));
      if (!near) clearTimeout(timer);
    }).observe(zone);
  }
})();
