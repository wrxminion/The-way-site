-- run-once-update-21.sql
-- Paste into the Supabase SQL editor and press Run. Safe to run more than once.
-- One change: turn on row-level security for private.share_link_mints (the 20-a-day counter
-- from update 20). No policies are added, so no browser client can ever read or write it;
-- the invite functions still can, because they run as the table's owner.
-- (The table already had no grants to anon or authenticated, and the private schema is not
-- exposed through the Supabase API. This is a second lock, not a fix for an open door.)
alter table private.share_link_mints enable row level security;
