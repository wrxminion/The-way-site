// Footer tentacles: five grey-green arms sway in a reserved strip at the bottom of the footer, around a wooden "What lurks below?" sign.
// Decorative: the art (footer-tentacles.svg, drawn by hand) is aria-hidden; the sign wording is real text in the page. No link (no destination agreed).
// One rise when it scrolls into view, then a slow sway with a Pause motion button; reduced motion shows a still scene without the button.
// The art loads only when the footer is near the screen. Styles are in footer-tentacles.css. No inline scripts or styles.
(function () {
  'use strict';
  var foot = document.querySelector('footer.foot');
  if (!foot || foot.querySelector('.wb-tent-wrap')) return;
  var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/footer-tentacles.css?v=7'; document.head.appendChild(link);
  var wrap = document.createElement('div'); wrap.className = 'wb-tent-wrap';
  var strip = document.createElement('div'); strip.className = 'wb-tent'; strip.setAttribute('aria-hidden', 'true');
  // The sign wording lives inside the artwork (footer-tentacles.svg) so it scales with the boards at every width; this hidden copy is the real text for screen readers and search.
  // The sign is not clickable and has no link.
  var sign = document.createElement('p'); sign.className = 'wb-tent-sr'; sign.textContent = 'What lurks below?';
  wrap.appendChild(strip); wrap.appendChild(sign);
  // The scene is the last thing on the page, after the footer (and anything added to the footer later), so nothing sits under the tentacles.
  // Pausing is the site-wide Pause motion button (motion-pause.js), which also stops these arms.
  if (foot.nextSibling) foot.parentNode.insertBefore(wrap, foot.nextSibling); else foot.parentNode.appendChild(wrap);
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)'), still = !!(mq && mq.matches), loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    fetch('/footer-tentacles.svg?v=4').then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      if (!/^\s*<svg/.test(t)) return;
      strip.innerHTML = t;
      if (!still) { strip.classList.add('is-rising'); setTimeout(function () { strip.classList.remove('is-rising'); }, 12000); }
      wrap.classList.add('is-ready');
    }).catch(function () { wrap.hidden = true; });
  }
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '300px' });
    io.observe(foot);
  } else load();
})();
