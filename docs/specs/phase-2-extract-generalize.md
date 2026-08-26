# Spec: Phase 2 — Extract & generalize the core monitor

**Status:** implemented
**Phase:** 2 — Extract & generalize (docs/ROADMAP.md)
**Date:** 2026-08-26

## Goal

Port the proven "Server Wakeup" semantics from `code-review-agent` (dossier §6.1) into
framework-free TypeScript in `src/core/`, with every app-coupled value parameterized.
After this phase, `createMonitor()` runs the full check loop as a plain-JS engine —
React is not involved yet (Phase 4).

## Non-goals

- No shared-monitor registry / cross-instance dedup (Phase 3).
- No retry backoff+jitter, no `activeCheckInterval` re-sleep polling, no
  `pauseWhenHidden` (Phase 3 — in the config now, wired next phase).
- No sessionStorage caching (v1.x). No UI, no React.

## Background

Dossier §6.1 (`use-server-wakeup.ts`) — the semantics being ported:

- `pingHealth`: `fetch(url, { signal, cache: "no-store" })`, success = `res.ok`,
  any throw → `false`. Never parses the body.
- First check runs immediately. If it succeeds → stays `idle`, banner never renders.
  If it fails → `waking`, elapsed counter starts, poll every 5s until success →
  `awake`. 3s per-attempt timeout.

Locked additions from research §4/§8/§9 that change the naive port:

- 5-state machine: `unknown | checking | waking | active | offline`.
- `revealDelay` (3s) and `timeout` (10s) are separate knobs.
- `waking` is time-bounded by `offlineAfter` (60s) → `offline`.
- 4xx on the health endpoint fast-paths to `offline` (`reason: 'http-error'`).
- `navigator.onLine === false` → `offline` with a distinct message.
- Failures carry a developer-facing `reason`.

### The one real design decision: what does a successful **first** check resolve to?

The original code stays `idle` (our `unknown`) on a warm first ping so the green
confirmation only appears on recovery. But a reusable engine must let headless
consumers distinguish "haven't checked" from "checked and healthy".

**Decision:** the engine's machine is `unknown → checking → active` on a warm first
ping. "Green confirmation only on recovery, silence on warm start" becomes a
**presentation policy**, not engine state:

- The snapshot exposes `wasCold` (did this episode pass through `waking`?).
- The default UI (Phase 5) shows the green confirmation only when
  `status === 'active' && wasCold`, auto-hiding after `successDisplayMs`.
- Headless consumers get the honest status (`active`) and decide themselves.

This preserves the proven UX exactly while keeping the engine truthful.

## Design

### Files

```
src/core/check.ts     → default health-check strategy (fetch) + reason classification
src/core/monitor.ts   → createMonitor(): the engine (state, timers, loop)
src/core/types.ts     → extend snapshot: wasCold, lastLatencyMs, offlineKind
tests/monitor.test.ts → Vitest + fake timers + mocked fetch
```

### Health-check strategy (`check.ts`)

`defaultCheck(config) → Promise<CheckResult>`:

- `fetch(healthUrl, { method: "GET", cache: "no-store", signal, headers, credentials })`
  with `AbortSignal.timeout(timeout)` combined with the caller's abort signal.
- Success = `validate ? validate(res) : res.ok`.
- Classification (research §9):
  - 2xx (+ validate pass) → `{ ok: true, status }`
  - 4xx → `{ ok: false, reason: "http-error", status }` (fast-path to offline)
  - 5xx → `{ ok: false, reason: "request-failed", status }` (Railway 502-on-wake lands here)
  - throw / timeout-abort / CORS / DNS → `{ ok: false, reason: "request-failed" }`
  - caller abort (unmount/refresh supersede) → `ABORTED` sentinel, no state change
- A response that resolved slower than `revealDelay` records `slow-response` as the
  episode reason (a slow success still ends `active`; `slow-response` explains why UI
  appeared).

### Monitor engine (`monitor.ts`)

`createMonitor(config)` resolves config against `DEFAULT_CONFIG`; requires `healthUrl`
or `check` (throws otherwise). Holds a `MonitorSnapshot`, notifies subscribers on
change. Loop:

```
start (on create):
  unknown → checking; run attempt
  if attempt unresolved when revealDelay elapses → waking (counter starts)
  attempt ok → active;  wasCold = episode passed through waking
  attempt fail (5xx/network/timeout) → next attempt in pollInterval;
      if elapsed since episode start ≥ offlineAfter → offline
  attempt fail (4xx) → offline immediately (reason http-error)
  navigator.onLine === false at attempt time → offline (offlineKind: 'browser')
refresh():  single-flight; re-enters checking from any state (manual retry)
destroy():  aborts in-flight, clears timers, unsubscribes
```

Snapshot (extended): `{ status, reason?, elapsedSeconds, lastCheckedAt, attempts,
wasCold, lastLatencyMs, offlineKind? }`.

Deferred to Phase 3 (documented, not wired): backoff multiplier, registry dedup,
`activeCheckInterval`, `pauseWhenHidden`.

## Edge cases & failure modes

| Case                              | Behavior                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Neither `healthUrl` nor `check`   | `createMonitor` throws descriptive error                                                      |
| Abort during unmount              | no state change, no notify after destroy                                                      |
| `navigator` undefined (SSR/test)  | treated as online; check proceeds                                                             |
| `fetch` undefined                 | treated as request-failed (offline path)                                                      |
| Elapsed-counter drift             | computed from `Date.now()` delta, not incremented                                             |
| Success slower than `revealDelay` | UI appeared during the wait; ends `active`, `wasCold=true`, episode `reason: 'slow-response'` |
| 4xx on very first check           | `offline` straight from the first attempt (no 60s wait)                                       |

## Acceptance criteria

- [ ] `createMonitor` runs the loop framework-free with mocked fetch + fake timers
- [ ] Transition coverage: warm first ping; cold start (fail→…→active); 4xx → offline;
      offlineAfter bound; manual refresh from offline; destroy mid-flight
- [ ] `wasCold` true only when the episode passed through `waking`
- [ ] No app coupling: no imports outside `src/core`, no env vars, URL from config
- [ ] `pnpm verify` green
- [ ] Behavior-parity notes vs dossier §12 appended to this spec post-implementation

## Validation gate

Vitest suite green covering the transitions above; `pnpm verify` green. Then mark
roadmap Phase 2 and proceed to Phase 3 (registry dedup, backoff, visibility).

---

## Behavior-parity notes vs dossier §12 (post-implementation, 2026-08-26)

| Original (code-review-agent)                       | Ported engine                                                                                         | Notes                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| First ping fires immediately on mount              | First attempt fires in `createMonitor`                                                                | parity                                                                                                                        |
| 3s per-attempt timeout                             | `timeout` default 10s; `revealDelay` 3s                                                               | **intentional change** (research §8): reveal threshold kept at proven 3s, per-attempt ceiling raised for ~60s Render spin-ups |
| 5s flat polling, forever                           | `pollInterval` default 5s, bounded by `offlineAfter` (60s)                                            | **intentional fix** of "waking forever"; backoff lands in Phase 3                                                             |
| No retry cap                                       | `offlineAfter` bounds the episode                                                                     | **intentional fix**                                                                                                           |
| `idle/waking/awake`                                | `unknown/checking/waking/active/offline`                                                              | superset, per locked 5-state model                                                                                            |
| Warm first ping → stays `idle`, banner never shows | Warm first ping → `active`, `wasCold=false`; UI hides via presentation policy                         | semantics preserved, engine stays truthful (spec decision)                                                                    |
| Green confirmation 2.5s then gone                  | unchanged — `successDisplayMs` default 2.5s, enforced by Phase 5 UI                                   | parity (deferred to UI layer)                                                                                                 |
| Elapsed counter, 1s ticks                          | wall-clock-derived `elapsedSeconds`, ticks only while `waking`                                        | parity, drift-proof                                                                                                           |
| `res.ok`-only check, body never parsed             | identical default; opt-in `validate(res)` added                                                       | parity + extension                                                                                                            |
| All failures → "waking" forever                    | classified: 4xx→`offline` (http-error), 5xx/network→`waking`, browser-offline→`offline` (offlineKind) | **intentional fix** (research §9)                                                                                             |
| `AbortController` per attempt, cancel on unmount   | per-attempt controller + `AbortSignal.timeout`/`AbortSignal.any`; `destroy()` aborts                  | parity, modernized                                                                                                            |
| `API_URL` import from app config                   | `healthUrl`/`check` injected via config                                                               | **decoupled** — no imports outside `src/core`                                                                                 |
| `DEV_SIMULATE_SLEEP` hand-toggle                   | not ported; Phase 6 adds a real simulated-sleeper fixture                                             | replaced by proper test fixture                                                                                               |
