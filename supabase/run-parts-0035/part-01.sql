-- RUN THIS
-- The Way 0035: screenshot privacy (text only, drafts, hide names, logged picture view, deletion). One part; run AFTER 0030 to 0034. Safe to run again.
-- The Way: screenshot privacy (Frank, Oct 28 2026). Needs 0030 to 0034. Safe to run twice.
--   * The sender chooses "send only the text" (the default): the picture is read by our own program on the archiver and
--     DELETED as soon as the text is read. Or the sender lets us keep it for a reviewer, up to 3 days, then it is deleted.
--   * No person sees a picture by default. Reviewers see the text. The picture sits behind a logged action "view image
--     (needed for review)": the reviewer must have picked the item, the sender must have allowed it, and a reason is written
--     down. The log is append-only and admins can read it.
--   * Pictures are removed from storage by the archiver worker through the thread-shot function (a database row cannot remove the file).
--   * A closed item's picture is deleted one day after it is closed.
--   * A screenshot is a DRAFT until the sender has checked the text and pressed send. A draft is invisible to reviewers and
--     raises no alert. If it is not sent within an hour of the text being read (6 hours at the very most), the text and the
--     picture are both deleted and only an empty note that it expired is left.

do $guard$
begin
  if to_regclass('public.thread_intakes') is null or to_regprocedure('public.checker_thread_ocr_ok(text,bigint,text)') is null
     or to_regprocedure('private.thread_new_alert()') is null then raise exception 'Stop: run 0030 to 0034 first'; end if;
end $guard$;

alter table public.thread_intakes add column if not exists image_mode text not null default 'review' check (image_mode in ('text_only','review'));
alter table public.thread_intakes add column if not exists image_delete_after timestamptz;
alter table public.thread_intakes add column if not exists image_deleted_at timestamptz;
alter table public.thread_intakes add column if not exists draft_expires_at timestamptz;
do $c$
declare cn text;
begin
  for cn in select c.conname from pg_constraint c where c.conrelid = 'public.thread_intakes'::regclass and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%''in_review''%' and pg_get_constraintdef(c.oid) like '%''matched''%' and pg_get_constraintdef(c.oid) not like '%''expired''%'
  loop execute format('alter table public.thread_intakes drop constraint %I', cn); end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.thread_intakes'::regclass and pg_get_constraintdef(c.oid) like '%''expired''%') then
    alter table public.thread_intakes add constraint thread_intakes_status_check
      check (status in ('matched','queued','in_review','accepted','needs_evidence','duplicate','declined','answered','draft','expired','discarded'));
  end if;
end $c$;
create index if not exists thread_intakes_image_due on public.thread_intakes (image_delete_after) where image_deleted_at is null and shot_path is not null;
-- screenshots that are already here keep the old behaviour: kept up to 3 days after this runs, then deleted
update public.thread_intakes set image_delete_after = now() + interval '3 days' where kind = 'screenshot' and image_delete_after is null and image_deleted_at is null;

-- who looked at which picture, and why
create table if not exists public.thread_image_views (
  id         bigint generated always as identity primary key,
  intake_id  bigint not null references public.thread_intakes(id),
  shot_path  text not null,
  member_id  uuid not null references public.members(id),
  reason     text not null check (char_length(btrim(reason)) between 8 and 300),
  created_at timestamptz not null default now()
);
comment on table public.thread_image_views is 'Append-only log: every time a reviewer opened a sender picture, who, when and why.';
create index if not exists thread_image_views_item on public.thread_image_views (intake_id, id);
create index if not exists thread_image_views_open on public.thread_image_views (member_id, shot_path, created_at);
revoke all on public.thread_image_views from public, anon, authenticated;
alter table public.thread_image_views enable row level security;
drop trigger if exists thread_image_views_append_only on public.thread_image_views;
create trigger thread_image_views_append_only before update or delete on public.thread_image_views for each row execute function private.forbid_change();
drop trigger if exists thread_image_views_no_truncate on public.thread_image_views;
create trigger thread_image_views_no_truncate before truncate on public.thread_image_views for each statement execute function private.forbid_change();
drop trigger if exists thread_image_views_audit on public.thread_image_views;
create trigger thread_image_views_audit after insert on public.thread_image_views for each row execute function private.audit();

-- "Hide names of senders": the local AI on the archiver removes the names and handles of the POSTERS (the accounts that wrote the posts or comments, the sender's own included; names mentioned inside the content stay) from the text before
-- the sender sees it. The unredacted text is kept only when the box is not ticked. A screenshot's text is redacted in the same
-- job that reads it, so the unredacted text never reaches the database. A pasted text is held as a draft (only the archiver
-- reads it) until it is redacted; the sender sees the result and sends it, or it all goes within the hour.
alter table public.thread_intakes add column if not exists hide_names boolean not null default false;
alter table public.thread_intakes add column if not exists redact_status text not null default 'none' check (redact_status in ('none','pending','running','done','failed'));
alter table public.thread_intakes add column if not exists redact_claimed_at timestamptz;
alter table public.thread_intakes add column if not exists redact_tries int not null default 0;
alter table public.thread_intakes add column if not exists redact_note text check (redact_note is null or char_length(redact_note) <= 200);
create index if not exists thread_intakes_redact on public.thread_intakes (redact_status, id) where redact_status in ('pending','running');

-- ---------------------------------------------------------------- delete times
-- a new screenshot starts as a DRAFT (6 hours at the very most) and its picture is due within 1 day (text-only) or 4 days.
-- When the reader finishes: text-only pictures are due now, kept pictures 3 days later, and the draft has 1 hour left.
create or replace function private.thread_image_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'screenshot' then
      new.status := 'draft';
      new.draft_expires_at := now() + interval '6 hours';
      new.image_delete_after := now() + case when new.image_mode = 'text_only' then interval '1 day' else interval '4 days' end;
    elsif new.kind = 'question' and coalesce(current_setting('thread.hide', true), '') = '1' then
      new.status := 'draft'; new.draft_expires_at := now() + interval '6 hours'; new.hide_names := true; new.redact_status := 'pending';
    end if;
    return new;
  end if;
  if new.kind = 'question' and new.status = 'draft' and new.redact_status in ('done','failed') and old.redact_status is distinct from new.redact_status then
    new.draft_expires_at := least(coalesce(new.draft_expires_at, now() + interval '1 hour'), now() + interval '1 hour');
  end if;
  if new.kind = 'screenshot' and new.image_deleted_at is null then
    if new.ocr_status in ('done','failed') and old.ocr_status is distinct from new.ocr_status then
      new.image_delete_after := case when new.image_mode = 'text_only' then now() else least(coalesce(new.image_delete_after, now() + interval '3 days'), now() + interval '3 days') end;
      if new.status = 'draft' then new.draft_expires_at := least(coalesce(new.draft_expires_at, now() + interval '1 hour'), now() + interval '1 hour'); end if;
    end if;
    if new.status in ('accepted','needs_evidence','duplicate','declined','answered') and old.status is distinct from new.status then
      new.image_delete_after := least(coalesce(new.image_delete_after, now() + interval '1 day'), now() + interval '1 day');
    end if;
    if new.status in ('expired','discarded') and old.status is distinct from new.status then new.image_delete_after := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists thread_intakes_image_times on public.thread_intakes;
create trigger thread_intakes_image_times before insert or update on public.thread_intakes for each row execute function private.thread_image_times();

-- ---------------------------------------------------------------- sending: remember the sender's choice
do $mv$
begin
  if to_regprocedure('public.intake_thread(text,text,text,text,text,int,uuid,text)') is not null then
    alter function public.intake_thread(text,text,text,text,text,int,uuid,text) set schema private;
    alter function private.intake_thread(text,text,text,text,text,int,uuid,text) rename to intake_thread_core;
  end if;
end $mv$;
drop function if exists public.intake_thread(text,text,text,text,text,int,uuid,text,text);
create or replace function public.intake_thread(p_kind text, p_url text, p_question text, p_note text,
                                                p_shot_path text, p_shot_bytes int, p_member uuid, p_rate_key text, p_image_mode text default 'text_only', p_hide_names boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare out jsonb; mode text := case when p_image_mode = 'review' then 'review' else 'text_only' end;
begin
  perform private.thread_expire_drafts();
  if p_kind = 'question' and coalesce(p_hide_names, false) then perform set_config('thread.hide', '1', true); end if;
  out := private.intake_thread_core(p_kind, p_url, p_question, p_note, p_shot_path, p_shot_bytes, p_member, p_rate_key);
  perform set_config('thread.hide', '', true);
  if p_kind = 'question' and coalesce(p_hide_names, false) then
    out := out || jsonb_build_object('status', 'draft', 'matches', '[]'::jsonb);
  end if;
  if p_kind = 'screenshot' then
    update public.thread_intakes set image_mode = mode,
           image_delete_after = now() + case when mode = 'text_only' then interval '1 day' else interval '4 days' end
           , hide_names = coalesce(p_hide_names, false)
     where receipt_hash = encode(extensions.digest(out->>'receipt', 'sha256'), 'hex');
    out := out || jsonb_build_object('status', 'draft', 'matches', '[]'::jsonb);     -- nothing is shown until the sender has checked the text and sent it
  end if;
  return out;
end $$;
revoke all on function private.intake_thread_core(text,text,text,text,text,int,uuid,text),
  public.intake_thread(text,text,text,text,text,int,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.intake_thread(text,text,text,text,text,int,uuid,text,text,boolean) to service_role;

-- ---------------------------------------------------------------- reviewers: text first, the picture behind a logged action
drop function if exists public.list_thread_queue(text,int);
create or replace function public.list_thread_queue(p_include text default 'open', p_limit int default 60)
returns table (id bigint, kind text, url text, question text, note text, image_state text, status text, created_at timestamptz,
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
         and t.status not in ('draft','expired','discarded')
    ), r as (select s.*, private.thread_total(s.pp) as tot from s)
    select r.id, r.kind, r.url, r.question, r.note,
           case when r.kind <> 'screenshot' then 'none' when r.image_deleted_at is not null then 'deleted'
                when r.image_mode = 'text_only' then 'text_only' else 'available' end,
           r.status, r.created_at, r.tot, r.pp,
           (row_number() over (order by r.tot desc, r.created_at, r.id))::int, r.matches, r.page_title, r.excerpt, r.fetch_note,
           (select count(*)::int from public.thread_intakes d where d.dup_key = r.dup_key and d.status not in ('draft','expired','discarded')),
           (select m.display_name from public.members m where m.id = r.claimed_by), r.claimed_by = auth.uid(), r.public_note,
           r.ocr_status, coalesce(r.ocr_text_fixed, r.ocr_text), r.ocr_text_fixed is not null
      from r order by r.tot desc, r.created_at, r.id
     limit greatest(1, least(coalesce(p_limit, 60), 200));
end $$;

-- "View image (needed for review)": returns the file name for a signed link that works for 10 minutes. Logged with a reason.
create or replace function public.thread_image_request(p_intake bigint, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; r text := nullif(btrim(p_reason), '');
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes where id = p_intake for update;
  if t.id is null or t.kind <> 'screenshot' then raise exception 'Unknown item' using errcode = '02000'; end if;
  if t.status <> 'in_review' or t.claimed_by is distinct from auth.uid() then
    raise exception 'Pick this item first. The picture is only for the reviewer who has it.' using errcode = '42501';
  end if;
  if t.image_deleted_at is not null then raise exception 'The picture has been deleted. Use the text.' using errcode = '22023'; end if;
  if t.image_mode <> 'review' then raise exception 'The sender chose to send only the text. There is no picture to open.' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 8 and 300 then raise exception 'Say why the picture is absolutely needed (8 to 300 characters)' using errcode = '22023'; end if;
  insert into public.thread_image_views (intake_id, shot_path, member_id, reason) values (t.id, t.shot_path, auth.uid(), r);
  update public.thread_intakes set image_delete_after = greatest(coalesce(image_delete_after, now()), now() + interval '7 days') where id = t.id;
  return t.shot_path;
end $$;

-- the storage policy: a picture opens only inside the 10 minutes after a logged request by the same reviewer
create or replace function private.thread_image_open(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.may_triage() and exists (select 1 from public.thread_image_views v
          where v.member_id = auth.uid() and v.shot_path = p_name and v.created_at > now() - interval '10 minutes');
$$;
drop policy if exists thread_shots_obj_read on storage.objects;
create policy thread_shots_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'thread-screenshots' and private.thread_image_open(name));

-- admins read the log
create or replace function public.thread_image_log(p_intake bigint default null, p_limit int default 100)
returns table (intake_id bigint, viewer_name text, reason text, viewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_role('admin') or private.has_role('super_admin')) then raise exception 'Not allowed: admins only' using errcode = '42501'; end if;
  return query select v.intake_id, (select m.display_name from public.members m where m.id = v.member_id), v.reason, v.created_at
    from public.thread_image_views v where p_intake is null or v.intake_id = p_intake order by v.id desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- ---------------------------------------------------------------- drafts: check the text, then send, or it all goes
-- Delete the text and the sender's note of every draft that ran out of time, and make its picture due now. Called by the
-- archiver worker on every pass and by every new submission. Only an empty "expired" note is left.
create or replace function private.thread_expire_drafts() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.thread_intakes set status = 'expired', ocr_text = null, ocr_text_fixed = null, note = null, ocr_note = null,
         question = case when kind = 'question' then 'Deleted: not sent in time' end, redact_note = null,
         redact_status = case when redact_status in ('pending','running') then 'failed' else redact_status end,
         matches = '[]'::jsonb, excerpt = null, ocr_status = case when ocr_status in ('pending','running') then 'failed' else ocr_status end,
         draft_expires_at = null, image_delete_after = now()
   where status = 'draft' and draft_expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- the sender checked the text and sends it on: it joins the queue and the admins are alerted
create or replace function public.thread_confirm(p_receipt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  perform private.thread_expire_drafts();
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex') for update;
  if t.id is null or t.kind = 'url' then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if t.status = 'expired' then raise exception 'This was not sent in time, so the picture and the text were deleted. Please start again.' using errcode = '22023'; end if;
  if t.status <> 'draft' then return jsonb_build_object('status', t.status); end if;      -- already sent
  if t.ocr_status in ('pending','running') or t.redact_status in ('pending','running') then raise exception 'We are still reading it. Try again in a moment.' using errcode = '22023'; end if;
  if t.kind = 'screenshot' and coalesce(char_length(coalesce(t.ocr_text_fixed, t.ocr_text)), 0) < 3 then
    raise exception 'Type or paste what the screenshot says first' using errcode = '22023';
  end if;
  update public.thread_intakes set draft_expires_at = null,
         status = case when kind = 'question' and jsonb_array_length(matches) > 0 then 'matched' else 'queued' end where id = t.id;
  return jsonb_build_object('status', 'queued');
end $$;

-- the sender changes their mind: the text and the note go now, the picture is due now
create or replace function public.thread_discard(p_receipt text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex') for update;
  if t.id is null or (t.kind = 'url') then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if t.status <> 'draft' then raise exception 'It was already sent, so it cannot be taken back here' using errcode = '22023'; end if;
  update public.thread_intakes set status = 'discarded', ocr_text = null, ocr_text_fixed = null, note = null, ocr_note = null, matches = '[]'::jsonb,
         question = case when kind = 'question' then 'Deleted at the sender request' end, redact_note = null,
         redact_status = case when redact_status in ('pending','running') then 'failed' else redact_status end,
         excerpt = null, ocr_status = case when ocr_status in ('pending','running') then 'failed' else ocr_status end, draft_expires_at = null
   where id = t.id;
end $$;

-- status and corrections now know about drafts
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
    'draft_minutes_left', case when t.status = 'draft' then greatest(0, ceil(extract(epoch from (t.draft_expires_at - now())) / 60))::int end);
end $$;

create or replace function public.thread_correct_text(p_receipt text, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; tx text; mt jsonb;
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex') for update;
  if t.id is null or t.kind = 'url' then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if t.status = 'expired' then raise exception 'This was not sent in time, so the text was deleted. Please start again.' using errcode = '22023'; end if;
  if t.kind = 'question' then
    if t.status <> 'draft' then raise exception 'This one was already sent' using errcode = '22023'; end if;
    tx := private.thread_clean_text(p_text, 1500);
    if tx is null or char_length(tx) < 10 or tx ~ '[<>]' then raise exception 'Keep the text between 10 and 1500 characters' using errcode = '22023'; end if;
  else
    tx := private.thread_clean_text(p_text, 3000);
    if t.status not in ('draft','queued','matched','in_review') then raise exception 'This one is closed' using errcode = '22023'; end if;
    if tx is null or char_length(tx) < 3 then raise exception 'Type what the screenshot says (3 to 3000 characters)' using errcode = '22023'; end if;
  end if;
  if t.ocr_status in ('pending','running') or t.redact_status in ('pending','running') then raise exception 'We are still reading it. Try again in a moment.' using errcode = '22023'; end if;
  if t.ocr_edits >= 5 then raise exception 'That is enough corrections for one screenshot' using errcode = '54000'; end if;
  mt := private.thread_matches(null, coalesce(t.note, '') || ' ' || tx);
  if t.kind = 'question' then
    update public.thread_intakes set question = tx, ocr_edits = ocr_edits + 1,
           matches = case when jsonb_array_length(mt) >= jsonb_array_length(matches) then mt else matches end where id = t.id;
  else
    update public.thread_intakes set ocr_text_fixed = tx, ocr_edits = ocr_edits + 1,
           matches = case when jsonb_array_length(mt) >= jsonb_array_length(matches) then mt else matches end where id = t.id;
  end if;
end $$;

-- ---------------------------------------------------------------- archiver: hide names
-- Screenshots: the reader already gets the flag with the job and sends back redacted text. Pasted texts: this job.
create or replace function public.checker_thread_ocr_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes set ocr_status = 'failed', ocr_note = 'Our computer did not finish reading the screenshot'
   where ocr_status = 'running' and ocr_claimed_at < now() - interval '10 minutes' and ocr_tries >= 2;
  select * into t from public.thread_intakes x
   where x.kind = 'screenshot' and x.status = 'draft' and (x.ocr_status = 'pending' or (x.ocr_status = 'running' and x.ocr_claimed_at < now() - interval '10 minutes'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set ocr_status = 'running', ocr_claimed_at = now(), ocr_tries = ocr_tries + 1 where id = t.id;
  return jsonb_build_object('intake_id', t.id, 'shot_path', t.shot_path, 'note', t.note, 'hide_names', t.hide_names);
end $$;

create or replace function public.checker_thread_redact_next(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes set redact_status = 'failed', redact_note = 'The automatic name hiding did not finish. Please check the text and remove names yourself.'
   where redact_status = 'running' and redact_claimed_at < now() - interval '10 minutes' and redact_tries >= 2;
  select * into t from public.thread_intakes x
   where x.kind = 'question' and x.status = 'draft' and (x.redact_status = 'pending' or (x.redact_status = 'running' and x.redact_claimed_at < now() - interval '10 minutes'))
   order by x.id limit 1 for update skip locked;
  if t.id is null then return null; end if;
  update public.thread_intakes set redact_status = 'running', redact_claimed_at = now(), redact_tries = redact_tries + 1 where id = t.id;
  return jsonb_build_object('intake_id', t.id, 'text', t.question, 'note', t.note);
end $$;

-- ok = the model hid the names and passed the worker's checks; otherwise the worker sends its plain-pattern pass and a note for the sender
create or replace function public.checker_thread_redact_done(checker_key text, intake_id bigint, new_text text, new_note text, ok boolean, why text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; tx text; nn text; mt jsonb;
begin
  perform private.checker_key_id(checker_key);
  select * into t from public.thread_intakes x where x.id = checker_thread_redact_done.intake_id and x.redact_status = 'running' and x.status = 'draft' for update;
  if t.id is null then raise exception 'That text is not being redacted' using errcode = '42501'; end if;
  tx := private.thread_clean_text(new_text, 1500);
  if tx is null or char_length(tx) < 10 then raise exception 'The redacted text is too short' using errcode = '22023'; end if;
  nn := private.thread_clean_text(new_note, 500);
  if nn is not null and char_length(nn) < 3 then nn := null; end if;
  mt := private.thread_matches(null, coalesce(nn, '') || ' ' || tx);
  update public.thread_intakes set question = tx, note = nn, matches = mt, redact_status = case when ok is true then 'done' else 'failed' end,
         redact_note = case when ok is true then null else left(coalesce(nullif(btrim(why), ''), 'The automatic name hiding could not be completed. Please check the text and remove names yourself.'), 200) end
   where id = t.id;
end $$;

-- a screenshot read with "hide names" that the model could not finish: the sender is told
create or replace function public.checker_thread_redact_note(checker_key text, intake_id bigint, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set redact_note = left(checker_thread_redact_note.note, 200)
   where x.id = checker_thread_redact_note.intake_id and x.status = 'draft' and x.kind = 'screenshot';
end $$;

-- admins are alerted when a request is SENT, not when a draft is made
create or replace function private.thread_new_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select distinct r.member_id from public.member_roles r join public.members x on x.id = r.member_id
            where x.status = 'active' and r.role in ('admin','super_admin')
  loop
    perform private.notify(m.member_id, 'thread_new', 'New Pull a Thread request',
      case new.kind when 'url' then 'Someone sent a link.' when 'screenshot' then 'Someone sent a screenshot.' else 'Someone sent a question.' end
        || case when new.status = 'matched' then ' We already had something related.' else ' It is waiting in the queue.' end,
      '/members/thread-queue.html', 'thread_new', new.id::text);
  end loop;
  return new;
end $$;
drop trigger if exists thread_intakes_new_alert on public.thread_intakes;
drop trigger if exists thread_intakes_new_alert_update on public.thread_intakes;
create trigger thread_intakes_new_alert after insert on public.thread_intakes for each row when (new.status <> 'draft') execute function private.thread_new_alert();
create trigger thread_intakes_new_alert_update after update of status on public.thread_intakes for each row
  when (old.status = 'draft' and new.status in ('queued','matched')) execute function private.thread_new_alert();

-- ---------------------------------------------------------------- archiver: delete what is due
create or replace function public.checker_thread_images_due(checker_key text, p_limit int default 20)
returns table (intake_id bigint, shot_path text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  perform private.thread_expire_drafts();
  return query select t.id, t.shot_path from public.thread_intakes t
    where t.image_deleted_at is null and t.shot_path is not null and t.image_delete_after <= now() and t.ocr_status not in ('pending','running')
    order by t.image_delete_after limit greatest(1, least(coalesce(p_limit, 20), 50));
end $$;

create or replace function public.checker_thread_image_due_ok(checker_key text, intake_id bigint, path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  return exists (select 1 from public.thread_intakes x where x.id = checker_thread_image_due_ok.intake_id and x.shot_path = checker_thread_image_due_ok.path
                    and x.image_deleted_at is null and x.image_delete_after <= now() and x.ocr_status not in ('pending','running'));
end $$;

create or replace function public.checker_thread_image_deleted(checker_key text, intake_id bigint, path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  update public.thread_intakes x set image_deleted_at = now()
   where x.id = checker_thread_image_deleted.intake_id and x.shot_path = checker_thread_image_deleted.path and x.image_deleted_at is null
     and x.image_delete_after <= now() and x.ocr_status not in ('pending','running');
end $$;

revoke all on function public.checker_thread_ocr_next(text), public.checker_thread_redact_next(text), public.checker_thread_redact_done(text,bigint,text,text,boolean,text),
  public.checker_thread_redact_note(text,bigint,text), private.thread_expire_drafts(), public.thread_confirm(text), public.thread_discard(text), public.thread_status(text), public.thread_correct_text(text,text),
  private.thread_new_alert(), private.thread_image_times(), private.thread_image_open(text), public.list_thread_queue(text,int), public.thread_image_request(bigint,text),
  public.thread_image_log(bigint,int), public.checker_thread_images_due(text,int), public.checker_thread_image_due_ok(text,bigint,text),
  public.checker_thread_image_deleted(text,bigint,text) from public, anon, authenticated;
grant execute on function public.thread_confirm(text), public.thread_discard(text), public.thread_status(text), public.thread_correct_text(text,text) to anon, authenticated, service_role;
grant execute on function public.list_thread_queue(text,int), public.thread_image_request(bigint,text), public.thread_image_log(bigint,int) to authenticated;
grant execute on function public.checker_thread_images_due(text,int), public.checker_thread_image_deleted(text,bigint,text),
  public.checker_thread_ocr_next(text), public.checker_thread_redact_next(text), public.checker_thread_redact_done(text,bigint,text,text,boolean,text),
  public.checker_thread_redact_note(text,bigint,text) to anon, authenticated;   -- guarded by the checker key, like the other archiver calls
grant execute on function public.checker_thread_image_due_ok(text,bigint,text) to service_role;
grant execute on function private.thread_image_open(text) to authenticated;   -- storage policy calls it as the signed-in reviewer

-- Check: every row must say ok.
select 'screenshots start as drafts nobody sees' as check_name,
       case when exists (select 1 from pg_trigger where tgname = 'thread_intakes_image_times') then 'ok' else 'MISSING' end as result
union all
select 'pictures open only through the logged request',
       case when not exists (select 1 from pg_policies where policyname = 'thread_shots_obj_read' and qual not like '%thread_image_open%') then 'ok' else 'WRONG' end
union all
select 'the log cannot be changed',
       case when exists (select 1 from pg_trigger where tgname = 'thread_image_views_append_only') then 'ok' else 'MISSING' end
union all
select 'senders can send or delete a draft',
       case when has_function_privilege('anon','public.thread_confirm(text)','execute') and has_function_privilege('anon','public.thread_discard(text)','execute') then 'ok' else 'WRONG' end
union all
select 'only the archiver can ask for names to be hidden',
       case when has_function_privilege('anon','public.checker_thread_redact_next(text)','execute') and not has_function_privilege('anon','public.intake_thread(text,text,text,text,text,int,uuid,text,text,boolean)','execute') then 'ok' else 'WRONG' end;
