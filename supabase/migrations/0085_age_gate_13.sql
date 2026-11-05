-- RUN THIS
-- 0085: the sign-up age question now asks "Are you 13 or older?" (was 18). No structural change.
-- The flag column keeps its name (adult_confirmed_at) so nothing else has to change; only its meaning moves.
-- Members who joined under the 18 question stay flagged. No birth date or age is stored.

comment on column public.members.adult_confirmed_at is 'When the member said at sign-up that they are 13 or older (18 or older before migration 0085). Null for members who joined before the age question. No birth date is kept.';

-- Check: must say ok.
select 'comment updated' as item, case when col_description('public.members'::regclass, (select attnum from pg_attribute where attrelid = 'public.members'::regclass and attname = 'adult_confirmed_at')) like '%13 or older%' then 'ok' else 'FAIL' end as res;
