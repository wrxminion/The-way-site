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
    about.href = '/deeper.html'; about.textContent = 'Why?';
    var methods = document.createElement('a');
    methods.href = '/development/methods/';
    methods.textContent = 'Methodology';
    var legal = document.createElement('span');
    legal.textContent = 'Legal (coming soon)';
    nav.appendChild(about); nav.appendChild(methods); nav.appendChild(legal);
    footer.appendChild(nav);
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
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/footer-quick.css?v=1'; document.head.appendChild(css);
  appendFooter(); updateEssayBar();
})();
