-- 0077: the Admin analytics panel can show which pages Google sends visitors to. Needs 0028. Safe to run twice.
-- Adds one new kind of daily summary row, 'google_landing' (page path plus counts, no search words, no visitor data).
alter table public.site_stats_daily drop constraint if exists site_stats_daily_kind_check;
alter table public.site_stats_daily add constraint site_stats_daily_kind_check
  check (kind in ('total','page','referrer','country','state','google_landing'));
