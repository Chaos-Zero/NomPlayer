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
  // Confirmation step between "Sync my ratings" and the actual write - a
  // wrong column letter here overwrites someone else's column in a shared
  // sheet, so this is the last chance to catch a typo before that happens.
  const [isConfirmingColumn, setIsConfirmingColumn] = useState(false);

  // Resets the form fresh every time this panel reopens - React's recommended
  // way to reset state in response to a prop change (setState during render,
  // not inside an effect - see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
  // same pattern FavouritesPanel.jsx uses for its own "reset on reopen" case.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setColumnLetter('');
      setStatus('idle');
      setResult(null);
      setErrorMessage('');
      setIsConfirmingColumn(false);
    }
  }

  if (!isOpen) return null;

  const isBusy = status === 'syncing';

  // Same validation the sync itself needs, run first so "Sync my ratings"
  // only ever advances to the confirmation screen with a column letter
  // that's actually well-formed - an error here stays on the form (see
  // errorMessage below it) rather than opening a confirmation for garbage
  // input.
  const validateForm = () => {
    if (!parseGoogleSheetUrl(sheetUrl)) {
      setErrorMessage("That doesn't look like a Google Sheets link.");
      setStatus('error');
      return null;
    }
    const normalizedColumnLetter = columnLetter.trim();
    if (columnLetterToIndex(normalizedColumnLetter) === -1) {
      setErrorMessage(
        'Enter your column\'s letter (e.g. "A", "B"..."AA", "AB").',
      );
      setStatus('error');
      return null;
    }
    // A real spreadsheet column letter for a sheet this size is 1-2
    // characters, anything longer is almost always someone typing their
    // column's actual name (e.g. "Cal") by mistake. That still passes
    // columnLetterToIndex (it's letters-only), just as some huge,
    // out-of-range column, so it needs its own check here.
    if (normalizedColumnLetter.length > 2) {
      setErrorMessage(
        `"${normalizedColumnLetter}" looks like a name, not a column letter, try something like "Q" or "AA" instead.`,
      );
      setStatus('error');
      return null;
    }
    if (!supabase) {
      setErrorMessage('Sign in to sync your ratings.');
      setStatus('error');
      return null;
    }
    return normalizedColumnLetter;
  };

  const handleRequestSync = () => {
    const normalizedColumnLetter = validateForm();
    if (normalizedColumnLetter === null) return;
    setErrorMessage('');
    setIsConfirmingColumn(true);
  };

  const handleSync = async () => {
    const normalizedColumnLetter = validateForm();
    if (normalizedColumnLetter === null) return;

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
          user_column_letter: normalizedColumnLetter,
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

  const handleContinueSync = () => {
    setIsConfirmingColumn(false);
    handleSync();
  };

  const handleCancelConfirm = () => {
    setIsConfirmingColumn(false);
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

        {isConfirmingColumn ? (
          <>
            <div
              className="modal-body"
              style={{ padding: '20px', textAlign: 'center' }}
            >
              <p
                style={{
                  color: 'var(--danger, #ef4444)',
                  fontSize: '14px',
                  marginBottom: '8px',
                }}
              >
                You are about to write into column{' '}
                <strong>{columnLetter.trim().toUpperCase()}</strong>.
              </p>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '14px',
                  marginBottom: 0,
                }}
              >
                Please ensure this is the correct column in the spreadsheet.
              </p>
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
                onClick={handleContinueSync}
                style={{ margin: 0 }}
              >
                Continue
              </button>
              <button
                className="btn btn-muted"
                onClick={handleCancelConfirm}
                style={{ margin: 0 }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p
                style={{
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                }}
              >
                Matches your rating and comment for each song against the{' '}
                <strong>Link</strong> column, and fills in your specified
                column. This will only populate empty cells unless the option to
                overwrite is enabled.
              </p>

              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  marginBottom: '4px',
                }}
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
                style={{
                  display: 'block',
                  fontSize: '13px',
                  marginBottom: '4px',
                }}
              >
                Your column's letter, not its name (e.g. "A", "B"... "AA",
                "AB"...)
              </label>
              <input
                type="text"
                value={columnLetter}
                onChange={(e) => setColumnLetter(e.target.value)}
                disabled={isBusy}
                placeholder=""
                style={{ width: '100%', marginBottom: '8px' }}
              />
              <p
                style={{
                  color: 'var(--warning, #f59e0b)',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                ⚠️ Please make sure to double check your column ID before
                syncing.
              </p>

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
                  {result.skippedAmbiguous > 0 &&
                    `${result.skippedAmbiguous} song${result.skippedAmbiguous === 1 ? '' : 's'} appear${result.skippedAmbiguous === 1 ? 's' : ''} in more than one row in the sheet, so ${result.skippedAmbiguous === 1 ? 'it was' : 'they were'} skipped rather than guessed at. `}
                  {result.skippedStale > 0 &&
                    `${result.skippedStale} row${result.skippedStale === 1 ? '' : 's'} changed to a different song between reading and writing, so ${result.skippedStale === 1 ? 'it was' : 'they were'} skipped rather than risk writing to the wrong one. `}
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
                onClick={handleRequestSync}
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
          </>
        )}
      </div>
    </div>
  );
}
