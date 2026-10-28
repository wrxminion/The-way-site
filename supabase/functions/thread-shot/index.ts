// Hands ONE screenshot to the archiver so it can read the text (Supabase Edge Function, Deno). Deploy name: thread-shot,
// "Verify JWT" OFF (the archiver sends its checker key in the body, like the other the archiver jobs). the archiver never gets storage access:
// the database says whether this exact file belongs to a screenshot the archiver has been handed to read, and only then does
// this function download it with the service role. Anything else is a plain 404. Nothing is cached or logged.
// With action "delete" it removes a picture the database says is due (a database row cannot remove the file itself).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.9";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function handler(req: Request, env = Deno.env, mk = createClient): Promise<Response> {
  const no = () => new Response("not found", { status: 404 });
  if (req.method !== "POST") return no();
  let body: { checker_key?: unknown; intake_id?: unknown; path?: unknown; action?: unknown };
  try { body = await req.json(); } catch { return no(); }
  const { checker_key, intake_id, path } = body;
  if (typeof checker_key !== "string" || typeof path !== "string" || typeof intake_id !== "number" || !Number.isInteger(intake_id)) return no();
  const m = /^[0-9a-f-]{36}\.(png|jpg|webp)$/.exec(path);
  if (!m) return no();
  const sb = mk(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (body.action === "delete") {
    // the archiver asks us to remove a picture the database says is due (text-only after reading, kept ones after their days, closed items)
    const due = await sb.rpc("checker_thread_image_due_ok", { checker_key, intake_id, path });
    if (due.error || due.data !== true) return no();
    const rm = await sb.storage.from("thread-screenshots").remove([path]);
    if (rm.error) return new Response("could not delete", { status: 500 });
    const mark = await sb.rpc("checker_thread_image_deleted", { checker_key, intake_id, path });
    if (mark.error) return new Response("deleted but not marked", { status: 500 });
    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  const { data: ok, error } = await sb.rpc("checker_thread_ocr_ok", { checker_key, intake_id, path });
  if (error || ok !== true) return no();
  const dl = await sb.storage.from("thread-screenshots").download(path);
  if (dl.error || !dl.data) return no();
  return new Response(dl.data, { status: 200, headers: { "content-type": TYPES[m[1]], "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

if (import.meta.main) Deno.serve((req) => handler(req));
