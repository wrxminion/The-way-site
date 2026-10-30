-- 0075: Pull a Thread pictures are for admins only (Frank, Oct 30 2026). Needs 0035 and 0037. Safe to run twice.
-- Reviewers (and editors) see the text only. They cannot request a picture, cannot open one from storage, and the queue
-- tells them "admin_only" instead of "available". Admins can still open a picture with a written reason; every open is logged.
-- LEAST RETENTION: the picture is held only until the decision, then the archiver worker purges the file (the text is kept).
--   * text-only pictures: deleted right after the text is read (unchanged)
--   * pictures sent for admin review: deleted at the decision (accepted, needs evidence, duplicate, declined, answered) instead of a day later;
--     never longer than 3 days if nobody decides; opening a picture no longer adds 7 days
--   * an admin can purge one now with public.thread_image_purge(id)
-- This file deletes NO rows and NO files by itself. It only changes the timers for pictures from now on. Pictures already kept
-- keep the timers they have; see the optional line at the bottom (commented out) to bring those forward too.

create or replace function private.may_view_thread_images() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin') or private.has_role('super_admin');
$$;
grant execute on function private.may_view_thread_images() to authenticated;

-- the queue: same as before, but a picture shows as 'available' only to admins
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
                when r.image_mode = 'text_only' then 'text_only'
                when private.may_view_thread_images() then 'available' else 'admin_only' end,
           r.status, r.created_at, r.tot, r.pp,
           (row_number() over (order by r.tot desc, r.created_at, r.id))::int, r.matches, r.page_title, r.excerpt, r.fetch_note,
           (select count(*)::int from public.thread_intakes d where d.dup_key = r.dup_key and d.status not in ('draft','expired','discarded')),
           (select m.display_name from public.members m where m.id = r.claimed_by), r.claimed_by = auth.uid(), r.public_note,
           r.ocr_status, coalesce(r.ocr_text_fixed, r.ocr_text), r.ocr_text_fixed is not null, r.prelim, r.prelim_status
      from r order by r.tot desc, r.created_at, r.id
     limit greatest(1, least(coalesce(p_limit, 60), 200));
end $$;

-- asking to open a picture: admins only, any item (no need to pick it first), reason still required and logged
create or replace function public.thread_image_request(p_intake bigint, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; r text := nullif(btrim(p_reason), '');
begin
  if not private.may_view_thread_images() then raise exception 'Not allowed: pictures are for admins only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes where id = p_intake for update;
  if t.id is null or t.kind <> 'screenshot' then raise exception 'Unknown item' using errcode = '02000'; end if;
  if t.image_deleted_at is not null then raise exception 'The picture has been deleted. Use the text.' using errcode = '22023'; end if;
  if t.image_mode <> 'review' then raise exception 'The sender chose to send only the text. There is no picture to open.' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 8 and 300 then raise exception 'Say why the picture is needed (8 to 300 characters)' using errcode = '22023'; end if;
  insert into public.thread_image_views (intake_id, shot_path, member_id, reason) values (t.id, t.shot_path, auth.uid(), r);
  -- 0075: opening a picture no longer extends how long it is kept
  return t.shot_path;
end $$;

-- storage: a picture opens only for an admin, inside the 10 minutes after their logged request
create or replace function private.thread_image_open(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.may_view_thread_images() and exists (select 1 from public.thread_image_views v
          where v.member_id = auth.uid() and v.shot_path = p_name and v.created_at > now() - interval '10 minutes');
$$;
drop policy if exists thread_shots_obj_read on storage.objects;
create policy thread_shots_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'thread-screenshots' and private.thread_image_open(name));

-- the decision purges the picture (the text stays)
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
      new.image_delete_after := now();   -- 0075: the picture goes at the decision, not a day later
    end if;
    if new.status in ('expired','discarded') and old.status is distinct from new.status then new.image_delete_after := now(); end if;
  end if;
  return new;
end $$;

-- an admin purges one picture now (the worker removes the file on its next pass); logged in the item's history
create or replace function public.thread_image_purge(p_intake bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.may_view_thread_images() then raise exception 'Not allowed: pictures are for admins only' using errcode = '42501'; end if;
  update public.thread_intakes set image_delete_after = now() where id = p_intake and kind = 'screenshot' and image_deleted_at is null;
end $$;
revoke all on function public.thread_image_purge(bigint) from public, anon;
grant execute on function public.thread_image_purge(bigint) to authenticated;

-- OPTIONAL, not run: bring forward pictures already kept for items that have been decided. Frank to say yes first.
-- update public.thread_intakes set image_delete_after = now()
--  where kind = 'screenshot' and image_deleted_at is null and status in ('accepted','needs_evidence','duplicate','declined','answered');

-- check (last row should say ok)
select 'ok' as result where not exists (select 1 from pg_policies where tablename='objects' and policyname='thread_shots_obj_read' and qual not like '%thread_image_open%');
