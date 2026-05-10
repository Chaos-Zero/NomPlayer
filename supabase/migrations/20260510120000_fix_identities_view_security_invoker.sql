-- Fix: recreate the identities view with security_invoker = true
-- This removes the implicit SECURITY DEFINER behaviour flagged by Supabase.
-- The view now runs with the querying role's permissions; service_role already
-- has direct access to auth.identities, so nothing changes functionally.

DROP VIEW IF EXISTS public.identities;

CREATE VIEW public.identities
  WITH (security_invoker = true)
AS
SELECT
    user_id,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
FROM auth.identities;

GRANT SELECT ON public.identities TO service_role;
