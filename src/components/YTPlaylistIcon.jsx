export default function YTPlaylistIcon({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M22 7H2v2h20V7zm0 4H2v2h20v-2zm-6 4H2v2h14v-2zm4 0v6l5-3-5-3z" />
    </svg>
  );
}
