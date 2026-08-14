import { parseYouTubeInput } from '../utils/youtube.js';

// Shared Google Sheets logic for the VGMC "reaction sheet" sync feature, pure
// parsing/matching plus plain fetch() calls against the Sheets REST API, with no
// browser- or Workers-specific globals, so the exact same module is imported by
// both the client (VgmcSheetSyncPanel.jsx, for cheap upfront validation of the
// sheet link) and the server (functions/api/vgmc-sheet-sync.js, which does the
// actual read/match/write using a service account, see that file for why this
// isn't a per-user OAuth popup: the site's own Google account does the writing
// so individual VGMC participants never need to touch Google auth at all).

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
 * from the sheet URL, only ever fetches that one tab, not the whole workbook. */
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

/** First row with any content, the header row we match column names against. */
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

/** Converts a spreadsheet column letter ("A", "Z", "AA", "AB", ...) to a
 * 0-based column index. Returns -1 for anything that isn't purely letters. */
export function columnLetterToIndex(letters) {
  const normalized = (letters || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return -1;

  let index = 0;
  for (const char of normalized) {
    index = index * 26 + (char.charCodeAt(0) - 64); // 'A' -> 1, ... 'Z' -> 26
  }
  return index - 1;
}

/**
 * Pure matching pass, no network calls. Walks every existing data row, and for
 * each one whose Link column resolves to a video the current user has rated,
 * queues a cell update for their column. Both columns are identified by
 * letter (e.g. "Q", "AA", "K") rather than header text, the reaction
 * sheet's actual header reads "Link (auto-fill from K2)", not just "Link",
 * so matching on exact header text was fragile; a fixed column letter isn't.
 * Never adds rows: a rated song that isn't already a row in the sheet is
 * simply not matched, by construction, there's nothing to add it *to*.
 */
export function buildSheetUpdates({
  rows,
  headerRowIndex,
  linkColumnLetter = 'K',
  userColumnLetter,
  feedbackByVideoId,
  overwrite = false,
}) {
  const linkColIndex = columnLetterToIndex(linkColumnLetter);
  const userColIndex = columnLetterToIndex(userColumnLetter);

  if (userColIndex === -1) {
    throw new Error(`"${userColumnLetter}" isn't a valid column letter.`);
  }
  if (linkColIndex === -1) {
    throw new Error(`"${linkColumnLetter}" isn't a valid column letter.`);
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
