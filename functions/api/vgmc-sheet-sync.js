import {
  buildSheetUpdates,
  fetchSheetGrid,
  findHeaderRow,
  parseGoogleSheetUrl,
  writeSheetUpdates,
} from '../../src/lib/googleSheets.js';
import { getServiceAccountAccessToken } from '../lib/googleServiceAccount.js';
import { verifySupabaseUser } from '../lib/supabaseAuth.js';

// Writes a signed-in NomPlayer user's own VGMC ratings/comments into the
// community reaction spreadsheet, using the *site's* Google identity (a
// service account) rather than the user's own, see VgmcSheetSyncPanel.jsx
// for why: it means nobody else needs their own Google OAuth consent or edit
// access to use this, just a NomPlayer account and edit access already
// granted to the service account itself.
//
// Deliberately still doesn't touch our own database: the client already has
// its own ratings/comments loaded (for the standings view) and sends them
// straight through in the request body, this function only ever talks to
// Google, never to Supabase beyond confirming who's asking.

const MAX_RATINGS_PER_REQUEST = 1000;

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function sanitizeRatings(ratings) {
  if (!Array.isArray(ratings)) return {};

  const feedbackByVideoId = {};
  for (const entry of ratings.slice(0, MAX_RATINGS_PER_REQUEST)) {
    const videoId =
      typeof entry?.videoId === 'string' ? entry.videoId.trim() : '';
    const rating = Number(entry?.rating);
    if (!videoId || !Number.isFinite(rating)) continue;

    feedbackByVideoId[videoId] = {
      rating,
      note: typeof entry?.note === 'string' ? entry.note : '',
    };
  }
  return feedbackByVideoId;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceAccountEmail = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountPrivateKey =
    env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(
      { error: 'Sheet sync endpoint is not configured.' },
      500,
    );
  }
  if (!serviceAccountEmail || !serviceAccountPrivateKey) {
    return jsonResponse(
      { error: 'Google Sheets sync is not configured on this deployment.' },
      500,
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const {
    access_token: accessToken,
    sheet_url: sheetUrl,
    user_column_letter: userColumnLetter,
    overwrite,
    ratings,
  } = payload || {};

  // Gate: must be a real, currently-signed-in NomPlayer user. This is what
  // stops anyone with a browser console from hammering the service account's
  // write quota or spamming the sheet.
  const user = await verifySupabaseUser(supabaseUrl, anonKey, accessToken);
  if (!user) {
    return jsonResponse({ error: 'Sign in required.' }, 401);
  }

  const parsedSheet = parseGoogleSheetUrl(sheetUrl);
  if (!parsedSheet) {
    return jsonResponse(
      { error: "That doesn't look like a Google Sheets link." },
      400,
    );
  }

  const normalizedColumnLetter =
    typeof userColumnLetter === 'string' ? userColumnLetter.trim() : '';
  if (!normalizedColumnLetter) {
    return jsonResponse({ error: 'user_column_letter is required.' }, 400);
  }

  const feedbackByVideoId = sanitizeRatings(ratings);
  if (Object.keys(feedbackByVideoId).length === 0) {
    return jsonResponse({ error: 'No ratings to sync.' }, 400);
  }

  try {
    const googleAccessToken = await getServiceAccountAccessToken(
      serviceAccountEmail,
      serviceAccountPrivateKey,
    );

    const grid = await fetchSheetGrid(
      googleAccessToken,
      parsedSheet.spreadsheetId,
      parsedSheet.gid,
    );

    const header = findHeaderRow(grid.rows);
    if (!header) {
      return jsonResponse(
        { error: 'Could not find a header row in that sheet tab.' },
        422,
      );
    }

    const { updates, skippedFilled, noRatingFound } = buildSheetUpdates({
      rows: grid.rows,
      headerRowIndex: header.headerIndex,
      userColumnLetter: normalizedColumnLetter,
      feedbackByVideoId,
      overwrite: Boolean(overwrite),
    });

    await writeSheetUpdates(
      googleAccessToken,
      parsedSheet.spreadsheetId,
      grid.sheetId,
      updates,
    );

    return jsonResponse({
      filled: updates.length,
      skippedFilled,
      noRatingFound,
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Sync failed.' }, 500);
  }
}
