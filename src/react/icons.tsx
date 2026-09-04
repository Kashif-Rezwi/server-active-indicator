import type { ReactNode } from "react";

/**
 * Decorative inline status icons (AGENTS.md locked decision 7 — no icon library):
 * every icon is `aria-hidden` and sized `1.25em` to have optical weight that reads
 * clearly at banner font sizes. No circle wrappers — solid bold paths fill the
 * viewBox directly so they feel proportional without being oversized.
 */

export function SpinnerIcon(): ReactNode {
  // Three-quarter arc; the `sai-spinner` class rotates it (disabled under
  // `prefers-reduced-motion`, see styles.ts).
  return (
    <svg
      className="sai-icon sai-spinner"
      viewBox="0 0 16 16"
      width="1.25em"
      height="1.25em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeDasharray="27 10"
      />
    </svg>
  );
}

export function CheckIcon(): ReactNode {
  // Bold standalone checkmark — no circle; the tick alone reads as "success"
  // and has far more visual mass than a circle-outline variant at small sizes.
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1.25em"
      height="1.25em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 8.5L6.5 12.5L13.5 4"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OfflineIcon(): ReactNode {
  // Bold X — no circle; stands confidently as an error mark.
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1.25em"
      height="1.25em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WifiOffIcon(): ReactNode {
  // WiFi arcs + dot with a diagonal slash: the browser itself is offline.
  return (
    <svg
      className="sai-icon"
      viewBox="0 0 16 16"
      width="1.25em"
      height="1.25em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 6.2a8 8 0 0 1 11 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 9a4.5 4.5 0 0 1 6 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="12" r="1.25" fill="currentColor" />
      <path d="M2 14L14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
