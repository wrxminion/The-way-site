// Starts the Contact Your Senator tool (tool.js) on its public page. Gives it the small DOM helpers it uses.
// The issue can be picked by link: ?issue=schumer-leader (or #schumer-leader).
(function () {
  'use strict';
  var box = document.getElementById('cys');
  if (!box || !window.TheWaySenatorLetters) return;
  function h(tag, attrs) {
    var el = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) {
      list.forEach(function (kid) {
        if (Array.isArray(kid)) return add(kid);
        if (kid == null || kid === false) return;
        el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }
  function render(node) { box.replaceChildren(node); }
  function notice(text) { return h('p', { class: 'gw-status', text: text }); }
  var id = '';
  try { id = new URLSearchParams(location.search).get('issue') || ''; } catch (e) { id = ''; }
  if (!id && location.hash.length > 1) id = decodeURIComponent(location.hash.slice(1));
  window.TheWaySenatorLetters.make({ h: h, render: render, notice: notice }).view(id);
})();
