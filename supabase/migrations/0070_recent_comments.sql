-- RUN THIS
-- 0070: recent comments on articles (and cases, measures) for the members home list. Needs 0021 (item_comments, comment_kinds).
-- Safe to run twice. Same rules as comments_for: members only, only kinds the caller may use (candidate comments stay admin-only
-- while that is the setting), a comment a moderator hid is left out (moderators still see it hidden elsewhere). Never your own.
create or replace function public.recent_comments(p_limit int default 8)
returns table (id bigint, item_key text, kind text, parent_id bigint, author_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member() then raise exception 'Members only' using errcode = '42501'; end if;
  return query
  select c.id, c.item_key, split_part(c.item_key, ':', 1), c.parent_id, m.display_name,
         case when char_length(c.body) > 240 then left(c.body, 240) || '…' else c.body end, c.created_at
    from public.item_comments c
    join public.members m on m.id = c.author_id
   where c.author_id <> auth.uid()
     and private.can_use_kind(split_part(c.item_key, ':', 1))
     and coalesce((select cm.action from public.comment_moderation cm where cm.comment_id = c.id order by cm.id desc limit 1), 'restore') <> 'hide'
   order by c.id desc
   limit least(greatest(coalesce(p_limit, 8), 1), 30);
end $$;
revoke all on function public.recent_comments(int) from public, anon;
grant execute on function public.recent_comments(int) to authenticated;
