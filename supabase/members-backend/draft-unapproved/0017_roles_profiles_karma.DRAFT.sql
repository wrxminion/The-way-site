-- DRAFT, NOT FOR PASTING. Proposal only; Frank has not approved it. 0016 is reserved for the My Ballot planner.
-- The Way: roles, member profiles, role applications, and a standing ledger ("karma").
-- Design: DESIGN-members-roles-karma-review-commons.md (same folder). Tested only on a local Postgres 16.
--
-- Principles held in SQL, not in the app:
--   * karma is an append-only ledger. Nothing is edited or deleted; a reversal is a new negative row.
--   * karma is earned only for process work (sources submitted, checked, corrections accepted), never for
--     a position, a vote count, or a reaction. No function here reads what a claim argues.
--   * karma never grants power by itself. Roles come from an application a human decides.
--   * only a super_admin can make or remove an admin.

-- ---------------------------------------------------------------- roles
alter table public.member_roles drop constraint if exists member_roles_role_check;
alter table public.member_roles add constraint member_roles_role_check
  check (role in ('moderator','researcher','reviewer','admin','scholar','journalist','super_admin'));

-- admin still counts as every role (as in 0001), except super_admin; super_admin counts as everything.
create or replace function private.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_roles r join public.members m on m.id = r.member_id
    where r.member_id = auth.uid() and m.status = 'active'
      and (r.role = wanted or r.role = 'super_admin' or (r.role = 'admin' and wanted <> 'super_admin')));
$$;

create or replace function public.set_role(member_id uuid, role text, grant_it boolean, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if role not in ('moderator','researcher','reviewer','admin','scholar','journalist','super_admin') then
    raise exception 'Unknown role %', role using errcode = '22023';
  end if;
  if role in ('admin','super_admin') then
    perform private.require_role('super_admin');   -- only a super admin makes or removes admins
  end if;
  if char_length(btrim(coalesce(reason,''))) < 5 then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  if grant_it then
    insert into public.member_roles (member_id, role, granted_by) values (member_id, role, auth.uid()) on conflict do nothing;
  else
    if role in ('admin','super_admin') and member_id = auth.uid() then
      raise exception 'You cannot remove your own %', role using errcode = '42501';
    end if;
    if role = 'super_admin' and (select count(*) from public.member_roles r where r.role = 'super_admin') <= 1 then
      raise exception 'There must always be one super admin' using errcode = '42501';
    end if;
    delete from public.member_roles r where r.member_id = set_role.member_id and r.role = set_role.role;
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), case when grant_it then 'grant_' else 'remove_' end || role, 'role', member_id::text, reason);
end $$;

-- ---------------------------------------------------------------- profile (public part is short on purpose)
create table if not exists public.member_profiles (
  member_id    uuid primary key references public.members(id) on delete cascade,
  bio          text check (char_length(bio) <= 300 and bio !~ '[<>]'),
  affiliation  text check (char_length(affiliation) <= 120 and affiliation !~ '[<>]'),
  public_links text[] not null default '{}' check (cardinality(public_links) <= 3),
  show_affiliation boolean not null default false,
  updated_at   timestamptz not null default now()
);
alter table public.member_profiles enable row level security;
alter table public.member_profiles force row level security;
revoke all on public.member_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.member_profiles to authenticated;
drop policy if exists member_profiles_own on public.member_profiles;
create policy member_profiles_own on public.member_profiles for all to authenticated
  using (member_id = auth.uid()) with check (member_id = auth.uid());

-- ---------------------------------------------------------------- role applications
create table if not exists public.role_applications (
  id            bigint generated always as identity primary key,
  member_id     uuid not null default auth.uid() references public.members(id),
  role          text not null check (role in ('scholar','journalist','reviewer','researcher','moderator')),
  statement     text not null check (char_length(btrim(statement)) between 20 and 1000 and statement !~ '[<>]'),
  affiliation   text check (char_length(affiliation) <= 200),
  evidence_urls text[] not null default '{}' check (cardinality(evidence_urls) between 0 and 5),
  status        text not null default 'open' check (status in ('open','approved','declined','withdrawn')),
  decided_by    uuid references public.members(id),
  decision_reason text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);
create unique index if not exists role_applications_one_open on public.role_applications (member_id, role) where status = 'open';
alter table public.role_applications enable row level security;
revoke all on public.role_applications from public, anon, authenticated;
grant select on public.role_applications to authenticated;
drop policy if exists role_applications_read on public.role_applications;
create policy role_applications_read on public.role_applications for select to authenticated
  using (member_id = auth.uid() or private.has_role('admin'));

create or replace function public.apply_for_role(p_role text, p_statement text, p_affiliation text default null, p_evidence text[] default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare rid bigint;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if exists (select 1 from public.member_roles r where r.member_id = auth.uid() and r.role = p_role) then
    raise exception 'You already have that role' using errcode = '23505';
  end if;
  insert into public.role_applications (member_id, role, statement, affiliation, evidence_urls)
  values (auth.uid(), p_role, p_statement, p_affiliation, p_evidence) returning id into rid;
  return rid;
end $$;

create or replace function public.decide_role_application(p_id bigint, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.role_applications;
begin
  perform private.require_role('admin');
  select * into a from public.role_applications x where x.id = p_id and x.status = 'open' for update;
  if a.id is null then raise exception 'No open application' using errcode = '02000'; end if;
  if a.member_id = auth.uid() then raise exception 'Someone else must decide your application' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Give a reason' using errcode = '22023'; end if;
  update public.role_applications set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decision_reason = p_reason, decided_at = now() where id = p_id;
  if p_approve then
    insert into public.member_roles (member_id, role, granted_by) values (a.member_id, a.role, auth.uid()) on conflict do nothing;
  end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), (case when p_approve then 'approve_' else 'decline_' end) || a.role, 'role', a.member_id::text, p_reason);
end $$;

-- ---------------------------------------------------------------- karma ledger
create table if not exists public.karma_rules (
  kind        text primary key,
  points      int  not null,
  daily_cap   int  not null default 50,   -- most points one member can earn per kind per day
  needs_other_member boolean not null default true,  -- earned only when a different member signs off
  note        text not null
);
insert into public.karma_rules (kind, points, daily_cap, needs_other_member, note) values
  ('source_accepted',        5, 25, true,  'A source you submitted was checked by someone else and its quote matched'),
  ('source_verified',        3, 30, true,  'You checked a source against the original (human_verified set) and another reviewer agreed'),
  ('claim_review_agreed',    2, 20, true,  'Your independent claim review matched the final outcome of the process (not a vote on truth)'),
  ('correction_accepted',    8, 24, true,  'You reported an error and a reviewer accepted the correction'),
  ('revision_published',     4, 16, true,  'A revision you wrote was published by a different reviewer'),
  ('thread_accepted',        3, 15, true,  'A "Pull a Thread" link you sent was accepted for research'),
  ('source_rejected_fabric',-25,  0, false, 'A source or quote was found fabricated (a hard stop)'),
  ('correction_rejected_bad',-2,  0, false, 'Repeated corrections rejected as not backed by a source')
on conflict (kind) do nothing;

create table if not exists public.karma_events (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references public.members(id),
  kind       text not null references public.karma_rules(kind),
  points     int  not null,
  ref_type   text not null check (ref_type in ('research_source','research_version','claim_review','case_report','thread_submission','manual')),
  ref_id     text not null,
  awarded_by uuid references public.members(id),   -- the other member whose sign-off earned it; null for system rows
  created_at timestamptz not null default now(),
  unique (member_id, kind, ref_type, ref_id)       -- one award per piece of work
);
create index if not exists karma_events_member on public.karma_events (member_id, created_at);
drop trigger if exists karma_events_append_only on public.karma_events;
create trigger karma_events_append_only before update or delete on public.karma_events
  for each row execute function private.forbid_change();
drop trigger if exists karma_events_no_truncate on public.karma_events;
create trigger karma_events_no_truncate before truncate on public.karma_events
  for each statement execute function private.forbid_change();
drop trigger if exists karma_events_audit on public.karma_events;
create trigger karma_events_audit after insert on public.karma_events
  for each row execute function private.audit();
alter table public.karma_rules enable row level security;
alter table public.karma_events enable row level security;
revoke all on public.karma_rules, public.karma_events from public, anon, authenticated;
grant select on public.karma_rules to authenticated;
grant select on public.karma_events to authenticated;
drop policy if exists karma_rules_read on public.karma_rules;
create policy karma_rules_read on public.karma_rules for select to authenticated using (true);
drop policy if exists karma_events_read on public.karma_events;
create policy karma_events_read on public.karma_events for select to authenticated
  using (member_id = auth.uid() or private.has_role('moderator'));

-- Only called from other security-definer functions (the review steps), never from the browser.
create or replace function private.award_karma(p_member uuid, p_kind text, p_ref_type text, p_ref_id text, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.karma_rules; today int;
begin
  select * into r from public.karma_rules where kind = p_kind;
  if r.kind is null then raise exception 'Unknown karma kind %', p_kind; end if;
  if p_member is null or p_member = p_by then return; end if;                    -- never for your own sign-off
  if r.needs_other_member and p_by is null then return; end if;
  if r.points > 0 then
    select coalesce(sum(points),0) into today from public.karma_events
     where member_id = p_member and kind = p_kind and created_at > now() - interval '24 hours';
    if today + r.points > r.daily_cap then return; end if;                       -- daily cap per kind
  end if;
  insert into public.karma_events (member_id, kind, points, ref_type, ref_id, awarded_by)
  values (p_member, p_kind, r.points, p_ref_type, p_ref_id, p_by) on conflict do nothing;
end $$;
revoke all on function private.award_karma(uuid, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.my_karma()
returns table (total int, last_30_days int, events int) language sql stable security definer set search_path = '' as $$
  select coalesce(sum(points),0)::int,
         coalesce(sum(points) filter (where created_at > now() - interval '30 days'),0)::int,
         count(*)::int
    from public.karma_events where member_id = auth.uid();
$$;
revoke all on function public.my_karma() from public, anon;
grant execute on function public.my_karma() to authenticated;
