-- The Way members setup, part 6 of 7. Run parts in order. Safe to run again.
create table if not exists public.thread_submission_events (
  id            bigint generated always as identity primary key,
  submission_id bigint not null references public.thread_submissions(id),
  disposition   text not null check (disposition in ('accepted','needs_evidence','duplicate','declined')),
  reason        text not null check (char_length(btrim(reason)) between 3 and 1000),
  actor_id      uuid not null references public.members(id),
  created_at    timestamptz not null default now()
);

revoke all on public.thread_submission_events from public, anon, authenticated;

alter table public.thread_submission_events enable row level security;

drop trigger if exists thread_submission_events_append_only on public.thread_submission_events;

create trigger thread_submission_events_append_only before update or delete on public.thread_submission_events
  for each row execute function private.forbid_change();

drop trigger if exists thread_submission_events_audit on public.thread_submission_events;

create trigger thread_submission_events_audit after insert on public.thread_submission_events
  for each row execute function private.audit();

create or replace function public.submit_thread(p_url text, p_why text default null, p_category text default 'other')
returns void language plpgsql security definer set search_path = '' as $$
declare
  u     text := btrim(coalesce(p_url, ''));
  why   text := nullif(btrim(p_why), '');
  canon text;
begin
  if u !~* '^https?://[^[:space:]]{4,}$' or char_length(u) > 1000 then
    raise exception 'Send a full link that starts with http:// or https://' using errcode = '22023';
  end if;
  if why is not null and char_length(why) not between 3 and 1000 then
    raise exception 'Keep the reason between 3 and 1000 characters' using errcode = '22023';
  end if;
  if p_category not in ('finance','ballot','case','other') then
    raise exception 'Unknown topic' using errcode = '22023';
  end if;
  -- canonical form: lowercase scheme and host, drop #fragment and utm_/fbclid/gclid parameters, drop trailing slash
  canon := regexp_replace(u, '#.*$', '');
  canon := regexp_replace(canon, '([?&])(utm_[a-z]+|fbclid|gclid)=[^&]*', '\1', 'gi');
  canon := regexp_replace(canon, '[?&]+$', '');
  canon := regexp_replace(canon, '/+$', '');
  canon := lower(substring(canon from '^https?://[^/?]+')) || coalesce(substring(canon from '^https?://[^/?]+(.*)$'), '');
  if (select count(*) from public.thread_submissions s
       where s.canonical_url = canon and s.created_at > now() - interval '1 day') >= 3 then
    return; -- already received today; say nothing different to the sender
  end if;
  if (select count(*) from public.thread_submissions s where s.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many submissions right now. Try again later' using errcode = '54000';
  end if;
  insert into public.thread_submissions (url, canonical_url, why, category) values (u, canon, why, p_category);
end $$;

create or replace function public.list_thread_submissions(p_max_rows int default 100)
returns table (id bigint, url text, why text, category text, created_at timestamptz, times_sent int, disposition text, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
    select s.id, s.url, s.why, s.category, s.created_at,
           (select count(*)::int from public.thread_submissions d where d.canonical_url = s.canonical_url),
           coalesce((select e.disposition from public.thread_submission_events e where e.submission_id = s.id order by e.id desc limit 1), 'new'),
           (select e.reason from public.thread_submission_events e where e.submission_id = s.id order by e.id desc limit 1)
      from public.thread_submissions s
     order by s.id desc
     limit greatest(1, least(coalesce(p_max_rows, 100), 500));
end $$;

create or replace function public.triage_thread(p_submission_id bigint, p_disposition text, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), ''); new_id bigint;
begin
  perform private.require_role('moderator');
  if not exists (select 1 from public.thread_submissions where id = p_submission_id) then
    raise exception 'Unknown submission' using errcode = '22023';
  end if;
  if p_disposition not in ('accepted','needs_evidence','duplicate','declined') then
    raise exception 'Unknown disposition' using errcode = '22023';
  end if;
  if r is null or char_length(r) not between 3 and 1000 then
    raise exception 'Say why (3 to 1000 characters)' using errcode = '22023';
  end if;
  insert into public.thread_submission_events (submission_id, disposition, reason, actor_id)
  values (p_submission_id, p_disposition, r, auth.uid()) returning id into new_id;
  return new_id;
end $$;

revoke all on function public.submit_thread(text,text,text), public.list_thread_submissions(int), public.triage_thread(bigint,text,text)
  from public, anon, authenticated;

grant execute on function public.submit_thread(text,text,text) to anon, authenticated;

grant execute on function public.list_thread_submissions(int), public.triage_thread(bigint,text,text) to authenticated;
