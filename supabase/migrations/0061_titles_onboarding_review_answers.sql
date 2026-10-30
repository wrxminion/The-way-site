-- RUN THIS
-- 0061: member titles (pick which one shows), first-time onboarding answers, structured read-check answers, early review bonus.
-- Needs 0017 (profiles, karma), 0021 (read checks) and 0024 (rank rules) run first. Safe to run twice. Check rows are at the bottom: all must say ok.
--
--  * Titles: the catalog holds special titles. Rank titles (Author, Deshi, Renshi, Researcher) come from the member's roles.
--    "First Ripple" is one-of-one: only one member can ever hold it. A member picks which earned title shows; the default is the highest rank.
--  * Onboarding: one private row per member (why they joined, what interests them). Never shown to other members. Admins see counts only.
--  * Read-check answers: the extra questions (title accurate, supports or argues, evidence and kind) sit in their own table next to the
--    existing read check, so nothing already stored changes.
--  * Early review bonus: +10 points per accepted read check in a member's first 10 days, at most 10 times per member. Paid ONLY when a
--    different reviewer accepts a check that has the answers filled in. Never counts toward ranks. Admins can list who earned it.

do $$
begin
  if to_regclass('public.member_roles') is null or to_regclass('public.karma_rules') is null
     or to_regclass('public.read_checks') is null or to_regclass('public.read_check_signoffs') is null
     or to_regclass('public.rank_rules') is null then
    raise exception 'Run 0017, 0021 and 0024 first, then run this again.';
  end if;
end $$;

-- ---------------------------------------------------------------- titles
create table if not exists public.member_titles (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9_]{2,40}$'),
  label       text not null check (char_length(label) between 2 and 40 and label !~ '[<>]'),
  description text not null check (char_length(description) between 5 and 200 and description !~ '[<>]'),
  one_of_one  boolean not null default false
);
insert into public.member_titles (slug, label, description, one_of_one) values
  ('first_ripple', 'First Ripple', 'The first person to find The Way on their own.', true)
on conflict (slug) do update set label = excluded.label, description = excluded.description, one_of_one = excluded.one_of_one;

create table if not exists public.member_title_awards (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references public.members(id),
  title_slug text not null references public.member_titles(slug),
  one_of_one boolean not null default false,
  reason     text,
  awarded_by uuid references public.members(id),       -- null = set by the database owner
  created_at timestamptz not null default now(),
  unique (member_id, title_slug)
);
create unique index if not exists member_title_awards_one_only on public.member_title_awards (title_slug) where one_of_one;

create table if not exists public.member_shown_title (
  member_id  uuid primary key references public.members(id) on delete cascade,
  title_slug text,              -- a rank slug (researcher, reviewer, editor, source_checker, member) or an award slug; null = default
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['member_title_awards'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.forbid_change()', t || '_append_only', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert on public.%I for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

alter table public.member_titles enable row level security;
alter table public.member_title_awards enable row level security;
alter table public.member_shown_title enable row level security;
revoke all on public.member_titles, public.member_title_awards, public.member_shown_title from public, anon, authenticated;
grant select on public.member_titles to authenticated;
grant select on public.member_title_awards to authenticated;
drop policy if exists member_titles_read on public.member_titles;
create policy member_titles_read on public.member_titles for select to authenticated using (true);
drop policy if exists member_title_awards_own on public.member_title_awards;
create policy member_title_awards_own on public.member_title_awards for select to authenticated
  using (member_id = auth.uid() or private.has_role('admin'));
-- member_shown_title has no direct grants: only the functions below read or write it.

-- Rank labels in the order they should win by default (highest first).
create or replace function private.rank_titles()
returns table (slug text, label text, description text, sort int) language sql immutable as $$
  values ('editor', 'Renshi', 'Editor. Earned by sustained, accepted work.', 1),
         ('reviewer', 'Deshi', 'Student and reviewer. Checks and publishes work.', 2),
         ('source_checker', 'Researcher', 'Checks sources on items marked needs review.', 3),
         ('researcher', 'Author', 'Submitter. Has had read checks accepted by three different reviewers.', 4),
         ('member', 'Member', 'Every member starts here.', 5)
$$;

-- Titles the signed-in member holds, and which one is shown.
create or replace function public.my_titles()
returns table (slug text, label text, description text, kind text, shown boolean)
language plpgsql stable security definer set search_path = '' as $$
declare picked text; top_slug text;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  select s.title_slug into picked from public.member_shown_title s where s.member_id = auth.uid();
  return query
  with held as (
    select r.slug, r.label, r.description, 'rank'::text as kind, r.sort
      from private.rank_titles() r
     where r.slug = 'member' or exists (select 1 from public.member_roles mr where mr.member_id = auth.uid() and mr.role = r.slug)
    union all
    select t.slug, t.label, t.description, 'award'::text, 0
      from public.member_title_awards a join public.member_titles t on t.slug = a.title_slug
     where a.member_id = auth.uid())
  select h.slug, h.label, h.description, h.kind,
         (h.slug = coalesce((select h2.slug from held h2 where h2.slug = picked),
                            (select h3.slug from held h3 where h3.kind = 'rank' order by h3.sort limit 1)))
    from held h order by (h.kind = 'rank') , h.sort;
end $$;
revoke all on function public.my_titles() from public, anon;
grant execute on function public.my_titles() to authenticated;

create or replace function public.set_shown_title(p_slug text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if p_slug is null then
    delete from public.member_shown_title where member_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.my_titles() t where t.slug = p_slug) then
    raise exception 'You do not hold that title' using errcode = '42501';
  end if;
  insert into public.member_shown_title (member_id, title_slug) values (auth.uid(), p_slug)
  on conflict (member_id) do update set title_slug = excluded.title_slug, updated_at = now();
end $$;
revoke all on function public.set_shown_title(text) from public, anon;
grant execute on function public.set_shown_title(text) to authenticated;

-- The title to print next to any member's name. Members only. Falls back to the highest rank if the pick is no longer held.
create or replace function public.member_title(p_member uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare picked text; out_label text;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  select s.title_slug into picked from public.member_shown_title s where s.member_id = p_member;
  if picked is not null then
    select t.label into out_label from public.member_title_awards a join public.member_titles t on t.slug = a.title_slug
     where a.member_id = p_member and a.title_slug = picked;
    if out_label is null then
      select r.label into out_label from private.rank_titles() r
       where r.slug = picked and (r.slug = 'member' or exists (select 1 from public.member_roles mr where mr.member_id = p_member and mr.role = r.slug));
    end if;
    if out_label is not null then return out_label; end if;
  end if;
  select r.label into out_label from private.rank_titles() r
   where r.slug = 'member' or exists (select 1 from public.member_roles mr where mr.member_id = p_member and mr.role = r.slug)
   order by r.sort limit 1;
  return out_label;
end $$;
revoke all on function public.member_title(uuid) from public, anon;
grant execute on function public.member_title(uuid) to authenticated;

-- Super admin gives a title. A one-of-one title can be given once, ever.
create or replace function public.award_title(p_member uuid, p_slug text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare solo boolean;
begin
  perform private.require_role('super_admin');
  select t.one_of_one into solo from public.member_titles t where t.slug = p_slug;
  if solo is null then raise exception 'Unknown title' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Give a reason' using errcode = '22023'; end if;
  insert into public.member_title_awards (member_id, title_slug, one_of_one, reason, awarded_by)
  values (p_member, p_slug, solo, btrim(p_reason), auth.uid());
exception when unique_violation then
  raise exception 'That title is already given (one-of-one titles go to one member only)' using errcode = '23505';
end $$;
revoke all on function public.award_title(uuid, text, text) from public, anon;
grant execute on function public.award_title(uuid, text, text) to authenticated;

-- One-off: First Ripple goes to CalidDancer (found The Way on their own, Frank Oct 30 2026). Does nothing if not found or already given.
do $$
declare mid uuid; n int;
begin
  select count(*) into n from public.members where lower(display_name) = 'calidancer';
  if n <> 1 then
    raise notice 'First Ripple NOT given: found % members named CalidDancer. Give it with public.award_title or ask Claude.', n;
  elsif exists (select 1 from public.member_title_awards where title_slug = 'first_ripple') then
    raise notice 'First Ripple already given';
  else
    select id into mid from public.members where lower(display_name) = 'calidancer';
    insert into public.member_title_awards (member_id, title_slug, one_of_one, reason)
    values (mid, 'first_ripple', true, 'First person to find The Way on their own (Frank, Oct 30 2026)');
  end if;
end $$;

-- ---------------------------------------------------------------- onboarding
create table if not exists public.member_onboarding (
  member_id    uuid primary key default auth.uid() references public.members(id) on delete cascade,
  reason       text check (reason is null or reason in ('review','community','learn','elections','other')),
  interests    text check (interests is null or (char_length(interests) <= 500 and interests !~ '[<>]')),
  step         text not null default 'start' check (step in ('start','why','interests','tour','done')),
  skipped      boolean not null default false,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.member_onboarding enable row level security;
alter table public.member_onboarding force row level security;
revoke all on public.member_onboarding from public, anon, authenticated;
-- No direct grants and no policies: members use the functions, admins use admin_onboarding_summary.

-- Where is this member in the welcome flow? needs_welcome is true only for people who joined after this shipped and have not finished or skipped.
create or replace function public.my_onboarding()
returns table (reason text, interests text, step text, finished boolean, needs_welcome boolean)
language plpgsql stable security definer set search_path = '' as $$
declare m_joined timestamptz; o public.member_onboarding;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  select joined_at into m_joined from public.members where id = auth.uid();
  select * into o from public.member_onboarding where member_id = auth.uid();
  return query select o.reason, o.interests, coalesce(o.step, 'start'), (o.step = 'done'),
         (o.member_id is null and m_joined >= timestamptz '2026-10-30 00:00:00+00');
end $$;
revoke all on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated;

-- Save progress (every step saves, so closing the tab loses nothing). p_done true = finished or skipped.
create or replace function public.save_onboarding(p_reason text, p_interests text, p_step text, p_skipped boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare txt text := nullif(btrim(coalesce(p_interests, '')), '');
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if p_step not in ('start','why','interests','tour','done') then raise exception 'Bad step' using errcode = '22023'; end if;
  if p_reason is not null and p_reason not in ('review','community','learn','elections','other') then raise exception 'Bad answer' using errcode = '22023'; end if;
  if txt is not null and (char_length(txt) > 500 or txt ~ '[<>]') then raise exception 'Keep it to 500 characters, no < or >' using errcode = '22023'; end if;
  insert into public.member_onboarding (member_id, reason, interests, step, skipped, finished_at)
  values (auth.uid(), p_reason, txt, p_step, coalesce(p_skipped, false), case when p_step = 'done' then now() end)
  on conflict (member_id) do update set
    reason = coalesce(excluded.reason, public.member_onboarding.reason),
    interests = coalesce(excluded.interests, public.member_onboarding.interests),
    step = excluded.step,
    skipped = public.member_onboarding.skipped or excluded.skipped,
    finished_at = case when excluded.step = 'done' then coalesce(public.member_onboarding.finished_at, now()) else public.member_onboarding.finished_at end,
    updated_at = now();
end $$;
revoke all on function public.save_onboarding(text, text, text, boolean) from public, anon;
grant execute on function public.save_onboarding(text, text, text, boolean) to authenticated;

-- Admins: counts only, never who said what.
create or replace function public.admin_onboarding_summary()
returns table (reason text, members bigint, skipped bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return query select coalesce(o.reason, '(no answer)'), count(*), count(*) filter (where o.skipped)
    from public.member_onboarding o group by 1 order by 2 desc;
end $$;
revoke all on function public.admin_onboarding_summary() from public, anon;
grant execute on function public.admin_onboarding_summary() to authenticated;

-- ---------------------------------------------------------------- read-check answers
create table if not exists public.read_check_answers (
  check_id       bigint primary key references public.read_checks(id),
  title_accurate text not null check (title_accurate in ('yes','mostly','no','unsure')),
  stance         text not null check (stance in ('supports','argues_against','mixed','no_claim','unsure')),
  evidence_given text not null check (evidence_given in ('yes','some','no')),
  evidence_kinds text[] not null default '{}'
    check (evidence_kinds <@ array['named_source','document','data','court_record','video_photo','expert','official_statement','anonymous','none_seen']
           and cardinality(evidence_kinds) <= 9),
  liked          text not null check (char_length(btrim(liked)) between 10 and 450 and liked !~ '[<>]'),
  disliked       text not null check (char_length(btrim(disliked)) between 2 and 450 and disliked !~ '[<>]'),
  created_at     timestamptz not null default now(),
  check (evidence_given <> 'no' or evidence_kinds <@ array['none_seen'])
);
drop trigger if exists read_check_answers_append_only on public.read_check_answers;
create trigger read_check_answers_append_only before update or delete on public.read_check_answers
  for each row execute function private.forbid_change();
drop trigger if exists read_check_answers_no_truncate on public.read_check_answers;
create trigger read_check_answers_no_truncate before truncate on public.read_check_answers
  for each statement execute function private.forbid_change();
alter table public.read_check_answers enable row level security;
revoke all on public.read_check_answers from public, anon, authenticated;
grant select on public.read_check_answers to authenticated;
drop policy if exists read_check_answers_read on public.read_check_answers;
create policy read_check_answers_read on public.read_check_answers for select to authenticated
  using (exists (select 1 from public.read_checks r where r.id = check_id and r.member_id = auth.uid())
         or private.has_role('moderator') or private.has_role('reviewer'));

-- Same rules as submit_read_check (one per article, 10 a day, own screenshot folder), plus the answers. Both rows go in or neither does.
create or replace function public.submit_read_check_v2(
  p_item text, p_liked text, p_disliked text, p_title_accurate text, p_stance text,
  p_evidence_given text, p_evidence_kinds text[], p_path text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare cid bigint; liked text := btrim(coalesce(p_liked,'')); dis text := btrim(coalesce(p_disliked,''));
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if char_length(liked) < 10 then raise exception 'Say a little more about what you liked (at least 10 characters)' using errcode = '22023'; end if;
  if char_length(dis) < 2 then raise exception 'Say what you did not like, or write "nothing"' using errcode = '22023'; end if;
  if char_length(liked) > 450 or char_length(dis) > 450 then raise exception 'At most 450 characters in each box' using errcode = '22023'; end if;
  cid := public.submit_read_check(p_item, 'Liked: ' || liked || E'\nDid not like: ' || dis, p_path);
  insert into public.read_check_answers (check_id, title_accurate, stance, evidence_given, evidence_kinds, liked, disliked)
  values (cid, p_title_accurate, p_stance, p_evidence_given, coalesce(p_evidence_kinds, '{}'), liked, dis);
  return cid;
end $$;
revoke all on function public.submit_read_check_v2(text, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.submit_read_check_v2(text, text, text, text, text, text, text[], text) to authenticated;

-- Reviewers and moderators: the answers for the checks on their screen, and whether it is one of the member's first three
-- reviews (so the reviewer can be kind and say what to improve). first_review_no is 1, 2 or 3 for those, else null.
create or replace function public.read_check_answers_for(p_ids bigint[])
returns table (check_id bigint, title_accurate text, stance text, evidence_given text, evidence_kinds text[], first_review_no int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_role('reviewer') or private.has_role('moderator')) then raise exception 'Reviewers only' using errcode = '42501'; end if;
  return query
    select r.id, a.title_accurate, a.stance, a.evidence_given, a.evidence_kinds,
           (select case when n <= 3 then n end from (select count(*)::int as n from public.read_checks x
              where x.member_id = r.member_id and x.id <= r.id) c)
      from public.read_checks r left join public.read_check_answers a on a.check_id = r.id
     where r.id = any(p_ids);
end $$;
revoke all on function public.read_check_answers_for(bigint[]) from public, anon;
grant execute on function public.read_check_answers_for(bigint[]) to authenticated;

-- ---------------------------------------------------------------- early review bonus
insert into public.karma_rules (kind, points, daily_cap, needs_other_member, note) values
  ('early_review_bonus', 10, 100, true, 'Welcome bonus: a read check with answers, made in your first 10 days, accepted by a different reviewer (up to 10 times)')
on conflict (kind) do update set points = excluded.points, daily_cap = excluded.daily_cap, needs_other_member = excluded.needs_other_member, note = excluded.note;
update public.karma_rules set pair_limit_30d = 10 where kind = 'early_review_bonus'
  and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'karma_rules' and column_name = 'pair_limit_30d');

create or replace function private.early_review_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rc public.read_checks; joined timestamptz; paid int;
begin
  if new.decision <> 'accepted' then return new; end if;
  select * into rc from public.read_checks where id = new.check_id;
  if rc.id is null or not exists (select 1 from public.read_check_answers where check_id = rc.id) then return new; end if;  -- answers required
  select joined_at into joined from public.members where id = rc.member_id;
  if joined is null or rc.created_at > joined + interval '10 days' then return new; end if;                                   -- first 10 days only
  select count(*) into paid from public.karma_events where member_id = rc.member_id and kind = 'early_review_bonus';
  if paid >= 10 then return new; end if;                                                                                      -- 10 reviews total
  perform private.award_karma(rc.member_id, 'early_review_bonus', 'read_check', rc.id::text, new.reviewer_id);                -- never self, never without a signer
  return new;
end $$;
revoke all on function private.early_review_bonus() from public, anon, authenticated;
drop trigger if exists read_check_signoffs_early_bonus on public.read_check_signoffs;
create trigger read_check_signoffs_early_bonus after insert on public.read_check_signoffs
  for each row execute function private.early_review_bonus();

-- Admins: who earned the bonus, how many, and from how many different reviewers (few reviewers for many checks = look closer).
create or replace function public.admin_early_bonus_watch()
returns table (member_name text, joined_at timestamptz, bonus_count bigint, different_reviewers bigint, first_bonus timestamptz, last_bonus timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return query select m.display_name, m.joined_at, count(*), count(distinct k.awarded_by), min(k.created_at), max(k.created_at)
    from public.karma_events k join public.members m on m.id = k.member_id
   where k.kind = 'early_review_bonus' group by m.id, m.display_name, m.joined_at order by count(*) desc, max(k.created_at) desc;
end $$;
revoke all on function public.admin_early_bonus_watch() from public, anon;
grant execute on function public.admin_early_bonus_watch() to authenticated;

-- ---------------------------------------------------------------- check: all rows must say ok
select 'titles tables' as item, case when to_regclass('public.member_titles') is not null and to_regclass('public.member_title_awards') is not null then 'ok' else 'FAIL' end as result
union all select 'First Ripple exists and is one-of-one', case when exists (select 1 from public.member_titles where slug = 'first_ripple' and one_of_one) then 'ok' else 'FAIL' end
union all select 'First Ripple given to exactly one member (FAIL = read the notice above)', case when (select count(*) from public.member_title_awards where title_slug = 'first_ripple') = 1 then 'ok' else 'FAIL' end
union all select 'onboarding table has no member access', case when not has_table_privilege('authenticated', 'public.member_onboarding', 'select') then 'ok' else 'FAIL' end
union all select 'answers table', case when to_regclass('public.read_check_answers') is not null then 'ok' else 'FAIL' end
union all select 'bonus rule is 10 points', case when exists (select 1 from public.karma_rules where kind = 'early_review_bonus' and points = 10) then 'ok' else 'FAIL' end
union all select 'bonus trigger installed', case when exists (select 1 from pg_trigger where tgname = 'read_check_signoffs_early_bonus') then 'ok' else 'FAIL' end;
