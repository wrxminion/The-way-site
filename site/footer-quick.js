(function () {
  'use strict';
  function appendFooter() {
    if (document.querySelector('.michi-footer-nav')) return;
    var footer = document.querySelector('footer.foot, body > footer, main > footer');
    if (!footer) { footer = document.createElement('footer'); document.body.appendChild(footer); }
    var nav = document.createElement('nav');
    nav.className = 'michi-footer-nav';
    nav.setAttribute('aria-label', 'About and policies');
    var about = document.createElement('a');
    about.href = '/deeper.html'; about.className = 'michi-footer-mark-link'; about.setAttribute('aria-label', 'Why? The Way');
    var mark = document.createElement('img');
    mark.src = '/the-way-logo-76.png'; mark.alt = ''; mark.width = 28; mark.height = 28; mark.className = 'michi-footer-mark';
    about.appendChild(mark);
    // Research moved here from the top bar (Frank, Nov 6 2026), named Research methods.
    // Research methods and Methodology are one page and one link now; the site methods live at /research/#methods (Frank, Nov 6 2026).
    var research = document.createElement('a');
    research.href = '/research/';
    research.textContent = 'Research methods';
    // The teacher, parent and kids material has its own link (Frank, Nov 6 2026)
    var teach = document.createElement('a');
    teach.href = '/teacher-parent.html';
    teach.textContent = 'Teachers and kids';
    var art = document.createElement('a');
    art.href = '/members/submit-art.html';
    art.textContent = 'Submit your art';
    var legal = document.createElement('a');
    legal.href = '/legal.html'; legal.textContent = 'Legal';
    // All four links on one line, the logo on its own line under them (Frank, Nov 6 2026)
    var links = document.createElement('span');
    links.className = 'michi-footer-links';
    links.appendChild(research); links.appendChild(teach); links.appendChild(art); links.appendChild(legal);
    var artBox = document.createElement('span');
    artBox.className = 'michi-footer-art';
    artBox.appendChild(about);
    nav.appendChild(links); nav.appendChild(artBox);
    footer.appendChild(nav);
    addDepth(nav);
  }

  // Depth counter: how many articles the news archive holds. Reads the count the news publisher already writes (/news/data/status.json, archive_items); nothing is shown if it can't be read.
  function addDepth(nav) {
    if (!window.fetch || nav.querySelector('.michi-footer-depth')) return;
    fetch('/news/data/status.json', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var n = d && Number(d.archive_items);
        if (!n || n < 0 || nav.querySelector('.michi-footer-depth')) return;
        var a = document.createElement('a');
        a.className = 'michi-footer-depth'; a.href = '/news/';
        var num = document.createElement('strong');
        num.textContent = Math.floor(n).toLocaleString('en-US');
        a.appendChild(document.createTextNode('Depth: '));
        a.appendChild(num);
        a.appendChild(document.createTextNode(' articles saved'));
        nav.appendChild(a);
      })
      .catch(function () {});
  }
  function signedIn() {
    try {
      var exists = false;
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) { exists = true; break; }
      }
      var data = JSON.parse(localStorage.getItem('theway.bar') || 'null');
      return exists && data && data.v === 1 && typeof data.name === 'string' && !!data.name.trim();
    } catch (e) { return false; }
  }
  function updateEssayBar() {
    var bar = document.querySelector('.essay-quick-links');
    if (!bar) return;
    bar.replaceChildren();
    if (!signedIn()) {
      var access = document.createElement('span');
      access.className = 'essay-access';
      var join = document.createElement('a'); join.href = '/join.html'; join.textContent = 'Join';
      var signin = document.createElement('a'); signin.href = '/members/'; signin.textContent = 'Sign in';
      access.appendChild(join); access.appendChild(document.createTextNode(' / ')); access.appendChild(signin);
      bar.appendChild(access);
    }
    var form = document.createElement('form'); form.className = 'essay-search'; form.setAttribute('role','search'); form.action = '/search/'; form.method = 'get';
    var label = document.createElement('label'); label.setAttribute('for','essay-quick-q'); label.textContent = 'Search the whole site';
    var input = document.createElement('input'); input.id = 'essay-quick-q'; input.name = 'q'; input.type = 'search'; input.placeholder = 'Search'; input.maxLength = 120;
    var button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Search';
    form.appendChild(label); form.appendChild(input); form.appendChild(button);
    form.addEventListener('submit', function (e) { e.preventDefault(); var q = input.value.trim(); location.href = '/search/' + (q ? '?q=' + encodeURIComponent(q) : ''); });
    var back = document.createElement('a'); back.href = '#top'; back.textContent = 'Back to surface';
    bar.appendChild(form); bar.appendChild(back);
    function visibility() { bar.hidden = window.scrollY <= 80; }
    window.addEventListener('scroll', visibility, { passive: true }); visibility();
  }
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/footer-quick.css?v=5'; document.head.appendChild(css);
  appendFooter(); updateEssayBar();
  // Buoys: the depth counter buoy on its chain and the floating buoys (see /buoys.js)
  if (!document.querySelector('script[src^="/buoys.js"]')) { var buoys = document.createElement('script'); buoys.src = '/buoys.js?v=4'; buoys.defer = true; document.head.appendChild(buoys); }
})();
