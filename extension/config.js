// Shared configuration, loaded as a plain classic script before every other script
// (see manifest.json — content_scripts/background/popup all load this first, so it
// sits on the shared global scope as `self.NOMPLAYER_VGMC_CONFIG`).
//
// ↓↓↓ Fill these in before packaging/loading the extension. ↓↓↓
self.NOMPLAYER_VGMC_CONFIG = {
  // Same values as this repo's VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
  // Safe to embed — this is the public anon key, not a secret.
  // Local Supabase (`npm run supabase:start`): http://127.0.0.1:54321 with the
  // anon key `supabase status` prints.
  SUPABASE_URL: 'https://irdhrrfjuwmcytavqrre.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_rxgRd6_U--3UbjWrhEJSEA_SrXanmj4', // gitleaks:allow — public/publishable key, not a secret

  // Where the site's ingest endpoint lives. Use http://localhost:8788 when running
  // `wrangler pages dev dist` locally instead.
  API_BASE_URL: 'https://nomplayer.foldedcal.zone',

  // Which vgmc_ingest_threads row this build feeds. Must match a thread_slug seeded
  // in Supabase (see the "Manual one-time setup" note in the migration). One contest
  // per install — but any number of GameFAQs topics (e.g. a thread and its "part 2"
  // continuation) can feed it, since which topics to watch is chosen per-user at
  // runtime (see storage.js's followed-topics list), not hardcoded here.
  THREAD_SLUG: 'vgmc-20',

  // Bumped whenever the parsing convention on the server changes in a way that makes
  // old submissions unsafe to accept. The server rejects anything below its
  // configured minimum with a 409 — the popup then tells the user to update.
  SCRAPER_VERSION: 1,
};
