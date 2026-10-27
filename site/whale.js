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
  whale.innerHTML = '<svg viewBox="0 0 800 290" focusable="false"><g class="whale-tail" fill="#061d2c"><path d="M215 145 C175 140 151 128 129 113 C104 96 79 72 47 74 C60 96 75 113 93 128 C66 130 40 124 15 111 C32 142 62 156 93 157 C76 174 53 187 24 195 C62 204 98 197 130 181 C160 165 186 160 222 161 Z"/></g><path fill="#061d2c" d="M181 142 C238 129 272 101 324 91 C377 79 423 88 469 91 C486 82 495 68 497 61 C505 72 508 83 510 91 C562 90 618 96 672 105 C726 114 768 129 785 146 C793 154 787 168 770 173 C741 180 713 182 685 183 C635 184 599 195 550 198 C509 201 470 199 430 192 C379 182 340 172 299 170 C259 169 222 168 190 160 C180 157 176 149 181 142 Z"/><path class="whale-fin" fill="#061d2c" d="M444 177 C461 193 467 215 472 234 C476 249 486 257 504 260 C496 244 494 226 502 211 C513 193 524 188 536 184 Z"/></svg>';
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
    whale.style.animationDuration = Math.round(rnd(10, 14)) + 's';
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
      if (near && !was && !swimming) schedule(rnd(1000, 2000));
      if (!near) clearTimeout(timer);
    }).observe(zone);
  }
})();
