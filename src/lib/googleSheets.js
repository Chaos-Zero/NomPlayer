import { parseYouTubeInput } from '../utils/youtube.js';

// Client-side Google Sheets integration for the VGMC "reaction sheet" sync
// feature (see VgmcSheetSyncPanel.jsx). Deliberately has no server component at
// all: Google Identity Services hands the browser a Sheets-scoped access token
// directly (no client secret, no redirect back through our own backend), and
// everything after that is a plain fetch() to the Sheets REST API using that
// token. We already have the user's ratings/comments loaded client-side for the
// VGMC standings view, so there's nothing here that touches our own DB.
//
// Requires a Google Cloud OAuth Client ID (VITE_GOOGLE_SHEETS_CLIENT_ID) — see
// README for the one-time console setup; that part can't be automated from here.

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise = null;

function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error('Google sign-in is only available in the browser.'),
    );
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

/** Opens Google's consent popup and resolves with a short-lived (~1hr) Sheets
 * access token. Nothing is persisted — reconnecting is required each session,
 * which is a deliberate tradeoff of staying fully client-side (no refresh token
 * without a backend to hold it safely). */
export async function requestSheetsAccessToken(clientId) {
  if (!clientId) {
    throw new Error(
      'Google Sheets sync is not configured (missing client ID).',
    );
  }
  await loadGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(
          new Error(
            error?.message || 'Google sign-in was cancelled or failed.',
          ),
        );
      },
    });
    tokenClient.requestAccessToken();
  });
}

/** Pulls {spreadsheetId, gid} out of any Google Sheets URL shape. */
export function parseGoogleSheetUrl(url) {
  const str = (url || '').trim();
  if (!str) return null;

  const idMatch = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;

  const gidMatch = str.match(/[?#&]gid=(\d+)/);

  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch ? Number(gidMatch[1]) : 0,
  };
}

async function sheetsApiError(response) {
  const body = await response.json().catch(() => ({}));
  return new Error(
    body?.error?.message || `Sheets API error (${response.status})`,
  );
}

async function resolveSheetTitle(accessToken, spreadsheetId, gid) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
  );
  url.searchParams.set('fields', 'sheets.properties(sheetId,title)');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await sheetsApiError(response);

  const data = await response.json();
  const sheet = (data.sheets || []).find((s) => s.properties?.sheetId === gid);
  if (!sheet) {
    throw new Error('Could not find that tab (gid) in the spreadsheet.');
  }
  return sheet.properties.title;
}

/** Reads one tab's full grid (values + any existing notes), keyed by the gid
 * from the sheet URL — only ever fetches that one tab, not the whole workbook. */
export async function fetchSheetGrid(accessToken, spreadsheetId, gid) {
  const title = await resolveSheetTitle(accessToken, spreadsheetId, gid);

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
  );
  url.searchParams.set('ranges', title);
  url.searchParams.set('includeGridData', 'true');
  url.searchParams.set(
    'fields',
    'sheets(properties(sheetId,title),data(rowData(values(formattedValue,note))))',
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await sheetsApiError(response);

  const data = await response.json();
  const sheet = data.sheets?.[0];
  if (!sheet) throw new Error('Could not read that sheet tab.');

  const rowData = sheet.data?.[0]?.rowData || [];

  return {
    sheetId: sheet.properties.sheetId,
    title: sheet.properties.title,
    rows: rowData.map((row) =>
      (row.values || []).map((cell) => ({
        value: cell.formattedValue ?? '',
        note: cell.note ?? '',
      })),
    ),
  };
}

/** First row with any content — the header row we match column names against. */
export function findHeaderRow(rows) {
  const headerIndex = (rows || []).findIndex((row) =>
    row.some((cell) => cell.value?.trim()),
  );
  if (headerIndex === -1) return null;

  return {
    headerIndex,
    headers: rows[headerIndex].map((cell) => cell.value?.trim() || ''),
  };
}

/**
 * Pure matching pass — no network calls. Walks every existing data row, and for
 * each one whose Link column resolves to a video the current user has rated,
 * queues a cell update for their column. Never adds rows: a rated song that
 * isn't already a row in the sheet is simply not matched, by construction —
 * there's nothing to add it *to*.
 */
export function buildSheetUpdates({
  rows,
  headerRowIndex,
  linkColumnHeader = 'Link',
  userColumn,
  feedbackByVideoId,
  overwrite = false,
}) {
  const headers = rows[headerRowIndex].map((cell) => cell.value?.trim() || '');
  const linkColIndex = headers.findIndex(
    (header) => header.toLowerCase() === linkColumnHeader.toLowerCase(),
  );
  const userColIndex = headers.findIndex(
    (header) => header.toLowerCase() === (userColumn || '').toLowerCase(),
  );

  if (linkColIndex === -1) {
    throw new Error(
      `Couldn't find a "${linkColumnHeader}" column in that sheet.`,
    );
  }
  if (userColIndex === -1) {
    throw new Error(
      `Couldn't find a column named "${userColumn}" in that sheet.`,
    );
  }

  const updates = [];
  let skippedFilled = 0;
  let noRatingFound = 0;

  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < rows.length;
    rowIndex += 1
  ) {
    const row = rows[rowIndex] || [];
    const linkText = row[linkColIndex]?.value?.trim();
    if (!linkText) continue;

    const videoId = parseYouTubeInput(linkText)?.videoId;
    if (!videoId) continue;

    const feedback = feedbackByVideoId[videoId];
    if (!feedback || feedback.rating == null) {
      noRatingFound += 1;
      continue;
    }

    const targetCell = row[userColIndex];
    const hasExistingContent = Boolean(
      targetCell?.value?.trim() || targetCell?.note?.trim(),
    );
    if (hasExistingContent && !overwrite) {
      skippedFilled += 1;
      continue;
    }

    updates.push({
      rowIndex,
      columnIndex: userColIndex,
      rating: feedback.rating,
      note: feedback.note || '',
    });
  }

  return { updates, skippedFilled, noRatingFound };
}

/** Writes value+note cell updates in one batch request. */
export async function writeSheetUpdates(
  accessToken,
  spreadsheetId,
  sheetId,
  updates,
) {
  if (!updates || updates.length === 0) return null;

  const requests = updates.map(({ rowIndex, columnIndex, rating, note }) => ({
    updateCells: {
      range: {
        sheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      rows: [
        {
          values: [
            {
              userEnteredValue: { numberValue: rating },
              note: note || undefined,
            },
          ],
        },
      ],
      fields: 'userEnteredValue,note',
    },
  }));

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!response.ok) throw await sheetsApiError(response);

  return response.json();
}
