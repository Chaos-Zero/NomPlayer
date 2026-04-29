import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDisplayProfileName } from '../lib/playerState.js';
import { SearchIcon } from './Icons.jsx';

function PlaySvg() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.25 4.67v10.66c0 .58.64.94 1.14.63l8.36-5.33c.47-.3.47-.96 0-1.26L7.39 4.04c-.5-.31-1.14.05-1.14.63z" />
    </svg>
  );
}

const COVER_GRADIENTS = [
  ['#7c3aed', '#3b1d6e'],
  ['#0ea5e9', '#1d4ed8'],
  ['#f59e0b', '#92400e'],
  ['#10b981', '#0ea5e9'],
  ['#ec4899', '#7c3aed'],
  ['#ef4444', '#7c3aed'],
  ['#6366f1', '#ec4899'],
  ['#f472b6', '#f59e0b'],
  ['#1d4ed8', '#10b981'],
  ['#38bdf8', '#7c3aed'],
];

function playlistGradient(id = '') {
  const num = parseInt(id.replace(/-/g, '').slice(0, 8), 16) || 0;
  const [a, b] = COVER_GRADIENTS[Math.abs(num) % COVER_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function avatarInitials(username = '') {
  const name = getDisplayProfileName(username) || '?';
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr) {
  const d = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return '1d ago';
  if (d < 7) return `${Math.floor(d)}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function CplAvatar({ username, userId, avatarUrl, size = 'sm' }) {
  return (
    <div
      className={`cpl-avatar cpl-avatar-${size}`}
      style={
        avatarUrl
          ? {}
          : { background: playlistGradient(userId || username || '') }
      }
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 'inherit',
          }}
        />
      ) : (
        avatarInitials(username)
      )}
    </div>
  );
}

function SortControls({ sortBy, onChange }) {
  return (
    <div className="cpl-sort-row">
      {[
        ['newest', 'Newest'],
        ['most-tracks', 'Most tracks'],
        ['a-z', 'A–Z'],
      ].map(([val, label]) => (
        <button
          key={val}
          className={`cpl-sort-btn${sortBy === val ? ' on' : ''}`}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PlaylistCard({ playlist, onLoad, onAdd, loadingId, isOwn }) {
  const busy = loadingId === playlist.id;
  const isPrivate = isOwn && !playlist.is_public;
  return (
    <div className="cpl-card">
      <div className="cpl-card-cover">
        {playlist.firstThumbnail ? (
          <img
            src={playlist.firstThumbnail}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="cpl-card-gradient"
            style={{ background: playlistGradient(playlist.id) }}
          />
        )}
        <span className="cpl-track-badge">{playlist.trackCount} tracks</span>
        {isPrivate && <span className="cpl-private-badge">Private</span>}
        <div className="cpl-card-overlay">
          <button
            className="cpl-play-btn"
            onClick={() => onLoad(playlist)}
            disabled={busy}
            title="Play Playlist"
          >
            <PlaySvg />
          </button>
        </div>
      </div>
      <div className="cpl-card-body">
        <div className="cpl-card-name">{playlist.name}</div>
        <div className="cpl-card-creator">
          <CplAvatar
            username={playlist.profile?.username}
            userId={playlist.user_id}
            avatarUrl={playlist.profile?.avatar_url}
          />
          <span className="cpl-card-username">
            {getDisplayProfileName(playlist.profile?.username)}
          </span>
          <span className="cpl-card-date">{timeAgo(playlist.created_at)}</span>
        </div>
        <div className="cpl-card-actions">
          <button
            className="cpl-action-btn cpl-action-primary"
            onClick={() => onLoad(playlist)}
            disabled={busy}
          >
            {busy ? '…' : 'Play'}
          </button>
          <button
            className="cpl-action-btn"
            onClick={() => onAdd(playlist)}
            disabled={busy}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommunityPlaylistsView({
  supabase,
  authUser,
  onPlayPlaylist,
  onAddToPlaylist,
  onShowToast,
}) {
  const [playlists, setPlaylists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [featuredSeed, setFeaturedSeed] = useState(Math.random());
  const authUserId = authUser?.id ?? null;

  const fetchPlaylists = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('user_playlists')
        .select(
          'id, name, is_public, created_at, updated_at, user_id, user_playlist_tracks(count)',
        )
        .eq('is_active_queue', false)
        .order('created_at', { ascending: false });

      if (authUserId) {
        query = query.or(`is_public.eq.true,user_id.eq.${authUserId}`);
      } else {
        query = query.eq('is_public', true);
      }

      const { data: rawPls, error: plErr } = await query;
      if (plErr) throw plErr;

      const playlistIds = (rawPls || []).map((p) => p.id);
      const userIds = [...new Set((rawPls || []).map((p) => p.user_id))];

      let profileMap = {};
      let thumbnailMap = {};

      await Promise.all([
        userIds.length > 0 &&
          supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', userIds)
            .then(({ data }) => {
              (data || []).forEach((p) => {
                profileMap[p.id] = p;
              });
            }),
        playlistIds.length > 0 &&
          supabase
            .from('user_playlist_tracks')
            .select(
              'playlist_id, order_index, tracks(track_sources(external_id, cached_thumbnail_url, is_primary))',
            )
            .in('playlist_id', playlistIds)
            .order('order_index', { ascending: true })
            .then(({ data }) => {
              for (const pt of data || []) {
                if (thumbnailMap[pt.playlist_id]) continue;
                const src =
                  pt.tracks?.track_sources?.find((s) => s.is_primary) ??
                  pt.tracks?.track_sources?.[0];
                if (src) {
                  thumbnailMap[pt.playlist_id] =
                    src.cached_thumbnail_url ||
                    `https://i.ytimg.com/vi/${src.external_id}/mqdefault.jpg`;
                }
              }
            }),
      ]);

      setPlaylists(
        (rawPls || []).map((pl) => ({
          ...pl,
          trackCount: Number(pl.user_playlist_tracks?.[0]?.count ?? 0),
          profile: profileMap[pl.user_id] || null,
          firstThumbnail: thumbnailMap[pl.id] || null,
        })),
      );
    } catch (err) {
      console.error('CommunityPlaylistsView fetch error:', err);
      onShowToast?.('Failed to load community playlists');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, authUserId, onShowToast]);

  useEffect(() => {
    if (!supabase) return;
    fetchPlaylists();
  }, [supabase, fetchPlaylists]);

  useEffect(() => {
    setFeaturedSeed(Math.random());
  }, [selectedUserId]);

  async function fetchTracks(playlistId) {
    const { data, error } = await supabase
      .from('user_playlist_tracks')
      .select(
        `order_index, track_id,
         tracks (
           id, canonical_game_title, canonical_track_title,
           track_sources (
             external_id, cached_title, cached_channel_title,
             cached_thumbnail_url, is_primary
           )
         )`,
      )
      .eq('playlist_id', playlistId)
      .order('order_index');
    if (error) throw error;
    return (data || [])
      .map((pt) => {
        const track = pt.tracks;
        const src =
          track?.track_sources?.find((s) => s.is_primary) ??
          track?.track_sources?.[0];
        if (!src) return null;
        return {
          videoId: src.external_id,
          trackId: pt.track_id,
          title:
            src.cached_title ||
            [track.canonical_game_title, track.canonical_track_title]
              .filter(Boolean)
              .join(' – '),
          displayTitle:
            track.canonical_track_title || src.cached_title || src.external_id,
          channelTitle: src.cached_channel_title || 'YouTube',
          thumbnail:
            src.cached_thumbnail_url ||
            `https://i.ytimg.com/vi/${src.external_id}/mqdefault.jpg`,
          comment: '',
          addedAt: new Date().toISOString(),
        };
      })
      .filter(Boolean);
  }

  async function handleLoad(playlist) {
    setLoadingId(playlist.id);
    try {
      const videos = await fetchTracks(playlist.id);
      if (!videos.length) {
        onShowToast?.('This playlist has no tracks yet');
        return;
      }
      onPlayPlaylist?.(videos, { id: playlist.id, name: playlist.name });
      onShowToast?.(`Playing "${playlist.name}" — ${videos.length} tracks`);
    } catch {
      onShowToast?.('Failed to load playlist');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAdd(playlist) {
    setLoadingId(playlist.id);
    try {
      const videos = await fetchTracks(playlist.id);
      if (!videos.length) {
        onShowToast?.('This playlist has no tracks yet');
        return;
      }
      onAddToPlaylist(videos);
      onShowToast?.(`Added ${videos.length} tracks to your queue`);
    } catch {
      onShowToast?.('Failed to add playlist');
    } finally {
      setLoadingId(null);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const users = useMemo(() => {
    const map = new Map();
    for (const pl of playlists) {
      if (!map.has(pl.user_id)) {
        map.set(pl.user_id, { ...pl.profile, user_id: pl.user_id, count: 0 });
      }
      map.get(pl.user_id).count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [playlists]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (getDisplayProfileName(u.username) || u.username || '')
        .toLowerCase()
        .includes(q),
    );
  }, [users, userSearch]);

  const viewPlaylists = useMemo(() => {
    const base = selectedUserId
      ? playlists.filter((p) => p.user_id === selectedUserId)
      : playlists;
    if (sortBy === 'most-tracks')
      return [...base].sort((a, b) => b.trackCount - a.trackCount);
    if (sortBy === 'a-z')
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    return base;
  }, [playlists, selectedUserId, sortBy]);

  const featured = useMemo(() => {
    if (!viewPlaylists.length) return null;
    const pool = viewPlaylists.slice(0, Math.min(5, viewPlaylists.length));
    return pool[Math.floor(featuredSeed * pool.length)];
  }, [viewPlaylists, featuredSeed]);

  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return playlists.filter((p) => new Date(p.created_at).getTime() > cutoff);
  }, [playlists]);

  const totalTracks = useMemo(
    () => playlists.reduce((s, p) => s + p.trackCount, 0),
    [playlists],
  );

  const selectedUser = users.find((u) => u.user_id === selectedUserId);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="cpl-state-screen">
        <div className="cpl-spinner" />
        <span>Loading community playlists…</span>
      </div>
    );
  }

  if (!playlists.length) {
    return (
      <div className="cpl-state-screen">
        <p className="cpl-empty-title">No public playlists yet</p>
        <p className="cpl-empty-sub">
          Make your playlists public to share them with the community!
        </p>
      </div>
    );
  }

  return (
    <div className="cpl-layout">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="cpl-sidebar">
        <div className="cpl-sidebar-head">
          <h3>Browse by user</h3>
          <div className="cpl-sidebar-search">
            <SearchIcon className="cpl-sidebar-search-icon" />
            <input
              placeholder="Find a user…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="cpl-user-list">
          {selectedUserId && (
            <button
              className="cpl-back-btn"
              onClick={() => setSelectedUserId(null)}
            >
              ← All playlists
            </button>
          )}
          {filteredUsers.map((u) => (
            <button
              key={u.user_id}
              className={`cpl-user-row${u.user_id === selectedUserId ? ' active' : ''}`}
              onClick={() =>
                setSelectedUserId(
                  u.user_id === selectedUserId ? null : u.user_id,
                )
              }
            >
              <CplAvatar
                username={u.username}
                userId={u.user_id}
                avatarUrl={u.avatar_url}
                size="md"
              />
              <div className="cpl-user-info">
                <div className="cpl-user-name">
                  {getDisplayProfileName(u.username)}
                </div>
                <div className="cpl-user-count">
                  {u.count} playlist{u.count !== 1 ? 's' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="cpl-main">
        {!selectedUserId ? (
          /* ── Editorial landing ────────────────────────────────────────── */
          <>
            <div className="cpl-hero-band">
              <div className="cpl-hero-left">
                <div className="cpl-hero-eyebrow">Community Playlists</div>
                <div class="cpl-spotlight-name">
                  <br />
                  <h2>
                    {playlists.length} playlist{' '}
                    {playlists.length !== 1 ? 's' : ''}
                    available for listening
                  </h2>
                  <br />
                </div>
                <p className="cpl-hero-sub">
                  Custom playlist made by and for the community.\n Take a listen
                  or add playlists to your queue!
                </p>
                <br />
                <div className="cpl-hero-stats">
                  {[
                    [playlists.length, 'Playlists'],
                    [totalTracks, 'Total tracks'],
                    [newThisWeek.length, 'New this week'],
                  ].map(([val, lbl]) => (
                    <div key={lbl} className="cpl-hero-stat">
                      <span className="cpl-stat-val">{val}</span>
                      <span className="cpl-stat-lbl">{lbl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {featured && (
                <div className="cpl-featured-card">
                  <div className="cpl-featured-cover">
                    {featured.firstThumbnail ? (
                      <img
                        src={featured.firstThumbnail}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: playlistGradient(featured.id),
                        }}
                      />
                    )}
                    <span className="cpl-track-badge">
                      {featured.trackCount} tracks
                    </span>
                  </div>
                  <div className="cpl-featured-body">
                    <div className="cpl-spin-badge">
                      <span className="cpl-spin-dot" />
                      Featured pick
                    </div>
                    <div className="cpl-featured-name">{featured.name}</div>
                    <div className="cpl-featured-creator">
                      <CplAvatar
                        username={featured.profile?.username}
                        userId={featured.user_id}
                        avatarUrl={featured.profile?.avatar_url}
                      />
                      <span>
                        by {getDisplayProfileName(featured.profile?.username)} ·{' '}
                        {timeAgo(featured.created_at)}
                      </span>
                    </div>
                    <div className="cpl-featured-actions">
                      <button
                        className="cpl-action-btn cpl-action-primary"
                        onClick={() => handleLoad(featured)}
                        disabled={loadingId === featured.id}
                      >
                        {loadingId === featured.id ? '…' : 'Play Playlist'}
                      </button>
                      <button
                        className="cpl-action-btn"
                        onClick={() => handleAdd(featured)}
                        disabled={loadingId === featured.id}
                      >
                        Add to My Queue
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cpl-content">
              {newThisWeek.length > 0 && (
                <section>
                  <div className="cpl-section-head">
                    <h2>New this week</h2>
                    <span className="cpl-section-aside">
                      {newThisWeek.length} added
                    </span>
                  </div>
                  <div className="cpl-new-strip">
                    {newThisWeek.map((pl) => (
                      <button
                        key={pl.id}
                        className="cpl-new-card"
                        onClick={() => handleLoad(pl)}
                        title={`Load "${pl.name}"`}
                      >
                        <div className="cpl-new-cover">
                          {pl.firstThumbnail ? (
                            <img
                              src={pl.firstThumbnail}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: '100%',
                                background: playlistGradient(pl.id),
                              }}
                            />
                          )}
                          <span className="cpl-track-badge cpl-track-badge-sm">
                            {pl.trackCount}
                          </span>
                        </div>
                        <div className="cpl-new-body">
                          <div className="cpl-new-name">{pl.name}</div>
                          <div className="cpl-new-meta">
                            <CplAvatar
                              username={pl.profile?.username}
                              userId={pl.user_id}
                              avatarUrl={pl.profile?.avatar_url}
                              size="xs"
                            />
                            <span>
                              {getDisplayProfileName(pl.profile?.username)} ·{' '}
                              {timeAgo(pl.created_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="cpl-section-head">
                  <h2>All playlists</h2>
                  <div className="cpl-section-controls">
                    <SortControls sortBy={sortBy} onChange={setSortBy} />
                    <span className="cpl-section-aside">
                      {viewPlaylists.length} total
                    </span>
                  </div>
                </div>
                <div className="cpl-grid cpl-grid-4">
                  {viewPlaylists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onLoad={handleLoad}
                      onAdd={handleAdd}
                      loadingId={loadingId}
                      isOwn={pl.user_id === authUser?.id}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          /* ── User / Featured view ─────────────────────────────────────── */
          <>
            {featured && (
              <div className="cpl-spotlight">
                <div className="cpl-spotlight-left">
                  <div className="cpl-spotlight-meta">
                    <span className="cpl-spin-badge">
                      <span className="cpl-spin-dot" />
                      Featured
                    </span>
                    <span className="cpl-spotlight-count">
                      {featured.trackCount} tracks
                    </span>
                  </div>
                  <div className="cpl-spotlight-name">"{featured.name}"</div>
                  <div className="cpl-spotlight-creator">
                    <CplAvatar
                      username={featured.profile?.username}
                      userId={featured.user_id}
                      avatarUrl={featured.profile?.avatar_url}
                    />
                    <span>
                      by {getDisplayProfileName(featured.profile?.username)} ·{' '}
                      {timeAgo(featured.created_at)}
                    </span>
                  </div>
                  <div className="cpl-spotlight-actions">
                    <button
                      className="cpl-action-btn cpl-action-primary"
                      onClick={() => handleLoad(featured)}
                      disabled={loadingId === featured.id}
                    >
                      {loadingId === featured.id ? '…' : 'Load into queue'}
                    </button>
                    <button
                      className="cpl-action-btn"
                      onClick={() => handleAdd(featured)}
                      disabled={loadingId === featured.id}
                    >
                      Add to My Queue
                    </button>
                  </div>
                </div>
                <div className="cpl-spotlight-cover">
                  {featured.firstThumbnail ? (
                    <img
                      src={featured.firstThumbnail}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: playlistGradient(featured.id),
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="cpl-content">
              <section>
                <div className="cpl-section-head">
                  <h2>
                    {selectedUser
                      ? `${getDisplayProfileName(selectedUser.username)}'s playlists`
                      : 'Playlists'}
                  </h2>
                  <div className="cpl-section-controls">
                    <SortControls sortBy={sortBy} onChange={setSortBy} />
                    <span className="cpl-section-aside">
                      {viewPlaylists.length} playlist
                      {viewPlaylists.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="cpl-grid cpl-grid-3">
                  {viewPlaylists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onLoad={handleLoad}
                      onAdd={handleAdd}
                      loadingId={loadingId}
                      isOwn={pl.user_id === authUser?.id}
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
