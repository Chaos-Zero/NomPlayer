-- RPC to see what's actually in someone's nomination list
create or replace function public.print_user_nominations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'nominations_count', jsonb_array_length(state -> 'nominationList'),
    'nominations_sample', (state -> 'nominationList')
  ))
  into result
  from public.user_player_states
  where state -> 'nominationList' is not null;

  return result;
end;
$$;

grant execute on function public.print_user_nominations() to anon;
grant execute on function public.print_user_nominations() to authenticated;
