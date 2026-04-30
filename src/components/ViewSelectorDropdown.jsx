import React, { useState, useEffect, useRef } from 'react';

const VIEW_ITEMS = [
  {
    key: 'lists',
    label: 'Manage Lists',
    sub: 'Manage your lists and see community nominations',
    icon: 'M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5',
    strokeIcon: true,
  },
  {
    key: 'community-playlists',
    label: 'Community Playlists',
    sub: 'Browse and load public playlists from other users',
    icon: 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
    dividerBefore: true,
  },
  {
    key: 'comments',
    label: 'Comments & Ratings',
    sub: 'Your feedback and community interactions',
    icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z',
  },
];

const CHECK_PATH =
  'M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z';
const CHEV_PATH =
  'M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z';

function Svg({ path, viewBox = '0 0 24 24', stroke = false }) {
  if (stroke) {
    return (
      <svg
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={path} />
      </svg>
    );
  }
  return (
    <svg viewBox={viewBox} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
}

export default function ViewSelectorDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = VIEW_ITEMS.find((i) => i.key === value) ?? VIEW_ITEMS[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className={`np-dd np-dd-full${open ? ' open' : ''}`}>
      <button
        type="button"
        className="np-dd-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="np-dd-t-icon">
          <Svg path={selected.icon} stroke={selected.strokeIcon} />
        </span>
        <span className="np-dd-t-meta">
          <span className="np-dd-t-ctx">View</span>
          <span className="np-dd-t-val">{selected.label}</span>
        </span>
        <span className="np-dd-chevron">
          <Svg path={CHEV_PATH} viewBox="0 0 20 20" />
        </span>
      </button>

      <div className="np-dd-menu" role="listbox">
        <div className="np-dd-group-label">Explorer views</div>
        {VIEW_ITEMS.map((item) => (
          <React.Fragment key={item.key}>
            {item.dividerBefore && (
              <>
                <div className="np-dd-divider" />
                <div className="np-dd-group-label">Community</div>
              </>
            )}
            <div
              className={`np-dd-item${item.key === value ? ' sel' : ''}`}
              role="option"
              aria-selected={item.key === value}
              onClick={() => {
                onChange(item.key);
                setOpen(false);
              }}
            >
              <span className="np-dd-i-icon">
                <Svg path={item.icon} stroke={item.strokeIcon} />
              </span>
              <span className="np-dd-i-body">
                <span className="np-dd-i-name">{item.label}</span>
                <span className="np-dd-i-sub">{item.sub}</span>
              </span>
              <span className="np-dd-i-check">
                <Svg path={CHECK_PATH} />
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
