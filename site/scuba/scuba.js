// Shared helpers for the Scuba Steve and Bruce art (ChatGPT scene modules in /scuba/). Decorative only. No inline scripts or styles.
(function () {
  'use strict';
  var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var loaded = {};
  window.ScubaArt = {
    reduced: function () { return !!(mq && mq.matches); },
    // the site-wide Pause motion switch (motion-pause.js) puts this class on <html>
    off: function () { return document.documentElement.classList.contains('wb-motion-off'); },
    // give every id in an SVG string a prefix so two scenes on one page never share a gradient or clip
    pre: function (s, p) { return s.replace(/id="([^"]+)"/g, 'id="' + p + '$1"').replace(/url\(#/g, 'url(#' + p).replace(/href="#/g, 'href="#' + p); },
    // the inside of an <svg> string
    inner: function (s) { return s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''); },
    // load scripts in order, once each
    load: function (urls, done) {
      var i = 0;
      (function next() {
        if (i >= urls.length) { done(); return; }
        var u = urls[i++];
        if (loaded[u] === true) { next(); return; }
        if (loaded[u]) { loaded[u].push(next); return; }
        loaded[u] = [next];
        var s = document.createElement('script'); s.src = u;
        s.onload = function () { var q = loaded[u]; loaded[u] = true; q.forEach(function (f) { f(); }); };
        s.onerror = function () { var q = loaded[u]; loaded[u] = true; q.forEach(function (f) { f(); }); };
        document.head.appendChild(s);
      })();
    }
  };
})();
