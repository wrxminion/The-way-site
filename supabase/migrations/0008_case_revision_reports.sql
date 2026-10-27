-- The Way: members can report a history case ("The record") for revision.
--   * report_case_revision(): any active member says what is wrong or missing in a case,
--     with an optional source link. At most 10 reports per member per 24 hours.
--   * Moderators and admins see every report and accept or decline it with a note;
--     each decision goes in the moderation log. A member sees their own reports.
--   * Reports are never deleted. Every insert and decision is in the audit chain.

create table if not exists public.case_revision_reports (
  id             bigint generated always as identity primary key,
  reporter_id    uuid not null references public.members(id),
  case_slug      text not null check (case_slug ~ '^[a-z0-9-]{2,80}$'),
  problem        text not null check (char_length(btrim(problem)) between 10 and 2000),
  source_url     text check (source_url is null or (char_length(source_url) <= 500 and source_url ~* '^https?://[^\s]+$')),
  status         text not null default 'open' check (status in ('open','accepted','declined')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.members(id),
  decision_note  text check (decision_note is null or char_length(btrim(decision_note)) between 3 and 1000),
  check ((status = 'open') = (decided_at is null))
);
create index if not exists case_revision_reports_reporter on public.case_revision_reports (reporter_id, created_at);
create index if not exists case_revision_reports_open on public.case_revision_reports (status, id);

-- No direct writes: only the two functions below change this table.
revoke all on public.case_revision_reports from public, anon, authenticated;
grant select on public.case_revision_reports to authenticated;
alter table public.case_revision_reports enable row level security;

drop policy if exists case_reports_read on public.case_revision_reports;
create policy case_reports_read on public.case_revision_reports for select to authenticated
  using (private.has_role('moderator') or (reporter_id = auth.uid() and private.is_member()));

-- never deleted or truncated; decisions are updates made by decide_case_report()
drop trigger if exists case_revision_reports_no_delete on public.case_revision_reports;
create trigger case_revision_reports_no_delete before delete on public.case_revision_reports
  for each row execute function private.forbid_change();
drop trigger if exists case_revision_reports_no_truncate on public.case_revision_reports;
create trigger case_revision_reports_no_truncate before truncate on public.case_revision_reports
  for each statement execute function private.forbid_change();
drop trigger if exists case_revision_reports_audit on public.case_revision_reports;
create trigger case_revision_reports_audit after insert or update on public.case_revision_reports
  for each row execute function private.audit();

-- the moderation log can name a case report
alter table public.moderation_actions drop constraint if exists moderation_actions_subject_type_check;
alter table public.moderation_actions add constraint moderation_actions_subject_type_check
  check (subject_type in ('post','thread','member','report','role','invitation','case_report'));

create or replace function private.case_reports_daily_max() returns int language sql immutable as $$ select 10 $$;
revoke all on function private.case_reports_daily_max() from public, anon, authenticated;

create or replace function public.report_case_revision(case_slug text, problem text, source_url text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  today int;
  new_id bigint;
  src text := nullif(btrim(source_url), '');
begin
  if not private.is_member() then
    raise exception 'Not allowed: only members can report a case for revision' using errcode = '42501';
  end if;
  if problem is null or char_length(btrim(problem)) < 10 then
    raise exception 'Say what is wrong or missing (at least 10 characters)' using errcode = '22023';
  end if;
  if char_length(btrim(problem)) > 2000 then
    raise exception 'Keep it under 2000 characters' using errcode = '22023';
  end if;
  if src is not null and (char_length(src) > 500 or src !~* '^https?://[^\s]+$') then
    raise exception 'The source link must start with http:// or https://' using errcode = '22023';
  end if;
  if case_slug is null or case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_case_reports'), hashtext(auth.uid()::text));
  select count(*) into today from public.case_revision_reports r
   where r.reporter_id = auth.uid() and r.created_at > now() - interval '24 hours';
  if today >= private.case_reports_daily_max() then
    raise exception 'You have sent % revision reports in the last 24 hours. Try again tomorrow.',
      private.case_reports_daily_max() using errcode = '54000';
  end if;
  insert into public.case_revision_reports (reporter_id, case_slug, problem, source_url)
  values (auth.uid(), report_case_revision.case_slug, btrim(problem), src)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.decide_case_report(report_id bigint, decision text, note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  if decision not in ('accepted','declined') then
    raise exception 'Decision must be accepted or declined' using errcode = '22023';
  end if;
  if note is null or char_length(btrim(note)) not between 3 and 1000 then
    raise exception 'Add a short note (3 to 1000 characters) saying why' using errcode = '22023';
  end if;
  update public.case_revision_reports r
     set status = decision, decided_at = now(), decided_by = auth.uid(), decision_note = btrim(note)
   where r.id = report_id and r.status = 'open';
  if not found then raise exception 'Report already decided or missing' using errcode = '02000'; end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), decision || '_case_report', 'case_report', report_id::text, btrim(note));
end $$;

revoke all on function public.report_case_revision(text, text, text), public.decide_case_report(bigint, text, text) from public, anon;
grant execute on function public.report_case_revision(text, text, text), public.decide_case_report(bigint, text, text) to authenticated;
