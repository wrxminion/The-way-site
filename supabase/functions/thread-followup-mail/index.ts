// One-off follow-up replies for Pull a Thread (Supabase Edge Function, Deno). Deploy name: thread-followup-mail,
// "Verify JWT" OFF (a scheduler calls it with a secret header). It does NOTHING unless Frank sets all four secrets:
//   THREAD_MAIL_ON = yes, THREAD_MAIL_CRON_SECRET, RESEND_API_KEY, THREAD_MAIL_FROM (an address on a verified domain).
// This is not the mailing list, which stays off until the PO box exists. Each visitor who left an address gets ONE
// plain message about the one thing they sent, and the address is erased right after it is sent (or after 30 days).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.9";

const SITE = "https://michiinstitute.com";
const clean = (s: string) => s.replace(/[\r\n<>]+/g, " ").trim();

export function compose(row: { headline: string; body: string; link: string }): { subject: string; text: string } {
  const link = /^\/[A-Za-z0-9\/_#.?=&%-]{0,250}$/.test(row.link) ? SITE + row.link : SITE + "/members/pull-a-thread.html";
  return {
    subject: clean(row.headline).slice(0, 120),
    text: [
      "Hello,", "",
      "You asked us to write back about something you sent to Pull a Thread.", "",
      clean(row.headline), clean(row.body || ""), "",
      "See it here: " + link, "",
      "This is the one reply you asked for. We have erased your email address and will not write to you again.", "",
      "The Way (Michi Institute). Not left. Not right. We are The Way.",
    ].join("\n"),
  };
}

export async function run(req: Request, env = Deno.env, mk = createClient, send: typeof fetch = fetch): Promise<Response> {
  if (env.get("THREAD_MAIL_ON") !== "yes") return new Response(JSON.stringify({ sent: 0, note: "switched off" }), { status: 200 });
  const secret = env.get("THREAD_MAIL_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("no", { status: 401 });
  const key = env.get("RESEND_API_KEY"), from = env.get("THREAD_MAIL_FROM");
  if (!key || !from) return new Response(JSON.stringify({ sent: 0, note: "mail key or sender missing" }), { status: 200 });
  const sb = mk(env.get("SUPABASE_URL")!, env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  await sb.rpc("mail_expire_thread_followups");
  const { data, error } = await sb.rpc("mail_due_thread_followups", { p_limit: 20 });
  if (error) return new Response(JSON.stringify({ error: "database" }), { status: 500 });
  let sent = 0;
  for (const row of data ?? []) {
    const m = compose(row);
    // fixed mail provider address, not a user-supplied link
    const r = await send("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [row.email], subject: m.subject, text: m.text }),
    });
    await sb.rpc("mail_thread_followup_result", { p_followup: row.followup_id, p_sent: r.ok });
    if (r.ok) sent++;
  }
  return new Response(JSON.stringify({ sent }), { status: 200 });
}

if (import.meta.main) Deno.serve((req) => run(req));
