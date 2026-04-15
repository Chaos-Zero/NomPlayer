-- Fix 403 Forbidden on Nomination Upserts
-- Grant UPDATE permission to authenticated users for track_nominations
GRANT UPDATE ON public.track_nominations TO authenticated;

-- Add RLS policy for updating own nominations
DROP POLICY IF EXISTS "track_nominations_update_own" ON public.track_nominations;
CREATE POLICY "track_nominations_update_own"
ON public.track_nominations FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
