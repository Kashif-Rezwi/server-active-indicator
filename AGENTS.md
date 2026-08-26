# AGENTS.md

Canonical instructions for AI agents and contributors working in this repository.

## What this repo is

`server-active-indicator` — a tiny, framework-agnostic client-side status indicator
for backends that sleep (free-tier / cold-start deployments on Render, Railway, Fly.io,
Koyeb, and any HTTP API). Published to npm as `server-active-indicator` with two
subpath exports:

- `server-active-indicator` → framework-free core (state machine, shared monitor,
  health-check strategy). **Zero runtime dependencies.**
- `server-active-indicator/react` → React adapter (`useServerStatus`,
  `ServerStatusProvider`, `<ServerStatus>` default UI). `react`/`react-dom` are peer
  dependencies (`^17 || ^18 || ^19`).

## Locked decisions (do not relitigate without an ADR)

The Phase 0 research is authoritative: `docs/research/research-report.md` and
`docs/research/Server-Active-Indicator-Feature-Dossier.md`. Key locked decisions:

1. **Single package, subpath exports** — no monorepo tooling (no Turborepo).
2. **5-state machine:** `unknown | checking | waking | active | offline`. Never add a
   `sleeping` state — it is undetectable from a browser. UI copy says "starting up",
   never "asleep" (technical honesty constraint, see research §5).
3. **Silence on success** — a warm backend renders no UI. This is the product.
4. **Reveal threshold and per-attempt timeout are separate options** (`revealDelay`
   default 3s vs `timeout` default 10s). Do not merge them.
5. **`waking` is time-bounded** by `offlineAfter` (default 60s elapsed) → `offline`.
   Never poll-and-display "waking" indefinitely.
6. **Shared monitor registry** — N consumers of the same config share one health loop.
7. **Self-contained styling** — injected `sai-`-prefixed CSS + custom properties. No
   Tailwind, no CSS-in-JS runtime, no icon library dependencies (inline SVG).
8. **No credentials by default** — `headers`/`credentials` are explicit opt-ins.

## Stack & tooling

- **Language:** TypeScript (strict mode)
- **Package manager:** pnpm (11.x)
- **Build:** tsup 8.x → ESM + CJS + `.d.ts` + IIFE (for unpkg/jsDelivr)
- **Test:** Vitest 4 + React Testing Library + axe-core; fake timers for the state
  machine; jsdom for component tests; one real-network suite (sleeping-server
  fixture) in node environment.
- **Lint/format:** ESLint 9 (flat config) + Prettier
- **Versioning/releases:** changesets 3 + GitHub Actions with npm OIDC trusted
  publishing (no long-lived npm tokens)

## Commands

Available once Phase 1 scaffolding lands (keep this table in sync with `package.json`):

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `pnpm install`              | install dependencies                                           |
| `pnpm build`                | build all exports to `dist/` via tsup                          |
| `pnpm test`                 | run Vitest suite (fast feedback; no coverage)                  |
| `pnpm test:coverage`        | coverage run; enforces the `src/core/**` gate (≥90/90/90/85)   |
| `pnpm fixture:sleep-server` | run the sleeping-server fixture standalone (Phase 8 demo seed) |
| `pnpm lint`                 | ESLint                                                         |
| `pnpm format:check`         | Prettier check                                                 |
| `pnpm typecheck`            | `tsc --noEmit`                                                 |
| `pnpm verify`               | format check → lint → typecheck → test:coverage → build (DoD)  |

## Development workflow

Two gears, defined in `docs/development.md`:

- **Quick gear** (≤3 files, no public API/infra change, trivially reversible):
  change → `pnpm verify` → commit.
- **Full gear** (features, public API, state machine, infra): spec in `docs/specs/`
  first → implement → `pnpm verify` → update docs/roadmap → commit. Phase plans live in
  `docs/ROADMAP.md`; work one phase at a time.

## Boundaries for agents

- Deterministic verification is the definition of done — never declare work complete on
  reasoning alone; `pnpm verify` must be green.
- Never claim a server state the browser cannot observe (see locked decision 2).
- Preserve existing public API; deprecate for one minor before removing.
- No new runtime dependencies without an ADR (zero-dep core is a product feature).
- Commits: small, scoped, conventional-commit style. Do not push tags or publish;
  releases go through the changesets workflow only.
- Stay in scope of the active phase; no drive-by refactors.

## Repository layout (target)

```
src/core/          framework-free engine (monitor registry, machine, fetch strategy)
src/react/         React adapter (hook, provider, default UI, injected styles)
tests/             Vitest suites
examples/          vite-react + nextjs demos, simulated sleeping server fixture
docs/              ROADMAP.md, research/, specs/, adr/, development.md
```
