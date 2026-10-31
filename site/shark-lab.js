// Shark lab (admin only, secret): press Alt+Shift+S on any page to open a tiny panel that plays the background papers, the shark, or the silhouette
// on your own screen so you can see them go by. It shows only for a signed-in admin (the display flag the member bar already keeps in this browser);
// it reads nothing, saves nothing and sends nothing. Esc closes it. Loaded on demand by shark-pass.js. No inline scripts or styles.
(function () {
  'use strict';
  function isAdmin() {
    try { var d = JSON.parse(localStorage.getItem('theway.bar') || 'null'); return !!(d && d.roles && (d.roles.indexOf('admin') >= 0 || d.roles.indexOf('super_admin') >= 0)); } catch (e) { return false; }
  }
  function close() { var p = document.querySelector('.wb-lab'); if (p) { p.remove(); return true; } return false; }
  function open() {
    if (!isAdmin()) return;
    if (close()) return;
    var p = document.createElement('div'); p.className = 'wb-lab'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Shark lab (admin)');
    var h = document.createElement('p'); h.className = 'wb-lab-h'; h.textContent = 'Shark lab (admin)'; p.appendChild(h);
    var note = document.createElement('p'); note.className = 'wb-lab-n'; p.appendChild(note);
    function btn(label, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', function () { note.textContent = ''; var r = fn(); if (r === false) note.textContent = (window.WayMotion && window.WayMotion.isOff()) ? 'Motion is paused. Press Play motion in the footer.' : 'Not right now (one is already playing, or reduced motion is on).'; }); p.appendChild(b); return b; }
    var first = btn('Papers only (nobody comes)', function () { if (!window.WayShark) return false; window.WayShark.play({ shark: false, quiet: false }); });
    btn('Papers, then the shark eats them', function () { if (!window.WayShark) return false; window.WayShark.stop(); window.WayShark.play({ shark: true, quiet: false, fast: true }); });
    btn('Quiet sneak-by shark', function () { if (!window.WayShark) return false; window.WayShark.stop(); window.WayShark.play({ shark: true, quiet: true, fast: true }); });
    btn('Silhouette now', function () { return window.WaySilhouette ? window.WaySilhouette.now() : false; });
    btn('Stop', function () { if (window.WayShark) window.WayShark.stop(); });
    btn('Close', function () { close(); });
    p.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/shark-lab.css?v=1'; document.head.appendChild(css);
    document.body.appendChild(p); first.focus();
  }
  window.WaySharkLab = { open: open };
  open();
})();
