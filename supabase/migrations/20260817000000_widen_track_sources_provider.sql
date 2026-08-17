-- Widen public.track_sources to allow SoundCloud/Bandcamp alongside
-- YouTube. The `provider` column and its (provider, external_id) unique
-- constraint already existed generically (see
-- 20260317030000_add_track_catalog.sql) - only the CHECK allow-list was
-- YouTube-only. The YouTube-specific id-format CHECK is already guarded
-- with `provider <> 'youtube' or ...` so it needs no change here: it only
-- ever fires for youtube rows.
alter table public.track_sources
  drop constraint track_sources_provider;

alter table public.track_sources
  add constraint track_sources_provider check (
    provider in ('youtube', 'soundcloud', 'bandcamp')
  );

-- SoundCloud/YouTube tracks can query their own duration client-side via
-- each provider's player API. Bandcamp's embed exposes neither an "ended"
-- event nor a duration, so a Bandcamp source's duration is resolved once
-- server-side at add-time (see functions/api/bandcamp-resolve.js) and
-- cached here - the player uses it to approximate an "ended" timer.
alter table public.track_sources
  add column cached_duration_seconds integer;

alter table public.track_sources
  add constraint track_sources_cached_duration_positive check (
    cached_duration_seconds is null or cached_duration_seconds > 0
  );
