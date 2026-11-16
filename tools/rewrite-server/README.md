# The Way rewrite service (our own AI)

The Contact Your Senator and Contact Your Representative pages can send a reader's rough notes to our own Ollama
model for a rewrite. The reader must press "Rewrite it with The Way's AI"; nothing is sent before that.
If the computer is off or busy, the page uses the built-in cleanup (own.js) and still works.

The button stays hidden until this is set up. To show it, add `data-ai="on"` to `<div id="cys" ...>` on both pages.

## How it fits together

1. `rewrite_server.py` runs on our AI computer. It listens only on 127.0.0.1:8787, accepts only POST /rewrite,
   checks the shared key, limits each visitor to 6 rewrites a minute, and logs no text.
2. A Cloudflare Tunnel (cloudflared) on that computer publishes it as `rewrite.michiinstitute.com`.
   No ports are opened on the home network.
3. The Cloudflare Worker in `worker.js` answers `https://michiinstitute.com/api/rewrite` and forwards to the tunnel
   with the shared key. Same address as the site, so the site's security policy does not change.

## Setup (done by the person who owns the computer and the Cloudflare account)

1. Ollama is running, with the model pulled (for example `ollama pull llama3.1:8b`).
2. Make up a long random key. Keep it only in the two places below, never in this repository or in a chat.
3. On the AI computer: set `WAY_KEY` to the key and `WAY_MODEL` to the model name, then run
   `python rewrite_server.py` (or as a startup task).
4. In Cloudflare Zero Trust, create a tunnel on that computer with public hostname `rewrite.michiinstitute.com`
   pointing to `http://127.0.0.1:8787`.
5. In Cloudflare Workers, create a Worker from `worker.js`, add the variable `REWRITE_URL`
   = `https://rewrite.michiinstitute.com/rewrite` and the secret `WAY_KEY` = the key, and add the route
   `michiinstitute.com/api/rewrite`.
6. Turn the button on: `data-ai="on"` on both pages, and add a line to the privacy page saying that notes are sent
   to our own AI computer only when the reader presses the button, and are not saved (one small pull request).
