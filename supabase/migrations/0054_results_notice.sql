-- The Way: election results email notice, signup storage only (Oct 30 2026).
-- Run in the Supabase SQL editor AFTER 0022 (the email updates list). Safe to run twice.
--
-- NOTHING IS SENT by this file. It stores what each person wants to hear about. Sending is a later step
-- (see tools/results/README.md, "Email notice"). People join through the existing double opt-in, so a
-- preference is saved but not used until the person clicks the confirmation link in their email.
--
-- Privacy: only a state, a county name and a district number are stored. Never a street address.
-- The browser can never read this table. Anon has no SELECT. Admins can read it.

begin;

create table if not exists public.results_notice_prefs (
  subscriber_id   uuid primary key references public.email_subscribers(id) on delete cascade,
  own_state       text check (own_state ~ '^[a-z]{2}$'),
  own_county      text check (own_county ~ '^[a-z0-9-]{1,60}$'),
  own_district    text check (own_district ~ '^([0-9]{1,2}|at-large)$'),
  own_measures    boolean not null default true,    -- the person's own state's ballot measures
  own_races       boolean not null default true,    -- the person's own state and district races
  all_house       boolean not null default false,   -- every U.S. House race
  all_senate      boolean not null default false,   -- every U.S. Senate race
  extra_states    text[]  not null default '{}',    -- two-letter codes, at most 51
  extra_cities    text[]  not null default '{}',    -- slugs like denver-co, at most 10
  timing          text    not null default 'each_call' check (timing in ('each_call','daily_wrap','final_only')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rn_extra_states_ok check (cardinality(extra_states) <= 51),
  constraint rn_extra_cities_ok check (cardinality(extra_cities) <= 10 and array_to_string(extra_cities, ',') ~ '^([a-z0-9-]{1,60}(,|$))*$')
);
comment on table public.results_notice_prefs is 'What each email-list person wants election-result notices about. Storage only; nothing is sent from here.';

-- one row per notice sent, so a result is never mailed twice to the same person (used by the later sender)
create table if not exists public.results_notice_log (
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  contest_id    text not null,
  kind          text not null check (kind in ('called','daily_wrap','final')),
  sent_at       timestamptz not null default now(),
  primary key (subscriber_id, contest_id, kind)
);

alter table public.results_notice_prefs enable row level security;
alter table public.results_notice_log   enable row level security;
revoke all on public.results_notice_prefs, public.results_notice_log from anon, authenticated;
grant select on public.results_notice_prefs, public.results_notice_log to authenticated;

drop policy if exists results_prefs_admin on public.results_notice_prefs;
create policy results_prefs_admin on public.results_notice_prefs for select to authenticated using (private.has_role('admin'));
drop policy if exists results_log_admin on public.results_notice_log;
create policy results_log_admin on public.results_notice_log for select to authenticated using (private.has_role('admin'));

-- ---------------------------------------------------------------- validation of the prefs json
create or replace function private.results_state_codes() returns text[] language sql immutable as $$ select array[
    'al','ak','az','ar','ca','co','ct','de','dc','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn',
    'ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy']::text[] $$;

create or replace function private.results_prefs_clean(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  st text[]; ci text[]; ts text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then p := '{}'::jsonb; end if;
  select coalesce(array_agg(distinct lower(btrim(v))), '{}') into st
    from jsonb_array_elements_text(case when jsonb_typeof(p->'extra_states') = 'array' then p->'extra_states' else '[]'::jsonb end) v
    where lower(btrim(v)) = any(private.results_state_codes());
  select coalesce(array_agg(distinct lower(btrim(v))), '{}') into ci
    from jsonb_array_elements_text(case when jsonb_typeof(p->'extra_cities') = 'array' then p->'extra_cities' else '[]'::jsonb end) v
    where lower(btrim(v)) ~ '^[a-z0-9-]{1,60}$';
  ts := coalesce(p->>'timing', 'each_call');
  if ts not in ('each_call','daily_wrap','final_only') then ts := 'each_call'; end if;
  return jsonb_build_object(
    'own_state',    (select x from (select lower(btrim(coalesce(p->>'own_state', ''))) x) q where x = any(private.results_state_codes())),
    'own_county',   (select x from (select lower(btrim(coalesce(p->>'own_county', ''))) x) q where x ~ '^[a-z0-9-]{1,60}$'),
    'own_district', (select x from (select lower(btrim(coalesce(p->>'own_district', ''))) x) q where x ~ '^([0-9]{1,2}|at-large)$'),
    'own_measures', coalesce((p->>'own_measures')::boolean, true),
    'own_races',    coalesce((p->>'own_races')::boolean, true),
    'all_house',    coalesce((p->>'all_house')::boolean, false),
    'all_senate',   coalesce((p->>'all_senate')::boolean, false),
    'extra_states', to_jsonb((select coalesce(array_agg(x), '{}') from (select x from unnest(st) x limit 51) q)),
    'extra_cities', to_jsonb((select coalesce(array_agg(x), '{}') from (select x from unnest(ci) x limit 10) q)),
    'timing', ts);
end $$;

create or replace function private.results_prefs_save(p_sub uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c jsonb := private.results_prefs_clean(p);
begin
  insert into public.results_notice_prefs as r (subscriber_id, own_state, own_county, own_district, own_measures, own_races,
      all_house, all_senate, extra_states, extra_cities, timing)
  values (p_sub, c->>'own_state', c->>'own_county', c->>'own_district', (c->>'own_measures')::boolean, (c->>'own_races')::boolean,
      (c->>'all_house')::boolean, (c->>'all_senate')::boolean,
      array(select jsonb_array_elements_text(c->'extra_states')), array(select jsonb_array_elements_text(c->'extra_cities')), c->>'timing')
  on conflict (subscriber_id) do update set
      own_state = excluded.own_state, own_county = excluded.own_county, own_district = excluded.own_district,
      own_measures = excluded.own_measures, own_races = excluded.own_races, all_house = excluded.all_house,
      all_senate = excluded.all_senate, extra_states = excluded.extra_states, extra_cities = excluded.extra_cities,
      timing = excluded.timing, updated_at = now();
end $$;

-- ---------------------------------------------------------------- public: join (uses the double opt-in from 0022)
-- Always answers the same way, so nobody can learn whether an address is already on the list.
create or replace function public.results_notice_join(p_email text, p_prefs jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  perform public.email_subscribe(p_email, 'results', '{}', 'instant');
  -- A confirmed person's choices change only through their own link (results_notice_set), never by someone
  -- else typing their address here.
  select id into sid from public.email_subscribers where email = private.email_clean(p_email) and status <> 'unsubscribed'
    and (status <> 'confirmed' or not exists (select 1 from public.results_notice_prefs r where r.subscriber_id = id));
  if sid is not null then perform private.results_prefs_save(sid, p_prefs); end if;
end $$;

-- ---------------------------------------------------------------- public: read and change with the person's own link token
create or replace function public.results_notice_get(p_unsub_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select to_jsonb(r) - 'subscriber_id' - 'created_at' - 'updated_at'
    from public.results_notice_prefs r join public.email_subscribers s on s.id = r.subscriber_id
    where s.unsub_token = p_unsub_token and s.status <> 'unsubscribed'), '{}'::jsonb);
$$;

create or replace function public.results_notice_set(p_unsub_token text, p_prefs jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from public.email_subscribers where unsub_token = p_unsub_token and status <> 'unsubscribed';
  if sid is null then return false; end if;
  perform private.results_prefs_save(sid, p_prefs);
  return true;
end $$;

-- stop only the results notices (leaves the rest of the email list alone)
create or replace function public.results_notice_stop(p_unsub_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from public.email_subscribers where unsub_token = p_unsub_token;
  if sid is null then return false; end if;
  delete from public.results_notice_prefs where subscriber_id = sid;
  return true;
end $$;

revoke all on function private.results_state_codes(), private.results_prefs_clean(jsonb), private.results_prefs_save(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.results_notice_join(text, jsonb), public.results_notice_get(text),
  public.results_notice_set(text, jsonb), public.results_notice_stop(text) from public;
grant execute on function public.results_notice_join(text, jsonb), public.results_notice_get(text),
  public.results_notice_set(text, jsonb), public.results_notice_stop(text) to anon, authenticated;

commit;
