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

// --- Post extraction ---------------------------------------------------------------
// Confirmed against a live GameFAQs message board thread (2026-08-13) — a `<table
// class="board message ...">` of `<tr><td class="msg" id="message_<postId>">` rows.
// Each row's `.msg_infobox` holds the poster's name as `data-username` on
// `a.name`; the actual text lives in `.msg_text` (a sibling of `.signature`, so
// selecting `.msg_text` specifically already excludes the signature for free).
// Quoted replies are `<cite>Name posted...</cite><blockquote>quoted text</blockquote>`
// — both need stripping, not just the blockquote, or a quoted "X posted..." line
// lingers as noise (harmless for parsing, but not clean).
const POST_CONTAINER_SELECTOR = 'td.msg[id^="message_"]';
const POST_ID_ATTR_PATTERN = /^(?:msg|message_)?(\d+)$/;
const AUTHOR_SELECTOR = '.msg_infobox a.name[data-username]';
const BODY_SELECTOR = '.msg_text';
const QUOTE_SELECTOR = 'cite, blockquote';

// --- Pagination ----------------------------------------------------------------
// GameFAQs splits a topic's posts across multiple pages (`?page=N` on the same
// topic URL — confirmed against a live thread, 2026-08-13) rather than showing
// them all on one page, so a single-page extraction only ever sees a fraction of
// a long nomination thread. Both the top and bottom of a topic page repeat an
// identical `<ul class="paginate">...Page X of Y...</ul>` control (distinct from
// `<ul class="paginate user">`, the unrelated account-menu dropdown) — that text
// is a far more robust source of the total page count than trying to parse
// individual First/Previous/Next/Last link hrefs, so that's all we rely on here;
// every page URL is then just constructed directly rather than "clicked through".
const PAGINATE_SELECTOR = 'ul.paginate:not(.user)';
const PAGE_COUNT_PATTERN = /Page\s+\d+\s+of\s+(\d+)/i;

function discoverTotalPages(doc) {
  const node = doc.querySelector(PAGINATE_SELECTOR);
  if (!node) return 1;

  const match = node.textContent.match(PAGE_COUNT_PATTERN);
  const total = match ? Number(match[1]) : 1;
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function getCurrentPageNumber() {
  const page = Number(new URLSearchParams(location.search).get('page'));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildPageUrl(pageNumber) {
  return `${location.origin}${location.pathname}?page=${pageNumber}`;
}

/** Same-origin fetch + parse of one other page of this same topic. Never throws —
 * a single failed page shouldn't abort the rest of the crawl. */
async function fetchPagePosts(url) {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return [];
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return extractPosts(doc);
  } catch {
    return [];
  }
}

/** Extracts the current page's posts, then fills in every other page of the same
 * topic (fetched same-origin, no extra host_permissions needed), merging by
 * postId — GameFAQs message ids are unique thread-wide so a plain merge is safe. */
async function crawlAllPages(totalPages) {
  const postsByPostId = new Map();
  for (const post of extractPosts(document)) {
    postsByPostId.set(post.postId, post);
  }

  if (totalPages > 1) {
    const currentPage = getCurrentPageNumber();
    const otherPages = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (page !== currentPage) otherPages.push(page);
    }

    const otherPagePosts = await Promise.all(
      otherPages.map((page) => fetchPagePosts(buildPageUrl(page))),
    );

    for (const posts of otherPagePosts) {
      for (const post of posts) {
        postsByPostId.set(post.postId, post);
      }
    }
  }

  return [...postsByPostId.values()];
}

function extractPostId(element) {
  const match = (element.id || '').match(POST_ID_ATTR_PATTERN);
  return match ? match[1] : null;
}

function extractAuthor(element) {
  const node = element.querySelector(AUTHOR_SELECTOR);
  return node
    ? (node.getAttribute('data-username') || '').trim() || null
    : null;
}

function extractBodyText(element) {
  const node = element.querySelector(BODY_SELECTOR) || element;
  const clone = node.cloneNode(true);
  clone.querySelectorAll(QUOTE_SELECTOR).forEach((quote) => quote.remove());

  // Found live (2026-08-14): GameFAQs renders a poster's own line breaks as
  // literal `<br>` tags inside `.msg_text`, but `.textContent` drops element
  // boundaries entirely — it does NOT insert a newline for `<br>` the way a
  // browser's rendered/visible text would. A post with several nominations,
  // each on its own line, was collapsing into one run-on string with no
  // separator between them. Server-side folding treats one post as one line
  // per '+'/'-' command (src/lib/vgmcIngest.js splits on /\r?\n/), so without
  // this every nomination after the first one line-wise got silently eaten
  // into the *first* line's link field as trailing garbage, and only the post's
  // first command ever parsed. Converting each `<br>` to a real '\n' before
  // reading textContent restores that boundary.
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

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
async function runExtraction() {
  const totalPages = discoverTotalPages(document);
  if (totalPages > 1) {
    showSyncBadge(`NomPlayer: crawling ${totalPages} pages…`);
  }

  const posts = await crawlAllPages(totalPages);
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
