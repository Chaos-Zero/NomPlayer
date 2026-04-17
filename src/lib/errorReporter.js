/**
 * errorReporter.js
 *
 * Silently reports application errors to the Discord bot via the feedback API.
 * Uses `type: "log"` so messages land in the dedicated log channel.
 * Never throws — failure to report is swallowed so the caller is not affected.
 */

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_API_URL;
const FEEDBACK_SECRET = import.meta.env.VITE_FEEDBACK_API_SECRET;

/** Derive the /log endpoint from the base feedback API URL. */
function getLogEndpoint() {
  if (!FEEDBACK_URL) return null;
  // Replace the last path segment with /log
  // e.g. https://bot.example.com/feedback → https://bot.example.com/log
  const url = new URL(FEEDBACK_URL);
  url.pathname = url.pathname.replace(/\/[^/]*$/, '/log');
  return url.toString();
}

const LOG_URL = getLogEndpoint();

/**
 * Report an error to the Discord log channel.
 *
 * @param {string} interaction - Short description of what the user was doing (e.g. "Login", "Save track metadata").
 * @param {unknown} error - The caught error object.
 */
export function reportError(interaction, error) {
  if (!LOG_URL) return;

  const errorText =
    error instanceof Error
      ? `${error.message}${error.code ? ` (code: ${error.code})` : ''}`
      : String(error);

  const payload = {
    type: 'log',
    text: `${interaction}\n${errorText}`,
    username: 'System',
    url: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: new Date().toISOString(),
  };

  // Fire-and-forget — never await this
  fetch(LOG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(FEEDBACK_SECRET
        ? { Authorization: `Bearer ${FEEDBACK_SECRET}` }
        : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently swallow — reporting failures must never surface to the user
  });
}
