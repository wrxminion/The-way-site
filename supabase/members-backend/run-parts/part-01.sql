-- The Way members setup, part 1 of 7. Run parts in order. Safe to run again.
do $guard$
declare missing text[] := '{}'; t text;
begin
  foreach t in array array['members','invitations','member_roles','moderation_actions','member_places',
                           'case_revision_reports','categories','research_versions'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('table public.' || t); end if;
  end loop;
  foreach t in array array['public.redeem_invitation(text,text)','public.create_share_link(text,text)',
                           'public.revoke_invitation(bigint,text)','public.notify_signup(text,text)',
                           'private.has_role(text)','private.is_member()','private.audit()'] loop
    if to_regprocedure(t) is null then missing := missing || ('function ' || t); end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception 'Stop: earlier updates are missing (%). Run the older update files first, in order, then this one.', array_to_string(missing, ', ');
  end if;
end $guard$;

create table if not exists public.case_review_events (
  id          bigint generated always as identity primary key,
  case_slug   text not null check (case_slug ~ '^[a-z0-9-]{2,80}$'),
  claim_key   text check (claim_key is null or claim_key ~ '^[0-9a-f]{10}$'),
  claim_text  text check (claim_text is null or char_length(btrim(claim_text)) between 3 and 1000),
  event_type  text not null check (event_type in
                ('claim_checked','claim_flagged','claim_cleared','review_started','note','marked_reviewed','reopened')),
  note        text check (note is null or char_length(btrim(note)) between 3 and 2000),
  actor_id    uuid not null references public.members(id),
  created_at  timestamptz not null default now(),
    check ((event_type in ('claim_checked','claim_flagged','claim_cleared')) = (claim_key is not null)),
  check ((claim_key is null) = (claim_text is null)),
    check (event_type in ('claim_checked','review_started') or note is not null)
);

create index if not exists case_review_events_case on public.case_review_events (case_slug, id);

revoke all on public.case_review_events from public, anon, authenticated;

grant select on public.case_review_events to authenticated;

alter table public.case_review_events enable row level security;

drop policy if exists case_review_events_read on public.case_review_events;

create policy case_review_events_read on public.case_review_events for select to authenticated
  using (private.has_role('moderator'));

drop trigger if exists case_review_events_append_only on public.case_review_events;

create trigger case_review_events_append_only before update or delete on public.case_review_events
  for each row execute function private.forbid_change();

drop trigger if exists case_review_events_no_truncate on public.case_review_events;

create trigger case_review_events_no_truncate before truncate on public.case_review_events
  for each statement execute function private.forbid_change();

drop trigger if exists case_review_events_audit on public.case_review_events;

create trigger case_review_events_audit after insert on public.case_review_events
  for each row execute function private.audit();

alter table public.moderation_actions drop constraint if exists moderation_actions_subject_type_check;

alter table public.moderation_actions add constraint moderation_actions_subject_type_check
  check (subject_type in ('post','thread','member','report','role','invitation','case_report','case_review'));

create or replace function private.case_is_reviewed(slug text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.event_type = 'marked_reviewed'
                     from public.case_review_events e
                    where e.case_slug = slug and e.event_type in ('marked_reviewed','reopened')
                    order by e.id desc limit 1), false);
$$;

create or replace function private.case_open_flags(slug text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select distinct on (e.claim_key) e.event_type
      from public.case_review_events e
     where e.case_slug = slug and e.claim_key is not null
     order by e.claim_key, e.id desc) x
   where x.event_type = 'claim_flagged';
$$;

revoke all on function private.case_is_reviewed(text), private.case_open_flags(text) from public, anon, authenticated;
