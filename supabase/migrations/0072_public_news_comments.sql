-- RUN THIS
-- 0072 Public news comments: anyone can read, members post, an AI check runs first, people can appeal to a reviewer.
-- Needs 0021 (comments + read checks). Safe to run twice. Deletes nothing. Existing comments stay visible as they are.
--
-- THE RULES (Frank, Oct 30):
--   * Reading is public for news comments. Posting is for signed-in members. No scores, no likes, no points.
--   * Every new news comment is checked by an AI first (language, on topic, "alleged" for unproven conduct, private info,
--     asking for votes, spam). The check runs on our own computer with a local model, not in the cloud.
--       pass            -> published (members past the new-member stage) or held for a person (new members)
--       reject          -> the writer is told why, and can appeal once to a reviewer
--       unsure / down   -> held for a reviewer. If the checker has not answered in ai_timeout_minutes, a reviewer can approve it.
--   * New members CAN comment. Their first comments are held until a human reviewer approves them
--     (new_member_hold_count published comments, default 3). Everyone who was a member when this file ran is approved.
--   * A news thread opens once a member has read the article (open_rule). The reader's read note can be the first comment,
--     only if the reader chooses to post it (post_read_note).
--   * Every tunable is in comment_settings (one place). A super admin changes one with set_comment_setting.
--   * Nothing is deleted. States are an append-only history (comment_states). Hidden/rejected text stays stored.
--   * The checker's two functions (ai_queue, ai_record_verdict) can only be called with the service key, never by a visitor.

do $$ begin
  if to_regclass('public.item_comments') is null or to_regclass('public.comment_kinds') is null then
    raise exception 'Run 0021 (comments) first';
  end if;
  if to_regclass('public.read_checks') is null then raise exception 'Run 0021 (read checks) first'; end if;
end $$;

-- ---------------------------------------------------------------- 1. settings in one place
create table if not exists public.comment_settings (
  key        text primary key,
  value      text not null,
  note       text not null,
  updated_at timestamptz not null default now()
);
alter table public.comment_settings enable row level security;
revoke all on public.comment_settings from public, anon, authenticated;

insert into public.comment_settings (key, value, note) values
  ('ai_review',            'on',                  'on or off. Off = comments skip the AI check (new members are still held for a person).'),
  ('ai_timeout_minutes',   '30',                  'If the AI check has not answered after this many minutes, a reviewer can approve or reject the comment.'),
  ('open_rule',            'read_check_submitted','When a news thread opens: always, read_check_submitted (a member recorded that they read it), or read_check_accepted (a reviewer confirmed it).'),
  ('new_member_hold_count','3',                   'A member needs this many published comments before their comments publish without a person. 0 = nobody is held.'),
  ('established_before',   to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'Members who joined before this moment count as approved. Set when 0072 first ran.'),
  ('default_order',        'oldest',              'oldest or newest. The page lets readers switch.'),
  ('appeal_allowed',       'on',                  'on or off. Whether a writer can appeal an AI rejection to a reviewer.')
on conflict (key) do nothing;

create or replace function private.setting(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value from public.comment_settings where key = p_key;
$$;
revoke all on function private.setting(text) from public, anon, authenticated;

create or replace function public.set_comment_setting(p_key text, p_value text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := btrim(coalesce(p_value, ''));
begin
  perform private.require_role('super_admin');
  if char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Give a reason' using errcode = '22023'; end if;
  if not exists (select 1 from public.comment_settings where key = p_key) then raise exception 'Unknown setting' using errcode = '22023'; end if;
  if p_key in ('ai_review','appeal_allowed') and v not in ('on','off') then raise exception 'Use on or off' using errcode = '22023'; end if;
  if p_key = 'open_rule' and v not in ('always','read_check_submitted','read_check_accepted') then raise exception 'Use always, read_check_submitted or read_check_accepted' using errcode = '22023'; end if;
  if p_key = 'default_order' and v not in ('oldest','newest') then raise exception 'Use oldest or newest' using errcode = '22023'; end if;
  if p_key in ('ai_timeout_minutes','new_member_hold_count') and (v !~ '^[0-9]{1,4}$' or (p_key = 'ai_timeout_minutes' and v::int < 1)) then raise exception 'Use a whole number' using errcode = '22023'; end if;
  if p_key = 'established_before' and v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z$' then raise exception 'Use a UTC time like 2026-10-30T17:00:00Z' using errcode = '22023'; end if;
  update public.comment_settings set value = v, updated_at = now() where key = p_key;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'comment_setting_' || p_key || '_' || left(v, 40), 'comment_kind', 'setting:' || p_key, btrim(p_reason));
end $$;
revoke all on function public.set_comment_setting(text, text, text) from public, anon;
grant execute on function public.set_comment_setting(text, text, text) to authenticated;

-- ---------------------------------------------------------------- 2. per-kind switches: public read, and "checked first"
alter table public.comment_kinds add column if not exists public_read boolean not null default false;
alter table public.comment_kinds add column if not exists reviewed boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comment_kinds_public_needs_member') then
    -- a kind limited to a higher role (candidate) can never be public by accident
    alter table public.comment_kinds add constraint comment_kinds_public_needs_member
      check (not public_read or (min_role = 'member' and kind <> 'candidate'));
  end if;
end $$;
update public.comment_kinds set public_read = true, reviewed = true where kind = 'news' and public_read = false and reviewed = false;

create or replace function public.set_comment_kind_public(p_kind text, p_public boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role('super_admin');
  if char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Give a reason' using errcode = '22023'; end if;
  update public.comment_kinds set public_read = p_public where kind = p_kind;
  if not found then raise exception 'Unknown kind' using errcode = '22023'; end if;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), case when p_public then 'comments_public_on' else 'comments_public_off' end, 'comment_kind', p_kind, btrim(p_reason));
end $$;
revoke all on function public.set_comment_kind_public(text, boolean, text) from public, anon;
grant execute on function public.set_comment_kind_public(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 3. comment history (append-only)
alter table public.item_comments add column if not exists tag text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'item_comments_tag_ok') then
    alter table public.item_comments add constraint item_comments_tag_ok check (tag is null or tag = 'read_note');
  end if;
end $$;

create table if not exists public.comment_states (
  id          bigint generated always as identity primary key,
  comment_id  bigint not null references public.item_comments(id),
  state       text not null check (state in ('queued','published','held','ai_rejected','appealed','rejected')),
  actor       text not null check (actor in ('system','ai','member','reviewer')),
  actor_id    uuid references public.members(id),
  reason_code text check (reason_code is null or reason_code in
                ('language','off_topic','alleged','private_info','votes','spam','other','new_member','ai_unsure','ai_down','appeal','reviewer')),
  reason      text check (reason is null or char_length(reason) <= 1000),
  model       text check (model is null or char_length(model) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists comment_states_comment on public.comment_states (comment_id, id desc);
create index if not exists comment_states_open on public.comment_states (state, created_at);
alter table public.comment_states enable row level security;
revoke all on public.comment_states from public, anon, authenticated;
do $$ begin
  execute 'drop trigger if exists comment_states_append_only on public.comment_states';
  execute 'create trigger comment_states_append_only before update or delete on public.comment_states for each row execute function private.forbid_change()';
  execute 'drop trigger if exists comment_states_no_truncate on public.comment_states';
  execute 'create trigger comment_states_no_truncate before truncate on public.comment_states for each statement execute function private.forbid_change()';
end $$;

-- latest state; comments with no history (written before 0072) count as published
create or replace function private.comment_state(p_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.state from public.comment_states s where s.comment_id = p_id order by s.id desc limit 1), 'published');
$$;
revoke all on function private.comment_state(bigint) from public, anon, authenticated;

create or replace function private.reason_text(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case p_code
    when 'language'     then 'It insults, threatens or demeans someone.'
    when 'off_topic'    then 'It does not seem to be about this article.'
    when 'alleged'      then 'It states something unproven about a named person as fact. Say "alleged", or point to the court record or a primary source.'
    when 'private_info' then 'It shares private information such as an address, phone number or email.'
    when 'votes'        then 'It asks for votes for or against a candidate or party.'
    when 'spam'         then 'It looks like spam or an ad.'
    when 'other'        then 'The automatic check flagged it.'
    else null end;
$$;

create or replace function private.is_reviewer_plus() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('reviewer') or private.has_role('moderator');
$$;
revoke all on function private.is_reviewer_plus() from public, anon, authenticated;

-- A member is "approved" if they joined before 'established_before' or already have enough published comments.
create or replace function private.is_established(p_member uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare need int := coalesce(nullif(private.setting('new_member_hold_count'), '')::int, 3);
        cutoff timestamptz := coalesce(nullif(private.setting('established_before'), '')::timestamptz, now());
begin
  if need <= 0 then return true; end if;
  if exists (select 1 from public.members m where m.id = p_member and m.joined_at < cutoff) then return true; end if;
  return (select count(*) from public.item_comments c where c.author_id = p_member and private.comment_state(c.id) = 'published') >= need;
end $$;
revoke all on function private.is_established(uuid) from public, anon, authenticated;

create or replace function private.try_notify(p_member uuid, p_title text, p_body text, p_link text, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('private.notify(uuid,text,text,text,text,text,text)') is not null then
    execute 'select private.notify($1,$2,$3,$4,$5,$6,$7)' using p_member, 'comment_review', p_title, left(coalesce(p_body,''), 200), p_link, 'comment', p_ref;
  end if;
exception when others then null;   -- a notice problem must never block a review
end $$;
revoke all on function private.try_notify(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. is the thread open?
create or replace function private.thread_open(p_item text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare rule text := coalesce(private.setting('open_rule'), 'read_check_submitted');
begin
  if not coalesce((select k.reviewed from public.comment_kinds k where k.kind = split_part(p_item, ':', 1)), false) then return true; end if;
  if rule = 'always' then return true; end if;
  if exists (select 1 from public.item_comments c where c.item_key = p_item and private.comment_state(c.id) = 'published') then return true; end if;  -- old threads stay open
  if rule = 'read_check_accepted' then
    return exists (select 1 from public.read_checks r join public.read_check_signoffs s on s.check_id = r.id and s.decision = 'accepted' where r.item_key = p_item);
  end if;
  return exists (select 1 from public.read_checks r where r.item_key = p_item);
end $$;
revoke all on function private.thread_open(text) from public, anon, authenticated;

-- Public: is this thread open, and what is the rule? (the page shows the right message)
create or replace function public.thread_status(p_item text)
returns table (open boolean, rule text, read_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_item !~ '^news:[a-z0-9][a-z0-9._-]{0,119}$' then raise exception 'Bad item id' using errcode = '22023'; end if;
  return query select private.thread_open(p_item), coalesce(private.setting('open_rule'), 'read_check_submitted'),
    (select count(*)::int from public.read_checks r join public.read_check_signoffs s on s.check_id = r.id and s.decision = 'accepted' where r.item_key = p_item);
end $$;
revoke all on function public.thread_status(text) from public;
grant execute on function public.thread_status(text) to anon, authenticated;

-- ---------------------------------------------------------------- 5. posting (replaces 0021 post_comment; same signature)
create or replace function private.insert_comment(p_item text, p_body text, p_parent bigint, p_tag text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare k text := split_part(p_item, ':', 1); par public.item_comments; new_id bigint; reviewed boolean;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if p_item !~ '^(news|case|measure|candidate):[a-z0-9][a-z0-9._-]{0,119}$' then
    raise exception 'Bad item id' using errcode = '22023';
  end if;
  if not exists (select 1 from public.comment_kinds where kind = k and enabled) then
    raise exception 'Comments are off for this kind of page' using errcode = '42501';
  end if;
  if not private.can_use_kind(k) then raise exception 'Not allowed: comments on this kind of page are limited to a higher role' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 3 then raise exception 'Write a little more' using errcode = '22023'; end if;
  if char_length(p_body) > 2000 then raise exception 'At most 2000 characters' using errcode = '22023'; end if;
  select ck.reviewed into reviewed from public.comment_kinds ck where ck.kind = k;
  if p_parent is not null then
    select * into par from public.item_comments where id = p_parent;
    if par.id is null or par.item_key <> p_item then raise exception 'That reply does not match this page' using errcode = '22023'; end if;
    if par.parent_id is not null then raise exception 'Replies go one level deep' using errcode = '22023'; end if;
    if private.comment_state(par.id) <> 'published' and par.author_id <> auth.uid() then
      raise exception 'That comment is not open for replies' using errcode = '22023';
    end if;
  end if;
  if p_tag is null and p_parent is null and not private.thread_open(p_item) then
    raise exception 'Comments open once a member has read this article. Record what you found first.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('comment_rate_' || auth.uid()::text));
  if (select count(*) from public.item_comments where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Slow down: 6 comments an hour' using errcode = '54000';
  end if;
  if (select count(*) from public.item_comments where author_id = auth.uid() and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Daily limit: 30 comments a day' using errcode = '54000';
  end if;
  insert into public.item_comments (item_key, parent_id, author_id, body, tag)
  values (p_item, p_parent, auth.uid(), btrim(p_body), p_tag) returning id into new_id;
  if reviewed then
    insert into public.comment_states (comment_id, state, actor) values (new_id, 'queued', 'system');
    if coalesce(private.setting('ai_review'), 'on') = 'off' then
      perform private.after_ai_pass(new_id, null);
    end if;
  end if;
  return new_id;
end $$;
revoke all on function private.insert_comment(text, text, bigint, text) from public, anon, authenticated;

create or replace function public.post_comment(p_item text, p_body text, p_parent bigint default null)
returns bigint language sql security definer set search_path = '' as $$
  select private.insert_comment(p_item, p_body, p_parent, null);
$$;
revoke all on function public.post_comment(text, text, bigint) from public, anon;
grant execute on function public.post_comment(text, text, bigint) to authenticated;

-- The reader chooses to share their read note as a comment. Only if they recorded a read check on this article. Once.
create or replace function public.post_read_note(p_item text, p_body text)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if p_item !~ '^news:[a-z0-9][a-z0-9._-]{0,119}$' then raise exception 'Bad item id' using errcode = '22023'; end if;
  if not exists (select 1 from public.read_checks where member_id = auth.uid() and item_key = p_item) then
    raise exception 'Record that you read the article first' using errcode = '22023';
  end if;
  if exists (select 1 from public.item_comments where author_id = auth.uid() and item_key = p_item and tag = 'read_note') then
    raise exception 'You already shared your read note here' using errcode = '23505';
  end if;
  return private.insert_comment(p_item, p_body, null, 'read_note');
end $$;
revoke all on function public.post_read_note(text, text) from public, anon;
grant execute on function public.post_read_note(text, text) to authenticated;

-- AI passed (or AI step switched off): publish, or hold for a person if the writer is a new member.
create or replace function private.after_ai_pass(p_id bigint, p_model text) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  select author_id into a from public.item_comments where id = p_id;
  if private.is_established(a) then
    insert into public.comment_states (comment_id, state, actor, model) values (p_id, 'published', case when p_model is null then 'system' else 'ai' end, p_model);
  else
    insert into public.comment_states (comment_id, state, actor, reason_code, reason, model)
    values (p_id, 'held', case when p_model is null then 'system' else 'ai' end, 'new_member', 'New member: held until a person approves it', p_model);
  end if;
end $$;
revoke all on function private.after_ai_pass(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 6. the AI checker (service key only)
create or replace function public.ai_queue(p_limit int default 10)
returns table (id bigint, item_key text, body text, parent_body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.item_key, c.body, p.body, c.created_at
    from public.item_comments c
    left join public.item_comments p on p.id = c.parent_id
   where private.comment_state(c.id) = 'queued'
   order by c.id
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
revoke all on function public.ai_queue(int) from public, anon, authenticated;
grant execute on function public.ai_queue(int) to service_role;

create or replace function public.ai_record_verdict(p_id bigint, p_verdict text, p_code text default null, p_model text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.comment_state(p_id) <> 'queued' then raise exception 'Not waiting for a check' using errcode = '22023'; end if;
  if not exists (select 1 from public.comment_states where comment_id = p_id) then raise exception 'No such comment' using errcode = '22023'; end if;
  if p_verdict = 'pass' then
    perform private.after_ai_pass(p_id, left(p_model, 80));
  elsif p_verdict = 'reject' then
    if private.reason_text(p_code) is null then p_code := 'other'; end if;
    insert into public.comment_states (comment_id, state, actor, reason_code, reason, model)
    values (p_id, 'ai_rejected', 'ai', p_code, private.reason_text(p_code), left(p_model, 80));
    perform private.try_notify((select author_id from public.item_comments where id = p_id),
      'Your comment was not posted', private.reason_text(p_code) || ' You can appeal to a reviewer.', '/members/discuss.html', p_id::text);
  elsif p_verdict = 'hold' then
    insert into public.comment_states (comment_id, state, actor, reason_code, reason, model)
    values (p_id, 'held', 'ai', 'ai_unsure', 'The automatic check was not sure', left(p_model, 80));
  else
    raise exception 'Unknown verdict' using errcode = '22023';
  end if;
end $$;
revoke all on function public.ai_record_verdict(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_record_verdict(bigint, text, text, text) to service_role;

-- ---------------------------------------------------------------- 7. appeals and reviewer decisions
create or replace function public.appeal_comment(p_id bigint, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if coalesce(private.setting('appeal_allowed'), 'on') <> 'on' then raise exception 'Appeals are switched off' using errcode = '42501'; end if;
  if not exists (select 1 from public.item_comments where id = p_id and author_id = auth.uid()) then raise exception 'Not your comment' using errcode = '42501'; end if;
  if private.comment_state(p_id) <> 'ai_rejected' then raise exception 'Only a comment the automatic check declined can be appealed' using errcode = '22023'; end if;
  if note is not null and char_length(note) > 500 then raise exception 'Keep the note under 500 characters' using errcode = '22023'; end if;
  insert into public.comment_states (comment_id, state, actor, actor_id, reason_code, reason)
  values (p_id, 'appealed', 'member', auth.uid(), 'appeal', note);
end $$;
revoke all on function public.appeal_comment(bigint, text) from public, anon;
grant execute on function public.appeal_comment(bigint, text) to authenticated;

-- The reviewer queue: appeals first, then held comments, then comments the checker never answered. Never your own.
create or replace function public.comment_review_queue(max_rows int default 60)
returns table (id bigint, item_key text, parent_id bigint, author_name text, body text, created_at timestamptz,
               state text, reason_code text, reason text, appeal_note text, author_is_new boolean)
language plpgsql stable security definer set search_path = '' as $$
declare tmo int := coalesce(nullif(private.setting('ai_timeout_minutes'), '')::int, 30);
begin
  if not private.is_reviewer_plus() then raise exception 'Reviewers only' using errcode = '42501'; end if;
  return query
  with cur as (
    select distinct on (s.comment_id) s.comment_id, s.state, s.reason_code, s.reason, s.created_at as since
      from public.comment_states s order by s.comment_id, s.id desc)
  select c.id, c.item_key, c.parent_id, m.display_name, c.body, c.created_at,
         case when cur.state = 'queued' then 'ai_timeout' else cur.state end,
         cur.reason_code,
         case when cur.state = 'appealed' then (select x.reason from public.comment_states x where x.comment_id = c.id and x.state = 'ai_rejected' order by x.id desc limit 1) else cur.reason end,
         case when cur.state = 'appealed' then cur.reason end,
         not private.is_established(c.author_id)
    from cur
    join public.item_comments c on c.id = cur.comment_id
    join public.members m on m.id = c.author_id
   where c.author_id <> auth.uid()
     and (cur.state in ('held','appealed') or (cur.state = 'queued' and cur.since < now() - make_interval(mins => tmo)))
   order by (cur.state = 'appealed') desc, c.id
   limit greatest(1, least(coalesce(max_rows, 60), 200));
end $$;
revoke all on function public.comment_review_queue(int) from public, anon;
grant execute on function public.comment_review_queue(int) to authenticated;

create or replace function public.review_comment(p_id bigint, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare st text; since timestamptz; a uuid; tmo int := coalesce(nullif(private.setting('ai_timeout_minutes'), '')::int, 30);
        why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_reviewer_plus() then raise exception 'Reviewers only' using errcode = '42501'; end if;
  select author_id into a from public.item_comments where id = p_id;
  if a is null then raise exception 'No such comment' using errcode = '22023'; end if;
  if a = auth.uid() then raise exception 'You cannot review your own comment' using errcode = '42501'; end if;
  select s.state, s.created_at into st, since from public.comment_states s where s.comment_id = p_id order by s.id desc limit 1;
  if not (st in ('held','appealed') or (st = 'queued' and since < now() - make_interval(mins => tmo))) then
    raise exception 'This comment is not waiting for a reviewer' using errcode = '22023';
  end if;
  if not p_approve and (why is null or char_length(why) < 3) then raise exception 'Give the writer a short reason' using errcode = '22023'; end if;
  if why is not null and char_length(why) > 500 then raise exception 'Keep the reason under 500 characters' using errcode = '22023'; end if;
  insert into public.comment_states (comment_id, state, actor, actor_id, reason_code, reason)
  values (p_id, case when p_approve then 'published' else 'rejected' end, 'reviewer', auth.uid(), 'reviewer', why);
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), case when p_approve then 'approve_comment' else 'reject_comment' end, 'comment', p_id::text,
          coalesce(why, 'Approved by a reviewer'));
  perform private.try_notify(a, case when p_approve then 'Your comment is posted' else 'Your comment was not posted' end,
    coalesce(why, 'A reviewer approved it.'), '/members/discuss.html', p_id::text);
end $$;
revoke all on function public.review_comment(bigint, boolean, text) from public, anon;
grant execute on function public.review_comment(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 8. members' view of a thread (replaces 0021 comments_for; adds status columns)
drop function if exists public.comments_for(text);
create function public.comments_for(p_item text)
returns table (id bigint, parent_id bigint, author_id uuid, author_name text, body text, created_at timestamptz,
               hidden boolean, hidden_reason text, flags int, mine boolean,
               state text, state_reason text, tag text)
language plpgsql stable security definer set search_path = '' as $$
declare mod boolean;
begin
  if not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if not private.can_use_kind(split_part(p_item, ':', 1)) then
    raise exception 'Not allowed: comments on this kind of page are limited to a higher role' using errcode = '42501';
  end if;
  mod := private.has_role('moderator');
  return query
  select c.id, c.parent_id, c.author_id, m.display_name,
         case when s.action = 'hide' and not mod then null else c.body end,
         c.created_at,
         coalesce(s.action = 'hide', false),
         case when s.action = 'hide' then s.reason end,
         case when mod then (select count(*)::int from public.comment_flags f where f.comment_id = c.id) else 0 end,
         c.author_id = auth.uid(),
         private.comment_state(c.id),
         case when c.author_id = auth.uid() or mod then (select x.reason from public.comment_states x where x.comment_id = c.id order by x.id desc limit 1) end,
         c.tag
    from public.item_comments c
    join public.members m on m.id = c.author_id
    left join lateral (select cm.action, cm.reason from public.comment_moderation cm
                        where cm.comment_id = c.id order by cm.id desc limit 1) s on true
   where c.item_key = p_item
     and (private.comment_state(c.id) = 'published' or c.author_id = auth.uid())
   order by c.id
   limit 500;
end $$;
revoke all on function public.comments_for(text) from public, anon;
grant execute on function public.comments_for(text) to authenticated;

-- ---------------------------------------------------------------- 9. the public view (signed out can read)
-- Only published comments. A hidden comment shows no text and no reason. No member ids, flags or reporters.
create or replace function public.public_comments_for(p_item text)
returns table (id bigint, parent_id bigint, author_name text, body text, created_at timestamptz, hidden boolean, tag text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_item !~ '^(news|case|measure|candidate):[a-z0-9][a-z0-9._-]{0,119}$' then raise exception 'Bad item id' using errcode = '22023'; end if;
  if not exists (select 1 from public.comment_kinds k where k.kind = split_part(p_item, ':', 1)
                    and k.enabled and k.public_read and k.min_role = 'member') then
    raise exception 'Not public' using errcode = '42501';
  end if;
  return query
  select c.id, c.parent_id, m.display_name,
         case when s.action = 'hide' then null else c.body end,
         c.created_at, coalesce(s.action = 'hide', false), c.tag
    from public.item_comments c
    join public.members m on m.id = c.author_id
    left join lateral (select cm.action from public.comment_moderation cm where cm.comment_id = c.id order by cm.id desc limit 1) s on true
   where c.item_key = p_item and private.comment_state(c.id) = 'published'
   order by c.id
   limit 500;
end $$;
revoke all on function public.public_comments_for(text) from public;
grant execute on function public.public_comments_for(text) to anon, authenticated;

-- Counts for the "(N) comments" link. Shown comments only (published, not hidden). Pass ids, or null for every news item with comments.
create or replace function public.public_comment_counts(p_items text[] default null)
returns table (item_key text, n int)
language sql stable security definer set search_path = '' as $$
  select c.item_key, count(*)::int
    from public.item_comments c
   where c.item_key like 'news:%'
     and exists (select 1 from public.comment_kinds k where k.kind = 'news' and k.enabled and k.public_read and k.min_role = 'member')
     and (p_items is null or c.item_key = any(p_items))
     and private.comment_state(c.id) = 'published'
     and coalesce((select cm.action from public.comment_moderation cm where cm.comment_id = c.id order by cm.id desc limit 1), 'restore') <> 'hide'
   group by c.item_key
   limit 5000;
$$;
revoke all on function public.public_comment_counts(text[]) from public;
grant execute on function public.public_comment_counts(text[]) to anon, authenticated;

-- Public page settings the page needs (order default, whether appeals exist). Nothing sensitive.
create or replace function public.comment_page_settings()
returns table (default_order text, appeal_allowed boolean, open_rule text)
language sql stable security definer set search_path = '' as $$
  select coalesce(private.setting('default_order'), 'oldest'), coalesce(private.setting('appeal_allowed'), 'on') = 'on',
         coalesce(private.setting('open_rule'), 'read_check_submitted');
$$;
revoke all on function public.comment_page_settings() from public;
grant execute on function public.comment_page_settings() to anon, authenticated;
