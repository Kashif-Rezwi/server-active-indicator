# server-active-indicator

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
