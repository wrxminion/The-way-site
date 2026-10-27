-- The Way: display names are chosen once, when a member redeems an invitation.
-- After that only an admin can change one, through public.rename_member(), and every
-- change is kept: old and new name in member_name_changes (append-only), a line in the
-- moderation log that every member can read, and the SHA-256 audit chain.
-- Run once in the Supabase SQL editor, after 0002_notify_signups.sql.

begin;

-- 1. Members can no longer rename themselves through the API.
drop policy if exists members_rename_self on public.members;
revoke update on public.members from authenticated, anon;
revoke update (display_name) on public.members from authenticated, anon;

-- 2. Belt and braces: even if a grant or policy is added back by mistake, a signed-in
--    user (or anonymous visitor) cannot change a name directly. The admin function and
--    the owner-run forget_member() run as the database owner, so they still can.
create or replace function private.lock_display_name() returns trigger
language plpgsql as $$
begin
  if new.display_name is distinct from old.display_name
     and current_user in ('authenticated', 'anon') then
    raise exception 'Display names are locked; ask an admin to change yours'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger members_lock_display_name before update of display_name on public.members
  for each row execute function private.lock_display_name();

-- 3. Name history, kept forever.
create table public.member_name_changes (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.members(id),
  old_name    text not null,
  new_name    text not null,
  changed_by  uuid not null references public.members(id),
  reason      text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at  timestamptz not null default now()
);
comment on table public.member_name_changes is 'Append-only history of display-name changes made by admins.';

create trigger member_name_changes_append_only before update or delete on public.member_name_changes
  for each row execute function private.forbid_change();
create trigger member_name_changes_no_truncate before truncate on public.member_name_changes
  for each statement execute function private.forbid_change();
create trigger member_name_changes_audit after insert on public.member_name_changes
  for each row execute function private.audit();

alter table public.member_name_changes enable row level security;
revoke all on public.member_name_changes from anon, authenticated;
grant select on public.member_name_changes to authenticated;
create policy name_changes_admin_read on public.member_name_changes for select to authenticated
  using (private.has_role('admin'));

-- 4. The only way to change a name from the site.
create or replace function public.rename_member(member_id uuid, new_name text, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old text;
  clean text := btrim(new_name);
begin
  perform private.require_role('admin');
  select m.display_name into old from public.members m where m.id = rename_member.member_id for update;
  if not found then raise exception 'No such member' using errcode = '02000'; end if;
  if clean is null or char_length(clean) not between 2 and 40 then
    raise exception 'A display name needs 2 to 40 characters' using errcode = '22023';
  end if;
  if clean = old then raise exception 'That is already their name' using errcode = '22023'; end if;
  update public.members set display_name = clean where id = rename_member.member_id;
  insert into public.member_name_changes (member_id, old_name, new_name, changed_by, reason)
  values (rename_member.member_id, old, clean, auth.uid(), reason);
  insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
  values (auth.uid(), 'rename_member', 'member', rename_member.member_id::text, reason);
end $$;

revoke all on function public.rename_member(uuid, text, text) from public, anon;
grant execute on function public.rename_member(uuid, text, text) to authenticated;

commit;
