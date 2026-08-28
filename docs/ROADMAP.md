# Roadmap — server-active-indicator

Phased build plan from zero to a published, production-quality open-source package. Each phase lists its objective, tasks, outputs, and the validation gate that must pass before moving to the next phase. Phase specs live in `docs/specs/`; architectural decisions live in `docs/adr/`.

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
- **Tasks:** ✅ full network-condition matrix (timeout, DNS/CORS, 4xx, 5xx incl. 502-on-wake, offline browser, malformed body) split across `tests/check.test.ts` (defaultCheck HTTP contract, 21 tests) and `tests/network-matrix.test.ts` (engine-level, 12 tests); coverage gate wired into `vitest.config.ts` (per-glob `src/core/**`: 90% lines/functions/statements, 85% branches) and into `pnpm verify`; two targeted coverage tests for `engine.ts` browser-offline race and active-interval pause/resume; two registry coverage tests (idempotent destroy, headers-as-key).
- **Decisions captured in spec:** `check.test.ts` separate from `network-matrix.test.ts` for fast feedback on the pure-function path; vitest 4 fake timers do not drive `AbortSignal.timeout` to abort `setTimeout`-based stubs, so the per-attempt timeout is fully exercised in `check.test.ts` and the engine-level test asserts the classification outcome instead of the abort firing; coverage gate is per-glob scoped to `src/core/**` (no `src/react/` gate — DOM/axe-coupled code is harder to hit ≥90% without inflating the suite with mechanical tests, deferred).
- **Validation:** ✅ 102 tests pass (was 67, +35); `src/core/` coverage 97.52% lines / 91.66% branches / 100% functions (gate 90/85); `check.ts` 100% across the board; `pnpm verify` exits 0 with the coverage gate enforced; bundle sizes unchanged from Phase 5 (core 2.94 KB gzip ESM, react 6.04 KB gzip ESM); public API and state-machine unchanged.
- **Spec:** `docs/specs/phase-6-testing-hardening.md`

## Phase 7 — Documentation — ✅

- **Objective:** README good enough for a recruiter to understand the value in minutes.
- **Tasks:** demo-first README (hero GIF slot); 3-line quick start (React + vanilla); 5-state "how it works" table; platform guides (Render `healthCheckPath`, Railway 502-on-wake caveat, Fly `min_machines_running = 0` default, Koyeb scale-to-zero); minimal `/health` backend recipes (Express/Fastify/NestJS) with CORS guidance; headless usage incl. custom `check` + `key` caveat and CDN/IIFE; full API reference (`Monitor` handle, all 15 `MonitorConfig` options, `MonitorSnapshot` fields, React exports); FAQ incl. "can it detect sleeping? (No — and why that's honest)"; troubleshooting (CORS, capture-on-mount, offlineAfter, custom-check sharing, moduleResolution).
- **Validation:** ✅ every documented option/prop/method cross-checked against `src/` exports and `DEFAULT_CONFIG`; copy reviewed against honesty constraint (no `sleeping` state claims; UI copy says "starting up"); stale Phase 0 status table removed; `pnpm verify` green.
- **Spec:** `docs/specs/phase-7-documentation.md`
- **Depends on:** Phase 5 (documents real API).

## Phase 8 — Demo application — removed

Implemented as a deployable sleeping API + example app, then removed from the repo (the demo GIF in the README remains). The phase number is not reused, keeping spec filenames and git history stable.

## Phase 9 — Packaging — ✅

- **Objective:** publishable artifact.
- **Tasks:** ✅ changesets initialized (`@changesets/cli` 3.x, `access: "public"`, `baseBranch: "main"`, non-interactive config written directly — v3 `init` prompts); ✅ exports audit — per-format `types` conditions (`import` → `.d.ts`, `require` → `.d.cts`) for both subpaths so CJS consumers under `nodenext` no longer resolve ESM types; `sideEffects: false` confirmed safe (style injection is effect-time, not module-evaluation); ✅ bundle-size budget gate (`scripts/check-size.mjs`, zero-dep node zlib; budgets: core ≤3.5 KB, react ≤7 KB, IIFE ≤3 KB gzip — the roadmap's "<5 KB total" target predates the Phase 5 UI; per-export budgets documented in the spec); ✅ `publint` gate (`pnpm lint:pkg`); both gates wired into `pnpm verify` after `build`.
- **Validation:** ✅ `publint` clean ("All good!"); `pnpm size` passes (core 2.86 KB, react 5.90 KB, IIFE 2.23 KB gzip); `pnpm pack` tarball inspected — exactly `dist/**` + `package.json` + `README.md` + `LICENSE`, IIFE filename matches `unpkg`/`jsdelivr` fields, no docs/tests leakage; `pnpm verify` green with the new gates; AGENTS.md commands table synced.
- **Spec:** `docs/specs/phase-9-packaging.md`
- **Depends on:** Phase 6.

## Phase 10 — CI/CD — ✅

- **Objective:** safe, automated releases.
- **Tasks:** ✅ PR workflow (`.github/workflows/ci.yml` — `pull_request`→`main` + `push`→`main, changeset-release/**`, `contents: read`, concurrency cancel, pnpm 11 + Node 24, `pnpm install --frozen-lockfile` → `pnpm verify`); ✅ release workflow (`.github/workflows/release.yml` — `push`→`main` only, `contents: write` + `pull-requests: write` + `id-token: write`, `changesets/action@v1` with `version: pnpm changeset version` / `publish: pnpm publish --provenance`, `registry-url` for OIDC, no `NPM_TOKEN`); ✅ `publishConfig.provenance: true` (defense-in-depth; workflow also passes `--provenance`).
- **Validation:** ✅ `pnpm verify` green (format→lint→typecheck→test:coverage 96% lines / 93% branches (gate 90/85 on `src/core/**`) →build→size (core 2.86 KB / react 5.90 KB / IIFE 2.23 KB gzip) →lint:pkg All good!); `pnpm pack` still `dist/**` + `package.json` + `README.md` + `LICENSE`; workflows are pinned majors (`checkout@v4`, `pnpm/action-setup@v4`, `setup-node@v4`, `changesets/action@v1`) and pass structural checks (PR triggers, least-privilege permissions, frozen lockfile, OIDC fields). Manual follow-ups remain: enable npm trusted publishing on npmjs.org for `release.yml`, and require `CI / verify` in branch protection.
- **Spec:** `docs/specs/phase-10-cicd.md`
- **Depends on:** Phase 9.

## Phase 11 — Publish — ✅

- **Objective:** `server-active-indicator` live on npm.
- **Tasks:** ✅ `0.1.0` published to npm (`https://www.npmjs.com/package/server-active-indicator`, `082b372` merge `b18712f chore: version packages` → `0.0.0→0.1.0` + `CHANGELOG.md`); `pnpm verify` green; `pnpm pack` `dist/**+package.json+README+LICENSE`; `publint All good`; size 2.91/5.95/2.27 KB; `npm view` + `unpkg`/`jsDelivr` IIFE 200 verified (`08:48:29Z`); README pre-release note removed. Published via direct `pnpm publish --access public` with `NPM_CONFIG_PROVENANCE=false` (provider `null` locally — provenance via OIDC from next release; `publishConfig.provenance:true` remains). ⬜ next: configure Trusted Publisher `Kashif-Rezwi/server-active-indicator/release.yml` on `https://www.npmjs.com/package/server-active-indicator/access` for OIDC `npm publish --provenance` (auto on `release.yml` merges) → GitHub Release/tag. See `docs/specs/phase-11-publish.md`.
- **Spec:** `docs/specs/phase-11-publish.md`
- **Depends on:** Phase 10.

## Phase 12 — Portfolio integration — ✅

- **Objective:** close the loop.
- **Tasks:** ✅ replaced local Server Wakeup with published package, pinned repo, published story.
- **Validation:** ✅ dogfooded.
- **Depends on:** Phase 11.
