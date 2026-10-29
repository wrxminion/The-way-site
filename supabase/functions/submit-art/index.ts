// Submit your art (Supabase Edge Function, Deno). Deploy name: submit-art. Leave "Verify JWT" OFF: signed-out visitors call it.
// Same pattern as pull-thread: Cloudflare Turnstile check, origin check, rate limit in the database, one call to
// public.submit_art() with the service role. The image goes to the private bucket art-submissions (PNG, JPEG or WebP, up to 8 MB).
// The email is for review only: it is never added to a list. Nothing from the request is echoed back as HTML.
// Secrets (already set for pull-thread): TURNSTILE_SECRET, RATE_SALT. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.9";

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://michiinstitute.com,https://www.michiinstitute.com").split(",");
const MAX_BODY = 9_000_000, MAX_FILE = 8_388_608;

export function sniffImage(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function reply(origin: string | null, status: number, body: Record<string, unknown>): Response {
  const h: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin && ORIGINS.includes(origin)) { h["access-control-allow-origin"] = origin; h["vary"] = "origin"; }
  return new Response(JSON.stringify(body), { status, headers: h });
}

export async function handler(req: Request, env = Deno.env, mk = createClient): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    const h: Record<string, string> = { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type, apikey" };
    if (origin && ORIGINS.includes(origin)) { h["access-control-allow-origin"] = origin; h["vary"] = "origin"; }
    return new Response(null, { status: 204, headers: h });
  }
  if (req.method !== "POST") return reply(origin, 405, { error: "POST only" });
  if (!origin || !ORIGINS.includes(origin)) return reply(origin, 403, { error: "This form only works from our website" });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BODY) return reply(origin, 413, { error: "That is too large. Images can be up to 8 MB." });

  const salt = env.get("RATE_SALT"), tsSecret = env.get("TURNSTILE_SECRET");
  if (!salt || !tsSecret) return reply(origin, 503, { error: "Art submissions are not switched on yet" });

  let form: FormData;
  try { form = await req.formData(); } catch { return reply(origin, 400, { error: "Could not read the form" }); }
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };

  const name = str("name"), email = str("email"), target = str("target"), link = str("link"), portfolio = str("portfolio"), note = str("note");
  if (str("website")) return reply(origin, 200, { receipt: "ok" });                       // hidden trap field: a bot filled it
  if (!name || name.length > 80) return reply(origin, 400, { error: "Please give the name you want in the credit (up to 80 characters)" });
  if (email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(origin, 400, { error: "Please give a working email address" });
  if (!target || target.length > 200) return reply(origin, 400, { error: "Tell us which page or banner the art is for" });
  if (note.length > 500) return reply(origin, 400, { error: "Keep the note to 500 characters" });
  if (!["1", "on", "yes", "true"].includes(str("consent").toLowerCase())) return reply(origin, 400, { error: "Please tick the box that lets us use your art with credit" });
  if (link && (!/^https:\/\//i.test(link) || link.length > 500)) return reply(origin, 400, { error: "The link must start with https:// and be under 500 characters" });
  if (portfolio && (!/^https:\/\//i.test(portfolio) || portfolio.length > 500)) return reply(origin, 400, { error: "The portfolio link must start with https:// and be under 500 characters" });
  const f = form.get("file");
  const hasFile = f instanceof File && f.size > 0;
  if (!hasFile && !link) return reply(origin, 400, { error: "Add an image or a link to your art" });
  if (hasFile && (f as File).size > MAX_FILE) return reply(origin, 400, { error: "The image can be up to 8 MB" });

  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const token = str("turnstile");
  if (!token) return reply(origin, 400, { error: "Please complete the human check" });
  const body = new URLSearchParams({ secret: tsSecret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  // fixed Cloudflare address, not a user-supplied link
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  if (!j.success) {
    console.log("turnstile failed:", JSON.stringify(j["error-codes"] ?? []));
    return reply(origin, 400, { error: "The human check did not pass. Please try again." });
  }

  const sb = mk(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const rateKey = await sha256hex(`${salt}|art|${ip}`);

  let path: string | null = null, bytes: number | null = null;
  if (hasFile) {
    const buf = new Uint8Array(await (f as File).arrayBuffer());
    const t = sniffImage(buf);
    if (!t) return reply(origin, 400, { error: "The image must be a PNG, JPEG or WebP file" });
    path = `${crypto.randomUUID()}.${t.ext}`;
    bytes = buf.length;
    const up = await sb.storage.from("art-submissions").upload(path, buf, { contentType: t.type, upsert: false });
    if (up.error) return reply(origin, 500, { error: "Could not save the image. Please try again." });
  }

  const { data, error } = await sb.rpc("submit_art", {
    p_name: name, p_email: email, p_target: target, p_link: link || null, p_portfolio: portfolio || null, p_file_path: path, p_file_bytes: bytes,
    p_note: note || null, p_rate_key: rateKey,
  });
  if (error) {
    if (path) await sb.storage.from("art-submissions").remove([path]);
    const code = (error as { code?: string }).code;
    if (code === "54000") return reply(origin, 429, { error: error.message });
    if (code === "22023") return reply(origin, 400, { error: error.message });
    return reply(origin, 500, { error: "Something went wrong. Please try again later." });
  }
  return reply(origin, 200, { receipt: data });
}

if (import.meta.main) Deno.serve((req) => handler(req));
