// Shared sign-in check for the members pages that make their own Supabase client with auto refresh off.
// getSession() quietly returns nothing when the saved token is old and the refresh fails (and the library then erases the saved sign-in),
// which made signed-in members look signed out. This reads the saved sign-in first, tries getSession, then one explicit refresh.
// Use:  const { data: sess } = await window.WaySession.getSession(sb);   (same shape as sb.auth.getSession())
// window.WaySession.note holds a plain sentence when a saved sign-in exists but could not be used.
(function () {
  'use strict';
  function saved() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && v.refresh_token) return v; }
      }
    } catch (e) { /* no storage: fine */ }
    return null;
  }
  var api = { note: '' };
  api.getSession = async function (sb) {
    var why = '', before = saved();             // read first: a failed refresh erases the saved sign-in
    api.note = '';
    var r = null;
    try { r = await sb.auth.getSession(); if (r && r.data && r.data.session) return r; why = (r && r.error && r.error.message) || ''; } catch (e) { why = (e && e.message) || ''; }
    if (!before) return r || { data: { session: null }, error: null };
    try {
      var x = await sb.auth.refreshSession({ refresh_token: before.refresh_token });
      if (x && x.data && x.data.session) return { data: { session: x.data.session }, error: null };
      why = (x && x.error && x.error.message) || why;
    } catch (e2) { why = (e2 && e2.message) || why; }
    api.note = 'You look signed in on this device, but this page could not use your sign-in' + (why ? ' (' + why + ')' : '') + '. Please sign in again, then come back.';
    return { data: { session: null }, error: null };
  };
  window.WaySession = api;
})();
