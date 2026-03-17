create or replace function public.get_dashboard_nomination_lists(
  limit_count integer default 8
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with nomination_updates as (
    select
      profiles.id as user_id,
      profiles.username,
      profiles.gamefaqs_username,
      profiles.avatar_url,
      user_player_states.updated_at,
      case
        when jsonb_typeof(user_player_states.state -> 'nominationList') = 'array'
          then user_player_states.state -> 'nominationList'
        else '[]'::jsonb
      end as nominations
    from public.user_player_states
    join public.profiles
      on profiles.id = user_player_states.user_id
    where jsonb_array_length(
      case
        when jsonb_typeof(user_player_states.state -> 'nominationList') = 'array'
          then user_player_states.state -> 'nominationList'
        else '[]'::jsonb
      end
    ) > 0
    order by user_player_states.updated_at desc
    limit least(greatest(coalesce(limit_count, 8), 1), 24)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', user_id,
        'username', username,
        'gamefaqs_username', gamefaqs_username,
        'avatar_url', avatar_url,
        'updated_at', updated_at,
        'nominations', nominations
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  )
  from nomination_updates;
$$;

revoke all
on function public.get_dashboard_nomination_lists(integer)
from public;

grant execute
on function public.get_dashboard_nomination_lists(integer)
to anon;

grant execute
on function public.get_dashboard_nomination_lists(integer)
to authenticated;
