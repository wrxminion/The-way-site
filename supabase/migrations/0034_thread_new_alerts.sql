-- The Way: tell the admins about every new Pull a Thread request (Frank, Oct 28 2026). Needs 0030 and 0031. Safe to run twice.
--  1. Every new request puts one bell notice on each active admin's profile (link: the review queue).
--     The notice says only what KIND it is. No text, no link, no sender. Sender identity is never shown to anyone.
--  2. checker_thread_new(): a list for the archiver of new requests with NO private data (number, time, kind, status,
--     website name of a link, score). The archiver worker writes it to a plain file the coordinator can read.

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
create trigger thread_intakes_new_alert after insert on public.thread_intakes for each row execute function private.thread_new_alert();

-- archiver only. Returns requests after p_after_id, oldest first, with nothing private in them.
create or replace function public.checker_thread_new(checker_key text, p_after_id bigint default 0, p_limit int default 100)
returns table (id bigint, created_at timestamptz, kind text, status text, link_site text, times_sent int, score int)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  return query
    select t.id, t.created_at, t.kind, t.status,
           case when t.kind = 'url' then left(lower(substring(t.url from '^https?://([^/?#:]+)')), 80) end,
           (select count(*)::int from public.thread_intakes d where d.dup_key = t.dup_key),
           private.thread_total(private.thread_parts(t))
      from public.thread_intakes t
     where t.id > coalesce(p_after_id, 0)
     order by t.id limit greatest(1, least(coalesce(p_limit, 100), 200));
end $$;
revoke all on function private.thread_new_alert(), public.checker_thread_new(text,bigint,int) from public, anon, authenticated;
grant execute on function public.checker_thread_new(text,bigint,int) to service_role;
