// Background script: owns the Supabase session, talks to the ingest API, and relays
// status back to the popup. The content script never calls the API directly — this
// keeps the API call out of GameFAQs' page context entirely (no page CSP/CORS to
// fight) and keeps the access token out of any page-visible context.
/* global NOMPLAYER_VGMC_CONFIG, NomplayerAuth, NomplayerStorage */

const { API_BASE_URL, THREAD_SLUG, SCRAPER_VERSION } = NOMPLAYER_VGMC_CONFIG;
const REFRESH_SKEW_MS = 60_000;

async function getValidAccessToken() {
  const session = await NomplayerStorage.getSession();
  if (!session) return null;

  if (Date.now() < session.expiresAt - REFRESH_SKEW_MS) {
    return session.accessToken;
  }

  try {
    const refreshed = await NomplayerAuth.refreshSession(session.refreshToken);
    await NomplayerStorage.setSession(refreshed);
    return refreshed.accessToken;
  } catch {
    await NomplayerStorage.clearSession();
    return null;
  }
}

function maxWatermark(posts) {
  return posts.reduce((max, post) => {
    const value = Number(post.post_id ?? post.postId);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

async function submitPosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return;

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    await NomplayerStorage.setStatus({
      state: 'signed_out',
      message: 'Sign in to sync nominations.',
    });
    return;
  }

  const normalizedPosts = posts.map((post) => ({
    post_id: String(post.postId),
    author: post.author,
    text: post.text,
  }));

  try {
    const response = await fetch(`${API_BASE_URL}/api/vgmc-ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        thread_slug: THREAD_SLUG,
        scraper_version: SCRAPER_VERSION,
        watermark: maxWatermark(normalizedPosts),
        posts: normalizedPosts,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      await NomplayerStorage.clearSession();
      await NomplayerStorage.setStatus({
        state: 'signed_out',
        message: 'Signed out — please sign in again.',
      });
      return;
    }

    if (response.status === 409) {
      await NomplayerStorage.setStatus({
        state: 'update_required',
        message: data.error || 'This extension needs an update.',
      });
      return;
    }

    if (!response.ok) {
      await NomplayerStorage.setStatus({
        state: 'error',
        message: data.error || `Sync failed (${response.status}).`,
      });
      return;
    }

    await NomplayerStorage.setStatus({
      state: 'synced',
      message: null,
      lastSyncedAt: new Date().toISOString(),
      lastAcceptedPosts: data.acceptedPosts,
      lastPlaylistSize: data.playlistSize,
    });
  } catch (error) {
    await NomplayerStorage.setStatus({
      state: 'error',
      message: error.message || 'Network error while syncing.',
    });
  }
}

async function findActiveGameFaqsTab() {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
    url: 'https://gamefaqs.gamespot.com/boards/*',
  });
  return tabs[0] || null;
}

async function requestSyncFromActiveTab() {
  const tab = await findActiveGameFaqsTab();
  if (!tab) {
    await NomplayerStorage.setStatus({
      state: 'error',
      message: 'Open the nomination thread in this tab first.',
    });
    return;
  }

  await browser.tabs.sendMessage(tab.id, { type: 'VGMC_REQUEST_EXTRACT' });
}

async function requestTrackFromActiveTab() {
  const tab = await findActiveGameFaqsTab();
  if (!tab) {
    await NomplayerStorage.setStatus({
      state: 'error',
      message: 'Open a GameFAQs topic in this tab first.',
    });
    return;
  }

  await browser.tabs.sendMessage(tab.id, { type: 'VGMC_TRACK_THIS_PAGE' });
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== 'string') return undefined;

  switch (message.type) {
    case 'VGMC_POSTS':
      return submitPosts(message.posts);

    case 'VGMC_SIGN_IN':
      return NomplayerAuth.signInWithPassword(
        message.email,
        message.password,
      ).then(
        async (session) => {
          await NomplayerStorage.setSession(session);
          await NomplayerStorage.setStatus({ state: 'idle', message: null });
          return { ok: true };
        },
        (error) => ({ ok: false, error: error.message }),
      );

    case 'VGMC_SIGN_OUT':
      return NomplayerStorage.clearSession().then(() =>
        NomplayerStorage.setStatus({ state: 'signed_out', message: null }),
      );

    case 'VGMC_GET_SESSION':
      return NomplayerStorage.getSession();

    case 'VGMC_GET_STATUS':
      return NomplayerStorage.getStatus();

    case 'VGMC_SYNC_NOW':
      return requestSyncFromActiveTab();

    case 'VGMC_TRACK_ACTIVE_TAB':
      return requestTrackFromActiveTab();

    case 'VGMC_GET_FOLLOWED_TOPICS':
      return NomplayerStorage.getFollowedTopics();

    case 'VGMC_REMOVE_FOLLOWED_TOPIC':
      return NomplayerStorage.removeFollowedTopic(message.topicId);

    default:
      return undefined;
  }
});
