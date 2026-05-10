-- Restrict anon SELECT on profiles to non-sensitive columns.
-- Previously, anon had table-level SELECT which exposed the email column to
-- unauthenticated callers. Column-level grants replace this so anon can only
-- read the fields needed for community display (usernames, avatars).
-- The authenticated role is unaffected and retains full table access.

REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (id, username, avatar_url, gamefaqs_username)
  ON public.profiles TO anon;
