# Facebook Page numbers and inbox: setup

What it does: a Supabase Edge Function (`fb-insights`) pulls the Michi Institute Page's numbers and new comments from Facebook on a schedule. Everything lands in admin-only tables (migration 0098) and shows in **Admin > Facebook** for super admins. Nothing is public. You can reply to a comment from that panel.

The Facebook token and Page id are secrets that live only in the Supabase dashboard. Never paste them into chat, a file, or this repository.

## One-time setup

1. **Make a Meta app.** Go to [Meta for Developers, My Apps](https://developers.facebook.com/apps/) and press Create App. Pick the "Other" / business option, name it anything, and finish. Leave it in Development mode. While you are an admin of the app, your own Page works without app review.
2. **Get a Page token.** Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/). Pick your app, press "Get Page Access Token", choose the Michi Institute Page, and tick these permissions: `read_insights`, `pages_read_engagement`, `pages_show_list`, `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_posts`. Approve the pop-up.
3. **Make the token last.** Paste it into the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) and press Extend Access Token. A Page token made from a long-lived user token does not expire. The debugger shows "Expires: Never" when it is right.
4. **Find the Page id.** In the Graph API Explorer, run `me?fields=id,name` with the Page token selected. The `id` is the number you need.
5. **Add the two secrets** at [Edge Function secrets](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/functions/secrets): `FB_PAGE_ID` and `FB_PAGE_TOKEN`. `STATS_CRON_SECRET` is already there from the analytics function.
6. **Run the SQL.** Open the [SQL editor](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/sql/new), paste `supabase/migrations/0098_facebook_page_insights.sql`, and run it.
7. **Create the function.** In [Edge Functions](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/functions) make a new function named `fb-insights` and paste in `supabase/functions/fb-insights/index.ts`. Turn "Verify JWT" off, the same as `site-stats` (the function checks who is asking by itself).
8. **Schedule it.** In [Cron jobs](https://supabase.com/dashboard/project/tiuhyulxdiiiqspysfci/integrations/cron/jobs) add a job every 3 hours that calls the `fb-insights` function with the header `x-cron-secret` set to your `STATS_CRON_SECRET` value and the body `{"action":"pull","days":7}`.
9. Open **Admin > Facebook** and press Refresh now.

## Good to know

- Meta only gives Page Insights to Pages with 100 or more likes. A new Page shows followers and comments straight away, but the daily numbers stay empty until Facebook starts reporting. The panel says so instead of failing.
- Meta has renamed and removed many Insights metrics (`page_fans`, `page_impressions` and the `page_fan_adds` family are gone). The function uses only metrics listed as current in Meta's docs in November 2026, and asks for each one separately, so a retired one drops a single column and not the whole pull. To change the list, edit `METRICS` in the function.
- Messenger direct messages are not included. They need `pages_messaging` and Meta app review.
- The inbox keeps the commenter's public display name and text. No Facebook user ids are stored.
- If the Page token ever stops working (password change, removed from the Page), the panel shows the error from Facebook. Make a new token with steps 2 to 3 and replace `FB_PAGE_TOKEN`.
