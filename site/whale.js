/* Whale: a faint silhouette that swims behind the page on its own, at random intervals,
   at one random document depth per page load.
   Host: [data-whale-host], else main.ocean, else main, else body. Off under prefers-reduced-motion. */
(function () {
  if (document.querySelector('.whale-lane')) return;
  var mq = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) return;
  var host = document.querySelector('[data-whale-host]') || document.querySelector('main.ocean') || document.querySelector('main') || document.body;
  host.classList.add('whale-host');
  var lane = document.createElement('div');
  lane.className = 'whale-lane';
  lane.setAttribute('aria-hidden', 'true');
  var whale = document.createElement('div');
  whale.className = 'whale';
  var silhouette = document.createElement('img');
  silhouette.alt = '';
  silhouette.width = 2172;
  silhouette.height = 724;
  silhouette.decoding = 'async';
  whale.appendChild(silhouette);
  lane.appendChild(whale);
  host.appendChild(lane);

  var near = false, timer = 0, swimming = false;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  // The lane is 220px tall and sits inside the host's own box (offsetHeight: the lane itself never changes it).
  function chooseDepth() {
    var height = host.offsetHeight;
    lane.style.top = Math.round(rnd(Math.min(180, height / 4), Math.max(180, height - 220))) + 'px';
  }
  chooseDepth();
  // Pages that change height after load (the Money Trail tabs, lists that load later) could leave the lane below the
  // end of the page, where it stretched the page into a tall empty strip (and the footer buoy's chain ran down it).
  // When the host gets shorter than the lane's spot, pick a new depth inside it.
  function keepInside() {
    if ((parseFloat(lane.style.top) || 0) + 220 > host.offsetHeight) chooseDepth();
  }
  if (window.ResizeObserver) new ResizeObserver(keepInside).observe(host);
  // Inner pages: the host is a centered column, so widen the lane to the viewport or the whale gets clipped at the column edge.
  function fit() {
    if (document.body.classList.contains('home')) return;
    lane.style.left = Math.round(-host.getBoundingClientRect().left) + 'px';
    lane.style.right = 'auto';
    lane.style.width = document.documentElement.clientWidth + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
  function swim() {
    if (!near || swimming || document.hidden) { schedule(rnd(6000, 15000)); return; }
    swimming = true;
    if (!silhouette.getAttribute('src')) silhouette.src = '/blue-whale.png';
    var dir = Math.random() < 0.5 ? 1 : -1;
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
    }).observe(lane);
  }
})();
