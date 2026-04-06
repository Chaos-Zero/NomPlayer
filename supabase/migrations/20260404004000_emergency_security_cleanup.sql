-- Emergency Security Cleanup
-- 1. Drop the arbitrary SQL execution gateway
DROP FUNCTION IF EXISTS public.execute_sql_diagnostic(text);

-- 2. Revoke public/guest execution from sensitive diagnostic and admin functions
-- These should only be accessible via the service_role (admin)
REVOKE EXECUTE ON FUNCTION public.print_user_nominations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_any_track_reference(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_track_references(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_track_retention(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_active(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Revoke guest/user execution from data import/migration tools
REVOKE EXECUTE ON FUNCTION public.import_vgmc_catalog_row(integer, text, text, text, text, boolean, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_youtube_track_sources(jsonb) FROM PUBLIC, anon, authenticated;

-- 4. Revoke direct execution of triggers (which should only be called by the database)
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_user_player_state_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_player_state_change_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_track_supports_change_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_supports_on_nomination_update() FROM PUBLIC, anon, authenticated;

-- Ensure service_role still has access to everything
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
