create or replace function public.get_user_listen_history(p_limit int default 200)
returns table (
  video_id    text,
  track_id    uuid,
  track_title text,
  game_title  text,
  last_listened_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tc.source_external_id  as video_id,
    h.track_id,
    tc.track_title,
    tc.game_title,
    h.last_listened_at
  from public.track_user_listen_history h
  join public.track_catalog tc on tc.track_id = h.track_id
  where h.user_id = auth.uid()
  order by h.last_listened_at desc
  limit p_limit;
$$;

revoke all on function public.get_user_listen_history(int) from public;
grant execute on function public.get_user_listen_history(int) to authenticated;
