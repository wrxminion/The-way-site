-- RUN THIS
-- The Way 0032: Pull a Thread follow-ups. One part; run AFTER 0030 (both parts) and 0031. Safe to run again.
-- The Way: Pull a Thread follow-ups (Frank, Oct 28 2026). Needs 0030 and 0031. Safe to run twice.
-- When an answer takes more than about 30 to 45 seconds, the page offers a follow-up:
--   * a signed-in member presses "Notify me": they get a notification in the site (0031) when there is an answer;
--   * a signed-out visitor leaves an email address and we write back ONCE.
-- Email addresses sit in a table nobody can read from the browser, are used for that one reply, and are then erased.
-- Nothing is emailed by this file. The send step is the thread-followup-mail Edge Function, which does nothing unless
-- Frank switches it on (secret THREAD_MAIL_ON = yes, plus a mail key). The mailing list stays off regardless.

do $guard$
begin
  if to_regclass('public.thread_intakes') is null or to_regprocedure('private.notify(uuid,text,text,text,text,text,text)') is null then
    raise exception 'Stop: run 0030 and 0031 first';
  end if;
end $guard$;

create table if not exists public.thread_followups (
  id          bigint generated always as identity primary key,
  intake_id   bigint not null references public.thread_intakes(id),
  member_id   uuid references public.members(id),
  email       text check (email is null or (char_length(email) between 6 and 254 and email ~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[A-Za-z]{2,}$')),
  created_at  timestamptz not null default now(),
  fulfilled_at timestamptz,
  mail_state  text not null default 'none' check (mail_state in ('none','waiting','sent','failed')),
  check ((member_id is not null) <> (email is not null) or fulfilled_at is not null)
);
comment on table public.thread_followups is 'Who wants to hear back about a Pull a Thread item. Email is erased once used. Never returned to any browser.';
create unique index if not exists thread_followups_member_once on public.thread_followups (intake_id, member_id) where member_id is not null;
create index if not exists thread_followups_waiting on public.thread_followups (mail_state) where mail_state = 'waiting';
revoke all on public.thread_followups from public, anon, authenticated;
alter table public.thread_followups enable row level security;

-- Visitor or member, with the receipt from the submission. A member needs no email.
create or replace function public.thread_follow_up(p_receipt text, p_email text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; em text := nullif(lower(btrim(coalesce(p_email, ''))), ''); me uuid := auth.uid();
begin
  select * into t from public.thread_intakes where receipt_hash = encode(extensions.digest(btrim(coalesce(p_receipt, '')), 'sha256'), 'hex');
  if t.id is null then raise exception 'Unknown receipt' using errcode = '02000'; end if;
  if me is not null and private.is_member() then
    insert into public.thread_followups (intake_id, member_id) values (t.id, me) on conflict do nothing;
    return 'member';
  end if;
  if em is null or em !~ '^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[A-Za-z]{2,}$' or char_length(em) > 254 then
    raise exception 'Enter a full email address, or sign in and use Notify me' using errcode = '22023';
  end if;
  if exists (select 1 from public.thread_followups f where f.intake_id = t.id) then
    raise exception 'A follow-up is already set for this one' using errcode = '22023';
  end if;
  if (select count(*) from public.thread_followups f where f.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many follow-up requests right now. Please try again later.' using errcode = '54000';
  end if;
  insert into public.thread_followups (intake_id, email, mail_state) values (t.id, em, 'waiting');
  return 'email';
end $$;

-- Called when an item is answered or closed. Members get a notification now; email waits for the mail step.
create or replace function private.thread_notify_followups(p_intake bigint, p_headline text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.thread_intakes; f record; link text; body text;
begin
  select * into t from public.thread_intakes where id = p_intake;
  if t.id is null then return; end if;
  link := coalesce((select m->>'path' from jsonb_array_elements(t.matches) m where m->>'kind' <> 'finding' and m->>'path' ~ '^/' limit 1), '/members/pull-a-thread.html');
  body := left(coalesce(t.public_note, '') || case when jsonb_array_length(t.matches) > 0 then ' We may already have: ' ||
            (select string_agg(m->>'title', '; ') from (select m from jsonb_array_elements(t.matches) m limit 3) q) else '' end, 600);
  for f in select * from public.thread_followups where intake_id = p_intake and fulfilled_at is null for update loop
    if f.member_id is not null then
      perform private.notify(f.member_id, 'thread_reply', p_headline, nullif(btrim(body), ''), link, 'thread_intake', p_intake::text);
      update public.thread_followups set fulfilled_at = now() where id = f.id;
    else
      update public.thread_followups set mail_state = 'waiting' where id = f.id and mail_state = 'none';
    end if;
  end loop;
end $$;

-- hook it to the queue: when the archiver finds what we already have, and when a reviewer closes an item
create or replace function private.thread_followup_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('accepted','needs_evidence','duplicate','declined','answered') and old.status is distinct from new.status then
    perform private.thread_notify_followups(new.id, case new.status when 'accepted' then 'Your thread was accepted: we will research it'
      when 'needs_evidence' then 'Your thread needs more evidence' when 'duplicate' then 'Your thread matches one we already have'
      when 'declined' then 'An update on your thread' else 'We answered your thread' end);
  elsif new.enrich_status = 'done' and old.enrich_status is distinct from 'done' and jsonb_array_length(new.matches) > jsonb_array_length(old.matches) then
    perform private.thread_notify_followups(new.id, 'We found something on your thread');
  end if;
  return new;
end $$;
drop trigger if exists thread_intakes_followup on public.thread_intakes;
create trigger thread_intakes_followup after update on public.thread_intakes for each row execute function private.thread_followup_trigger();

-- Mail step (service role only): the Edge Function asks what is due, sends one plain message each, then reports.
create or replace function public.mail_due_thread_followups(p_limit int default 20)
returns table (followup_id bigint, email text, headline text, body text, link text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select f.id, f.email,
           case t.status when 'accepted' then 'Your thread was accepted: we will research it' when 'needs_evidence' then 'Your thread needs more evidence'
                when 'duplicate' then 'Your thread matches one we already have' when 'declined' then 'An update on your thread'
                when 'answered' then 'We answered your thread' else 'We found something on your thread' end,
           left(coalesce(t.public_note, '') || case when jsonb_array_length(t.matches) > 0 then ' We may already have: ' ||
                (select string_agg(m->>'title', '; ') from (select m from jsonb_array_elements(t.matches) m limit 3) q) else '' end, 600),
           coalesce((select m->>'path' from jsonb_array_elements(t.matches) m where m->>'kind' <> 'finding' and m->>'path' ~ '^/' limit 1), '/members/pull-a-thread.html')
      from public.thread_followups f join public.thread_intakes t on t.id = f.intake_id
     where f.mail_state = 'waiting' and f.email is not null
       and (t.status in ('accepted','needs_evidence','duplicate','declined','answered') or (t.enrich_status = 'done' and jsonb_array_length(t.matches) > 0))
     order by f.id limit greatest(1, least(coalesce(p_limit, 20), 50));
end $$;

create or replace function public.mail_thread_followup_result(p_followup bigint, p_sent boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_sent then
    update public.thread_followups set mail_state = 'sent', fulfilled_at = now(), email = null where id = p_followup;
  else
    update public.thread_followups set mail_state = 'failed' where id = p_followup;
  end if;
end $$;

-- Nobody keeps an address for long: anything unsent after 30 days is erased.
create or replace function public.mail_expire_thread_followups() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.thread_followups set email = null, fulfilled_at = coalesce(fulfilled_at, now()), mail_state = 'failed'
   where email is not null and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.thread_notify_followups(bigint,text), private.thread_followup_trigger(), public.thread_follow_up(text,text),
  public.mail_due_thread_followups(int), public.mail_thread_followup_result(bigint,boolean), public.mail_expire_thread_followups()
  from public, anon, authenticated;
grant execute on function public.thread_follow_up(text,text) to anon, authenticated;
grant execute on function public.mail_due_thread_followups(int), public.mail_thread_followup_result(bigint,boolean), public.mail_expire_thread_followups() to service_role;

-- Check: every row must say ok.
select 'addresses never readable from the browser' as check_name,
       case when exists (select 1 from pg_class where relname = 'thread_followups' and relrowsecurity)
             and not has_table_privilege('anon','public.thread_followups','select') and not has_table_privilege('authenticated','public.thread_followups','select') then 'ok' else 'WRONG' end as result
union all
select 'visitors can ask for one follow-up',
       case when has_function_privilege('anon','public.thread_follow_up(text,text)','execute') then 'ok' else 'WRONG' end
union all
select 'only the mail step can read what is due',
       case when has_function_privilege('service_role','public.mail_due_thread_followups(int)','execute')
             and not has_function_privilege('anon','public.mail_due_thread_followups(int)','execute')
             and not has_function_privilege('authenticated','public.mail_due_thread_followups(int)','execute') then 'ok' else 'WRONG' end
union all
select 'queue changes raise follow-ups',
       case when exists (select 1 from pg_trigger where tgname = 'thread_intakes_followup') then 'ok' else 'MISSING' end;
