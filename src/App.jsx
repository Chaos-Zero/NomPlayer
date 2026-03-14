import { useState, useCallback, useEffect } from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';
import { singleVideoEntry } from './utils/youtube.js';

const STORAGE_KEY = 'yt_favourites';

function loadFavourites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function App() {
  // Playlist state
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);

  // Favourites
  const [favourites, setFavourites] = useState(loadFavourites);
  const [showFavourites, setShowFavourites] = useState(false);

  // Persist favourites
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favourites));
  }, [favourites]);

  // ── Load a new playlist / single video ──────────────────────────
  const handleLoad = useCallback((items, startVideoId = null) => {
    setPlaylist(items);
    const startIdx = startVideoId
      ? Math.max(0, items.findIndex(v => v.videoId === startVideoId))
      : 0;
    setCurrentIndex(startIdx);
    setIsPlaying(false); // let user hit play
  }, []);

  // ── Navigation ──────────────────────────────────────────────────
  const goToIndex = useCallback((idx) => {
    setCurrentIndex(idx);
    if (isPlaying) {
      // keep playing — VideoPlayer will autoplay new video
    }
  }, [isPlaying]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      return i; // stop at end
    });
  }, [playlist.length]);

  const handleVideoEnd = useCallback(() => {
    if (!isPlaying) return;
    setCurrentIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      setIsPlaying(false);
      return i;
    });
  }, [isPlaying, playlist.length]);

  // ── Favourites ───────────────────────────────────────────────────
  const handleToggleFavourite = useCallback((video) => {
    setFavourites(prev => {
      const exists = prev.some(f => f.videoId === video.videoId);
      if (exists) return prev.filter(f => f.videoId !== video.videoId);
      return [...prev, video];
    });
  }, []);

  const handleRemoveFavourite = useCallback((videoId) => {
    setFavourites(prev => prev.filter(f => f.videoId !== videoId));
  }, []);

  const handleReorderFavourites = useCallback((newOrder) => {
    setFavourites(newOrder);
  }, []);

  // Play a video from the favourites panel
  const handlePlayFromFavourites = useCallback((video) => {
    // Check if video is in current playlist
    const idx = playlist.findIndex(v => v.videoId === video.videoId);
    if (idx >= 0) {
      setCurrentIndex(idx);
    } else {
      // Add it as a one-off playlist
      setPlaylist([video]);
      setCurrentIndex(0);
    }
    setIsPlaying(true);
    setShowFavourites(false);
  }, [playlist]);

  const currentVideo = playlist[currentIndex] || null;
  const apiKeyMissing = !import.meta.env.VITE_YT_API_KEY;

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <TopBar
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onPrev={handlePrev}
        onNext={handleNext}
        showFavourites={showFavourites}
        setShowFavourites={setShowFavourites}
        onLoad={handleLoad}
      />

      {/* Main video area */}
      <main className="main-content" id="main-content">
        <VideoPlayer
          video={currentVideo}
          isPlaying={isPlaying}
          onVideoEnd={handleVideoEnd}
        />
      </main>

      {/* Playlist sidebar */}
      <aside className="sidebar">
        <PlaylistSidebar
          playlist={playlist}
          currentIndex={currentIndex}
          onSelect={goToIndex}
          favourites={favourites}
          onToggleFavourite={handleToggleFavourite}
        />
        {apiKeyMissing && (
          <div className="api-key-notice">
            <span>🔑</span>
            <span>
              Add <code>VITE_YT_API_KEY</code> to <code>.env</code> to enable playlist loading.{' '}
              <a
                href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                Get key
              </a>
            </span>
          </div>
        )}
      </aside>

      {/* Favourites slide-in panel */}
      {showFavourites && (
        <FavouritesPanel
          favourites={favourites}
          onReorder={handleReorderFavourites}
          onClose={() => setShowFavourites(false)}
          onPlay={handlePlayFromFavourites}
          onRemove={handleRemoveFavourite}
        />
      )}
    </div>
  );
}
