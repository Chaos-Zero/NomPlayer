import { useEffect, useMemo, useState } from 'react';
import { fetchCommunityFeedback, upsertUserFeedback } from '../lib/feedback.js';
import { ingestYouTubeTrackSources } from '../lib/trackCatalog.js';
import { getDisplayProfileName } from '../lib/playerState.js';
import { SpeechBubbleIcon, HeartIcon, LockIcon } from './FavouritesPanel.jsx';

export default function FooterFeedbackPanel({
  track,
  supabase,
  authUser,
  onClose,
  onShowToast,
  anchorRect,
}) {
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
    setLocalComment(personalFeedback.note || '');
    setLocalRating(personalFeedback.rating || '');
  }, [personalFeedback]);

  const peerFeedback = useMemo(() => {
    if (!track || !communityData.feedback) return [];
    return communityData.feedback.filter((f) => f.user_id !== authUser?.id);
  }, [track, communityData.feedback, authUser?.id]);

  const supportSummary = useMemo(() => {
    const list = communityData.supports || {};
    const total = Object.values(list).reduce((a, b) => a + b, 0);
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

        const [feedback, { data: supportData }] = await Promise.all([
          fetchCommunityFeedback(supabase, trackId),
          supabase
            .from('track_supports')
            .select('level')
            .eq('track_id', trackId),
        ]);

        if (active) {
          const supports = (supportData || []).reduce((acc, curr) => {
            acc[curr.level] = (acc[curr.level] || 0) + 1;
            return acc;
          }, {});
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
    } catch (err) {
      console.error('Save failed:', err);
      onShowToast?.('Failed to save feedback.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deriveProfileAvatarUrl = (profile) => {
    if (profile?.avatar_url) return profile.avatar_url;
    return null;
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
          {authUser && (
            <section className="list-explorer-info-section">
              <h4>YOUR FEEDBACK</h4>
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
                <div className="list-explorer-info-feedback-actions footer-actions">
                  <button
                    className="btn-save-feedback"
                    onClick={handleSaveFeedback}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Feedback'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {supportSummary.total > 0 && (
            <section className="list-explorer-info-section">
              <h4>COMMUNITY SUPPORT</h4>
              <div className="list-explorer-support-summary">
                <div className="list-explorer-support-icons">
                  <div
                    className="support-badge normal"
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      borderColor: '#f59e0b',
                      color: '#fbbf24',
                    }}
                  >
                    <HeartIcon />
                    <span style={{ marginLeft: '6px' }}>
                      {supportSummary.total}
                    </span>
                  </div>
                </div>
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
            ) : peerFeedback.length === 0 ? (
              <p className="list-explorer-info-empty">
                No community feedback yet.
              </p>
            ) : (
              <div className="list-explorer-peer-list">
                {peerFeedback.map((f, i) => (
                  <div key={i} className="list-explorer-peer-item">
                    <div className="list-explorer-peer-header">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <img
                          src={deriveProfileAvatarUrl(f.profiles)}
                          alt=""
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: '1.5px solid #6366f1',
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <span
                          className="list-explorer-peer-user"
                          style={{ color: '#fbbf24' }}
                        >
                          {getDisplayProfileName(
                            f.profiles?.username,
                            'Anonymous',
                          )}
                        </span>
                      </div>
                      {f.rating && (
                        <span
                          className="list-explorer-peer-rating"
                          style={{
                            background: 'rgba(124, 58, 237, 0.2)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            color: '#c4b5fd',
                          }}
                        >
                          {f.rating}/10
                        </span>
                      )}
                    </div>
                    {f.note && (
                      <p
                        className="list-explorer-peer-note"
                        style={{ marginTop: '8px' }}
                      >
                        {f.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
