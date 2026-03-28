-- Diagnostic function to check profile existence
create or replace function public.check_user_active(target_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  profile_exists boolean;
  state_exists boolean;
  profile_data jsonb;
begin
  select exists(select 1 from public.profiles where id = target_user_id) into profile_exists;
  select exists(select 1 from public.user_player_states where user_id = target_user_id) into state_exists;

  if profile_exists then
      select json_build_object('username', username) into profile_data from public.profiles where id = target_user_id;
  end if;

  return jsonb_build_object(
    'user_id', target_user_id,
    'profile_exists', profile_exists,
    'state_exists', state_exists,
    'profile_info', profile_data
  );
end;
$$;
