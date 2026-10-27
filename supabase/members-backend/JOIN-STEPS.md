# Get the member join link working (steps for Frank)

Checked by reading the code in github.com/wrxminion/The-way-site (site/members/app.js, config.js) and the migrations in /mnt/project-files/the-way/site/member/supabase/. I could not reach the live site or the Supabase dashboard from here, so the dashboard items below are a checklist, not something I saw.

## How joining works (what has to be true)

1. A member makes a link at `#/invite`. It is `https://michiinstitute.com/members/?invite=WAY-...`, single use, 14 days. (Needs migration 0007 and 0012. The code calls `create_share_link`.)
2. The friend opens it. The page saves the code in the browser and asks for their email.
3. The page calls Supabase `signInWithOtp` with `shouldCreateUser: true`. Supabase emails a link and a 6-digit code.
4. The friend types the code (or clicks the link). Now they are signed in but not yet a member.
5. The page shows "Welcome", fills in the code, asks for a display name, and calls `redeem_invitation`. They become a member, then set a password.

Every database function in that path exists in the migrations and passes the repo tests on a clean local Postgres 16 (all 9 test files, then 0014 and 0015 on top).

## What can block it today

The database side is not the likely blocker. The likely blockers are Supabase dashboard settings. In order of how often they bite:

1. **New users blocked.** Authentication > Sign In / Providers: "Allow new users to sign up" must be ON, and Email must be ON. The join flow creates the login at step 3. (Signups off gives "Signups not allowed for otp".)
2. **The email has no code.** A brand new person gets the "Confirm signup" template, NOT "Magic Link". Both templates must contain the line `Your code: {{ .Token }}`. config.js has `emailCodes: true`, so the page tells people to type the code. If the template has only a link, they see a code box and no code.
3. **Email not arriving.** Supabase's built-in sender allows only a few emails an hour and often lands in spam. Authentication > SMTP Settings: turn on custom SMTP (Resend or similar) with a sender at a domain you control, and set the OTP expiry to 3600 seconds (default) or more.
4. **Wrong web address.** Authentication > URL Configuration: Site URL `https://michiinstitute.com/members/`. Add to Redirect URLs: `https://michiinstitute.com/members/**`. The old README says members.thewayparty.com; the app now builds its return address from the page it is on (`APP_URL`), so the list must match michiinstitute.com. If you also test on `www.`, add that too (note: www.michiinstitute.com gave an error on Oct 25).
5. **Bot check mismatch.** `turnstileSiteKey` in config.js is empty, so the page sends no human-check token. If Authentication > Bot and Abuse Protection has CAPTCHA turned ON, every sign-in fails ("captcha verification process failed"). Keep it OFF until the Turnstile site key is put in config.js and deployed; then turn it ON in the same sitting.
6. **Missing database pieces.** If 0013 to 0015 were never run, joining still works, but the Review screens and Pull a Thread error out. The run-once file below fixes that and checks the join functions.
7. **Page security rules.** The server `.htaccess` for /members/ must allow connections to `https://tiuhyulxdiiiqspysfci.supabase.co` (and `https://challenges.cloudflare.com` for scripts and frames once Turnstile is on). I cannot see the server file (it is not in git). If the sign-in box does nothing, the browser console will say "Content Security Policy".

## Steps (about 10 minutes)

1. Supabase dashboard > SQL Editor > New query. Paste all of `/mnt/project-files/the-way/members-backend/run-once-join-setup.sql`. Run. It is safe to run twice. If it stops with "earlier updates are missing", send me the message and I will tell you which older file to run first.
2. Read the last result table. Every row should say `ok`. Tell me any row that says `MISSING`. ("at least one active admin exists" must be ok, or nobody can make roles.)
3. Dashboard settings, items 1 to 5 above. Each is a toggle or a text box.
4. Make a test link: sign in as yourself, go to `#/invite`, make a link, open it in a private window with a second email you own.
5. Expected: email arrives with a 6-digit code, type it, pick a display name, set a password, land in the Commons. If any step fails, copy the exact words on the screen and send them; I will map them to a cause (messages are listed in app.js).

## Mapping common error words to causes

| Words on screen | Cause |
|---|---|
| Signups not allowed for otp | Item 1 |
| email rate limit exceeded | Item 3 (built-in sender) |
| captcha verification process failed | Item 5 |
| Token has expired or is invalid | Code older than the expiry, or typed from an older email (each request makes a new code) |
| That invitation code is not valid | Link used, revoked, older than 14 days, or locked to a different email than the one they signed in with |
| You are already a member | They already joined with this email |
| Network or Content Security Policy in console | Item 7 |
