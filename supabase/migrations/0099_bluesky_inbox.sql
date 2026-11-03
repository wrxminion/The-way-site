-- RUN THIS
-- 0099: let the Admin inbox (0098) also hold Bluesky replies and mentions. Needs 0098. Safe to run twice.
-- Bluesky ids are long at:// addresses, so the id limit is raised, and the three values needed to answer a post are stored.
-- Still super admin only; the bsky-inbox Edge Function fills it and holds the app password as a secret.
alter table public.fb_inbox drop constraint if exists fb_inbox_id_check;
alter table public.fb_inbox add constraint fb_inbox_id_check check (char_length(id) <= 300);
alter table public.fb_inbox drop constraint if exists fb_inbox_platform_check;
alter table public.fb_inbox add constraint fb_inbox_platform_check check (platform in ('facebook','bluesky'));
alter table public.fb_inbox add column if not exists ref_cid  text check (ref_cid  is null or char_length(ref_cid)  <= 100);
alter table public.fb_inbox add column if not exists root_uri text check (root_uri is null or char_length(root_uri) <= 300);
alter table public.fb_inbox add column if not exists root_cid text check (root_cid is null or char_length(root_cid) <= 100);
