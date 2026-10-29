-- RUN THIS
-- 0048: lets the Pull a Thread page say plainly where a screenshot or hidden-names text is: "in line", "being checked", or
-- "our reader is paused". Needs 0035 (ocr_status, redact_status). Safe to run twice. Nothing private: no text, no sender.
-- online = our reader program contacted the site in the last 2 minutes (the same heartbeat checker_ping uses).

do $guard$
begin
  if to_regclass('public.thread_intakes') is null then raise exception 'Stop: run 0030 to 0035 first'; end if;
end $guard$;

create or replace function public.thread_reader_state(p_receipt text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes; on_line boolean;
begin
  select coalesce(max(c.last_seen_at) > now() - interval '2 minutes', false) into on_line from private.checker_keys c where c.revoked_at is null;
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  return jsonb_build_object('online', on_line,
    'stage', case when t.id is null then null
                  when t.ocr_status = 'pending' or t.redact_status = 'pending' then 'line'
                  when t.ocr_status = 'running' or t.redact_status = 'running' then 'checking'
                  else null end);
end $$;

grant execute on function public.thread_reader_state(text) to anon, authenticated, service_role;

select 'thread_reader_state' as what, case when to_regprocedure('public.thread_reader_state(text)') is not null then 'ok' else 'MISSING' end as result;
