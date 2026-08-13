# NomPlayer

A small React/Vite app for loading YouTube videos or playlists into a local playlist, playing them in-page, and saving supported tracks in `localStorage`.

## Requirements

- Node.js 20+
- npm

## Setup

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Environment

Single-video URLs work without any API key.

Playlist loading needs a YouTube Data API key. Copy `.env.example` to `.env` and set:

```bash
VITE_YT_API_KEY=your_key_here
```

User accounts need a Supabase project:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
```

## VGMC Nomination Sync

[`extension/`](extension/README.md) is a separate, standalone Firefox extension for
syncing GameFAQs VGMC nomination threads into a playlist — it's not part of this app
(no build step, own lint config, never bundled or deployed with the site). Its API
counterpart is `functions/api/vgmc-ingest.js`, documented in
[`functions/README.md`](functions/README.md).

The GameFAQs thread convention scores support too (`++`/`--` are worth 2 points,
`+`/`-` are worth 1 — see `src/lib/vgmcIngest.js`), and that score powers a live
standings homepage view (`src/components/VgmcStandingsView.jsx`). It needs
`VITE_VGMC_PLAYLIST_ID` set (the bot-owned playlist the ingest pipeline writes to).
The view itself is opt-in per account for now — toggle "Land on the live VGMC 20
standings view" in Account Settings.

## Supabase Workflow

This repo now manages Supabase schema changes as code with the Supabase CLI.

Common commands:

```bash
npm run supabase:start
npm run supabase:stop
npm run supabase:status
npm run supabase:push
npm run supabase:pull
npm run supabase:migration:new -- add_some_change
```

Or with `just`:

```bash
just supabase-start
just supabase-stop
just supabase-status
just supabase-login
just supabase-link
just supabase-push
just supabase-pull
just supabase-migration name=add_some_change
just supabase-reset
```

To connect this repo to your hosted Supabase project for future pushes:

1. Log in to the CLI:

```bash
npx supabase login
```

2. Link the repo to your hosted project:

```bash
just supabase-link
```

This reads `SUPABASE_PROJECT_REF` from your local `.env`.

3. Push local migrations to the hosted database:

```bash
npx supabase db push
```

You can find the project ref in the Supabase dashboard URL or project settings.

## Scripts

```bash
npm run dev
npm run lint
npm run format
npm run format:check
npm run test
npm run test:watch
npm run build
npm run preview
npm run hooks:install
npm run gitleaks:install
npm run secrets:scan
npm run precommit:run
npm run prepush:run
```

## Deployment Helper

If you use `just`, this repo includes:

```bash
just deploy
```

That pushes `main` to the `github` remote for Cloudflare Pages deployments, while normal `git push` can still target Codeberg.

## Git Hooks

This repo uses native Git hooks:

- `pre-commit`: `gitleaks`, staged `prettier`, staged `eslint --fix`, and basic file-hygiene checks
- `pre-push`: `npm run test` and `npm run build`

Install the repo hooks once per clone:

```bash
npm run hooks:install
```

If `gitleaks` is missing, the hook can prompt to install it automatically in an interactive shell.
You can also install it manually with:

```bash
npm run gitleaks:install
```

After that, the hook will run automatically on commit, and you can run it manually with:

```bash
npm run secrets:scan
npm run precommit:run
npm run prepush:run
```

## Manual Test Checklist

- Load a standard YouTube video URL.
- Load a bare 11-character video ID.
- Load a playlist URL and confirm the sidebar populates.
- Load a playlist URL that includes both `list=` and `v=` and confirm playback starts at the selected item.
- Start playback, then load another video or playlist and confirm the player swaps cleanly.
- Add and remove support-list entries.
- Open the Support list, play an item from it, and drag to reorder.
- Right-click a playlist entry and use `Support` or `Remove from Playlist`.
- Double-click a Support-list item and confirm it queues at the end of the playlist without interrupting the current song.
- Right-click a Support-list item and confirm `Play Now`, `Add to Current Playlist`, and `Remove Support` work.
- Turn on Support-list selection mode, use the circular selectors or `Select all`, and confirm the multi-select context menu excludes `Play Now`.
- Remove the API key and confirm playlist loading shows a useful error.
- Enter invalid input and confirm it does not crash the app.

## Automated Tests

The current automated coverage focuses on the highest-risk state transitions:

- `TopBar` async loading for single videos
- stale async requests being ignored
- `VideoPlayer` play/pause sync
- swapping videos while playback is active

Run the suite with:

```bash
npm run test
```
