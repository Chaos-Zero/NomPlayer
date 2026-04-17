/*
  # Database Performance Optimizations

  This migration addresses Supabase performance advisory notices regarding
  unindexed foreign keys. Adding these indexes improves the performance of
  joins, deletes, and cross-reference queries.
*/

-- 1. Index track_sources(created_by)
CREATE INDEX IF NOT EXISTS track_sources_created_by_idx ON public.track_sources(created_by);

-- 2. Index track_supports(user_id)
CREATE INDEX IF NOT EXISTS track_supports_user_id_idx ON public.track_supports(user_id);

-- 3. Index track_user_feedback(user_id)
CREATE INDEX IF NOT EXISTS track_user_feedback_user_id_idx ON public.track_user_feedback(user_id);

-- 4. Index tracks(created_by)
CREATE INDEX IF NOT EXISTS tracks_created_by_idx ON public.tracks(created_by);

-- 5. Index user_playlist_tracks(track_id)
CREATE INDEX IF NOT EXISTS user_playlist_tracks_track_id_idx ON public.user_playlist_tracks(track_id);
