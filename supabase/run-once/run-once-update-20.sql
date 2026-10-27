-- run-once-update-20.sql
-- Paste this whole file into the Supabase SQL editor and press Run.
-- 1. Adds "Invite someone to The Way" share links for every member (migration 0007).
-- 2. Stops The Way keeping who invited whom, from now on (also 0007).
-- 3. ONE-TIME CLEAR of who-invited-whom already stored. This is the only deletion in this
--    update. It clears exactly:
--      a. members.invited_by            -> set to NULL for every member
--      b. used-up invitation codes      -> their created_by, note and recipient_email set to NULL
--      c. invitation_redemptions        -> every row deleted (it paired each code with who used it)
--    It does not touch members, roles, posts, findings, or the audit log.
-- Needs run-once-update-17-all.sql to have been run first. Safe to run more than once.
do $$
begin
  if to_regclass('public.research_source_withdrawals') is null then
    raise exception 'Run run-once-update-17-all.sql first. Nothing was changed.';
  end if;
end $$;

-- ===== 1 and 2: migration 0007_member_invites.sql, unchanged =====
-- The Way: any member can invite someone to The Way with a share link.
--   * create_share_link(): one single-use WAY- code, 14 days, for any active member.
--     The person who opens the link registers with their own email.
--   * Limits, enforced here: at most 5 open links per member at a time, 20 per 24 hours.
--     Admins keep create_invitation() for multi-use or longer-lived codes.
--   * Codes stay hashed (private.mint_invitation). No code ever carries a role.
--   * The Way does NOT keep who invited whom (Frank, Oct 15 2026). When a code is used up,
--     its row forgets its maker, note and email lock; members.invited_by is no longer set;
--     no redemption row is written; and invitation updates are no longer audited (the audit
--     chain would otherwise pair "X joined" with "code N, made by Y, was used").
--   * A member sees and can revoke their own open links; moderators and admins see and can
--     revoke any open link (logged in the moderation log).

-- How many links a member may have open, and make per day. To change a limit later,
-- `create or replace` just that function with the new number.
create or replace function private.share_link_open_max() returns int language sql immutable as $$ select 5 $$;
create or replace function private.share_link_daily_max() returns int language sql immutable as $$ select 20 $$;
revoke all on function private.share_link_open_max(), private.share_link_daily_max() from public, anon, authenticated;

-- For the 20-a-day cap: when a member made a link, nothing else. Rows older than a day are dropped.
create table if not exists private.share_link_mints (
  member_id uuid not null,
  made_at   timestamptz not null default now()
);
create index if not exists share_link_mints_member on private.share_link_mints (member_id, made_at);
revoke all on private.share_link_mints from public, anon, authenticated;
-- defence in depth: RLS on with no policies, so only the owner's functions can touch it
alter table private.share_link_mints enable row level security;

create or replace function public.create_share_link(note text default null, recipient_email text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  open_now int;
  today int;
begin
  if not private.is_member() then
    raise exception 'Not allowed: only members can invite people' using errcode = '42501';
  end if;
  if note is not null and char_length(note) > 200 then
    raise exception 'Keep the note under 200 characters' using errcode = '22023';
  end if;
  -- one member at a time, so two quick clicks can't slip past the limits
  perform pg_advisory_xact_lock(hashtext('the_way_share_links'), hashtext(auth.uid()::text));
  delete from private.share_link_mints where made_at < now() - interval '24 hours';
  select count(*) into open_now from public.invitations i
   where i.created_by = auth.uid() and i.revoked_at is null and i.expires_at > now() and i.use_count < i.max_uses;
  select count(*) into today from private.share_link_mints m where m.member_id = auth.uid();
  if open_now >= private.share_link_open_max() then
    raise exception 'You already have % open invitation links. Wait for one to be used, or revoke one, before making another.',
      private.share_link_open_max() using errcode = '54000';
  end if;
  if today >= private.share_link_daily_max() then
    raise exception 'You have made % invitation links in the last 24 hours. Try again tomorrow.',
      private.share_link_daily_max() using errcode = '54000';
  end if;
  insert into private.share_link_mints (member_id) values (auth.uid());
  -- always single-use and 14 days, whatever the caller wants
  return private.mint_invitation(auth.uid(), nullif(btrim(note), ''), 1, 14, recipient_email);
end $$;

-- Joining no longer records who invited whom (see top). Same checks and errors as 0001.
create or replace function public.redeem_invitation(code text, display_name text)
returns public.members language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  me  public.members;
  my_email text := lower(auth.jwt() ->> 'email');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if exists (select 1 from public.members m where m.id = auth.uid()) then
    raise exception 'You are already a member' using errcode = '23505';
  end if;

  select * into inv from public.invitations i
   where i.code_hash = extensions.digest(upper(btrim(code)), 'sha256')
   for update;

  if inv.id is null or inv.revoked_at is not null or inv.expires_at < now()
     or inv.use_count >= inv.max_uses
     or (inv.recipient_email is not null and inv.recipient_email is distinct from my_email) then
    -- one message for every failure, so codes can't be probed
    raise exception 'That invitation code is not valid' using errcode = '22023';
  end if;

  insert into public.members (id, display_name) values (auth.uid(), btrim(display_name))
  returning * into me;
  -- count the use; a used-up code forgets who made it and who it was for
  update public.invitations i set use_count = i.use_count + 1,
         created_by = case when i.use_count + 1 >= i.max_uses then null else i.created_by end,
         note = case when i.use_count + 1 >= i.max_uses then null else i.note end,
         recipient_email = case when i.use_count + 1 >= i.max_uses then null else i.recipient_email end
   where i.id = inv.id;
  return me;
end $$;

-- Audit invitations when they are made, not when they are used or revoked: an update entry
-- (actor = the person joining) next to the member's own join entry would rebuild the chain.
-- Moderator revokes stay in the moderation log.
drop trigger if exists invitations_audit on public.invitations;
create trigger invitations_audit after insert on public.invitations
  for each row execute function private.audit();

-- Revoke: the member who made the link, or a moderator/admin.
create or replace function public.revoke_invitation(invitation_id bigint, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations i where i.id = revoke_invitation.invitation_id;
  if inv.id is null then
    raise exception 'No such invitation' using errcode = '22023';
  end if;
  if inv.created_by = auth.uid() and private.is_member() then
    update public.invitations set revoked_at = now() where id = inv.id and revoked_at is null;
    return;  -- your own link: the audit chain records it; no moderation-log entry
  end if;
  perform private.require_role('moderator');
  update public.invitations set revoked_at = now() where id = inv.id and revoked_at is null;
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'revoke_invitation', 'invitation', inv.id::text, reason);
end $$;

-- Reading invitations: admins and moderators see all; a member sees their own.
drop policy if exists invitations_admin_read on public.invitations;
drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations for select to authenticated
  using (private.has_role('moderator') or (created_by = auth.uid() and private.is_member()));
-- invitation_redemptions keeps its 0001 admin-only policy; nothing writes to it any more.

revoke all on function public.create_share_link(text, text) from public, anon;
grant execute on function public.create_share_link(text, text) to authenticated;
revoke all on function public.revoke_invitation(bigint, text), public.redeem_invitation(text, text) from public, anon;
grant execute on function public.revoke_invitation(bigint, text), public.redeem_invitation(text, text) to authenticated;

-- ===== 3: ONE-TIME CLEAR of who invited whom (see the list at the top) =====
do $$
begin
  update public.members set invited_by = null where invited_by is not null;
  update public.invitations set created_by = null, note = null, recipient_email = null
   where use_count >= max_uses and (created_by is not null or note is not null or recipient_email is not null);
  -- invitation_redemptions is append-only; lift the guard for this one delete, then put it back
  alter table public.invitation_redemptions disable trigger invitation_redemptions_append_only;
  delete from public.invitation_redemptions;
  alter table public.invitation_redemptions enable trigger invitation_redemptions_append_only;
end $$;
