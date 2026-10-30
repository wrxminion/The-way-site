-- RUN THIS
-- 0074: Pull a Thread, change a decision after the fact. Needs 0073. Safe to run twice. Deletes nothing.
-- An admin can switch a closed item (accepted, needs more evidence, answered, declined) to another decision, or put it back in the
-- waiting queue, with a reason. The old decision stays in the item's History; each change is one more History line.
-- Who may do it is decided in one place, private.may_change_thread_decision(). Today: admin and super admin. Add a role there later.

alter table public.thread_intake_events drop constraint if exists thread_intake_events_event_type_check;
alter table public.thread_intake_events add constraint thread_intake_events_event_type_check
  check (event_type in ('picked','released','priority','disposition','disputed','project','research_done','decision_changed'));

create or replace function private.may_change_thread_decision() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('admin') or private.has_role('super_admin');
$$;

create or replace function public.can_change_thread_decision() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.may_change_thread_decision();
$$;

-- p_to: accepted, needs_evidence, answered, declined, or queued (reopen). p_tell_sender: also send the sender a bell notice.
create or replace function public.change_thread_decision(p_id bigint, p_to text, p_reason text, p_public_note text default null, p_tell_sender boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; r text := nullif(btrim(p_reason), ''); pn text := nullif(btrim(p_public_note), ''); m uuid; head text;
begin
  if not private.may_change_thread_decision() then raise exception 'Not allowed: admins only' using errcode = '42501'; end if;
  if p_to not in ('accepted','needs_evidence','answered','declined','queued') then raise exception 'Unknown decision' using errcode = '22023'; end if;
  if r is null or char_length(r) not between 3 and 900 then raise exception 'Say why (3 to 900 characters)' using errcode = '22023'; end if;
  if pn is not null and (char_length(pn) > 500 or pn ~ '[<>]') then raise exception 'The note for the sender is up to 500 characters, no < or >' using errcode = '22023'; end if;
  select * into t from public.thread_intakes x where x.id = p_id for update;
  if t.id is null then raise exception 'Unknown item' using errcode = '02000'; end if;
  if t.status not in ('accepted','needs_evidence','answered','declined') then raise exception 'Only a closed item can be changed' using errcode = '22023'; end if;
  if t.status = p_to then raise exception 'It already has that decision' using errcode = '22023'; end if;
  update public.thread_intakes
     set status = p_to,
         resolved_at = case when p_to = 'queued' then null else now() end,
         claimed_by = case when p_to = 'queued' then null else claimed_by end,
         claimed_at = case when p_to = 'queued' then null else claimed_at end,
         public_note = case when p_to = 'queued' then public_note else pn end,
         research_state = case when t.status = 'accepted' and research_state = 'researching' then null else research_state end
   where id = p_id;
  insert into public.thread_intake_events (intake_id, event_type, disposition, reason, actor_id)
  values (p_id, 'decision_changed', case when p_to = 'queued' then null else p_to end, left('Was ' || t.status || ', now ' || p_to || ': ' || r, 1000), auth.uid());
  if p_tell_sender and p_to <> 'queued' then
    head := case p_to when 'accepted' then 'Your thread was accepted: we will research it' when 'needs_evidence' then 'Your thread needs more evidence'
                      when 'answered' then 'We answered your thread' else 'An update on your thread' end;
    for m in select t.submitter_id where t.submitter_id is not null
             union select f.member_id from public.thread_followups f where f.intake_id = p_id and f.member_id is not null loop
      perform private.notify(m, 'thread_reply', 'Your thread has an update', left(head || '. ' || coalesce(pn, ''), 600),
                             '/members/pull-a-thread.html?thread=' || p_id, 'thread_change', p_id::text || ':' || extract(epoch from now())::bigint);
    end loop;
  end if;
end $$;

revoke all on function private.may_change_thread_decision() from public, anon, authenticated;
revoke all on function public.can_change_thread_decision(), public.change_thread_decision(bigint,text,text,text,boolean) from public, anon;
grant execute on function public.can_change_thread_decision(), public.change_thread_decision(bigint,text,text,text,boolean) to authenticated;

select 'change_thread_decision' as what, case when to_regprocedure('public.change_thread_decision(bigint,text,text,text,boolean)') is not null then 'ok' else 'MISSING' end as result;
