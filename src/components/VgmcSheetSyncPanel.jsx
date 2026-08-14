import { useState } from 'react';
import {
  buildSheetUpdates,
  fetchSheetGrid,
  findHeaderRow,
  parseGoogleSheetUrl,
  requestSheetsAccessToken,
  writeSheetUpdates,
} from '../lib/googleSheets.js';

const GOOGLE_SHEETS_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_SHEETS_CLIENT_ID || '';

// Hardcoded for now, per explicit request — this is the one VGMC 20 reaction
// sheet this feature targets today. Still editable in the field below in case
// someone's working off a copy.
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1vRu2CbwGp4RFPTSkarhglnRPl6IzZ5jJu4yqkLr83po/edit?gid=0#gid=0';

export default function VgmcSheetSyncPanel({
  isOpen,
  onClose,
  feedbackByVideoId,
}) {
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [userColumn, setUserColumn] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | syncing | done | error
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const isConnected = Boolean(accessToken);
  const isBusy = status === 'connecting' || status === 'syncing';

  const handleConnect = async () => {
    setStatus('connecting');
    setErrorMessage('');
    try {
      const token = await requestSheetsAccessToken(GOOGLE_SHEETS_CLIENT_ID);
      setAccessToken(token);
      setStatus('idle');
    } catch (error) {
      setErrorMessage(error.message || 'Could not connect to Google.');
      setStatus('error');
    }
  };

  const handleSync = async () => {
    if (!accessToken) return;

    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      setErrorMessage("That doesn't look like a Google Sheets link.");
      setStatus('error');
      return;
    }
    if (!userColumn.trim()) {
      setErrorMessage('Enter which column is yours (e.g. "Cal").');
      setStatus('error');
      return;
    }

    setStatus('syncing');
    setErrorMessage('');
    setResult(null);

    try {
      const grid = await fetchSheetGrid(
        accessToken,
        parsed.spreadsheetId,
        parsed.gid,
      );
      const header = findHeaderRow(grid.rows);
      if (!header) {
        throw new Error('Could not find a header row in that sheet tab.');
      }

      const { updates, skippedFilled, noRatingFound } = buildSheetUpdates({
        rows: grid.rows,
        headerRowIndex: header.headerIndex,
        userColumn: userColumn.trim(),
        feedbackByVideoId,
        overwrite,
      });

      await writeSheetUpdates(
        accessToken,
        parsed.spreadsheetId,
        grid.sheetId,
        updates,
      );

      setResult({ filled: updates.length, skippedFilled, noRatingFound });
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
          {!GOOGLE_SHEETS_CLIENT_ID ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Google Sheets sync isn't configured yet on this deployment.
            </p>
          ) : (
            <>
              <p
                style={{
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                }}
              >
                Matches your rating and comment for each song against the{' '}
                <strong>Link</strong> column, and fills in your column — only
                for songs already in the sheet, and only for cells that don't
                already have something in them (unless you turn that off below).
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
                Your column (e.g. "Cal")
              </label>
              <input
                type="text"
                value={userColumn}
                onChange={(e) => setUserColumn(e.target.value)}
                disabled={isBusy}
                placeholder="Cal"
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
            </>
          )}
        </div>

        {GOOGLE_SHEETS_CLIENT_ID && (
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
            {!isConnected ? (
              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={isBusy}
                style={{ margin: 0 }}
              >
                {status === 'connecting'
                  ? 'Connecting…'
                  : 'Connect Google Account'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSync}
                disabled={isBusy}
                style={{ margin: 0 }}
              >
                {status === 'syncing' ? 'Syncing…' : 'Sync my ratings'}
              </button>
            )}
            <button
              className="btn btn-muted"
              onClick={onClose}
              style={{ margin: 0 }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
