import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import TopBar from './components/TopBar.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import PlaylistSidebar from './components/PlaylistSidebar.jsx';
import FavouritesPanel from './components/FavouritesPanel.jsx';

const SUPPORT_STORAGE_KEY = 'yt_support_list';
const NOMINATIONS_STORAGE_KEY = 'yt_nominations_list';
const LEGACY_STORAGE_KEY = 'yt_favourites';
const PREVIEW_DURATION_MS = 31_000;

function loadStoredList(storageKey, fallbackKey = null) {
  try {
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue) return JSON.parse(storedValue);

    if (fallbackKey) {
      const fallbackValue = localStorage.getItem(fallbackKey);
      if (fallbackValue) return JSON.parse(fallbackValue);
    }

    return [];
  } catch {
    return [];
  }
}

function loadSupportList() {
  return loadStoredList(SUPPORT_STORAGE_KEY, LEGACY_STORAGE_KEY);
}

function loadNominationList() {
  return loadStoredList(NOMINATIONS_STORAGE_KEY);
}

function appendUniqueVideos(list, videos, blockedIds = new Set()) {
  const existingIds = new Set(list.map(entry => entry.videoId));
  const nextList = [...list];
  let addedCount = 0;
  const blockedVideoIds = new Set();
  const duplicateVideoIds = new Set();

  for (const video of videos) {
    if (blockedIds.has(video.videoId)) {
      blockedVideoIds.add(video.videoId);
      continue;
    }

    if (existingIds.has(video.videoId)) {
      duplicateVideoIds.add(video.videoId);
      continue;
    }

    existingIds.add(video.videoId);
    nextList.push(video);
    addedCount += 1;
  }

  return {
    nextList: addedCount > 0 ? nextList : list,
    addedCount,
    blockedCount: blockedVideoIds.size,
    duplicateCount: duplicateVideoIds.size,
  };
}

function resolvePlayOrderIds(playlist, shuffleOrderIds) {
  const originalIds = playlist.map(video => video.videoId);
  if (shuffleOrderIds.length !== originalIds.length) return originalIds;

  const originalIdSet = new Set(originalIds);
  if (shuffleOrderIds.some(id => !originalIdSet.has(id))) return originalIds;

  return shuffleOrderIds;
}

function shuffleVideoIds(videoIds, pinnedVideoId = null) {
  const remainingIds = pinnedVideoId
    ? videoIds.filter(id => id !== pinnedVideoId)
    : [...videoIds];

  for (let index = remainingIds.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [remainingIds[index], remainingIds[swapIndex]] = [remainingIds[swapIndex], remainingIds[index]];
  }

  return pinnedVideoId ? [pinnedVideoId, ...remainingIds] : remainingIds;
}

export default function App() {
  // Playlist state
  const [playlist, setPlaylist] = useState([]);
  const playlistRef = useRef([]);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const currentVideoIdRef = useRef(null);
  const [shuffleOrderIds, setShuffleOrderIds] = useState([]);
  const shuffleOrderIdsRef = useRef([]);
  const [showOriginalOrder, setShowOriginalOrder] = useState(false);
  const [listenedStatusById, setListenedStatusById] = useState({});
  const [transientVideo, setTransientVideo] = useState(null);
  const transientResumeVideoIdRef = useRef(null);
  const [flashVideoIds, setFlashVideoIds] = useState([]);
  const [isPlaylistCollapsed, setIsPlaylistCollapsed] = useState(false);
  const [isPreviewModeEnabled, setIsPreviewModeEnabled] = useState(false);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);

  // Support list
  const [supportList, setSupportList] = useState(loadSupportList);
  const [showSupportList, setShowSupportList] = useState(false);
  const [renderSupportList, setRenderSupportList] = useState(false);
  const [nominationList, setNominationList] = useState(loadNominationList);
  const [showNominationsList, setShowNominationsList] = useState(false);
  const [renderNominationsList, setRenderNominationsList] = useState(false);

  // Persist support list
  useEffect(() => {
    localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(supportList));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, [supportList]);

  useEffect(() => {
    localStorage.setItem(NOMINATIONS_STORAGE_KEY, JSON.stringify(nominationList));
  }, [nominationList]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

  useEffect(() => {
    shuffleOrderIdsRef.current = shuffleOrderIds;
  }, [shuffleOrderIds]);

  useEffect(() => {
    if (flashVideoIds.length === 0) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFlashVideoIds([]);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [flashVideoIds]);

  const playOrderIds = useMemo(
    () => resolvePlayOrderIds(playlist, shuffleOrderIds),
    [playlist, shuffleOrderIds]
  );

  const isShuffleEnabled = useMemo(() => (
    shuffleOrderIds.length > 0 && playOrderIds === shuffleOrderIds
  ), [playOrderIds, shuffleOrderIds]);

  const displayPlaylist = useMemo(() => {
    const loadIndexById = new Map(
      playlist.map((video, index) => [video.videoId, index])
    );
    const orderIds = isShuffleEnabled && !showOriginalOrder
      ? playOrderIds
      : playlist.map(video => video.videoId);
    const playlistById = new Map(playlist.map(video => [video.videoId, video]));

    return orderIds
      .map(videoId => {
        const video = playlistById.get(videoId);
        if (!video) return null;
        return {
          ...video,
          loadIndex: loadIndexById.get(videoId) ?? 0,
        };
      })
      .filter(Boolean);
  }, [isShuffleEnabled, playlist, playOrderIds, showOriginalOrder]);

  const currentDisplayIndex = transientVideo
    ? null
    : displayPlaylist.findIndex(video => video.videoId === currentVideoId);

  const currentPlaylistVideo = playlist.find(video => video.videoId === currentVideoId) || null;
  const currentVideo = transientVideo || currentPlaylistVideo;
  const isCurrentVideoSupported = currentVideo
    ? supportList.some(entry => entry.videoId === currentVideo.videoId)
    : false;
  const isCurrentVideoNominated = currentVideo
    ? nominationList.some(entry => entry.videoId === currentVideo.videoId)
    : false;
  const apiKeyMissing = !import.meta.env.VITE_YT_API_KEY;

  const markVideoCompleted = useCallback((videoId) => {
    if (!videoId) return;

    setListenedStatusById(previousStatus => {
      if (previousStatus[videoId] === 'complete') return previousStatus;
      return {
        ...previousStatus,
        [videoId]: 'complete',
      };
    });
  }, []);

  const markVideoStarted = useCallback((videoId) => {
    if (!videoId) return;

    setListenedStatusById(previousStatus => {
      if (previousStatus[videoId]) return previousStatus;
      return {
        ...previousStatus,
        [videoId]: 'partial',
      };
    });
  }, []);

  const handleAdvancePreview = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(playlistRef.current, shuffleOrderIdsRef.current);

    if (transientVideo) {
      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);
    }

    if (resolvedPlayOrderIds.length === 0) {
      setIsPlaying(false);
      return;
    }

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(0, resolvedPlayOrderIds.indexOf(activeVideoId));

    if (currentPlayIndex >= resolvedPlayOrderIds.length - 1) {
      setIsPlaying(false);
      return;
    }

    const nextVideoId = resolvedPlayOrderIds[currentPlayIndex + 1];
    markVideoStarted(nextVideoId);
    setCurrentVideoId(nextVideoId);
    setIsPlaying(true);
  }, [markVideoStarted, transientVideo]);

  useEffect(() => {
    if (!isPreviewModeEnabled || !isPlaying || !currentVideo?.videoId) return undefined;

    const timeoutId = window.setTimeout(() => {
      handleAdvancePreview();
    }, PREVIEW_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentVideo?.videoId, handleAdvancePreview, isPlaying, isPreviewModeEnabled]);

  const appendVideosToPlaylist = useCallback((videos, options = {}) => {
    const {
      autoplayIfFirst = false,
      startVideoId = null,
      flashResolved = false,
    } = options;

    if (!videos.length) return;

    const previousPlaylist = playlistRef.current;
    const previousLength = previousPlaylist.length;
    const nextPlaylist = [...previousPlaylist];
    const indexById = new Map(previousPlaylist.map((video, index) => [video.videoId, index]));

    const resolvedVideoIds = [];
    const newVideoIds = [];
    let resolvedStartVideoId = startVideoId && indexById.has(startVideoId)
      ? startVideoId
      : null;

    for (const video of videos) {
      const existingIndex = indexById.get(video.videoId);
      if (existingIndex !== undefined) {
        resolvedVideoIds.push(video.videoId);
        if (video.videoId === startVideoId) {
          resolvedStartVideoId = video.videoId;
        }
        continue;
      }

      nextPlaylist.push(video);
      indexById.set(video.videoId, nextPlaylist.length - 1);
      newVideoIds.push(video.videoId);
      resolvedVideoIds.push(video.videoId);

      if (video.videoId === startVideoId) {
        resolvedStartVideoId = video.videoId;
      }
    }

    if (nextPlaylist.length === previousLength) {
      if (flashResolved && resolvedVideoIds.length > 0) {
        setFlashVideoIds(resolvedVideoIds);
      }
      return;
    }

    playlistRef.current = nextPlaylist;
    setPlaylist(nextPlaylist);

    if (shuffleOrderIdsRef.current.length > 0) {
      const nextIdSet = new Set(nextPlaylist.map(video => video.videoId));
      const nextShuffleOrderIds = shuffleOrderIdsRef.current.filter(id => nextIdSet.has(id));
      nextShuffleOrderIds.push(...newVideoIds.filter(id => !nextShuffleOrderIds.includes(id)));
      shuffleOrderIdsRef.current = nextShuffleOrderIds;
      setShuffleOrderIds(nextShuffleOrderIds);
    }

    if (previousLength === 0) {
      const initialVideoId = resolvedStartVideoId ?? nextPlaylist[0]?.videoId ?? null;
      if (autoplayIfFirst) {
        markVideoStarted(initialVideoId);
      }
      setCurrentVideoId(initialVideoId);
      if (flashResolved && resolvedVideoIds.length > 0) {
        setFlashVideoIds(resolvedVideoIds);
      }
      if (!transientVideo) {
        setIsPlaying(autoplayIfFirst);
      }
      return;
    }

    if (flashResolved && resolvedVideoIds.length > 0) {
      setFlashVideoIds(resolvedVideoIds);
    }
  }, [markVideoStarted, transientVideo]);

  // ── Load a new playlist / single video ──────────────────────────
  const handleLoad = useCallback((items, options = {}) => {
    const {
      startVideoId = null,
      mode = 'replace',
      autoplay = false,
    } = options;

    if (mode === 'append') {
      appendVideosToPlaylist(items, { autoplayIfFirst: autoplay, startVideoId });
      return;
    }

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    playlistRef.current = items;
    setPlaylist(items);
    shuffleOrderIdsRef.current = [];
    setShuffleOrderIds([]);
    setShowOriginalOrder(false);
    setListenedStatusById({});

    const resolvedStartVideoId = (
      startVideoId && items.some(video => video.videoId === startVideoId)
    )
      ? startVideoId
      : items[0]?.videoId ?? null;

    if (autoplay) {
      markVideoStarted(resolvedStartVideoId);
    }
    setCurrentVideoId(resolvedStartVideoId);
    setIsPlaying(autoplay);
  }, [appendVideosToPlaylist, markVideoStarted]);

  // ── Navigation ──────────────────────────────────────────────────
  const goToVideo = useCallback((videoId) => {
    if (!playlistRef.current.some(video => video.videoId === videoId)) return;

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);
    if (isPlaying) {
      markVideoStarted(videoId);
    }
    setCurrentVideoId(videoId);
  }, [isPlaying, markVideoStarted]);

  const handlePrev = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(playlistRef.current, shuffleOrderIdsRef.current);
    if (resolvedPlayOrderIds.length === 0) return;

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(0, resolvedPlayOrderIds.indexOf(activeVideoId));
    const previousVideoId = resolvedPlayOrderIds[Math.max(0, currentPlayIndex - 1)];

    if (isPlaying) {
      markVideoStarted(previousVideoId);
    }
    setCurrentVideoId(previousVideoId);
  }, [isPlaying, markVideoStarted]);

  const handleNext = useCallback(() => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(playlistRef.current, shuffleOrderIdsRef.current);
    if (resolvedPlayOrderIds.length === 0) return;

    transientResumeVideoIdRef.current = null;
    setTransientVideo(null);

    const activeVideoId = currentVideoIdRef.current ?? resolvedPlayOrderIds[0];
    const currentPlayIndex = Math.max(0, resolvedPlayOrderIds.indexOf(activeVideoId));
    const nextVideoId = resolvedPlayOrderIds[Math.min(
      currentPlayIndex + 1,
      resolvedPlayOrderIds.length - 1
    )];

    if (isPlaying) {
      markVideoStarted(nextVideoId);
    }
    setCurrentVideoId(nextVideoId);
  }, [isPlaying, markVideoStarted]);

  const handleVideoEnd = useCallback(() => {
    if (!isPlaying) return;

    if (transientVideo) {
      const resumeVideoId = transientResumeVideoIdRef.current;
      transientResumeVideoIdRef.current = null;
      setTransientVideo(null);

      if (resumeVideoId && playlistRef.current.some(video => video.videoId === resumeVideoId)) {
        markVideoStarted(resumeVideoId);
        setCurrentVideoId(resumeVideoId);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    const finishedVideoId = currentVideoIdRef.current;
    const resolvedPlayOrderIds = resolvePlayOrderIds(playlistRef.current, shuffleOrderIdsRef.current);
    const currentPlayIndex = finishedVideoId
      ? resolvedPlayOrderIds.indexOf(finishedVideoId)
      : -1;

    if (!isPreviewModeEnabled) {
      markVideoCompleted(finishedVideoId);
    }

    if (currentPlayIndex >= 0 && currentPlayIndex < resolvedPlayOrderIds.length - 1) {
      const nextVideoId = resolvedPlayOrderIds[currentPlayIndex + 1];
      markVideoStarted(nextVideoId);
      setCurrentVideoId(nextVideoId);
      return;
    }

    setIsPlaying(false);
  }, [isPlaying, isPreviewModeEnabled, markVideoCompleted, markVideoStarted, transientVideo]);

  // ── Shuffle ─────────────────────────────────────────────────────
  const handleShufflePlaylist = useCallback(() => {
    if (shuffleOrderIdsRef.current.length > 0) {
      shuffleOrderIdsRef.current = [];
      setShuffleOrderIds([]);
      setShowOriginalOrder(false);
      return;
    }

    const originalIds = playlistRef.current.map(video => video.videoId);
    if (originalIds.length < 2) return;

    const pinnedVideoId = (
      currentVideoIdRef.current && originalIds.includes(currentVideoIdRef.current)
    )
      ? currentVideoIdRef.current
      : originalIds[0];

    const nextShuffleOrderIds = shuffleVideoIds(originalIds, pinnedVideoId);
    shuffleOrderIdsRef.current = nextShuffleOrderIds;
    setShuffleOrderIds(nextShuffleOrderIds);
    setShowOriginalOrder(false);
  }, []);

  const handleTogglePlaylistOrderView = useCallback(() => {
    if (shuffleOrderIdsRef.current.length === 0) return;
    setShowOriginalOrder(previousValue => !previousValue);
  }, []);

  const handleTogglePreviewMode = useCallback(() => {
    setIsPreviewModeEnabled(previousValue => !previousValue);
  }, []);

  // ── Support list ─────────────────────────────────────────────────
  const handleOpenSupportList = useCallback(() => {
    setRenderNominationsList(false);
    setRenderSupportList(true);
    setShowSupportList(true);
    setShowNominationsList(false);
  }, []);

  const handleRequestCloseSupportList = useCallback(() => {
    setShowSupportList(false);
  }, []);

  const handleSupportListExited = useCallback(() => {
    setRenderSupportList(false);
  }, []);

  const handleOpenNominationsList = useCallback(() => {
    setRenderSupportList(false);
    setRenderNominationsList(true);
    setShowNominationsList(true);
    setShowSupportList(false);
  }, []);

  const handleRequestCloseNominationsList = useCallback(() => {
    setShowNominationsList(false);
  }, []);

  const handleNominationsListExited = useCallback(() => {
    setRenderNominationsList(false);
  }, []);

  const handleToggleSupportFromPlaylist = useCallback((video) => {
    if (nominationList.some(entry => entry.videoId === video.videoId)) return;

    setSupportList(previousList => {
      const exists = previousList.some(entry => entry.videoId === video.videoId);
      if (exists) {
        return previousList.filter(entry => entry.videoId !== video.videoId);
      }

      return [...previousList, video];
    });
  }, [nominationList]);

  const handleAddToSupportList = useCallback((video) => {
    if (nominationList.some(entry => entry.videoId === video.videoId)) return 0;

    let addedCount = 0;
    setSupportList(previousList => {
      const result = appendUniqueVideos(
        previousList,
        [video],
        new Set(nominationList.map(entry => entry.videoId))
      );
      addedCount = result.addedCount;
      return result.nextList;
    });

    return addedCount;
  }, [nominationList]);

  const handleAddManyToSupportList = useCallback((videos) => {
    if (!videos.length) {
      return { addedCount: 0, blockedNominationCount: 0 };
    }

    let resultSummary = {
      addedCount: 0,
      blockedNominationCount: 0,
    };
    setSupportList(previousList => {
      const result = appendUniqueVideos(
        previousList,
        videos,
        new Set(nominationList.map(entry => entry.videoId))
      );
      resultSummary = {
        addedCount: result.addedCount,
        blockedNominationCount: result.blockedCount,
      };
      return result.nextList;
    });

    return resultSummary;
  }, [nominationList]);

  const handleRemoveFromNominationList = useCallback((videoIdsOrId) => {
    const videoIds = Array.isArray(videoIdsOrId) ? videoIdsOrId : [videoIdsOrId];
    const idSet = new Set(videoIds);
    setNominationList(previousList => previousList.filter(entry => !idSet.has(entry.videoId)));
  }, []);

  const handleAddManyToNominationList = useCallback((videos) => {
    if (!videos.length) {
      return { addedCount: 0, blockedNominationCount: 0 };
    }

    const incomingIds = new Set(videos.map(video => video.videoId));
    setSupportList(previousList => previousList.filter(entry => !incomingIds.has(entry.videoId)));

    let resultSummary = {
      addedCount: 0,
      blockedNominationCount: 0,
    };
    setNominationList(previousList => {
      const result = appendUniqueVideos(previousList, videos);
      resultSummary = {
        addedCount: result.addedCount,
        blockedNominationCount: 0,
      };
      return result.nextList;
    });

    return resultSummary;
  }, []);

  const handleReorderNominationList = useCallback((newOrder) => {
    setNominationList(newOrder);
  }, []);

  const handleRemoveFromSupportList = useCallback((videoIdsOrId) => {
    const videoIds = Array.isArray(videoIdsOrId) ? videoIdsOrId : [videoIdsOrId];
    const idSet = new Set(videoIds);
    setSupportList(previousList => previousList.filter(entry => !idSet.has(entry.videoId)));
  }, []);

  const handleReorderSupportList = useCallback((newOrder) => {
    setSupportList(newOrder);
  }, []);

  const handleRemoveFromPlaylist = useCallback((videoId) => {
    const previousPlaylist = playlistRef.current;
    const removeIndex = previousPlaylist.findIndex(video => video.videoId === videoId);
    if (removeIndex < 0) return;

    const previousPlayOrderIds = resolvePlayOrderIds(previousPlaylist, shuffleOrderIdsRef.current);
    const removedPlayIndex = previousPlayOrderIds.indexOf(videoId);
    const nextPlaylist = previousPlaylist.filter(video => video.videoId !== videoId);
    const nextIdSet = new Set(nextPlaylist.map(video => video.videoId));
    const nextShuffleOrderIds = shuffleOrderIdsRef.current.length > 0
      ? shuffleOrderIdsRef.current.filter(id => nextIdSet.has(id))
      : [];

    playlistRef.current = nextPlaylist;
    setPlaylist(nextPlaylist);
    shuffleOrderIdsRef.current = nextShuffleOrderIds;
    setShuffleOrderIds(nextShuffleOrderIds);
    if (nextShuffleOrderIds.length === 0) {
      setShowOriginalOrder(false);
    }

    setListenedStatusById(previousStatus => {
      if (!(videoId in previousStatus)) return previousStatus;

      const nextStatus = { ...previousStatus };
      delete nextStatus[videoId];
      return nextStatus;
    });

    if (transientResumeVideoIdRef.current === videoId) {
      const remainingResumeIds = previousPlayOrderIds
        .slice(removedPlayIndex + 1)
        .filter(id => nextIdSet.has(id));
      transientResumeVideoIdRef.current = remainingResumeIds[0] ?? null;
    }

    if (nextPlaylist.length === 0) {
      setCurrentVideoId(null);
      if (!transientVideo) {
        setIsPlaying(false);
      }
      return;
    }

    if (!transientVideo && currentVideoIdRef.current === videoId) {
      const nextPlayOrderIds = resolvePlayOrderIds(nextPlaylist, nextShuffleOrderIds);
      const replacementVideoId = nextPlayOrderIds[Math.min(
        removedPlayIndex,
        nextPlayOrderIds.length - 1
      )] ?? nextPlaylist[0].videoId;
      if (isPlaying) {
        markVideoStarted(replacementVideoId);
      }
      setCurrentVideoId(replacementVideoId);
      return;
    }

    if (currentVideoIdRef.current && !nextIdSet.has(currentVideoIdRef.current)) {
      setCurrentVideoId(nextPlaylist[0].videoId);
    }
  }, [isPlaying, markVideoStarted, transientVideo]);

  const handleQueueFromSupportList = useCallback((videos) => {
    appendVideosToPlaylist(videos, { flashResolved: true });
  }, [appendVideosToPlaylist]);

  const handlePlayNowFromSupportList = useCallback((video) => {
    const resolvedPlayOrderIds = resolvePlayOrderIds(playlistRef.current, shuffleOrderIdsRef.current);
    const activeVideoId = currentVideoIdRef.current;

    if (!transientVideo) {
      if (resolvedPlayOrderIds.length === 0) {
        transientResumeVideoIdRef.current = null;
      } else if (isPlaying && activeVideoId) {
        const activePlayIndex = resolvedPlayOrderIds.indexOf(activeVideoId);
        transientResumeVideoIdRef.current = (
          activePlayIndex >= 0 && activePlayIndex < resolvedPlayOrderIds.length - 1
        )
          ? resolvedPlayOrderIds[activePlayIndex + 1]
          : null;
      } else {
        transientResumeVideoIdRef.current = (
          activeVideoId && resolvedPlayOrderIds.includes(activeVideoId)
        )
          ? activeVideoId
          : resolvedPlayOrderIds[0] ?? null;
      }
    }

    setTransientVideo(video);
    setIsPlaying(true);
  }, [isPlaying, transientVideo]);

  const handleSetIsPlaying = useCallback((value) => {
    setIsPlaying(previousValue => {
      const nextValue = typeof value === 'function'
        ? value(previousValue)
        : value;

      if (!previousValue && nextValue && !transientVideo) {
        markVideoStarted(currentVideoIdRef.current);
      }

      return nextValue;
    });
  }, [markVideoStarted, transientVideo]);

  return (
    <div className={`app-shell${isPlaylistCollapsed ? ' playlist-collapsed' : ''}`}>
      <TopBar
        isPlaying={isPlaying}
        setIsPlaying={handleSetIsPlaying}
        onPrev={handlePrev}
        onNext={handleNext}
        showSupportList={showSupportList}
        setShowSupportList={value => {
          if (typeof value === 'function') {
            const nextValue = value(showSupportList);
            if (nextValue) {
              handleOpenSupportList();
            } else {
              handleRequestCloseSupportList();
            }
            return;
          }

          if (value) {
            handleOpenSupportList();
          } else {
            handleRequestCloseSupportList();
          }
        }}
        showNominationsList={showNominationsList}
        setShowNominationsList={value => {
          if (typeof value === 'function') {
            const nextValue = value(showNominationsList);
            if (nextValue) {
              handleOpenNominationsList();
            } else {
              handleRequestCloseNominationsList();
            }
            return;
          }

          if (value) {
            handleOpenNominationsList();
          } else {
            handleRequestCloseNominationsList();
          }
        }}
        onLoad={handleLoad}
      />

      <main className="main-content" id="main-content">
        <VideoPlayer
          video={currentVideo}
          isPlaying={isPlaying}
          onVideoEnd={handleVideoEnd}
          onPrev={handlePrev}
          onNext={handleNext}
          onTogglePlay={() => handleSetIsPlaying(previousValue => !previousValue)}
          isShuffleEnabled={isShuffleEnabled}
          onShuffle={handleShufflePlaylist}
          isPreviewModeEnabled={isPreviewModeEnabled}
          onTogglePreview={handleTogglePreviewMode}
          isSupported={isCurrentVideoSupported}
          isNominated={isCurrentVideoNominated}
          onToggleSupport={handleToggleSupportFromPlaylist}
        />
      </main>

      <aside className={`sidebar app-sidebar${isPlaylistCollapsed ? ' collapsed' : ''}`}>
        <PlaylistSidebar
          playlist={displayPlaylist}
          currentIndex={currentDisplayIndex < 0 ? null : currentDisplayIndex}
          flashVideoIds={flashVideoIds}
          isShuffleEnabled={isShuffleEnabled}
          isPreviewModeEnabled={isPreviewModeEnabled}
          isCollapsed={isPlaylistCollapsed}
          showOriginalOrder={showOriginalOrder}
          onShuffle={handleShufflePlaylist}
          onTogglePreview={handleTogglePreviewMode}
          onToggleCollapse={() => setIsPlaylistCollapsed(previousValue => !previousValue)}
          onToggleOrderView={handleTogglePlaylistOrderView}
          onSelect={goToVideo}
          supportList={supportList}
          nominationList={nominationList}
          listenedStatusById={listenedStatusById}
          onToggleSupport={handleToggleSupportFromPlaylist}
          onAddToSupportList={handleAddToSupportList}
          onRemoveFromPlaylist={handleRemoveFromPlaylist}
        />
        {!isPlaylistCollapsed && apiKeyMissing && (
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

      {renderSupportList && (
        <FavouritesPanel
          supportList={supportList}
          onReorder={handleReorderSupportList}
          isOpen={showSupportList}
          onClose={handleRequestCloseSupportList}
          onExited={handleSupportListExited}
          onPlayNow={handlePlayNowFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromSupportList}
          title="Support list"
          titleIcon="🤝"
          tone="support"
          emptyIcon="🤝"
          emptyTitle="No support items yet"
          emptyHint="Double-click an item to queue it, or right-click for Play Now, Add to Current Playlist, and Remove Support."
          itemAriaPrefix="Support"
          removeButtonTitle="Remove from support list"
          removeButtonAriaLabel="Remove from support list"
          contextRemoveLabel="Remove Support"
          closeLabel="Close support list"
          addButtonLabel="Add Supports"
          onAddDirectItems={handleAddManyToSupportList}
        />
      )}

      {renderNominationsList && (
        <FavouritesPanel
          supportList={nominationList}
          onReorder={handleReorderNominationList}
          isOpen={showNominationsList}
          onClose={handleRequestCloseNominationsList}
          onExited={handleNominationsListExited}
          onPlayNow={handlePlayNowFromSupportList}
          onAddToPlaylist={handleQueueFromSupportList}
          onRemove={handleRemoveFromNominationList}
          title="Nominations"
          titleIcon="★"
          tone="nomination"
          emptyIcon="☆"
          emptyTitle="No nominations yet"
          emptyHint="Nominations added elsewhere will appear here, and you can still queue them from this list."
          itemAriaPrefix="Nominate"
          removeButtonTitle="Remove from nominations"
          removeButtonAriaLabel="Remove from nominations"
          contextRemoveLabel="Remove Nomination"
          closeLabel="Close nominations"
          addButtonLabel="Add Nominations"
          onAddDirectItems={handleAddManyToNominationList}
        />
      )}
    </div>
  );
}
