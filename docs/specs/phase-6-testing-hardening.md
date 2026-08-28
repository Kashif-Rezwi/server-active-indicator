# Spec: Phase 6 — Testing hardening

**Status:** implemented **Phase:** 6 **Date:** 2026-08-26

## Goal

Earn the right to publish `server-active-indicator` by closing every testing gap between "tests exist" and "every behavior we ship is provably exercised". Two deliverables: (1) a full network-condition matrix covering the failure modes a real deployed API can produce, and (2) a coverage gate (≥90% on `src/core/`) wired into `pnpm verify` so it can never silently regress.

## Non-goals

- **No CI workflows yet.** That is Phase 10. The gate is enforced by `pnpm verify`; CI later wires that same script to GitHub Actions.
- **No changes to public API or state-machine semantics.** This phase writes tests and tightens coverage config. Anything else is a follow-up.
- **No coverage gate on `src/react/`.** DOM- and axe-coupled code is harder to hit ≥90% on without inflating the suite with mechanical tests; that is a Phase 7/9 concern, not a "confidence to publish" blocker.

## Background

- `docs/research/research-report.md` §9 — the failure-mode matrix that informed the engine (4xx fast-path, 5xx incl. Railway 502-on-wake, DNS/CORS → `request-failed`, browser-offline distinction).
- `docs/research/Server-Active-Indicator-Feature-Dossier.md` — locked product constraints (silence on success, no `sleeping` state, honesty about what the browser can observe).
- Coverage baseline (2026-08-26, pre-phase): `src/core/` = 94.55% lines / 84.84% branches. The gate (90%) is reachable; the gaps are real and named below.

## Approach

### 1. Network-condition matrix

Split into two new files so responsibilities stay clean:

- **`tests/check.test.ts`** — unit-level tests of `defaultCheck` against a stubbed `fetch`. Verifies the _contract_ of the health-check function: 2xx ok, 4xx → `http-error`, 5xx → `request-failed`, throw → `request-failed`, caller-abort → `ABORTED` sentinel (not a result), missing global `fetch` → `request-failed`, custom `validate` throwing caught by `safeValidate`, `headers`/`credentials` passed through. **No timers** — these are pure.
- **`tests/network-matrix.test.ts`** — integration tests through `createMonitor` covering the network conditions the engine must _handle_ correctly: 4xx fast-path → `offline` (no waking limbo); Railway 502-on-wake → 200 recovery → `active` with `wasCold=true`; DNS/CORS failures until recovery → `waking` → `active`; browser-offline `online`/`offline` events flip state without a fetch; slow response straddling `revealDelay` vs `timeout` (the two options stay observably separate); malformed body on a 200 is still `ok:true` (locked behavior — we never parse the body).

Why two files rather than one: a failure in `check.ts` shows up in `check.test.ts` with a tight feedback loop (no timers), while engine behavior stays in the timer-driven style of the rest of the suite. If a regression is _behavioral_ (state machine) vs _mechanical_ (HTTP contract), the file name tells the maintainer immediately.

### 2. Coverage gate ≥90% on `src/core/`

`vitest.config.ts` already wires `@vitest/coverage-v8`. Two changes:

- Replace the placeholder `thresholds: { lines: 0 }` with a per-glob gate: `src/core/**` must hold 90% on lines / functions / statements and 85% on branches. Branches sit at 84.84% today; the matrix + targeted tests below bring it above 85%. (90% branches would force tests for defensive `typeof document === "undefined"` SSR branches that we explicitly _don't_ want to assert on — 85% is the honest ceiling.)
- Wire coverage into `pnpm verify`: change the `test` step from `vitest run` to `vitest run --coverage` so the gate cannot be skipped. Keep `pnpm test` as the fast-feedback command (no coverage). Sync the command table in `AGENTS.md`.

The named gaps to close _before_ flipping the gate:

- `src/core/check.ts` 78% lines: missing `fetch` global, missing `safeValidate` throw path, missing non-default `headers`/`credentials` passthrough.
- `src/core/engine.ts` branches: `offlineAfter` elapsed-boundary, the `online` event handler, the visibility-change resume paths (`waking`/`checking` mid-episode, `active` resume of active-interval), the `pauseWhenHidden: false` opt-out.
- `src/core/registry.ts`: `stableStringify` primitives vs arrays paths — already exercised by existing registry tests, but pin them with a small targeted case for the `null`/array branches.

### Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| Gate location: `vitest.config.ts` | Standard | Throws on local runs; can be skipped | **Pick** — and additionally wire into `verify` so skipping is loud |
| Gate location: separate `vitest.coverage.config.ts` | Decoupled | Easy to forget to run | Reject — the standard hook is honest |
| Gate: 90% branches | Stricter | Forces tests for SSR-branches we don't want to assert on | Reject — 85% branches is the honest ceiling |
| Matrix: one big file | Fewer files | Mixes pure functions with timer-driven engine tests; slow feedback | Reject — split per §1 |
| Matrix: extend `monitor.test.ts` | Fewer files | That file is already 600+ lines and would grow past readability | Reject — separate file |

## Design

### File layout

```
tests/
  check.test.ts            NEW — defaultCheck unit tests (no timers)
  network-matrix.test.ts   NEW — engine-level network-condition matrix
```

### Coverage config shape

```ts
// vitest.config.ts (excerpt)
coverage: {
  provider: "v8",
  include: ["src/**"],
  thresholds: {
    // 90% is the AGENTS.md contract for src/core/.
    "src/core/**/*.ts": {
      lines: 90, functions: 90, statements: 90,
      branches: 85,  // SSR-defensive branches cap the honest ceiling
    },
  },
},
```

### Network matrix cases (the "must-haves")

`check.test.ts`:

1. 200 → `ok:true, status:200`
2. 200 + malformed body (a `Response` whose `.text()` would throw if read) — still `ok:true` (we never read the body)
3. 204 → `ok:true, status:204`
4. 400 → `{ ok:false, reason:"http-error", status:400 }`
5. 404 → `{ ok:false, reason:"http-error", status:404 }`
6. 500 → `{ ok:false, reason:"request-failed", status:500 }`
7. 502 → `{ ok:false, reason:"request-failed", status:502 }` (Railway case)
8. `TypeError` rejection → `{ ok:false, reason:"request-failed" }` (DNS/CORS, indistinguishable to a browser)
9. Caller abort mid-flight → `ABORTED` (not a result)
10. `timeout` exceeded, fetch never resolves → `{ ok:false, reason:"request-failed" }` (verifies `AbortSignal.timeout` integration; stub fetch that listens to the passed signal as the most portable form)
11. `validate` returning `false` on 200 → `{ ok:false, reason:"request-failed" }`
12. `validate` _throwing_ on 200 → `{ ok:false, reason:"request-failed" }` (`safeValidate` path)
13. `headers` and `credentials` reach the `fetch` call (asserted by stub recording them)
14. Missing global `fetch` → `{ ok:false, reason:"request-failed" }`

`network-matrix.test.ts`: 15. 4xx is a fast-path to `offline` with `reason:"http-error"` (no waking limbo) 16. Railway 502-on-wake → 200 → `active` with `wasCold=true` 17. Continuous DNS/CORS failure until recovery → `waking` → `active` 18. Browser offline: `navigator.onLine=false` + `offline` event → `offline` with `offlineKind:"browser"` 19. Browser recovers: `online` event → re-check → `active` 20. Slow response under `revealDelay` (2 s request, 3 s reveal) → never enters `waking` 21. Slow response over `revealDelay` (4 s request, 3 s reveal) → `checking` → `waking(reason:"slow-response")` → `active` 22. Per-attempt `timeout` (1 s) with a 2 s fetch → `request-failed` (asserts `timeout` and `revealDelay` are independently observable — locked decision 4) 23. `offlineAfter` (5 s) exceeded while waking → `offline` (locked decision 5) 24. `pauseWhenHidden: false` opts out of the visibility pause

## Edge cases & failure modes

- **Fake-timer + `AbortSignal.timeout` interaction:** Vitest 4 fake timers _do_ advance `AbortSignal.timeout` when using `vi.advanceTimersByTimeAsync`. Tests that depend on this must use the `_Async` variants; we already do.
- **CORS vs DNS:** A browser cannot tell them apart at the `fetch` layer — both surface as `TypeError`. The test asserts they collapse to the same outcome, _with a comment_ that this is the technical honesty constraint, not a bug. We are documenting the absence of a `sleeping` state.
- **Coverage tool path normalization:** Per-glob thresholds in Vitest 4 expect POSIX-ish patterns. Test the config locally before committing the threshold; if Vitest 4's matcher is glob-only, fall back to a single `include: ["src/core/**"]` block with a comment explaining the scope.

## Acceptance criteria

- [ ] `tests/check.test.ts` covers cases 1–14 above; all green
- [ ] `tests/network-matrix.test.ts` covers cases 15–24 above; all green
- [ ] `vitest.config.ts` enforces ≥90% lines/functions/statements and ≥85% branches on `src/core/**`; `pnpm test:coverage` exits 0
- [ ] `pnpm verify` runs coverage and exits 0; AGENTS.md command table reflects the change
- [ ] No new runtime dependencies
- [ ] No public API or state-machine changes
- [ ] ROADMAP.md Phase 6 marked ✅ with a one-paragraph validation summary and the spec status flipped to `implemented`

## Validation gate

- `pnpm verify` exits 0 with the coverage gate enforced.
- Total test count grows from 67 (pre-phase) by at least 25 new tests across the two new files.
- `pnpm test:coverage` shows `src/core/` at or above 90% lines and 85% branches.
