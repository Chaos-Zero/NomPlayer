import { useSyncExternalStore } from 'react';

function getMediaQueryList(query) {
  return window.matchMedia?.(query) ?? null;
}

function subscribe(query, onStoreChange) {
  const mediaQueryList = getMediaQueryList(query);
  if (!mediaQueryList) {
    return () => {};
  }

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', onStoreChange);
    return () => {
      mediaQueryList.removeEventListener('change', onStoreChange);
    };
  }

  mediaQueryList.addListener(onStoreChange);
  return () => {
    mediaQueryList.removeListener(onStoreChange);
  };
}

function getSnapshot(query) {
  return getMediaQueryList(query)?.matches ?? false;
}

export default function useMediaQuery(query) {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(query, onStoreChange),
    () => getSnapshot(query),
    () => false,
  );
}
