-- Relax RLS policies for track_supports to allow community visibility
-- This allows users to see the total number of supports at each level for any track.

drop policy if exists "track_supports_select_authenticated" on public.track_supports;

create policy "track_supports_select_authenticated"
on public.track_supports
for select
to authenticated
using (true);

-- Ensure public select is also possible if needed (matches other public features)
drop policy if exists "track_supports_select_public" on public.track_supports;
create policy "track_supports_select_public"
on public.track_supports
for select
using (true);
