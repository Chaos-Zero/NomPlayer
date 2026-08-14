// Minimal Supabase GoTrue (Auth) REST client.
//
// Deliberately hand-rolled instead of bundling @supabase/supabase-js: it's three
// small REST calls, and skipping the SDK means this extension stays a plain set of
// files with no build step, load it as-is via about:debugging. It talks to the exact
// same Auth REST API the website's supabase-js client uses under the hood, so tokens
// this produces are indistinguishable from a normal website session server-side.
//
// Classic script, sits on the shared global scope as `self.NomplayerAuth`.
(function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = self.NOMPLAYER_VGMC_CONFIG;

  async function tokenRequest(grantType, body) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.error_description ||
          data?.msg ||
          `Sign-in failed (${response.status}).`,
      );
    }

    return data;
  }

  async function signInWithPassword(email, password) {
    const data = await tokenRequest('password', { email, password });
    return normalizeSession(data);
  }

  async function refreshSession(refreshToken) {
    const data = await tokenRequest('refresh_token', {
      refresh_token: refreshToken,
    });
    return normalizeSession(data);
  }

  function normalizeSession(data) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      email: data.user?.email || null,
    };
  }

  self.NomplayerAuth = { signInWithPassword, refreshSession };
})();
