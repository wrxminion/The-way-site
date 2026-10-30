-- RUN THIS
-- 0062 Commons: Reply tags + one Report system for posts and comments.
-- Needs: 0001 (Commons), 0021 (article comments), 0031 (notifications). Safe to run twice. Deletes nothing.

do $$ begin
  if to_regclass('public.item_comments') is null then raise exception 'Run 0021 (article comments) first'; end if;
  if to_regprocedure('private.notify(uuid,text,text,text,text,text,text)') is null then raise exception 'Run 0031 (notifications) first'; end if;
end $$;

-- ---------------------------------------------------------------- 1. Reply tags on Commons posts
alter table public.posts add column if not exists parent_post_id bigint references public.posts(id);
create index if not exists posts_parent on public.posts (parent_post_id) where parent_post_id is not null;
grant insert (thread_id, body, parent_post_id) on public.posts to authenticated;

-- The post being answered must be in the same thread. Hidden posts can still be answered; they show as "a hidden post".
create or replace function private.before_post_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_post_id is not null
     and not exists (select 1 from public.posts p where p.id = new.parent_post_id and p.thread_id = new.thread_id) then
    raise exception 'That post is not in this thread' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists posts_parent_check on public.posts;
create trigger posts_parent_check before insert on public.posts
  for each row execute function private.before_post_parent();

-- The parent is fixed once posted.
create or replace function private.keep_post_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin new.parent_post_id := old.parent_post_id; return new; end $$;
drop trigger if exists posts_keep_parent on public.posts;
create trigger posts_keep_parent before update on public.posts
  for each row execute function private.keep_post_parent();

-- Tell the person who was answered (not for answering yourself).
create or replace function private.notify_post_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
declare par public.posts; who text;
begin
  if new.parent_post_id is null then return new; end if;
  select * into par from public.posts where id = new.parent_post_id;
  if par.author_id is null or par.author_id = new.author_id then return new; end if;
  select display_name into who from public.members where id = new.author_id;
  perform private.notify(par.author_id, 'commons_reply', coalesce(who, 'A member') || ' replied to your post',
    left(new.body, 200), '/members/#/t/' || new.thread_id || '/p' || new.id, 'post', new.id::text);
  return new;
exception when others then return new;   -- a notice problem must never block a post
end $$;
drop trigger if exists posts_notify_reply on public.posts;
create trigger posts_notify_reply after insert on public.posts
  for each row execute function private.notify_post_reply();

-- ---------------------------------------------------------------- 2. One Reports queue for posts and comments
alter table public.reports alter column post_id drop not null;
alter table public.reports add column if not exists comment_id bigint references public.item_comments(id);
alter table public.reports add column if not exists reason_code text;
alter table public.reports add column if not exists reason_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reports_one_target') then
    alter table public.reports add constraint reports_one_target
      check ((post_id is not null)::int + (comment_id is not null)::int = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_code_ok') then
    alter table public.reports add constraint reports_code_ok
      check (reason_code is null or reason_code in ('attack','hate','false_claim','politics','private_info','spam','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_note_len') then
    alter table public.reports add constraint reports_note_len check (reason_note is null or char_length(reason_note) <= 500);
  end if;
end $$;
create index if not exists reports_comment on public.reports (comment_id) where comment_id is not null;
-- Old reports (no reason_code) are left as they are. New ones: one per member per item.
create unique index if not exists reports_once_post on public.reports (reporter_id, post_id) where post_id is not null and reason_code is not null;
create unique index if not exists reports_once_comment on public.reports (reporter_id, comment_id) where comment_id is not null;

-- The old direct insert path also gets the one-per-member rule.
create or replace function private.before_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reporter_id := auth.uid();
  new.created_at := now();
  new.resolved_at := null; new.resolved_by := null; new.resolution := null;
  if new.post_id is not null and exists (select 1 from public.reports r where r.reporter_id = new.reporter_id and r.post_id = new.post_id) then
    raise exception 'You already reported this' using errcode = '23505';
  end if;
  return new;
end $$;

-- Report a Commons post ('post') or an article comment ('comment').
create or replace function public.report_item(p_kind text, p_id bigint, p_code text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare label text; note text := nullif(btrim(coalesce(p_note, '')), ''); owner uuid;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  label := case p_code
    when 'attack' then 'Attacks or insults a person'
    when 'hate' then 'Hate toward a group'
    when 'false_claim' then 'States something false as fact'
    when 'politics' then 'Asks for votes or backs a party or candidate'
    when 'private_info' then 'Shares private information'
    when 'spam' then 'Spam or an ad'
    when 'other' then 'Something else' end;
  if label is null then raise exception 'Pick a reason' using errcode = '22023'; end if;
  if p_code = 'other' and (note is null or char_length(note) < 3) then
    raise exception 'Please tell us what is wrong' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 500 then raise exception 'Keep the note under 500 characters' using errcode = '22023'; end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Daily report limit reached' using errcode = '54000';
  end if;
  if p_kind = 'post' then
    select author_id into owner from public.posts where id = p_id;
    if not found then raise exception 'No such post' using errcode = '22023'; end if;
    if owner = auth.uid() then raise exception 'You cannot report your own post' using errcode = '22023'; end if;
    if exists (select 1 from public.reports where reporter_id = auth.uid() and post_id = p_id) then
      raise exception 'You already reported this' using errcode = '23505'; end if;
    insert into public.reports (reporter_id, post_id, reason, reason_code, reason_note)
    values (auth.uid(), p_id, left(label || coalesce(': ' || note, ''), 1000), p_code, note);
  elsif p_kind = 'comment' then
    select author_id into owner from public.item_comments where id = p_id;
    if not found then raise exception 'No such comment' using errcode = '22023'; end if;
    if owner = auth.uid() then raise exception 'You cannot report your own comment' using errcode = '22023'; end if;
    if not private.can_use_kind((select split_part(item_key, ':', 1) from public.item_comments where id = p_id)) then
      raise exception 'Not allowed: comments on this kind of page are limited to a higher role' using errcode = '42501';
    end if;
    if exists (select 1 from public.reports where reporter_id = auth.uid() and comment_id = p_id) then
      raise exception 'You already reported this' using errcode = '23505'; end if;
    insert into public.reports (reporter_id, comment_id, reason, reason_code, reason_note)
    values (auth.uid(), p_id, left(label || coalesce(': ' || note, ''), 1000), p_code, note);
    -- keeps the flag count moderators already see on comments
    insert into public.comment_flags (comment_id, member_id, reason) values (p_id, auth.uid(), left(label, 300)) on conflict do nothing;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
end $$;
revoke all on function public.report_item(text, bigint, text, text) from public, anon;
grant execute on function public.report_item(text, bigint, text, text) to authenticated;

-- Which of these has the caller already reported? (so the button can say "Reported")
create or replace function public.my_reported(p_kind text, p_ids bigint[])
returns setof bigint language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'post' then r.post_id else r.comment_id end
    from public.reports r
   where r.reporter_id = auth.uid() and private.is_member()
     and case when p_kind = 'post' then r.post_id = any(p_ids) else r.comment_id = any(p_ids) end;
$$;
revoke all on function public.my_reported(text, bigint[]) from public, anon;
grant execute on function public.my_reported(text, bigint[]) to authenticated;

-- The moderator queue: posts and comments together, with the reported text. Reporter name is for moderators only.
create or replace function public.report_queue()
returns table (id bigint, kind text, reporter_name text, reason text, reason_code text, reason_note text, created_at timestamptz,
               post_id bigint, thread_id bigint, comment_id bigint, item_key text, author_name text, body text, hidden boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  return query
  select r.id, case when r.comment_id is null then 'post' else 'comment' end, m.display_name, r.reason, r.reason_code, r.reason_note, r.created_at,
         r.post_id, p.thread_id, r.comment_id, c.item_key,
         coalesce(pa.display_name, ca.display_name), coalesce(p.body, c.body),
         case when r.comment_id is null then p.hidden_at is not null
              else coalesce((select cm.action = 'hide' from public.comment_moderation cm where cm.comment_id = c.id order by cm.id desc limit 1), false) end
    from public.reports r
    left join public.members m on m.id = r.reporter_id
    left join public.posts p on p.id = r.post_id
    left join public.members pa on pa.id = p.author_id
    left join public.item_comments c on c.id = r.comment_id
    left join public.members ca on ca.id = c.author_id
   where r.resolved_at is null
   order by r.id;
end $$;
revoke all on function public.report_queue() from public, anon;
grant execute on function public.report_queue() to authenticated;

-- Count for the "Reports (N open)" button already works (it counts rows in reports); nothing to change there.
