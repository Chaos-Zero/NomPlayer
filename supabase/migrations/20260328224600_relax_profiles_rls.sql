-- Relax RLS policies for profiles to allow community visibility
-- This allows users to see each other's usernames and avatars in community feedback.

drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

-- Ensure public select is also possible if needed (matches other public features)
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
on public.profiles
for select
using (true);
