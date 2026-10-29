-- RUN THIS
-- 0047: public "Submit your art" page. Artists send a name for credit, an optional portfolio link (shown with the credit if the art is used), an email for review only, what the art is for, and an
-- image or a link. Needs 0001 (private.has_role). Independent of the other numbers. Safe to run twice.
-- Nothing here is readable from the browser: only the Edge Function (service role) writes, and only administrators read.
-- The email is for review only: it is never added to a list and never used for mail. Delete it once the review is done.

do $guard$
begin
  if to_regprocedure('private.has_role(text)') is null then raise exception 'Stop: run 0001 first'; end if;
end $guard$;

create table if not exists public.art_submissions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  receipt     text not null unique,
  credit_name text not null check (char_length(credit_name) between 1 and 80),
  email       text not null check (char_length(email) between 5 and 200),
  target      text not null check (char_length(target) between 1 and 200),
  portfolio   text check (portfolio is null or (portfolio ~ '^https://' and char_length(portfolio) <= 500)),
  link        text check (link is null or (link ~ '^https://' and char_length(link) <= 500)),
  file_path   text,
  file_bytes  integer,
  note        text check (note is null or char_length(note) <= 500),
  consent     boolean not null check (consent),
  status      text not null default 'new' check (status in ('new','in_review','accepted','declined','used')),
  rate_key    text not null,
  check (link is not null or file_path is not null)
);
comment on table public.art_submissions is 'Art offered for our banners. Credit name is shown only if used. Email is for review only: never a mailing list; delete it when the review is done. No direct access from the API except administrators reading.';
create index if not exists art_submissions_rate on public.art_submissions (rate_key, created_at);
alter table public.art_submissions enable row level security;
revoke all on public.art_submissions from public, anon, authenticated;
grant select on public.art_submissions to authenticated;
drop policy if exists art_submissions_admin on public.art_submissions;
create policy art_submissions_admin on public.art_submissions for select to authenticated using (private.has_role('admin'));

-- private bucket for the uploaded images (8 MB). Only administrators can read; uploads come from the Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('art-submissions', 'art-submissions', false, 8388608, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists art_submissions_obj_read on storage.objects;
create policy art_submissions_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'art-submissions' and private.has_role('admin'));

-- The one write path. Limits: 3 per sender per day, 60 per day for the whole site.
create or replace function public.submit_art(p_name text, p_email text, p_target text, p_link text, p_portfolio text, p_file_path text,
  p_file_bytes integer, p_note text, p_rate_key text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_receipt text := encode(extensions.gen_random_bytes(5), 'hex');
begin
  if (select count(*) from public.art_submissions where rate_key = p_rate_key and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You have sent a few already today. Please try again tomorrow.' using errcode = '54000';
  end if;
  if (select count(*) from public.art_submissions where created_at > now() - interval '1 day') >= 60 then
    raise exception 'We have a lot of art today. Please try again tomorrow.' using errcode = '54000';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null or nullif(btrim(coalesce(p_target, '')), '') is null
     or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please fill in your name, a working email and what the art is for.' using errcode = '22023';
  end if;
  if p_link is null and p_file_path is null then
    raise exception 'Add an image or a link to your art.' using errcode = '22023';
  end if;
  if (p_link is not null and p_link !~ '^https://') or (p_portfolio is not null and p_portfolio !~ '^https://') then
    raise exception 'Links must start with https://' using errcode = '22023';
  end if;
  insert into public.art_submissions (receipt, credit_name, email, target, link, portfolio, file_path, file_bytes, note, consent, rate_key)
  values (v_receipt, btrim(p_name), btrim(p_email), btrim(p_target), p_link, p_portfolio, p_file_path, p_file_bytes, nullif(btrim(coalesce(p_note, '')), ''), true, p_rate_key);
  return v_receipt;
end $$;
revoke all on function public.submit_art(text,text,text,text,text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.submit_art(text,text,text,text,text,text,integer,text,text) to service_role;

-- Check: all lines must say ok.
select 'table exists' as item, case when to_regclass('public.art_submissions') is not null then 'ok' else 'FAIL' end as result
union all select 'anon cannot read', case when not has_table_privilege('anon', 'public.art_submissions', 'select') then 'ok' else 'FAIL' end
union all select 'members cannot write', case when not has_table_privilege('authenticated', 'public.art_submissions', 'insert') then 'ok' else 'FAIL' end
union all select 'anon cannot call', case when not has_function_privilege('anon', 'public.submit_art(text,text,text,text,text,text,integer,text,text)', 'execute') then 'ok' else 'FAIL' end
union all select 'bucket is private', case when exists (select 1 from storage.buckets where id = 'art-submissions' and not public) then 'ok' else 'FAIL' end;
