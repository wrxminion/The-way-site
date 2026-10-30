-- RUN THIS
-- 0073: Pull a Thread, what happens after "Accept: we will research it". Needs 0030 to 0037. Safe to run twice. Deletes nothing.
-- 1. An accepted item is marked "researching" on its own and shows in a reviewer list (list_accepted_threads).
-- 2. A reviewer can attach it to a research project (set_thread_project) and later finish it (finish_thread_research).
-- 3. Finishing writes a short note and sends the sender a bell notice that links to the item (my_thread_research gives it to the item page).
-- The sender is never named to reviewers; no function here returns submitter_id.

alter table public.thread_intakes add column if not exists research_state text;
alter table public.thread_intakes add column if not exists research_done_at timestamptz;
alter table public.thread_intakes add column if not exists research_note text;
alter table public.thread_intakes drop constraint if exists thread_intakes_research_state_check;
alter table public.thread_intakes add constraint thread_intakes_research_state_check check (research_state is null or research_state in ('researching','finished'));
alter table public.thread_intakes drop constraint if exists thread_intakes_research_note_check;
alter table public.thread_intakes add constraint thread_intakes_research_note_check check (research_note is null or (char_length(research_note) <= 500 and research_note !~ '[<>]'));

alter table public.thread_intake_events drop constraint if exists thread_intake_events_event_type_check;
alter table public.thread_intake_events add constraint thread_intake_events_event_type_check
  check (event_type in ('picked','released','priority','disposition','disputed','project','research_done'));

-- items already accepted before this change start as "researching"
update public.thread_intakes set research_state = 'researching' where status = 'accepted' and research_state is null;

-- an item that becomes accepted is "researching" from that moment
create or replace function private.thread_research_start() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.research_state is null then
    new.research_state := 'researching';
  end if;
  return new;
end $$;
drop trigger if exists thread_intakes_research_start on public.thread_intakes;
create trigger thread_intakes_research_start before update on public.thread_intakes for each row execute function private.thread_research_start();

-- reviewers: the accepted items, researching first
create or replace function public.list_accepted_threads(p_include text default 'researching')
returns table (id bigint, kind text, url text, question text, note text, resolved_at timestamptz, research_state text, research_done_at timestamptz,
               research_note text, project_id bigint, project_title text, public_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  return query
    select t.id, t.kind, t.url, t.question, t.note, t.resolved_at, t.research_state, t.research_done_at, t.research_note,
           t.project_id, (select p.title from public.research_projects p where p.id = t.project_id), t.public_note
      from public.thread_intakes t
     where t.status = 'accepted' and (p_include = 'all' or t.research_state = 'researching')
     order by (t.research_state = 'researching') desc, t.resolved_at desc nulls last, t.id desc
     limit 200;
end $$;

-- reviewers: attach (or move) an accepted item to a research project
create or replace function public.set_thread_project(p_id bigint, p_project bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), '');
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  if r is null or char_length(r) not between 3 and 1000 then raise exception 'Say why (3 to 1000 characters)' using errcode = '22023'; end if;
  if not exists (select 1 from public.research_projects where id = p_project and active) then raise exception 'Unknown project' using errcode = '22023'; end if;
  if not exists (select 1 from public.thread_intakes where id = p_id and status = 'accepted') then raise exception 'Only accepted items can join a project' using errcode = '22023'; end if;
  update public.thread_intakes set project_id = p_project where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, reason, actor_id) values (p_id, 'project', r, auth.uid());
end $$;

-- reviewers: research is finished; say what we found, tell the sender
create or replace function public.finish_thread_research(p_id bigint, p_summary text, p_link text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; s text := nullif(btrim(p_summary), ''); lk text := nullif(btrim(p_link), ''); m uuid;
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  if s is null or char_length(s) not between 3 and 500 or s ~ '[<>]' then raise exception 'Say what we found (3 to 500 characters, no < or >)' using errcode = '22023'; end if;
  if lk is not null and lk !~ '^/[A-Za-z0-9/_#.?=&%-]{0,250}$' then raise exception 'The link must be a page on this site, like /research/' using errcode = '22023'; end if;
  select * into t from public.thread_intakes x where x.id = p_id for update;
  if t.id is null or t.status <> 'accepted' then raise exception 'Only accepted items can be finished' using errcode = '22023'; end if;
  if t.research_state = 'finished' then raise exception 'Research on this item is already finished' using errcode = '22023'; end if;
  update public.thread_intakes set research_state = 'finished', research_done_at = now(), research_note = s where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, reason, actor_id) values (p_id, 'research_done', s, auth.uid());
  for m in select t.submitter_id where t.submitter_id is not null
           union select f.member_id from public.thread_followups f where f.intake_id = p_id and f.member_id is not null loop
    perform private.notify(m, 'thread_reply', 'Our research on your thread is done', s, coalesce(lk, '/members/pull-a-thread.html?thread=' || p_id), 'thread_research', p_id::text);
  end loop;
end $$;

-- the sender (or a member who asked to be told): research state for the item page
create or replace function public.my_thread_research(p_intake bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes x where x.id = p_intake and (x.submitter_id = auth.uid()
     or exists (select 1 from public.thread_followups f where f.intake_id = x.id and f.member_id = auth.uid()));
  if t.id is null or t.research_state is null then return null; end if;
  return jsonb_build_object('state', t.research_state, 'done', t.research_done_at::date, 'note', t.research_note);
end $$;

revoke all on function private.thread_research_start() from public, anon, authenticated;
revoke all on function public.list_accepted_threads(text), public.set_thread_project(bigint,bigint,text), public.finish_thread_research(bigint,text,text),
  public.my_thread_research(bigint) from public, anon;
grant execute on function public.list_accepted_threads(text), public.set_thread_project(bigint,bigint,text), public.finish_thread_research(bigint,text,text),
  public.my_thread_research(bigint) to authenticated;

select 'thread_research' as what, case when to_regprocedure('public.finish_thread_research(bigint,text,text)') is not null
  and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'thread_intakes' and column_name = 'research_state') = 1
  then 'ok' else 'MISSING' end as result;
