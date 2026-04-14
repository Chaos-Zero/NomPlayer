import React from 'react';

export function PreviousIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M5 4.5C5 4.09 4.66 3.75 4.25 3.75C3.84 3.75 3.5 4.09 3.5 4.5V15.5C3.5 15.91 3.84 16.25 4.25 16.25C4.66 16.25 5 15.91 5 15.5V4.5Z" />
      <path d="M15.75 4.6V15.4C15.75 15.99 15.09 16.34 14.6 16L7.11 10.6C6.7 10.31 6.7 9.69 7.11 9.4L14.6 4C15.09 3.66 15.75 4.01 15.75 4.6Z" />
    </svg>
  );
}

export function NextIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M15 4.5C15 4.09 15.34 3.75 15.75 3.75C16.16 3.75 16.5 4.09 16.5 4.5V15.5C16.5 15.91 16.16 16.25 15.75 16.25C15.34 16.25 15 15.91 15 15.5V4.5Z" />
      <path d="M4.25 4.6V15.4C4.25 15.99 4.91 16.34 5.4 16L12.89 10.6C13.3 10.31 13.3 9.69 12.89 9.4L5.4 4C4.91 3.66 4.25 4.01 4.25 4.6Z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg
      className="transport-icon transport-icon-play"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M6.25 4.67V15.33C6.25 15.91 6.89 16.27 7.39 15.96L15.75 10.63C16.22 10.33 16.22 9.67 15.75 9.37L7.39 4.04C6.89 3.73 6.25 4.09 6.25 4.67Z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M6.5 4.5C6.5 4.09 6.84 3.75 7.25 3.75H8.25C8.66 3.75 9 4.09 9 4.5V15.5C9 15.91 8.66 16.25 8.25 16.25H7.25C6.84 16.25 6.5 15.91 6.5 15.5V4.5Z" />
      <path d="M11 4.5C11 4.09 11.34 3.75 11.75 3.75H12.75C13.16 3.75 13.5 4.09 13.5 4.5V15.5C13.5 15.91 13.16 16.25 12.75 16.25H11.75C11.34 16.25 11 15.91 11 15.5V4.5Z" />
    </svg>
  );
}

export function FastForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M3.75 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42L4.89 4.31c-.5-.3-1.14.06-1.14.64Z" />
      <path d="M10.5 4.95v10.1c0 .58.64.94 1.14.64l6.45-4.98c.44-.34.44-1.08 0-1.42l-6.45-4.98c-.5-.3-1.14.06-1.14.64Z" />
    </svg>
  );
}

export function PlaylistPlusIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
    </svg>
  );
}

export function ShuffleIcon() {
  return (
    <svg
      className="transport-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M10.59 9.17L5.41 4L4 5.41l5.17 5.17l1.42-1.41zM14.5 4l2.04 2.04L4 18.59L5.41 20L17.96 7.46L20 9.5V4h-5.5zm.33 9.41l-1.41 1.41l3.13 3.13L14.5 20H20v-5.5l-2.04 2.04l-3.13-3.13z" />
    </svg>
  );
}

export function StopwatchIcon({
  countdown = 30,
  className = 'transport-icon',
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
    >
      <circle
        cx="10"
        cy="11.2"
        r="8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M10 2.9V1.4M7.8 1.4H12.2M15.8 5.4L16.8 4.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <text
        x="10"
        y="11.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="900"
        fill="currentColor"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}
      >
        {countdown}
      </text>
    </svg>
  );
}

export function HeartIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582 20.77 20.77 0 0 1-1.162.682l-.019.01-.005.003L9.653 16.915z" />
    </svg>
  );
}

export function HeartEmptyIcon({ className = 'collection-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582 20.77 20.77 0 0 1-1.162.682l-.019.01-.005.003L9.653 16.915z" />
    </svg>
  );
}

export function StarIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2l2.35 4.76 5.26.76-3.81 3.71.9 5.24L10 14.12l-4.7 2.47.9-5.24-3.81-3.71 5.26-.76L10 2z" />
    </svg>
  );
}

export function LockIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8H7V5.5a3 3 0 1 1 6 0V9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function SpeechBubbleIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 2c-2.236 0-4.43.18-6.57.532a2.31 2.31 0 00-1.93 2.185c-.286 1.9-.447 3.832-.482 5.8a2.301 2.301 0 001.077 2.05L4 14.5V17a1 1 0 001.625.78L8.734 15.1c.42.025.84.042 1.266.05 2.236 0 4.43-.18 6.57-.532a2.31 2.31 0 001.93-2.185c.286-1.9.447-3.832.482-5.8a2.301 2.301 0 00-1.077-2.05L16 3.5V2h-6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FeedbackIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.75,14 C11.9926407,14 13,15.0073593 13,16.25 L13,17.7519766 L12.9921156,17.8604403 C12.6813607,19.9866441 10.7715225,21.0090369 7.5667905,21.0090369 C4.37361228,21.0090369 2.43330141,19.9983408 2.01446278,17.8965776 L2,17.75 L2,16.25 C2,15.0073593 3.00735931,14 4.25,14 L10.75,14 Z M7.5,6 C9.43299662,6 11,7.56700338 11,9.5 C11,11.4329966 9.43299662,13 7.5,13 C5.56700338,13 4,11.4329966 4,9.5 C4,7.56700338 5.56700338,6 7.5,6 Z M19.75,2 C20.9926407,2 22,3.00735931 22,4.25 L22,7.75 C22,8.99264069 20.9926407,10 19.75,10 L18.197189,10 L15.6555465,12.2070729 C15.2384861,12.5691213 14.6068936,12.5245251 14.2448452,12.1074647 C14.0869422,11.9255688 14,11.6927904 14,11.4522588 L13.9993343,9.98619411 C12.8746672,9.86153043 12,8.90790995 12,7.75 L12,4.25 C12,3.00735931 13.0073593,2 14.25,2 L19.75,2 Z" />
    </svg>
  );
}

export function SunIcon({ className = 'theme-toggle-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ className = 'theme-toggle-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function SearchIcon({ className = 'collection-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
export function MusicIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

export function PencilIcon({ className = 'collection-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export function XIcon({ className = 'collection-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
export function DatabaseIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 3.57 2 5.5v13C2 20.43 6.48 22 12 22s10-1.57 10-2.5v-13C22 3.57 17.52 2 12 2zm0 2c4.83 0 8 1.34 8 1.5S16.83 7 12 7 4 5.66 4 5.5 7.17 4 12 4zM4 8.34C5.58 9.36 8.55 10 12 10s6.42-.64 8-1.66V12c0 .16-3.17 1.5-8 1.5S4 12.16 4 12V8.34zm0 6C5.58 15.36 8.55 16 12 16s6.42-.64 8-1.66V18.5c0 .16-3.17 1.5-8 1.5s-8-1.34-8-1.5v-4.16z" />
    </svg>
  );
}

export function FilterIcon({ className = 'collection-icon' }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6 10a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zM9 15a1 1 0 011-1h0a1 1 0 110 2h0a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function SortByRatingIcon({ className = 'collection-icon' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9h10M3 15h10M7 5v14M11 5v14" opacity="0.5" />
      <path d="M17 11l3 3 3-3M20 18V6" />
    </svg>
  );
}
