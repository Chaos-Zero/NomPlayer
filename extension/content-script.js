// Content script: the only piece of this extension that touches GameFAQs' DOM.
//
// It is a dumb extractor by design (see /src/lib/vgmcIngest.js in the main repo for
// why): it never interprets the '+ Game | Song | Link' convention, it just pulls
// {postId, author, text} per post and hands the array to the background script,
// which does the actual API call. The one exception is quote-block stripping — that
// genuinely has to happen here, because only the DOM (not raw text) reliably tells
// you which lines are a quoted reply vs. the poster's own words.
//
// manifest.json's content_scripts.matches deliberately covers every GameFAQs board —
// this script itself decides whether to act, by checking the current topic against a
// user-maintained "followed topics" list (storage.js). We don't want to be extracting
// from every GameFAQs page anyone happens to be reading. A topic only ever gets added
// to that list by the user explicitly clicking "Track this page" below; topic
// identity (id/board/title) is read straight off the page, so there's nothing to
// type in by hand.
//
// ⚠️ SELECTOR ASSUMPTIONS — VERIFY AGAINST THE LIVE THREAD BEFORE RELYING ON THIS.
// This was written without the ability to browse gamefaqs.gamespot.com from the
// build environment, so every selector/pattern below is a best-effort guess at
// GameFAQs' markup and URL structure. Open a real topic, inspect it in devtools, and
// correct the constants at the top of each section below if they don't match.
/* global NomplayerStorage */

// --- Topic identity (used for the followed-topics gate) ---------------------------
const TOPIC_URL_PATTERN = /\/boards\/(\d+)-([^/]+)\/(\d+)/;
const GAME_TITLE_SELECTOR = '.bc a, .breadcrumb a, .head_nav a';

function humanizeSlug(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Reads {topicId, boardId, gameTitle, topicTitle, url} straight off the page. */
function extractTopicMeta() {
  const match = location.pathname.match(TOPIC_URL_PATTERN);
  if (!match) return null; // not a topic page (e.g. a board listing)

  const [, boardId, gameSlug, topicId] = match;
  const gameNode = document.querySelector(GAME_TITLE_SELECTOR);
  const gameTitle = gameNode?.textContent.trim() || humanizeSlug(gameSlug);
  const topicTitle =
    (document.title || '').split('|')[0].trim() || `Topic ${topicId}`;

  return { topicId, boardId, gameTitle, topicTitle, url: location.href };
}

// --- Post extraction (unchanged once a topic is being followed) -------------------
const POST_CONTAINER_SELECTOR = '.message, [id^="msg"], [id^="message_"]';
const POST_ID_ATTR_PATTERN = /^(?:msg|message_)?(\d+)$/;
const AUTHOR_SELECTOR = '.topic_username, .post_username, .username, .poster';
const BODY_SELECTOR = '.msg_body, .post_body, .message_body, .body';
const QUOTE_SELECTOR = '.quote, blockquote, .quoted_text';

function extractPostId(element) {
  const match = (element.id || '').match(POST_ID_ATTR_PATTERN);
  return match ? match[1] : null;
}

function extractAuthor(element) {
  const node = element.querySelector(AUTHOR_SELECTOR);
  return node ? node.textContent.trim() : null;
}

function extractBodyText(element) {
  const node = element.querySelector(BODY_SELECTOR) || element;
  const clone = node.cloneNode(true);
  clone.querySelectorAll(QUOTE_SELECTOR).forEach((quote) => quote.remove());
  return clone.textContent.trim();
}

/** Pure-ish DOM read; exported shape only, no parsing of the +/- convention. */
function extractPosts(doc) {
  const posts = [];

  for (const element of doc.querySelectorAll(POST_CONTAINER_SELECTOR)) {
    const postId = extractPostId(element);
    const author = extractAuthor(element);
    const text = extractBodyText(element);

    if (!postId || !author || !text) continue;
    posts.push({ postId, author, text });
  }

  return posts;
}

// --- On-page UI ---------------------------------------------------------------------
function badgeBaseStyle() {
  return {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '2147483647',
    background: '#1b1b1f',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    opacity: '0.95',
  };
}

function showSyncBadge(message) {
  document.getElementById('nomplayer-vgmc-badge')?.remove();

  const badge = document.createElement('div');
  badge.id = 'nomplayer-vgmc-badge';
  badge.textContent = message;
  Object.assign(badge.style, badgeBaseStyle());
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 4000);
}

function showTrackButton(meta) {
  if (document.getElementById('nomplayer-vgmc-track-button')) return;

  const button = document.createElement('button');
  button.id = 'nomplayer-vgmc-track-button';
  button.textContent = `Track "${meta.topicTitle}" for NomPlayer`;
  Object.assign(button.style, badgeBaseStyle(), {
    border: 'none',
    cursor: 'pointer',
  });
  button.addEventListener('click', async () => {
    await NomplayerStorage.addFollowedTopic(meta);
    button.remove();
    runExtraction();
  });
  document.body.appendChild(button);
}

// --- Orchestration --------------------------------------------------------------
function runExtraction() {
  const posts = extractPosts(document);
  if (posts.length === 0) return;

  showSyncBadge(
    `NomPlayer: syncing ${posts.length} post${posts.length === 1 ? '' : 's'}…`,
  );
  browser.runtime.sendMessage({ type: 'VGMC_POSTS', posts });
}

async function init() {
  const meta = extractTopicMeta();
  if (!meta) return;

  const followed = await NomplayerStorage.isTopicFollowed(meta.topicId);
  if (followed) {
    runExtraction();
  } else {
    showTrackButton(meta);
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'VGMC_REQUEST_EXTRACT') {
    runExtraction();
  }

  if (message?.type === 'VGMC_TRACK_THIS_PAGE') {
    const meta = extractTopicMeta();
    if (meta) {
      NomplayerStorage.addFollowedTopic(meta).then(runExtraction);
    }
  }
});

init();
