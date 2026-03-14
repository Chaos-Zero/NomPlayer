import { useState, useCallback, useEffect, useRef } from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';

const STORAGE_KEY = 'yt_support_list';
const LEGACY_STORAGE_KEY = 'yt_favourites';

function loadSupportList() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY);
    if (storedValue) return JSON.parse(storedValue);

    const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyValue) return JSON.parse(legacyValue);

    return [];
  } catch {
    return [];
  }
}

export default function App() {
  // Playlist state
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const playlistRef = useRef([]);
  const [transientVideo, setTransientVideo] = useState(null);
  const transientResumeIndexRef = useRef(null);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);

  // Support list
  const [supportList, setSupportList] = useState(loadSupportList);
  const [showSupportList, setShowSupportList] = useState(false);

  // Persist support list
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(supportList));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, [supportList]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const appendVideosToPlaylist = useCallback((videos, options = {}) => {
    const {
      highlightLast = false,
      autoplayIfFirst = false,
    } = options;

    if (!videos.length) return;

    const previousPlaylist = playlistRef.current;
    const previousLength = previousPlaylist.length;
    const nextPlaylist = [...previousPlaylist];
    const indexById = new Map(previousPlaylist.map((video, index) => [video.videoId, index]));

    let lastResolvedIndex = previousLength > 0 ? previousLength - 1 : 0;

    for (const video of videos) {
      const existingIndex = indexById.get(video.videoId);
      if (existingIndex !== undefined) {
        lastResolvedIndex = existingIndex;
        continue;
      }

      const nextIndex = nextPlaylist.length;
      nextPlaylist.push(video);
      indexById.set(video.videoId, nextIndex);
      lastResolvedIndex = nextIndex;
    }

    if (nextPlaylist.length === previousLength) {
      if (highlightLast) {
        setHighlightedIndex(lastResolvedIndex);
      }
      return;
    }

    playlistRef.current = nextPlaylist;
    setPlaylist(nextPlaylist);

    if (previousLength === 0) {
      setCurrentIndex(0);
      setHighlightedIndex(highlightLast ? lastResolvedIndex : 0);
      if (!transientVideo) {
        setIsPlaying(autoplayIfFirst);
      }
      return;
    }

    if (highlightLast) {
      setHighlightedIndex(lastResolvedIndex);
    }
  }, [transientVideo]);

  // ── Load a new playlist / single video ──────────────────────────
  const handleLoad = useCallback((items, options = {}) => {
    const {
      startVideoId = null,
      mode = 'replace',
      autoplay = false,
    } = options;

    if (mode === 'append') {
      appendVideosToPlaylist(items, { autoplayIfFirst: autoplay });
      return;
    }

    transientResumeIndexRef.current = null;
    setTransientVideo(null);
    playlistRef.current = items;
    setPlaylist(items);

    const startIdx = startVideoId
      ? Math.max(0, items.findIndex(v => v.videoId === startVideoId))
      : 0;

    setCurrentIndex(startIdx);
    setHighlightedIndex(startIdx);
    setIsPlaying(autoplay);
  }, [appendVideosToPlaylist]);

  // ── Navigation ──────────────────────────────────────────────────
  const goToIndex = useCallback((idx) => {
    transientResumeIndexRef.current = null;
    setTransientVideo(null);
    setCurrentIndex(idx);
    setHighlightedIndex(idx);
  }, []);

  const handlePrev = useCallback(() => {
    if (playlistRef.current.length === 0) return;

    transientResumeIndexRef.current = null;
    setTransientVideo(null);
    setCurrentIndex(i => Math.max(0, i - 1));
    setHighlightedIndex(i => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    if (playlistRef.current.length === 0) return;

    transientResumeIndexRef.current = null;
    setTransientVideo(null);
    setCurrentIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      return i; // stop at end
    });
    setHighlightedIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      return i;
    });
  }, [playlist.length]);

  const handleVideoEnd = useCallback(() => {
    if (!isPlaying) return;

    if (transientVideo) {
      const resumeIndex = transientResumeIndexRef.current;
      transientResumeIndexRef.current = null;
      setTransientVideo(null);
      if (resumeIndex !== null && playlistRef.current[resumeIndex]) {
        setCurrentIndex(resumeIndex);
        setHighlightedIndex(resumeIndex);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    setCurrentIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      setIsPlaying(false);
      return i;
    });
    setHighlightedIndex(i => {
      if (i < playlist.length - 1) return i + 1;
      return i;
    });
  }, [isPlaying, playlist.length, transientVideo]);

  // ── Support list ─────────────────────────────────────────────────
  const handleToggleSupport = useCallback((video) => {
    setSupportList(prev => {
      const exists = prev.some(entry => entry.videoId === video.videoId);
      if (exists) return prev.filter(entry => entry.videoId !== video.videoId);
      return [...prev, video];
    });
  }, []);

  const handleAddToSupportList = useCallback((video) => {
    setSupportList(prev => {
      if (prev.some(entry => entry.videoId === video.videoId)) return prev;
      return [...prev, video];
    });
  }, []);

  const handleRemoveFromSupportList = useCallback((videoIdsOrId) => {
    const videoIds = Array.isArray(videoIdsOrId) ? videoIdsOrId : [videoIdsOrId];
    const idSet = new Set(videoIds);
    setSupportList(prev => prev.filter(entry => !idSet.has(entry.videoId)));
  }, []);

  const handleReorderSupportList = useCallback((newOrder) => {
    setSupportList(newOrder);
  }, []);

  const handleRemoveFromPlaylist = useCallback((videoId) => {
    const removeIndex = playlistRef.current.findIndex(video => video.videoId === videoId);
    if (removeIndex < 0) return;

    const nextPlaylist = playlistRef.current.filter(video => video.videoId !== videoId);
    playlistRef.current = nextPlaylist;
    setPlaylist(nextPlaylist);

    if (transientResumeIndexRef.current !== null) {
      if (removeIndex < transientResumeIndexRef.current) {
        transientResumeIndexRef.current -= 1;
      } else if (transientResumeIndexRef.current === removeIndex) {
        transientResumeIndexRef.current = nextPlaylist[removeIndex]
          ? removeIndex
          : null;
      }
    }

    if (nextPlaylist.length === 0) {
      setCurrentIndex(0);
      setHighlightedIndex(0);
      if (!transientVideo) {
        setIsPlaying(false);
      }
      return;
    }

    setCurrentIndex(index => {
      if (index < removeIndex) return index;
      if (index > removeIndex) return index - 1;
      return Math.min(index, nextPlaylist.length - 1);
    });
    setHighlightedIndex(index => {
      if (index < removeIndex) return index;
      if (index > removeIndex) return index - 1;
      return Math.min(index, nextPlaylist.length - 1);
    });
  }, [transientVideo]);

  const handleQueueFromSupportList = useCallback((videos) => {
    appendVideosToPlaylist(videos, { highlightLast: true });
  }, [appendVideosToPlaylist]);

  const handlePlayNowFromSupportList = useCallback((video) => {
    if (!transientVideo) {
      if (playlistRef.current.length === 0) {
        transientResumeIndexRef.current = null;
      } else if (isPlaying) {
        transientResumeIndexRef.current = currentIndex < playlistRef.current.length - 1
          ? currentIndex + 1
          : null;
      } else {
        transientResumeIndexRef.current = Math.min(highlightedIndex, playlistRef.current.length - 1);
      }
    }
    setTransientVideo(video);
    setIsPlaying(true);
  }, [currentIndex, highlightedIndex, isPlaying, transientVideo]);

  const currentVideo = transientVideo || playlist[currentIndex] || null;
  const apiKeyMissing = !import.meta.env.VITE_YT_API_KEY;

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <TopBar
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onPrev={handlePrev}
        onNext={handleNext}
        showSupportList={showSupportList}
        setShowSupportList={setShowSupportList}
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
          currentIndex={highlightedIndex}
          onSelect={goToIndex}
          supportList={supportList}
          onToggleSupport={handleToggleSupport}
          onAddToSupportList={handleAddToSupportList}
          onRemoveFromPlaylist={handleRemoveFromPlaylist}
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

      {/* Support list slide-in panel */}
      {showSupportList && (
        <FavouritesPanel
          supportList={supportList}
          onReorder={handleReorderSupportList}
          onClose={() => setShowSupportList(false)}
          onPlayNow={handlePlayNowFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromSupportList}
        />
      )}
    </div>
  );
}
