// Submit your art (submit-art.html): sends one form to the submit-art Edge Function (supabase/functions/submit-art).
// Signed-out visitors pass a Cloudflare Turnstile check. Nothing a person types is put on the page as HTML (textContent only).
(() => {
'use strict';
const cfg = window.THE_WAY_CONFIG;
const form = document.getElementById('sa-form');
const err = document.getElementById('sa-err');
const live = document.getElementById('sa-live');
const go = document.getElementById('sa-go');
if (!cfg || /YOUR-PROJECT/.test(cfg.supabaseUrl)) { live.textContent = 'Setup needed.'; return; }
const FN = `${cfg.supabaseUrl}/functions/v1/submit-art`;
const MAX = 8 * 1024 * 1024;
let tsToken = null, tsId = null;

if (cfg.turnstileSiteKey) {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = () => { tsId = window.turnstile.render('#sa-ts', { sitekey: cfg.turnstileSiteKey, callback: (t) => { tsToken = t; }, 'expired-callback': () => { tsToken = null; } }); };
  s.onerror = () => { live.textContent = 'The human check was blocked. Please allow challenges.cloudflare.com and reload.'; };
  document.head.append(s);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  const v = (n) => form.elements[n].value.trim();
  const file = form.elements.file.files[0];
  const bad = !v('name') ? ['sa-name', 'Please give the name you want in the credit.']
    : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('email')) ? ['sa-email', 'Please give a working email address.']
    : !v('target') ? ['sa-target', 'Tell us which page or banner the art is for.']
    : (!file && !v('link')) ? ['sa-file', 'Add an image file or a link to your art.']
    : (file && file.size > MAX) ? ['sa-file', 'The image can be up to 8 MB.']
    : (v('link') && !/^https:\/\//i.test(v('link'))) ? ['sa-link', 'The link must start with https://']
    : (v('portfolio') && !/^https:\/\//i.test(v('portfolio'))) ? ['sa-portfolio', 'The portfolio link must start with https://']
    : !form.elements.consent.checked ? ['sa-consent', 'Please tick the box that lets us use your art with credit.'] : null;
  if (bad) { err.textContent = bad[1]; document.getElementById(bad[0]).focus(); return; }
  if (cfg.turnstileSiteKey && !tsToken) { err.textContent = 'Please complete the human check first.'; return; }
  const fd = new FormData(form);
  if (!file) fd.delete('file');
  if (tsToken) fd.append('turnstile', tsToken);
  go.disabled = true; live.textContent = 'Sending…';
  let res = null, body = null;
  try { res = await fetch(FN, { method: 'POST', body: fd }); body = await res.json(); }
  catch { live.textContent = 'Could not reach the site. What you typed is still here; try again in a minute.'; }
  go.disabled = false;
  if (tsId !== null) { tsToken = null; try { window.turnstile.reset(tsId); } catch { /* ignore */ } }
  if (!res) return;
  if (!res.ok) { live.textContent = ''; err.textContent = (body && body.error) || 'Something went wrong. Please try again.'; return; }
  const done = document.createElement('div');
  done.className = 'sa-done';
  const h = document.createElement('h2'); h.textContent = 'Thank you. We got it.';
  const p = document.createElement('p'); p.textContent = 'A person on our team will look at it and write to the email you gave. Your reference: ' + String(body.receipt || '');
  done.append(h, p);
  form.replaceWith(done);
  live.textContent = 'Sent. Thank you.';
  done.setAttribute('tabindex', '-1'); done.focus();
});
})();
