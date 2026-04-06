-- Remove redundant cleanup trigger that ran on every update
-- The 'cleanup_orphaned_tracks_trigger' is now the primary, optimized driver for this logic.

DROP TRIGGER IF EXISTS trigger_cleanup_orphaned_tracks ON public.user_player_states;
DROP FUNCTION IF EXISTS public.on_user_player_state_change();
