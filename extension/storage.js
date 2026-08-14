// Small browser.storage.local wrapper shared by background.js and popup.js.
// Classic script, sits on the shared global scope as `self.NomplayerStorage`.
(function () {
  const SESSION_KEY = 'nomplayer_vgmc_session';
  const STATUS_KEY = 'nomplayer_vgmc_status';
  const TOPICS_KEY = 'nomplayer_vgmc_followed_topics';

  async function getSession() {
    const stored = await browser.storage.local.get(SESSION_KEY);
    return stored[SESSION_KEY] || null;
  }

  async function setSession(session) {
    await browser.storage.local.set({ [SESSION_KEY]: session });
  }

  async function clearSession() {
    await browser.storage.local.remove(SESSION_KEY);
  }

  async function getStatus() {
    const stored = await browser.storage.local.get(STATUS_KEY);
    return (
      stored[STATUS_KEY] || {
        state: 'idle', // idle | synced | signed_out | error | update_required
        message: null,
        lastSyncedAt: null,
        lastAcceptedPosts: null,
        lastPlaylistSize: null,
      }
    );
  }

  async function setStatus(patch) {
    const current = await getStatus();
    const next = { ...current, ...patch };
    await browser.storage.local.set({ [STATUS_KEY]: next });
    return next;
  }

  // Topics the user has explicitly opted to sync (see content-script.js's
  // "Track this page" button, extracted from the page, never typed in by hand).
  // { topicId, boardId, gameTitle, topicTitle, url, addedAt }[]
  async function getFollowedTopics() {
    const stored = await browser.storage.local.get(TOPICS_KEY);
    return stored[TOPICS_KEY] || [];
  }

  async function isTopicFollowed(topicId) {
    const topics = await getFollowedTopics();
    return topics.some((topic) => topic.topicId === topicId);
  }

  async function addFollowedTopic(topic) {
    const topics = await getFollowedTopics();
    if (topics.some((t) => t.topicId === topic.topicId)) return topics;

    const next = [...topics, { ...topic, addedAt: new Date().toISOString() }];
    await browser.storage.local.set({ [TOPICS_KEY]: next });
    return next;
  }

  async function removeFollowedTopic(topicId) {
    const topics = await getFollowedTopics();
    const next = topics.filter((topic) => topic.topicId !== topicId);
    await browser.storage.local.set({ [TOPICS_KEY]: next });
    return next;
  }

  self.NomplayerStorage = {
    getSession,
    setSession,
    clearSession,
    getStatus,
    setStatus,
    getFollowedTopics,
    isTopicFollowed,
    addFollowedTopic,
    removeFollowedTopic,
  };
})();
