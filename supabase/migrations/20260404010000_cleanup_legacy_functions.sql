-- Schema Cleanup: Drop Legacy Functions
-- Keeping only the most recent/relevant version (v6)

DROP FUNCTION IF EXISTS public.cleanup_orphaned_tracks_v2();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_tracks_v3();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_tracks_v4();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_tracks_v5();

-- Also cleanup old redundant search functions if they exist
-- (Checking if they match signatures)
-- No other v-suffixes found in initial grep, but sticking to cleanup_orphaned_tracks for now.

-- If there are any other legacy functions we've identified, they can be added here.
