-- The Way: every AI flag explains itself (Frank, Oct 13 2026: "give us the rationale").
-- Run once in the Supabase SQL editor, after 0005_source_snapshots.sql.
--
-- Each finding from the checker may now carry, besides severity / issue / where:
--   checked      the exact words in the draft that were questioned
--   source_says  the nearest real text from the source, copied word for word ('' when the sources say nothing on it)
--   why          why that makes it a problem
--   fix          what would fix it
-- Older checks without these fields still show as before.
--
-- Fake quotes are a hard stop (Frank, Oct 13 2026: "fake quotes should be an instant not go forward
-- till it's corrected"). When a source page loaded fine and the quoted words are not on it, the checker
-- marks that finding kind = 'quote_missing' with the source's id. Until the author removes that source,
-- the version cannot be sent for review: not with "send anyway", and not by skipping the check.
-- Removing a source is a recorded withdrawal (append-only, audited); it is only possible before the version
-- is sent to the AI. After that the version is locked, and the fix is a new version (which starts as a copy,
-- without the fake-quote source).
-- When a page could not be loaded at all, the quote stays unverified and the author may still send it;
-- the reviewer sees that note.

begin;

-- Each source says whether it is primary (Frank, Oct 13 2026: at least 3 different sources, one primary).
-- Primary: the original record itself: a court record, official data, a statute or government document,
-- an original study. Secondary: news, encyclopedias, books and articles about those records.
alter table public.research_sources add column source_type text not null default 'secondary'
  check (source_type in ('primary','secondary'));
grant insert (source_type) on public.research_sources to authenticated;
comment on column public.research_sources.source_type is 'primary = court record, official data, statute or government document, original study; secondary = everything about those.';

create table public.research_source_withdrawals (
  source_id     bigint primary key references public.research_sources(id),
  withdrawn_by  uuid not null references public.members(id),
  withdrawn_at  timestamptz not null default now()
);
comment on table public.research_source_withdrawals is 'Append-only. A source the author removed from a draft before review.';
create trigger research_source_withdrawals_append_only before update or delete on public.research_source_withdrawals
  for each row execute function private.forbid_change();
create trigger research_source_withdrawals_no_truncate before truncate on public.research_source_withdrawals
  for each statement execute function private.forbid_change();
create trigger research_source_withdrawals_audit after insert on public.research_source_withdrawals
  for each row execute function private.audit();
revoke all on public.research_source_withdrawals from anon, authenticated;
grant select on public.research_source_withdrawals to authenticated;
alter table public.research_source_withdrawals enable row level security;
create policy source_withdrawals_read on public.research_source_withdrawals for select to authenticated
  using (private.has_role('researcher') or private.has_role('reviewer'));

create or replace function private.source_withdrawn(p_source bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.research_source_withdrawals w where w.source_id = p_source);
$$;
revoke all on function private.source_withdrawn(bigint) from public;
grant execute on function private.source_withdrawn(bigint) to anon, authenticated;

-- a removed source disappears from every list
drop policy research_sources_read on public.research_sources;
create policy research_sources_read on public.research_sources for select to anon, authenticated
  using ((private.version_is_public(version_id) or private.has_role('researcher') or private.has_role('reviewer'))
         and not private.source_withdrawn(id));

create or replace function public.withdraw_source(source_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare vid bigint;
begin
  select s.version_id into vid from public.research_sources s where s.id = withdraw_source.source_id;
  if vid is null then raise exception 'No such source' using errcode = '02000'; end if;
  perform private.own_open_version(vid);  -- only the author, only before review
  insert into public.research_source_withdrawals (source_id, withdrawn_by)
  values (withdraw_source.source_id, auth.uid())
  on conflict on constraint research_source_withdrawals_pkey do nothing;
end $$;
revoke all on function public.withdraw_source(bigint) from public, anon, authenticated;
grant execute on function public.withdraw_source(bigint) to authenticated;

-- the checker sees only the sources still on the draft, with their ids
create or replace function public.checker_claim(checker_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.research_prechecks; v public.research_versions; i public.research_items;
begin
  perform private.checker_key_id(checker_key);
  update public.research_prechecks set status = 'failed', error = 'Frak did not finish the check', completed_at = now()
   where status = 'running' and claimed_at < now() - interval '10 minutes' and attempts >= 3;
  select * into p from public.research_prechecks pc
   where pc.status = 'queued' or (pc.status = 'running' and pc.claimed_at < now() - interval '10 minutes')
   order by pc.id limit 1 for update skip locked;
  if p.id is null then return null; end if;
  update public.research_prechecks set status = 'running', claimed_at = now(), attempts = attempts + 1 where id = p.id;
  select * into v from public.research_versions where id = p.version_id;
  select * into i from public.research_items where id = v.item_id;
  return jsonb_build_object(
    'precheck_id', p.id,
    'title', i.title, 'context', i.question,
    'claim', v.claim, 'verdict', v.verdict, 'summary', v.summary, 'evidence', v.body,
    'counterargument', v.counterargument, 'counter_response', v.counter_response,
    'methods', v.methods, 'limitations', v.limitations,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('n', s.n, 'id', s.id, 'url', s.url, 'title', s.title,
                 'publisher', s.publisher, 'date', s.published_at_claimed, 'quote', s.quote, 'locator', s.locator,
                 'type', s.source_type) order by s.n)
               from (select rs.*, row_number() over (order by rs.id) n from public.research_sources rs
                      where rs.version_id = v.id and not private.source_withdrawn(rs.id)) s), '[]'::jsonb));
end $$;

create or replace function public.checker_complete(checker_key text, precheck_id bigint, findings jsonb, summary text, model text)
returns void language plpgsql security definer set search_path = '' as $$
declare clean jsonb := '[]'::jsonb; f jsonb; sev text; n int := 0; vid bigint; qm jsonb;
begin
  perform private.checker_key_id(checker_key);
  select pc.version_id into vid from public.research_prechecks pc where pc.id = checker_complete.precheck_id;
  if jsonb_typeof(findings) is distinct from 'array' then findings := '[]'::jsonb; end if;
  for f in select x from jsonb_array_elements(findings) x loop
    exit when n >= 12;
    continue when jsonb_typeof(f) <> 'object' or coalesce(btrim(f->>'issue'), '') = '';
    sev := case when f->>'severity' = 'glaring' then 'glaring' else 'minor' end;
    qm := '{}'::jsonb;
    if f->>'kind' = 'quote_missing' and coalesce(f->>'source_id', '') ~ '^[0-9]{1,18}$' and exists (
         select 1 from public.research_sources s where s.id = (f->>'source_id')::bigint and s.version_id = vid) then
      qm := jsonb_build_object('kind', 'quote_missing', 'source_id', (f->>'source_id')::bigint);
      sev := 'glaring';
    elsif f->>'kind' = 'quote_unverified' and coalesce(f->>'source_id', '') ~ '^[0-9]{1,18}$' and exists (
         select 1 from public.research_sources s where s.id = (f->>'source_id')::bigint and s.version_id = vid) then
      qm := jsonb_build_object('kind', 'quote_unverified', 'source_id', (f->>'source_id')::bigint);
    end if;
    clean := clean || jsonb_build_array(qm || jsonb_build_object(
      'severity', sev, 'issue', left(btrim(f->>'issue'), 600), 'where', left(coalesce(btrim(f->>'where'), ''), 120),
      'checked', left(coalesce(btrim(f->>'checked'), ''), 600),
      'source_says', left(coalesce(btrim(f->>'source_says'), ''), 900),
      'why', left(coalesce(btrim(f->>'why'), ''), 900),
      'fix', left(coalesce(btrim(f->>'fix'), ''), 600)));
    n := n + 1;
  end loop;
  update public.research_prechecks pc
     set status = 'done', findings = clean, completed_at = now(),
         outcome = case when clean @> '[{"severity":"glaring"}]' then 'flagged' else 'clear' end,
         summary = left(checker_complete.summary, 1000), model = left(checker_complete.model, 100)
   where pc.id = checker_complete.precheck_id and pc.status = 'running';
  if not found then raise exception 'That check is not running' using errcode = '42501'; end if;
end $$;

revoke all on function public.checker_complete(text,bigint,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.checker_complete(text,bigint,jsonb,text,text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Language filter (Frank, Oct 13 2026). A finding cannot go to review or be published with profanity or
-- slurs in its own words. Inside a source quote they are allowed only when the AI check verified the quote
-- is really on its page: quoting someone is context. Commons posts are never blocked: the author is warned
-- and moderators see a flag (done in the site). Admins edit the list in Commons > Admin.
-- A term ending in * matches any word starting with it; other terms match whole words only.
create table public.language_terms (
  term      text primary key check (term ~ '^[a-z0-9][a-z0-9'' -]{0,38}[a-z0-9]\*?$'),
  kind      text not null check (kind in ('profanity','slur')),
  added_by  uuid references public.members(id),
  added_at  timestamptz not null default now()
);
comment on table public.language_terms is 'Words the language filter catches. Admins edit it in Commons > Admin.';
create or replace function private.language_term_clean() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.term := lower(btrim(new.term));
  new.added_by := coalesce(auth.uid(), new.added_by);
  return new;
end $$;
create trigger language_terms_clean before insert on public.language_terms
  for each row execute function private.language_term_clean();
revoke all on public.language_terms from anon, authenticated;
grant select, delete on public.language_terms to authenticated;
grant insert (term, kind) on public.language_terms to authenticated;
alter table public.language_terms enable row level security;
create policy language_terms_read on public.language_terms for select to authenticated using (private.is_member());
create policy language_terms_add on public.language_terms for insert to authenticated with check (private.has_role('admin'));
create policy language_terms_remove on public.language_terms for delete to authenticated using (private.has_role('admin'));

insert into public.language_terms (term, kind) values
  ('fuck*', 'profanity'), ('motherfuck*', 'profanity'), ('shit', 'profanity'), ('shits', 'profanity'), ('shitty', 'profanity'),
  ('bullshit', 'profanity'), ('horseshit', 'profanity'), ('bitch*', 'profanity'), ('cunt*', 'profanity'), ('asshole*', 'profanity'),
  ('dickhead*', 'profanity'), ('cocksucker*', 'profanity'), ('goddamn*', 'profanity'), ('jackass', 'profanity'), ('dumbass', 'profanity'),
  ('nigger*', 'slur'), ('nigga*', 'slur'), ('faggot*', 'slur'), ('fag', 'slur'), ('fags', 'slur'), ('kike*', 'slur'), ('spic', 'slur'),
  ('spics', 'slur'), ('wetback*', 'slur'), ('tranny', 'slur'), ('trannies', 'slur'), ('retard', 'slur'), ('retards', 'slur'),
  ('retarded', 'slur'), ('raghead*', 'slur'), ('towelhead*', 'slur'), ('gook*', 'slur'), ('beaner*', 'slur'), ('redskins', 'slur'),
  ('squaw', 'slur'), ('dyke', 'slur'), ('dykes', 'slur')
on conflict (term) do nothing;

-- the filter's matches in a text, as the list of terms found
create or replace function private.strong_words(t text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct l.term order by l.term), '{}')
    from public.language_terms l
   where lower(coalesce(t, '')) ~ ('\m' || regexp_replace(rtrim(l.term, '*'), '([.^$|()\[\]{}+?\\])', '\\\1', 'g')
                                   || case when l.term like '%*' then '' else '\M' end);
$$;
revoke all on function private.strong_words(text) from public;

-- publishing re-checks the version's own words (the list may have grown since it was sent for review)
create or replace function private.publish_language_ok() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.research_versions; i public.research_items; hit text[];
begin
  if new.event_type = 'retracted' then return new; end if;
  select * into v from public.research_versions where id = new.version_id;
  select * into i from public.research_items where id = v.item_id;
  hit := private.strong_words(concat_ws(' ', i.title, i.question, v.claim, v.summary, v.body, v.counterargument,
                                        v.counter_response, v.methods, v.limitations));
  if cardinality(hit) > 0 then
    raise exception 'This finding has strong language in its own words (%), so it cannot be published', array_to_string(hit, ', ')
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger research_publication_language before insert on public.research_publication_events
  for each row execute function private.publish_language_ok();

-- Sending for review: a quote the checker could not find on a page that loaded is a hard stop.
create or replace function public.submit_for_review(version_id bigint, confirm text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.research_versions;
  i public.research_items;
  p public.research_prechecks;
  last_change timestamptz;
  st text;
  hit text[];
  src record;
begin
  v := private.own_open_version(submit_for_review.version_id);
  select * into i from public.research_items where id = v.item_id;
  hit := private.strong_words(concat_ws(' ', i.title, i.question, v.claim, v.summary, v.body, v.counterargument,
                                        v.counter_response, v.methods, v.limitations));
  if cardinality(hit) > 0 then
    raise exception 'Strong language in your own words (%). Reword it, or quote it from a source', array_to_string(hit, ', ')
      using errcode = '23514';
  end if;
  if v.claim is null or v.verdict is null or v.counterargument is null or v.counter_response is null then
    raise exception 'A finding needs a claim, a verdict, the strongest counterargument and your answer to it'
      using errcode = '23514';
  end if;
  -- any check, ever, that found a quote missing from a page that loaded, while that source is still on the draft
  if exists (select 1 from public.research_prechecks pc, jsonb_array_elements(pc.findings) f
              where pc.version_id = v.id and pc.status = 'done' and f->>'kind' = 'quote_missing'
                and not private.source_withdrawn((f->>'source_id')::bigint)) then
    raise exception 'A quote is not on its source page. Write a new version and add that source again with the exact words from the page'
      using errcode = '23514';
  end if;
  -- three different pages (several quotes from one page count as one source), at least one primary
  if (select count(distinct private.page_key(s.url)) from public.research_sources s
       where s.version_id = v.id and not private.source_withdrawn(s.id)) < 3 then
    raise exception 'A finding needs at least three different sources before review' using errcode = '23514';
  end if;
  if not exists (select 1 from public.research_sources s
                  where s.version_id = v.id and not private.source_withdrawn(s.id) and s.source_type = 'primary') then
    raise exception 'A finding needs at least one primary source (a court record, official data, a statute or government document, or an original study)'
      using errcode = '23514';
  end if;
  if exists (select 1 from public.research_returns r where r.version_id = v.id) then
    raise exception 'This version was sent back; write a new version with the fixes' using errcode = '42501';
  end if;

  select greatest(
           (select max(s.created_at) from public.research_sources s where s.version_id = v.id),
           (select max(w.withdrawn_at) from public.research_source_withdrawals w
              join public.research_sources s on s.id = w.source_id where s.version_id = v.id))
    into last_change;
  select * into p from public.research_prechecks pc
   where pc.version_id = v.id and pc.status = 'done' and pc.created_at >= last_change
   order by pc.id desc limit 1;

  -- strong language inside a quote is allowed only when this check verified the quote on its page
  for src in select s.id, s.url, s.title from public.research_sources s
              where s.version_id = v.id and not private.source_withdrawn(s.id)
                and cardinality(private.strong_words(s.quote)) > 0 loop
    if p.id is null or exists (select 1 from jsonb_array_elements(p.findings) f
                                join public.research_sources o on o.id = (f->>'source_id')::bigint
                               where f->>'kind' in ('quote_missing','quote_unverified')
                                 and private.page_key(o.url) = private.page_key(src.url)) then
      raise exception 'The quote from "%" has strong language, and the AI check could not confirm it is on the page. Quote it only from a page that can be checked', src.title
        using errcode = '23514';
    end if;
  end loop;

  if p.id is not null and p.outcome = 'clear' then
    st := 'clear';
  elsif p.id is not null and p.outcome = 'flagged' then
    if confirm is distinct from 'flagged' then
      raise exception 'The fact-check flagged this version; confirm to send it anyway' using errcode = '23514';
    end if;
    st := 'flagged_confirmed';
  else
    if confirm is distinct from 'unchecked' then
      raise exception 'This version has not been fact-checked yet' using errcode = '23514';
    end if;
    st := 'unchecked';
  end if;

  insert into public.research_submissions (version_id, submitted_by, precheck_id, check_state)
  values (v.id, auth.uid(), p.id, st);
  return st;
end $$;
revoke all on function public.submit_for_review(bigint,text) from public, anon;
grant execute on function public.submit_for_review(bigint,text) to authenticated;


-- A source's date must be plausible: not before 1400 and not in the future (Frank's test had 0001-10-12).
create or replace function private.source_date_ok() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.published_at_claimed is not null
     and (new.published_at_claimed < date '1400-01-01' or new.published_at_claimed > current_date + 1) then
    raise exception 'That date can''t be right; enter the date the source shows, or leave it empty' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger research_sources_date_ok before insert on public.research_sources
  for each row execute function private.source_date_ok();


-- Editing a source on a draft: the old row is withdrawn (kept, audited) and the edited one added
-- in its place, in one step. Only the author, only before review.
create or replace function public.edit_source(source_id bigint, url text, title text, publisher text default null,
  published_at_claimed date default null, quote text default null, locator text default null, source_type text default 'secondary') returns bigint
language plpgsql security definer set search_path = '' as $$
declare vid bigint; nid bigint;
begin
  select s.version_id into vid from public.research_sources s
   where s.id = edit_source.source_id and not private.source_withdrawn(s.id);
  if vid is null then raise exception 'No such source' using errcode = '02000'; end if;
  perform private.own_open_version(vid);
  insert into public.research_source_withdrawals (source_id, withdrawn_by) values (edit_source.source_id, auth.uid());
  insert into public.research_sources (version_id, url, title, publisher, published_at_claimed, quote, locator, source_type)
  values (vid, btrim(edit_source.url), btrim(edit_source.title), nullif(btrim(edit_source.publisher), ''),
          edit_source.published_at_claimed, nullif(btrim(edit_source.quote), ''), nullif(btrim(edit_source.locator), ''),
          coalesce(edit_source.source_type, 'secondary'))
  returning id into nid;
  return nid;
end $$;
revoke all on function public.edit_source(bigint,text,text,text,date,text,text,text) from public, anon, authenticated;
grant execute on function public.edit_source(bigint,text,text,text,date,text,text,text) to authenticated;


-- A version is locked for good once its author sends it to the AI check (Frank, Oct 13 2026):
-- no sources added, removed or edited. Any change becomes a new version, which starts as a copy.
create or replace function private.version_not_locked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare vid bigint;
begin
  if tg_table_name = 'research_sources' then vid := new.version_id;
  else select s.version_id into vid from public.research_sources s where s.id = new.source_id;
  end if;
  if exists (select 1 from public.research_prechecks p where p.version_id = vid) then
    raise exception 'This version was sent to the AI check and is locked; write a new version to change it' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger research_sources_locked before insert on public.research_sources
  for each row execute function private.version_not_locked();
create trigger research_source_withdrawals_locked before insert on public.research_source_withdrawals
  for each row execute function private.version_not_locked();


-- Sources are cards: each row is one quote (with its own location and its own quote check); rows of a
-- version that link the same page form one card. page_key is how "the same page" is decided.
create or replace function private.page_key(u text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(btrim(u)), '#.*$', ''), '/+$', '');
$$;
grant execute on function private.page_key(text) to anon, authenticated;

-- Snapshots: one per page per version (the first quote row of each card), never for removed rows.
create or replace function public.checker_next_snaps(checker_key text, max_items int default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  perform private.checker_key_id(checker_key);
  select coalesce(jsonb_agg(x order by x->>'source_id' desc), '[]'::jsonb) into out from (
    select jsonb_build_object('source_id', s.id, 'url', s.url, 'need', jsonb_agg(k.kind order by k.kind)) x
      from public.research_sources s
      cross join (values ('wayback'), ('private')) k(kind)
      left join private.snapshot_attempts a on a.source_id = s.id and a.kind = k.kind
     where exists (select 1 from public.research_prechecks p where p.version_id = s.version_id)
       and s.created_at > now() - interval '60 days'
       and not private.source_withdrawn(s.id)
       and s.id = (select min(o.id) from public.research_sources o
                    where o.version_id = s.version_id and private.page_key(o.url) = private.page_key(s.url)
                      and not private.source_withdrawn(o.id))
       and not exists (select 1 from public.research_source_snapshots n where n.source_id = s.id and n.kind = k.kind)
       and (a.tries is null or (a.tries < 4 and a.last_try < now() - make_interval(hours => a.tries * a.tries)))
     group by s.id, s.url
     order by s.id desc
     limit greatest(1, least(coalesce(max_items, 5), 20))) q;
  return out;
end $$;

commit;
