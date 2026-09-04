# server-active-indicator

## 0.3.1

### Patch Changes

- 5ef42e9: Redesign status icons for better legibility, refresh dark-mode color tokens, stabilize banner height across state variants, and polish the default status message copy.

## 0.3.0

### Minor Changes

- b3da57e: Subscriber error isolation; `successDisplayMs` moved to React layer; `sideEffects` corrected.
  
  - fix(core): a throwing subscriber in `setSnapshot` is now isolated via per-listener `try/catch` — subsequent subscribers in the same engine still receive state updates; errors are reported via `console.error` rather than propagated. Previously, one bad subscriber could abort the entire notification loop.
  - fix(core): remove `successDisplayMs` from `MonitorConfig` and `DEFAULT_CONFIG` — it was a presentation-only value the engine never read, and its presence misled vanilla-JS consumers. The prop is re-declared on `ServerStatusProps` with a local `DEFAULT_SUCCESS_DISPLAY_MS = 2_500` constant. `<ServerStatus successDisplayMs={…}>` continues to work unchanged; `createMonitor({ successDisplayMs: … })` is now a TypeScript error.
  - fix(pkg): correct `sideEffects` from `false` to `["./dist/react/*"]` — the React subpath injects a `<style>` element into `document.head`, which is a genuine DOM side effect that aggressive bundlers must not tree-shake.
- fbf0e1c: Require modern runtimes: drop the internal degradation fallbacks for environments without `AbortSignal.timeout`/`AbortSignal.any` (pre-2023–24 browsers) and the missing-`fetch` guard for Node < 18. No public API change — every config and behavior is identical on evergreen browsers; the core bundle shrinks and the health-check path is simpler. SSR health checks need Node ≥ 20.3.

## 0.2.3

### Patch Changes

- 74bbfa8: Docs only: remove the table frame around the demo GIF in the README.

## 0.2.2

### Patch Changes

- d76b696: Docs only: frame the demo GIF in a single-cell table so it renders with a visible border on dark-mode dashboards (npm, GitHub). No code changes.

## 0.2.1

### Patch Changes

- 4e4f6a1: Fix the README as rendered on npmjs.com: the demo GIF and all repository links used repo-relative paths, which npm cannot resolve (the demo image was broken and repo links 404'd). They now use absolute URLs pinned to the repository, and an npm version badge was added.

## 0.2.0

### Minor Changes

- 68c2aaa: Remove the IIFE bundle (`dist/server-active-indicator.iife.global.js`) and the `unpkg`/`jsdelivr` package fields.
  
  **Breaking for `<script>`-tag (CDN) users:** the floating unpkg/jsDelivr URLs (`https://unpkg.com/server-active-indicator/dist/server-active-indicator.iife.global.js`) will 404 after this release. Pin an older version if you load the package via a script tag, or migrate to a bundler / ESM import (`import { createMonitor } from "server-active-indicator"`). The IIFE build served core-only usage, which is not viable for a library whose primary entry has a React peer dependency.
  
  Also drop the meaningless `engines` field (this package runs in browsers; the Node constraint only ever applied to dev tooling), and slightly change engine internals: each health-check attempt now emits a single snapshot (attempt counter included) instead of two, and `elapsedSeconds` resets to `0` on transition to `active`. Snapshot values are unchanged; only the delivery is consolidated.

## 0.1.2

### Patch Changes

- 0fed58d: Pre-integration audit hardening:
  
  - fix(core): support browsers without `AbortSignal.any`/`AbortSignal.timeout` (Chrome <116, Safari <17.4, Firefox <124) via a manual AbortController + setTimeout fallback — previously such environments threw inside the check and left the engine permanently stuck with an unhandled rejection
  - fix(core): bound custom `check` calls by `timeout`, so a check that never settles can no longer wedge the monitor in `waking` forever (`offlineAfter` is now reachable for every attempt type)
  - fix(core): settle-safety — any throw/rejection escaping a check now counts as a failed attempt instead of sticking the engine's in-flight flag
  - perf(core): the 1s elapsed-seconds ticker now only runs during `waking` episodes; a warm backend leaves zero timers running (silence on success)
  - feat(core): browser-offline episodes recover automatically when the browser fires the `online` event; server-offline recovery stays manual (Retry / `refresh()`)
  - docs: clarify that `timeout` bounds custom checks, `successDisplayMs` is a `<ServerStatus>`-only presentation prop, `offline` is terminal until recovery, and the 4xx fast-path rationale

## 0.1.0

### Minor Changes

- ca76650: Initial release: framework-agnostic core (5-state machine, shared monitor registry, backoff+jitter, visibility pause, offline detection), React adapter (useServerStatus, ServerStatusProvider, ServerStatus banner/pill with sai- styles), full test matrix with src/core coverage gates, and publishable artifact.
