-- 0107: Pull a Thread: the "New Pull a Thread request" notice shows the item's title (Frank, Nov 7 2026).
-- Needs 0030, 0031, 0033 and 0035. Safe to run twice.
--   * The notice heading now reads like: New Pull a Thread request · item 14 · "Massie Says 218 Signatures Are..."
--   * The title uses the same rules as the reviewers' queue (site/members/thread-queue.js, itemTitle): a link uses the
--     page's own title with a trailing " | Site name" dropped, else the words in its address, else the site name; a
--     question uses its own words; a screenshot uses the first line of its text. Nothing is made up and no AI is used.
--   * A link's page title is read a little after the link is sent. When it arrives (or the screenshot text is
--     corrected), the notices already sent for that item get the new title.
--   * Notices already in members' lists get a title now, from what each item holds today.
--   * The body ("Someone sent a link. It is waiting in the queue.") is not changed. Only admins get these notices.
--   * A problem making a title never stops a request from being sent: the heading falls back to the old wording.

-- the item's title, cut at a word to p_max characters. Notices allow no < or >, so those are removed.
create or replace function private.thread_item_title(p_kind text, p_url text, p_question text, p_page_title text,
                                                     p_ocr text, p_max int default 76)
returns text language plpgsql immutable set search_path = '' as $$
declare
  t text := '';
  host text;
  seg text;
  words text[];
  cut text;
  sp int;
begin
  if p_kind = 'url' then
    t := btrim(regexp_replace(coalesce(p_page_title, ''), '\s+', ' ', 'g'));
    t := regexp_replace(t, '\s+\|\s+[^|]{1,40}$', '');   -- drop a trailing " | Site name"
    if t = '' then t := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g')); end if;
    if t = '' and coalesce(p_url, '') ~* '^https?://[^/?#]+' then
      host := regexp_replace(substring(p_url from '^[A-Za-z]+://([^/?#:]+)'), '^www\.', '', 'i');
      seg := coalesce(substring(p_url from '^[A-Za-z]+://[^/?#]+(/[^?#]*)'), '');
      seg := coalesce((select s from unnest(string_to_array(seg, '/')) with ordinality u(s, n) where s <> '' order by n desc limit 1), '');
      seg := replace(regexp_replace(seg, '\.[A-Za-z0-9]{2,5}$', ''), '%20', ' ');
      select array_agg(w order by n) into words
        from unnest(regexp_split_to_array(seg, '[-_+\s]+')) with ordinality u(w, n)
       where w <> '' and w !~ '^\d{5,}$';
      if (select count(*) from unnest(coalesce(words, '{}'::text[])) w where w ~ '[A-Za-z]') >= 3
        then t := array_to_string(words, ' ');
        else t := coalesce(host, '');
      end if;
    end if;
  elsif p_kind = 'question' then
    t := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  else
    t := coalesce((select l from unnest(string_to_array(coalesce(p_ocr, ''), E'\n')) with ordinality u(l, n)
                    where btrim(l) <> '' order by n limit 1), coalesce(p_question, ''));
    t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  end if;
  t := btrim(translate(t, '<>', ''));
  if char_length(t) <= p_max then return t; end if;
  cut := left(t, p_max);
  sp := char_length(cut) - strpos(reverse(cut), ' ') + 1;
  if strpos(cut, ' ') > 0 and sp > p_max / 2 then cut := left(cut, sp - 1); end if;
  return regexp_replace(cut, '[\s,;:.]+$', '') || '...';
end $$;

-- the notice heading for one item: New Pull a Thread request · item 14 · "Title"
create or replace function private.thread_notice_heading(p_id bigint, p_kind text, p_url text, p_question text,
                                                         p_page_title text, p_ocr text)
returns text language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  t := private.thread_item_title(p_kind, p_url, p_question, p_page_title, p_ocr, 76);
  return left('New Pull a Thread request · item ' || p_id::text || case when t <> '' then ' · ' || chr(8220) || t || chr(8221) else '' end, 120);
exception when others then
  return 'New Pull a Thread request';
end $$;

-- admins are alerted when a request is SENT, not when a draft is made (same as 0035, now with the title)
create or replace function private.thread_new_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; head text;
begin
  head := private.thread_notice_heading(new.id, new.kind, new.url, new.question, new.page_title, coalesce(new.ocr_text_fixed, new.ocr_text));
  for m in select distinct r.member_id from public.member_roles r join public.members x on x.id = r.member_id
            where x.status = 'active' and r.role in ('admin','super_admin')
  loop
    perform private.notify(m.member_id, 'thread_new', head,
      case new.kind when 'url' then 'Someone sent a link.' when 'screenshot' then 'Someone sent a screenshot.' else 'Someone sent a question.' end
        || case when new.status = 'matched' then ' We already had something related.' else ' It is waiting in the queue.' end,
      '/members/thread-queue.html', 'thread_new', new.id::text);
  end loop;
  return new;
end $$;

-- when the page title arrives, or the text is corrected, the notices already sent for that item get the new title
create or replace function private.thread_notice_retitle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.member_notifications n
     set title = private.thread_notice_heading(new.id, new.kind, new.url, new.question, new.page_title, coalesce(new.ocr_text_fixed, new.ocr_text))
   where n.kind = 'thread_new' and n.source_type = 'thread_new' and n.source_id = new.id::text;
  return new;
exception when others then return new;   -- a notice problem must never block the item
end $$;
drop trigger if exists thread_intakes_notice_retitle on public.thread_intakes;
create trigger thread_intakes_notice_retitle after update of page_title, ocr_text, ocr_text_fixed, question on public.thread_intakes
  for each row when (new.page_title is distinct from old.page_title or new.ocr_text is distinct from old.ocr_text
                     or new.ocr_text_fixed is distinct from old.ocr_text_fixed or new.question is distinct from old.question)
  execute function private.thread_notice_retitle();

revoke all on function private.thread_item_title(text,text,text,text,text,int), private.thread_notice_heading(bigint,text,text,text,text,text),
  private.thread_new_alert(), private.thread_notice_retitle() from public, anon, authenticated;

-- notices already sent get a title from what each item holds now
update public.member_notifications n
   set title = private.thread_notice_heading(t.id, t.kind, t.url, t.question, t.page_title, coalesce(t.ocr_text_fixed, t.ocr_text))
  from public.thread_intakes t
 where n.kind = 'thread_new' and n.source_type = 'thread_new' and n.source_id = t.id::text;

-- check: every line should say ok
select 'title rules' as what,
  case when private.thread_item_title('question', null, 'Did the county approve the jail contract?', null, null) = 'Did the county approve the jail contract?'
        and private.thread_item_title('url', 'https://www.example.org/news/city-council-votes-on-water-rates-1830474', null, null, null) = 'city council votes on water rates'
        and private.thread_item_title('url', 'https://example.org/p?id=7', null, 'Short | Example News', null) = 'Short'
        and private.thread_item_title('url', 'https://www.example.org/', null, null, null) = 'example.org'
        and private.thread_item_title('screenshot', null, null, null, E'\n  Senator says <b>\nmore') = 'Senator says b'
       then 'ok' else 'FAIL' end
union all select 'new-request notices with a title',
  (select count(*) filter (where title like 'New Pull a Thread request · item %')::text || ' of ' || count(*)::text
     from public.member_notifications where kind = 'thread_new');
