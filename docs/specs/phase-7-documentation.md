# Spec: Phase 7 — Documentation

**Status:** implemented
**Phase:** 7 (Documentation)
**Date:** 2026-08-26

## Goal

A demo-first README good enough for a recruiter to understand the value in
minutes, and complete enough that a developer can integrate the package against
a real sleeping backend without reading the source. It documents the API as it
exists after Phase 5 (React adapter + default UI) and Phase 6 (test-hardened
engine), and the platform behaviors verified in `docs/research/`.

## Non-goals

- **No demo GIF yet.** The GIF is captured in Phase 8 from the live demo; the
  README reserves a placeholder image slot now so Phase 8 is a one-line swap.
- **No split docs tree.** Platform guides, backend recipes, API reference, FAQ,
  and troubleshooting all live in the single README (the roadmap assigns them
  to "README"; the repo front page is where recruiters and first-time users
  look). `docs/` remains for contributors (specs, ADRs, research).
- **No code changes.** The public API is frozen from Phases 5–6; documentation
  describes it as-is. No changesets yet (Phase 9).
- **No contributing guide beyond a pointer** — `AGENTS.md` + `docs/development.md`
  are the contributor docs; the README links to them.

## Background

- Locked decisions (`AGENTS.md`): silence on success is the product; copy says
  "starting up", never "asleep"; there is deliberately no `sleeping` state —
  a browser cannot observe it. All copy in the README must honor these.
- Platform facts (`docs/research/research-report.md`, all **[verified]**):
  Render free web services sleep after 15 min idle, wake in ~1 min, support
  `healthCheckPath` in `render.yaml`; Railway "Serverless" sleeps after 10 min
  and the **first request may return 502 Bad Gateway** on wake; Fly.io
  `auto_stop_machines` + `min_machines_running = 0` is the `fly launch`
  default; Koyeb offers scale-to-zero on free instances.
- Real API surface (read from source): `createMonitor`, `DEFAULT_CONFIG`,
  types `Monitor`, `MonitorConfig`, `MonitorSnapshot`, `ServerStatus`,
  `CheckResult`, `FailureReason` from the core subpath; `useServerStatus`,
  `ServerStatusProvider`, `<ServerStatus>` from `server-active-indicator/react`.
  Defaults: `timeout` 10s, `revealDelay` 3s, `pollInterval` 5s,
  `offlineAfter` 60s, `successDisplayMs` 2.5s, backoff 1.5×/15s cap,
  `activeCheckInterval` 0 (off), `pauseWhenHidden` true. Bundle sizes (Phase 6
  measured): core 2.94 KB gzip ESM, react 6.04 KB gzip ESM. Zero runtime deps.

## Approach

Single README rewrite, ordered demo-first: problem → quick start → how it
works → usage (React then headless) → backend recipes → platform guides →
API reference → FAQ → troubleshooting → development pointer. Install
instructions are written as-if-published (`pnpm add server-active-indicator`)
with a short pre-release note; Phase 8 swaps the GIF placeholder and Phases
9–11 make the install real, keeping the README stable across all three.

### Alternatives considered

| Option                          | Pros                                    | Cons                                                | Verdict                            |
| ------------------------------- | --------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| A. Single comprehensive README  | Front-page visible; one source of truth | Long file (~450 lines)                              | Chosen                             |
| B. README + `docs/guides/*.md`  | Shorter README                          | Guides invisible to npm/recruiters; extra link hop  | Rejected                           |
| C. Generated API docs (TypeDoc) | Never drifts from source                | Tooling + hosting overhead; overkill for a tiny API | Rejected (JSDoc already covers it) |

## Design

README section order:

1. **Hero** — tagline, problem paragraph, demo placeholder, license badge,
   zero-dep + bundle-size claims.
2. **Quick start** — install, 3-line React usage, vanilla JS usage.
3. **How it works** — 5-state table, silence-on-success, reveal-vs-timeout.
4. **React** — `<ServerStatus>` (props, variants, i18n `messages`, theming
   `--sai-*`, render prop), `ServerStatusProvider` + no-arg hook, headless
   `useServerStatus(options)`, Next.js App Router note.
5. **Headless / vanilla** — `createMonitor` lifecycle, custom `check()` (+ the
   `key` requirement for sharing), CDN/IIFE via unpkg/jsDelivr.
6. **Backend recipes** — Express, Fastify, NestJS minimal `/health`; CORS
   guidance (public GET, no credentials by default).
7. **Platform guides** — Render / Railway / Fly.io / Koyeb with the verified
   facts above.
8. **API reference** — `MonitorConfig` options table, snapshot fields,
   `Monitor` handle, React exports.
9. **FAQ** — incl. "Can it detect a sleeping server? No — and why that's
   honest".
10. **Troubleshooting** — banner never appears (CORS, revealDelay, warm =
    working as intended), config changes ignored (capture-on-mount → remount
    with `key`), custom `check` not sharing (needs `key`), waking forever.
11. **Development** — commands table pointer, fixture script, links to
    `AGENTS.md` / `docs/development.md` / `docs/ROADMAP.md`.
12. License.

The stale Phase 0 "Status" table is removed; `docs/ROADMAP.md` remains the
source of truth for phase status.

## Edge cases & failure modes

- **Honesty constraint violations** (saying "sleeping"/"asleep" anywhere in
  user-facing copy) — copy review against locked decision 2 before commit.
- **Documenting API that doesn't exist** — every option/prop/method in the
  README is cross-checked against `src/` exports and `DEFAULT_CONFIG`.
- **README drifts at publish time** — install/badge sections written to be
  correct both pre- and post-publish (pre-release note is one removable line).
- **Prettier formats Markdown** — `pnpm format` runs before `verify` so
  `format:check` passes.

## Acceptance criteria

- [x] README covers all Phase 7 roadmap tasks (demo-first, quick start,
      platform guides, backend recipes + CORS, headless usage, API reference,
      FAQ with the honesty answer, troubleshooting).
- [x] No user-facing copy claims a state the browser cannot observe.
- [x] Every documented API element exists in `src/` exports.
- [x] `docs/ROADMAP.md` Phase 7 marked done with validation summary.
- [x] `pnpm verify` green.

## Validation gate

`pnpm verify` green (includes Prettier check over Markdown); manual copy review
for the honesty constraint; spec + roadmap updated in the same commit.
