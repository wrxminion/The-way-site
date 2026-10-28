-- The Way: a quick preliminary answer for every Pull a Thread request (Frank, Oct 28 2026). Needs 0030 to 0036. Safe to run twice.
--   * EVERY request that has been sent gets a short answer made from our own records: what supports it, what contradicts it,
--     and what is related but does not settle it. It is labeled "Preliminary, AI-generated". "We do not have enough evidence"
--     is a valid answer.
--   * The AI (a local model on our own computer) only chooses, for each record we already found, one of: supports, contradicts,
--     related, unrelated. It writes no words. Titles, links and the short descriptions are copied from our own records by this
--     database, so nothing new (no names, no numbers, no links) can appear in an answer.
--   * EVERY request also stays in the priority review queue, including the ones we already have records for. A reviewer can
--     check the answer, move a record to another section or remove it (with a reason, logged), or open a deeper investigation
--     the usual way (accept it).
--   * Findings are members-only: a sender sees a finding's title but never its summary or a link.

do $guard$
begin
  if to_regprocedure('public.thread_confirm(text)') is null or to_regclass('public.thread_image_views') is null then raise exception 'Stop: run 0030 to 0036 first'; end if;
end $guard$;

alter table public.thread_intakes add column if not exists prelim jsonb;
alter table public.thread_intakes add column if not exists prelim_status text not null default 'none' check (prelim_status in ('none','pending','running','done','failed'));
alter table public.thread_intakes add column if not exists prelim_claimed_at timestamptz;
alter table public.thread_intakes add column if not exists prelim_tries int not null default 0;
create index if not exists thread_intakes_prelim on public.thread_intakes (prelim_status, id) where prelim_status in ('pending','running');

-- who changed an answer, and why
create table if not exists public.thread_prelim_edits (
  id         bigint generated always as identity primary key,
  intake_id  bigint not null references public.thread_intakes(id),
  member_id  uuid not null references public.members(id),
  action     text not null check (action in ('move','remove','checked')),
  rec_kind   text,
  rec_ref    text,
  from_section text,
  to_section text,
  reason     text not null check (char_length(btrim(reason)) between 5 and 300),
  created_at timestamptz not null default now()
);
comment on table public.thread_prelim_edits is 'Append-only log of reviewer changes to a preliminary answer.';
create index if not exists thread_prelim_edits_item on public.thread_prelim_edits (intake_id, id);
revoke all on public.thread_prelim_edits from public, anon, authenticated;
alter table public.thread_prelim_edits enable row level security;
drop trigger if exists thread_prelim_edits_append_only on public.thread_prelim_edits;
create trigger thread_prelim_edits_append_only before update or delete on public.thread_prelim_edits for each row execute function private.forbid_change();
drop trigger if exists thread_prelim_edits_no_truncate on public.thread_prelim_edits;
create trigger thread_prelim_edits_no_truncate before truncate on public.thread_prelim_edits for each statement execute function private.forbid_change();
drop trigger if exists thread_prelim_edits_audit on public.thread_prelim_edits;
create trigger thread_prelim_edits_audit after insert on public.thread_prelim_edits for each row execute function private.audit();

-- a request that is sent (not a draft) waits for its answer
create or replace function private.thread_prelim_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.prelim_status := case when new.status = 'draft' then 'none' else 'pending' end;
  elsif old.status = 'draft' and new.status in ('queued','matched') then
    new.prelim_status := 'pending';
  end if;
  if new.status in ('expired','discarded') then new.prelim_status := 'none'; new.prelim := null; end if;
  return new;
end $$;
drop trigger if exists thread_intakes_prelim_flag on public.thread_intakes;
create trigger thread_intakes_prelim_flag before insert or update on public.thread_intakes for each row execute function private.thread_prelim_flag();
update public.thread_intakes set prelim_status = 'pending' where prelim_status = 'none' and status in ('queued','matched','in_review');

-- the records we already found for a request, with their short descriptions (copied from our own tables)
create or replace function private.thread_candidates(p_matches jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', c.k, 'ref', c.r, 'title', c.t, 'path', c.p, 'blurb', c.b) order by c.o), '[]'::jsonb)
    from (
      select distinct on (x->>'kind', x->>'ref') x->>'kind' k, x->>'ref' r, left(x->>'title', 300) t, x->>'path' p, ord o,
             case when x->>'kind' = 'finding'
                  then (select left(v.summary, 500) from public.research_items i join public.research_versions v on v.id = i.published_version_id
                         where i.slug = x->>'ref' and private.version_is_public(v.id))
                  else (select left(m.blurb, 500) from public.thread_match_index m where m.kind = x->>'kind' and m.ref = x->>'ref') end b
        from jsonb_array_elements(p_matches) with ordinality as e(x, ord)
       order by x->>'kind', x->>'ref', ord) c;
$$;

-- what a sender may see of an answer: findings show a title only
create or replace function private.thread_public_prelim_list(l jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', x->>'kind', 'title', x->>'title',
           'path', case when x->>'kind' = 'finding' then null else x->>'path' end,
           'blurb', case when x->>'kind' = 'finding' then null else x->>'blurb' end)), '[]'::jsonb)
    from jsonb_array_elements(coalesce(l, '[]'::jsonb)) x;
$$;
create or replace function private.thread_public_prelim(p jsonb, p_status text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p is null then null else jsonb_build_object(
    'label', case when coalesce((p->>'checked')::boolean, false) then 'Checked by a reviewer. First made by AI.' else 'Preliminary, AI-generated' end,
    'enough', coalesce((p->>'enough')::boolean, false),
    'supports', private.thread_public_prelim_list(p->'supports'), 'contradicts', private.thread_public_prelim_list(p->'contradicts'),
    'related', private.thread_public_prelim_list(p->'related')) end;
$$;

-- ---------------------------------------------------------------- the archiver (checker key)
create or replace function public.checker_thread_prelim_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; txt text;
begin
  perform private.checker_key_id(checker_key);
  -- nothing to compare with: the answer is "not enough evidence", no model needed
  update public.thread_intakes set prelim_status = 'done',
         prelim = jsonb_build_object('made_at', now(), 'enough', false, 'checked', false, 'supports', '[]'::jsonb, 'contradicts', '[]'::jsonb, 'related', '[]'::jsonb)
   where prelim_status = 'pending' and status in ('queued','matched','in_review') and (kind <> 'url' or enrich_status in ('done','failed','skipped'))
     and jsonb_array_length(private.thread_candidates(matches)) = 0;
  update public.thread_intakes set prelim_status = 'failed'
   where prelim_status = 'running' and prelim_claimed_at < now() - interval '10 minutes' and prelim_tries >= 2;
  select * into t from public.thread_intakes x
   where (x.prelim_status = 'pending' or (x.prelim_status = 'running' and x.prelim_claimed_at < now() - interval '10 minutes'))
     and x.status in ('queued','matched','in_review') and (x.kind <> 'url' or x.enrich_status in ('done','failed','skipped'))
     and (x.kind <> 'screenshot' or x.ocr_status in ('done','failed','skipped'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set prelim_status = 'running', prelim_claimed_at = now(), prelim_tries = prelim_tries + 1 where id = t.id;
  txt := case t.kind when 'question' then t.question when 'url' then coalesce(t.page_title, '') || '. ' || coalesce(t.excerpt, '')
                     else coalesce(t.ocr_text_fixed, t.ocr_text, '') end;
  return jsonb_build_object('intake_id', t.id, 'kind', t.kind, 'text', left(coalesce(txt, ''), 3000), 'note', t.note,
                            'candidates', (select coalesce(jsonb_agg(c - 'path'), '[]'::jsonb) from jsonb_array_elements(private.thread_candidates(t.matches)) c));
end $$;

-- relations: [{"kind":"case","ref":"...","relation":"supports|contradicts|related|unrelated"}]. Only records this database already found
-- for the request can appear; anything else the computer sends is ignored; titles and descriptions come from our own tables.
create or replace function public.checker_thread_prelim_done(checker_key text, intake_id bigint, relations jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; c jsonb; rel text; sup jsonb := '[]'::jsonb; con jsonb := '[]'::jsonb; rl jsonb := '[]'::jsonb; item jsonb;
begin
  perform private.checker_key_id(checker_key);
  select * into t from public.thread_intakes x where x.id = checker_thread_prelim_done.intake_id and x.prelim_status = 'running' for update;
  if t.id is null then raise exception 'That answer is not being made' using errcode = '42501'; end if;
  if jsonb_typeof(relations) is distinct from 'array' then raise exception 'relations must be a list' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(private.thread_candidates(t.matches)) loop
    rel := coalesce((select r->>'relation' from jsonb_array_elements(relations) r where r->>'kind' = c->>'kind' and r->>'ref' = c->>'ref' limit 1), 'related');
    if rel not in ('supports','contradicts','related','unrelated') then rel := 'related'; end if;
    continue when rel = 'unrelated';
    item := jsonb_build_object('kind', c->>'kind', 'ref', c->>'ref', 'title', c->>'title', 'path', c->>'path', 'blurb', left(coalesce(c->>'blurb', ''), 400));
    if rel = 'supports' then sup := sup || jsonb_build_array(item); elsif rel = 'contradicts' then con := con || jsonb_build_array(item); else rl := rl || jsonb_build_array(item); end if;
  end loop;
  update public.thread_intakes set prelim_status = 'done',
         prelim = jsonb_build_object('made_at', now(), 'enough', (jsonb_array_length(sup) + jsonb_array_length(con)) > 0, 'checked', false,
                                     'supports', sup, 'contradicts', con, 'related', rl)
   where id = t.id;
end $$;

create or replace function public.checker_thread_prelim_fail(checker_key text, intake_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set prelim_status = 'failed' where x.id = checker_thread_prelim_fail.intake_id and x.prelim_status = 'running';
end $$;

-- ---------------------------------------------------------------- reviewers: check or correct an answer
-- p_section: supports / contradicts / related / remove, or keep (the reviewer checked it and changes nothing). Needs the item picked by you.
create or replace function public.thread_prelim_correct(p_id bigint, p_kind text, p_ref text, p_section text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; r text := nullif(btrim(p_reason), ''); sec text; item jsonb; p jsonb; secs text[] := array['supports','contradicts','related'];
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes where id = p_id for update;
  if t.id is null or t.prelim is null then raise exception 'There is no answer to check yet' using errcode = '22023'; end if;
  if t.status <> 'in_review' or t.claimed_by is distinct from auth.uid() then raise exception 'Pick this item first' using errcode = '42501'; end if;
  if r is null or char_length(r) not between 5 and 300 then raise exception 'Say why (5 to 300 characters)' using errcode = '22023'; end if;
  if p_section not in ('supports','contradicts','related','remove','keep') then raise exception 'Unknown section' using errcode = '22023'; end if;
  p := t.prelim;
  if p_section = 'keep' then
    insert into public.thread_prelim_edits (intake_id, member_id, action, reason) values (t.id, auth.uid(), 'checked', r);
  else
    foreach sec in array secs loop
      select x into item from jsonb_array_elements(p->sec) x where x->>'kind' = p_kind and x->>'ref' = p_ref limit 1;
      exit when item is not null;
    end loop;
    if item is null then raise exception 'That record is not in the answer' using errcode = '22023'; end if;
    p := jsonb_set(p, array[sec], coalesce((select jsonb_agg(x) from jsonb_array_elements(p->sec) x where not (x->>'kind' = p_kind and x->>'ref' = p_ref)), '[]'::jsonb));
    if p_section <> 'remove' then p := jsonb_set(p, array[p_section], coalesce(p->p_section, '[]'::jsonb) || jsonb_build_array(item)); end if;
    insert into public.thread_prelim_edits (intake_id, member_id, action, rec_kind, rec_ref, from_section, to_section, reason)
    values (t.id, auth.uid(), case when p_section = 'remove' then 'remove' else 'move' end, p_kind, p_ref, sec, nullif(p_section, 'remove'), r);
  end if;
  p := jsonb_set(p, '{checked}', 'true'::jsonb);
  p := jsonb_set(p, '{enough}', to_jsonb((jsonb_array_length(coalesce(p->'supports', '[]'::jsonb)) + jsonb_array_length(coalesce(p->'contradicts', '[]'::jsonb))) > 0));
  update public.thread_intakes set prelim = p where id = t.id;
end $$;

create or replace function public.thread_prelim_log(p_intake bigint default null, p_limit int default 100)
returns table (intake_id bigint, reviewer_name text, action text, rec_title text, from_section text, to_section text, reason text, at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_role('admin') or private.has_role('super_admin')) then raise exception 'Not allowed: admins only' using errcode = '42501'; end if;
  return query select e.intake_id, (select m.display_name from public.members m where m.id = e.member_id), e.action, e.rec_ref, e.from_section, e.to_section, e.reason, e.created_at
    from public.thread_prelim_edits e where p_intake is null or e.intake_id = p_intake order by e.id desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- ---------------------------------------------------------------- the queue, the sender's status
drop function if exists public.list_thread_queue(text,int);
create or replace function public.list_thread_queue(p_include text default 'open', p_limit int default 60)
returns table (id bigint, kind text, url text, question text, note text, image_state text, status text, created_at timestamptz,
               score int, parts jsonb, rank int, matches jsonb, page_title text, excerpt text, fetch_note text,
               times_sent int, claimed_by_name text, claimed_by_me boolean, public_note text,
               ocr_status text, ocr_text text, ocr_fixed boolean, prelim jsonb, prelim_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return query
    with s as (
      select t.*, private.thread_parts(t) as pp from public.thread_intakes t
       where case when p_include = 'all' then true
                  when p_include = 'matched' then t.status = 'matched'
                  else t.status in ('queued','in_review','matched') end
         and t.status not in ('draft','expired','discarded')
    ), r as (select s.*, private.thread_total(s.pp) as tot from s)
    select r.id, r.kind, r.url, r.question, r.note,
           case when r.kind <> 'screenshot' then 'none' when r.image_deleted_at is not null then 'deleted'
                when r.image_mode = 'text_only' then 'text_only' else 'available' end,
           r.status, r.created_at, r.tot, r.pp,
           (row_number() over (order by r.tot desc, r.created_at, r.id))::int, r.matches, r.page_title, r.excerpt, r.fetch_note,
           (select count(*)::int from public.thread_intakes d where d.dup_key = r.dup_key and d.status not in ('draft','expired','discarded')),
           (select m.display_name from public.members m where m.id = r.claimed_by), r.claimed_by = auth.uid(), r.public_note,
           r.ocr_status, coalesce(r.ocr_text_fixed, r.ocr_text), r.ocr_text_fixed is not null, r.prelim, r.prelim_status
      from r order by r.tot desc, r.created_at, r.id
     limit greatest(1, least(coalesce(p_limit, 60), 200));
end $$;

create or replace function public.thread_status(p_receipt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  if t.id is null then return null; end if;
  return jsonb_build_object('kind', t.kind, 'received', t.created_at::date, 'reading', t.enrich_status in ('pending','running'), 'code', t.status,
    'status', case t.status when 'matched' then 'We already have something on this' when 'queued' then 'Waiting for a reviewer'
                            when 'in_review' then 'A reviewer is looking at it' when 'accepted' then 'Accepted: we will research it'
                            when 'needs_evidence' then 'We need more evidence to take it on' when 'duplicate' then 'Already covered by another submission'
                            when 'declined' then 'Not taken on'
                            when 'draft' then 'Waiting for you to check the text and send it'
                            when 'expired' then 'Not sent in time: the picture and the text were deleted'
                            when 'discarded' then 'Deleted at your request' else 'Answered' end,
    'matches', private.thread_public_matches(t.matches), 'note', case when t.status in ('expired','discarded') then null else t.public_note end,
    'ocr_reading', t.ocr_status in ('pending','running') or t.redact_status in ('pending','running'),
    'ocr_text', case when t.kind = 'question' then (case when t.status = 'draft' then t.question end) else coalesce(t.ocr_text_fixed, t.ocr_text) end,
    'ocr_fixed', t.ocr_text_fixed is not null or t.ocr_edits > 0, 'hide_names', t.hide_names, 'redact_note', t.redact_note,
    'prelim', private.thread_public_prelim(t.prelim, t.status), 'prelim_reading', t.prelim_status in ('pending','running'),
    'draft_minutes_left', case when t.status = 'draft' then greatest(0, ceil(extract(epoch from (t.draft_expires_at - now())) / 60))::int end);
end $$;

create or replace function public.my_thread_status(p_intake bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes x where x.id = p_intake and (x.submitter_id = auth.uid()
     or exists (select 1 from public.thread_followups f where f.intake_id = x.id and f.member_id = auth.uid()));
  if t.id is null then return null; end if;
  return jsonb_build_object('id', t.id, 'kind', t.kind, 'received', t.created_at::date, 'reading', t.enrich_status in ('pending','running'),
    'status', case t.status when 'matched' then 'We already have something on this' when 'queued' then 'Waiting for a reviewer'
                            when 'in_review' then 'A reviewer is looking at it' when 'accepted' then 'Accepted: we will research it'
                            when 'needs_evidence' then 'We need more evidence to take it on' when 'duplicate' then 'Already covered by another submission'
                            when 'declined' then 'Not taken on' else 'Answered' end,
    'code', t.status, 'matches', private.thread_public_matches(t.matches), 'note', t.public_note,
    'prelim', private.thread_public_prelim(t.prelim, t.status), 'prelim_reading', t.prelim_status in ('pending','running'));
end $$;

revoke all on function private.thread_prelim_flag(), private.thread_candidates(jsonb), private.thread_public_prelim(jsonb,text), private.thread_public_prelim_list(jsonb),
  public.checker_thread_prelim_next(text), public.checker_thread_prelim_done(text,bigint,jsonb), public.checker_thread_prelim_fail(text,bigint,text),
  public.thread_prelim_correct(bigint,text,text,text,text), public.thread_prelim_log(bigint,int), public.list_thread_queue(text,int),
  public.thread_status(text), public.my_thread_status(bigint) from public, anon, authenticated;
grant execute on function public.checker_thread_prelim_next(text), public.checker_thread_prelim_done(text,bigint,jsonb), public.checker_thread_prelim_fail(text,bigint,text) to anon, authenticated;   -- guarded by the checker key, like the other archiver calls
grant execute on function public.thread_prelim_correct(bigint,text,text,text,text), public.list_thread_queue(text,int), public.thread_prelim_log(bigint,int), public.my_thread_status(bigint) to authenticated;
grant execute on function public.thread_status(text) to anon, authenticated, service_role;
