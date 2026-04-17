-- Fix two categories of RLS performance warnings:
--
-- 1. auth_rls_initplan: wrap auth.uid()/auth.role() in (select ...) so the
--    planner evaluates them once per query, not once per row.
--
-- 2. multiple_permissive_policies: remove redundant SELECT policies that are
--    already covered by a broader policy, and split FOR ALL write policies into
--    separate INSERT/UPDATE/DELETE policies to eliminate their SELECT coverage.
--
-- The most impactful fixes for page-load performance are the Category 2B splits
-- on tracks/track_sources/track_tournament_appearances/tournaments. Those tables
-- have a FOR ALL write policy (which includes SELECT) evaluated per-row with a
-- bare auth.role() call. Splitting them into INSERT/UPDATE/DELETE means
-- authenticated SELECT queries fall through to the existing select_public
-- USING(true) policy — identical cost to anonymous queries.

-- ============================================================
-- CATEGORY 2B: Split FOR ALL write policies into INSERT/UPDATE/DELETE
-- (removes the accidental SELECT coverage that conflicts with select_public)
-- ============================================================

-- tournaments
DROP POLICY IF EXISTS "tournaments_write_authenticated" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert_authenticated" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_authenticated" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_authenticated" ON public.tournaments;
CREATE POLICY "tournaments_insert_authenticated" ON public.tournaments
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "tournaments_update_authenticated" ON public.tournaments
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "tournaments_delete_authenticated" ON public.tournaments
  FOR DELETE USING ((select auth.role()) = 'authenticated');

-- tracks
DROP POLICY IF EXISTS "tracks_write_authenticated" ON public.tracks;
DROP POLICY IF EXISTS "tracks_insert_authenticated" ON public.tracks;
DROP POLICY IF EXISTS "tracks_update_authenticated" ON public.tracks;
DROP POLICY IF EXISTS "tracks_delete_authenticated" ON public.tracks;
CREATE POLICY "tracks_insert_authenticated" ON public.tracks
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "tracks_update_authenticated" ON public.tracks
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "tracks_delete_authenticated" ON public.tracks
  FOR DELETE USING ((select auth.role()) = 'authenticated');

-- track_sources
DROP POLICY IF EXISTS "track_sources_write_authenticated" ON public.track_sources;
DROP POLICY IF EXISTS "track_sources_insert_authenticated" ON public.track_sources;
DROP POLICY IF EXISTS "track_sources_update_authenticated" ON public.track_sources;
DROP POLICY IF EXISTS "track_sources_delete_authenticated" ON public.track_sources;
CREATE POLICY "track_sources_insert_authenticated" ON public.track_sources
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "track_sources_update_authenticated" ON public.track_sources
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "track_sources_delete_authenticated" ON public.track_sources
  FOR DELETE USING ((select auth.role()) = 'authenticated');

-- track_tournament_appearances
DROP POLICY IF EXISTS "track_tournament_appearances_write_authenticated" ON public.track_tournament_appearances;
DROP POLICY IF EXISTS "track_tournament_appearances_insert_authenticated" ON public.track_tournament_appearances;
DROP POLICY IF EXISTS "track_tournament_appearances_update_authenticated" ON public.track_tournament_appearances;
DROP POLICY IF EXISTS "track_tournament_appearances_delete_authenticated" ON public.track_tournament_appearances;
CREATE POLICY "track_tournament_appearances_insert_authenticated" ON public.track_tournament_appearances
  FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "track_tournament_appearances_update_authenticated" ON public.track_tournament_appearances
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');
CREATE POLICY "track_tournament_appearances_delete_authenticated" ON public.track_tournament_appearances
  FOR DELETE USING ((select auth.role()) = 'authenticated');

-- ============================================================
-- CATEGORY 2A/2C: Drop redundant SELECT policies
-- (superseded by broader select_public USING(true) policies)
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "track_supports_select_authenticated" ON public.track_supports;
DROP POLICY IF EXISTS "track_supports_select_own" ON public.track_supports;
DROP POLICY IF EXISTS "track_user_feedback_select_all_authenticated" ON public.track_user_feedback;

-- ============================================================
-- CATEGORY 1: Wrap bare auth.uid() in (select auth.uid())
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- user_player_states
DROP POLICY IF EXISTS "player_states_select_own" ON public.user_player_states;
CREATE POLICY "player_states_select_own" ON public.user_player_states
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "player_states_insert_own" ON public.user_player_states;
CREATE POLICY "player_states_insert_own" ON public.user_player_states
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "player_states_update_own" ON public.user_player_states;
CREATE POLICY "player_states_update_own" ON public.user_player_states
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- track_user_listen_history
DROP POLICY IF EXISTS "track_user_listen_history_select_own" ON public.track_user_listen_history;
CREATE POLICY "track_user_listen_history_select_own" ON public.track_user_listen_history
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_user_listen_history_insert_own" ON public.track_user_listen_history;
CREATE POLICY "track_user_listen_history_insert_own" ON public.track_user_listen_history
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_user_listen_history_update_own" ON public.track_user_listen_history;
CREATE POLICY "track_user_listen_history_update_own" ON public.track_user_listen_history
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_user_listen_history_delete_own" ON public.track_user_listen_history;
CREATE POLICY "track_user_listen_history_delete_own" ON public.track_user_listen_history
  FOR DELETE USING ((select auth.uid()) = user_id);

-- track_supports
DROP POLICY IF EXISTS "track_supports_insert_own" ON public.track_supports;
CREATE POLICY "track_supports_insert_own" ON public.track_supports
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_supports_update_own" ON public.track_supports;
CREATE POLICY "track_supports_update_own" ON public.track_supports
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_supports_delete_own" ON public.track_supports;
CREATE POLICY "track_supports_delete_own" ON public.track_supports
  FOR DELETE USING ((select auth.uid()) = user_id);

-- track_user_feedback
DROP POLICY IF EXISTS "track_user_feedback_insert_own" ON public.track_user_feedback;
CREATE POLICY "track_user_feedback_insert_own" ON public.track_user_feedback
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_user_feedback_update_own" ON public.track_user_feedback;
CREATE POLICY "track_user_feedback_update_own" ON public.track_user_feedback
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_user_feedback_delete_own" ON public.track_user_feedback;
CREATE POLICY "track_user_feedback_delete_own" ON public.track_user_feedback
  FOR DELETE USING ((select auth.uid()) = user_id);

-- track_nominations
DROP POLICY IF EXISTS "track_nominations_insert_own" ON public.track_nominations;
CREATE POLICY "track_nominations_insert_own" ON public.track_nominations
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_nominations_update_own" ON public.track_nominations;
CREATE POLICY "track_nominations_update_own" ON public.track_nominations
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "track_nominations_delete_own" ON public.track_nominations;
CREATE POLICY "track_nominations_delete_own" ON public.track_nominations
  FOR DELETE USING ((select auth.uid()) = user_id);

-- user_playlists
DROP POLICY IF EXISTS "user_playlists_select_own" ON public.user_playlists;
CREATE POLICY "user_playlists_select_own" ON public.user_playlists
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_playlists_insert_own" ON public.user_playlists;
CREATE POLICY "user_playlists_insert_own" ON public.user_playlists
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_playlists_update_own" ON public.user_playlists;
CREATE POLICY "user_playlists_update_own" ON public.user_playlists
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_playlists_delete_own" ON public.user_playlists;
CREATE POLICY "user_playlists_delete_own" ON public.user_playlists
  FOR DELETE USING ((select auth.uid()) = user_id);

-- user_playlist_tracks (nested: joins through user_playlists to check owner)
DROP POLICY IF EXISTS "user_playlist_tracks_select_own" ON public.user_playlist_tracks;
CREATE POLICY "user_playlist_tracks_select_own" ON public.user_playlist_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_id AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "user_playlist_tracks_insert_own" ON public.user_playlist_tracks;
CREATE POLICY "user_playlist_tracks_insert_own" ON public.user_playlist_tracks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_id AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "user_playlist_tracks_update_own" ON public.user_playlist_tracks;
CREATE POLICY "user_playlist_tracks_update_own" ON public.user_playlist_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_id AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "user_playlist_tracks_delete_own" ON public.user_playlist_tracks;
CREATE POLICY "user_playlist_tracks_delete_own" ON public.user_playlist_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p
      WHERE p.id = playlist_id AND p.user_id = (select auth.uid())
    )
  );
