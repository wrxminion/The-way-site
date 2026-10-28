-- 0043: Pull a Thread: a research project is a topic fit only when its title words (not generic ones) appear in the question,
-- or 3 or more key words match. Before, any one shared word (even "public") gave +15 (an Iran-Contra question scored as "The Epstein record").
-- Only the topic pick changes. Older stored scores are not rewritten.
create or replace function private.intake_thread_core(p_kind text, p_url text, p_question text, p_note text,
                                                p_shot_path text, p_shot_bytes int, p_member uuid, p_rate_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u text := nullif(btrim(p_url), ''); q text := nullif(btrim(p_question), ''); nt text := nullif(btrim(p_note), '');
  canon text; dk text; recv text; mt jsonb; strong boolean; st text; parts jsonb := '[]'::jsonb; new_id bigint;
  topic public.research_projects;
begin
  if coalesce(p_rate_key, '') !~ '^[0-9a-f]{64}$' then raise exception 'Missing rate key' using errcode = '22023'; end if;
  if p_kind not in ('url','screenshot','question') then raise exception 'Send a link, a screenshot or a question' using errcode = '22023'; end if;
  if p_kind = 'url' then
    if u is null or u !~* '^https?://[^[:space:]/@]+(/[^[:space:]]*)?$' or char_length(u) > 1000
       or substring(u from '^https?://([^/?#:]+)') !~* '^[a-z0-9.-]+\.[a-z]{2,}$'
       or substring(u from '^https?://([^/?#:]+)') ~* '(^|\.)(localhost|local|internal|lan|home|corp)$' then
      raise exception 'Send a full public web link that starts with http:// or https://' using errcode = '22023';
    end if;
    if nt is not null and char_length(nt) not between 3 and 500 then raise exception 'Keep the note under 500 characters' using errcode = '22023'; end if;
    canon := private.thread_canon(u); dk := canon;
  elsif p_kind = 'question' then
    if q is null or char_length(q) not between 10 and 1500 then raise exception 'Ask in 10 to 1500 characters' using errcode = '22023'; end if;
    if q ~ '[<>]' then raise exception 'Please leave out < and > characters' using errcode = '22023'; end if;
    dk := 'q:' || encode(extensions.digest(lower(regexp_replace(q, '[^a-zA-Z0-9]+', ' ', 'g')), 'sha256'), 'hex');
  else
    if p_shot_path is null or p_shot_path !~ '^[0-9a-f-]{36}\.(png|jpg|webp)$' or coalesce(p_shot_bytes, 0) not between 1 and 4194304 then
      raise exception 'The screenshot did not arrive correctly' using errcode = '22023';
    end if;
    if nt is null or char_length(nt) not between 3 and 500 then raise exception 'Say in a few words what we should check in the screenshot' using errcode = '22023'; end if;
    dk := 'shot:' || p_shot_path;
  end if;
  if p_kind <> 'question' and nt is not null and nt ~ '[<>]' then raise exception 'Please leave out < and > characters' using errcode = '22023'; end if;
  if not private.thread_rate_ok(p_rate_key, p_member is not null) then
    raise exception 'That is a lot of submissions. Please try again later.' using errcode = '54000';
  end if;

  mt := private.thread_matches(canon, coalesce(q, nt));
  strong := exists (select 1 from jsonb_array_elements(mt) m where m->>'strength' = 'source');
  st := case when jsonb_array_length(mt) > 0 and p_kind <> 'screenshot' then 'matched' else 'queued' end;
  -- A project fits only when the words of its TITLE show up in the question (not generic words like "record"), or when at least
  -- 3 key words from its title and description do. One shared everyday word (public, event) is not a fit.
  select p.* into topic from public.research_projects p,
    lateral (select array_agg(w) tl from unnest(tsvector_to_array(to_tsvector('english', p.title))) w
              where w <> all (array['record','file','project','research','public','govern','american','unit','state','news','histori','polici']) and char_length(w) > 2) t,
    lateral (select array_agg(w) ql from unnest(tsvector_to_array(to_tsvector('english', coalesce(q, nt, regexp_replace(u, '[^a-zA-Z0-9]+', ' ', 'g'), '')))) w where char_length(w) > 2) qq,
    lateral (select count(*) c from unnest(tsvector_to_array(to_tsvector('english', p.title || ' ' || coalesce(p.description, '')))) w where w = any(coalesce(qq.ql, '{}'))) dd
   where p.active and (coalesce(t.tl, '{}') && coalesce(qq.ql, '{}') or dd.c >= 3)
   order by (coalesce(t.tl, '{}') && coalesce(qq.ql, '{}')) desc, dd.c desc, p.parent_id nulls first, p.id limit 1;
  if topic.id is not null then
    parts := parts || jsonb_build_array(jsonb_build_object('key','topic','label','Fits our research project "' || topic.title || '"','pts',15));
  end if;
  if p_kind = 'url' then parts := parts || jsonb_build_array(jsonb_build_object('key','source','label','Comes with a link we can read','pts',10)); end if;
  if p_kind = 'screenshot' then parts := parts || jsonb_build_array(jsonb_build_object('key','shot','label','Screenshot only: a person must read it first','pts',0)); end if;

  recv := encode(extensions.gen_random_bytes(12), 'hex');
  insert into public.thread_intakes (kind, url, canonical_url, question, note, shot_path, shot_bytes, dup_key, submitter_id, rate_key,
                                     receipt_hash, status, matches, base_parts, enrich_status, project_id)
  values (p_kind, case when p_kind = 'url' then u end, canon, case when p_kind = 'question' then q end, nt,
          case when p_kind = 'screenshot' then p_shot_path end, case when p_kind = 'screenshot' then p_shot_bytes end,
          dk, p_member, p_rate_key, encode(extensions.digest(recv, 'sha256'), 'hex'), st, mt, parts,
          case when p_kind = 'url' then 'pending' else 'skipped' end, topic.id)
  returning id into new_id;
  return jsonb_build_object('receipt', recv, 'status', st, 'matches', private.thread_public_matches(mt), 'strong', strong);
end $$;
