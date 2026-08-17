import { parseMediaInput } from '../utils/media.js';

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

const HEADER_ROW_MIN_CELLS = 3;
const HEADER_ROW_MIN_WIDTH_RATIO = 0.5;

/**
 * The header row we match column names against. Not just "the first row
 * with anything in it", a sparse banner/status row above the real headers
 * (a "last updated" note, a title, etc.) also has *some* content, so that
 * alone isn't enough to call it the header. A candidate has to actually
 * look like a header: populated across a real fraction of the sheet's
 * width, not just one or two stray cells. Otherwise everything downstream
 * (link-column detection, row matching) ends up reading data one row too
 * early, and reasoning about the *wrong* row as if it were the header.
 */
export function findHeaderRow(rows) {
  const rowList = rows || [];
  const columnCount = rowList.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
  const minCells = Math.max(
    HEADER_ROW_MIN_CELLS,
    Math.ceil(columnCount * HEADER_ROW_MIN_WIDTH_RATIO),
  );

  const headerIndex = rowList.findIndex(
    (row) => row.filter((cell) => cell.value?.trim()).length >= minCells,
  );
  if (headerIndex === -1) return null;

  return {
    headerIndex,
    headers: rowList[headerIndex].map((cell) => cell.value?.trim() || ''),
  };
}

/** Converts a spreadsheet column letter ("A", "Z", "AA", "AB", ...) to a
 * 0-based column index. Returns -1 for anything that isn't purely letters.
 * Note this accepts any letters-only string, including ones nobody would
 * actually mean as a column ("CAL" decodes to column 2065), callers that
 * know the sheet's real width should also range-check the result against
 * it (see buildSheetUpdates below), since a huge-but-"valid" index just
 * silently expands the sheet instead of erroring. */
export function columnLetterToIndex(letters) {
  const normalized = (letters || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return -1;

  let index = 0;
  for (const char of normalized) {
    index = index * 26 + (char.charCodeAt(0) - 64); // 'A' -> 1, ... 'Z' -> 26
  }
  return index - 1;
}

/** Reverse of columnLetterToIndex: 0-based column index to letters. */
export function indexToColumnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const LINK_HEADER_PATTERN = /link/i;
// "LINK IMP" (an internal/backup link column, not the real one) contains
// "link" too,explicitly excluded from both the header search and the
// content-sniffing fallback below, rather than relying on either to somehow
// prefer the other column on its own.
const LINK_HEADER_EXCLUDE_PATTERN = /imp/i;
const CONTENT_SNIFF_SAMPLE_SIZE = 15;
const CONTENT_SNIFF_MIN_SAMPLES = 3;
const CONTENT_SNIFF_MIN_RATIO = 0.8;

function isExcludedLinkHeader(headerText) {
  return LINK_HEADER_EXCLUDE_PATTERN.test(headerText || '');
}

/**
 * Finds which column holds track links (YouTube/SoundCloud/Bandcamp) without
 * assuming a fixed letter, this sheet's structure has already changed once
 * (K, now L), and pinning a letter in code just means another deploy the
 * next time it moves. Tries the header row first (any header containing
 * "link", not requiring an exact match,the real header reads "Link
 * (auto-fill from K2)",but skipping any header containing "imp", e.g.
 * "LINK IMP"). If nothing matches there, falls back to sniffing actual cell
 * content (also skipping "imp" headers): samples the first several data
 * rows per column and picks whichever one is overwhelmingly (80%+, at least
 * 3 samples) parseable as a recognized track link.
 * Returns -1 if neither approach finds anything.
 */
export function findLinkColumnIndex(rows, headerRowIndex) {
  const headerRow = rows[headerRowIndex] || [];
  const byHeader = headerRow.findIndex(
    (cell) =>
      LINK_HEADER_PATTERN.test(cell?.value || '') &&
      !isExcludedLinkHeader(cell?.value),
  );
  if (byHeader !== -1) return byHeader;

  const dataRows = rows.slice(headerRowIndex + 1);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  let bestColumn = -1;
  let bestRatio = 0;

  for (let col = 0; col < columnCount; col += 1) {
    if (isExcludedLinkHeader(headerRow[col]?.value)) continue;

    let checked = 0;
    let matched = 0;

    for (const row of dataRows) {
      const text = row[col]?.value?.trim();
      if (!text) continue;

      checked += 1;
      if (parseMediaInput(text)?.videoId) matched += 1;
      if (checked >= CONTENT_SNIFF_SAMPLE_SIZE) break;
    }

    if (checked < CONTENT_SNIFF_MIN_SAMPLES) continue;

    const ratio = matched / checked;
    if (ratio >= CONTENT_SNIFF_MIN_RATIO && ratio > bestRatio) {
      bestRatio = ratio;
      bestColumn = col;
    }
  }

  return bestColumn;
}

/**
 * Pure matching pass, no network calls. Walks every existing data row, and for
 * each one whose Link column resolves to a video the current user has rated,
 * queues a cell update for their column. The link column is located
 * automatically (see findLinkColumnIndex) rather than assumed; only the
 * user's own column still needs to be given as a letter, since there's no
 * content to sniff it out from. Never adds rows: a rated song that isn't
 * already a row in the sheet is simply not matched, by construction, there's
 * nothing to add it *to*. If a song's link shows up in more than one row
 * (an archived/duplicate row alongside the current one, say), it's skipped
 * entirely rather than guessed at, see skippedAmbiguous/ambiguousVideoIds
 * in the return value.
 */
export function buildSheetUpdates({
  rows,
  headerRowIndex,
  userColumnLetter,
  feedbackByVideoId,
  overwrite = false,
}) {
  const linkColIndex = findLinkColumnIndex(rows, headerRowIndex);
  const userColIndex = columnLetterToIndex(userColumnLetter);

  if (userColIndex === -1) {
    throw new Error(`"${userColumnLetter}" isn't a valid column letter.`);
  }
  if (linkColIndex === -1) {
    throw new Error(
      'Couldn\'t find a column with YouTube links in it (checked headers containing "link", and the cells themselves).',
    );
  }

  // A word like "Cal" is, letter-wise, indistinguishable from a real (if
  // huge) column code, columnLetterToIndex has no way to know the sheet
  // is only ~48 columns wide. Left unchecked, writing to that index just
  // silently expands the sheet way off to the right instead of erroring,
  // which is exactly what "no errors, wrong cells" looks like from the
  // outside. Catch it here, where the sheet's actual width is known.
  const headerRow = rows[headerRowIndex] || [];
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (userColIndex >= columnCount) {
    const matchingHeaderIndex = headerRow.findIndex(
      (cell) =>
        (cell?.value || '').trim().toLowerCase() ===
        userColumnLetter.trim().toLowerCase(),
    );
    const hint =
      matchingHeaderIndex !== -1
        ? ` Did you mean the letter for the "${headerRow[matchingHeaderIndex].value}" column? That's ${indexToColumnLetter(matchingHeaderIndex)}.`
        : '';
    throw new Error(
      `"${userColumnLetter}" is past the last column in this sheet.${hint}`,
    );
  }

  // First pass: group data rows by the video their Link cell resolves to.
  // Some songs' links show up in more than one row (an archived/duplicate
  // row from an earlier phase, alongside the current one, say), rather
  // than guess which row is the "real" one, any video with more than one
  // matching row is skipped entirely below, so a rating never lands on a
  // stale row, or gets duplicated across both.
  const rowIndexesByVideoId = new Map();
  for (
    let rowIndex = headerRowIndex + 1;
    rowIndex < rows.length;
    rowIndex += 1
  ) {
    const row = rows[rowIndex] || [];
    const linkText = row[linkColIndex]?.value?.trim();
    if (!linkText) continue;

    const videoId = parseMediaInput(linkText)?.videoId;
    if (!videoId) continue;

    if (!rowIndexesByVideoId.has(videoId)) {
      rowIndexesByVideoId.set(videoId, []);
    }
    rowIndexesByVideoId.get(videoId).push(rowIndex);
  }

  const updates = [];
  let skippedFilled = 0;
  let noRatingFound = 0;
  let skippedAmbiguous = 0;
  const ambiguousVideoIds = [];

  for (const [videoId, rowIndexes] of rowIndexesByVideoId) {
    const feedback = feedbackByVideoId[videoId];
    if (!feedback || feedback.rating == null) {
      noRatingFound += 1;
      continue;
    }

    if (rowIndexes.length > 1) {
      skippedAmbiguous += 1;
      ambiguousVideoIds.push(videoId);
      continue;
    }

    const rowIndex = rowIndexes[0];
    const row = rows[rowIndex] || [];
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
      videoId,
    });
  }

  return {
    updates,
    skippedFilled,
    noRatingFound,
    skippedAmbiguous,
    ambiguousVideoIds,
    linkColIndex,
  };
}

/**
 * Re-checks a set of already-computed updates against a fresh read of the
 * sheet, taken as close to write-time as possible. This is a general
 * safety net, not tied to any one cause, the sheet could get edited by
 * someone else, rows could get inserted, anything, the point is just
 * that the row a video's link lived at when first read isn't *guaranteed*
 * to still hold that video by the time we actually write to it, so
 * anything queued against a row whose link has since changed is dropped
 * here rather than written to what's now a different song.
 */
export function filterStaleUpdates({ updates, freshRows, linkColIndex }) {
  const stillValid = [];
  let skippedStale = 0;

  for (const update of updates) {
    const freshLinkText =
      freshRows[update.rowIndex]?.[linkColIndex]?.value?.trim();
    const freshVideoId = freshLinkText
      ? parseMediaInput(freshLinkText)?.videoId
      : null;

    if (freshVideoId === update.videoId) {
      stillValid.push(update);
    } else {
      skippedStale += 1;
    }
  }

  return { updates: stillValid, skippedStale };
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
