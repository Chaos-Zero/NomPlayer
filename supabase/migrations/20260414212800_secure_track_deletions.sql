-- Enable RLS on track_deletions
ALTER TABLE public.track_deletions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to track_deletions
DROP POLICY IF EXISTS "track_deletions_select_all" ON public.track_deletions;
CREATE POLICY "track_deletions_select_all"
ON public.track_deletions FOR SELECT
USING (true);
