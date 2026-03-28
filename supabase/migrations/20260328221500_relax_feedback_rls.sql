-- Relax RLS policies for track_user_feedback to allow community visibility
-- We want all authenticated users to be able to see everyone's feedback,
-- but only the owner can insert, update, or delete their own.

drop policy if exists "track_user_feedback_select_own" on public.track_user_feedback;

create policy "track_user_feedback_select_all_authenticated"
on public.track_user_feedback
for select
to authenticated
using (true);

-- Ensure other policies still exist and are correct (already handled by migration 20260317030000)
-- But we'll re-state them just in case.

drop policy if exists "track_user_feedback_insert_own" on public.track_user_feedback;
create policy "track_user_feedback_insert_own"
on public.track_user_feedback
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "track_user_feedback_update_own" on public.track_user_feedback;
create policy "track_user_feedback_update_own"
on public.track_user_feedback
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "track_user_feedback_delete_own" on public.track_user_feedback;
create policy "track_user_feedback_delete_own"
on public.track_user_feedback
for delete
to authenticated
using (auth.uid() = user_id);
