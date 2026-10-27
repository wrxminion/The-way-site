-- The Way: "My Ballot" vote planner (Frank Oct 27 2026). Run in the Supabase SQL editor AFTER 0015.
--
-- Two separate, optional features. The planner itself keeps everything in the visitor's browser and needs nothing here.
--
-- 1) ballot_plans: a signed-in member may save a copy of their plan (one row per state).
--    Only that member can read or change it: not other members, moderators or admins (no role check on purpose,
--    same rule as member_places). Not in the audit chain. Deleting the row deletes the copy for good.
--
-- 2) forecast_shares: anyone (signed in or not) may add their intended votes to a combined, anonymous count.
--    * Stored: state, contest ids and choice ids, and a SHA-256 hash of a random code made in the visitor's browser.
--      The code lets a second share replace the first (no double counting) and lets the visitor take it back.
--    * Not stored: name, email, account id, IP address, ZIP, city, county, address, facts, notes.
--    * No one reads rows from the browser: anon and authenticated have no SELECT. Moderators and admins read
--      only combined totals through forecast_totals(), and only for a state with at least 25 shares, and
--      only cells with at least 5 shares (small counts are hidden so no one can pick out a person).
--    * It is a self-selected sample. Nothing built on it may be presented as a poll or a prediction without that label.
--    * A global per-hour cap blunts scripts; the real rate limit is the Supabase project's own.

-- ---------------------------------------------------------------- 1) member plans
create table if not exists public.ballot_plans (
  member_id  uuid not null references public.members(id) on delete cascade,
  state      text not null check (state in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
               'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
               'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
  plan       jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 300000),
  updated_at timestamptz not null default now(),
  primary key (member_id, state)
);

create or replace function private.ballot_plans_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists ballot_plans_touch on public.ballot_plans;
create trigger ballot_plans_touch before insert or update on public.ballot_plans
  for each row execute function private.ballot_plans_touch();

alter table public.ballot_plans enable row level security;
alter table public.ballot_plans force row level security;
revoke all on public.ballot_plans from public, anon, authenticated;
grant select, insert, update, delete on public.ballot_plans to authenticated;

drop policy if exists ballot_plans_own on public.ballot_plans;
create policy ballot_plans_own on public.ballot_plans for all to authenticated
  using (member_id = auth.uid() and private.is_member())
  with check (member_id = auth.uid() and private.is_member());

-- ---------------------------------------------------------------- 2) anonymous forecasting shares
create table if not exists public.forecast_shares (
  id             bigint generated always as identity primary key,
  election       date not null default date '2026-11-03',
  state          text not null check (state in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
                   'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
                   'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
  submitter_hash text not null check (submitter_hash ~ '^[0-9a-f]{64}$'),
  picks          jsonb not null check (jsonb_typeof(picks) = 'object'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (election, submitter_hash)
);
create index if not exists forecast_shares_state on public.forecast_shares (election, state);
revoke all on public.forecast_shares from public, anon, authenticated;
alter table public.forecast_shares enable row level security;
alter table public.forecast_shares force row level security;

-- Anyone: add or replace one anonymous answer.
create or replace function public.share_intended_votes(p_state text, p_token text, p_picks jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  h   text;
  k   text;
  v   jsonb;
  n   int := 0;
  one jsonb;
begin
  if p_state is null or p_state !~ '^[A-Z]{2}$' then
    raise exception 'Unknown state' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32,64}$' then
    raise exception 'Bad code' using errcode = '22023';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'object' then
    raise exception 'Send your picks as a list' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_picks) loop
    n := n + 1;
    if n > 150 then raise exception 'Too many races' using errcode = '22023'; end if;
    if k !~ '^(race|measure):[a-z0-9-]{1,80}(:[a-z0-9-]{1,80})?$' then
      raise exception 'Unknown race id' using errcode = '22023';
    end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) not between 1 and 12 then
      raise exception 'Bad pick' using errcode = '22023';
    end if;
    for one in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(one) <> 'string' or (one #>> '{}') !~ '^[a-z0-9-]{1,80}$' then
        raise exception 'Bad pick' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if n = 0 then
    raise exception 'Pick at least one race first' using errcode = '22023';
  end if;
  h := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if not exists (select 1 from public.forecast_shares s where s.submitter_hash = h)
     and (select count(*) from public.forecast_shares s where s.created_at > now() - interval '1 hour') >= 500 then
    raise exception 'Too many shares right now. Try again later' using errcode = '54000';
  end if;
  insert into public.forecast_shares (state, submitter_hash, picks)
  values (p_state, h, p_picks)
  on conflict (election, submitter_hash) do update
    set state = excluded.state, picks = excluded.picks, updated_at = now();
end $$;

-- Anyone holding the code: delete their answer.
create or replace function public.withdraw_intended_votes(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32,64}$' then
    raise exception 'Bad code' using errcode = '22023';
  end if;
  delete from public.forecast_shares s where s.submitter_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex');
end $$;

-- Moderators and admins: combined totals for one state. Empty unless at least 25 people in that state shared;
-- a race/choice row is shown only when at least 5 people chose it. Self-selected sample: label it so wherever it is shown.
create or replace function public.forecast_totals(p_state text, p_min_state int default 25, p_min_cell int default 5)
returns table (contest text, choice text, shares int, state_shares int)
language plpgsql stable security definer set search_path = '' as $$
declare total int;
begin
  perform private.require_role('moderator');
  select count(*)::int into total from public.forecast_shares s where s.state = p_state;
  if total < greatest(coalesce(p_min_state, 25), 25) then return; end if;
  return query
    select e.key, c.choice, count(*)::int, total
      from public.forecast_shares s
      cross join lateral jsonb_each(s.picks) e
      cross join lateral jsonb_array_elements_text(e.value) c(choice)
     where s.state = p_state
     group by e.key, c.choice
    having count(*) >= greatest(coalesce(p_min_cell, 5), 5)
     order by e.key, count(*) desc;
end $$;

revoke all on function public.share_intended_votes(text,text,jsonb), public.withdraw_intended_votes(text), public.forecast_totals(text,int,int)
  from public, anon, authenticated;
grant execute on function public.share_intended_votes(text,text,jsonb), public.withdraw_intended_votes(text) to anon, authenticated;
grant execute on function public.forecast_totals(text,int,int) to authenticated;
