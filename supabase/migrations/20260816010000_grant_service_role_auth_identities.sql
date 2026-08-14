-- Fix: the Discord bot's /nominations and /supports commands look up users via
-- public.identities, a security_invoker view over auth.identities (see
-- 20260510120000_fix_identities_view_security_invoker.sql). Under security_invoker,
-- the view runs with the *querying* role's privileges rather than the view owner's,
-- but service_role was never granted direct SELECT on auth.identities itself -
-- only on the view. That left every query through the view failing with a
-- permission error for service_role (confirmed via information_schema.role_table_grants
-- showing only `postgres` had grants on auth.identities), which is what the bot
-- was surfacing to users as "There was an error communicating with the database."
GRANT SELECT ON auth.identities TO service_role;
