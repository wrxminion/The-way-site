# Bluesky replies in the Admin inbox: setup

Needs the Facebook setup (docs/facebook-insights-setup.md) done first, because Bluesky shares its inbox. A second Edge Function, `bsky-inbox`, pulls replies, mentions and quotes of the Bluesky account into the same admin-only list in **Admin > Facebook**, tagged "Bluesky". You can reply from there (300 characters, Bluesky's limit). Nothing is public.

Never paste the app password into chat, a file, or this repository.

1. Make an app password: [Bluesky Settings > Privacy and security > App passwords](https://bsky.app/settings/app-passwords). Name it anything. Do not use the main password. Turn off "Allow access to your direct messages" so it cannot read DMs.
2. Add two secrets at [Edge Function secrets](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/functions/secrets): `BSKY_HANDLE` (like `name.bsky.social`) and `BSKY_APP_PASSWORD`.
3. Run `supabase/migrations/0099_bluesky_inbox.sql` in the [SQL editor](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/sql/new).
4. Create a function named `bsky-inbox` in [Edge Functions](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/functions) from `supabase/functions/bsky-inbox/index.ts`. Turn "Verify JWT" off.
5. Add a [cron job](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/integrations/cron/jobs) every 3 hours for `bsky-inbox` with header `x-cron-secret` set to your `STATS_CRON_SECRET` value and body `{"action":"pull"}`.

The Refresh now button in Admin > Facebook also pulls Bluesky. Direct messages are not read. To revoke access at any time, delete the app password in Bluesky.
