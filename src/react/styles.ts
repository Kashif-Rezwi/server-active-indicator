/**
 * Self-contained stylesheet for the default `<ServerStatus>` UI (AGENTS.md decision 7),
 * themeable via `--sai-*` custom properties; injected on first default-UI render (SSR-safe).
 */

const STYLE_ELEMENT_ID = "server-active-indicator-styles";

export const STYLES = `
:where(:root) {
  --sai-font-size: 0.8125rem;
  --sai-waking-bg: #fef3c7;
  --sai-waking-border: #f3d9a4;
  --sai-waking-text: #92400e;
  --sai-waking-accent: #b45309;
  --sai-active-bg: #dcfce7;
  --sai-active-border: #b9e6cb;
  --sai-active-text: #14532d;
  --sai-active-accent: #15803d;
  --sai-offline-bg: #fee2e2;
  --sai-offline-border: #f6c6c6;
  --sai-offline-text: #7f1d1d;
  --sai-offline-accent: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    --sai-waking-bg: #3d1f00;
    --sai-waking-border: #92400e;
    --sai-waking-text: #fcd34d;
    --sai-waking-accent: #fbbf24;
    --sai-active-bg: #052e16;
    --sai-active-border: #166534;
    --sai-active-text: #86efac;
    --sai-active-accent: #4ade80;
    --sai-offline-bg: #3b0d0d;
    --sai-offline-border: #7f1d1d;
    --sai-offline-text: #fca5a5;
    --sai-offline-accent: #f87171;
  }
}
.sai-banner,
.sai-pill {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.375rem 0.5rem;
  max-width: 100%;
  font-family: inherit;
  font-size: var(--sai-font-size);
  font-weight: 500;
  line-height: 1.45;
  transition:
    background-color 300ms ease,
    border-color 300ms ease,
    color 300ms ease;
}
.sai-banner {
  /* nowrap keeps all state variants (icon + msg + elapsed/retry) on one line */
  flex-wrap: nowrap;
  width: 100%;
  /* fixed height so waking/active/offline banners are always the same strip */
  min-height: 2.5rem;
  padding: 0 1rem;
  border-bottom: 1px solid transparent;
}
.sai-pill {
  display: inline-flex;
  width: max-content;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid transparent;
}
.sai-banner[data-state="waking"],
.sai-pill[data-state="waking"] {
  background-color: var(--sai-waking-bg);
  border-color: var(--sai-waking-border);
  color: var(--sai-waking-text);
  --sai-icon-color: var(--sai-waking-accent);
}
.sai-banner[data-state="active"],
.sai-pill[data-state="active"] {
  background-color: var(--sai-active-bg);
  border-color: var(--sai-active-border);
  color: var(--sai-active-text);
  --sai-icon-color: var(--sai-active-accent);
}
.sai-banner[data-state="offline"],
.sai-pill[data-state="offline"] {
  background-color: var(--sai-offline-bg);
  border-color: var(--sai-offline-border);
  color: var(--sai-offline-text);
  --sai-icon-color: var(--sai-offline-accent);
}
.sai-icon {
  flex-shrink: 0;
  vertical-align: middle;
  color: var(--sai-icon-color, currentColor);
}
.sai-spinner {
  animation: sai-spin 0.8s linear infinite;
}
@keyframes sai-spin {
  to {
    transform: rotate(360deg);
  }
}
.sai-elapsed {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.sai-banner .sai-elapsed {
  padding-left: 0.625rem;
  border-left: 1px solid currentColor;
}
.sai-retry {
  box-sizing: border-box;
  /* line-height: 1 + block padding collapses the button to match inline text height */
  line-height: 1;
  font: inherit;
  font-weight: 600;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 0.375rem;
  padding: 0.2em 0.625rem;
  cursor: pointer;
}
.sai-retry:hover {
  background-color: color-mix(in srgb, currentColor 12%, transparent);
}
.sai-retry:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .sai-banner,
  .sai-pill {
    transition: none;
  }
  .sai-spinner {
    animation: none;
  }
}
`.trim();

/**
 * Injects the default-UI stylesheet once per document; idempotent across
 * instances, remounts, and StrictMode; no-op during SSR.
 */
export function injectServerStatusStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}
