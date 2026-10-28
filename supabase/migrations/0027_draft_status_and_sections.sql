-- The Way: live status for "AI help write my claim", and drafts for more of the form (Frank, Oct 28 2026).
-- Needs 0026. Safe to run twice.
--   1. A worker heartbeat: the Frak worker pings every 30 seconds (checker_ping) and says whether it is ready,
--      busy or paused, in a plain sentence. The page says "offline" when no ping came for 2 minutes.
--   2. Per-draft progress ("Reading your sources", "Writing the draft") and Cancel for the author.
--   3. Place in line and elapsed time, for the author's own draft only (draft_progress).
--   5. Spelling and grammar check: the same queue (kind 'proofread'). It only suggests; each fix is shown to the
--      author as a before and after that they accept or reject. Quotes, URLs, numbers and names are guarded in the worker.
--   6. "None given in the sources.": an author may tick that instead of writing an optional section. Claim and evidence
--      stay required: a submission for review is refused when either is empty or only that sentence.
--   4. The draft also carries evidence (copied word for word, with the source link), an answer to the
--      strongest case against, how we checked, limits, and notes when a field was left blank. The verdict is never part of a draft.

do $guard$
begin
  if to_regclass('public.claim_drafts') is null or to_regprocedure('public.checker_draft_complete(text,bigint,jsonb,text)') is null then
    raise exception 'Stop: run 0026 first';
  end if;
end $guard$;

alter table public.claim_drafts add column if not exists status_note text check (status_note is null or char_length(status_note) <= 200);
alter table public.claim_drafts add column if not exists kind text not null default 'draft' check (kind in ('draft','proofread'));
alter table public.claim_drafts add column if not exists input jsonb;
alter table public.claim_drafts drop constraint if exists claim_drafts_source_urls_check;
alter table public.claim_drafts drop constraint if exists claim_drafts_urls_by_kind;
alter table public.claim_drafts add constraint claim_drafts_urls_by_kind
  check ((kind = 'draft' and cardinality(source_urls) between 1 and 5) or (kind = 'proofread' and cardinality(source_urls) = 0));
alter table public.claim_drafts drop constraint if exists claim_drafts_status_check;
alter table public.claim_drafts add constraint claim_drafts_status_check
  check (status in ('queued','running','done','failed','cancelled'));

alter table private.checker_keys add column if not exists draft_state text check (draft_state is null or draft_state in ('ready','busy','paused'));
alter table private.checker_keys add column if not exists draft_note text check (draft_note is null or char_length(draft_note) <= 200);
alter table private.checker_keys add column if not exists draft_state_at timestamptz;

-- Worker heartbeat. Any call with a good key also refreshes last_seen_at; this one also records what the worker is doing.
create or replace function public.checker_ping(checker_key text, state text default null, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare kid bigint;
begin
  kid := private.checker_key_id(checker_key);
  update private.checker_keys
     set draft_state = case when checker_ping.state in ('ready','busy','paused') then checker_ping.state else null end,
         draft_note = left(nullif(btrim(coalesce(checker_ping.note, '')), ''), 200),
         draft_state_at = now()
   where id = kid;
end $$;

-- The worker says what it is doing for one draft. Returns false when the author cancelled (stop working on it).
create or replace function public.checker_draft_progress(checker_key text, draft_id bigint, note text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  perform private.checker_key_id(checker_key);
  update public.claim_drafts c set status_note = left(nullif(btrim(coalesce(checker_draft_progress.note, '')), ''), 200)
   where c.id = checker_draft_progress.draft_id and c.status = 'running';
  select c.status into st from public.claim_drafts c where c.id = checker_draft_progress.draft_id;
  return st = 'running';
end $$;

create or replace function public.cancel_claim_draft(p_draft bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.claim_drafts set status = 'cancelled', status_note = null, completed_at = now()
   where id = p_draft and requested_by = auth.uid() and status in ('queued','running');
  if not found then raise exception 'Nothing to cancel' using errcode = '22023'; end if;
end $$;

-- What the author's page polls: status, place in line, elapsed seconds, worker heartbeat. Own drafts only.
create or replace function public.draft_progress(p_draft bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.claim_drafts; k record;
begin
  select * into d from public.claim_drafts where id = p_draft and requested_by = auth.uid();
  if d.id is null then return null; end if;
  select c.last_seen_at, c.draft_state, c.draft_note, c.draft_state_at into k
    from private.checker_keys c where c.revoked_at is null order by c.last_seen_at desc nulls last limit 1;
  return jsonb_build_object(
    'status', d.status, 'kind', d.kind, 'note', d.status_note, 'error', d.error,
    'age_secs', extract(epoch from now() - d.created_at)::int,
    'run_secs', case when d.claimed_at is not null then extract(epoch from now() - d.claimed_at)::int end,
    'position', (select count(*) from public.claim_drafts c where c.status in ('queued','running') and c.id < d.id),
    'online', coalesce(k.last_seen_at > now() - interval '2 minutes', false),
    'last_seen_secs', case when k.last_seen_at is not null then extract(epoch from now() - k.last_seen_at)::int end,
    'worker_state', case when k.draft_state_at > now() - interval '5 minutes' then k.draft_state end,
    'worker_note', case when k.draft_state_at > now() - interval '5 minutes' then k.draft_note end);
end $$;

-- Completion now keeps the new fields. Same rules as before: claim 10 to 300 characters, no party or candidate words.
-- draft: {"claim","summary","counterargument","counter_response","evidence","methods","limitations","notes":[..],"passages":[{"url","text"}]}.
-- Never a verdict: the author always chooses it.
create or replace function public.checker_draft_complete(checker_key text, draft_id bigint, draft jsonb, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare cl text; sm text; ca text; cr text; ev text; me text; li text; ps jsonb := '[]'::jsonb; ns jsonb := '[]'::jsonb; p jsonb; n int := 0;
  banned constant text := '\m(democrat\w*|republican\w*|gop|libertarian|green party|candidates?|vote for|vote against)\M';
begin
  perform private.checker_key_id(checker_key);
  if jsonb_typeof(draft) is distinct from 'object' then raise exception 'Draft must be an object' using errcode = '22023'; end if;
  cl := btrim(coalesce(draft->>'claim', ''));
  sm := nullif(btrim(coalesce(draft->>'summary', '')), '');
  ca := nullif(btrim(coalesce(draft->>'counterargument', '')), '');
  cr := nullif(btrim(coalesce(draft->>'counter_response', '')), '');
  ev := nullif(btrim(coalesce(draft->>'evidence', '')), '');
  me := nullif(btrim(coalesce(draft->>'methods', '')), '');
  li := nullif(btrim(coalesce(draft->>'limitations', '')), '');
  if char_length(cl) not between 10 and 300 then raise exception 'Draft claim must be 10 to 300 characters' using errcode = '22023'; end if;
  if cl ~* banned or coalesce(sm,'') ~* banned or coalesce(ca,'') ~* banned or coalesce(cr,'') ~* banned or coalesce(ev,'') ~* banned
     or coalesce(me,'') ~* banned or coalesce(li,'') ~* banned then
    raise exception 'A claim is about a policy and what it did, never a candidate or party' using errcode = '22023';
  end if;
  if jsonb_typeof(draft->'passages') = 'array' then
    for p in select x from jsonb_array_elements(draft->'passages') x loop
      exit when n >= 6;
      continue when jsonb_typeof(p) <> 'object' or coalesce(btrim(p->>'text'), '') = '' or coalesce(btrim(p->>'url'), '') = '';
      ps := ps || jsonb_build_array(jsonb_build_object('url', left(btrim(p->>'url'), 1000), 'text', left(btrim(p->>'text'), 400)));
      n := n + 1;
    end loop;
  end if;
  if jsonb_typeof(draft->'notes') = 'array' then
    select coalesce(jsonb_agg(left(btrim(x), 300)), '[]'::jsonb) into ns
      from (select jsonb_array_elements_text(draft->'notes') x limit 6) t where btrim(x) <> '';
  end if;
  update public.claim_drafts c
     set status = 'done', completed_at = now(), status_note = null, model = left(checker_draft_complete.model, 100), error = null,
         draft = jsonb_build_object('claim', cl, 'summary', left(sm, 1000), 'counterargument', left(ca, 1500),
                                    'counter_response', left(cr, 1500), 'evidence', left(ev, 6000),
                                    'methods', left(me, 1500), 'limitations', left(li, 1500), 'notes', ns, 'passages', ps)
   where c.id = checker_draft_complete.draft_id and c.status = 'running' and c.kind = 'draft';
  if not found then raise exception 'That draft is not running' using errcode = '42501'; end if;
end $$;


-- ---------------------------------------------------------------- queue: both kinds, and the limits per kind
create or replace function public.request_claim_draft(p_notes text, p_urls text[]) returns bigint
language plpgsql security definer set search_path = '' as $$
declare urls text[]; u text; did bigint;
begin
  if not private.has_role('researcher') then
    raise exception 'Not allowed: needs the Author (Submitter) role' using errcode = '42501';
  end if;
  select coalesce(array_agg(btrim(x)), '{}') into urls from unnest(coalesce(p_urls, '{}')) x where btrim(x) <> '';
  if cardinality(urls) < 1 or cardinality(urls) > 5 then
    raise exception 'Give between 1 and 5 source links' using errcode = '22023';
  end if;
  foreach u in array urls loop
    if u !~* '^https?://[^[:space:]]+$' or char_length(u) > 1000 then
      raise exception 'Every source must be a full web link starting with http:// or https://' using errcode = '22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('the_way_claim_draft'), hashtext(auth.uid()::text));
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.kind = 'draft' and d.status in ('queued','running')) >= 2 then
    raise exception 'You already have drafts waiting. Wait for them to finish.' using errcode = '54000';
  end if;
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.kind = 'draft' and d.created_at > now() - interval '1 day') >= 10 then
    raise exception 'That is 10 AI drafts today; try again tomorrow' using errcode = '54000';
  end if;
  insert into public.claim_drafts (requested_by, notes, source_urls) values (auth.uid(), btrim(p_notes), urls) returning id into did;
  return did;
end $$;

create or replace function public.mark_claim_draft_used(p_draft bigint, p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.claim_drafts; v public.research_versions;
begin
  select * into d from public.claim_drafts where id = p_draft and requested_by = auth.uid() and kind = 'draft';
  if d.id is null or d.status <> 'done' then raise exception 'No such draft' using errcode = '02000'; end if;
  if d.used_in_version_id is not null then raise exception 'That draft was already used' using errcode = '22023'; end if;
  select * into v from public.research_versions where id = p_version and author_id = auth.uid();
  if v.id is null then raise exception 'No such version' using errcode = '02000'; end if;
  update public.claim_drafts set used_in_version_id = v.id,
         claim_changed = btrim(coalesce(v.claim,'')) is distinct from btrim(coalesce(d.draft->>'claim',''))
   where id = d.id;
end $$;

create or replace function public.checker_draft_claim(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.claim_drafts;
begin
  perform private.checker_key_id(checker_key);
  update public.claim_drafts set status = 'failed', error = 'Frak did not finish the draft', completed_at = now()
   where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 2;
  select * into d from public.claim_drafts c
   where c.status = 'queued' or (c.status = 'running' and c.claimed_at < now() - interval '10 minutes')
   order by c.id limit 1 for update skip locked;
  if d.id is null then return null; end if;
  update public.claim_drafts set status = 'running', claimed_at = now(), attempts = attempts + 1 where id = d.id;
  return jsonb_build_object('draft_id', d.id, 'kind', d.kind, 'notes', d.notes, 'urls', to_jsonb(d.source_urls), 'input', d.input);
end $$;

-- ---------------------------------------------------------------- spelling and grammar check (suggestions only)
create or replace function public.request_proofread(p_fields jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare k text; v text; clean jsonb := '{}'::jsonb; total int := 0; real_text boolean := false; did bigint;
  allowed constant text[] := array['claim','summary','body','counterargument','counter_response','methods','limitations'];
  marker constant text := 'None given in the sources.';
begin
  if not private.has_role('researcher') then
    raise exception 'Not allowed: needs the Author (Submitter) role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'Send the fields as an object' using errcode = '22023'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_fields) loop
    if k <> all (allowed) then raise exception 'Unknown field %', k using errcode = '22023'; end if;
    if jsonb_typeof(p_fields->k) <> 'string' then raise exception 'Field % must be text', k using errcode = '22023'; end if;
    v := btrim(v);
    continue when v = '' or v = marker;
    if char_length(v) > 20000 then raise exception 'Field % is too long to check', k using errcode = '22023'; end if;
    total := total + char_length(v);
    clean := clean || jsonb_build_object(k, v);
    real_text := true;
  end loop;
  if not real_text then raise exception 'There is no written text to check yet' using errcode = '22023'; end if;
  if total > 60000 then raise exception 'That is too much text to check at once' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('the_way_claim_draft'), hashtext(auth.uid()::text));
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.kind = 'proofread' and d.status in ('queued','running')) >= 2 then
    raise exception 'You already have a check waiting. Wait for it to finish.' using errcode = '54000';
  end if;
  if (select count(*) from public.claim_drafts d where d.requested_by = auth.uid() and d.kind = 'proofread' and d.created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is 30 spelling checks today; try again tomorrow' using errcode = '54000';
  end if;
  insert into public.claim_drafts (requested_by, notes, source_urls, kind, input)
  values (auth.uid(), 'Spelling and grammar check of the version form.', '{}', 'proofread', clean) returning id into did;
  return did;
end $$;

-- fixes: [{"field": "summary", "suggested": "..."}]. The original text is taken from the saved request, never from Frak.
create or replace function public.checker_proofread_complete(checker_key text, draft_id bigint, fixes jsonb, notes jsonb, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.claim_drafts; f jsonb; out jsonb := '[]'::jsonb; ns jsonb := '[]'::jsonb; fld text; sug text; n int := 0;
begin
  perform private.checker_key_id(checker_key);
  select * into d from public.claim_drafts c where c.id = checker_proofread_complete.draft_id and c.status = 'running' and c.kind = 'proofread';
  if d.id is null then raise exception 'That check is not running' using errcode = '42501'; end if;
  if jsonb_typeof(fixes) = 'array' then
    for f in select x from jsonb_array_elements(fixes) x loop
      exit when n >= 7;
      continue when jsonb_typeof(f) <> 'object';
      fld := f->>'field'; sug := btrim(coalesce(f->>'suggested', ''));
      continue when fld is null or not (d.input ? fld) or sug = '' or char_length(sug) > 20000 or sug = (d.input->>fld);
      out := out || jsonb_build_array(jsonb_build_object('field', fld, 'original', d.input->>fld, 'suggested', sug));
      n := n + 1;
    end loop;
  end if;
  if jsonb_typeof(notes) = 'array' then
    select coalesce(jsonb_agg(left(btrim(x), 300)), '[]'::jsonb) into ns
      from (select jsonb_array_elements_text(notes) x limit 6) t where btrim(x) <> '';
  end if;
  update public.claim_drafts c set status = 'done', completed_at = now(), status_note = null, error = null,
         model = left(checker_proofread_complete.model, 100), draft = jsonb_build_object('fixes', out, 'notes', ns)
   where c.id = d.id;
end $$;

-- ---------------------------------------------------------------- "None given in the sources." never stands in for the claim or the evidence
create or replace function private.before_submission_required() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.research_versions; marker constant text := 'None given in the sources.';
begin
  select * into v from public.research_versions where id = new.version_id;
  if btrim(coalesce(v.claim, '')) = '' or btrim(v.claim) = marker then
    raise exception 'The claim is required; it cannot be left out or marked as given in no source' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(v.body, ''))) < 10 or btrim(v.body) = marker then
    raise exception 'The evidence is required; it cannot be left out or marked as given in no source' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists research_submissions_required on public.research_submissions;
create trigger research_submissions_required before insert on public.research_submissions
  for each row execute function private.before_submission_required();

revoke all on function
  private.before_submission_required(),
  public.request_claim_draft(text,text[]), public.mark_claim_draft_used(bigint,bigint), public.checker_draft_claim(text),
  public.request_proofread(jsonb), public.checker_proofread_complete(text,bigint,jsonb,jsonb,text),
  public.checker_ping(text,text,text), public.checker_draft_progress(text,bigint,text),
  public.cancel_claim_draft(bigint), public.draft_progress(bigint)
  from public, anon, authenticated;
grant execute on function public.cancel_claim_draft(bigint), public.draft_progress(bigint), public.request_proofread(jsonb),
  public.request_claim_draft(text,text[]), public.mark_claim_draft_used(bigint,bigint) to authenticated;
grant execute on function public.checker_ping(text,text,text), public.checker_draft_progress(text,bigint,text),
  public.checker_draft_claim(text), public.checker_proofread_complete(text,bigint,jsonb,jsonb,text) to anon, authenticated;
