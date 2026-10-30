(function () {
  var KEY = 'theway-news-wide';
  var layout = document.getElementById('panel');
  var btn = document.getElementById('panel-toggle');
  if (!layout || !btn) return;
  function get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function put(on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {} }
  function apply(on) {
    layout.classList.toggle('wide', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Show side panel' : 'Hide side panel';
  }
  btn.hidden = false;
  apply(get());
  btn.addEventListener('click', function () {
    var on = !layout.classList.contains('wide');
    apply(on);
    put(on);
  });
})();
