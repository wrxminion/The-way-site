-- RUN THIS
-- 0075: Pull a Thread, the AI dive flow after "Accept". Needs 0073 and 0074. Safe to run twice. Deletes nothing.
-- Steps the sender sees: Accepted > Sent to research > AI dive running > Dive done > With a researcher > Finished.
-- research_state now also takes: sent, diving, dive_done, with_researcher ('researching' still means Accepted, waiting).
-- A reviewer sends an accepted item to research (send_thread_to_research). A local-model worker on the archiver computer claims it (dive_claim_next),
-- writes a DRAFT (dive_complete) labelled "Unchecked", and a researcher takes it (take_thread_research) and finishes it with the
-- existing finish_thread_research. The draft is shown only to reviewers and researchers, never to the sender, never public.
-- The sender is never named to reviewers: nothing here returns submitter_id. The worker functions are for the service role only.

alter table public.thread_intakes drop constraint if exists thread_intakes_research_state_check;
alter table public.thread_intakes add constraint thread_intakes_research_state_check
  check (research_state is null or research_state in ('researching','sent','diving','dive_done','with_researcher','finished'));
alter table public.thread_intakes add column if not exists research_taker uuid;

alter table public.thread_intake_events drop constraint if exists thread_intake_events_event_type_check;
alter table public.thread_intake_events add constraint thread_intake_events_event_type_check
  check (event_type in ('picked','released','priority','disposition','disputed','project','research_done','decision_changed','sent_to_research','dive_done','researcher_took'));

create table if not exists public.thread_dives (
  id          bigserial primary key,
  intake_id   bigint not null references public.thread_intakes(id),
  status      text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  ai_label    text not null default 'Unchecked' check (ai_label = 'Unchecked'),
  model       text,
  draft       text check (draft is null or char_length(draft) <= 20000),
  attempts    int not null default 0,
  next_try_at timestamptz not null default now(),
  error       text,
  requested_by uuid,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index if not exists thread_dives_intake on public.thread_dives (intake_id, id desc);
create index if not exists thread_dives_queue on public.thread_dives (next_try_at) where status in ('queued','running');
alter table public.thread_dives enable row level security;
revoke all on public.thread_dives from public, anon, authenticated;
revoke all on sequence public.thread_dives_id_seq from public, anon, authenticated;

-- reviewers and researchers
create or replace function private.may_research() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.may_triage() or private.has_role('researcher');
$$;
revoke all on function private.may_research() from public, anon;
grant execute on function private.may_research() to authenticated;

-- if the decision changes away from "accepted", the research steps stop (0074 only reset 'researching'); queued dives are cancelled, nothing is deleted
create or replace function private.thread_research_stop() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' and new.research_state in ('sent','diving','dive_done','with_researcher') then
    new.research_state := null;
    update public.thread_dives set status = 'cancelled', finished_at = now() where intake_id = new.id and status in ('queued','running');
  end if;
  return new;
end $$;
drop trigger if exists thread_intakes_research_stop on public.thread_intakes;
create trigger thread_intakes_research_stop before update on public.thread_intakes for each row execute function private.thread_research_stop();
revoke all on function private.thread_research_stop() from public, anon, authenticated;

-- reviewers: push an accepted item to research (also "dive again" after a failed or unwanted dive)
create or replace function public.send_thread_to_research(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := nullif(btrim(p_reason), ''); t public.thread_intakes;
begin
  if not private.may_triage() then raise exception 'Not allowed: reviewers only' using errcode = '42501'; end if;
  if r is null or char_length(r) not between 3 and 1000 then raise exception 'Say why (3 to 1000 characters)' using errcode = '22023'; end if;
  select * into t from public.thread_intakes x where x.id = p_id for update;
  if t.id is null or t.status <> 'accepted' then raise exception 'Only accepted items can be sent to research' using errcode = '22023'; end if;
  if t.research_state = 'finished' then raise exception 'Research on this item is already finished' using errcode = '22023'; end if;
  if t.research_state = 'diving' then raise exception 'The AI dive is running now' using errcode = '22023'; end if;
  if t.research_state = 'with_researcher' then raise exception 'A researcher already has this item' using errcode = '22023'; end if;
  if exists (select 1 from public.thread_dives d where d.intake_id = p_id and d.status in ('queued','running')) then
    raise exception 'Already waiting for the AI dive' using errcode = '22023';
  end if;
  update public.thread_intakes set research_state = 'sent' where id = p_id;
  insert into public.thread_dives (intake_id, requested_by) values (p_id, auth.uid());
  insert into public.thread_intake_events (intake_id, event_type, reason, actor_id) values (p_id, 'sent_to_research', r, auth.uid());
end $$;

-- worker (service role): take the next waiting dive. Stale "running" dives (over 60 minutes) are picked up again.
create or replace function public.dive_claim_next() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.thread_dives; t public.thread_intakes;
begin
  select * into d from public.thread_dives x
   where (x.status = 'queued' and x.next_try_at <= now()) or (x.status = 'running' and x.started_at < now() - interval '60 minutes')
   order by x.id limit 1 for update skip locked;
  if d.id is null then return null; end if;
  select * into t from public.thread_intakes x where x.id = d.intake_id;
  if t.status <> 'accepted' then
    update public.thread_dives set status = 'cancelled', finished_at = now() where id = d.id;
    return jsonb_build_object('skip', true, 'dive', d.id);
  end if;
  update public.thread_dives set status = 'running', started_at = now(), attempts = attempts + 1 where id = d.id;
  update public.thread_intakes set research_state = 'diving' where id = t.id and research_state in ('sent','diving');
  return jsonb_build_object('dive', d.id, 'intake', t.id, 'kind', t.kind, 'url', t.url, 'question', t.question, 'note', t.note);
end $$;

-- worker: the draft is finished. It is saved as "Unchecked"; the item moves to "dive done".
create or replace function public.dive_complete(p_dive bigint, p_model text, p_draft text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.thread_dives; s text := nullif(btrim(p_draft), '');
begin
  if s is null or char_length(s) > 20000 then raise exception 'Draft must be 1 to 20000 characters' using errcode = '22023'; end if;
  select * into d from public.thread_dives x where x.id = p_dive for update;
  if d.id is null or d.status <> 'running' then raise exception 'That dive is not running' using errcode = '22023'; end if;
  update public.thread_dives set status = 'done', model = left(p_model, 80), draft = s, error = null, finished_at = now() where id = d.id;
  update public.thread_intakes set research_state = 'dive_done' where id = d.intake_id and status = 'accepted' and research_state in ('sent','diving');
  insert into public.thread_intake_events (intake_id, event_type, reason) values (d.intake_id, 'dive_done', 'AI draft saved, unchecked');
end $$;

-- worker: the dive failed. Retries after 15 minutes up to 3 tries, then it stays "sent" and a reviewer can send it again or hand it to a researcher.
create or replace function public.dive_fail(p_dive bigint, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.thread_dives;
begin
  select * into d from public.thread_dives x where x.id = p_dive for update;
  if d.id is null or d.status <> 'running' then return; end if;
  if d.attempts >= 3 then
    update public.thread_dives set status = 'failed', error = left(p_error, 500), finished_at = now() where id = d.id;
    update public.thread_intakes set research_state = 'sent' where id = d.intake_id and research_state = 'diving';
  else
    update public.thread_dives set status = 'queued', error = left(p_error, 500), next_try_at = now() + interval '15 minutes' where id = d.id;
    update public.thread_intakes set research_state = 'sent' where id = d.intake_id and research_state = 'diving';
  end if;
end $$;

-- reviewers and researchers: take the item (after the dive, or without one)
create or replace function public.take_thread_research(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  if not private.may_research() then raise exception 'Not allowed: reviewers and researchers only' using errcode = '42501'; end if;
  select * into t from public.thread_intakes x where x.id = p_id for update;
  if t.id is null or t.status <> 'accepted' then raise exception 'Only accepted items can be taken' using errcode = '22023'; end if;
  if t.research_state not in ('sent','dive_done') then raise exception 'Send it to research first, or wait for the AI dive to finish' using errcode = '22023'; end if;
  update public.thread_intakes set research_state = 'with_researcher', research_taker = auth.uid() where id = p_id;
  update public.thread_dives set status = 'cancelled', finished_at = now() where intake_id = p_id and status = 'queued';
  insert into public.thread_intake_events (intake_id, event_type, reason, actor_id) values (p_id, 'researcher_took', 'With a researcher', auth.uid());
end $$;

-- reviewers and researchers: the newest AI draft for an item. Never public, never shown to the sender.
create or replace function public.get_thread_dive(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d public.thread_dives;
begin
  if not private.may_research() then raise exception 'Not allowed: reviewers and researchers only' using errcode = '42501'; end if;
  select * into d from public.thread_dives x where x.intake_id = p_id order by x.id desc limit 1;
  if d.id is null then return null; end if;
  return jsonb_build_object('status', d.status, 'label', d.ai_label, 'model', d.model, 'draft', d.draft, 'tries', d.attempts, 'error', d.error,
                            'finished', d.finished_at);
end $$;

-- the accepted list, now with the step and the dive status. Everything not finished is "in progress".
drop function if exists public.list_accepted_threads(text);
create or replace function public.list_accepted_threads(p_include text default 'researching')
returns table (id bigint, kind text, url text, question text, note text, resolved_at timestamptz, research_state text, research_done_at timestamptz,
               research_note text, project_id bigint, project_title text, public_note text, dive_status text, dive_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.may_research() then raise exception 'Not allowed: reviewers and researchers only' using errcode = '42501'; end if;
  return query
    select t.id, t.kind, t.url, t.question, t.note, t.resolved_at, t.research_state, t.research_done_at, t.research_note,
           t.project_id, (select p.title from public.research_projects p where p.id = t.project_id), t.public_note,
           (select d.status from public.thread_dives d where d.intake_id = t.id order by d.id desc limit 1),
           (select d.ai_label from public.thread_dives d where d.intake_id = t.id and d.status = 'done' order by d.id desc limit 1)
      from public.thread_intakes t
     where t.status = 'accepted' and (p_include = 'all' or t.research_state is distinct from 'finished')
     order by (t.research_state is distinct from 'finished') desc, t.resolved_at desc nulls last, t.id desc
     limit 200;
end $$;

-- finishing: reviewers and researchers (0073 allowed reviewers only); same rules and the same sender notice
create or replace function public.finish_thread_research(p_id bigint, p_summary text, p_link text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; s text := nullif(btrim(p_summary), ''); lk text := nullif(btrim(p_link), ''); m uuid;
begin
  if not private.may_research() then raise exception 'Not allowed: reviewers and researchers only' using errcode = '42501'; end if;
  if s is null or char_length(s) not between 3 and 500 or s ~ '[<>]' then raise exception 'Say what we found (3 to 500 characters, no < or >)' using errcode = '22023'; end if;
  if lk is not null and lk !~ '^/[A-Za-z0-9/_#.?=&%-]{0,250}$' then raise exception 'The link must be a page on this site, like /research/' using errcode = '22023'; end if;
  select * into t from public.thread_intakes x where x.id = p_id for update;
  if t.id is null or t.status <> 'accepted' then raise exception 'Only accepted items can be finished' using errcode = '22023'; end if;
  if t.research_state = 'finished' then raise exception 'Research on this item is already finished' using errcode = '22023'; end if;
  if t.research_state = 'diving' then raise exception 'The AI dive is still running' using errcode = '22023'; end if;
  update public.thread_intakes set research_state = 'finished', research_done_at = now(), research_note = s where id = p_id;
  update public.thread_dives set status = 'cancelled', finished_at = now() where intake_id = p_id and status = 'queued';
  insert into public.thread_intake_events (intake_id, event_type, reason, actor_id) values (p_id, 'research_done', s, auth.uid());
  for m in select t.submitter_id where t.submitter_id is not null
           union select f.member_id from public.thread_followups f where f.intake_id = p_id and f.member_id is not null loop
    perform private.notify(m, 'thread_reply', 'Our research on your thread is done', s, coalesce(lk, '/members/pull-a-thread.html?thread=' || p_id), 'thread_research', p_id::text);
  end loop;
end $$;

-- the sender: which of the six steps the item is on. No draft, no names.
create or replace function public.my_thread_research(p_intake bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.thread_intakes;
begin
  select * into t from public.thread_intakes x where x.id = p_intake and (x.submitter_id = auth.uid()
     or exists (select 1 from public.thread_followups f where f.intake_id = x.id and f.member_id = auth.uid()));
  if t.id is null or t.research_state is null then return null; end if;
  return jsonb_build_object('state', t.research_state, 'done', t.research_done_at::date, 'note', t.research_note,
    'step', case t.research_state when 'researching' then 1 when 'sent' then 2 when 'diving' then 3 when 'dive_done' then 4 when 'with_researcher' then 5 else 6 end);
end $$;

revoke all on function public.send_thread_to_research(bigint,text), public.take_thread_research(bigint), public.get_thread_dive(bigint),
  public.list_accepted_threads(text), public.finish_thread_research(bigint,text,text), public.my_thread_research(bigint) from public, anon;
grant execute on function public.send_thread_to_research(bigint,text), public.take_thread_research(bigint), public.get_thread_dive(bigint),
  public.list_accepted_threads(text), public.finish_thread_research(bigint,text,text), public.my_thread_research(bigint) to authenticated;
revoke all on function public.dive_claim_next(), public.dive_complete(bigint,text,text), public.dive_fail(bigint,text) from public, anon, authenticated;
grant execute on function public.dive_claim_next(), public.dive_complete(bigint,text,text), public.dive_fail(bigint,text) to service_role;

select 'ai_dive_flow' as what, case when to_regprocedure('public.dive_claim_next()') is not null and to_regclass('public.thread_dives') is not null
  and to_regprocedure('public.send_thread_to_research(bigint,text)') is not null then 'ok' else 'MISSING' end as result;
