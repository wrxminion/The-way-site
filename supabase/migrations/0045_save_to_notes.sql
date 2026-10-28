-- 0045: "Save to notes" on Pull a Thread. Needs 0025 (private_research), 0039 (web leads), 0043.
-- A saved result is an ordinary private note (owner-only RLS, unchanged) with a few extra fields: where it came from, its source
-- links, whether anyone has checked it, and an optional place on the member's My Ballot with a print choice.
-- A member who checks a source can send just that check (link, verdict, reason; no name, no note) to the reviewers.

alter table public.private_research add column if not exists origin text check (origin in ('ai_answer','site_match','web_lead','reviewed','manual'));
alter table public.private_research add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.private_research add column if not exists verified boolean not null default false;
alter table public.private_research add column if not exists ballot_state text check (ballot_state ~ '^[A-Z]{2}$');
alter table public.private_research add column if not exists ballot_key text check (ballot_key ~ '^(race|measure):[a-z0-9-]{1,80}(:[a-z0-9-]{1,80})?$');
alter table public.private_research add column if not exists print_mode text not null default 'headline' check (print_mode in ('headline','full'));
comment on column public.private_research.verified is 'True only when the member checked every source themselves (or the result was already reviewed). Set by the owner; it is the member''s own flag.';

-- sources is a list of up to 12 {url, title, checked}; urls are https only
create or replace function private.private_research_sources_ok() returns trigger
language plpgsql set search_path = '' as $$
declare s jsonb;
begin
  if jsonb_typeof(new.sources) <> 'array' or jsonb_array_length(new.sources) > 12 then raise exception 'sources must be a list of at most 12' using errcode = '22023'; end if;
  for s in select * from jsonb_array_elements(new.sources) loop
    if jsonb_typeof(s) <> 'object' or coalesce(s->>'url', '') !~ '^https://[^/\s]+\.[^/\s]+' or char_length(s->>'url') > 1000
       or char_length(coalesce(s->>'title', '')) > 200 or (s ? 'checked' and jsonb_typeof(s->'checked') <> 'boolean') then
      raise exception 'each source needs an https link' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists private_research_sources_ok on public.private_research;
create trigger private_research_sources_ok before insert or update on public.private_research
  for each row execute function private.private_research_sources_ok();

-- ---------------------------------------------------------------- member source checks (feed the review queue)
create table if not exists public.source_checks (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references public.members(id),
  url        text not null check (url ~ '^https://[^/\s]+\.[^/\s]+' and char_length(url) <= 1000),
  title      text not null default '' check (char_length(title) <= 200),
  verdict    text not null check (verdict in ('confirmed','not_confirmed')),
  reason     text not null check (char_length(btrim(reason)) between 5 and 300),
  created_at timestamptz not null default now(),
  unique (member_id, url)
);
comment on table public.source_checks is 'A member says they read a source and whether it backs the claim. Carries no note text. Reviewers see link, verdict and reason, never who.';
revoke all on public.source_checks from public, anon, authenticated;
alter table public.source_checks enable row level security;
drop trigger if exists source_checks_append_only on public.source_checks;
create trigger source_checks_append_only before update or delete on public.source_checks for each row execute function private.forbid_change();
drop trigger if exists source_checks_no_truncate on public.source_checks;
create trigger source_checks_no_truncate before truncate on public.source_checks for each statement execute function private.forbid_change();
drop trigger if exists source_checks_audit on public.source_checks;
create trigger source_checks_audit after insert on public.source_checks for each row execute function private.audit();

create or replace function public.submit_source_check(p_url text, p_title text, p_verdict text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Sign in first' using errcode = '42501'; end if;
  if r is null or char_length(r) not between 5 and 300 then raise exception 'Say what you checked (5 to 300 characters)' using errcode = '22023'; end if;
  if p_verdict not in ('confirmed','not_confirmed') then raise exception 'Choose confirmed or not confirmed' using errcode = '22023'; end if;
  if (select count(*) from public.source_checks where member_id = auth.uid() and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That is enough checks for today. Try again tomorrow.' using errcode = '54000';
  end if;
  insert into public.source_checks (member_id, url, title, verdict, reason)
    values (auth.uid(), btrim(p_url), left(coalesce(p_title, ''), 200), p_verdict, r)
    on conflict (member_id, url) do nothing;
end $$;

-- the reviewers' list: newest first, no member identity
create or replace function public.source_checks_for_review(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(t.j order by t.created_at desc) from (
    select jsonb_build_object('url', url, 'title', title, 'verdict', verdict, 'reason', reason, 'created_at', created_at,
      'members_confirmed', (select count(*) from public.source_checks c2 where c2.url = c.url and c2.verdict = 'confirmed'),
      'members_not_confirmed', (select count(*) from public.source_checks c2 where c2.url = c.url and c2.verdict = 'not_confirmed')) as j, created_at
    from public.source_checks c order by created_at desc limit greatest(1, least(coalesce(p_limit, 100), 300))) t), '[]'::jsonb);
end $$;

revoke all on function private.private_research_sources_ok(), public.submit_source_check(text,text,text,text), public.source_checks_for_review(int) from public, anon, authenticated;
grant execute on function public.submit_source_check(text,text,text,text), public.source_checks_for_review(int) to authenticated;

-- Check: every row must say ok.
select 'private_research has the new columns' as check_name,
       case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'private_research'
                  and column_name in ('origin','sources','verified','ballot_state','ballot_key','print_mode')) = 6 then 'ok' else 'MISSING' end as result
union all
select 'source_checks is closed to direct access',
       case when not has_table_privilege('authenticated', 'public.source_checks', 'select') and not has_table_privilege('anon', 'public.source_checks', 'select') then 'ok' else 'OPEN' end
union all
select 'check functions exist',
       case when to_regprocedure('public.submit_source_check(text,text,text,text)') is not null and to_regprocedure('public.source_checks_for_review(integer)') is not null then 'ok' else 'MISSING' end;
