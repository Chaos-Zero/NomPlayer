import { useState } from 'react';
import {
  columnLetterToIndex,
  parseGoogleSheetUrl,
} from '../lib/googleSheets.js';

// Hardcoded for now, per explicit request, this is the one VGMC 20 reaction
// sheet this feature targets today. Still editable in the field below in case
// someone's working off a copy.
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1vRu2CbwGp4RFPTSkarhglnRPl6IzZ5jJu4yqkLr83po/edit?gid=0#gid=0';

// The actual read/match/write happens server-side (functions/api/vgmc-sheet-sync.js),
// using the site's own Google service account rather than the signed-in user's,
// see that file's comment for why. This component's job is just: gather what's
// already loaded client-side (feedbackByVideoId) and hand it to that endpoint.
// There's deliberately no "Connect Google Account" step here anymore.
export default function VgmcSheetSyncPanel({
  isOpen,
  onClose,
  supabase,
  feedbackByVideoId,
}) {
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [columnLetter, setColumnLetter] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | syncing | done | error
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const isBusy = status === 'syncing';

  const handleSync = async () => {
    if (!parseGoogleSheetUrl(sheetUrl)) {
      setErrorMessage("That doesn't look like a Google Sheets link.");
      setStatus('error');
      return;
    }
    if (columnLetterToIndex(columnLetter) === -1) {
      setErrorMessage(
        'Enter your column\'s letter (e.g. "Q" or "AA"), not its name.',
      );
      setStatus('error');
      return;
    }
    if (!supabase) {
      setErrorMessage('Sign in to sync your ratings.');
      setStatus('error');
      return;
    }

    setStatus('syncing');
    setErrorMessage('');
    setResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Sign in to sync your ratings.');
      }

      const ratings = Object.entries(feedbackByVideoId || {}).map(
        ([videoId, feedback]) => ({
          videoId,
          rating: feedback.rating,
          note: feedback.note || '',
        }),
      );

      const response = await fetch('/api/vgmc-sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: accessToken,
          sheet_url: sheetUrl,
          user_column_letter: columnLetter.trim(),
          overwrite,
          ratings,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Sync failed (${response.status}).`);
      }

      setResult(data);
      setStatus('done');
    } catch (error) {
      setErrorMessage(error.message || 'Sync failed.');
      setStatus('error');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px', width: 'calc(100% - 32px)' }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Sync Ratings to Sheet</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px' }}>
          <p
            style={{
              marginBottom: '16px',
              fontSize: '14px',
              color: 'var(--text-secondary)',
            }}
          >
            Matches your rating and comment for each song against the{' '}
            <strong>Link</strong> column, and fills in your column, only for
            songs already in the sheet, and only for cells that don't already
            have something in them (unless you turn that off below).
          </p>

          <label
            style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}
          >
            Sheet link
          </label>
          <input
            type="text"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            disabled={isBusy}
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <label
            style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}
          >
            Your column's letter (e.g. "A", "B"... "AA", "AB"...)
          </label>
          <input
            type="text"
            value={columnLetter}
            onChange={(e) => setColumnLetter(e.target.value)}
            disabled={isBusy}
            placeholder=""
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              disabled={isBusy}
            />
            Overwrite cells that already have a value or note
          </label>

          {errorMessage && (
            <p
              style={{
                color: 'var(--danger, #ef4444)',
                fontSize: '13px',
                marginBottom: '12px',
              }}
            >
              {errorMessage}
            </p>
          )}

          {status === 'done' && result && (
            <p style={{ fontSize: '13px', marginBottom: '12px' }}>
              Filled {result.filled} cell{result.filled === 1 ? '' : 's'}.{' '}
              {result.skippedFilled > 0 &&
                `${result.skippedFilled} already had something and were left alone. `}
              {result.noRatingFound > 0 &&
                `${result.noRatingFound} songs in the sheet have no rating from you yet.`}
            </p>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={isBusy}
            style={{ margin: 0 }}
          >
            {isBusy ? 'Syncing…' : 'Sync my ratings'}
          </button>
          <button
            className="btn btn-muted"
            onClick={onClose}
            style={{ margin: 0 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
