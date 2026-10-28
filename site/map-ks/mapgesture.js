// District map: the page scrolls normally over the map (Frank, Oct 15 2026). Zoom with Ctrl/Cmd + scroll, the + and - buttons,
// the keyboard (+/- and arrows once the map has focus), or two fingers on a phone. A short hint shows when someone scrolls over it.
(function () {
  var wrap = document.querySelector('.map-wrap');
  if (!wrap) return;
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var hint = document.createElement('div');
  hint.className = 'map-hint'; hint.setAttribute('aria-hidden', 'true');
  wrap.appendChild(hint);
  var t;
  function show(msg) {
    hint.textContent = msg; hint.classList.add('on');
    clearTimeout(t); t = setTimeout(function () { hint.classList.remove('on'); }, 1400);
  }
  // Capture phase on the frame, so Leaflet never sees a plain scroll and the page keeps scrolling.
  wrap.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) return;
    if (!e.target.closest || !e.target.closest('#map')) return;
    e.stopPropagation();
    show(mac ? 'Use ⌘ + scroll to zoom the map' : 'Use Ctrl + scroll to zoom the map');
  }, { capture: true, passive: true });
  wrap.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length === 1 && e.target.closest && e.target.closest('#map')) show('Use two fingers to move or zoom the map');
  }, { passive: true });
})();
