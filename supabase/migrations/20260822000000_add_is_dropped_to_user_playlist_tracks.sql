-- VGMC-only column, same footing as nomination_game/nomination_song/
-- support_points/support_voters already on this shared table: flags a
-- nomination the RPC would previously have deleted outright once its owner
-- dropped it and its support points hit zero (see isRecordActive in
-- src/lib/vgmcIngest.js). reconcile_vgmc_playlist is updated in the next
-- migration to set this instead of deleting the row, so a dropped
-- nomination's game/song/support history survives and can be shown again
-- behind the "show dropped nominations" toggle. Existing
-- user_playlist_tracks_select_own/_update_own policies already cover this
-- column, no RLS changes needed.
alter table public.user_playlist_tracks
  add column if not exists is_dropped boolean not null default false;
