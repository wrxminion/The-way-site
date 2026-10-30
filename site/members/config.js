// Live Supabase project (michi-institute). The publishable key is public by design;
// row-level security in the database is what protects the data.
window.THE_WAY_CONFIG = {
  supabaseUrl: 'https://tiuhyulxdiiiqspysfci.supabase.co',
  supabaseAnonKey: 'sb_publishable_AOufwXBzXDvMaMfh2uWUMw_iGKe2q9l',
  // true once custom SMTP sends the {{ .Token }} code in sign-in emails
  emailCodes: true,
  // Members home news: seconds a member must wait after opening a story before "Mark read" works (the database refuses under 20).
  newsReadSeconds: 60,
  // Cloudflare Turnstile site key (public). Leave '' to switch the human check off.
  // The matching SECRET key goes only into Supabase (Authentication > Bot and Abuse Protection).
  turnstileSiteKey: '0x4AAAAAAFp1RfMi01UJ0Kff',
  readyStates: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"],
};
