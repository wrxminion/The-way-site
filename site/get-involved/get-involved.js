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
