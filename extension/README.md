# NomPlayer VGMC Sync (browser extension)

> **This is a separate, user-installed Firefox extension — it is not part of the
> nomplayer.app website, is not built by Vite, is not deployed by Cloudflare Pages,
> and does not ship to anyone who isn't running it locally.** Everything in this
> directory is a standalone WebExtension package with its own manifest, config, and
> lint setup (`extension/eslint.config.js`), kept entirely out of the main app's
> `eslint.config.js`, `vite.config.js`, and build output. It's unofficial and not
> affiliated with GameFAQs, GameSpot, or Fandom.

## What it does

Reads a GameFAQs VGMC nomination thread you're already viewing, extracts each post's
`(post id, author, text)`, and sends the batch to nomplayer's `/api/vgmc-ingest`
endpoint. All interpretation of the `+/- Game | Song | Link` convention happens
server-side (`src/lib/vgmcIngest.js` in the main repo) — this extension never decides
what a post means, it only extracts and ships raw data. See the repo root for the
full design writeup.

It requires you to sign in with your NomPlayer account (same credentials as the
website). The playlist it feeds can only ever be changed by the server-side ingest
endpoint — this extension, and no signed-in account, has direct write access to it.

**It does not act on every GameFAQs page.** `content_scripts.matches` in
`manifest.json` covers all GameFAQs boards (broad, so the extension can offer to track
a topic wherever you find one), but the content script itself only ever extracts posts
from topics you've explicitly added to a "followed topics" list — see
[Following a topic](#following-a-topic) below. Nothing is read or sent for a topic
until you've said to track it.

## Before you load it

1. **Fill in `config.js`.** Supabase URL/anon key (same as this repo's `.env`), the
   API base URL, and the `thread_slug` for the VGMC contest you're syncing. One
   `thread_slug` per install — but you can follow any number of GameFAQs topics that
   should all feed it (e.g. a thread and its "part 2" continuation both count toward
   the same contest).
2. **Verify the selectors/URL pattern in `content-script.js`.** They were written
   without being able to load a live GameFAQs page from the build environment, so
   they're a best-effort guess, split into two groups at the top of the file:
   - Topic identity (for the followed-topics gate): `TOPIC_URL_PATTERN`,
     `GAME_TITLE_SELECTOR`.
   - Post extraction: `POST_CONTAINER_SELECTOR`, `POST_ID_ATTR_PATTERN`,
     `AUTHOR_SELECTOR`, `BODY_SELECTOR`, `QUOTE_SELECTOR`.

   Open a real topic, inspect it in devtools, and correct whichever constants don't
   match. Everything past those two sections is selector-agnostic.

3. Make sure a row exists in Supabase's `vgmc_ingest_threads` for your `thread_slug`
   (see the "Manual one-time setup" note in the
   `add_vgmc_ingest_pipeline` migration) and that `functions/api/vgmc-ingest.js` is
   deployed with a `SUPABASE_SERVICE_ROLE_KEY` secret set.

## Loading it (Firefox)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` in this directory.
3. Click the toolbar icon, sign in with your NomPlayer account.

This is a _temporary_ add-on: it's removed when Firefox restarts. For anything longer
than a debugging session, package it (`web-ext build`) and install a signed build, or
reload it via the same page after restarting.

## Following a topic

Nothing is extracted until you tell the extension which topic(s) to watch — there's no
manual typing involved, topic identity comes straight off the page:

- **On the topic page**: a small "Track this page for NomPlayer" button appears in the
  corner of any GameFAQs topic that isn't already followed. Click it — the current
  topic's id, board, game title, and title are read off the URL/DOM, added to your
  followed-topics list, and extraction runs immediately.
- **From the popup**: open a GameFAQs topic, then click **Track this tab** in the
  popup — same effect, useful if you dismissed the on-page button.

Once a topic is followed, it syncs automatically every time you load that page (a
small "NomPlayer: syncing…" badge confirms it), and **Sync now** in the popup re-runs
it on demand. The popup's "Followed topics" list shows everything you're tracking with
a ✕ to stop following a topic (e.g. once a thread's closed and replaced).

## Files

| File                    | Runs where                 | Responsibility                                                              |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------- |
| `manifest.json`         | —                          | WebExtension manifest (MV3, Firefox `browser_specific_settings`).           |
| `config.js`             | background, popup          | Shared constants — the only file you should need to edit per deployment.    |
| `content-script.js`     | GameFAQs page              | Topic-identity + post extraction only. No API calls, no `+/-` parsing.      |
| `background.js`         | extension background       | Owns the session, calls the ingest API, relays tab requests, tracks status. |
| `supabase-auth.js`      | extension background       | Minimal hand-rolled Supabase Auth REST client (sign-in/refresh).            |
| `storage.js`            | background, content script | `browser.storage.local` wrapper for session, status, and followed topics.   |
| `popup.html`/`popup.js` | popup UI                   | Sign in/out, last-sync status, followed-topics list, manual sync/track.     |

No bundler, no `npm install` — every file above is loaded as-is. `supabase-auth.js`
talks to the same GoTrue REST endpoints the website's `supabase-js` client uses, so
sessions it creates are ordinary NomPlayer sessions, just without needing the SDK
bundled into an extension package.

## Chrome, later

Everything here targets Firefox first. Porting to Chrome should mainly mean adding a
`chrome.*`-compatible shim (or the `webextension-polyfill` package) in place of the
bare `browser.*` calls and dropping `browser_specific_settings` — the DOM extraction,
background logic, and API contract don't change.
