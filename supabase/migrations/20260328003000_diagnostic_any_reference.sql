-- Diagnostic function to find ANY reference in user_player_states
create or replace function public.find_any_track_reference(target_id text)
returns table (
  user_id uuid,
  path text,
  full_state jsonb
)
language plpgsql
security definer
as $$
begin
  return query
  select
    ups.user_id,
    'state'::text,
    ups.state
  from public.user_player_states ups
  where ups.state::text like '%' || target_id || '%';
end;
$$;
