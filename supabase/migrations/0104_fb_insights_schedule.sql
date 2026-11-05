-- 0104: pull the Facebook Page numbers and comments every 3 hours (Admin > Media > Post online > Facebook).
-- Needs pg_cron and pg_net (already on for bsky-inbox) and the fb-insights function with its "last pull is stale" rule.
-- No secret: fb-insights runs a pull for any caller only when the last pull is more than 50 minutes old.
-- Safe to run again: the old job of the same name is replaced.
select cron.unschedule(jobid) from cron.job where jobname = 'fb-insights';
select cron.schedule('fb-insights', '20 */3 * * *', $job$
  select net.http_post(
    url := 'https://tiuhyulxdiiiqspysfci.supabase.co/functions/v1/fb-insights',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "pull", "days": 7}'::jsonb,
    timeout_milliseconds := 60000);
$job$);
