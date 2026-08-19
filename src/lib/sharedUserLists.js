// Backs the `?nominations=<uuid>` / `?supports=<uuid>` shared-link boot
// loader in App.jsx - links the companion Discord bot's "Open in NomPlayer"
// buttons point at (see NomPlayerBot/src/commands/nominations.js and
// supports.js). Nominations and support levels are already public
// throughout the app (the Community Nominations dashboard, support counts
// on track cards), get_user_public_lists just returns one user's slice of
// that instead of the whole community catalog.
export async function fetchUserPublicLists(supabase, userId) {
  const { data, error } = await supabase.rpc('get_user_public_lists', {
    target_user_id: userId,
  });
  if (error) throw error;

  // The RPC returns a username of null (with both lists empty) when
  // target_user_id doesn't match any profile - treat that the same way
  // fetchPlaylistMeta treats a missing/private playlist: "this link
  // doesn't work" rather than a fetch failure.
  if (!data?.username) return null;

  return {
    username: data.username,
    nominationList: Array.isArray(data.nominationList)
      ? data.nominationList
      : [],
    supportList: Array.isArray(data.supportList) ? data.supportList : [],
  };
}
