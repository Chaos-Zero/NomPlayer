-- Expose auth.identities as a view in the public schema
-- This allows the Discord bot to look up users by their provider_id (Discord ID)
-- while maintaining security by only exposing non-sensitive columns.

CREATE VIEW public.identities AS
SELECT
    user_id,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
FROM auth.identities;

-- Ensure the service_role (used by the bot) has access to this view
GRANT SELECT ON public.identities TO service_role;

-- Optional: If the bot ever needs to be used with an anon/authenticated key,
-- you would add grants for those roles here, but for now we keep it restricted.
