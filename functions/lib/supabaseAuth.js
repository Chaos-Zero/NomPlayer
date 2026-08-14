// Shared by any Cloudflare Function that needs to confirm "this request is
// coming from a real, currently-signed-in NomPlayer user" before doing
// anything privileged, used instead of trusting a user id sent in the body.

export async function verifySupabaseUser(supabaseUrl, anonKey, accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
    });
    if (!response.ok) return null;

    const user = await response.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}
