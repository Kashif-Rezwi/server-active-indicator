# Roadmap — server-active-indicator

Phased build plan from zero to a published, production-quality open-source package.
Each phase lists its objective, tasks, outputs, and the validation gate that must pass
before moving to the next phase. Phase specs live in `docs/specs/`; architectural
decisions live in `docs/adr/`.

Legend: ✅ done · 🔶 in progress · ⬜ not started

---

## Phase 0 — Research & repository setup — ✅

- **Objective:** verified technical direction + repository with workflow and tracking in place.
- **Tasks:** platform behavior research (Render, Railway, Fly.io, Koyeb, Vercel, Netlify, Cloudflare) from official docs; competitor/naming research on npm; architecture decision; repo creation; workflow init; roadmap.
- **Output:** `docs/research/` (dossier + research report), `AGENTS.md`, `docs/development.md`, this roadmap, GitHub milestones.
- **Gate:** direction approved by maintainer. ✅

## Phase 1 — Architecture & scaffold — ✅

- **Objective:** buildable, typecheckable package skeleton with the locked toolchain.
- **Tasks:** `pnpm init`; `package.json` with `"."` (core) and `"./react"` subpath exports; strict `tsconfig`; tsup config (ESM + CJS + DTS + IIFE); ESLint flat config + Prettier; `verify` script composing format/lint/typecheck/test/build; `src/core/`, `src/react/` module shells.
- **Decisions:** single package with subpath exports (no monorepo); tsup 8.5; zero runtime deps; TypeScript pinned to ^5.9 (tsup's d.ts toolchain incompatible with TS 7).
- **Validation:** ✅ `pnpm verify` green (format→lint→typecheck→3 tests→build); `pnpm pack` tarball = dist + README + LICENSE only; built core imports from Node ESM and CJS without react resolvable.
- **Spec:** `docs/specs/phase-1-scaffold.md`

## Phase 2 — Extract & generalize — ✅

- **Objective:** port the proven "Server Wakeup" semantics from `code-review-agent` into framework-free core TypeScript.
- **Tasks:** parameterized config (no app imports); renamed hardcoded values to configurable options with the existing values as defaults (3s reveal, 5s poll, 2.5s success display); defined `MonitorConfig`/`CheckResult` types.
- **Output:** `src/core/` (`check.ts` fetch strategy + reason classification, `monitor.ts` engine) compiling standalone; behavior-parity notes in the spec.
- **Extra decisions captured in spec:** warm first ping resolves to `active` with `wasCold=false` (recovery-only confirmation moved to a UI presentation policy, keeping the engine truthful); snapshot extended with `wasCold`, `lastLatencyMs`, `offlineKind`.
- **Validation:** ✅ 12 monitor tests + 3 smoke tests green (warm ping, cold start, reveal threshold, 4xx fast-path, Railway 502-on-wake, offlineAfter bound, browser-offline, refresh-from-offline, destroy mid-flight, custom `check()`); `pnpm verify` green.
- **Depends on:** Phase 1. **Spec:** `docs/specs/phase-2-extract-generalize.md`

## Phase 3 — Core state engine — ✅

- **Objective:** the heart of the package — state machine + shared monitor.
- **Tasks:** ✅ 5-state machine with re-sleep path; reveal threshold vs. per-attempt timeout separated; `offlineAfter` bound; **backoff with jitter** (`backoffFactor` 1.5, `backoffCap` 15s, ±20% jitter, injectable `random` seam); **module-level registry** keyed by behavioral config (N subscribers = 1 health loop, refcounted, per-consumer handles); single-flight refresh; `AbortController` lifecycle; **`document.visibilitychange` pause** (cancel poll while hidden, immediate re-check on visible); `navigator.onLine` mapping; opt-in **`activeCheckInterval`** re-sleep detection; `reason` field. Custom `check` shares only via explicit `key`.
- **Output:** `src/core/engine.ts` (shared engine), `src/core/registry.ts` (dedup + handles), `monitor.ts` now delegates to the registry.
- **Validation:** ✅ 29 tests green (12 monitor transitions + 6 registry dedup/refcount + 8 phase-3 policy tests + 3 smoke); `pnpm verify` green; `src/core/` line coverage **93%** (engine 95%, registry 95%; `types.ts` is type-only). Hard ≥90% threshold deferred to Phase 6 per plan.
- **Depends on:** Phase 2. **Spec:** `docs/specs/phase-3-core-engine.md`

## Phase 4 — React layer — ✅

- **Objective:** thin, correct React binding.
- **Tasks:** ✅ `useServerStatus(options?)` via `useSyncExternalStore` — monitor created in an effect, never during render (concurrent-safe; first commit honestly renders `unknown`); optional `ServerStatusProvider` (context distinguishes _no provider_ from _monitor pending_ → SSR-safe, no false throws); `'use client'` via a tsup banner on the react entry only; StrictMode double-effect safety; `refresh()` manual trigger; full cleanup on unmount; React 17 support via an internal `useSyncExternalStore` fallback (no new deps — locked `^17` peer range preserved); options captured on mount with the `key`-prop escape hatch.
- **Validation:** ✅ 46 tests green (12 hook/provider via `renderHook` incl. StrictMode — exactly one engine after mount, one fetch per poll tick, zero engines after unmount; 5 legacy-shim; 29 core from Phases 2–3); `pnpm verify` green; `src/react/` coverage **100% lines / 94% branch**; `dist/react/index.{js,cjs}` begin with `'use client'` while core output stays clean; react adapter adds ≈0.7 KB gzip on top of the 2.9 KB core (budget: <2 KB layer / <3 KB core).
- **Depends on:** Phase 3. **Spec:** `docs/specs/phase-4-react-layer.md`

## Phase 5 — Default UI — ✅

- **Objective:** polished default presentation + headless escape hatch.
- **Tasks:** ✅ `<ServerStatus>` banner + `variant="pill"`; injected prefixed CSS (`sai-*`) + CSS custom properties for theming; elapsed-time counter; offline retry button; `role="status"`/`aria-live="polite"`; `prefers-reduced-motion`; i18n `messages` prop; silence-on-success default.
- **Decisions captured in spec:** dismissal lives in the component (engine stays truthful per Phase 2 — `wasCold` is the sanctioned signal); stylesheet injected in a `useEffect` with element-`id` idempotency (SSR-safe, tree-shake-safe, one tag across instances/StrictMode/remounts); CSS custom properties default to a light palette, flipped via `prefers-color-scheme: dark`; `sai-elapsed` counter is `aria-hidden` (per-second live-region changes would spam screen readers); render prop receives the raw snapshot (incl. `unknown`) and skips stylesheet injection entirely.
- **Validation:** ✅ 21 ServerStatus tests (RTL + axe-core, zero violations across waking/active/offline/browser-offline/pill) + 46 prior tests green; `pnpm verify` green; `dist/react/index.js` 6.04 KB gzip (delta over Phase 4: 2.39 KB gzip — the 2 KB layer _delta_ budget slips by ~0.4 KB primarily because the injected stylesheet carries 3 named color tokens × light/dark × 3 states plus motion/transition rules; the absolute core stays under 3 KB gzip).
- **Depends on:** Phase 4. **Spec:** `docs/specs/phase-5-default-ui.md`

## Phase 6 — Testing hardening — ✅

- **Objective:** confidence to publish.
- **Tasks:** ✅ full network-condition matrix (timeout, DNS/CORS, 4xx, 5xx incl. 502-on-wake, offline browser, malformed body) split across `tests/check.test.ts` (defaultCheck HTTP contract, 21 tests) and `tests/network-matrix.test.ts` (engine-level, 12 tests); coverage gate wired into `vitest.config.ts` (per-glob `src/core/**`: 90% lines/functions/statements, 85% branches) and into `pnpm verify`; simulated-sleeping-server fixture (`examples/sleeping-server/`, express, ephemeral-port `startServer()`, `POST /reset` to re-arm) plus a real-fetch integration suite (`tests/fixture.integration.test.ts`, 3 tests, `// @vitest-environment node`); `pnpm fixture:sleep-server` script for the Phase 8 demo seed; two targeted coverage tests for `engine.ts` browser-offline race and active-interval pause/resume; two registry coverage tests (idempotent destroy, headers-as-key).
- **Decisions captured in spec:** `check.test.ts` separate from `network-matrix.test.ts` for fast feedback on the pure-function path; vitest 4 fake timers do not drive `AbortSignal.timeout` to abort `setTimeout`-based stubs, so the per-attempt timeout is fully exercised in `check.test.ts` and the engine-level test asserts the classification outcome instead of the abort firing; `tsconfig.json` `include` extended to `examples/` so the fixture is typed; coverage gate is per-glob scoped to `src/core/**` (no `src/react/` gate — DOM/axe-coupled code is harder to hit ≥90% without inflating the suite with mechanical tests, deferred).
- **Validation:** ✅ 105 tests pass (was 67, +38); `src/core/` coverage 97.52% lines / 91.66% branches / 100% functions (gate 90/85); `check.ts` 100% across the board; `pnpm verify` exits 0 with the coverage gate enforced; bundle sizes unchanged from Phase 5 (core 2.94 KB gzip ESM, react 6.04 KB gzip ESM); `pnpm fixture:sleep-server` confirmed: first `/health` sleeps, subsequent are instant, `POST /reset` re-arms; no new runtime dependencies (express, tsx, @types/express are devDeps only); public API and state-machine unchanged.
- **Spec:** `docs/specs/phase-6-testing-hardening.md`

## Phase 7 — Documentation — ✅

- **Objective:** README good enough for a recruiter to understand the value in minutes.
- **Tasks:** demo-first README (placeholder GIF slot for Phase 8); 3-line quick start (React + vanilla); 5-state "how it works" table; platform guides (Render `healthCheckPath`, Railway 502-on-wake caveat, Fly `min_machines_running = 0` default, Koyeb scale-to-zero); minimal `/health` backend recipes (Express/Fastify/NestJS) with CORS guidance; headless usage incl. custom `check` + `key` caveat and CDN/IIFE; full API reference (`Monitor` handle, all 15 `MonitorConfig` options, `MonitorSnapshot` fields, React exports); FAQ incl. "can it detect sleeping? (No — and why that's honest)"; troubleshooting (CORS, capture-on-mount, offlineAfter, custom-check sharing, moduleResolution).
- **Validation:** ✅ every documented option/prop/method cross-checked against `src/` exports and `DEFAULT_CONFIG`; copy reviewed against honesty constraint (no `sleeping` state claims; UI copy says "starting up"); stale Phase 0 status table removed; `pnpm verify` green.
- **Spec:** `docs/specs/phase-7-documentation.md`
- **Depends on:** Phase 5 (documents real API).

## Phase 8 — Demo application — ✅

- **Objective:** live proof of the real cold-start experience.
- **Tasks:** ✅ deployable demo API (`examples/demo-server/` — Express, real CORS incl. preflight, `GET /health` + `GET /api/message` sharing the cold start, `POST /reset` re-arm, `ALLOWED_ORIGIN`/`SLEEP_MS`/`PORT` env, `render.yaml` blueprint with `healthCheckPath: /health`, deploy README); ✅ Vite + React demo frontend (`examples/demo/` — `ServerStatusProvider` + banner, pill variant, app-level data-fetch card showing cold-start latency, "simulate idle timeout" re-arm button, `VITE_API_URL` env); ✅ demo READMEs (local run, Render + static-host deploy steps, GIF recording guide).
- **Decisions captured in spec:** demo is **not** a pnpm workspace package (locked decision 1) — `examples/demo/pnpm-workspace.yaml` (package-less, with `allowBuilds` for esbuild) makes it its own pnpm project root; local dev dogfoods the library via vite `resolve.alias` + tsconfig `paths` to `../../src` (published-package swap documented for post-Phase 11); new `demo-server/` rather than extending the Phase 6 test fixture (CORS + demo routes stay out of the integration-test surface); `SLEEP_MS` default 20s for demo pacing (Render's real ~60s cold start adds on top).
- **Validation:** ✅ demo-server curl matrix (3s cold → instant → CORS + preflight 204 → `POST /reset` → 3s again); demo app `pnpm install` / `typecheck` / `build` green (bundle 68.85 KB gzip with source-aliased library); root `pnpm verify` green, `src/` and test gates untouched. **Remaining (external, maintainer):** deploy API to Render → deploy frontend to static host → record GIF → swap `docs/assets/demo-placeholder.gif` → `demo.gif` + live link in README (checklist in `examples/demo/README.md`).
- **Spec:** `docs/specs/phase-8-demo-application.md`
- **Depends on:** Phases 5, 7.

## Phase 9 — Packaging — ⬜

- **Objective:** publishable artifact.
- **Tasks:** changesets init; `files`/`exports`/`sideEffects: false` audit; bundle-size budget check (<5 KB gzip total target); LICENSE/README in tarball.
- **Validation:** `pnpm pack` inspected; `publint` clean.
- **Depends on:** Phase 6.

## Phase 10 — CI/CD — ⬜

- **Objective:** safe, automated releases.
- **Tasks:** PR workflow (lint → typecheck → test → build); release workflow with changesets + npm OIDC trusted publishing + provenance attestation.
- **Depends on:** Phase 9.

## Phase 11 — Publish — ⬜

- **Objective:** `server-active-indicator` live on npm.
- **Tasks:** publish `0.1.0`; GitHub release; verify unpkg/jsDelivr; dogfood; iterate to `1.0.0` once the state machine + options API is frozen.
- **Depends on:** Phase 10.

## Phase 12 — Portfolio integration — ⬜

- **Objective:** close the loop.
- **Tasks:** replace the local "Server Wakeup" implementation in `code-review-agent` with the published package; pin repo; write the "extracted to OSS" story.
- **Depends on:** Phase 11.
