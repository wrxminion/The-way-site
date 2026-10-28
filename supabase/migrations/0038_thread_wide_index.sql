-- RUN THIS
-- The Way 0038: search the whole site, not just 71 history cases. One part; run AFTER 0037 (0039 may be run before or after). Safe to run again.
-- The Way: a wider Pull a Thread index and a looser matcher (Frank, Oct 28 2026: "it should search the entire site, all data points we have").
--   * The matching index may now hold any kind of public record (pages, case pages, guides, news items, the ledger, research
--     packages, public facts about archived sources), not only the four old kinds. Long pages are stored as chunks.
--   * The matcher is looser for short questions: it needs 2 shared key words and a quarter of the sender's key words (it
--     needed 3 words and 40%). It returns the best 5 records, one per page, best first. Matches are still only "may be
--     related" and a person can check every answer.
--   * Private research and unreviewed drafts are never sent to this table: the archiver only sends published material.
--   * Two small calls let the archiver refresh the index without leaving old rows behind.
--   * Requests already waiting with no records get matched again, and their preliminary answer is made again.

do $guard$
begin
  if to_regprocedure('public.checker_thread_prelim_next(text)') is null then raise exception 'Stop: run 0030 to 0037 first'; end if;
end $guard$;

-- 1. any kind of record (a short lower-case word), not a fixed list of four
do $kinds$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.thread_match_index'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.thread_match_index drop constraint %I', c.conname);
  end loop;
end $kinds$;
alter table public.thread_match_index add constraint thread_match_index_kind_check check (kind ~ '^[a-z][a-z-]{1,24}$');

-- 2. the looser matcher
create or replace function private.thread_matches(p_canon text, p_text text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; qlex text[]; n int; need int; q tsquery; w jsonb;
begin
  if p_canon is not null then
    out := out || coalesce((
      select jsonb_agg(x) from (
        select distinct on (i.id) jsonb_build_object('kind','finding','ref',i.slug,'title',i.title,'path','/members/findings.html',
                 'strength','source','why','A published finding cites this link') x
          from public.research_sources s
          join public.research_versions v on v.id = s.version_id
          join public.research_items i on i.id = v.item_id
         where private.version_is_public(v.id) and private.thread_canon(s.url) = p_canon
         limit 3) t), '[]'::jsonb);
    out := out || coalesce((
      select jsonb_agg(jsonb_build_object('kind',m.kind,'ref',m.ref,'title',m.title,'path',m.path,'strength','source','why','We already cite this link'))
        from (select * from public.thread_match_index where p_canon = any(urls) limit 3) m), '[]'::jsonb);
  end if;
  select array_agg(l) into qlex from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_text, '')))) l where char_length(l) > 2;
  n := coalesce(cardinality(qlex), 0);
  if n >= 2 then
    need := greatest(2, ceil(n * 0.25)::int);
    q := to_tsquery('english', (select string_agg(quote_literal(l), ' | ') from unnest(qlex) l));
    select coalesce(jsonb_agg(jsonb_build_object('kind', d.k, 'ref', d.r, 'title', d.t, 'path', d.pth, 'strength', 'words',
                                                 'why', 'Shares ' || d.c || ' of ' || n || ' key words') order by d.c desc, d.rk desc), '[]'::jsonb)
      into w
      from (
        select * from (
          select distinct on (z.dk) z.* from (
            select 'finding'::text k, i.slug r, i.title t, '/members/findings.html'::text pth, 'finding:' || i.slug dk, 0::real rk,
                   (select count(*) from unnest(tsvector_to_array(to_tsvector('english', i.title || ' ' || i.question || ' ' || v.summary))) x where x = any(qlex)) c
              from public.research_items i join public.research_versions v on v.id = i.published_version_id
             where private.version_is_public(v.id)
            union all
            select m.kind, m.ref, m.title, m.path, m.path, ts_rank_cd(m.tsv, q),
                   (select count(*) from unnest(tsvector_to_array(m.tsv)) x where x = any(qlex))
              from public.thread_match_index m where m.tsv @@ q
          ) z where z.c >= need
          order by z.dk, z.c desc, z.rk desc) b
        order by b.c desc, b.rk desc limit 5) d;
    out := out || w;
  end if;
  return out;
end $$;

comment on function private.thread_matches(text,text) is '0038 wide matcher';

-- 3. refreshing the index: begin (the database's own clock), put (already there), prune what was not refreshed
create or replace function public.checker_thread_index_begin(checker_key text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  perform private.checker_key_id(checker_key);
  return now();
end $$;

create or replace function public.checker_thread_index_prune(checker_key text, p_kinds text[], p_before timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform private.checker_key_id(checker_key);
  if p_kinds is null or cardinality(p_kinds) = 0 or p_before is null or p_before > now() then raise exception 'Say which kinds and an earlier time' using errcode = '22023'; end if;
  delete from public.thread_match_index where kind = any(p_kinds) and updated_at < p_before;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.checker_thread_index_begin(text), public.checker_thread_index_prune(text,text[],timestamptz) from public, anon, authenticated;
grant execute on function public.checker_thread_index_begin(text), public.checker_thread_index_prune(text,text[],timestamptz) to anon, authenticated;   -- guarded by the checker key

-- 4. requests that are waiting with no records get matched again and answered again. If anything blocks this, it says so and the rest still stands.
do $rematch$
declare n int := 0;
begin
  update public.thread_intakes x
     set matches = private.thread_matches(x.canonical_url, coalesce(x.question, x.note)), prelim_status = 'pending', prelim = null
   where x.status = 'queued' and x.kind in ('question','url') and jsonb_array_length(x.matches) = 0
     and private.thread_matches(x.canonical_url, coalesce(x.question, x.note)) <> '[]'::jsonb;
  get diagnostics n = row_count;
  raise notice 'matched again: % waiting requests', n;
exception when others then
  raise notice 'could not match waiting requests again (%): nothing else changed', sqlerrm;
end $rematch$;

-- Check: every row must say ok.
select 'any kind of record can be indexed' as check_name,
       case when exists (select 1 from pg_constraint where conrelid = 'public.thread_match_index'::regclass and conname = 'thread_match_index_kind_check') then 'ok' else 'MISSING' end as result
union all
select 'the matcher is the looser one',
       case when obj_description('private.thread_matches(text,text)'::regprocedure, 'pg_proc') = '0038 wide matcher' then 'ok' else 'OLD' end
union all
select 'only the archiver key can refresh the index',
       case when has_function_privilege('anon','public.checker_thread_index_begin(text)','execute') and not has_table_privilege('anon','public.thread_match_index','select') then 'ok' else 'WRONG' end
union all
select 'the matcher runs on a short question',
       case when jsonb_typeof(private.thread_matches(null, 'Did the arms sales to Iran fund the contras')) = 'array' then 'ok' else 'WRONG' end
union all
select 'rows in the index right now (info)', (select count(*)::text from public.thread_match_index);
