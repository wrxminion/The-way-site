// "Scuba Steve": the diver in the Back to surface bubble swims up while the page scrolls up and fades out from the head down as he nears the top.
// Also slows the Back to surface scroll (about 1.5 to 2.5 s, eased) instead of jumping. Loaded by bubbles.js. Style is in steve.css.
// Reduced motion: the link jumps at once as before, and Steve does not wiggle. No inline scripts or styles (properties are set through the CSS object model).
(function () {
  'use strict';
  var FADE_FROM = 400, FADE_TO = 80;   // Steve is whole below 400 px and gone at 80 px (the bubble itself hides at 80)
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var lastY = window.scrollY || 0, calm = 0, raf = 0, wait = 0;
  var POP_MS = 700;   // the glass bursts first (600 ms, steve.css); Scuba Steve starts swimming and the page starts moving only after this
  function reduced() { return !!(mq && mq.matches); }
  function link() { return document.querySelector('.wb-floating-return'); }
  function fade() {
    var a = link(); if (!a) return;
    var f = Math.max(0, Math.min(1, (FADE_FROM - (window.scrollY || 0)) / (FADE_FROM - FADE_TO)));
    a.style.setProperty('--steve-f', f.toFixed(3));
  }
  function swim(on) { var a = link(); if (a) a.classList.toggle('wb-steve-swim', on); }
  window.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    fade();
    if (!reduced() && y < lastY - 1) { swim(true); clearTimeout(calm); calm = setTimeout(function () { if (!raf) swim(false); }, 260); }
    lastY = y;
  }, { passive: true });

  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (wait) { clearTimeout(wait); wait = 0; }
    swim(false);
    var a = link();
    if (a && a.classList.contains('wb-steve-pop')) {
      a.classList.remove('wb-steve-pop');
      if ((window.scrollY || 0) > 80 && !reduced()) { a.classList.add('wb-steve-reform'); setTimeout(function () { a.classList.remove('wb-steve-reform'); }, 500); }   // stopped part way: the glass re-forms
    }
    window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); window.removeEventListener('keydown', stop);
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('.wb-floating-return');
    if (!a || reduced() || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var from = window.scrollY || 0; if (from < 5) return;
    ev.preventDefault();
    stop();
    var dur = Math.min(2500, Math.max(1500, 900 + from * 0.5));
    a.classList.add('wb-steve-pop');
    window.addEventListener('wheel', stop, { passive: true }); window.addEventListener('touchstart', stop, { passive: true }); window.addEventListener('keydown', stop);
    wait = setTimeout(function () {
      wait = 0; swim(true);
      var t0 = performance.now();
      (function step(now) {
        var t = Math.min(1, (now - t0) / dur);
        window.scrollTo(0, Math.round(from * (1 - ease(t))));
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = 0; stop(); var bar = document.getElementById('waybar'); if (bar && bar.focus) { bar.setAttribute('tabindex', '-1'); bar.focus({ preventScroll: true }); } }
      })(t0);
    }, POP_MS);
  });
  fade();
})();
