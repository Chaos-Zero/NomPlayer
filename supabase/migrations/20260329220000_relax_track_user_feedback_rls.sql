-- Relax RLS policies for track_user_feedback to allow community visibility
-- This allows guests and other logged-in users to see each other's comments and ratings.

drop policy if exists "track_user_feedback_select_public" on public.track_user_feedback;

create policy "track_user_feedback_select_public"
on public.track_user_feedback
for select
using (true);

-- Ensure anon and authenticated roles have select permissions
grant select on public.track_user_feedback to anon;
grant select on public.track_user_feedback to authenticated;
