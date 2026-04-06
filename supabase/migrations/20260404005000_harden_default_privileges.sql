-- Security Hardening: Default Privileges and RESTRICTED execution
-- 1. Revoke default EXECUTE from public for all future functions in public schema
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;

-- 2. Revoke CURRENT execution on ALL functions from anon and authenticated
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- 3. Explicitly GRANT only the safe/public functions back to the appropriate roles

-- PUBLIC ACCESS (GUEST + AUTH)
GRANT EXECUTE ON FUNCTION public.search_track_catalog(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_youtube_track_listen(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_nomination_lists(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_availability(text, text) TO anon, authenticated;

-- AUTHENTICATED ONLY (LOGGED-IN USERS)
GRANT EXECUTE ON FUNCTION public.get_user_youtube_track_listens(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_youtube_track_sources(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_vgmc_catalog_row(integer, text, text, text, text, boolean, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_user() TO authenticated;

-- ADMIN ONLY (SERVICE ROLE)
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_tracks() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_tracks_v6() TO service_role;

-- Ensure service_role still has access to everything
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
