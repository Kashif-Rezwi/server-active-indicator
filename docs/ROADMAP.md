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

## Phase 3 — Core state engine — ⬜

- **Objective:** the heart of the package — state machine + shared monitor.
- **Tasks:** 5-state machine (`unknown → checking → waking → active | offline`, plus `active → checking → waking` re-sleep); reveal threshold vs. per-attempt timeout as separate concepts; `offlineAfter` bound; backoff with jitter; module-level monitor registry keyed by config (N subscribers = 1 health loop); single-flight refresh; `AbortController` lifecycle; `document.visibilitychange` pause; `navigator.onLine` mapping; `reason` field (`slow-response | request-failed | http-error`).
- **Validation:** Vitest suite with fake timers covering every transition and the §12-style network matrix; ≥90% coverage on `src/core/`.
- **Depends on:** Phase 2.

## Phase 4 — React layer — ⬜

- **Objective:** thin, correct React binding.
- **Tasks:** `useServerStatus()` via `useSyncExternalStore`; optional `ServerStatusProvider`; `'use client'` compatibility; StrictMode double-effect safety; `refresh()` manual trigger; full cleanup on unmount.
- **Validation:** `renderHook` tests; no duplicate polling under StrictMode.
- **Depends on:** Phase 3.

## Phase 5 — Default UI — ⬜

- **Objective:** polished default presentation + headless escape hatch.
- **Tasks:** `<ServerStatus>` banner + `variant="pill"`; injected prefixed CSS (`sai-*`) + CSS custom properties for theming; elapsed-time counter; offline retry button; `role="status"`/`aria-live="polite"`; `prefers-reduced-motion`; i18n `messages` prop; silence-on-success default.
- **Validation:** RTL + axe tests (no violations); 320px viewport check.
- **Depends on:** Phase 4.

## Phase 6 — Testing hardening — ⬜

- **Objective:** confidence to publish.
- **Tasks:** full network-condition matrix (timeout, DNS, CORS, 4xx, 5xx incl. 502-on-wake, offline browser, malformed body); coverage gate; simulated-sleeping-server fixture (express server delaying first request ~20s, with `/reset`).
- **Validation:** CI green with coverage thresholds.
- **Depends on:** Phases 3–5.

## Phase 7 — Documentation — ⬜

- **Objective:** README good enough for a recruiter to understand the value in minutes.
- **Tasks:** demo-first README (with/without GIF); 3-line quick start; platform guides (Render `healthCheckPath`, Railway 502 caveat, Fly `min_machines_running`); minimal `/health` backend recipes (Express/NestJS/Fastify) with CORS guidance; headless usage; API reference; FAQ incl. "can it detect sleeping? (No — and why that's honest)"; troubleshooting.
- **Depends on:** Phase 5 (documents real API).

## Phase 8 — Demo application — ⬜

- **Objective:** live proof of the real cold-start experience.
- **Tasks:** Vite React frontend on static hosting + Render free-tier API that genuinely sleeps; capture README GIF.
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
