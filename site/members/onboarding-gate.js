// Sends a brand-new member to the welcome page once. Never loops, never blocks: any failure leaves the member on Home.
// Runs on the members Home page only. Uses sessionStorage so a member who skips (or comes back) is not sent again in the same visit.
(() => {
'use strict';
try { if (sessionStorage.getItem('way-welcome-checked') === '1') return; } catch { /* continue */ }
const cfg = window.THE_WAY_CONFIG;
if (!cfg || !window.supabase || !window.WaySession || /welcome\.html/.test(location.pathname)) return;
(async () => {
  try {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: false } });
    const { data: sess } = await window.WaySession.getSession(sb);
    if (!sess || !sess.session) return;
    try { sessionStorage.setItem('way-welcome-checked', '1'); } catch { /* ignore */ }
    const o = await sb.rpc('my_onboarding');
    const row = o.data && o.data[0];
    if (row && row.needs_welcome) location.replace('/members/welcome.html');
  } catch { /* stay on Home */ }
})();
})();
