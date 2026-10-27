-- The Way members setup, part 7 of 7. Run parts in order. Safe to run again.
select what, case when ok then 'ok' else 'MISSING' end as status from (
  select 'join: redeem_invitation' what, to_regprocedure('public.redeem_invitation(text,text)') is not null ok
  union all select 'join: create_share_link', to_regprocedure('public.create_share_link(text,text)') is not null
  union all select 'join: notify_signup (waiting list)', to_regprocedure('public.notify_signup(text,text)') is not null
  union all select '0013 case_review_events', to_regclass('public.case_review_events') is not null
  union all select '0013 review_case_claim', to_regprocedure('public.review_case_claim(text,text,text,text,text)') is not null
  union all select '0014 claim_reviews', to_regclass('public.claim_reviews') is not null
  union all select '0014 submit_claim_review', exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_claim_review')
  union all select '0015 thread_submissions', to_regclass('public.thread_submissions') is not null
  union all select 'append-only guard on claim_reviews', exists (select 1 from pg_trigger where tgrelid='public.claim_reviews'::regclass and tgname='claim_reviews_append_only')
  union all select 'at least one active admin exists', exists (select 1 from public.member_roles r join public.members m on m.id=r.member_id where r.role='admin' and m.status='active')
) c order by 2 desc, 1;
