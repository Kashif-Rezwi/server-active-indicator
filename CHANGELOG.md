# server-active-indicator

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

- ca76650: Initial release: framework-agnostic core (5-state machine, shared monitor registry, backoff+jitter, visibility pause, offline detection), React adapter (useServerStatus, ServerStatusProvider, ServerStatus banner/pill with sai- styles), sleeping-server fixture and demo apps, full test matrix with src/core coverage gates, and publishable artifact.
