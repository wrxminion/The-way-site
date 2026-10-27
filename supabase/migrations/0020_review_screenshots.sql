-- The Way: screenshots a reviewer attaches to a claim review (private).
--   * Private Storage bucket 'review-screenshots': JPEG only, 1.5 MB cap. The browser re-draws every picture
--     before upload, which drops hidden data (location, device info). The bucket rules below are the backstop.
--   * Files live under <uploader id>/<case>/<claim key>/<random>.jpg. Only the uploader and moderators can
--     read them. Nobody can update or delete (append-only, like the rest of the review record).
--   * Never shown on the public review history.
--   * Who can upload: active moderators and reviewers (admins count as every role). At most 5 per person per claim.
-- Nothing here runs by itself. Paste into the Supabase SQL editor after 0014. Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-screenshots', 'review-screenshots', false, 1536000, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1536000, allowed_mime_types = array['image/jpeg'];

create table if not exists public.review_screenshots (
  id          bigint generated always as identity primary key,
  case_slug   text not null check (case_slug ~ '^[a-z0-9-]{2,80}$'),
  claim_key   text not null check (claim_key ~ '^[0-9a-f]{10}$'),
  uploader_id uuid not null default auth.uid() references public.members(id),
  path        text not null unique check (path ~ '^[0-9a-f-]{36}/[a-z0-9-]{2,80}/[0-9a-f]{10}/[0-9a-zA-Z-]{8,64}\.jpg$'),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  check (split_part(path, '/', 1) = uploader_id::text)
);
alter table public.review_screenshots enable row level security;

create or replace function private.review_shot_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.review_screenshots
      where uploader_id = new.uploader_id and case_slug = new.case_slug and claim_key = new.claim_key) >= 5 then
    raise exception 'At most 5 screenshots per claim';
  end if;
  return new;
end $$;
drop trigger if exists review_shot_limit on public.review_screenshots;
create trigger review_shot_limit before insert on public.review_screenshots
  for each row execute function private.review_shot_limit();

drop policy if exists review_shots_insert on public.review_screenshots;
create policy review_shots_insert on public.review_screenshots for insert to authenticated
  with check (uploader_id = auth.uid() and (private.has_role('moderator') or private.has_role('reviewer')));
drop policy if exists review_shots_read on public.review_screenshots;
create policy review_shots_read on public.review_screenshots for select to authenticated
  using (uploader_id = auth.uid() or private.has_role('moderator'));

grant select, insert on public.review_screenshots to authenticated;
revoke all on public.review_screenshots from anon;

-- Storage rules: upload only into your own folder; read your own or (moderators) any. No update, no delete.
drop policy if exists review_shots_obj_insert on storage.objects;
create policy review_shots_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'review-screenshots' and (storage.foldername(name))[1] = auth.uid()::text
              and (private.has_role('moderator') or private.has_role('reviewer')));
drop policy if exists review_shots_obj_read on storage.objects;
create policy review_shots_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'review-screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or private.has_role('moderator')));
