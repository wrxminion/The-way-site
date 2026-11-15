"use strict";
// Get Involved: the state picker on the Contact your representatives page (D278).
// Opens the state you pick, scrolls to it and remembers it in this browser only (localStorage). Nothing is sent anywhere.
(function () {
  var pick = document.querySelector(".gi-pick");
  var sel = document.getElementById("gi-state");
  if (!pick || !sel) return;
  var KEY = "theway.getinvolved.state";
  pick.hidden = false;
  function show(id, scroll) {
    var all = document.querySelectorAll(".gi-state");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("gi-picked");
    if (!id) return;
    var d = document.getElementById("st-" + id);
    if (!d) return;
    d.open = true;
    d.classList.add("gi-picked");
    if (scroll) d.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  sel.addEventListener("change", function () {
    try { localStorage.setItem(KEY, sel.value); } catch (e) { /* private mode: this page only */ }
    show(sel.value, true);
  });
  var start = "";
  var m = /^#st-([a-z-]+)$/.exec(location.hash);
  if (m) start = m[1];
  else { try { start = localStorage.getItem(KEY) || ""; } catch (e) { start = ""; } }
  if (start && sel.querySelector('option[value="' + start + '"]')) { sel.value = start; show(start, !!m); }
})();

// Countdowns (D279): every <span class="gi-count" data-at="ISO time" data-label="..."> shows how long until that time,
// in the reader's own clock, and updates each minute. data-day="1" counts whole days only (for a date with no set time).
(function () {
  var els = document.querySelectorAll(".gi-count[data-at]");
  if (!els.length) return;
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function localTime(d) {
    try { return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch (e) { return d.toString(); }
  }
  function tick() {
    var now = Date.now();
    for (var i = 0; i < els.length; i++) {
      var el = els[i], at = new Date(el.getAttribute("data-at"));
      if (isNaN(at)) continue;
      var label = el.getAttribute("data-label") || "Countdown";
      var ms = at.getTime() - now, text;
      if (el.getAttribute("data-day") === "1") {
        var days = Math.ceil(ms / 86400000);
        text = ms <= -86400000 ? "This date has passed." : (days <= 0 ? "Today." : "In " + plural(days, "day") + ".");
        el.classList.toggle("gi-past", ms <= -86400000);
      } else if (ms <= 0) {
        text = label + ": the time has passed. Check the official record for what happened.";
        el.classList.add("gi-past");
      } else {
        var mins = Math.floor(ms / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
        var parts = d ? [plural(d, "day"), plural(h, "hour")] : (h ? [plural(h, "hour"), plural(m, "minute")] : [plural(m, "minute")]);
        text = label + " in " + parts.join(", ") + " (" + localTime(at) + " your time).";
      }
      el.textContent = text;
    }
  }
  tick();
  setInterval(tick, 60000);
})();

// County elections and public meetings on a state page (D282), read live from the district lookup's data
// (/lookup/local/xx.json, written by the local resources job on a home computer after code and model checks).
(function () {
  var box = document.getElementById("gi-local");
  if (!box || !window.fetch) return;
  var st = box.getAttribute("data-state");
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text) x.textContent = text; return x; }
  function fmt(iso) { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch (e) { return iso; } }
  function ok(u) { return typeof u === "string" && /^https:\/\//.test(u); }
  fetch("/lookup/local/" + st + ".json", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var p = box.querySelector(".gi-local-wait");
    if (!d || !d.counties) { if (p) p.textContent = "Our county checker has not reached this state yet."; return; }
    var t = new Date(), today = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
    var names = Object.keys(d.counties), rows = [];
    names.forEach(function (f) {
      var c = d.counties[f];
      (c.elections || []).forEach(function (x) { if (x.d >= today && ok(x.u)) rows.push(["Election", c.name, x]); });
      (c.meetings || []).forEach(function (x) { if (x.d >= today && ok(x.u)) rows.push(["Public meeting", c.name, x]); });
    });
    rows.sort(function (a, b) { return a[2].d < b[2].d ? -1 : a[2].d > b[2].d ? 1 : 0; });
    if (p) p.textContent = "Our county checker has read the official sites of " + names.length + (names.length === 1 ? " county" : " counties") + " here so far. " +
      (rows.length ? "Upcoming dates it found, each confirmed word for word on the official page:" : "It has not found an upcoming local election or meeting date yet. That does not mean there is none.");
    if (!rows.length) return;
    var ul = el("ul", "gi-dates");
    rows.slice(0, 30).forEach(function (r) {
      var li = el("li"), x = r[2];
      var h = el("p", "gi-date"); h.appendChild(el("strong", "", fmt(x.d))); h.appendChild(document.createTextNode(" " + r[0] + " · " + r[1]));
      li.appendChild(h);
      li.appendChild(el("p", "", x.n + ". “" + x.q + "”"));
      var m = el("p", "gi-meta"), a = el("a", "", "Official page ↗"); a.href = x.u; a.rel = "noopener";
      m.appendChild(a); m.appendChild(document.createTextNode(" · checked " + fmt(x.c))); li.appendChild(m);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }).catch(function () { var p = box.querySelector(".gi-local-wait"); if (p) p.textContent = "County dates could not be loaded right now. The district lookup has them."; });
})();
