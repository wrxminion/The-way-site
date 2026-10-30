-- RUN THIS
-- Review status could only be saved for /preview/pages and /research. The public label (ai-label.js) also covers the
-- voter guide, news, history cases and the government guide, so changing those landed on "That page address is not valid".
alter table public.content_review drop constraint if exists content_review_path_check;
alter table public.content_review add constraint content_review_path_check check (
  path ~ '^/((preview/pages|research|guide|guide-[a-z]{2}|news|cases)(/[A-Za-z0-9_./-]{0,300})?|how-government-works\.html)$' and path !~ '\.\.');

create or replace function public.content_review_set(p_path text, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  if not private.content_review_can() then raise exception 'Not allowed: your role cannot change review status' using errcode = '42501'; end if;
  if p_path is null or p_path !~ '^/((preview/pages|research|guide|guide-[a-z]{2}|news|cases)(/[A-Za-z0-9_./-]{0,300})?|how-government-works\.html)$' or p_path ~ '\.\.' then raise exception 'Bad page path'; end if;
  if p_status is null or p_status not in ('ai_unchecked','skimmed','read','under_review','confirmed') then raise exception 'Bad status'; end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'Note is too long (300 characters at most)'; end if;
  select status into old from public.content_review where path = p_path;
  if old is null then select default_status into old from public.content_review_settings where id = 1; end if;
  insert into public.content_review (path, status, updated_by) values (p_path, p_status, auth.uid())
    on conflict (path) do update set status = excluded.status, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.content_review_log (path, old_status, new_status, changed_by, note)
    values (p_path, old, p_status, auth.uid(), nullif(btrim(p_note), ''));
end $$;
