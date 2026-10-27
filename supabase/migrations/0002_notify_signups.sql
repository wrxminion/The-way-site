-- The Way: "notify me" email list from the public splash page.
-- Run once in the Supabase SQL editor, after 0001_member_area.sql.
--
-- The public page never touches the table directly. It calls public.notify_signup(),
-- which always answers the same way whether the address is new, already listed or
-- rate-limited, so nobody can use the form to test whether someone signed up.
-- Only admins can read the list (Commons admin page).

begin;

create table public.notify_signups (
  id          bigint generated always as identity primary key,
  email       text not null unique
              check (char_length(email) between 6 and 254
                     and email = lower(email)
                     and email ~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  source      text not null default 'splash' check (source ~ '^[a-z0-9-]{1,40}$'),
  ip_hash     text,   -- SHA-256 of the sender's IP, only for rate limiting; never the IP itself
  created_at  timestamptz not null default now()
);
comment on table public.notify_signups is 'People who asked to be told when The Way launches. Written only through notify_signup(); read only by admins.';
create index notify_signups_ip_recent on public.notify_signups (ip_hash, created_at);

alter table public.notify_signups enable row level security;
revoke all on public.notify_signups from anon, authenticated;
grant select, delete on public.notify_signups to authenticated;

create policy notify_admin_read on public.notify_signups for select to authenticated
  using (private.has_role('admin'));
-- removal on request (someone asks to be taken off the list)
create policy notify_admin_delete on public.notify_signups for delete to authenticated
  using (private.has_role('admin'));

create or replace function public.notify_signup(email text, source text default 'splash')
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean text := lower(btrim(coalesce(notify_signup.email, '')));
  src   text := lower(btrim(coalesce(notify_signup.source, 'splash')));
  ip    text;
  iph   text;
begin
  -- PostgREST passes the request headers; behind Supabase the first X-Forwarded-For entry is the visitor
  begin
    ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then ip := '';
  end;
  iph := case when btrim(ip) <> '' then encode(extensions.digest(btrim(ip), 'sha256'), 'hex') end;

  if char_length(clean) > 254
     or clean !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;
  if src !~ '^[a-z0-9-]{1,40}$' then src := 'splash'; end if;

  -- rate sanity: 5 an hour per address of origin, 300 an hour overall; extra requests are quietly dropped
  if iph is not null and (select count(*) from public.notify_signups n
                          where n.ip_hash = iph and n.created_at > now() - interval '1 hour') >= 5 then
    return;
  end if;
  if (select count(*) from public.notify_signups n where n.created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.notify_signups (email, source, ip_hash) values (clean, src, iph)
  on conflict on constraint notify_signups_email_key do nothing;
end $$;

revoke all on function public.notify_signup(text, text) from public;
grant execute on function public.notify_signup(text, text) to anon, authenticated;

commit;
