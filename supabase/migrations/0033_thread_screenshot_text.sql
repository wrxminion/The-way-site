-- The Way: Pull a Thread reads screenshots (Frank, Oct 28 2026). Needs 0030. Safe to run twice.
--   * The archiver reads the text out of each screenshot with local OCR (Tesseract or a local vision model).
--     Nothing goes to an outside company. It runs inside the archiver's busy check like the other jobs.
--   * The text is used for matching (what do we already have?) and for the score, and is shown to the sender, who can
--     fix mistakes. Reviewers see the sender's corrected text if there is one.
--   * The text can contain names and numbers from a private conversation. Only the sender and reviewers ever see it.
--     It is never published.
--   * the archiver never gets storage access. It asks the thread-shot Edge Function for one image at a time, and the function
--     serves only the image of a job that the archiver has been handed, after the database checks the checker key.

do $guard$
begin
  if to_regclass('public.thread_intakes') is null or to_regclass('public.thread_followups') is null then raise exception 'Stop: run 0030, 0031 and 0032 first'; end if;
end $guard$;

alter table public.thread_intakes add column if not exists ocr_status text not null default 'skipped' check (ocr_status in ('pending','running','done','failed','skipped'));
alter table public.thread_intakes add column if not exists ocr_claimed_at timestamptz;
alter table public.thread_intakes add column if not exists ocr_tries int not null default 0;
alter table public.thread_intakes add column if not exists ocr_text text check (ocr_text is null or char_length(ocr_text) <= 3000);
alter table public.thread_intakes add column if not exists ocr_text_fixed text check (ocr_text_fixed is null or char_length(ocr_text_fixed) <= 3000);
alter table public.thread_intakes add column if not exists ocr_note text check (ocr_note is null or char_length(ocr_note) <= 200);
alter table public.thread_intakes add column if not exists ocr_edits int not null default 0;
create index if not exists thread_intakes_ocr on public.thread_intakes (ocr_status, id) where ocr_status in ('pending','running');

-- every new screenshot waits for the reader
create or replace function private.thread_ocr_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'screenshot' then new.ocr_status := 'pending'; end if;
  return new;
end $$;
drop trigger if exists thread_intakes_ocr_default on public.thread_intakes;
create trigger thread_intakes_ocr_default before insert on public.thread_intakes for each row execute function private.thread_ocr_default();
update public.thread_intakes set ocr_status = 'pending' where kind = 'screenshot' and ocr_status = 'skipped' and ocr_text is null;

-- text from a picture is untrusted: no markup, no control characters, plain lines
create or replace function private.thread_clean_text(p text, p_max int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), '<[^>]*>', '', 'g'), '[<>]', '', 'g'),
                                          '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'), E'\n{3,}', E'\n\n', 'g')), p_max), '');
$$;

-- ---------------------------------------------------------------- queue and status now carry the text
drop function if exists public.list_thread_queue(text,int);
create or replace function public.list_thread_queue(p_include text default 'open', p_limit int default 60)
returns table (id bigint, kind text, url text, question text, note text, shot_path text, status text, created_at timestamptz,
               score int, parts jsonb, rank int, matches jsonb, page_title text, excerpt text, fetch_note text,
               times_sent int, claimed_by_name text, claimed_by_me boolean, public_note text,
               ocr_status text, ocr_text text, ocr_fixed boolean)
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
           (select m.display_name from public.members m where m.id = r.claimed_by), r.claimed_by = auth.uid(), r.public_note,
           r.ocr_status, coalesce(r.ocr_text_fixed, r.ocr_text), r.ocr_text_fixed is not null
      from r order by r.tot desc, r.created_at, r.id
     limit greatest(1, least(coalesce(p_limit, 60), 200));
end $$;

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
    'matches', private.thread_public_matches(t.matches), 'note', t.public_note,
    'ocr_reading', t.ocr_status in ('pending','running'), 'ocr_text', coalesce(t.ocr_text_fixed, t.ocr_text), 'ocr_fixed', t.ocr_text_fixed is not null);
end $$;

-- ---------------------------------------------------------------- archiver (checker key)
create or replace function public.checker_thread_ocr_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes set ocr_status = 'failed', ocr_note = 'Our computer did not finish reading the screenshot'
   where ocr_status = 'running' and ocr_claimed_at < now() - interval '10 minutes' and ocr_tries >= 2;
  select * into t from public.thread_intakes x
   where x.kind = 'screenshot' and (x.ocr_status = 'pending' or (x.ocr_status = 'running' and x.ocr_claimed_at < now() - interval '10 minutes'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set ocr_status = 'running', ocr_claimed_at = now(), ocr_tries = ocr_tries + 1 where id = t.id;
  return jsonb_build_object('intake_id', t.id, 'shot_path', t.shot_path, 'note', t.note);
end $$;

-- the thread-shot Edge Function asks this before it hands over an image
create or replace function public.checker_thread_ocr_ok(checker_key text, intake_id bigint, path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  return exists (select 1 from public.thread_intakes x where x.id = checker_thread_ocr_ok.intake_id and x.shot_path = checker_thread_ocr_ok.path
                    and x.kind = 'screenshot' and x.ocr_status = 'running');
end $$;

create or replace function public.checker_thread_ocr_done(checker_key text, intake_id bigint, ocr_text text, checkable boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; tx text; parts jsonb; mt jsonb;
begin
  perform private.checker_key_id(checker_key);
  select * into t from public.thread_intakes x where x.id = checker_thread_ocr_done.intake_id and x.ocr_status = 'running' for update;
  if t.id is null then raise exception 'That screenshot is not being read' using errcode = '42501'; end if;
  tx := private.thread_clean_text(checker_thread_ocr_done.ocr_text, 3000);
  parts := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(t.base_parts) x where x->>'key' not in ('shot','text','checkable'));
  if tx is null or char_length(tx) < 20 then
    parts := parts || jsonb_build_array(jsonb_build_object('key','shot','label','Screenshot with little readable text: a person must read it first','pts',0));
  else
    parts := parts || jsonb_build_array(jsonb_build_object('key','text','label','Text could be read from the screenshot','pts',10));
    if checker_thread_ocr_done.checkable is true then
      parts := parts || jsonb_build_array(jsonb_build_object('key','checkable','label','Makes a claim that can be checked against sources','pts',20));
    end if;
  end if;
  mt := private.thread_matches(null, coalesce(t.note, '') || ' ' || coalesce(t.ocr_text_fixed, tx, ''));
  update public.thread_intakes set ocr_status = 'done', ocr_text = tx, ocr_note = null, base_parts = parts,
         matches = case when jsonb_array_length(mt) > jsonb_array_length(matches) then mt else matches end
   where id = t.id;
end $$;

create or replace function public.checker_thread_ocr_fail(checker_key text, intake_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set ocr_status = 'failed', ocr_note = left(checker_thread_ocr_fail.note, 200)
   where x.id = checker_thread_ocr_fail.intake_id and x.ocr_status = 'running';
end $$;

-- ---------------------------------------------------------------- the sender fixes the text
create or replace function public.thread_correct_text(p_receipt text, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; tx text := private.thread_clean_text(p_text, 3000); mt jsonb;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex') for update;
  if t.id is null or t.kind <> 'screenshot' then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if t.status not in ('queued','matched','in_review') then raise exception 'This one is closed' using errcode = '22023'; end if;
  if t.ocr_status in ('pending','running') then raise exception 'We are still reading it. Try again in a moment.' using errcode = '22023'; end if;
  if tx is null or char_length(tx) < 3 then raise exception 'Type what the screenshot says (3 to 3000 characters)' using errcode = '22023'; end if;
  if t.ocr_edits >= 5 then raise exception 'That is enough corrections for one screenshot' using errcode = '54000'; end if;
  mt := private.thread_matches(null, coalesce(t.note, '') || ' ' || tx);
  update public.thread_intakes set ocr_text_fixed = tx, ocr_edits = ocr_edits + 1,
         matches = case when jsonb_array_length(mt) >= jsonb_array_length(matches) then mt else matches end
   where id = t.id;
end $$;

revoke all on function private.thread_ocr_default(), private.thread_clean_text(text,int), public.list_thread_queue(text,int), public.thread_status(text),
  public.checker_thread_ocr_next(text), public.checker_thread_ocr_ok(text,bigint,text), public.checker_thread_ocr_done(text,bigint,text,boolean),
  public.checker_thread_ocr_fail(text,bigint,text), public.thread_correct_text(text,text) from public, anon, authenticated;
grant execute on function public.list_thread_queue(text,int) to authenticated;
grant execute on function public.thread_status(text), public.thread_correct_text(text,text) to anon, authenticated, service_role;
grant execute on function public.checker_thread_ocr_next(text), public.checker_thread_ocr_ok(text,bigint,text),
  public.checker_thread_ocr_done(text,bigint,text,boolean), public.checker_thread_ocr_fail(text,bigint,text) to anon, authenticated;
grant execute on function public.checker_thread_ocr_ok(text,bigint,text) to service_role;

-- ---------------------------------------------------------------- members: open one of their own threads from a notification
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
    'code', t.status, 'matches', private.thread_public_matches(t.matches), 'note', t.public_note);
end $$;
revoke all on function public.my_thread_status(bigint) from public, anon, authenticated;
grant execute on function public.my_thread_status(bigint) to authenticated;

-- notifications use the design's wording and link to the one thread
create or replace function private.thread_notify_followups(p_intake bigint, p_headline text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; f record; body text;
begin
  select * into t from public.thread_intakes where id = p_intake;
  if t.id is null then return; end if;
  body := left(p_headline || '. ' || coalesce(t.public_note, '') || case when jsonb_array_length(t.matches) > 0 then ' We may already have: ' ||
            (select string_agg(m->>'title', '; ') from (select m from jsonb_array_elements(t.matches) m limit 3) q) else '' end, 600);
  for f in select * from public.thread_followups where intake_id = p_intake and fulfilled_at is null for update loop
    if f.member_id is not null then
      perform private.notify(f.member_id, 'thread_reply', 'Your thread has an update', btrim(body), '/members/pull-a-thread.html?thread=' || p_intake, 'thread_intake', p_intake::text);
      update public.thread_followups set fulfilled_at = now() where id = f.id;
    else
      update public.thread_followups set mail_state = 'waiting' where id = f.id and mail_state = 'none';
    end if;
  end loop;
end $$;
revoke all on function private.thread_notify_followups(bigint,text) from public, anon, authenticated;
