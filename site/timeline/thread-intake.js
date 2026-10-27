(() => {
'use strict';
const $ = (id) => document.getElementById(id);
// Pull a Thread intake. Writes one row to public.thread_submissions (see 0015). Nothing is shown publicly.
const form = $('ptform'), msg = $('ptmsg');
form.addEventListener('submit', async (ev) => {
  ev.preventDefault(); msg.textContent = '';
  const fd = new FormData(form);
  if (fd.get('website')) { msg.textContent = 'Thanks. We received it.'; return; }
  const url = String(fd.get('url') || '').trim();
  if (!/^https?:\/\/\S{4,}$/i.test(url)) { msg.textContent = 'Please paste a full link that starts with http:// or https://'; return; }
  const cfg = window.THE_WAY_CONFIG;
  if (!cfg || !window.supabase) { msg.textContent = 'Sending is not switched on yet.'; return; }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.rpc('submit_thread', { p_url: url, p_why: String(fd.get('why') || '').trim() || null, p_category: fd.get('category') });
  msg.textContent = error ? 'That did not go through (limit reached or sending is not switched on yet). Try again later.' : 'Thanks. A person will read it. We do not promise an investigation.';
  if (!error) form.reset();
});
})();
