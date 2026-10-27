-- 0012: admins (the founder) have no cap on share links. Everyone else keeps 5 open and 20 a day.
--   Only create_share_link() changes: the two limit checks are skipped when the caller has the
--   admin role. Links stay single-use and 14 days. Nothing else is touched.

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
  if not private.has_role('admin') and open_now >= private.share_link_open_max() then
    raise exception 'You already have % open invitation links. Wait for one to be used, or revoke one, before making another.',
      private.share_link_open_max() using errcode = '54000';
  end if;
  if not private.has_role('admin') and today >= private.share_link_daily_max() then
    raise exception 'You have made % invitation links in the last 24 hours. Try again tomorrow.',
      private.share_link_daily_max() using errcode = '54000';
  end if;
  insert into private.share_link_mints (member_id) values (auth.uid());  -- admins are logged but never capped
  -- always single-use and 14 days, whatever the caller wants
  return private.mint_invitation(auth.uid(), nullif(btrim(note), ''), 1, 14, recipient_email);
end $$;

revoke all on function public.create_share_link(text, text) from public, anon;
grant execute on function public.create_share_link(text, text) to authenticated;
