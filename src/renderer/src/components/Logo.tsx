/** The app icon (same drawing as build/icon.svg): a price tag with a crossed-out zero. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden>
      <defs>
        <linearGradient id="gs-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="56" fill="url(#gs-logo-bg)" />
      <path
        d="M60 70 a10 10 0 0 1 10 -10 h66 a12 12 0 0 1 8.5 3.5 l58 58 a12 12 0 0 1 0 17 l-64 64 a12 12 0 0 1 -17 0 l-58 -58 A12 12 0 0 1 60 136 Z"
        fill="#ffffff"
      />
      <circle cx="92" cy="92" r="12" fill="#0d9488" />
      <ellipse cx="146" cy="146" rx="20" ry="27" fill="none" stroke="#0d9488" strokeWidth="12" />
      <line x1="122" y1="176" x2="170" y2="116" stroke="#0d9488" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}
