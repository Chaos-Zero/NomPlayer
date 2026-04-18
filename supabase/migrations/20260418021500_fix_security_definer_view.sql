-- Fix security definer warning for track_catalog view by explicitly setting security_invoker.
-- This is a follow-up to address cases where the view was pushed without this property.
ALTER VIEW public.track_catalog SET (security_invoker = true);

-- Also ensure the search functions are SECURITY INVOKER as a safety measure.
ALTER FUNCTION public.search_track_catalog(text, integer) SECURITY INVOKER;
ALTER FUNCTION public.search_track_catalog_slim(text, integer) SECURITY INVOKER;
ALTER FUNCTION public.get_user_listen_history(integer) SECURITY INVOKER;
