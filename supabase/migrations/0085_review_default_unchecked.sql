-- RUN THIS
-- 0085: AI-written pages with no review row now show "AI written, unchecked" instead of "skimmed" (Frank, Nov 2 2026).
-- Only a real person's action (content_review_set) raises a label. Rows people already set are not touched. Safe to run again.
alter table public.content_review_settings alter column default_status set default 'ai_unchecked';
update public.content_review_settings set default_status = 'ai_unchecked' where id = 1;

select 'default is unchecked' as item, case when public.content_review_public() ->> 'default' = 'ai_unchecked' then 'ok' else 'FAIL' end as result;
