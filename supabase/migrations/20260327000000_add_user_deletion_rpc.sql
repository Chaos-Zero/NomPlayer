-- Function to allow a user to delete their own account from auth.users
-- This is a security definer function so it can delete from the protected auth schema
create or replace function public.delete_own_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  active_user_id uuid := auth.uid();
begin
  if active_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Delete from auth.users. This will trigger cascading deletes on all profiles and user data.
  delete from auth.users where id = active_user_id;
end;
$$;

-- Revoke all permissions and grant only to authenticated users
revoke all on function public.delete_own_user() from public;
grant execute on function public.delete_own_user() to authenticated;
