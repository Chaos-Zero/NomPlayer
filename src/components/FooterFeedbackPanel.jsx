import { useEffect, useMemo, useState } from 'react';
import {
  fetchCommunityFeedback,
  upsertUserFeedback,
  deleteUserFeedback,
} from '../lib/feedback.js';
import { ingestYouTubeTrackSources } from '../lib/trackCatalog.js';
import {
  getDisplayProfileName,
  deriveProfileAvatarUrl,
} from '../lib/playerState.js';
import {
  SpeechBubbleIcon,
  HeartIcon,
  LockIcon,
  PencilIcon,
  XIcon,
} from './Icons.jsx';
import { ContextMenuPortal } from './ContextMenuPortal';

export default function FooterFeedbackPanel({
  track,
  supabase,
  authUser,
  userProfile,
  onClose,
  onShowToast,
  anchorRect,
}) {
  const [supportersMenu, setSupportersMenu] = useState(null);
  // To keep the popover aligned when the window resizes (e.g. modal centering)
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Capture the initial window dimensions when the popover opens with a specific anchor
  // Initializing immediately from props prevents a 1-frame position "flash"
  const [initialAnchorContext, setInitialAnchorContext] = useState(() => {
    if (anchorRect) {
      return {
        anchorRect,
        windowWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
        windowHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
      };
    }
    return null;
  });

  useEffect(() => {
    if (anchorRect) {
      setInitialAnchorContext({
        anchorRect,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });
    } else {
      setInitialAnchorContext(null);
    }
  }, [anchorRect]);

  const popoverStyle = useMemo(() => {
    // If we're anchored but don't have the context yet, start hidden to avoid a layout jump
    if (!initialAnchorContext) {
      return {
        opacity: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
      };
    }

    const { anchorRect: baseRect, windowWidth: initW } = initialAnchorContext;
    const padding = 16;
    const panelWidth = 400;
    const vhLimit = windowDimensions.height * 0.7;
    const panelHeight = Math.min(520, vhLimit);

    // Dynamic 'drag along' calculation:
    // If the UI is centered (like the modal), the anchor's left shifts relative to the window center.
    const centerOffset = baseRect.left - initW / 2;
    const currentAnchorLeft = windowDimensions.width / 2 + centerOffset;

    // Default to showing on the right and aligned with the top of the button
    let left = currentAnchorLeft + baseRect.width + 12;
    let top = baseRect.top; // We don't typically center vertically relative to window, but we could if needed

    // If not enough room on right, show on left
    if (left + panelWidth > windowDimensions.width - padding) {
      left = currentAnchorLeft - panelWidth - 12;
    }

    // Final clamping to screen edges
    left = Math.max(
      padding,
      Math.min(left, windowDimensions.width - panelWidth - padding),
    );
    top = Math.max(
      padding,
      Math.min(top, windowDimensions.height - panelHeight - padding),
    );

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      bottom: 'auto',
      right: 'auto',
      transform: 'none',
      zIndex: 30001,
    };
  }, [initialAnchorContext, windowDimensions]);
  const [communityData, setCommunityData] = useState({
    feedback: [],
    supports: {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localComment, setLocalComment] = useState('');
  const [localRating, setLocalRating] = useState('');

  const personalFeedback = useMemo(() => {
    if (!track || !communityData.feedback || !authUser?.id)
      return { rating: null, note: '' };

    const myId = authUser.id;
    const currentTrackId = track.trackId || track.id;

    return (
      communityData.feedback.find((f) => {
        // Must be for this track
        if (currentTrackId && f.track_id && f.track_id !== currentTrackId)
          return false;

        // Match by user_id
        if (f.user_id === myId || f.userId === myId) return true;
        if (f.profiles?.id === myId) return true;
        return false;
      }) || { rating: null, note: '' }
    );
  }, [track, communityData.feedback, authUser?.id]);

  useEffect(() => {
    if (isLoading) return;

    setLocalComment(personalFeedback.note || '');
    setLocalRating(personalFeedback.rating || '');

    // Default to collapsed if feedback exists, or open for new (Wait for load per User Request)
    if (!personalFeedback.rating && !personalFeedback.note) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [personalFeedback, isLoading]);

  const hasChanges = useMemo(() => {
    const savedRating = personalFeedback.rating || '';
    const savedNote = personalFeedback.note || '';

    return (
      String(localRating) !== String(savedRating) || localComment !== savedNote
    );
  }, [localRating, localComment, personalFeedback]);

  const supportSummary = useMemo(() => {
    const list = communityData.supports || {};
    const total = Object.values(list).reduce(
      (a, b) => a + (typeof b === 'object' ? b.count : b),
      0,
    );
    return { ...list, total };
  }, [communityData.supports]);

  useEffect(() => {
    if (!track?.videoId || !supabase) return;

    let active = true;
    setIsLoading(true);

    const fetchData = async () => {
      try {
        const { data: catalogData } = await supabase
          .from('track_catalog')
          .select('track_id')
          .eq('source_external_id', track.videoId)
          .single();

        const trackId = catalogData?.track_id;
        if (!trackId) {
          if (active) setCommunityData({ feedback: [], supports: {} });
          return;
        }

        const [feedback, { data: supportData, error: sError }] =
          await Promise.all([
            fetchCommunityFeedback(supabase, trackId),
            supabase
              .from('track_supports')
              .select('level, user_id')
              .eq('track_id', trackId),
          ]);

        if (sError) throw sError;

        if (active) {
          const supports = {};
          if (supportData && supportData.length > 0) {
            // Group by level first
            supportData.forEach((row) => {
              if (!supports[row.level]) {
                supports[row.level] = { count: 0, names: [], userIds: [] };
              }
              supports[row.level].count += 1;
              if (row.user_id) supports[row.level].userIds.push(row.user_id);
            });

            // Also resolve usernames from the current feedback list (fast cache)
            const profileMap = new Map();
            feedback.forEach((f) => {
              if (f.user_id && f.profiles) {
                profileMap.set(f.user_id, f.profiles.username);
              }
            });

            // Fetch any missing profiles for supporters who haven't left feedback
            const missingUserIds = [
              ...new Set(
                supportData
                  .map((r) => r.user_id)
                  .filter((id) => id && !profileMap.has(id)),
              ),
            ];
            if (missingUserIds.length > 0) {
              try {
                const { data: extraProfiles } = await supabase
                  .from('profiles')
                  .select('id, username')
                  .in('id', missingUserIds);

                if (extraProfiles) {
                  extraProfiles.forEach((p) =>
                    profileMap.set(p.id, p.username),
                  );
                }
              } catch (err) {
                console.error('Error fetching extra profiles:', err);
              }
            }

            // For users not in feedback, we could fetch profiles, but let's start with a safe merge
            Object.values(supports).forEach((tier) => {
              tier.names = tier.userIds.map((uid) => {
                const username = profileMap.get(uid);
                return getDisplayProfileName(username, 'Anonymous listener');
              });
            });
          }

          setCommunityData({ feedback, supports });
        }
      } catch (err) {
        console.error('Error fetching footer feedback:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [track?.videoId, supabase]);

  const handleSaveFeedback = async () => {
    if (!supabase || !authUser || !track) return;
    setIsSaving(true);
    try {
      let trackId = track.trackId;
      if (!trackId || !/^[0-9a-f-]{36}$/i.test(trackId)) {
        const ingested = await ingestYouTubeTrackSources(supabase, [track]);
        if (ingested && ingested.length > 0) {
          trackId = ingested[0].track_id;
        }
      }

      if (!trackId) throw new Error('Could not identify track.');

      await upsertUserFeedback(supabase, authUser.id, trackId, {
        rating: localRating || null,
        note: localComment,
      });

      const feedback = await fetchCommunityFeedback(supabase, trackId);
      setCommunityData((prev) => ({ ...prev, feedback }));
      onShowToast?.('Feedback saved successfully!', 'dashboard');
      setIsEditing(false);
    } catch (err) {
      console.error('Save failed:', err);
      onShowToast?.('Failed to save feedback.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFeedback = async () => {
    if (!supabase || !authUser || !track) return;

    if (
      !window.confirm(
        'Delete your feedback for this track? This cannot be undone.',
      )
    ) {
      return;
    }

    setIsSaving(true);
    try {
      let trackId = track.trackId;
      if (!trackId || !/^[0-9a-f-]{36}$/i.test(trackId)) {
        const ingested = await ingestYouTubeTrackSources(supabase, [track]);
        if (ingested && ingested.length > 0) {
          trackId = ingested[0].track_id;
        }
      }

      if (!trackId) throw new Error('Could not identify track.');

      await deleteUserFeedback(supabase, authUser.id, trackId);

      const feedback = await fetchCommunityFeedback(supabase, trackId);
      setCommunityData((prev) => ({ ...prev, feedback }));
      setLocalComment('');
      setLocalRating('');
      onShowToast?.('Feedback deleted.', 'dashboard');
    } catch (err) {
      console.error('Delete failed:', err);
      onShowToast?.('Failed to delete feedback.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShowSupporters = (event, level) => {
    event.stopPropagation();
    if (!onShowToast) return;

    const summary = supportSummary[level];
    if (!summary || !summary.names || summary.names.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setSupportersMenu({
      names: summary.names,
      level,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  return (
    <div
      className={`list-explorer-info-panel footer-feedback-popover is-open${anchorRect ? ' is-anchored' : ''}`}
      style={popoverStyle}
    >
      <div className="list-explorer-info-header footer-header">
        <div className="footer-feedback-track-info">
          <div className="footer-feedback-game-title">
            {track?.gameTitle || track?.game || 'Unknown Game'}
          </div>
          <div className="footer-feedback-track-title">
            {track?.trackTitle || track?.title || 'Unknown Track'}
          </div>
        </div>
        <button className="list-explorer-info-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="list-explorer-info-content-wrapper footer-feedback-wrapper">
        <div className="list-explorer-info-content">
          {authUser && isEditing && (
            <section className="list-explorer-info-section">
              <div className="section-header-row">
                <h4>YOUR FEEDBACK</h4>
                {userProfile && (
                  <div className="user-feedback-identity">
                    <img
                      src={deriveProfileAvatarUrl(
                        userProfile,
                        userProfile.avatar_url,
                      )}
                      alt=""
                      className="list-explorer-peer-avatar miniature"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <span className="list-explorer-peer-user">
                      {getDisplayProfileName(userProfile.username, 'Anonymous')}
                    </span>
                  </div>
                )}
              </div>
              <div className="list-explorer-info-personal">
                <div className="list-explorer-info-rating-row">
                  <span className="label">Rating:</span>
                  <select
                    className="list-explorer-info-rating-select"
                    value={localRating}
                    onChange={(ev) =>
                      setLocalRating(parseInt(ev.target.value) || '')
                    }
                  >
                    <option value="">No Rating</option>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {r} / 10
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  className="list-explorer-info-note-editor"
                  placeholder="Add personal notes or comments..."
                  value={localComment}
                  onChange={(e) => setLocalComment(e.target.value)}
                />
                {(hasChanges ||
                  isSaving ||
                  personalFeedback.rating ||
                  personalFeedback.note) && (
                  <div className="list-explorer-info-feedback-actions footer-actions">
                    <div className="feedback-save-row-left">
                      {hasChanges && (
                        <button
                          className="btn-save-feedback"
                          onClick={handleSaveFeedback}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save Feedback'}
                        </button>
                      )}
                    </div>
                    {(personalFeedback.rating || personalFeedback.note) &&
                      !hasChanges && (
                        <button
                          className="btn-delete-feedback btn btn-ghost"
                          onClick={handleDeleteFeedback}
                          disabled={isSaving}
                          style={{
                            color: 'var(--text-dim)',
                            fontSize: '12px',
                            padding: '0 8px',
                          }}
                        >
                          Delete Feedback
                        </button>
                      )}
                  </div>
                )}
              </div>
            </section>
          )}

          {supportSummary.total > 0 && (
            <section className="list-explorer-info-section">
              <h4>COMMUNITY SUPPORT</h4>
              <div className="list-explorer-support-summary">
                {supportSummary.total > 0 ? (
                  <div className="list-explorer-support-icons">
                    {supportSummary[3]?.count > 0 && (
                      <button
                        className="support-badge highest"
                        type="button"
                        onClick={(e) => handleShowSupporters(e, 3)}
                        title={`${supportSummary[3].count} Highest Supports (Click to see names)`}
                      >
                        <LockIcon />
                        <span>{supportSummary[3].count}</span>
                      </button>
                    )}
                    {supportSummary[2]?.count > 0 && (
                      <button
                        className="support-badge high"
                        type="button"
                        onClick={(e) => handleShowSupporters(e, 2)}
                        title={`${supportSummary[2].count} High Supports (Click to see names)`}
                      >
                        <HeartIcon />
                        <span>{supportSummary[2].count}</span>
                      </button>
                    )}
                    {supportSummary[1]?.count > 0 && (
                      <button
                        className="support-badge normal"
                        type="button"
                        onClick={(e) => handleShowSupporters(e, 1)}
                        title={`${supportSummary[1].count} Normal Supports (Click to see names)`}
                      >
                        <HeartIcon />
                        <span>{supportSummary[1].count}</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          )}

          <section className="list-explorer-info-section community">
            <h4>COMMUNITY ACTIVITY</h4>
            {isLoading ? (
              <div
                className="dashboard-modal-loading-container"
                style={{ minHeight: '100px' }}
              >
                <div className="hero-loader-spinner" />
              </div>
            ) : communityData.feedback.length === 0 ? (
              <p className="list-explorer-info-empty">
                No community feedback yet.
              </p>
            ) : (
              <div className="list-explorer-peer-list">
                {communityData.feedback.map((f, i) => (
                  <div
                    key={i}
                    className={`list-explorer-peer-item${f.user_id === authUser?.id ? ' is-owner' : ''}`}
                  >
                    <img
                      src={deriveProfileAvatarUrl(
                        f.profiles,
                        f.profiles?.avatar_url,
                      )}
                      alt=""
                      className="list-explorer-peer-avatar"
                    />
                    <div className="list-explorer-peer-content">
                      <div className="list-explorer-peer-header">
                        <span className="list-explorer-peer-user">
                          {getDisplayProfileName(
                            f.profiles?.username,
                            'Anonymous',
                          )}
                        </span>
                        {f.rating && (
                          <span className="list-explorer-peer-rating">
                            {f.rating}/10
                          </span>
                        )}
                      </div>
                      {f.note && (
                        <p className="list-explorer-peer-note">{f.note}</p>
                      )}
                    </div>

                    {f.user_id === authUser?.id && (
                      <div className="list-explorer-peer-actions">
                        <button
                          className="btn btn-ghost btn-edit-activity"
                          title="Edit Feedback"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEditing(true);
                          }}
                        >
                          <PencilIcon className="activity-action-icon" />
                        </button>
                        <button
                          className="btn btn-ghost btn-delete-activity"
                          title="Delete Feedback"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFeedback();
                          }}
                        >
                          <XIcon className="activity-action-icon" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {supportersMenu && (
        <ContextMenuPortal
          x={supportersMenu.x}
          y={supportersMenu.y}
          onClose={() => setSupportersMenu(null)}
          className="supporters-popover"
        >
          <div className="supporters-popover-header">
            {supportersMenu.level === 3
              ? 'Highest'
              : supportersMenu.level === 2
                ? 'High'
                : 'Normal'}{' '}
            Supports
          </div>
          <div
            className="supporters-list"
            onClick={() => setSupportersMenu(null)}
          >
            {supportersMenu.names.map((name, i) => (
              <div key={i} className="supporters-list-item">
                {name}
              </div>
            ))}
          </div>
        </ContextMenuPortal>
      )}
    </div>
  );
}
