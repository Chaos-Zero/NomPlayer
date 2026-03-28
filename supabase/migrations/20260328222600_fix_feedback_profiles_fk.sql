-- Add missing foreign key to public.profiles to enable easier joins in community features
-- This allows PostgREST to join profiles directly via user_id

alter table public.track_user_feedback
drop constraint if exists track_user_feedback_user_id_fkey;

alter table public.track_user_feedback
add constraint track_user_feedback_user_id_profiles_fkey
foreign key (user_id) references public.profiles(id) on delete cascade;
