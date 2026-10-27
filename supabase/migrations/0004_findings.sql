-- The Way: Findings. The research desk becomes claim -> evidence -> the other side ->
-- verdict -> AI fact-check on Frak -> human review -> public Findings and Record History.
-- Run once in the Supabase SQL editor, after 0003_lock_display_names.sql.
--
-- Frak (Frank's local AI box) never gets a database password or the service-role key.
-- It holds one "checker key" (FRAK-…, shown once to an admin, stored here only as a
-- SHA-256 hash). With it, Frak can do exactly two things through the public API: take
-- the next queued fact-check, and hand back its result. Nothing else.

begin;

-- ---------------------------------------------------------------------------
-- 1. Finding fields on each version (versions stay append-only)
-- ---------------------------------------------------------------------------
alter table public.research_versions
  add column claim            text check (claim is null or char_length(btrim(claim)) between 10 and 300),
  add column verdict          text check (verdict is null or verdict in ('supported','mixed','not_supported','too_early')),
  add column counterargument  text check (counterargument is null or char_length(btrim(counterargument)) between 20 and 20000),
  add column counter_response text check (counter_response is null or char_length(btrim(counter_response)) between 10 and 20000);
comment on column public.research_versions.claim is 'One checkable sentence about a policy and its outcome. Never about a candidate or party.';
comment on column public.research_versions.counterargument is 'The strongest case against the claim, stated fairly.';
comment on column public.research_versions.counter_response is 'Why the claim still holds, or where it does not.';

grant insert (claim, verdict, counterargument, counter_response) on public.research_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. AI pre-checks (Frak), submissions and send-backs
-- ---------------------------------------------------------------------------
create table public.research_prechecks (
  id            bigint generated always as identity primary key,
  version_id    bigint not null references public.research_versions(id),
  requested_by  uuid not null references public.members(id),
  status        text not null default 'queued' check (status in ('queued','running','done','failed')),
  outcome       text check (outcome in ('clear','flagged')),
  findings      jsonb not null default '[]'::jsonb
                check (jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) <= 12),
  summary       text check (char_length(summary) <= 1000),
  model         text check (char_length(model) <= 100),
  error         text check (char_length(error) <= 500),
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  completed_at  timestamptz
);
comment on table public.research_prechecks is 'AI fact-checks run on Frak before a finding goes to human review. Advice only: a person always decides.';
create index research_prechecks_queue on public.research_prechecks (status, id);
create index research_prechecks_version on public.research_prechecks (version_id, id);

create table public.research_submissions (
  id            bigint generated always as identity primary key,
  version_id    bigint not null unique references public.research_versions(id),
  submitted_by  uuid not null references public.members(id),
  precheck_id   bigint references public.research_prechecks(id),
  check_state   text not null check (check_state in ('clear','flagged_confirmed','unchecked')),
  created_at    timestamptz not null default now()
);
comment on table public.research_submissions is 'Append-only. A version sent for human review, and what the AI check said at that moment.';

create table public.research_returns (
  id           bigint generated always as identity primary key,
  version_id   bigint not null unique references public.research_versions(id),
  reviewer_id  uuid not null references public.members(id),
  note         text not null check (char_length(btrim(note)) between 3 and 4000),
  created_at   timestamptz not null default now()
);
comment on table public.research_returns is 'Append-only. A reviewer sent a version back to its author with notes; the fix is a new version.';

create table private.checker_keys (
  id            bigint generated always as identity primary key,
  key_hash      text not null unique,
  label         text not null check (char_length(label) between 1 and 80),
  created_by    uuid not null references public.members(id),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references public.members(id)
);
revoke all on private.checker_keys from public, anon, authenticated;
alter table private.checker_keys enable row level security;  -- no policies: only the owner-run functions below touch it

do $$
declare t text;
begin
  foreach t in array array['research_submissions','research_returns'] loop
    execute format('create trigger %I before update or delete on public.%I
                    for each row execute function private.forbid_change()', t || '_append_only', t);
    execute format('create trigger %I before truncate on public.%I
                    for each statement execute function private.forbid_change()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['research_prechecks','research_submissions','research_returns'] loop
    execute format('create trigger %I after insert or update on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- No direct writes from the API; everything goes through the functions below.
revoke all on public.research_prechecks, public.research_submissions, public.research_returns from anon, authenticated;
grant select on public.research_prechecks, public.research_returns to authenticated;
grant select on public.research_submissions to anon, authenticated;

alter table public.research_prechecks   enable row level security;
alter table public.research_submissions enable row level security;
alter table public.research_returns     enable row level security;

create policy prechecks_read on public.research_prechecks for select to authenticated
  using (private.has_role('researcher') or private.has_role('reviewer'));
create policy submissions_read on public.research_submissions for select to anon, authenticated
  using (private.version_is_public(version_id) or private.has_role('researcher') or private.has_role('reviewer'));
create policy returns_read on public.research_returns for select to authenticated
  using (private.has_role('researcher') or private.has_role('reviewer'));

-- Sources also freeze once a version is sent for review, so what the reviewer checks is what gets published.
create or replace function private.before_research_source_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.research_publication_events e where e.version_id = new.version_id) then
    raise exception 'This version has already been reviewed; add sources to a new version' using errcode = '42501';
  end if;
  if exists (select 1 from public.research_submissions s where s.version_id = new.version_id) then
    raise exception 'This version has already been sent for review; add sources to a new version' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Author: ask Frak to check, then send for review
-- ---------------------------------------------------------------------------
create or replace function private.own_open_version(p_version bigint) returns public.research_versions
language plpgsql stable security definer set search_path = '' as $$
declare v public.research_versions;
begin
  perform private.require_role('researcher');
  select * into v from public.research_versions rv where rv.id = p_version;
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  if v.author_id is distinct from auth.uid() then
    raise exception 'Only the author of a version can do that' using errcode = '42501';
  end if;
  if exists (select 1 from public.research_submissions s where s.version_id = v.id) then
    raise exception 'This version has already been sent for review' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function public.request_precheck(version_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v public.research_versions; pid bigint;
begin
  v := private.own_open_version(request_precheck.version_id);
  select p.id into pid from public.research_prechecks p
   where p.version_id = v.id and p.status in ('queued','running') order by p.id desc limit 1;
  if pid is not null then return pid; end if;
  if (select count(*) from public.research_prechecks p
       where p.requested_by = auth.uid() and p.created_at > now() - interval '1 day') >= 40 then
    raise exception 'That is a lot of fact-checks today; try again tomorrow' using errcode = '54000';
  end if;
  insert into public.research_prechecks (version_id, requested_by) values (v.id, auth.uid()) returning id into pid;
  return pid;
end $$;

-- confirm: null when the check came back clear; 'flagged' after the author saw the
-- flags and chose to send it anyway; 'unchecked' when Frak could not run the check.
create or replace function public.submit_for_review(version_id bigint, confirm text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.research_versions;
  p public.research_prechecks;
  last_source timestamptz;
  st text;
begin
  v := private.own_open_version(submit_for_review.version_id);
  if v.claim is null or v.verdict is null or v.counterargument is null or v.counter_response is null then
    raise exception 'A finding needs a claim, a verdict, the strongest counterargument and your answer to it'
      using errcode = '23514';
  end if;
  if (select count(*) from public.research_sources s where s.version_id = v.id) < 2 then
    raise exception 'A finding needs at least two sources before review' using errcode = '23514';
  end if;
  if exists (select 1 from public.research_returns r where r.version_id = v.id) then
    raise exception 'This version was sent back; write a new version with the fixes' using errcode = '42501';
  end if;

  select max(s.created_at) into last_source from public.research_sources s where s.version_id = v.id;
  select * into p from public.research_prechecks pc
   where pc.version_id = v.id and pc.status = 'done' and pc.created_at >= last_source
   order by pc.id desc limit 1;

  if p.id is not null and p.outcome = 'clear' then
    st := 'clear';
  elsif p.id is not null and p.outcome = 'flagged' then
    if confirm is distinct from 'flagged' then
      raise exception 'The fact-check flagged this version; confirm to send it anyway' using errcode = '23514';
    end if;
    st := 'flagged_confirmed';
  else
    if confirm is distinct from 'unchecked' then
      raise exception 'This version has not been fact-checked yet' using errcode = '23514';
    end if;
    st := 'unchecked';
  end if;

  insert into public.research_submissions (version_id, submitted_by, precheck_id, check_state)
  values (v.id, auth.uid(), p.id, st);
  return st;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Reviewer: send back, or publish (now only what was submitted)
-- ---------------------------------------------------------------------------
create or replace function public.return_for_changes(version_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.research_versions;
begin
  perform private.require_role('reviewer');
  select * into v from public.research_versions rv where rv.id = return_for_changes.version_id;
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  if v.author_id = auth.uid() then
    raise exception 'A version must be reviewed by someone other than its author' using errcode = '42501';
  end if;
  if not exists (select 1 from public.research_submissions s where s.version_id = v.id) then
    raise exception 'This version has not been sent for review' using errcode = '42501';
  end if;
  if exists (select 1 from public.research_publication_events e where e.version_id = v.id) then
    raise exception 'This version has already been reviewed' using errcode = '42501';
  end if;
  insert into public.research_returns (version_id, reviewer_id, note) values (v.id, auth.uid(), btrim(note));
end $$;

create or replace function public.review_research_version(version_id bigint, event_type text, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.research_versions;
begin
  perform private.require_role('reviewer');
  select * into v from public.research_versions rv where rv.id = version_id;
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  if v.author_id = auth.uid() then
    raise exception 'A version must be reviewed by someone other than its author' using errcode = '42501';
  end if;
  if event_type not in ('published','corrected','retracted') then
    raise exception 'Unknown event type %', event_type using errcode = '22023';
  end if;
  if event_type in ('published','corrected') then
    if not exists (select 1 from public.research_sources s where s.version_id = v.id) then
      raise exception 'A version needs at least one source before it can be published' using errcode = '23514';
    end if;
    if not exists (select 1 from public.research_submissions s where s.version_id = v.id) then
      raise exception 'Only a version its author has sent for review can be published' using errcode = '42501';
    end if;
    if exists (select 1 from public.research_returns r where r.version_id = v.id) then
      raise exception 'This version was sent back to its author' using errcode = '42501';
    end if;
    if exists (select 1 from public.research_publication_events e where e.version_id = v.id) then
      raise exception 'This version has already been reviewed' using errcode = '42501';
    end if;
  end if;
  insert into public.research_publication_events (item_id, version_id, event_type, reason, reviewer_id)
  values (v.item_id, v.id, event_type, reason, auth.uid());
  if event_type in ('published','corrected') then
    update public.research_items set published_version_id = v.id where id = v.item_id;
  elsif event_type = 'retracted' then
    update public.research_items i set published_version_id = (
      select e.version_id from public.research_publication_events e
       where e.item_id = v.item_id and e.event_type in ('published','corrected')
         and e.version_id <> v.id
         and not exists (select 1 from public.research_publication_events r
                          where r.version_id = e.version_id and r.event_type = 'retracted')
       order by e.id desc limit 1)
    where i.id = v.item_id and i.published_version_id = v.id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Checker keys (admin) and status (members)
-- ---------------------------------------------------------------------------
create or replace function public.create_checker_key(label text) returns text
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  perform private.require_role('admin');
  k := 'FRAK-' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.checker_keys (key_hash, label, created_by)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), coalesce(nullif(btrim(label), ''), 'Frak'), auth.uid());
  return k;  -- shown once; only the hash is kept
end $$;

create or replace function public.revoke_checker_key(key_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  update private.checker_keys set revoked_at = now(), revoked_by = auth.uid()
   where id = key_id and revoked_at is null;
end $$;

create or replace function public.list_checker_keys()
returns table (id bigint, label text, created_at timestamptz, last_seen_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return query select c.id, c.label, c.created_at, c.last_seen_at, c.revoked_at
                 from private.checker_keys c order by c.id desc;
end $$;

create or replace function public.checker_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_member() then jsonb_build_object(
    'online', coalesce(max(c.last_seen_at) > now() - interval '3 minutes', false),
    'last_seen_at', max(c.last_seen_at),
    'queued', (select count(*) from public.research_prechecks p where p.status in ('queued','running')))
  else null end
  from private.checker_keys c where c.revoked_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 6. What Frak calls (anon key + checker key)
-- ---------------------------------------------------------------------------
create or replace function private.checker_key_id(p_key text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare kid bigint;
begin
  if p_key is null or p_key !~ '^FRAK-[0-9a-f]{64}$' then
    raise exception 'Unknown checker key' using errcode = '28000';
  end if;
  select c.id into kid from private.checker_keys c
   where c.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and c.revoked_at is null;
  if kid is null then raise exception 'Unknown checker key' using errcode = '28000'; end if;
  update private.checker_keys set last_seen_at = now() where id = kid;
  return kid;
end $$;

-- Returns the next job, or null when there is nothing to do. Polling is also Frak's heartbeat.
create or replace function public.checker_claim(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.research_prechecks; v public.research_versions; i public.research_items;
begin
  perform private.checker_key_id(checker_key);
  -- a job stuck "running" for 10 minutes is retried, up to 3 tries in all
  update public.research_prechecks set status = 'failed', error = 'Frak did not finish the check', completed_at = now()
   where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  select * into p from public.research_prechecks pc
   where pc.status = 'queued' or (pc.status = 'running' and pc.claimed_at < now() - interval '10 minutes')
   order by pc.id limit 1 for update skip locked;
  if p.id is null then return null; end if;
  update public.research_prechecks set status = 'running', claimed_at = now(), attempts = attempts + 1 where id = p.id;
  select * into v from public.research_versions where id = p.version_id;
  select * into i from public.research_items where id = v.item_id;
  return jsonb_build_object(
    'precheck_id', p.id,
    'title', i.title, 'context', i.question,
    'claim', v.claim, 'verdict', v.verdict, 'summary', v.summary, 'evidence', v.body,
    'counterargument', v.counterargument, 'counter_response', v.counter_response,
    'methods', v.methods, 'limitations', v.limitations,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('n', s.n, 'url', s.url, 'title', s.title,
                 'publisher', s.publisher, 'date', s.published_at_claimed, 'quote', s.quote, 'locator', s.locator) order by s.n)
               from (select rs.*, row_number() over (order by rs.id) n from public.research_sources rs where rs.version_id = v.id) s), '[]'::jsonb));
end $$;

-- findings: [{"severity":"glaring"|"minor","issue":"...","where":"..."}]. Outcome is decided here:
-- any glaring finding means the author is asked "are you sure?".
create or replace function public.checker_complete(checker_key text, precheck_id bigint, findings jsonb, summary text, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare clean jsonb := '[]'::jsonb; f jsonb; sev text; n int := 0;
begin
  perform private.checker_key_id(checker_key);
  if jsonb_typeof(findings) is distinct from 'array' then findings := '[]'::jsonb; end if;
  for f in select x from jsonb_array_elements(findings) x loop
    exit when n >= 12;
    continue when jsonb_typeof(f) <> 'object' or coalesce(btrim(f->>'issue'), '') = '';
    sev := case when f->>'severity' = 'glaring' then 'glaring' else 'minor' end;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'severity', sev, 'issue', left(btrim(f->>'issue'), 600), 'where', left(coalesce(btrim(f->>'where'), ''), 120)));
    n := n + 1;
  end loop;
  update public.research_prechecks pc
     set status = 'done', findings = clean, completed_at = now(),
         outcome = case when clean @> '[{"severity":"glaring"}]' then 'flagged' else 'clear' end,
         summary = left(checker_complete.summary, 1000), model = left(checker_complete.model, 100)
   where pc.id = checker_complete.precheck_id and pc.status = 'running';
  if not found then raise exception 'That check is not running' using errcode = '42501'; end if;
end $$;

create or replace function public.checker_fail(checker_key text, precheck_id bigint, error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.research_prechecks pc set status = 'failed', error = left(checker_fail.error, 500), completed_at = now()
   where pc.id = checker_fail.precheck_id and pc.status = 'running';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Function privileges (Supabase grants everything by default; take it back)
-- ---------------------------------------------------------------------------
revoke all on function
  private.own_open_version(bigint), private.checker_key_id(text),
  public.request_precheck(bigint), public.submit_for_review(bigint,text), public.return_for_changes(bigint,text),
  public.review_research_version(bigint,text,text),
  public.create_checker_key(text), public.revoke_checker_key(bigint), public.list_checker_keys(), public.checker_status(),
  public.checker_claim(text), public.checker_complete(text,bigint,jsonb,text,text), public.checker_fail(text,bigint,text)
  from public, anon, authenticated;
grant execute on function
  public.request_precheck(bigint), public.submit_for_review(bigint,text), public.return_for_changes(bigint,text),
  public.review_research_version(bigint,text,text),
  public.create_checker_key(text), public.revoke_checker_key(bigint), public.list_checker_keys(), public.checker_status()
  to authenticated;
grant execute on function
  public.checker_claim(text), public.checker_complete(text,bigint,jsonb,text,text), public.checker_fail(text,bigint,text)
  to anon, authenticated;

commit;
