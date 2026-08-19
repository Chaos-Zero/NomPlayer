-- Persist a logged-in user's choice of moving the playback transport
-- controls (shuffle/prev/play/next/preview) below the player instead of
-- their default spot in the top bar - see the playback-relocate-btn toggle
-- in TopBar.jsx/VideoPlayer.jsx and isPlaybackControlsBelowPlayer in
-- App.jsx. Existing profiles_select_own/profiles_update_own policies
-- already cover this column, no RLS changes needed (same reasoning as
-- vgmc_mode_enabled in 20260814000000_add_vgmc_support_scoring.sql).
alter table public.profiles
  add column if not exists controls_below_player boolean not null default false;
