const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export function ArrowRightIcon({ size = 18 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 15 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function RestartIcon({ size = 18 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function MapIcon({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M14.1 6.4 9 3.6 3.5 5.5a.8.8 0 0 0-.5.7v13.2a.6.6 0 0 0 .8.6L9 18l5.9 2.4 5.6-1.9a.8.8 0 0 0 .5-.7V4.6a.6.6 0 0 0-.8-.6L14.1 6.4Z" />
      <path d="M9 3.6v14.5" />
      <path d="M14.5 6.3v14" />
    </svg>
  );
}

export function SunIcon({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 17 }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
