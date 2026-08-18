import { useMemo, useState } from 'react';
import { partitionStandings } from '../lib/vgmcStandings.js';
import { ReloadIcon } from './Icons.jsx';

const SUB_TABS = [
  { id: 'standings', label: 'Current Standings' },
  { id: 'locked', label: 'Locked Noms' },
];

function tabButtonStyle(isActive) {
  return {
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: isActive ? 'var(--accent, #6d5efc)' : 'var(--bg-card)',
    color: isActive ? '#fff' : 'var(--text)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

/**
 * The left column of the VGMC live page (see App.jsx's isVgmcStandingsPage), a
 * standings table ranked by support points, alongside the normal player (which sits
 * in the remaining right-hand column, comments and all, see App.jsx). This
 * component only owns the table and its own sub-tabs; App.jsx's wrapper controls the
 * column's width (about a third of the view) and the divider between the two. The
 * VGMC/Classic page switch lives in App.jsx instead (see VgmcNavToggle) so it's
 * visible on both pages, not just this one.
 */
export default function VgmcStandingsView({
  rows = [],
  isLoading = false,
  onRefresh,
  onPlayNow,
}) {
  const [activeSubTab, setActiveSubTab] = useState('standings');
  const { standings, locked } = useMemo(() => partitionStandings(rows), [rows]);
  const visibleRows = activeSubTab === 'locked' ? locked : standings;

  // Both standings/locked are already sorted highest-points-first (see
  // partitionStandings), so a simple "points changed since the last row" scan
  // is enough to break the list into point-value sections, no re-sorting or
  // grouping-by-key needed. Rank numbering (#) stays continuous across
  // sections, it reflects overall standing, not position within a section.
  const sections = useMemo(() => {
    const items = [];
    let lastPoints = null;
    visibleRows.forEach((row, index) => {
      if (row.supportPoints !== lastPoints) {
        items.push({
          type: 'header',
          key: `header-${row.supportPoints}`,
          points: row.supportPoints,
        });
        lastPoints = row.supportPoints;
      }
      items.push({ type: 'row', key: row.id, row, rank: index + 1 });
    });
    return items;
  }, [visibleRows]);

  function handlePlayRow(row) {
    if (!onPlayNow || !row.videoId) return;
    // handlePlayNowFromSupportList (App.jsx) plays this transiently, it remembers
    // whatever was actually playing before and resumes it once this ends, so
    // playing a standings row never disturbs the real queue/position.
    onPlayNow({
      videoId: row.videoId,
      provider: row.provider || 'youtube',
      title: row.title,
      gameTitle: row.game || '',
      trackTitle: row.song || '',
    });
  }

  return (
    <div
      className="vgmc-standings-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--bg-card)',
        // border-box, not the content-box default: without it, this div's
        // "16px padding" is ADDED on top of the 100% width instead of eating
        // into it, so it quietly asks its App.jsx wrapper for 32px more than
        // that wrapper's own minWidth floor was sized to give it (see the
        // "Floor matches..." comment there). The wrapper's overflow: hidden
        // hid the shortfall as clipping rather than a scrollbar, but it also
        // meant the table below was landing right on its own min-width with
        // zero margin - one rounding pixel from tipping into a horizontal
        // scrollbar. border-box makes width:100% mean the full box including
        // padding, so the numbers actually match.
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '6px' }}>
          {SUB_TABS.map((tab) => {
            const count =
              tab.id === 'locked' ? locked.length : standings.length;
            return (
              <button
                key={tab.id}
                type="button"
                style={tabButtonStyle(activeSubTab === tab.id)}
                onClick={() => setActiveSubTab(tab.id)}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Icon-only, anchored to the far right of the row (space-between
            above) rather than beside the tabs - title/aria-label carry what
            the old "Refresh"/"Syncing…" button text used to say out loud,
            since there's no label left to read. */}
        <button
          type="button"
          className={`vgmc-standings-refresh-btn${isLoading ? ' is-loading' : ''}`}
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={
            isLoading
              ? 'Updating standings and playlist…'
              : 'Update Standings and Playlist'
          }
          title={isLoading ? 'Updating…' : 'Update Standings and Playlist'}
        >
          <ReloadIcon className="vgmc-standings-refresh-icon" />
        </button>
      </div>

      {/* overflowX hidden, not auto: the table below is sized (fixed layout +
          min-width, see .vgmc-standings-table) to always fit the width this
          pane guarantees it, so a horizontal scrollbar should never be
          needed - hidden makes that a hard guarantee instead of "shouldn't
          happen", silently clipping the rare stray pixel instead of ever
          surfacing a scrollbar. */}
      <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {visibleRows.length === 0 ? (
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '13px',
              padding: '8px 0',
            }}
          >
            {activeSubTab === 'locked'
              ? 'No songs have locked in 7+ support points yet.'
              : 'No songs have more than 1 support point yet.'}
          </p>
        ) : (
          <table
            className="vgmc-standings-table"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            {/* Fixed column widths (index.css), rather than leaving them to
                auto-layout, for two reasons: it's what keeps # / Game / Song /
                Supporters the same width on both sub-tabs (auto layout
                re-measures per render, and Standings/Locked have different
                content, so they used to drift), and it's what makes the
                table's own min-width (see .vgmc-standings-table) actually
                mean something - an auto-layout table has no fixed columns to
                floor in the first place. */}
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <th style={{ padding: '4px 8px' }}>#</th>
                <th style={{ padding: '4px 8px' }}>Game</th>
                <th style={{ padding: '4px 8px' }}>Song</th>
                <th style={{ padding: '4px 8px', textAlign: 'center' }}>
                  Supporters
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((item) =>
                item.type === 'header' ? (
                  <tr key={item.key} className="vgmc-standings-section">
                    <td colSpan={4}>
                      {item.points} Support{item.points === 1 ? '' : 's'}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={item.key}
                    // Alternating tint by overall rank (not row index within
                    // sections array) since that stays continuous across
                    // section-header rows - see .vgmc-standings-row-alt.
                    className={
                      item.rank % 2 === 0
                        ? 'vgmc-standings-row vgmc-standings-row-alt'
                        : 'vgmc-standings-row'
                    }
                    // No dedicated play button anymore, the whole row is the
                    // control: double-click plays the song. handlePlayRow
                    // no-ops without a videoId, so this is safe on any row.
                    onDoubleClick={() => handlePlayRow(item.row)}
                    title="Double click to Play Now"
                    style={{
                      borderTop: '1px solid var(--border)',
                      fontSize: '13px',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 8px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {item.rank}
                    </td>
                    {/* overflowWrap so a long, space-less title (a long
                        compound game name, a CJK title, ...) wraps inside its
                        fixed-width column instead of forcing the column - and
                        with it the table - wider than the pane provides. */}
                    <td
                      style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}
                    >
                      {item.row.game || '-'}
                    </td>
                    <td
                      style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}
                    >
                      {item.row.song || item.row.title}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        textAlign: 'center',
                      }}
                      // The section header already carries the point total;
                      // this column is purely headcount, but points are still
                      // worth spelling out on hover since a ++ counts double
                      // toward points while still being one person.
                      title={`${item.row.supportPoints} support point${item.row.supportPoints === 1 ? '' : 's'} from ${item.row.supportVoters} ${item.row.supportVoters === 1 ? 'person' : 'people'}`}
                    >
                      <span className="vgmc-standings-voters">
                        {item.row.supportVoters}
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
