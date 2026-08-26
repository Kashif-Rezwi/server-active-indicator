# Spec: Phase 8 — Demo application

**Status:** implemented
**Phase:** 8 (Demo application)
**Date:** 2026-08-26

## Goal

Live proof of the real cold-start experience: a Vite + React frontend on static
hosting talking to a Render free-tier API that genuinely sleeps, plus the
README GIF captured from it. The demo must exercise the library exactly as a
consumer would (banner, pill, headless data flow) and make the cold start
visible to any visitor within seconds — including a "simulate idle timeout"
control so nobody has to wait 15 minutes.

## Non-goals

- **Deployment itself is out of scope for the repo work** — it is external
  state (Render account, static host). The deliverable is deploy-ready code +
  a checklist for the maintainer.
- **The demo is not shipped.** `examples/` is excluded from the npm tarball
  (`files: ["dist"]`); the demo app is `private` and not a pnpm workspace
  package (locked decision 1: no monorepo tooling).
- **No Playwright yet.** Research permits it demo-only, but the demo is
  validated manually; automated e2e can be added later without spec changes.
- **No test/coverage gate on demo code.** Root `pnpm verify` must stay green
  and unchanged in scope; the demo server typechecks via the root tsconfig
  (`include: ["examples"]`), the demo frontend has its own tsconfig.
- **No new runtime dependencies of the library.** The demo server reuses the
  existing `express` devDependency; the demo frontend's deps (vite, react)
  live in its own `package.json`.

## Background

- Phase 6 shipped `examples/sleeping-server/` as the "Phase 8 demo seed":
  Express, arm-on-first-`/health`, `POST /reset` re-arms, standalone runner.
  It has **no CORS headers** — fine for same-origin tests, insufficient for a
  cross-origin static-hosted frontend.
- Phase 7 README reserves `docs/assets/demo-placeholder.gif` with a Phase 8
  TODO, and its troubleshooting/development sections already reference the
  fixture.
- Research §2 **[verified]**: Render free web services sleep after 15 min idle
  and wake in ~1 min; `healthCheckPath` in `render.yaml` can point at the same
  `/health` the indicator pings. Inbound traffic is the wake signal — the
  indicator's ping is the wake-up call.
- Research §13: Playwright excluded from the library, "demo app only".

## Approach

Two new example apps plus docs wiring:

1. **`examples/demo-server/`** — the deployable API. Reuses the fixture's
   sleep/wake semantics, adds real CORS (`ALLOWED_ORIGIN`, default `*` —
   `/health` is public and credential-free), `GET /api/message` (payload for
   the demo's data-fetch flow), and a `render.yaml` blueprint with
   `healthCheckPath: /health`.
2. **`examples/demo/`** — the Vite + React frontend. Self-contained
   (`private`, not in `pnpm-workspace.yaml`). Vite `resolve.alias` maps
   `server-active-indicator/react` → `../../src/react` so local dev dogfoods
   the real source; the deployed build will swap to the published package
   after Phase 11 (documented).
3. **Docs** — `examples/demo/README.md` (local run, deploy steps, GIF
   recording guide), README GIF swap, roadmap update.

### Alternatives considered

| Option                                           | Pros                                                                             | Cons                                                                                 | Verdict  |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| A. New `demo-server/` reusing fixture semantics  | CORS + extra routes without touching the test fixture; each stays single-purpose | Some conceptual overlap with `sleeping-server`                                       | Chosen   |
| B. Extend `sleeping-server` with CORS + `/api/*` | One server                                                                       | Test fixture gains demo-only surface; CORS noise in integration tests                | Rejected |
| C. Demo as pnpm workspace package                | Shared lockfile, `pnpm --filter` scripts                                         | Violates locked decision 1 (no monorepo tooling); pulls vite/react into root install | Rejected |

## Design

### `examples/demo-server/`

- `server.ts` — `startDemoServer({ port, sleepMs, allowedOrigin })` → handle
  with `url`, `healthUrl`, `apiUrl`, `reset()`, `close()`. Sleep/wake
  semantics identical to the Phase 6 fixture (arm on first `/health`, instant
  until `POST /reset`). Routes:
  - `GET /health` → `{ ok: true, sleptForMs }` (200 after the arm resolves)
  - `GET /api/message` → `{ message, servedAt }` (shares the arm — a real app
    endpoint that also blocks on cold start)
  - `POST /reset` → re-arm (the "simulate idle timeout" control)
  - CORS: `Access-Control-Allow-Origin: <ALLOWED_ORIGIN|*>`, plus
    `Access-Control-Allow-Methods: GET, POST` and preflight handling.
- `run.ts` — standalone entry (`SLEEP_MS`, `PORT`, `ALLOWED_ORIGIN` env).
- `render.yaml` — Render blueprint: free web service, `healthCheckPath: /health`,
  `envVars` for `SLEEP_MS`/`ALLOWED_ORIGIN`.
- `README.md` — what it is, local run, Render deploy steps, endpoints table.

### `examples/demo/`

- `package.json` — `@sai-demo/app`, `private: true`; deps: `react`,
  `react-dom`; devDeps: `vite`, `@vitejs/plugin-react`, `typescript`,
  `@types/react`, `@types/react-dom`. Scripts: `dev`, `build`, `preview`,
  `typecheck`.
- `vite.config.ts` — `@vitejs/plugin-react`; `resolve.alias` for
  `server-active-indicator/react` → `../../src/react/index.ts` (local
  dogfood); env via `import.meta.env`.
- `index.html` — title, meta, mount point.
- `src/main.tsx`, `src/App.tsx`, `src/styles.css` — the page:
  - Header: what this demo proves + link back to the repo.
  - `<ServerStatus variant="banner">` wired to `VITE_HEALTH_URL`.
  - A data card: "Fetch data from the API" button → `fetch` `/api/message` →
    shows payload + round-trip ms (app-level cold-start latency, parallel to
    the banner).
  - `<ServerStatus variant="pill">` as a second showcase.
  - "Simulate idle timeout" button → `POST /reset` → next visit re-wakes.
  - Env defaults: `http://127.0.0.1:4100` (matches demo-server default port).
- `README.md` — local quickstart (terminal 1: demo-server, terminal 2: vite),
  deploy steps (Render API → static host with `VITE_*` env at build), GIF
  recording guide (macOS: Cmd-Shift-5 / Kap; target clips: cold-load banner →
  confirmation; pill; re-sleep cycle).

### Root wiring

- README: swap `demo-placeholder.gif` → `demo.gif` and add the live-demo link
  (lands with the real GIF after deploy).
- `docs/ROADMAP.md` Phase 8 → ✅ with validation summary.

## Edge cases & failure modes

- **Cross-origin without CORS** — the classic demo bug; handled by real CORS
  headers on every route incl. preflight.
- **Demo app accidentally pulled into root gates** — avoided by keeping it out
  of `pnpm-workspace.yaml`, root tsconfig `include`, and lint/format scope
  (verified by running `pnpm verify`).
- **Sleep duration too long for a demo** — default `SLEEP_MS` for the demo
  server is 20s (long enough to see the banner, short enough not to bore);
  Render deploy sets it via env.
- **`POST /reset` abuse on the public demo** — acceptable: it only re-arms a
  sleep; worst case the demo shows the waking state, which is the point.
- **Alias vs published package drift** — documented: local dev aliases to
  source; production demo build should install the published package
  post-Phase 11 (one-line change, noted in the demo README).

## Acceptance criteria

- [x] `examples/demo-server/` boots standalone; first `/health` sleeps,
      subsequent instant, `/reset` re-arms, CORS headers present (curl-verified).
- [x] `examples/demo/` builds (`vite build`) and renders the banner against
      the local demo server.
- [x] `render.yaml` blueprint + deploy READMEs present.
- [x] Root `pnpm verify` green; no changes to `src/`, tests, or gates.
- [x] Deploy/GIF checklist handed to maintainer; README GIF swap documented.
- [x] `docs/ROADMAP.md` Phase 8 marked done.

## Validation gate

`pnpm verify` green at root; manual curl matrix against the demo server
(sleep → instant → reset → sleep; CORS preflight); `vite build` succeeds in
`examples/demo/`; spec + roadmap updated in the same commit.
