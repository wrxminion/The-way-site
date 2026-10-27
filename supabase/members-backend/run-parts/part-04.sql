-- The Way members setup, part 4 of 7. Run parts in order. Safe to run again.
create or replace function public.submit_claim_review(
  p_case_slug text, p_claim_key text, p_claim_text text,
  p_source_label text, p_source_url text, p_source_access text,
  p_verdict text, p_evidence_passage text, p_rationale text,
  p_flags text[] default '{}', p_review_mode text default 'independent',
  p_supersedes_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me   uuid := auth.uid();
  txt  text := nullif(btrim(p_claim_text), '');
  src  text := nullif(btrim(p_source_label), '');
  url  text := nullif(btrim(p_source_url), '');
  pass text := nullif(btrim(p_evidence_passage), '');
  rat  text := nullif(btrim(p_rationale), '');
  prev public.claim_reviews;
  dup  bigint;
  new_id bigint;
begin
  perform private.require_role('moderator');
  if p_case_slug is null or p_case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if p_claim_key is null or p_claim_key !~ '^[0-9a-f]{10}$' then
    raise exception 'Unknown claim' using errcode = '22023';
  end if;
  if txt is null or char_length(txt) not between 3 and 1000 then
    raise exception 'The claim text is missing or too long' using errcode = '22023';
  end if;
  if src is null or char_length(src) not between 2 and 300 then
    raise exception 'Name the source you checked (2 to 300 characters)' using errcode = '22023';
  end if;
  if url is not null and (url !~* '^https?://[^[:space:]]+$' or char_length(url) > 1000) then
    raise exception 'The source link must start with http:// or https://' using errcode = '22023';
  end if;
  if p_source_access not in ('opened','inaccessible','questioned') then
    raise exception 'Say whether you could open the source' using errcode = '22023';
  end if;
  if p_verdict not in ('supported','partially_supported','contradicted','insufficient_evidence','inaccessible','pending') then
    raise exception 'Unknown verdict' using errcode = '22023';
  end if;
  if p_review_mode not in ('independent','collaborative') then
    raise exception 'Unknown review mode' using errcode = '22023';
  end if;
  if p_verdict not in ('pending','inaccessible') and (rat is null or char_length(rat) < 10) then
    raise exception 'Say in a sentence why (at least 10 characters)' using errcode = '22023';
  end if;
  if p_verdict in ('supported','partially_supported','contradicted') and pass is null then
    raise exception 'Quote or point to the passage in the source that backs this verdict' using errcode = '22023';
  end if;
  if p_verdict = 'inaccessible' and (rat is null or char_length(rat) < 3) then
    raise exception 'Say what stopped you opening the source' using errcode = '22023';
  end if;
  if (p_verdict = 'inaccessible') <> (p_source_access = 'inaccessible') and p_verdict <> 'pending' then
    raise exception 'An inaccessible source gives the verdict "inaccessible"; otherwise pick what the source shows' using errcode = '22023';
  end if;
  if (rat is not null and char_length(rat) > 2000) or (pass is not null and char_length(pass) > 1500) then
    raise exception 'Keep the rationale under 2000 and the passage under 1500 characters' using errcode = '22023';
  end if;
  if not (coalesce(p_flags, '{}') <@ array['needs_second_look','source_conflict','possible_error','outdated','other']::text[]) then
    raise exception 'Unknown flag' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_claim_review'), hashtext(p_case_slug || p_claim_key));
  if p_supersedes_id is not null then
    select * into prev from public.claim_reviews where id = p_supersedes_id;
    if not found or prev.reviewer_id <> me then
      raise exception 'You can only revise your own review' using errcode = '42501';
    end if;
    if prev.case_slug <> p_case_slug or prev.claim_key <> p_claim_key then
      raise exception 'That review is for a different claim' using errcode = '22023';
    end if;
    if exists (select 1 from public.claim_reviews n where n.supersedes_id = p_supersedes_id) then
      raise exception 'That review was already revised. Revise the newest one' using errcode = '55000';
    end if;
  else
    -- a second fresh review of the same claim and source by the same person is refused
    select c.id into dup from private.claim_reviews_current c
     where c.reviewer_id = me and c.case_slug = p_case_slug and c.claim_key = p_claim_key
       and lower(c.source_label) = lower(src) limit 1;
    if dup is not null then
      raise exception 'You already reviewed this claim against that source. Revise your review instead of adding another' using errcode = '55000';
    end if;
  end if;
  insert into public.claim_reviews (case_slug, claim_key, claim_text, source_label, source_url, source_access,
    verdict, evidence_passage, rationale, flags, review_mode, supersedes_id, reviewer_id)
  values (p_case_slug, p_claim_key, txt, src, url, p_source_access,
    p_verdict, pass, rat, coalesce(p_flags, '{}'), p_review_mode, p_supersedes_id, me)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.claim_reviews_for_claim(p_case_slug text, p_claim_key text)
returns table (id bigint, reviewer_label text, is_mine boolean, source_label text, source_url text, source_access text,
               verdict text, evidence_passage text, rationale text, flags text[], review_mode text,
               supersedes_id bigint, is_current boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('moderator');
  if not exists (select 1 from public.claim_reviews m
                  where m.case_slug = p_case_slug and m.claim_key = p_claim_key and m.reviewer_id = auth.uid()) then
    return;
  end if;
  return query
    select r.id, 'Reviewer ' || n.reviewer_no, r.reviewer_id = auth.uid(), r.source_label, r.source_url, r.source_access,
           r.verdict, r.evidence_passage, r.rationale, r.flags, r.review_mode, r.supersedes_id,
           not exists (select 1 from public.claim_reviews s where s.supersedes_id = r.id), r.created_at
      from public.claim_reviews r
      join private.claim_reviewer_numbers n on n.case_slug = r.case_slug and n.reviewer_id = r.reviewer_id
     where r.case_slug = p_case_slug and r.claim_key = p_claim_key
     order by r.id;
end $$;
