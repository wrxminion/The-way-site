// Pull a Thread intake (Supabase Edge Function, Deno). Deploy name: pull-thread. Leave "Verify JWT" OFF: signed-out
// visitors call it too. The checks that matter happen here and in the database function intake_thread().
//
// What it does: checks the human check (signed-out only), reads one link, one screenshot or one question, stores a
// screenshot in the private bucket, and calls public.intake_thread() with the service role.
// What it never does: open the link a person sent. Links are only ever opened by the archiver, through the
// public-addresses-only fetcher (precheck.py, check_url). Nothing from the request is echoed back as HTML.
// Secrets (typed by Frank in Supabase, never in git): TURNSTILE_SECRET, RATE_SALT. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Optional: ALLOWED_ORIGINS (comma list).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.9";

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://michiinstitute.com,https://www.michiinstitute.com").split(",");
const MAX_BODY = 5_000_000, MAX_SHOT = 4_194_304;

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
  if (!len || len > MAX_BODY) return reply(origin, 413, { error: "That is too large. Screenshots can be up to 4 MB." });

  const salt = env.get("RATE_SALT"), tsSecret = env.get("TURNSTILE_SECRET");
  if (!salt) return reply(origin, 503, { error: "Pull a Thread is not switched on yet" });

  let form: FormData;
  try { form = await req.formData(); } catch { return reply(origin, 400, { error: "Could not read the form" }); }
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };
  const kind = str("kind");
  if (!["url", "screenshot", "question"].includes(kind)) return reply(origin, 400, { error: "Send a link, a screenshot or a question" });

  const sb = mk(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // who is asking: a signed-in active member (their own session token) or a visitor
  let member: string | null = null;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer) {
    const { data } = await sb.auth.getUser(bearer);
    if (data?.user) {
      const { data: m } = await sb.from("members").select("id,status").eq("id", data.user.id).maybeSingle();
      if (m && m.status === "active") member = m.id;
    }
  }
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!member) {
    if (!tsSecret) return reply(origin, 503, { error: "The human check is not switched on yet" });
    const token = str("turnstile");
    if (!token) return reply(origin, 400, { error: "Please complete the human check" });
    const body = new URLSearchParams({ secret: tsSecret, response: token });
    if (ip !== "unknown") body.set("remoteip", ip);
    // fixed Cloudflare address, not a user-supplied link
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    if (!j.success) return reply(origin, 400, { error: "The human check did not pass. Please try again." });
  }
  const day = new Date().toISOString().slice(0, 10);
  const rateKey = member ? await sha256hex(`${salt}|m|${member}`) : await sha256hex(`${salt}|${day}|${ip}`);

  let shotPath: string | null = null, shotBytes: number | null = null;
  if (kind === "screenshot") {
    const f = form.get("shot");
    if (!(f instanceof File) || f.size < 1 || f.size > MAX_SHOT) return reply(origin, 400, { error: "Attach one image, up to 4 MB" });
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t = sniffImage(bytes);
    if (!t) return reply(origin, 400, { error: "The screenshot must be a PNG, JPEG or WebP image" });
    shotPath = `${crypto.randomUUID()}.${t.ext}`;
    shotBytes = bytes.length;
    const up = await sb.storage.from("thread-screenshots").upload(shotPath, bytes, { contentType: t.type, upsert: false });
    if (up.error) return reply(origin, 500, { error: "Could not save the screenshot. Please try again." });
  }

  const { data, error } = await sb.rpc("intake_thread", {
    p_kind: kind, p_url: kind === "url" ? str("url") : null, p_question: kind === "question" ? str("question") : null,
    p_note: str("note") || null, p_shot_path: shotPath, p_shot_bytes: shotBytes, p_member: member, p_rate_key: rateKey,
    p_image_mode: str("image_mode") === "review" ? "review" : "text_only",
    p_hide_names: kind !== "url" && ["1", "on", "yes", "true"].includes(str("hide_names").toLowerCase()),
  });
  if (error) {
    if (shotPath) await sb.storage.from("thread-screenshots").remove([shotPath]);
    const code = (error as { code?: string }).code;
    // the database messages for these codes are written for the sender
    if (code === "54000") return reply(origin, 429, { error: error.message });
    if (code === "22023") return reply(origin, 400, { error: error.message });
    return reply(origin, 500, { error: "Something went wrong. Please try again later." });
  }
  return reply(origin, 200, { receipt: data.receipt, status: data.status, matches: data.matches });
}

if (import.meta.main) Deno.serve((req) => handler(req));
