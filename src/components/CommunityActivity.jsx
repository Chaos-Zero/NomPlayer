import React, { useEffect, useState, useMemo, useRef } from 'react';
import { fetchCommunityFeedback, upsertUserFeedback } from '../lib/feedback.js';
import {
  getDisplayProfileName,
  deriveProfileAvatarUrl,
} from '../lib/playerState.js';
import { HeartIcon, LockIcon } from './FavouritesPanel.jsx';

export default function CommunityActivity({
  videoId,
  supabase,
  authUser,
  onShowToast,
}) {
  const [trackId, setTrackId] = useState(null);
  const [communityData, setCommunityData] = useState({
    feedback: [],
    supports: {},
  });
  const [userFeedback, setUserFeedback] = useState({
    rating: 0,
    note: '',
  });
  const [pendingFeedback, setPendingFeedback] = useState({
    rating: 0,
    note: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const textareaRef = useRef(null);

  // Auto-expand textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [pendingFeedback.note]);

  const isModified = useMemo(() => {
    return (
      pendingFeedback.rating !== userFeedback.rating ||
      pendingFeedback.note !== userFeedback.note
    );
  }, [pendingFeedback, userFeedback]);

  const peerFeedback = useMemo(() => {
    if (!communityData.feedback) return [];
    return communityData.feedback.filter((f) => f.user_id !== authUser?.id);
  }, [communityData.feedback, authUser?.id]);

  const supportSummary = useMemo(() => {
    const list = communityData.supports || {};
    const total = Object.values(list).reduce((a, b) => a + b, 0);
    return { ...list, total };
  }, [communityData.supports]);

  // Initial Fetch: Resolve track_id and load community data
  useEffect(() => {
    if (!videoId || !supabase) return;

    let active = true;
    setIsLoading(true);

    const fetchData = async () => {
      try {
        const { data: catalogData } = await supabase
          .from('track_catalog')
          .select('track_id')
          .eq('source_external_id', videoId)
          .maybeSingle();

        const tid = catalogData?.track_id;
        if (!tid) {
          if (active) {
            setTrackId(null);
            setCommunityData({ feedback: [], supports: {} });
            setUserFeedback({ rating: 0, note: '' });
            setPendingFeedback({ rating: 0, note: '' });
          }
          return;
        }

        if (active) setTrackId(tid);

        const [feedback, { data: supportData }] = await Promise.all([
          fetchCommunityFeedback(supabase, tid),
          supabase.from('track_supports').select('level').eq('track_id', tid),
        ]);

        if (active) {
          const supports = (supportData || []).reduce((acc, curr) => {
            acc[curr.level] = (acc[curr.level] || 0) + 1;
            return acc;
          }, {});

          setCommunityData({ feedback, supports });

          // Extract current user's feedback if available
          const myFeedback = feedback.find((f) => f.user_id === authUser?.id);
          const initialUserFeedback = {
            rating: myFeedback?.rating || 0,
            note: myFeedback?.note || '',
          };
          setUserFeedback(initialUserFeedback);
          setPendingFeedback(initialUserFeedback);
        }
      } catch (err) {
        console.error('Error fetching community activity:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, [videoId, supabase, authUser?.id]);

  const handleSaveFeedback = async () => {
    if (!supabase || !authUser || !trackId) return;

    setIsSaving(true);
    try {
      await upsertUserFeedback(supabase, authUser.id, trackId, pendingFeedback);

      // Refresh local data
      const feedback = await fetchCommunityFeedback(supabase, trackId);
      setCommunityData((prev) => ({ ...prev, feedback }));
      setUserFeedback(pendingFeedback);

      onShowToast?.('Feedback saved successfully!');
    } catch (err) {
      console.error('Failed to save feedback:', err);
      onShowToast?.('Failed to save feedback.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !trackId) {
    return (
      <div className="community-activity-loading">Loading activity...</div>
    );
  }

  return (
    <div
      className={`player-community-activity ${!trackId ? 'loading-track' : ''}`}
    >
      {/* ─── Community Support Summary (Conditional) ─── */}
      {supportSummary.total > 0 && (
        <section className="list-explorer-info-section">
          <h4>COMMUNITY SUPPORT</h4>
          <div className="list-explorer-support-summary">
            <div className="list-explorer-support-icons">
              {supportSummary[3] > 0 && (
                <div
                  className="support-badge highest"
                  title={`${supportSummary[3]} Highest Supports`}
                >
                  <LockIcon />
                  <span>{supportSummary[3]}</span>
                </div>
              )}
              {supportSummary[2] > 0 && (
                <div
                  className="support-badge high"
                  title={`${supportSummary[2]} High Supports`}
                >
                  <HeartIcon />
                  <span>{supportSummary[2]}</span>
                </div>
              )}
              {supportSummary[1] > 0 && (
                <div
                  className="support-badge normal"
                  title={`${supportSummary[1]} Normal Supports`}
                >
                  <HeartIcon />
                  <span>{supportSummary[1]}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ─── Your Feedback Editor (Always Shown) ─── */}
      <section className="list-explorer-info-section user-feedback">
        <h4>YOUR FEEDBACK</h4>
        {!trackId ? (
          <p className="list-explorer-info-empty" style={{ opacity: 0.6 }}>
            Identifying track data...
          </p>
        ) : (
          <>
            <div className="list-explorer-info-rating-row">
              <span className="label">Rating</span>
              <select
                className="list-explorer-info-rating-select"
                value={pendingFeedback.rating}
                onChange={(e) =>
                  setPendingFeedback((prev) => ({
                    ...prev,
                    rating: parseInt(e.target.value),
                  }))
                }
                disabled={!authUser}
              >
                <option value="0">-</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}/10
                  </option>
                ))}
              </select>
            </div>
            <textarea
              ref={textareaRef}
              className="list-explorer-info-note-editor"
              placeholder={
                authUser
                  ? 'Add a note for the community...'
                  : 'Log in to add feedback'
              }
              value={pendingFeedback.note}
              onChange={(e) =>
                setPendingFeedback((prev) => ({
                  ...prev,
                  note: e.target.value,
                }))
              }
              disabled={!authUser}
              rows={1}
              style={{ minHeight: '38px', overflow: 'hidden', resize: 'none' }}
            />
            {isModified && (
              <div className="feedback-save-row">
                <button
                  className="btn btn-primary btn-save-feedback"
                  onClick={handleSaveFeedback}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Feedback'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPendingFeedback(userFeedback)}
                  disabled={isSaving}
                >
                  Discard
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ─── Community Activity List (Conditional) ─── */}
      {peerFeedback.length > 0 && (
        <section className="list-explorer-info-section community">
          <h4>COMMUNITY ACTIVITY</h4>
          <div className="list-explorer-peer-list">
            {peerFeedback.map((f, i) => (
              <div key={i} className="list-explorer-peer-item">
                <img
                  src={
                    f.profiles
                      ? deriveProfileAvatarUrl(
                          f.profiles,
                          f.profiles.avatar_url,
                        )
                      : ''
                  }
                  alt=""
                  className="list-explorer-peer-avatar"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="list-explorer-peer-content">
                  <div className="list-explorer-peer-header">
                    <span className="list-explorer-peer-user">
                      {getDisplayProfileName(f.profiles?.username, 'Anonymous')}
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
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
