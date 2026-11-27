// D297: when the inspector shows a filing, qualifying or ballot fee paid to a state election office,
// add a link to "Barriers to running" for that state (/get-involved/barriers-to-running/#xx).
// Uses only what the inspector already shows: the recipient and "Description on the filing". Text only (textContent).
(function () {
  'use strict';
  var ST = { 'ALABAMA': 'al', 'ALASKA': 'ak', 'ARIZONA': 'az', 'ARKANSAS': 'ar', 'CALIFORNIA': 'ca', 'COLORADO': 'co', 'CONNECTICUT': 'ct',
    'DELAWARE': 'de', 'FLORIDA': 'fl', 'GEORGIA': 'ga', 'HAWAII': 'hi', 'IDAHO': 'id', 'ILLINOIS': 'il', 'INDIANA': 'in', 'IOWA': 'ia',
    'KANSAS': 'ks', 'KENTUCKY': 'ky', 'LOUISIANA': 'la', 'MAINE': 'me', 'MARYLAND': 'md', 'MASSACHUSETTS': 'ma', 'MICHIGAN': 'mi',
    'MINNESOTA': 'mn', 'MISSISSIPPI': 'ms', 'MISSOURI': 'mo', 'MONTANA': 'mt', 'NEBRASKA': 'ne', 'NEVADA': 'nv', 'NEW HAMPSHIRE': 'nh',
    'NEW JERSEY': 'nj', 'NEW MEXICO': 'nm', 'NEW YORK': 'ny', 'NORTH CAROLINA': 'nc', 'NORTH DAKOTA': 'nd', 'OHIO': 'oh', 'OKLAHOMA': 'ok',
    'OREGON': 'or', 'PENNSYLVANIA': 'pa', 'RHODE ISLAND': 'ri', 'SOUTH CAROLINA': 'sc', 'SOUTH DAKOTA': 'sd', 'TENNESSEE': 'tn', 'TEXAS': 'tx',
    'UTAH': 'ut', 'VERMONT': 'vt', 'WEST VIRGINIA': 'wv', 'VIRGINIA': 'va', 'WASHINGTON': 'wa', 'WISCONSIN': 'wi', 'WYOMING': 'wy' };
  var NAMES = {}; Object.keys(ST).forEach(function (k) { NAMES[ST[k]] = k.charAt(0) + k.slice(1).toLowerCase().replace(/ (\w)/g, function (m, c) { return ' ' + c.toUpperCase(); }); });
  var FEE = /\b(FILING|QUALIFYING|QUALIFICATION|BALLOT ACCESS|BALLOT|CANDIDATE)\s*(FILING\s*)?FEES?\b/i;
  var SKIP = /ANNUAL|LATE|PENALTY|FINE/i;
  var OFFICE = /SECRETARY OF (THE )?STATE|DEPARTMENT OF STATE|DEPT\.? OF STATE|DIVISIONS? OF ELECTIONS|BOARD OF ELECTIONS|ELECTIONS? (BOARD|COMMISSION|DIVISION|OFFICE|DEPARTMENT)|STATE ELECTION|SUPERVISOR OF ELECTIONS|COMMONWEALTH OF|STATE OF |STATE TREASURER|TREASURER OF STATE|SECRETARY OF THE COMMONWEALTH|LIEUTENANT GOVERNOR|DEPARTMENT OF ELECTIONS/i;
  function val(det, key) {
    var ks = det.querySelectorAll('.datum .key');
    for (var i = 0; i < ks.length; i++) if (ks[i].textContent === key && ks[i].nextElementSibling) return ks[i].nextElementSibling.textContent;
    return '';
  }
  function stateOf(name) {
    var u = String(name || '').toUpperCase(), keys = Object.keys(ST);
    for (var i = 0; i < keys.length; i++) if (u.indexOf(keys[i]) >= 0) return ST[keys[i]];
    return '';
  }
  function start() {
    var det = document.getElementById('detail-content');
    if (!det) return;
    var add = function () {
      if (det.querySelector('.br-fee-link') || !det.querySelector('h2.mt-selected')) return;
      var to = val(det, 'Recipient'), m = /Description on the filing: ([^.]*)\./.exec(det.textContent || '');
      var desc = m ? m[1] : '';
      if (!to || !desc || !FEE.test(desc) || SKIP.test(desc) || !OFFICE.test(to)) return;
      var st = stateOf(to);
      var p = document.createElement('p'); p.className = 'br-fee-link detail-caution';
      var a = document.createElement('a');
      a.href = '/get-involved/barriers-to-running/' + (st ? '#' + st : '');
      a.textContent = st ? 'What it takes to get on the ballot in ' + NAMES[st] + ' →' : 'What it takes to get on the ballot in each state →';
      p.appendChild(document.createTextNode('This looks like a fee to get on the ballot. '));
      p.appendChild(a);
      var after = det.querySelector('.event-amount') || det.querySelector('h2.mt-selected');
      after.parentNode.insertBefore(p, after.nextSibling);
    };
    new MutationObserver(add).observe(det, { childList: true });
    add();
  }
  // The inspector is already in the page above this script, so start now (like fec-more.js) rather than wait for DOMContentLoaded.
  if (document.getElementById('detail-content')) start(); else document.addEventListener('DOMContentLoaded', start);
})();
