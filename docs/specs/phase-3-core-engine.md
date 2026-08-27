# Spec: Phase 3 — Core state engine hardening (registry, backoff, visibility)

**Status:** implemented
**Phase:** 3 — Core state engine (docs/ROADMAP.md)
**Date:** 2026-08-26

## Goal

Turn the Phase 2 single-instance engine into the production core: a **shared
monitor registry** so N consumers of the same config share one health loop, plus the
three robustness policies deferred from Phase 2 — retry **backoff with jitter**,
**pause-when-hidden**, and opt-in **active-interval re-checks** (re-sleep detection).

## Non-goals

- No React binding (Phase 4). No UI (Phase 5).
- No sessionStorage caching (v1.x). No multi-service dashboards (roadmap).
- No new public API shapes beyond what's listed — `createMonitor`'s surface stays stable.

## Background

Locked decisions (AGENTS.md, research §10):

- **Shared monitor registry** — N consumers of the same config share one health loop.
  Locked product decision, not an optimization.
- `waking` is time-bounded by `offlineAfter` (done in Phase 2); backoff must not weaken
  that bound — it spaces retries _within_ the episode.
- Zero runtime deps; a module-level singleton registry is dependency-free.

Phase 2 left four explicit stubs: registry dedup, backoff multiplier,
`activeCheckInterval`, `pauseWhenHidden`. This phase wires all four.

## Design

### 1. Shared registry (`src/core/registry.ts`)

Module-level `Map<string, EngineEntry>` where `EngineEntry = { engine, refs }`.

- **Key**: stable serialization of the _behavioral_ config — `healthUrl` (or a
  user-supplied `key` for custom `check`/`validate`), plus the timing/validation options that
  change behavior. Identical effective config shares; differing `revealDelay`/`timeout`/
  etc. get separate engines.
- **Custom `check`/`validate` dedup problem**: functions aren't serializable. For `check` or `validate`, the key
  is an explicit optional `key?: string` on config; if absent, each `createMonitor`
  with a custom `check`/`validate` gets its **own** engine (documented — sharing custom checks
  requires an explicit key; same for `validate`).
- **Refcounting**: `createMonitor` → `acquire(config)` increments; `destroy()` →
  `release()` decrements; at 0 the engine is destroyed and removed.
- `createMonitor` returns a **per-consumer handle** (`Monitor`) proxying
  `getSnapshot`/`subscribe`/`refresh` to the shared engine but owning its own
  `destroy()` → release. Subscriptions are per-handle (each handle's listener set is
  fed by one engine subscription).

### 2. Backoff with jitter (inside the engine)

Phase 2 retried at flat `pollInterval`. Now:

```
delay = min(pollInterval * backoffFactor^(consecutiveFailures - 1), backoffCap) * jitter
```

- Defaults: `backoffFactor: 1.5`, `backoffCap: 15_000`, jitter = uniform ±20%
  (`delay * (0.8 + random() * 0.4)`).
- New optional config: `backoffFactor`, `backoffCap`. Added to `MonitorConfig` +
  `DEFAULT_CONFIG`. `backoffFactor: 1` reproduces Phase 2 flat polling.
- `offlineAfter` stays on **episode elapsed wall-clock**, not attempt count — backoff
  spaces attempts but the 60s bound is unchanged.
- Jitter is injectable for tests (`random?: () => number` internal seam) to keep the
  suite deterministic.

### 3. Pause when hidden (`pauseWhenHidden`, default true)

- Engine subscribes to `document.visibilitychange` (guarded for SSR/tests where
  `document` is undefined → no-op).
- On `hidden`: cancel pending `revealTimer` + `pollTimer`; pause `activeTimer`/`elapsedTimer`; an in-flight attempt may resolve but
  _scheduling_ is suppressed (no new attempts while hidden, no hidden-tab `checking→waking` promotion). The episode clock is
  `Date.now()`-derived, so pausing timers doesn't corrupt it.
- On `visible`: if `waking`/`checking`, resume `elapsedTimer` and immediately `attempt()` (fresh check, not a
  stale timer); if `active` and `activeCheckInterval > 0`, resume `elapsedTimer` and the interval. Otherwise ensure `elapsedTimer` exists for future episodes.
- `pauseWhenHidden: false` → no listener attached.

### 4. Active-interval re-check (`activeCheckInterval`, default 0 = off)

- When `active` and `activeCheckInterval > 0`, re-check every `activeCheckInterval` ms.
  A failing re-check transitions `active → checking → waking` (re-sleep detected) and
  the normal waking loop resumes. A passing re-check stays `active` (updates
  `lastCheckedAt`/`lastLatencyMs`).
- Re-checks while `active` do **not** reset `wasCold` (recovery-confirmation is
  per-session-episode).

### Files

```
src/core/registry.ts   → NEW: shared engine registry + per-consumer handles
src/core/monitor.ts    → engine gains backoff, visibility, active-interval; createMonitor delegates to registry
src/core/types.ts      → MonitorConfig += key, backoffFactor, backoffCap
src/core/defaults.ts   → += backoffFactor: 1.5, backoffCap: 15_000
tests/registry.test.ts → NEW: dedup, refcount, custom-check keying
tests/monitor.test.ts  → extend: backoff timing, pause/visible, active-interval re-sleep
```

## Edge cases & failure modes

| Case                                     | Behavior                                           |
| ---------------------------------------- | -------------------------------------------------- |
| Two consumers, same `healthUrl`          | one engine, one health loop, both notified         |
| Same URL, different `revealDelay`        | separate engines (behavior differs)                |
| Custom `check`, no `key`                 | each consumer gets its own engine (documented)     |
| Custom `check`, same `key`               | shared engine                                      |
| `destroy()` one of two consumers         | engine lives until refcount 0                      |
| Tab hidden mid-`waking`                  | poll timer cancelled; no new attempts while hidden |
| Tab visible again                        | immediate fresh attempt if `waking`/`checking`     |
| `activeCheckInterval` fires while hidden | suppressed; resumes on visible                     |
| SSR (`document`/`navigator` undefined)   | policies no-op; engine still works                 |
| Jitter determinism in tests              | `random` seam injected                             |

## Acceptance criteria

- [x] Two `createMonitor` with identical config share one engine (one fetch loop)
- [x] Refcount: engine destroyed only when last consumer destroys
- [x] Backoff: delays grow by factor, capped, jittered; `offlineAfter` still on wall-clock
- [x] Hidden tab cancels polling (including revealTimer → no hidden waking promotion) and pauses active/elapsed intervals; visible triggers immediate re-attempt and resumes intervals
- [x] `activeCheckInterval` detects re-sleep (`active → waking`)
- [x] SSR-safe (no `document`/`navigator` guards throw)
- [x] `pnpm verify` green; coverage on `src/core/` measured (97.52% lines / 91.66% branches)

## Validation gate

Vitest suites (registry + extended monitor) green; `pnpm verify` green; coverage on
`src/core/` reported and trending to the ≥90% gate (enforced hard in Phase 6). Then
mark roadmap Phase 3 and proceed to Phase 4 (React layer).
