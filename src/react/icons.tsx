import type { ReactNode } from "react";

/**
 * Decorative inline status icons (AGENTS.md locked decision 7 — no icon library):
 * every icon is `aria-hidden` and sized `1em` to track `--sai-font-size`.
 */

export function SpinnerIcon(): ReactNode {
  // Three-quarter arc; the `sai-spinner` class rotates it (disabled under
  // `prefers-reduced-motion`, see styles.ts).
  return (
    <svg
      className="sai-icon sai-spinner"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="29.45 9.82"
      />
    </svg>
  );
}

export function CheckIcon(): ReactNode {
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5.2 8.3l1.9 1.9 3.7-4.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OfflineIcon(): ReactNode {
  // X-circle: the backend could not be reached.
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5.9 5.9l4.2 4.2m0-4.2l-4.2 4.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WifiOffIcon(): ReactNode {
  // WiFi arcs + dot with a slash: the browser itself is offline.
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.8 6.6a7.5 7.5 0 0 1 10.4 0" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.2 9.1a4.2 4.2 0 0 1 5.6 0" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="8" cy="11.6" r="1" fill="currentColor" />
      <path d="M2.5 13.5L13.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
