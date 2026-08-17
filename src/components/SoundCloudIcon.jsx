// A simplified cloud + waveform glyph rather than a reproduction of
// SoundCloud's actual (fairly intricate) logomark — this is only ever used
// as a small in-app "which provider is this" badge alongside a text label,
// not standalone branding, so a recognizable approximation is enough.
export default function SoundCloudIcon({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M17 10.06a4.5 4.5 0 0 0-1.44.24A6 6 0 0 0 9.5 6a.75.75 0 0 0-.75.75v10a.75.75 0 0 0 .75.75H17a3.75 3.75 0 0 0 0-7.5Z" />
      <rect x="6.75" y="10" width="1.1" height="7.1" rx="0.55" />
      <rect x="4.75" y="11.5" width="1.1" height="5.6" rx="0.55" />
      <rect x="2.75" y="13" width="1.1" height="4.1" rx="0.55" />
    </svg>
  );
}
