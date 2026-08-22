// Background script: owns the Supabase session, talks to the ingest API, and relays
// status back to the popup. The content script never calls the API directly, this
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

// `topicId` is the GameFAQs topic this batch was scraped from (see
// content-script.js's runExtraction). It travels with the submission so the
// server can track its staleness watermark per-topic rather than once per
// thread_slug: GameFAQs message ids are global, not per-topic, so two
// different topics feeding the same thread_slug (a thread + its "part 2"
// continuation, see THREAD_SLUG's comment in config.js) don't have mutually
// ordered post ids, an older topic's own max id can legitimately sit far
// behind a newer, concurrently-active topic's. A single shared watermark
// mistook that gap for staleness and rejected an otherwise-fine first sync
// of the older topic with a 409 (confirmed live, thread 81182579, 2026-08-22).
async function submitPosts(topicId, posts) {
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
        topic_id: topicId,
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
        message: 'Signed out, please sign in again.',
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

// --- Auto-reload -------------------------------------------------------------------
// Periodically reloads whichever open tabs are sitting on a followed topic, so new
// posts get picked up on their own - content-script.js's init() already re-runs
// extraction on every page load, a plain tab reload is the entire trigger, no new
// content-script logic needed. Deliberately does not open a tab for a followed topic
// that isn't already open somewhere; this is "keep the thread open and let it refresh
// itself", not "go open threads for me".
const AUTO_RELOAD_ALARM_NAME = 'vgmc-auto-reload';

// Same shape as content-script.js's TOPIC_URL_PATTERN, kept as its own copy - that
// one runs in the page context, this runs in the background context, no shared
// module system between "classic script" background/content scripts to import it
// from instead.
const TOPIC_URL_PATTERN = /\/boards\/(\d+)-([^/]+)\/(\d+)/;

function extractTopicIdFromUrl(url) {
  const match = (url || '').match(TOPIC_URL_PATTERN);
  return match ? match[3] : null;
}

async function findFollowedTopicTabs() {
  const followedTopics = await NomplayerStorage.getFollowedTopics();
  if (followedTopics.length === 0) return [];

  const followedTopicIds = new Set(followedTopics.map((t) => t.topicId));
  const tabs = await browser.tabs.query({
    url: 'https://gamefaqs.gamespot.com/boards/*',
  });

  return tabs.filter((tab) =>
    followedTopicIds.has(extractTopicIdFromUrl(tab.url)),
  );
}

async function reloadFollowedTopicTabs() {
  const tabs = await findFollowedTopicTabs();
  // tabs.reload() only affects the tab's content, never which tab/window is
  // focused, so this never steals focus from whatever you're actually doing.
  //
  // allSettled, not all: a single tab that's mid-navigation, got closed the
  // instant before this ran, or otherwise rejects must not sink the whole
  // batch - Promise.all here previously meant one bad reload skipped the
  // status update below entirely (so lastAutoReloadAt silently stopped
  // advancing) and threw an unhandled rejection out of this async function,
  // straight into the alarm listener below with nothing to catch it.
  const results = await Promise.allSettled(
    tabs.map((tab) => browser.tabs.reload(tab.id)),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn(
      `vgmc auto-reload: ${failures.length}/${tabs.length} tab reload(s) failed`,
      failures.map((f) => f.reason),
    );
  }
  await NomplayerStorage.setStatus({
    lastAutoReloadAt: new Date().toISOString(),
    lastAutoReloadTabCount: tabs.length - failures.length,
  });
}

async function scheduleAutoReload() {
  await browser.alarms.clear(AUTO_RELOAD_ALARM_NAME);

  const settings = await NomplayerStorage.getSettings();
  if (!settings.autoReloadEnabled) return;

  // browser.alarms enforces a 1-minute floor on periodInMinutes itself, clamped
  // here too so the popup's own display of the value (and any dev/unpacked build
  // that's more permissive) can't imply a sub-1-minute cadence it won't actually get.
  const periodInMinutes = Math.max(
    1,
    Math.round(settings.autoReloadDelayMinutes),
  );
  browser.alarms.create(AUTO_RELOAD_ALARM_NAME, { periodInMinutes });
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_RELOAD_ALARM_NAME) {
    // Backstop, not the main fix (see the allSettled note inside
    // reloadFollowedTopicTabs) - anything else this could still throw
    // (NomplayerStorage itself, browser.tabs.query) must not become an
    // unhandled rejection in a listener the alarm API itself invoked.
    reloadFollowedTopicTabs().catch((error) =>
      console.error('vgmc auto-reload failed', error),
    );
  }
});

// Re-applies the schedule whenever the background script (re)starts, e.g. the
// browser restarting or the extension reloading - alarms don't survive that on
// their own, this is what makes "auto-reload enabled" actually durable rather than
// only lasting until the next restart.
scheduleAutoReload();

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
      return submitPosts(message.topicId, message.posts);

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

    case 'VGMC_GET_SETTINGS':
      return NomplayerStorage.getSettings();

    case 'VGMC_SET_SETTINGS':
      return NomplayerStorage.setSettings(message.patch).then((next) => {
        // Reschedule immediately rather than waiting for the next background
        // script restart to notice - toggling this off (or changing the delay)
        // should take effect right away, not "eventually".
        scheduleAutoReload();
        return next;
      });

    default:
      return undefined;
  }
});
