-- RUN THIS
-- The Way 0030, part 2 of 2: Pull a Thread submit, score, queue and the archiver functions. Run AFTER part 1. Safe to run again.
do $guard$
begin
  if to_regclass('public.thread_intakes') is null or to_regprocedure('private.thread_matches(text,text)') is null then
    raise exception 'Stop: run part 1 first';
  end if;
end $guard$;

-- ---------------------------------------------------------------- Edge Function entry (service role only)
-- p_rate_key and p_member come from the Edge Function after it checked the Turnstile token or the sign-in.
create or replace function public.intake_thread(p_kind text, p_url text, p_question text, p_note text,
                                                p_shot_path text, p_shot_bytes int, p_member uuid, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u text := nullif(btrim(p_url), ''); q text := nullif(btrim(p_question), ''); nt text := nullif(btrim(p_note), '');
  canon text; dk text; recv text; mt jsonb; strong boolean; st text; parts jsonb := '[]'::jsonb; new_id bigint;
  topic public.research_projects;
begin
  if coalesce(p_rate_key, '') !~ '^[0-9a-f]{64}$' then raise exception 'Missing rate key' using errcode = '22023'; end if;
  if p_kind not in ('url','screenshot','question') then raise exception 'Send a link, a screenshot or a question' using errcode = '22023'; end if;
  if p_kind = 'url' then
    if u is null or u !~* '^https?://[^[:space:]/@]+(/[^[:space:]]*)?$' or char_length(u) > 1000
       or substring(u from '^https?://([^/?#:]+)') !~* '^[a-z0-9.-]+\.[a-z]{2,}$'
       or substring(u from '^https?://([^/?#:]+)') ~* '(^|\.)(localhost|local|internal|lan|home|corp)$' then
      raise exception 'Send a full public web link that starts with http:// or https://' using errcode = '22023';
    end if;
    if nt is not null and char_length(nt) not between 3 and 500 then raise exception 'Keep the note under 500 characters' using errcode = '22023'; end if;
    canon := private.thread_canon(u); dk := canon;
  elsif p_kind = 'question' then
    if q is null or char_length(q) not between 10 and 1500 then raise exception 'Ask in 10 to 1500 characters' using errcode = '22023'; end if;
    if q ~ '[<>]' then raise exception 'Please leave out < and > characters' using errcode = '22023'; end if;
    dk := 'q:' || encode(extensions.digest(lower(regexp_replace(q, '[^a-zA-Z0-9]+', ' ', 'g')), 'sha256'), 'hex');
  else
    if p_shot_path is null or p_shot_path !~ '^[0-9a-f-]{36}\.(png|jpg|webp)$' or coalesce(p_shot_bytes, 0) not between 1 and 4194304 then
      raise exception 'The screenshot did not arrive correctly' using errcode = '22023';
    end if;
    if nt is null or char_length(nt) not between 3 and 500 then raise exception 'Say in a few words what we should check in the screenshot' using errcode = '22023'; end if;
    dk := 'shot:' || p_shot_path;
  end if;
  if p_kind <> 'question' and nt is not null and nt ~ '[<>]' then raise exception 'Please leave out < and > characters' using errcode = '22023'; end if;
  if not private.thread_rate_ok(p_rate_key, p_member is not null) then
    raise exception 'That is a lot of submissions. Please try again later.' using errcode = '54000';
  end if;

  mt := private.thread_matches(canon, coalesce(q, nt));
  strong := exists (select 1 from jsonb_array_elements(mt) m where m->>'strength' = 'source');
  st := case when jsonb_array_length(mt) > 0 and p_kind <> 'screenshot' then 'matched' else 'queued' end;
  select * into topic from public.research_projects p
   where p.active and to_tsvector('english', p.title || ' ' || coalesce(p.description, '')) @@
         websearch_to_tsquery('english', regexp_replace(coalesce(q, nt, regexp_replace(u, '[^a-zA-Z0-9]+', ' ', 'g')), '\s+', ' or ', 'g'))
   order by p.parent_id nulls first, p.id limit 1;
  if topic.id is not null then
    parts := parts || jsonb_build_array(jsonb_build_object('key','topic','label','Fits our research project "' || topic.title || '"','pts',15));
  end if;
  if p_kind = 'url' then parts := parts || jsonb_build_array(jsonb_build_object('key','source','label','Comes with a link we can read','pts',10)); end if;
  if p_kind = 'screenshot' then parts := parts || jsonb_build_array(jsonb_build_object('key','shot','label','Screenshot only: a person must read it first','pts',0)); end if;

  recv := encode(extensions.gen_random_bytes(12), 'hex');
  insert into public.thread_intakes (kind, url, canonical_url, question, note, shot_path, shot_bytes, dup_key, submitter_id, rate_key,
                                     receipt_hash, status, matches, base_parts, enrich_status, project_id)
  values (p_kind, case when p_kind = 'url' then u end, canon, case when p_kind = 'question' then q end, nt,
          case when p_kind = 'screenshot' then p_shot_path end, case when p_kind = 'screenshot' then p_shot_bytes end,
          dk, p_member, p_rate_key, encode(extensions.digest(recv, 'sha256'), 'hex'), st, mt, parts,
          case when p_kind = 'url' then 'pending' else 'skipped' end, topic.id)
  returning id into new_id;
  return jsonb_build_object('receipt', recv, 'status', st, 'matches', private.thread_public_matches(mt), 'strong', strong);
end $$;

-- What a sender may see of a match: kind, title and a link. Findings are members-only at the database, so the
-- link is only given for non-finding matches; a finding match says so by title.
create or replace function private.thread_public_matches(m jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', x->>'kind', 'title', x->>'title', 'why', x->>'why', 'strength', x->>'strength',
                                               'path', case when x->>'kind' = 'finding' then null else x->>'path' end)), '[]'::jsonb)
    from jsonb_array_elements(m) x;
$$;

-- ---------------------------------------------------------------- sender: status and "that is not what I asked"
create or replace function public.thread_status(p_receipt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  if t.id is null then return null; end if;
  return jsonb_build_object('kind', t.kind, 'received', t.created_at::date, 'reading', t.enrich_status in ('pending','running'),
    'status', case t.status when 'matched' then 'We already have something on this' when 'queued' then 'Waiting for a reviewer'
                            when 'in_review' then 'A reviewer is looking at it' when 'accepted' then 'Accepted: we will research it'
                            when 'needs_evidence' then 'We need more evidence to take it on' when 'duplicate' then 'Already covered by another submission'
                            when 'declined' then 'Not taken on' else 'Answered' end,
    'matches', private.thread_public_matches(t.matches), 'note', t.public_note);
end $$;

create or replace function public.thread_dispute(p_receipt text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex') for update;
  if t.id is null then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if t.status <> 'matched' then return; end if;
  update public.thread_intakes set status = 'queued' where id = t.id;
  insert into public.thread_intake_events (intake_id, event_type, reason) values (t.id, 'disputed', 'Sender said the match does not answer the question');
end $$;

-- ---------------------------------------------------------------- score: our own, with reasons
-- Stored reasons (topic, readable link, what the archiver found) plus live ones (how many different people sent
-- the same thing, how long it has waited, what reviewers moved it by).
create or replace function private.thread_parts(t public.thread_intakes) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare parts jsonb := t.base_parts; reach int; adj int; days int;
begin
  select count(distinct s.rate_key) - 1 into reach from public.thread_intakes s where s.dup_key = t.dup_key and s.id <> t.id or s.id = t.id and s.dup_key = t.dup_key;
  reach := least(greatest(coalesce(reach, 0), 0), 5);
  if reach > 0 then parts := parts || jsonb_build_array(jsonb_build_object('key','reach','label', reach || ' other sender(s) sent the same thing','pts', reach * 5)); end if;
  days := least(greatest(extract(day from now() - t.created_at)::int, 0), 20);
  if days > 0 then parts := parts || jsonb_build_array(jsonb_build_object('key','age','label','Waiting ' || days || ' day(s)','pts', days)); end if;
  select coalesce(sum(e.delta), 0) into adj from public.thread_intake_events e where e.intake_id = t.id and e.event_type = 'priority';
  adj := least(greatest(adj, -80), 80);
  if adj <> 0 then parts := parts || jsonb_build_array(jsonb_build_object('key','reviewer','label','Moved by reviewers','pts', adj)); end if;
  return parts;
end $$;

create or replace function private.thread_total(parts jsonb) returns int
language sql immutable set search_path = '' as $$
  select coalesce(sum((x->>'pts')::int), 0)::int from jsonb_array_elements(parts) x;
$$;

-- ---------------------------------------------------------------- reviewers: the queue
create or replace function public.list_thread_queue(p_include text default 'open', p_limit int default 60)
returns table (id bigint, kind text, url text, question text, note text, shot_path text, status text, created_at timestamptz,
               score int, parts jsonb, rank int, matches jsonb, page_title text, excerpt text, fetch_note text,
               times_sent int, claimed_by_name text, claimed_by_me boolean, public_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return query
    with s as (
      select t.*, private.thread_parts(t) as pp from public.thread_intakes t
       where case when p_include = 'all' then true
                  when p_include = 'matched' then t.status = 'matched'
                  else t.status in ('queued','in_review') end
    ), r as (select s.*, private.thread_total(s.pp) as tot from s)
    select r.id, r.kind, r.url, r.question, r.note, r.shot_path, r.status, r.created_at, r.tot, r.pp,
           (row_number() over (order by r.tot desc, r.created_at, r.id))::int, r.matches, r.page_title, r.excerpt, r.fetch_note,
           (select count(*)::int from public.thread_intakes d where d.dup_key = r.dup_key),
           (select m.display_name from public.members m where m.id = r.claimed_by), r.claimed_by = auth.uid(), r.public_note
      from r order by r.tot desc, r.created_at, r.id
     limit greatest(1, least(coalesce(p_limit, 60), 200));
end $$;

-- Pick ANY item (the top one is a suggestion, not a rule). The pick records whether it was the top item.
create or replace function public.pick_thread(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; top_id bigint;
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes where id = p_id for update;
  if t.id is null then raise exception 'Unknown item' using errcode = '02000'; end if;
  if t.status not in ('queued','matched') then raise exception 'That item is not waiting for a reviewer' using errcode = '22023'; end if;
  select q.id into top_id from public.list_thread_queue('open', 1) q;
  update public.thread_intakes set status = 'in_review', claimed_by = auth.uid(), claimed_at = now() where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, was_top, actor_id) values (p_id, 'picked', top_id = p_id, auth.uid());
end $$;

create or replace function public.release_thread(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes where id = p_id for update;
  if t.id is null or t.status <> 'in_review' then raise exception 'That item is not being reviewed' using errcode = '22023'; end if;
  if t.claimed_by <> auth.uid() and not (private.has_role('admin') or private.has_role('super_admin')) then
    raise exception 'Only the reviewer who picked it, or an admin, can put it back' using errcode = '42501';
  end if;
  update public.thread_intakes set status = 'queued', claimed_by = null, claimed_at = null where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, actor_id) values (p_id, 'released', auth.uid());
end $$;

create or replace function public.adjust_thread_priority(p_id bigint, p_delta int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), '');
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  if p_delta is null or p_delta not between -40 and 40 or p_delta = 0 then raise exception 'Move it by 1 to 40 points, up or down' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 3 and 1000 then raise exception 'Say why (3 to 1000 characters)' using errcode = '22023'; end if;
  if not exists (select 1 from public.thread_intakes where id = p_id and status in ('queued','in_review','matched')) then
    raise exception 'That item is not open' using errcode = '22023';
  end if;
  insert into public.thread_intake_events (intake_id, event_type, delta, reason, actor_id) values (p_id, 'priority', p_delta, r, auth.uid());
end $$;

create or replace function public.resolve_thread(p_id bigint, p_disposition text, p_reason text, p_public_note text default null,
                                                 p_project bigint default null, p_dup_of bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; r text := nullif(btrim(p_reason), ''); pn text := nullif(btrim(p_public_note), '');
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  if p_disposition not in ('accepted','needs_evidence','duplicate','declined','answered') then raise exception 'Unknown disposition' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 3 and 1000 then raise exception 'Say why (3 to 1000 characters)' using errcode = '22023'; end if;
  if pn is not null and (char_length(pn) > 500 or pn ~ '[<>]') then raise exception 'The note for the sender is up to 500 characters, no < or >' using errcode = '22023'; end if;
  select * into t from public.thread_intakes where id = p_id for update;
  if t.id is null then raise exception 'Unknown item' using errcode = '02000'; end if;
  if t.status not in ('queued','in_review','matched') then raise exception 'That item is already closed' using errcode = '22023'; end if;
  if t.status = 'in_review' and t.claimed_by <> auth.uid() and not (private.has_role('admin') or private.has_role('super_admin')) then
    raise exception 'Another reviewer has this one' using errcode = '42501';
  end if;
  if p_disposition = 'duplicate' and (p_dup_of is null or p_dup_of = p_id or not exists (select 1 from public.thread_intakes where id = p_dup_of)) then
    raise exception 'Say which earlier item this repeats' using errcode = '22023';
  end if;
  update public.thread_intakes
     set status = p_disposition, resolved_at = now(), public_note = pn, claimed_by = coalesce(claimed_by, auth.uid()),
         project_id = coalesce(p_project, project_id), dup_of = case when p_disposition = 'duplicate' then p_dup_of end
   where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, disposition, reason, actor_id) values (p_id, 'disposition', p_disposition, r, auth.uid());
end $$;

create or replace function public.thread_intake_history(p_id bigint)
returns table (event_type text, was_top boolean, delta int, disposition text, reason text, actor_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return query select e.event_type, e.was_top, e.delta, e.disposition, e.reason,
                      (select m.display_name from public.members m where m.id = e.actor_id), e.created_at
                 from public.thread_intake_events e where e.intake_id = p_id order by e.id;
end $$;

-- ---------------------------------------------------------------- archiver (checker key)
create or replace function public.checker_thread_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes set enrich_status = 'failed', fetch_note = 'Our computer did not finish reading the link'
   where enrich_status = 'running' and enrich_claimed_at < now() - interval '10 minutes' and enrich_tries >= 2;
  select * into t from public.thread_intakes x
   where x.kind = 'url' and (x.enrich_status = 'pending' or (x.enrich_status = 'running' and x.enrich_claimed_at < now() - interval '10 minutes'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set enrich_status = 'running', enrich_claimed_at = now(), enrich_tries = enrich_tries + 1 where id = t.id;
  return jsonb_build_object('intake_id', t.id, 'url', t.url, 'note', t.note);
end $$;

-- info: {"title": "...", "excerpt": "...", "checkable": true|false, "fetch": "ok|pdf|dead|blocked|error", "fetch_note": "..."}
create or replace function public.checker_thread_done(checker_key text, intake_id bigint, info jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; ti text; ex text; parts jsonb; mt jsonb;
begin
  perform private.checker_key_id(checker_key);
  if jsonb_typeof(info) is distinct from 'object' then raise exception 'info must be an object' using errcode = '22023'; end if;
  select * into t from public.thread_intakes x where x.id = checker_thread_done.intake_id and x.enrich_status = 'running' for update;
  if t.id is null then raise exception 'That item is not being read' using errcode = '42501'; end if;
  ti := nullif(left(regexp_replace(regexp_replace(btrim(coalesce(info->>'title', '')), '<[^>]*>', '', 'g'), '[<>]', '', 'g'), 300), '');
  ex := nullif(left(regexp_replace(regexp_replace(btrim(coalesce(info->>'excerpt', '')), '<[^>]*>', '', 'g'), '[<>]', '', 'g'), 1200), '');
  parts := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(t.base_parts) x where x->>'key' <> 'checkable');
  if (info->>'checkable') = 'true' then
    parts := parts || jsonb_build_array(jsonb_build_object('key','checkable','label','Makes a claim that can be checked against sources','pts',20));
  end if;
  -- look again for what we already have, now that we know what the page says
  mt := private.thread_matches(t.canonical_url, coalesce(ti, '') || ' ' || left(coalesce(ex, ''), 400));
  update public.thread_intakes
     set enrich_status = 'done', page_title = ti, excerpt = ex, base_parts = parts, fetch_note = left(info->>'fetch_note', 200),
         matches = case when jsonb_array_length(mt) > jsonb_array_length(matches) then mt else matches end
   where id = t.id;
end $$;

create or replace function public.checker_thread_fail(checker_key text, intake_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set enrich_status = 'failed', fetch_note = left(checker_thread_fail.note, 200)
   where x.id = checker_thread_fail.intake_id and x.enrich_status = 'running';
end $$;

-- rows: [{"kind":"case","ref":"iran-contra","title":"...","blurb":"...","path":"/cases/iran-contra/","urls":["https://..."]}], up to 500 per call
create or replace function public.checker_thread_index_put(checker_key text, rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0; us text[];
begin
  perform private.checker_key_id(checker_key);
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 500 then raise exception 'Send an array of up to 500 rows' using errcode = '22023'; end if;
  for r in select x from jsonb_array_elements(rows) x loop
    select coalesce(array_agg(distinct private.thread_canon(u)), '{}') into us
      from jsonb_array_elements_text(coalesce(r->'urls', '[]'::jsonb)) u where u ~* '^https?://[^[:space:]]+$';
    insert into public.thread_match_index (kind, ref, title, blurb, path, urls)
    values (r->>'kind', left(r->>'ref', 200), left(r->>'title', 300), left(r->>'blurb', 1500), r->>'path', us)
    on conflict (kind, ref) do update set title = excluded.title, blurb = excluded.blurb, path = excluded.path, urls = excluded.urls, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- privileges
revoke all on function
  private.may_triage(), private.thread_canon(text), private.thread_rate_ok(text,boolean), private.thread_matches(text,text),
  private.thread_public_matches(jsonb), private.thread_parts(public.thread_intakes), private.thread_total(jsonb),
  public.intake_thread(text,text,text,text,text,int,uuid,text), public.thread_status(text), public.thread_dispute(text),
  public.list_thread_queue(text,int), public.pick_thread(bigint), public.release_thread(bigint),
  public.adjust_thread_priority(bigint,int,text), public.resolve_thread(bigint,text,text,text,bigint,bigint), public.thread_intake_history(bigint),
  public.checker_thread_next(text), public.checker_thread_done(text,bigint,jsonb), public.checker_thread_fail(text,bigint,text),
  public.checker_thread_index_put(text,jsonb)
  from public, anon, authenticated;
grant execute on function private.may_triage() to authenticated;
grant execute on function public.intake_thread(text,text,text,text,text,int,uuid,text) to service_role;
grant execute on function public.thread_status(text), public.thread_dispute(text) to anon, authenticated, service_role;
grant execute on function public.list_thread_queue(text,int), public.pick_thread(bigint), public.release_thread(bigint),
  public.adjust_thread_priority(bigint,int,text), public.resolve_thread(bigint,text,text,text,bigint,bigint), public.thread_intake_history(bigint)
  to authenticated;
grant execute on function public.checker_thread_next(text), public.checker_thread_done(text,bigint,jsonb), public.checker_thread_fail(text,bigint,text),
  public.checker_thread_index_put(text,jsonb) to anon, authenticated;

-- Check: every row must say ok.
select 'tables locked (RLS on, no browser access)' as check_name,
       case when (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('thread_intakes','thread_intake_events','thread_match_index','thread_rate_hits') and c.relrowsecurity) = 4
             and not has_table_privilege('anon','public.thread_intakes','select') and not has_table_privilege('authenticated','public.thread_intakes','select')
             and not has_table_privilege('authenticated','public.thread_intake_events','select') then 'ok' else 'WRONG' end as result
union all
select 'screenshot bucket private, 4 MB, png/jpeg/webp only',
       case when exists (select 1 from storage.buckets where id = 'thread-screenshots' and public = false and file_size_limit = 4194304 and allowed_mime_types = array['image/png','image/jpeg','image/webp']) then 'ok' else 'WRONG' end
union all
select 'only the Edge Function (service role) can submit',
       case when has_function_privilege('service_role','public.intake_thread(text,text,text,text,text,int,uuid,text)','execute')
             and not has_function_privilege('anon','public.intake_thread(text,text,text,text,text,int,uuid,text)','execute')
             and not has_function_privilege('authenticated','public.intake_thread(text,text,text,text,text,int,uuid,text)','execute') then 'ok' else 'WRONG' end
union all
select 'visitors can only check status and dispute',
       case when has_function_privilege('anon','public.thread_status(text)','execute') and has_function_privilege('anon','public.thread_dispute(text)','execute')
             and not has_function_privilege('anon','public.list_thread_queue(text,int)','execute')
             and not has_function_privilege('anon','public.pick_thread(bigint)','execute') then 'ok' else 'WRONG' end
union all
select 'event history is append-only',
       case when exists (select 1 from pg_trigger where tgname = 'thread_intake_events_append_only') then 'ok' else 'MISSING' end;
