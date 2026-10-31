// Pause motion: one site-wide switch that stops the moving bubbles and every animation (bubble floats and pops, the footer tentacles, the whale and
// the sharks, the rise-in). The choice is remembered in this browser (localStorage) and applies on every page. Back to surface then jumps instead of swimming.
// A button sits in the footer; WayMotion.toggle() / on() / off() is the same switch for other code. Nothing here moves anything itself. No inline scripts or styles.
(function () {
  'use strict';
  var KEY = 'theway.motion', root = document.documentElement;
  function get() { try { return localStorage.getItem(KEY) === 'off'; } catch (e) { return false; } }
  function put(off) { try { if (off) localStorage.setItem(KEY, 'off'); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function paint() {
    var off = root.classList.contains('wb-motion-off');
    document.querySelectorAll('.wb-motion-btn').forEach(function (b) { b.setAttribute('aria-pressed', off ? 'true' : 'false'); b.textContent = off ? 'Play motion' : 'Pause motion'; });
  }
  function set(off) {
    root.classList.toggle('wb-motion-off', !!off); put(off); paint();
    if (off && window.WayShark && window.WayShark.stop) window.WayShark.stop();
  }
  function button() {
    var foot = document.querySelector('footer.foot, body > footer, main > footer');
    if (!foot || foot.querySelector('.wb-motion-btn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'wb-motion-btn';
    b.addEventListener('click', function () { set(!root.classList.contains('wb-motion-off')); });
    foot.appendChild(b); paint();
  }
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/motion-pause.css?v=1'; document.head.appendChild(css);
  if (get()) root.classList.add('wb-motion-off');
  window.WayMotion = { off: function () { set(true); }, on: function () { set(false); }, toggle: function () { set(!root.classList.contains('wb-motion-off')); }, isOff: function () { return root.classList.contains('wb-motion-off'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', button); else button();
  window.addEventListener('load', button);
})();
