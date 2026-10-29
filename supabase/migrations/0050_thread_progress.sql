-- RUN THIS
-- 0050: phase checklist for Pull a Thread. Records WHEN each phase happened (received, reading started and done, sent, outside-source search,
-- preliminary answer, reviewer pick-up and answer) and gives the sender one call, thread_progress(receipt), with the phases, the times and
-- what they sent. Needs 0035, 0037 and 0039 (and 0048 for the reader heartbeat is NOT required: it uses the same checker_keys column).
-- Safe to run twice. Privacy: no sender identity, no rate key, no file name. The picture is never returned: the page shows the sender a
-- preview from their own browser only. Text comes back already hidden-name redacted (the worker replaces it before it is shown).

do $guard$
begin
  if to_regclass('public.thread_leads') is null or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'thread_intakes' and column_name = 'prelim_status') then
    raise exception 'Stop: run 0035, 0037 and 0039 first';
  end if;
end $guard$;

alter table public.thread_intakes add column if not exists phase_times jsonb not null default '{}'::jsonb;

create or replace function private.thread_phase_times() returns trigger
language plpgsql set search_path = '' as $$
declare pt jsonb;
begin
  if tg_op = 'INSERT' then
    new.phase_times := jsonb_build_object('received', now());
    return new;
  end if;
  pt := coalesce(new.phase_times, '{}'::jsonb);
  if not (pt ? 'read_start') and (new.ocr_status = 'running' or new.redact_status = 'running') then pt := pt || jsonb_build_object('read_start', now()); end if;
  if not (pt ? 'read_done') and ((new.ocr_status in ('done','failed') and old.ocr_status is distinct from new.ocr_status)
                                  or (new.redact_status in ('done','failed') and old.redact_status is distinct from new.redact_status)) then
    pt := pt || jsonb_build_object('read_done', now());
  end if;
  if not (pt ? 'sent') and old.status = 'draft' and new.status not in ('draft','expired','discarded') then pt := pt || jsonb_build_object('sent', now()); end if;
  if not (pt ? 'leads_start') and new.leads_status = 'running' then pt := pt || jsonb_build_object('leads_start', now()); end if;
  if not (pt ? 'leads_done') and new.leads_status in ('done','failed') and old.leads_status is distinct from new.leads_status then pt := pt || jsonb_build_object('leads_done', now()); end if;
  if not (pt ? 'prelim_done') and new.prelim_status in ('done','failed') and old.prelim_status is distinct from new.prelim_status then pt := pt || jsonb_build_object('prelim_done', now()); end if;
  if not (pt ? 'picked') and new.status = 'in_review' and old.status is distinct from new.status then pt := pt || jsonb_build_object('picked', now()); end if;
  new.phase_times := pt;
  return new;
end $$;
drop trigger if exists thread_intakes_phase_times on public.thread_intakes;
create trigger thread_intakes_phase_times before insert or update on public.thread_intakes for each row execute function private.thread_phase_times();

create or replace function public.thread_progress(p_receipt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes; on_line boolean; gone boolean;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  if t.id is null then return null; end if;
  select coalesce(max(c.last_seen_at) > now() - interval '2 minutes', false) into on_line from private.checker_keys c where c.revoked_at is null;
  gone := t.status in ('expired','discarded');
  return jsonb_strip_nulls(jsonb_build_object(
    'kind', t.kind, 'code', t.status, 'hide_names', t.hide_names, 'image_mode', t.image_mode, 'image_gone', t.image_deleted_at is not null,
    'online', on_line,
    'reader', case when t.kind = 'screenshot' or t.hide_names then
                case when t.ocr_status = 'pending' or t.redact_status = 'pending' then 'line'
                     when t.ocr_status = 'running' or t.redact_status = 'running' then 'running'
                     when t.ocr_status = 'failed' or t.redact_status = 'failed' then 'failed' else 'done' end
              else 'none' end,
    'leads', t.leads_status, 'prelim', t.prelim_status,
    'leads_count', (select count(*) from public.thread_leads l where l.intake_id = t.id and l.state <> 'rejected'),
    'times', t.phase_times || jsonb_build_object('resolved', t.resolved_at),
    'url', case when t.kind = 'url' and not gone then t.url end,
    'text', case when gone then null
                 when t.kind = 'screenshot' then coalesce(t.ocr_text_fixed, t.ocr_text)
                 when t.kind = 'question' and t.redact_status in ('pending','running') then null
                 else t.question end,
    'note', case when gone then null else t.note end));
end $$;

grant execute on function public.thread_progress(text) to anon, authenticated, service_role;

select 'thread_progress' as what, case when to_regprocedure('public.thread_progress(text)') is not null then 'ok' else 'MISSING' end as result
union all select 'phase_times column', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'thread_intakes' and column_name = 'phase_times') then 'ok' else 'MISSING' end
union all select 'phase_times trigger', case when exists (select 1 from pg_trigger where tgname = 'thread_intakes_phase_times') then 'ok' else 'MISSING' end;
