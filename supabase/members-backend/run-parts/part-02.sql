-- The Way members setup, part 2 of 7. Run parts in order. Safe to run again.
create or replace function public.review_case_claim(case_slug text, claim_key text, claim_text text, event_type text, note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  n   text := nullif(btrim(note), '');
  txt text := nullif(btrim(claim_text), '');
  last_type text;
  new_id bigint;
begin
  perform private.require_role('moderator');
  if case_slug is null or case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if claim_key is null or claim_key !~ '^[0-9a-f]{10}$' then
    raise exception 'Unknown claim' using errcode = '22023';
  end if;
  if txt is null or char_length(txt) not between 3 and 1000 then
    raise exception 'The claim text is missing or too long' using errcode = '22023';
  end if;
  if event_type not in ('claim_checked','claim_flagged','claim_cleared') then
    raise exception 'A claim can be checked, flagged or cleared' using errcode = '22023';
  end if;
  if event_type <> 'claim_checked' and (n is null or char_length(n) < 3) then
    raise exception 'Add a short note (3 to 2000 characters) saying why' using errcode = '22023';
  end if;
  if n is not null and char_length(n) > 2000 then
    raise exception 'Keep the note under 2000 characters' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_case_review'), hashtext(case_slug));
  if private.case_is_reviewed(case_slug) then
    raise exception 'This case is marked reviewed. Reopen it first' using errcode = '55000';
  end if;
  select e.event_type into last_type from public.case_review_events e
   where e.case_slug = review_case_claim.case_slug and e.claim_key = review_case_claim.claim_key
   order by e.id desc limit 1;
  if event_type = 'claim_cleared' and last_type is distinct from 'claim_flagged' then
    raise exception 'That claim is not flagged' using errcode = '55000';
  end if;
  if event_type = 'claim_checked' and last_type = 'claim_flagged' then
    raise exception 'Clear the flag first, with a note saying what was fixed' using errcode = '55000';
  end if;
  insert into public.case_review_events (case_slug, claim_key, claim_text, event_type, note, actor_id)
  values (review_case_claim.case_slug, review_case_claim.claim_key, txt, review_case_claim.event_type, n, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.review_case(case_slug text, event_type text, note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  n   text := nullif(btrim(note), '');
  new_id bigint;
  flags int;
  checks int;
begin
  perform private.require_role('moderator');
  if case_slug is null or case_slug !~ '^[a-z0-9-]{2,80}$' then
    raise exception 'Unknown case' using errcode = '22023';
  end if;
  if event_type not in ('review_started','note','marked_reviewed','reopened') then
    raise exception 'Unknown review step' using errcode = '22023';
  end if;
  if event_type in ('note','reopened') and (n is null or char_length(n) < 3) then
    raise exception 'Add a short note (3 to 2000 characters) saying why' using errcode = '22023';
  end if;
  if event_type = 'marked_reviewed' and (n is null or char_length(n) < 10) then
    raise exception 'Say in a sentence or two what you reviewed (at least 10 characters)' using errcode = '22023';
  end if;
  if n is not null and char_length(n) > 2000 then
    raise exception 'Keep the note under 2000 characters' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('the_way_case_review'), hashtext(case_slug));
  if event_type = 'marked_reviewed' then
    if private.case_is_reviewed(case_slug) then
      raise exception 'This case is already marked reviewed' using errcode = '55000';
    end if;
    flags := private.case_open_flags(case_slug);
    if flags > 0 then
      raise exception '% flagged claim(s) are still open. Clear each flag first', flags using errcode = '55000';
    end if;
    select count(distinct e.claim_key) into checks from public.case_review_events e
     where e.case_slug = review_case.case_slug and e.event_type = 'claim_checked';
    if checks = 0 then
      raise exception 'No claim has been checked yet' using errcode = '55000';
    end if;
  elsif event_type = 'reopened' and not private.case_is_reviewed(case_slug) then
    raise exception 'This case is not marked reviewed' using errcode = '55000';
  elsif event_type in ('review_started','note') and private.case_is_reviewed(case_slug) then
    raise exception 'This case is marked reviewed. Reopen it first' using errcode = '55000';
  end if;
  insert into public.case_review_events (case_slug, event_type, note, actor_id)
  values (review_case.case_slug, review_case.event_type, n, auth.uid())
  returning id into new_id;
  if event_type in ('marked_reviewed','reopened') then
    insert into public.moderation_actions (moderator_id, action, subject_type, subject_id, reason)
    values (auth.uid(), review_case.event_type || '_case', 'case_review', review_case.case_slug, coalesce(n, review_case.event_type));
  end if;
  return new_id;
end $$;

create or replace function public.case_review_status()
returns table (case_slug text, status text, reviewed_at timestamptz, claims_checked int, claims_flagged int, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.slug,
         case when private.case_is_reviewed(s.slug) then 'reviewed' else 'in_review' end,
         (select max(e.created_at) from public.case_review_events e
           where e.case_slug = s.slug and e.event_type = 'marked_reviewed' and private.case_is_reviewed(s.slug)),
         (select count(*)::int from (
            select distinct on (e.claim_key) e.event_type from public.case_review_events e
             where e.case_slug = s.slug and e.claim_key is not null order by e.claim_key, e.id desc) c
           where c.event_type in ('claim_checked','claim_cleared')),
         private.case_open_flags(s.slug),
         (select max(e.created_at) from public.case_review_events e where e.case_slug = s.slug)
    from (select distinct e.case_slug as slug from public.case_review_events e) s
   order by 6 desc;
$$;
