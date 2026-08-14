# Database Functions Overview

This document provides a categorized list and explanation of the database functions defined in the `NomPlayer` schema. These functions handle everything from user authentication to complex track cleanup and full-text search.

## Cloudflare Pages Functions (`functions/api/`)

| Endpoint                     | Method | Auth                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/gamefaqs-vgmc-updates` | GET    | none                                       | Reads the GameFAQs tracked-topics RSS feed for the dashboard's "recent updates" widget.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/api/vgmc-ingest`           | POST   | Supabase bearer token (any signed-in user) | Ingest endpoint for the [VGMC nomination-sync browser extension](../extension/README.md). Verifies the caller is signed in, then folds the full nomination thread (`src/lib/vgmcIngest.js`) and reconciles it into a VGMC playlist via two `service_role`-only RPCs (`ingest_vgmc_thread_posts`, `reconcile_vgmc_playlist`, see `supabase/migrations/20260813000000_add_vgmc_ingest_pipeline.sql`). Being signed in only unlocks _submitting_ raw posts; the actual playlist write only ever happens through this endpoint's service-role credential, never directly by any user.   |
| `/api/vgmc-sheet-sync`       | POST   | Supabase bearer token (any signed-in user) | Writes a signed-in user's own VGMC ratings/comments (sent in the request body, never read from our DB here) into the community reaction Google Sheet. Mints a Google access token itself via a service account (`functions/lib/googleServiceAccount.js`, JWT-bearer flow over Web Crypto, no `googleapis` SDK), so the site's own Google identity does the write rather than the user's; nobody else needs their own Google OAuth consent. Matching/writing logic lives in `src/lib/googleSheets.js`, shared with the client (which only uses it for cheap upfront URL validation). |

## [Business Logic & Integrity](#logic)

| Function                                 | Security | Purpose                                                                                                                      |
| :--------------------------------------- | :------: | :--------------------------------------------------------------------------------------------------------------------------- |
| `check_nomination_before_support()`      | Invoker  | Trigger: Prevents a track from being added to the support list if it is already in the user's nomination list.               |
| `sync_supports_on_nomination_update()`   | Invoker  | Trigger: Automatically removes tracks from the `track_supports` table if they are added to the user's JSON `nominationList`. |
| `derive_profile_username_from_auth(...)` | Definer  | Generates a default username from OAuth metadata (e.g., Discord) or email address.                                           |
| `check_user_active(target_user_id)`      | Definer  | Simple check to see if a user has both a profile and an initialized player state.                                            |

## [Maintenance & Cleanup](#cleanup)

| Function                             | Security | Purpose                                                                                                                                                       |
| :----------------------------------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cleanup_orphaned_tracks_v6()`       | Definer  | **(Aggressive)** Purges tracks that are not reachable from any user lists, history, feedback, or tournament appearances. Also removes malformed/empty tracks. |
| `on_player_state_change_cleanup()`   | Definer  | Trigger: Runs the cleanup sweep selectively when `user_player_states` changes significantly.                                                                  |
| `on_track_supports_change_cleanup()` | Definer  | Trigger: Runs the cleanup sweep when track supports are deleted or updated.                                                                                   |

## [Search & Retrieval](#search)

| Function                              | Security | Purpose                                                                                              |
| :------------------------------------ | :------: | :--------------------------------------------------------------------------------------------------- |
| `search_track_catalog(term, limit)`   |  Stable  | Performs full-text search (GIN-aided) across the `track_catalog` view using `tsvector`.              |
| `get_dashboard_nomination_lists(...)` | Definer  | Retrieves the most recent nomination lists from all users for the "Recent Activity" feed.            |
| `get_nomination_user_profiles()`      | Definer  | Lists all users who have active nominations.                                                         |
| `get_user_youtube_track_listens(...)` | Definer  | Fetches personalized listen history counts and completion stats for a user's YouTube-sourced tracks. |

## [User Management & Onboarding](#user)

| Function                         | Security | Purpose                                                                                              |
| :------------------------------- | :------: | :--------------------------------------------------------------------------------------------------- |
| `handle_new_auth_user()`         | Definer  | Trigger: Automatically creates a `public.profiles` entry when a new user signs up via Supabase Auth. |
| `check_signup_availability(...)` | Definer  | Checks if a requested username or email is available (used during signup).                           |
| `delete_own_user()`              | Definer  | Securely allows a user to delete their own account and all associated data via Supabase Auth.        |

## [Track Scoring & Ingestion](#tracks)

| Function                            | Security | Purpose                                                                                                     |
| :---------------------------------- | :------: | :---------------------------------------------------------------------------------------------------------- |
| `record_youtube_track_listen(...)`  | Definer  | Tracks "started" and "completed" events for YouTube videos, updating the `track_user_listen_history` table. |
| `ingest_youtube_track_sources(...)` | Definer  | Bulk adds new tracks and sources from external video data.                                                  |
| `import_vgmc_catalog_row(...)`      | Definer  | Synchronizes curated tournament data with the `tracks` and `tournaments` tables.                            |

## [Debugging & Admin Tools](#admin)

| Function                       | Security | Purpose                                                                                   |
| :----------------------------- | :------: | :---------------------------------------------------------------------------------------- |
| `debug_track_retention(id)`    | Definer  | Explains why a track was kept by the garbage collector (counts all references).           |
| `find_track_references(id)`    | Definer  | Finds every location in user state JSON where a specific track is referenced.             |
| `find_any_track_reference(id)` | Definer  | Performs a broad text search across all user states to find any mention of a specific ID. |
| `print_user_nominations()`     | Definer  | Dumps all active user nominations into a JSON aggregate for auditing.                     |

---

# Audit: Recommendations & Notes

> [!WARNING]
> **Trigger Redundancy Fixed**
> As of migration `20260405212000`, the redundant `trigger_cleanup_orphaned_tracks` and its wrapper `on_user_player_state_change()` have been DROPPED.
>
> - `cleanup_orphaned_tracks_trigger` is now the sole, optimized driver for this logic.

> [!NOTE]
> **Security Model**
> Most business-critical functions use `SECURITY DEFINER` with a strict `search_path` set to `public`. This is correct for Supabase environments where Row Level Security (RLS) handles raw table access, but these specialized "RPC" functions need elevated privileges to perform multi-table operations.
