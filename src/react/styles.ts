/**
 * Self-contained stylesheet for the default `<ServerStatus>` UI (AGENTS.md locked
 * decision 7: injected `sai-`-prefixed CSS + custom properties; no Tailwind, no
 * CSS-in-JS runtime).
 *
 * Themeable via `--sai-*` custom properties (see docs/specs/phase-5-default-ui.md
 * §3). Defaults: light palette, flipped via `prefers-color-scheme: dark`.
 *
 * Injection happens in an effect on first default-UI render — SSR-safe (no DOM on
 * the server) and honest under `"sideEffects": false` (nothing happens at import).
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
    --sai-waking-bg: rgba(120, 53, 15, 0.35);
    --sai-waking-border: rgba(251, 191, 36, 0.25);
    --sai-waking-text: #fcd34d;
    --sai-waking-accent: #fbbf24;
    --sai-active-bg: rgba(20, 83, 45, 0.35);
    --sai-active-border: rgba(74, 222, 128, 0.25);
    --sai-active-text: #86efac;
    --sai-active-accent: #4ade80;
    --sai-offline-bg: rgba(127, 29, 29, 0.35);
    --sai-offline-border: rgba(248, 113, 113, 0.25);
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
  width: 100%;
  padding: 0.5rem 1rem;
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
  font: inherit;
  font-weight: 600;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 0.375rem;
  padding: 0.125rem 0.625rem;
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
 * Injects the default-UI stylesheet once per document. Idempotent across
 * instances, remounts, and StrictMode (guarded by the element id); no-op during
 * SSR (`typeof document === "undefined"`).
 */
export function injectServerStatusStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}
