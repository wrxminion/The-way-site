-- RUN THIS
-- The Way 0030, part 1 of 2: Pull a Thread tables, private screenshot bucket, rate limit, matching. Run part 1 first, then part 2. Safe to run again.
-- The Way: "Pull a Thread" intake and review queue (Frank, Oct 28 2026). Needs 0001, 0004 and 0026. Safe to run twice.
-- 0015 (the older one-link form) is left alone; this replaces it for new work.
--
--   * Anyone, signed in or not, sends ONE of: a link (article or social post), a screenshot of a conversation, or a
--     written question. Everything arrives through the pull-thread Edge Function (Turnstile for signed-out people,
--     size and type checks, rate limit key). The browser has no direct access to any table here.
--   * We first look for what we already have: a finding that cites the same link, a case or finding that shares key
--     words. If something turns up the sender is told what, and the item is not queued unless they say "that is not
--     what I asked" (thread_dispute).
--   * Otherwise it goes in a queue. The queue is ranked by OUR score, never first in first out. Every score is a short
--     list of reasons with points, shown to reviewers. A reviewer can pick ANY item, and the pick records whether it
--     was the top one. A reviewer can also move an item up or down with a reason.
--   * The archiver (checker key, local Ollama, the public-addresses-only fetcher) reads each link, tags it, and
--     files a short excerpt for reviewers. The Edge Function never opens a user link.
--   * Who sent it is never shown to anyone, reviewers and admins included. The submitter id and the rate key stay in
--     the table and no function returns them. The sender gets a receipt code to check status.
--   * Candidate scoring stays off: nothing here scores a person or a party.

do $guard$
begin
  if to_regclass('public.research_items') is null or to_regprocedure('private.checker_key_id(text)') is null
     or to_regclass('public.research_projects') is null then
    raise exception 'Stop: run 0001, 0004 and 0026 first';
  end if;
end $guard$;

-- ---------------------------------------------------------------- helpers
create or replace function private.may_triage() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('reviewer') or private.has_role('editor') or private.has_role('admin') or private.has_role('super_admin');
$$;

-- same canonical form as 0015: lowercase scheme and host, no #fragment, no utm_/fbclid/gclid, no trailing slash
create or replace function private.thread_canon(u text) returns text
language plpgsql immutable set search_path = '' as $$
declare c text := btrim(coalesce(u, ''));
begin
  c := regexp_replace(c, '#.*$', '');
  c := regexp_replace(c, '([?&])(utm_[a-z]+|fbclid|gclid)=[^&]*', '\1', 'gi');
  c := regexp_replace(c, '[?&]+$', '');
  c := regexp_replace(c, '/+$', '');
  return lower(substring(c from '^https?://[^/?]+')) || coalesce(substring(c from '^https?://[^/?]+(.*)$'), '');
end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.thread_intakes (
  id             bigint generated always as identity primary key,
  kind           text not null check (kind in ('url','screenshot','question')),
  url            text check (url is null or (url ~* '^https?://[^[:space:]]{4,}$' and char_length(url) <= 1000)),
  canonical_url  text,
  question       text check (question is null or char_length(btrim(question)) between 10 and 1500),
  note           text check (note is null or char_length(btrim(note)) between 3 and 500),
  shot_path      text check (shot_path is null or shot_path ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$'),
  shot_bytes     int check (shot_bytes is null or shot_bytes between 1 and 4194304),
  dup_key        text not null,                       -- canonical link, or a hash of the question words: groups repeats
  submitter_id   uuid references public.members(id),  -- never returned by any function
  rate_key       text not null,                       -- salted hash made by the Edge Function; never returned
  receipt_hash   text not null unique,
  status         text not null default 'queued' check (status in ('matched','queued','in_review','accepted','needs_evidence','duplicate','declined','answered')),
  matches        jsonb not null default '[]'::jsonb, -- what we already have: [{kind, ref, title, path, strength, why}]
  base_parts     jsonb not null default '[]'::jsonb, -- score reasons that do not change: [{key, label, pts}]
  enrich_status  text not null default 'pending' check (enrich_status in ('pending','running','done','failed','skipped')),
  enrich_claimed_at timestamptz,
  enrich_tries   int not null default 0,
  page_title     text check (page_title is null or char_length(page_title) <= 300),
  excerpt        text check (excerpt is null or char_length(excerpt) <= 1200),
  fetch_note     text check (fetch_note is null or char_length(fetch_note) <= 200),
  claimed_by     uuid references public.members(id),
  claimed_at     timestamptz,
  public_note    text check (public_note is null or char_length(public_note) <= 500),
  project_id     bigint references public.research_projects(id),
  dup_of         bigint references public.thread_intakes(id),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  check ((kind = 'url') = (url is not null)),
  check ((kind = 'screenshot') = (shot_path is not null)),
  check (kind <> 'question' or question is not null)
);
comment on table public.thread_intakes is 'Pull a Thread submissions. No direct access from the API. Reviewers read through list_thread_queue(); the sender through thread_status(receipt). submitter_id and rate_key are never returned.';
create index if not exists thread_intakes_open on public.thread_intakes (status, created_at) where status in ('queued','in_review');
create index if not exists thread_intakes_dup on public.thread_intakes (dup_key);
create index if not exists thread_intakes_enrich on public.thread_intakes (enrich_status, id) where enrich_status in ('pending','running');
create index if not exists thread_intakes_rate on public.thread_intakes (rate_key, created_at);
revoke all on public.thread_intakes from public, anon, authenticated;
alter table public.thread_intakes enable row level security;     -- no policies: only the functions below (owner) touch it
drop trigger if exists thread_intakes_audit on public.thread_intakes;
create trigger thread_intakes_audit after insert or update on public.thread_intakes for each row execute function private.audit();

create table if not exists public.thread_intake_events (
  id         bigint generated always as identity primary key,
  intake_id  bigint not null references public.thread_intakes(id),
  event_type text not null check (event_type in ('picked','released','priority','disposition','disputed')),
  was_top    boolean,                                   -- picked: was it the highest-scored open item
  delta      int check (delta is null or delta between -40 and 40),
  disposition text check (disposition is null or disposition in ('accepted','needs_evidence','duplicate','declined','answered')),
  reason     text check (reason is null or char_length(btrim(reason)) between 3 and 1000),
  actor_id   uuid references public.members(id),
  created_at timestamptz not null default now(),
  check (event_type not in ('priority','disposition') or reason is not null),
  check (event_type <> 'priority' or delta is not null),
  check (event_type <> 'disposition' or disposition is not null)
);
comment on table public.thread_intake_events is 'Append-only history of what reviewers did with each item, including every override and priority change, with reasons.';
create index if not exists thread_intake_events_item on public.thread_intake_events (intake_id, id);
revoke all on public.thread_intake_events from public, anon, authenticated;
alter table public.thread_intake_events enable row level security;
drop trigger if exists thread_intake_events_append_only on public.thread_intake_events;
create trigger thread_intake_events_append_only before update or delete on public.thread_intake_events for each row execute function private.forbid_change();
drop trigger if exists thread_intake_events_no_truncate on public.thread_intake_events;
create trigger thread_intake_events_no_truncate before truncate on public.thread_intake_events for each statement execute function private.forbid_change();
drop trigger if exists thread_intake_events_audit on public.thread_intake_events;
create trigger thread_intake_events_audit after insert on public.thread_intake_events for each row execute function private.audit();

-- What we already have besides findings: cases, claims, guides. Filled by the archiver (checker_thread_index_put).
create table if not exists public.thread_match_index (
  kind    text not null check (kind in ('case','claim','guide','finding')),
  ref     text not null check (char_length(ref) between 1 and 200),
  title   text not null check (char_length(title) between 1 and 300),
  blurb   text check (char_length(blurb) <= 1500),
  path    text not null check (path ~ '^/[A-Za-z0-9/_#.?=&%-]{0,250}$'),
  urls    text[] not null default '{}',                 -- canonical links this entry cites
  tsv     tsvector generated always as (to_tsvector('english', title || ' ' || coalesce(blurb, ''))) stored,
  updated_at timestamptz not null default now(),
  primary key (kind, ref)
);
create index if not exists thread_match_index_tsv on public.thread_match_index using gin (tsv);
create index if not exists thread_match_index_urls on public.thread_match_index using gin (urls);
revoke all on public.thread_match_index from public, anon, authenticated;
alter table public.thread_match_index enable row level security;

create table if not exists public.thread_rate_hits (
  id bigint generated always as identity primary key,
  rate_key text not null,
  at timestamptz not null default now()
);
create index if not exists thread_rate_hits_key on public.thread_rate_hits (rate_key, at);
revoke all on public.thread_rate_hits from public, anon, authenticated;
alter table public.thread_rate_hits enable row level security;

-- ---------------------------------------------------------------- storage: private bucket for screenshots
-- Uploads come only from the Edge Function (service role). Reviewers read through signed links. No update, no delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thread-screenshots', 'thread-screenshots', false, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists thread_shots_obj_read on storage.objects;
create policy thread_shots_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'thread-screenshots' and private.may_triage());

-- ---------------------------------------------------------------- rate limit
-- Anyone: 4 an hour, 12 a day per key. Signed in: 10 an hour, 30 a day. Whole site: 150 an hour.
create or replace function private.thread_rate_ok(p_key text, p_member boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h int; d int; g int; hmax int := case when p_member then 10 else 4 end; dmax int := case when p_member then 30 else 12 end;
begin
  perform pg_advisory_xact_lock(hashtext('the_way_thread_rate'), hashtext(p_key));
  delete from public.thread_rate_hits where at < now() - interval '2 days';
  select count(*) filter (where at > now() - interval '1 hour'), count(*) into h, d
    from public.thread_rate_hits where rate_key = p_key and at > now() - interval '1 day';
  select count(*) into g from public.thread_rate_hits where at > now() - interval '1 hour';
  if g >= 150 or h >= hmax or d >= dmax then
    return false;
  end if;
  insert into public.thread_rate_hits (rate_key) values (p_key);
  return true;
end $$;

-- ---------------------------------------------------------------- matching: what do we already have?
-- strength 'source' = a finding or case cites this very link. strength 'words' = shares at least 3 key words and at
-- least 40% of the sender's key words (the "why" says how many). Words matches are offered, never asserted.
create or replace function private.thread_matches(p_canon text, p_text text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; qlex text[]; n int;
begin
  if p_canon is not null then
    out := out || coalesce((
      select jsonb_agg(x) from (
        select distinct on (i.id) jsonb_build_object('kind','finding','ref',i.slug,'title',i.title,'path','/members/findings.html',
                 'strength','source','why','A published finding cites this link') x
          from public.research_sources s
          join public.research_versions v on v.id = s.version_id
          join public.research_items i on i.id = v.item_id
         where private.version_is_public(v.id) and private.thread_canon(s.url) = p_canon
         limit 3) t), '[]'::jsonb);
    out := out || coalesce((
      select jsonb_agg(jsonb_build_object('kind',m.kind,'ref',m.ref,'title',m.title,'path',m.path,'strength','source','why','We already cite this link'))
        from (select * from public.thread_match_index where p_canon = any(urls) limit 3) m), '[]'::jsonb);
  end if;
  select array_agg(l) into qlex from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_text, '')))) l where char_length(l) > 2;
  n := coalesce(cardinality(qlex), 0);
  if n >= 3 then
    out := out || coalesce((
      select jsonb_agg(jsonb_build_object('kind',k,'ref',r,'title',t,'path',pth,'strength','words',
               'why', 'Shares ' || c || ' of ' || n || ' key words'))
        from (
          select * from (
            select 'finding'::text k, i.slug r, i.title t, '/members/findings.html'::text pth,
                   (select count(*) from unnest(tsvector_to_array(to_tsvector('english', i.title || ' ' || i.question || ' ' || v.summary))) w where w = any(qlex)) c
              from public.research_items i join public.research_versions v on v.id = i.published_version_id
             where private.version_is_public(v.id)
            union all
            select m.kind, m.ref, m.title, m.path,
                   (select count(*) from unnest(tsvector_to_array(m.tsv)) w where w = any(qlex))
              from public.thread_match_index m where m.tsv @@ to_tsquery('english', (select string_agg(quote_literal(l), ' | ') from unnest(qlex) l))
          ) z where c >= 3 and c >= 0.4 * n order by c desc limit 3) y), '[]'::jsonb);
  end if;
  return out;
end $$;

