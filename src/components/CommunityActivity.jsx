import React, { useEffect, useState, useMemo, useRef } from 'react';
import { fetchCommunityFeedback, upsertUserFeedback } from '../lib/feedback.js';
import {
  getDisplayProfileName,
  deriveProfileAvatarUrl,
} from '../lib/playerState.js';
import { HeartIcon, LockIcon } from './FavouritesPanel.jsx';
import { ContextMenuPortal } from './ContextMenuPortal';

export default function CommunityActivity({
  videoId,
  supabase,
  authUser,
  onShowToast,
}) {
  const [trackId, setTrackId] = useState(null);
  const [supportersMenu, setSupportersMenu] = useState(null);
  const [communityData, setCommunityData] = useState({
    feedback: [],
    supports: {},
    supporterNames: { 1: [], 2: [], 3: [] },
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

    return {
      ...list,
      total,
      1: {
        count: list[1] || 0,
        names: communityData.supporterNames?.[1] || [],
      },
      2: {
        count: list[2] || 0,
        names: communityData.supporterNames?.[2] || [],
      },
      3: {
        count: list[3] || 0,
        names: communityData.supporterNames?.[3] || [],
      },
    };
  }, [communityData.supports, communityData.supporterNames]);

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

          // Resolve supporter names
          const namesByLevel = { 1: [], 2: [], 3: [] };
          const missingProfilesUserIds = [];

          // 1. Check existing feedback for names
          (supportData || []).forEach((sup) => {
            const foundFeedback = feedback.find(
              (f) => f.user_id === sup.user_id,
            );
            if (foundFeedback?.profiles?.username) {
              namesByLevel[sup.level].push(
                getDisplayProfileName(
                  foundFeedback.profiles.username,
                  'Anonymous listener',
                ),
              );
            } else {
              missingProfilesUserIds.push(sup.user_id);
            }
          });

          // 2. Clear duplicates in missing IDs
          const uniqueMissingIds = [...new Set(missingProfilesUserIds)];

          // 3. Optional targeted fetch for names not in feedback list
          if (uniqueMissingIds.length > 0) {
            const { data: missingProfiles } = await supabase
              .from('profiles')
              .select('id, username')
              .in('id', uniqueMissingIds);

            if (missingProfiles) {
              const profileMap = new Map(
                missingProfiles.map((p) => [p.id, p.username]),
              );
              (supportData || []).forEach((sup) => {
                if (profileMap.has(sup.user_id)) {
                  const uname = profileMap.get(sup.user_id);
                  const displayName = getDisplayProfileName(
                    uname,
                    'Anonymous listener',
                  );
                  // Only add if not already added from feedback list
                  if (!namesByLevel[sup.level].includes(displayName)) {
                    namesByLevel[sup.level].push(displayName);
                  }
                }
              });
            }
          }

          // 4. Fill in any remaining unknowns
          (supportData || []).forEach((sup) => {
            // If we still don't have enough names for the count, add anonymous placeholders
            const currentCount = namesByLevel[sup.level].length;
            const targetCount = supports[sup.level] || 0;
            if (currentCount < targetCount) {
              for (let i = 0; i < targetCount - currentCount; i++) {
                namesByLevel[sup.level].push('Anonymous listener');
              }
            }
          });

          setCommunityData({
            feedback,
            supports,
            supporterNames: namesByLevel,
          });

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

  const handleShowSupporters = (event, level) => {
    event.stopPropagation();
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
          </div>
        </section>
      )}

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
