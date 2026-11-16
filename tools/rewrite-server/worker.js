// Cloudflare Worker for https://michiinstitute.com/api/rewrite (D286). Same address as the site, so the site's
// Content Security Policy (connect-src 'self') does not change. It checks the request and forwards it, with the
// shared key, to The Way's rewrite service through the Cloudflare Tunnel. It keeps nothing.
// Settings in the Worker (set in the Cloudflare dashboard, never in this repository):
//   REWRITE_URL  the tunnel address, for example https://rewrite.michiinstitute.com/rewrite
//   WAY_KEY      secret, the same key the rewrite service uses
export default {
  async fetch(request, env) {
    const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return json(405, { error: 'POST only' });
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== 'https://michiinstitute.com' && origin !== 'https://www.michiinstitute.com') return json(403, { error: 'forbidden' });
    const body = await request.text();
    if (body.length > 8000) return json(413, { error: 'too long' });
    try {
      const res = await fetch(env.REWRITE_URL, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/json', 'X-Way-Key': env.WAY_KEY, 'X-Visitor': request.headers.get('CF-Connecting-IP') || '' },
        signal: AbortSignal.timeout(45000)
      });
      return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch {
      return json(503, { error: 'the rewrite computer is not answering' });
    }
  }
};
