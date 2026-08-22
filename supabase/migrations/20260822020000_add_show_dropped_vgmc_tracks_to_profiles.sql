-- Persist a logged-in user's choice of revealing dropped VGMC nominations
-- (the "show dropped nominations" toggle on the VGMC playlist, bottom-right
-- of the sidebar, off by default) - see showDroppedVgmcTracks in App.jsx and
-- updateShowDroppedVgmcTracksPreference in src/lib/playerState.js. Existing
-- profiles_select_own/profiles_update_own policies already cover this
-- column, no RLS changes needed (same reasoning as vgmc_mode_enabled in
-- 20260814000000_add_vgmc_support_scoring.sql and controls_below_player in
-- 20260819030000_add_controls_below_player_to_profiles.sql).
alter table public.profiles
  add column if not exists show_dropped_vgmc_tracks boolean not null default false;
