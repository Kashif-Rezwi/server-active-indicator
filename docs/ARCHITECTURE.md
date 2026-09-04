# server-active-indicator — Architecture & Codebase Guide

> **Purpose.** This is the single-file map of the entire repository: what the package is, how it is built, how every layer works, where every behavior lives, and which file to touch for any change. Everything here is sourced directly from the code (file + line references included) — if this document and the code disagree, the code wins and this file should be fixed.

- **Package:** `server-active-indicator` v0.2.3 (npm, MIT) — [package.json](../package.json)
- **One-liner:** a tiny, framework-agnostic client-side status indicator for backends that sleep (free-tier cold starts). It shows an honest "server is starting up" banner only when a request is suspiciously slow, confirms briefly when the backend recovers, and renders **nothing at all** when the backend is warm.
- **Repo:** https://github.com/Kashif-Rezwi/server-active-indicator
- **Primary entry points:** `server-active-indicator` (framework-free core) and `server-active-indicator/react` (React adapter)

---

## Table of contents

1. [The product in one paragraph](#1-the-product-in-one-paragraph)
2. [Repository file map (every file referenced)](#2-repository-file-map-every-file-referenced)
3. [Runtime architecture — the big picture](#3-runtime-architecture--the-big-picture)
4. [The five-state machine](#4-the-five-state-machine)
5. [Anatomy of one health-check attempt](#5-anatomy-of-one-health-check-attempt)
6. [The shared monitor registry (engine dedup)](#6-the-shared-monitor-registry-engine-dedup)
7. [The check strategy (network layer)](#7-the-check-strategy-network-layer)
8. [The React adapter](#8-the-react-adapter)
9. [Default UI, icons, and styling](#9-default-ui-icons-and-styling)
10. [Public API reference](#10-public-api-reference)
11. [Build pipeline & package exports](#11-build-pipeline--package-exports)
12. [Test suite map](#12-test-suite-map)
13. [Quality gates & the `pnpm verify` pipeline](#13-quality-gates--the-pnpm-verify-pipeline)
14. [CI/CD & release flow](#14-cicd--release-flow)
15. [Design decisions & pragmatic trade-offs](#15-design-decisions--pragmatic-trade-offs)
16. [Contributor routing: "I want to change X"](#16-contributor-routing-i-want-to-change-x)
17. [Glossary & further reading](#17-glossary--further-reading)

---

## 1. The product in one paragraph

Free-tier hosts (Render, Railway, Fly.io, Koyeb) spin a backend down after a few minutes without traffic. The visitor's browser loads the frontend instantly from a CDN, but the first API request then hangs for up to a minute while the service cold-starts — and nothing on screen explains why, so users assume the app is broken and leave. This package watches a lightweight health endpoint and, **only** when a check is taking suspiciously long, reveals a calm amber banner: "The server is starting up. This can take up to a minute on first visit." When the backend answers, it shows a short green confirmation and disappears. The core product rule is **"silence on success"**: a warm backend renders zero UI. It ships as a zero-runtime-dependency core (`createMonitor` + state machine) plus an optional React adapter (`useServerStatus`, `ServerStatusProvider`, `<ServerStatus>`), with `react`/`react-dom` as _optional_ peer dependencies (`^17 || ^18 || ^19`).

### Locked product decisions (from [AGENTS.md](../AGENTS.md) — do not relitigate without an ADR)

| # | Decision | Where it lives in code |
| --- | --- | --- |
| 1 | Single package with subpath exports — no monorepo tooling | `package.json` `exports`; [tsup.config.ts](../tsup.config.ts) |
| 2 | Exactly 5 states; never a `sleeping` state (undetectable from a browser); copy says "starting up", never "asleep" | [src/core/types.ts](../src/core/types.ts) (L7); [src/react/server-status.tsx](../src/react/server-status.tsx) (L30) |
| 3 | Silence on success — a warm backend renders no UI | [src/react/server-status.tsx](../src/react/server-status.tsx) (L89-90) |
| 4 | `revealDelay` (3s) and per-attempt `timeout` (10s) are separate options | [src/core/defaults.ts](../src/core/defaults.ts) (L5-6); reveal timer at [src/core/engine.ts](../src/core/engine.ts) (L255) |
| 5 | `waking` is time-bounded by `offlineAfter` (60s) → `offline`; never "waking" forever | [src/core/engine.ts](../src/core/engine.ts) (L157-161) |
| 6 | Shared monitor registry — N consumers of the same config share one health loop | [src/core/registry.ts](../src/core/registry.ts) |
| 7 | Self-contained styling — injected `sai-`-prefixed CSS, inline SVG icons, no icon/CSS deps | [src/react/styles.ts](../src/react/styles.ts); [src/react/icons.tsx](../src/react/icons.tsx) |
| 8 | No credentials by default — `headers`/`credentials` are explicit opt-ins | [src/core/check.ts](../src/core/check.ts) (L39-40); [src/core/types.ts](../src/core/types.ts) (L23) |

---

## 2. Repository file map (every file referenced)

Every file in the repo (excluding `node_modules/`, `dist/`, `coverage/`, `.git/`), what it does, and why it exists. Line counts are approximate snapshots.

### 2.1 Runtime source — `src/core/` (framework-free, zero dependencies)

| File | Lines | Role |
| --- | --- | --- |
| [src/core/types.ts](../src/core/types.ts) | 77 | **The public contract.** `ServerStatus` (the 5-state union, L7), `FailureReason` (L10), `CheckResult` (custom-check result shape, L13), `MonitorConfig` (every option, L23), `MonitorSnapshot` (immutable per-emission state, L61). |
| [src/core/defaults.ts](../src/core/defaults.ts) | 26 | `DEFAULT_CONFIG` — the locked engine defaults: `timeout: 10_000`, `revealDelay: 3_000`, `pollInterval: 5_000`, `offlineAfter: 60_000`, `activeCheckInterval: 0`, `pauseWhenHidden: true`, `backoffFactor: 1.5`, `backoffCap: 15_000`. (`successDisplayMs` is presentation-only — it lives on `<ServerStatus>` props, not here.) Typed with `satisfies Required<...>` so adding a required engine option without a default breaks the build. |
| [src/core/check.ts](../src/core/check.ts) | 60 | The default network strategy. `ABORTED` sentinel symbol (L4), `CheckOutcome` (L5), `combineSignals` (timeout + caller-signal fusion via `AbortSignal.timeout`/`.any`, L20), `defaultCheck` (L29) — a GET with `cache: "no-store"` that **never rejects**: every failure resolves to a structured `CheckOutcome`. 4xx maps to `reason: "http-error"` (misconfiguration, not cold start). `safeValidate` (L54) wraps user validators in try/catch. |
| [src/core/engine.ts](../src/core/engine.ts) | 375 | **The heart.** `Engine` interface (L7), `resolveConfig` (L29), `createEngine` (L81) — the timer-driven health loop: `attempt()` (L228), `onResult()` (L166), `scheduleNext()` (L155) with jittered backoff `nextDelay()` (L147), the reveal timer, elapsed-seconds ticker (L124), active-interval re-checks (L274), visibilitychange pause/resume (L282), window `online` auto-recovery (L321), `refresh()` (L341), `destroy()` (L357). |
| [src/core/registry.ts](../src/core/registry.ts) | 111 | Shared-engine dedup. `Monitor` handle interface (L6), module-level `registry` Map (L18), `registryKey()` — the stable behavioral-config string (L24), `stableStringify()` with sorted keys (L56), ref-counted `acquireMonitor()` (L70), `__engineCount()` test introspection (L109). |
| [src/core/monitor.ts](../src/core/monitor.ts) | 13 | The thin public factory: `createMonitor(config)` → `acquireMonitor(config)`. Exists so the public API name is decoupled from registry internals. |

### 2.2 Runtime source — `src/react/` (adapter; react/react-dom are optional peers)

| File | Lines | Role |
| --- | --- | --- |
| [src/react/index.ts](../src/react/index.ts) | 12 | Barrel for the `./react` subpath: `useServerStatus`, `ServerStatusProvider`, `ServerStatus` + all public types (core types re-exported). |
| [src/react/use-server-status.ts](../src/react/use-server-status.ts) | 75 | The headless hook. Module-level `INITIAL_SNAPSHOT` constant (L20) so SSR/first-commit has a stable reference (no hydration mismatch); `useServerStatus(options?)` (L35) — with `options` it owns a monitor (created in an effect, destroyed on unmount, config captured on mount); without, it reads the nearest provider's. Throws a usage error if neither source exists. Subscribes via `useSyncExternalStoreCompat`. |
| [src/react/server-status-provider.tsx](../src/react/server-status-provider.tsx) | 44 | App-level config sharing: `ServerStatusProviderProps` (L8), `ServerStatusContext` (L20 — `null` = no provider vs `{ monitor: null }` = provider present but monitor not yet created), `ServerStatusProvider` (L26) — creates the monitor in an effect, never during render, so abandoned concurrent renders can't leak engines. |
| [src/react/server-status.tsx](../src/react/server-status.tsx) | 134 | The default UI. `ServerStatusMessages` (i18n overrides, L10), `ServerStatusProps` (L18 — `variant`, `messages`, `className`, and a render-prop `children` escape hatch), locked English `DEFAULT_MESSAGES` (L30), `formatElapsed()` (`45s` / `1m 5s`, L39), `ServerStatus` (L48) — silence-on-success policy, style injection, dismissal timer, `role="status"` / `aria-live="polite"` markup with `data-state` / `data-offline-kind` attributes. |
| [src/react/icons.tsx](../src/react/icons.tsx) | 98 | Four decorative inline SVGs (`aria-hidden`, sized `1em` so they track `--sai-font-size`): `SpinnerIcon` (L8), `CheckIcon` (L34), `OfflineIcon` (L57), `WifiOffIcon` (L80). No icon library (locked decision 7). |
| [src/react/styles.ts](../src/react/styles.ts) | 151 | `STYLES` (L8) — the full self-contained stylesheet as a template string: `--sai-*` custom properties (light + `prefers-color-scheme: dark`), `.sai-banner` / `.sai-pill` variants, `data-state`-driven colors, spinner keyframes, `prefers-reduced-motion` disables. `injectServerStatusStyles()` (L144) — idempotent, one `<style id="server-active-indicator-styles">` per document, SSR-safe no-op. |
| [src/react/use-sync-external-store.ts](../src/react/use-sync-external-store.ts) | 35 | React 17 compatibility shim: `useSyncExternalStoreLegacy` (classic `useState` + `useEffect` subscription, L9) and `useSyncExternalStoreCompat`, which picks the native hook when available (L29). Namespace-imports React to avoid CJS-17 interop throws. |

### 2.3 Entry points

| File | Lines | Role |
| --- | --- | --- |
| [src/index.ts](../src/index.ts) | 16 | Barrel for the root `.` subpath: `DEFAULT_CONFIG`, `createMonitor`, type `Monitor`, and the five core types. Zero React imports — safe to use without React installed. |

### 2.4 Tests — `tests/`

| File | Lines | Tests | Covers |
| --- | --- | --- | --- |
| [tests/setup.ts](../tests/setup.ts) | 22 | — | Global RTL `cleanup()` after each test (vitest globals are off, so auto-cleanup doesn't self-register); ensures monitor handles are released between tests. |
| [tests/monitor.test.ts](../tests/monitor.test.ts) | 540 | 25 | The engine loop end-to-end through `createMonitor`: state transitions, reveal timer, backoff, `offlineAfter`, `refresh()`, destroy/ref-counting, config validation, hidden-tab policies. Fake timers throughout. |
| [tests/check.test.ts](../tests/check.test.ts) | 146 | 21 | `defaultCheck` in isolation: fetch mocking, `res.ok` vs `validate`, 4xx → `http-error`, 5xx → `request-failed`, abort/timeout paths, pre-aborted caller signal, `ABORTED` sentinel. |
| [tests/network-matrix.test.ts](../tests/network-matrix.test.ts) | 277 | 13 | Engine-level condition matrix: locked decision 4 independence (`revealDelay` vs `timeout`), honesty constraints, browser-offline episodes and `online` recovery, 4xx fast-path, hidden-tab pause, engine-level caller-abort semantics. |
| [tests/registry.test.ts](../tests/registry.test.ts) | 150 | 11 | Registry keying: identical configs share one engine, differing timings don't, custom `check`/`validate` never share without an explicit `key`, ref-count teardown, `stableStringify` ordering. |
| [tests/smoke.test.ts](../tests/smoke.test.ts) | 34 | 2 | Package-surface contract: both barrels export exactly the documented API; `DEFAULT_CONFIG` matches the locked table. |
| [tests/use-server-status.test.tsx](../tests/use-server-status.test.tsx) | 320 | 13 | The hook via `renderHook`: own-monitor vs provider modes, StrictMode double-mount safety, capture-on-mount semantics, provider sharing, throw conditions, SSR snapshot stability. |
| [tests/server-status.test.tsx](../tests/server-status.test.tsx) | 510 | 21 | The default UI via RTL + **axe-core** accessibility checks: silence rules, waking banner + elapsed counter, active confirmation & dismissal timer, offline Retry button, `messages` overrides, variant/class, style-injection idempotence, render-prop mode. |
| [tests/use-sync-external-store.test.tsx](../tests/use-sync-external-store.test.tsx) | 91 | 5 | The React 17 legacy shim directly: subscribe/unsubscribe, render-then-subscribe convergence. (The native path is untestable under this repo's React 19 install — documented as accepted in [docs/BACKLOG.md](../docs/BACKLOG.md).) |

### 2.5 Build scripts — `scripts/`

| File | Role |
| --- | --- |
| [scripts/check-size.mjs](../scripts/check-size.mjs) | Bundle-size budget gate: gzips `dist/index.js` (budget **3.5 KB**) and `dist/react/index.js` (budget **7 KB**), exits non-zero over budget. Budgets = Phase 6 actuals + ~20% headroom. Requires `pnpm build` first. |
| [scripts/publish-if-unpublished.mjs](../scripts/publish-if-unpublished.mjs) | Idempotent publish for the changesets action: checks `npm view <pkg>@<version>` first and skips if already on the registry (the action's publish step runs on every qualifying push and plain `pnpm publish` would 403). Otherwise runs `pnpm publish --provenance`. |

### 2.6 Configs & tooling (root)

| File | Role |
| --- | --- |
| [package.json](../package.json) | npm metadata: dual `exports` map (`.` and `./react`, each with `import`/`require` + `types` conditions), `files: ["dist"]`, `sideEffects: ["./dist/react/*"]` (core is side-effect-free; the React subpath injects styles into `document.head`), optional react peer deps (`^17 \|\| ^18 \|\| ^19`), `publishConfig.provenance: true`, and the full script table (see [§13](#13-quality-gates--the-pnpm-verify-pipeline)). |
| [tsconfig.json](../tsconfig.json) | Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"`), `noEmit` — typecheck only; real emission is tsup's job. Includes `src`, `tests`, and the three root config files. |
| [tsup.config.ts](../tsup.config.ts) | Two-entry build (see [§11](#11-build-pipeline--package-exports)): ESM+CJS+`.d.ts`+sourcemaps, `react`/`react-dom` external, `"use client"` banner **only** on the react entry. |
| [vitest.config.ts](../vitest.config.ts) | jsdom environment, `tests/**` include, `tests/setup.ts`, v8 coverage with the per-glob `src/core/**` threshold gate (90/90/90/85). |
| [eslint.config.js](../eslint.config.js) | ESLint 10 flat config: `@eslint/js` recommended + typescript-eslint recommended + prettier; type-aware on src/tests; `react-hooks` rules (`rules-of-hooks` and `exhaustive-deps`, both errors) on src/react and `.tsx` tests; node globals for `scripts/*.mjs`. |
| [.prettierrc.json](../.prettierrc.json) | `semi: true`, double quotes, `trailingComma: "all"`, `printWidth: 100`, `proseWrap: "never"` (markdown paragraphs stay on one line). |
| [.prettierignore](../.prettierignore) / [.gitignore](../.gitignore) | Ignore `dist/`, `coverage/`, `node_modules/`, env files, OS junk. |
| [pnpm-workspace.yaml](../pnpm-workspace.yaml) | Single canonical pnpm build-deps allowlist (`esbuild`) — a `.npmrc` duplicate was removed in the 2026-08-29 audit ([docs/BACKLOG.md](../docs/BACKLOG.md)). |
| [pnpm-lock.yaml](../pnpm-lock.yaml) | Lockfile, pinned by `packageManager: pnpm@11.24.0`; CI installs with `--frozen-lockfile`. |

### 2.7 Docs, CI, and release

| File | Role |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Canonical agent/contributor instructions: what the repo is, the 8 locked decisions, stack, command table, two-gear workflow, boundaries for agents. |
| [docs/development.md](../docs/development.md) | The two-gear workflow in detail (Quick ≤3 files / Full = features & architecture), definition of done, changesets-only release policy. |
| [docs/BACKLOG.md](../docs/BACKLOG.md) | Deferred polish items from the pre-Phase-12 audit, including completed items (with ✅ dates) and _documented-as-deliberate_ behaviors (see [§15](#15-design-decisions--pragmatic-trade-offs)). |
| [docs/research/research-report.md](../docs/research/research-report.md) | Phase 0 research (160 lines): platform behavior behind the defaults, referenced as "research §N" throughout the code. |
| [docs/research/Server-Active-Indicator-Feature-Dossier.md](../docs/research/Server-Active-Indicator-Feature-Dossier.md) | The 968-line feature dossier — the authoritative design record (state-machine rationale, copy decisions, elapsed-format parity). |
| [docs/assets/demo.gif](../docs/assets/demo.gif) | README demo animation. |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI: PRs to `main` + pushes to `main`/`develop`/`changeset-release/**` → Node 24 + pnpm → `pnpm verify`. Concurrency-canceled per ref. |
| [.github/workflows/release.yml](../.github/workflows/release.yml) | Release: push to `main` → build + test → `changesets/action` opens the "chore: version packages" PR or publishes via the guarded script. `id-token: write` enables npm OIDC trusted publishing — no long-lived npm tokens exist. |
| [.changeset/config.json](../.changeset/config.json) | Changesets config: `access: "public"`, `baseBranch: "main"`. |
| [CHANGELOG.md](../CHANGELOG.md) | Generated by changesets on each version-PR merge. Notable: 0.2.0 removed the IIFE/CDN build (breaking, documented). |
| [README.md](../README.md) | User-facing docs: problem, quick start, state table, options, FAQ, troubleshooting, CORS guidance. |
| [LICENSE](../LICENSE) | MIT, Kashif Rezwi. |

---

## 3. Runtime architecture — the big picture

The package is a three-layer stack. Each layer only depends on the one below it; the core has **zero runtime dependencies** and knows nothing about React.

```
┌──────────────────────────────────────────────────────────────────────┐
│  YOUR APP                                                            │
│                                                                      │
│   Vanilla JS / any framework        React app                        │
│   ┌──────────────────────┐   ┌───────────────────────────────────┐   │
│   │ monitor.subscribe()  │   │ <ServerStatusProvider config>     │   │
│   │ renderYourOwnUi()    │   │   <ServerStatus/> or              │   │
│   │                      │   │   useServerStatus()               │   │
│   └──────────┬───────────┘   └──────────────┬────────────────────┘   │
└──────────────┼──────────────────────────────┼────────────────────────┘
               │ public API                   │ src/react/  (adapter)
               ▼                              ▼
      ┌──────────────────┐          ┌──────────────────────────┐
      │ src/core/        │          │ useServerStatus          │
      │ createMonitor()  │◄─────────│ ServerStatusProvider     │
      │  (monitor.ts)    │  calls   │ <ServerStatus> default UI│
      └────────┬─────────┘  into    └───────────┬──────────────┘
               │ acquires                       │ subscribes via
               ▼                                │ useSyncExternalStore
      ┌──────────────────┐                      │ (compat shim, R17+)
      │ src/core/        │   1 shared engine    │
      │ registry.ts      │═══per unique config═►│ N handles,
      │ (ref-counted)    │                      │ ref-counted
      └────────┬─────────┘                      │
               ▼                                │
      ┌──────────────────┐   snapshots          │
      │ src/core/        │──────────────────────┘
      │ engine.ts        │   (immutable
      │ 5-state machine  │    MonitorSnapshot)
      └────────┬─────────┘
               │ per-attempt
               ▼
      ┌──────────────────┐
      │ src/core/check.ts│  defaultCheck() or user check()
      │ GET /health      │  AbortSignal timeout+abort fusion
      └────────┬─────────┘
               ▼
        🌐 Backend health endpoint
```

Key structural facts:

- **`src/core/`** is framework-free and dependency-free. It compiles and runs without React anywhere on the machine (enforced by [tests/smoke.test.ts](../tests/smoke.test.ts) importing both barrels and by the build keeping the core entry React-free).
- **`src/react/`** is a thin adapter: it creates/destroys monitor handles in effects and projects snapshots into UI. All logic lives in the core.
- **The registry** ([src/core/registry.ts](../src/core/registry.ts)) is what makes "N components, one poll loop" work: consumers with the same _effective behavioral config_ share one engine; each holds a ref-counted handle (see [§6](#6-the-shared-monitor-registry-engine-dedup)).
- **Communication is one-directional**: downward via config (strings/numbers/functions), upward via immutable `MonitorSnapshot` emissions plus the `refresh()`/`destroy()` control calls. No layer reaches back up.

---

## 4. The five-state machine

Five states only ([src/core/types.ts:7](../src/core/types.ts)). There is deliberately **no `sleeping` state** — a browser cannot observe that a server is asleep, only that it is slow or failing (locked decision 2; research §5). All transitions are driven by [src/core/engine.ts](../src/core/engine.ts).

```
                       createEngine() / refresh()
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │        checking          │   attempt in flight;
                    │  (renders: nothing)      │   revealTimer armed
                    └──────┬──────────┬────────┘
        check settles      │          │   revealDelay (3s) elapsed,
        before revealDelay │          │   check still unresolved
                           │          │   engine.ts:255-259
                           ▼          ▼
              ┌────────────────┐   ┌──────────────────────────────────┐
              │     active     │   │         waking                   │
              │ (green confirm,│   │ (amber "starting up"             │
              │  only if       │   │  banner + live elapsed           │
              │  wasCold)      │   │  counter)                        │
              └───────┬────────┘   └──────┬─────────────────────┬─────┘
                      │                   │                     │
   success (2xx,      │  failure, online: │ 4xx: misconfig,     │ offlineAfter budget
   validate() true)   │  stay waking with │ not a cold start;   │ elapsed (60s)
                      │  jittered backoff │ engine.ts:194-205   │ engine.ts:157-161
                      │  engine.ts:220-225│ browser offline:    │
                      │                   │ navigator.onLine    │
                      │                   │ === false           │
                      │                   │ engine.ts:207-218,  │
                      │                   │ 241-253             │
                      │                   │                     │
                      │                   └──────────┬──────────┘
                      │                              ▼
                      │              ┌──────────────────────────┐
                      │              │         offline          │
                      │              │ "server" (4xx / budget)  │
                      │              │ or "browser" (offline);  │
                      │              │ red banner + Retry       │
                      │              └──────────────────────────┘
                      │
                      │ activeCheckInterval > 0 → periodic re-check
                      │ (engine.ts:278-286); a failing re-check re-enters
                      │ waking (re-sleep detection, opt-in)
                      ▼
        ┌────────────────────────────┐
        │           active           │
        │  polling stops entirely;   │
        │  opt-in re-check via       │
        │  activeCheckInterval       │
        └────────────────────────────┘
```

### Transition table (every edge, with its code path)

| From | Trigger | To | Code location | Notes |
| --- | --- | --- | --- | --- |
| _(start)_ | `createEngine` | `checking` | [engine.ts:89](../src/core/engine.ts), [engine.ts:378](../src/core/engine.ts) | First `attempt()` fires immediately on construction. |
| `checking` | `revealDelay` passes with no result | `waking` | [engine.ts:255-259](../src/core/engine.ts) | `wasCold: true`, `reason: "slow-response"`; starts the 1s elapsed ticker (L124). |
| `checking`/`waking` | check resolves ok | `active` | `onResult` [engine.ts:175-190](../src/core/engine.ts) | `elapsedSeconds` reset; `scheduleActiveInterval()` arms the opt-in re-check. |
| `waking` | failure, browser online | stays `waking` | [engine.ts:220-225](../src/core/engine.ts) | `consecutiveFailures++` → longer jittered backoff; `scheduleNext()` checks the `offlineAfter` budget first. |
| `waking` | elapsed ≥ `offlineAfter` | `offline` (`server`) | [engine.ts:157-161](../src/core/engine.ts) | Locked decision 5: `waking` can never outlive its budget. |
| any in-episode | response is 4xx | `offline` (`server`) | `onResult` [engine.ts:194-205](../src/core/engine.ts) | 4xx means the server is _up_ and answering — wrong URL/route/auth, not a cold start. Fast-path so you notice. |
| any in-episode | `navigator.onLine === false` | `offline` (`browser`) | `attempt` [engine.ts:241-253](../src/core/engine.ts); `onResult` [engine.ts:207-218](../src/core/engine.ts) | "You appear to be offline" copy; distinct icon. |
| `offline` (`browser`) | window `online` event | `checking` | `onOnline` [engine.ts:326-331](../src/core/engine.ts) | Automatic recovery. Server-offline has **no** auto-recovery (not observable) — Retry button or `refresh()`. |
| `offline` (`server`) | Retry button / `refresh()` | `checking` | `refresh` [engine.ts:347-362](../src/core/engine.ts) | Resets the episode: `wasCold: false`, `elapsedSeconds: 0`, failures 0. Single-flight: no-op while an attempt is in flight. |
| `active` | failing re-check (`activeCheckInterval > 0`) | `waking` | re-enters `onResult` failure path | Re-sleep detection, opt-in; `wasCold` re-arms so the confirmation re-announces on recovery. |
| _(aborted)_ | `destroy()` or pause | _(no change)_ | `onResult` [engine.ts:168-173](../src/core/engine.ts) | `ABORTED` sentinel never changes state; only the `attempts` counter is emitted so bookkeeping stays monotonic. |

### Snapshot shape ([src/core/types.ts:61-77](../src/core/types.ts))

Each emission is an immutable `MonitorSnapshot` ([src/core/types.ts:61-77](../src/core/types.ts)):

- `status` — the current state; `reason?` — why a check is failing (`slow-response | request-failed | http-error`); `offlineKind?` — `server | browser`, present on `offline`.
- `elapsedSeconds` — seconds since the current waking episode began; `attempts` — checks made in this episode.
- `lastCheckedAt` — epoch ms of the last completed check (or `null` before the first); `lastLatencyMs` — that check's latency (or `null`).
- `wasCold` — did this episode pass through `waking`? Drives the "confirm only after a cold start" UI policy.

One attempt produces exactly **one** emission (the attempt counter rides along with the state change — [engine.ts:273-275](../src/core/engine.ts); a deliberate perf fix recorded in the 0.2.0 changelog).

### Built-in robustness invariants

- **Single-flight:** `attempt()` returns immediately if `inFlight` ([engine.ts:229](../src/core/engine.ts)); `refresh()` is also a no-op while an attempt is outstanding ([engine.ts:348-351](../src/core/engine.ts)).
- **Settle-safety:** a check that _throws_ is converted to `{ ok: false, reason: "request-failed" }` inside `attempt()` ([engine.ts:264-268](../src/core/engine.ts)) so `inFlight` can never stick and the loop can never die silently.
- **Custom checks are bounded:** `runCustomCheck` races the user's promise against a `timeout` timer ([engine.ts:45-66](../src/core/engine.ts)) — a hung check cannot wedge the engine in `waking` forever (locked decision 5).
- **Modern runtimes required:** `AbortSignal.timeout`/`AbortSignal.any` (evergreen browsers since 2023–24) and `fetch` (Node ≥ 18); SSR health checks need Node ≥ 20.3. No internal degradation fallbacks — an unsupported runtime fails fast instead of silently losing the per-attempt timeout ([check.ts:20-23](../src/core/check.ts)).
- **Hidden tab:** with `pauseWhenHidden` (default on), `visibilitychange` clears pending timers and stops intervals ([engine.ts:288-301](../src/core/engine.ts)); becoming visible resumes an attempt (waking/checking) or the active interval ([engine.ts:303-312](../src/core/engine.ts)).

---

## 5. Anatomy of one health-check attempt

One pass through `attempt()` ([src/core/engine.ts:228-276](../src/core/engine.ts)):

```
attempt()
  │
  ├─ guards: destroyed? / inFlight? / paused-hidden?  → return, no state change
  │            engine.ts:229-230
  │
  ├─ navigator.onLine === false ?
  │     └─ yes → emit offline/browser, stop everything (engine.ts:241-253)
  │
  ├─ arm revealTimer(revealDelay)                    ──┐
  │     on fire: episodeStartAt ??= now,               │ SEPARATE concerns
  │     elapsed ticker on, waking/"slow-response"      │ (locked decision 4)
  │     engine.ts:255-259                            ──┘
  │
  ├─ runCheck()
  │     custom check?  → runCustomCheck(check, timeout)   [raced vs timeout]
  │     else           → defaultCheck({healthUrl, timeout,
  │                       headers?, credentials?, validate?},
  │                       attemptController.signal)          [AbortSignal fusion]
  │     engine.ts:132-144
  │
  ├─ catch any throw → outcome = request-failed  (settle-safety, engine.ts:264-268)
  │
  ├─ clear revealTimer; measure latency
  │
  └─ onResult(outcome, latency, attempts+1)   ← single emission per attempt
        engine.ts:166-226
        ├─ ABORTED      → emit {attempts} only; done
        ├─ ok           → active + scheduleActiveInterval
        ├─ http-error   → offline/server (no more polling)
        ├─ browser off  → offline/browser (no more polling)
        └─ else         → waking; consecutiveFailures++; scheduleNext()
                            scheduleNext(): elapsed ≥ offlineAfter
                              → offline/server
                            else pollTimer(nextDelay())
                            nextDelay() = pollInterval × backoffFactor^(fails-1)
                              capped at backoffCap, ×(0.8…1.2) jitter
                            engine.ts:146-164
```

Timing relationships at the defaults: an attempt that hangs is cut at `timeout` (10s); a user sees the "starting up" banner if the first attempt is still unresolved at `revealDelay` (3s); the whole waking episode is capped at `offlineAfter` (60s) regardless of how many attempts fit inside it; retry gaps grow 5s → 7.5s → 11.25s → 15s (cap), each jittered ±20% to avoid synchronized retry storms across many clients.

## 6. The shared monitor registry (engine dedup)

`createMonitor()` ([src/core/monitor.ts](../src/core/monitor.ts)) never builds an engine directly — it calls `acquireMonitor()` ([src/core/registry.ts:70](../src/core/registry.ts)), which keys a module-level `Map` by the config's _effective behavior_:

```
      consumer A               consumer B               consumer C
      healthUrl: X             healthUrl: X             healthUrl: X
      (+ defaults)             (+ defaults)             timeout: 20s
           │                        │                        │
           ▼                        ▼                        ▼
      registryKey(cfg)         registryKey(cfg)         registryKey(cfg)
           │                        │                        │
           └───────────┬────────────┘                        │
                       │ same key                            │ different key
                       ▼                                     ▼
           engine E1 · refs 1→2 (shared)          engine E2 · refs 1 (separate)

      A.destroy() → E1 refs 2→1   (engine lives)
      B.destroy() → E1 refs 1→0 ──► registry.delete(key)
                                    E1.destroy(): abort in-flight attempt,
                                    clear timers, detach document/window
                                    listeners, clear listeners
```

### Key derivation ([src/core/registry.ts:24-48](../src/core/registry.ts))

| Config contains | Key | Sharing behavior |
| --- | --- | --- |
| `healthUrl` only (+ scalar options) | `url:{stableStringify(behavioral)}` | Shares with byte-identical effective behavior (headers/credentials included; key order irrelevant — `stableStringify` sorts, L56). |
| `check` function + `key` | `check:{key}` | Shares only across consumers that pass the same explicit `key`. |
| `check` function, no `key` | `check:unique:{counter}` | **Never shares** — function identity can't be compared, so each call gets its own engine. |
| `validate` function | `validate:{key}` / `validate:unique:{...}` | Same rule as `check`: validators are function identity. |

This is the mechanism behind locked decision 6 and the README FAQ items ("Two components with the same custom `check` each run their own loop — pass the same explicit `key`"). `__engineCount()` (L109) exists purely so tests can assert engine sharing/teardown.

## 7. The check strategy (network layer)

[src/core/check.ts](../src/core/check.ts) implements the default health check plus the abort/timeout machinery.

**`combineSignals(timeoutMs, callerSignal?)` (L20)** fuses the per-attempt timeout with the engine's abort controller: `AbortSignal.timeout(timeoutMs)`, combined via `AbortSignal.any` when a caller signal exists (evergreen browsers since 2023–24, Node ≥ 20.3 — no fallback path; an unsupported runtime fails fast rather than losing the per-attempt timeout).

- The engine passes its own per-attempt controller's signal as `callerSignal`, so `destroy()` (or an aborted refresh cycle) cancels the in-flight request and the check resolves to the `ABORTED` sentinel — a stateless no-op.

**`defaultCheck(config, callerSignal?)` (L29):**

| Step | Behavior | Outcome mapping |
| --- | --- | --- |
| Fetch throws (network, CORS, abort) | `callerSignal.aborted` → `ABORTED`; else failure | `ABORTED` or `{ ok: false, reason: "request-failed" }` |
| 2xx (or `validate(res)` true) | success | `{ ok: true, status }` |
| 4xx | server is up but the endpoint is wrong/auth'd | `{ ok: false, reason: "http-error", status }` → engine fast-paths to offline |
| 5xx / non-ok | likely still starting | `{ ok: false, reason: "request-failed", status }` → engine stays `waking` |

Design contract (research §9): **`defaultCheck` never rejects.** Every failure — including thrown user validators via `safeValidate` (L99) — resolves to a structured `CheckOutcome`, so the engine's loop is a total function over outcomes. The request is a plain GET with `cache: "no-store"`; no `headers` or `credentials` are sent unless explicitly configured (locked decision 8).

## 8. The React adapter

Three exports ([src/react/index.ts](../src/react/index.ts)), one data flow:

```
 <ServerStatusProvider healthUrl=... >          (optional; app-level config)
        │ effect: createMonitor(config)  ──► registry
        │ context value: { monitor }  (null until first effect ran)
        ▼
 useServerStatus(options?)   [src/react/use-server-status.ts:35]
        │ options given? → own monitor (effect create/destroy, [] deps)
        │ options absent? → context monitor (throws if neither → usage error, L37-41)
        ▼
 useSyncExternalStoreCompat(subscribe, getSnapshot, getServerSnapshot)
        │   React ≥18: native hook        React 17: legacy shim
        │   [use-sync-external-store.ts:29]  (useState+useEffect, L9)
        ▼
        │ snapshot = MonitorSnapshot (stable INITIAL_SNAPSHOT constant
        │   until the monitor exists — same object server & client, L20-27)
        ▼
 <ServerStatus> (or your own UI)
        ├─ children as render prop → full delegation, raw snapshot
        └─ default UI: silence policy (below) + markup + retry
```

**Lifecycle rules that matter:**

- **Capture-on-mount is deliberate.** Both the hook and the provider create monitors inside effects with `[]` deps and an eslint-disable on `exhaustive-deps` ([use-server-status.ts:46-56](../src/react/use-server-status.ts), [server-status-provider.tsx:29-40](../src/react/server-status-provider.tsx)). The config _keys the shared registry_, so live reconfiguration would tear down and recreate the engine mid-episode; to reconfigure, remount with a `key` (`<ServerStatus key={url} .../>`).
- **Concurrent-safe.** Monitors are created in effects, never during render, so abandoned concurrent renders (StrictMode double-invoke included) cannot leak engines; `destroy()` in the effect cleanup releases the registry ref.
- **Honest SSR.** `getServerSnapshot` is the same closure as `getSnapshot`: before the effect runs, monitor is `null` on server and hydrating client alike → snapshot `unknown` ("no check has started") with a module-level constant reference, so no hydration mismatch.
- **React 17 support** comes from the shim ([use-sync-external-store.ts](../src/react/use-sync-external-store.ts)); the namespace `import * as React` avoids a link-time throw under CJS React 17 interop. Removing the fallback is backlog-tracked until the peer range drops `^17`.

## 9. Default UI, icons, and styling

`<ServerStatus>` ([src/react/server-status.tsx:48](../src/react/server-status.tsx)) applies the **silence-on-success presentation policy** (locked decision 3):

| Snapshot state | Default UI renders |
| --- | --- |
| `unknown`, `checking` | **nothing** (`return null`, L89) |
| `waking` | amber banner/pill: spinner + "The server is starting up…" + live `elapsedSeconds` counter (`45s` → `1m 5s`, `aria-hidden`) |
| `active` after `wasCold` | green confirmation "The server is ready." for `successDisplayMs` (2.5s), then auto-hides via the dismissal timer (L78-83) |
| `active` warm start (`!wasCold`) or dismissed | **nothing** — silence on success (L90) |
| `offline` (`server`) | red banner/pill + offline icon + **Retry** button wired to `refresh()` (L127-131) |
| `offline` (`browser`) | red banner/pill + wifi-off icon + "You appear to be offline…" (auto-recovers via the window `online` event) |

Dismissal nuances (L65-83): a new wake/offline episode re-arms the confirmation (`hasSeenWakeOrOfflineRef`); a component that mounts _after_ the wake never shows a stale confirmation (late-mounter guard).

Markup contract: root element is `<div role="status" aria-live="polite" data-state={status} data-offline-kind={...}>` — screen-reader polite announcements, plus `data-*` hooks for your own CSS. `axe-core` runs against this markup in [tests/server-status.test.tsx](../tests/server-status.test.tsx).

**Styling** ([src/react/styles.ts](../src/react/styles.ts)) — self-contained by construction (locked decision 7):

- The entire stylesheet is a template string; `injectServerStatusStyles()` (L144) injects it once per document (idempotent by element id), effect-only so SSR never sees it.
- All colors are `--sai-*` custom properties on `:root` (via `:where(:root)` for zero specificity) with a `prefers-color-scheme: dark` block.
- Components style themselves via `data-state` attribute selectors; everything is `sai-`-prefixed to avoid collisions — no CSS file, no CSS-in-JS runtime.
- The spinner and transitions are disabled under `prefers-reduced-motion: reduce`.

**Icons** ([src/react/icons.tsx](../src/react/icons.tsx)): four inline SVGs — no icon library — `aria-hidden`, sized `1em` so they track `--sai-font-size`, colored via `currentColor` / `--sai-icon-color`.

## 10. Public API reference

### 10.1 Exports map ([package.json](../package.json))

| Import path | Exports |
| --- | --- |
| `server-active-indicator` | `createMonitor`, `DEFAULT_CONFIG` + types `Monitor`, `ServerStatus`, `MonitorConfig`, `MonitorSnapshot`, `CheckResult`, `FailureReason` ([src/index.ts](../src/index.ts)) |
| `server-active-indicator/react` | `useServerStatus` (+`UseServerStatusOptions`/`Result`), `ServerStatusProvider` (+props type), `ServerStatus` (+`ServerStatusProps`, `ServerStatusMessages`) plus re-exported core types ([src/react/index.ts](../src/react/index.ts)) |

### 10.2 `MonitorConfig` — every option ([src/core/types.ts:23-58](../src/core/types.ts))

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `healthUrl` | `string` | — | Lightweight health endpoint URL. Required unless `check` is given (engine throws otherwise, [engine.ts:82-86](../src/core/engine.ts)). |
| `check` | `() => Promise<boolean \| CheckResult>` | — | Custom check; overrides `healthUrl`. Bounded by `timeout`. A boolean result maps to `ok`; use `CheckResult` to attach `reason`/`status`. |
| `timeout` | `number` ms | `10_000` | Per-attempt ceiling — bounds `healthUrl` requests _and_ custom checks alike. |
| `revealDelay` | `number` ms | `3_000` | How long an unresolved check may stay invisible before `waking` is revealed. Deliberately separate from `timeout` (locked decision 4). |
| `pollInterval` | `number` ms | `5_000` | Base interval between attempts while `waking` (grown by backoff). |
| `offlineAfter` | `number` ms | `60_000` | Elapsed budget for the whole waking episode → `offline` (locked decision 5). |
| `successDisplayMs` | `number` ms | `2_500` | How long the `active` confirmation stays visible. Presentation-only — set on `<ServerStatus>` props, not the provider. |
| `activeCheckInterval` | `number` ms | `0` (off) | Opt-in periodic re-check while `active` (re-sleep detection). |
| `pauseWhenHidden` | `boolean` | `true` | Pause all checking while the tab is hidden; resume on visibility. |
| `headers` | `Record<string, string>` | _(none)_ | Opt-in extra request headers (locked decision 8). |
| `credentials` | `RequestCredentials` | _(omitted)_ | Opt-in fetch credentials mode (locked decision 8). |
| `validate` | `(res: Response) => boolean` | `res.ok` | Custom response validator (e.g. `(r) => r.status < 500`); thrown errors are swallowed as failure. |
| `key` | `string` | — | Explicit registry key — the only way to share an engine across consumers using a custom `check`/`validate`. |
| `backoffFactor` | `number` | `1.5` | Multiplier on retry delay per consecutive failure (`1` = flat). |
| `backoffCap` | `number` ms | `15_000` | Upper bound for the retry delay before jitter. |

Defaults are declared once in [src/core/defaults.ts](../src/core/defaults.ts) (`DEFAULT_CONFIG`, exported from the core entry) and asserted verbatim by [tests/smoke.test.ts](../tests/smoke.test.ts).

### 10.3 `Monitor` handle ([src/core/registry.ts:6-11](../src/core/registry.ts)) and hook result

| Member | Meaning |
| --- | --- |
| `getSnapshot()` | Current immutable `MonitorSnapshot`. |
| `subscribe(listener)` | Push-based updates; returns an unsubscribe fn (the handle also unsubscribes all its listeners on `destroy()`). |
| `refresh()` | Immediate re-check: resets the episode, single-flight while an attempt is outstanding. |
| `destroy()` | Releases this handle's registry ref; last release tears the engine down (abort in-flight, clear timers, detach document/window listeners). |

`useServerStatus()` returns `{ ...MonitorSnapshot, refresh }` ([src/react/use-server-status.ts:11-14](../src/react/use-server-status.ts)). React components should not call `monitor.destroy()` themselves — the hook/provider owns the handle lifetime.

## 11. Build pipeline & package exports

[tsup.config.ts](../tsup.config.ts) defines **two independent builds** sharing one config object:

```
src/index.ts ──── entry "index" ────► dist/index.js        (ESM)
                                     dist/index.cjs        (CJS)
                                     dist/index.d.ts       (ESM types)
                                     dist/index.d.cts      (CJS types)
                                     + .map sourcemaps
                                     clean: true  (wipes dist first)
                                     NO banner — core stays framework-free

src/react/index.ts ► entry "react/index" ──► dist/react/index.js
                                             dist/react/index.cjs
                                             dist/react/index.d.ts
                                             dist/react/index.d.cts
                                             + .map sourcemaps
                                             clean: false (don't wipe the core build)
                                             banner: '"use client"'  ← react subpath ONLY
```

Why this layout:

- The `"use client"` banner is applied **only** to the react entry: Next.js App Router needs the directive on modules using React hooks/context, but the framework-free core must stay usable in any JS runtime — embedding the directive there would be a lie about its contents (the comment in [tsup.config.ts:22-24](../tsup.config.ts) records this).
- `react`, `react-dom`, and `react/jsx-runtime` are marked `external`, so peer installs are used at consumer build time; nothing React is bundled.
- `outExtension` renames CJS output to `.cjs` so Node's ESM/CJS resolution is unambiguous, and the `exports` map in [package.json](../package.json) wires `import` → `.js`/`.d.ts`, `require` → `.cjs`/`.d.cts` for both subpaths (plus `"./package.json"`).
- `sideEffects: false` + `files: ["dist"]` keep the published tarball tree-shakeable and minimal.

Downstream validation of the packaging happens in `pnpm verify` itself: `lint:pkg` runs **publint** against the built `dist/` to catch exports/types mistakes, and `size` enforces the gzip budgets (core 3.5 KB, react 7 KB; actuals per README: ~3.3 KB and ~6.4 KB).

## 12. Test suite map

Runner: **Vitest 4**, jsdom environment, `tests/setup.ts` registers RTL cleanup. The engine is deterministic under **fake timers** (`vi.useFakeTimers()`), which is what makes the timer-heavy state machine testable to the millisecond.

```
tests/
├─ smoke.test.ts                    package surface: exports + locked defaults
├─ monitor.test.ts (25)  ──────────── engine lifecycle: states, reveal, backoff,
│                                    offlineAfter, refresh, destroy, config errors,
│                                    hidden-tab policies
├─ check.test.ts (21)    ──────────── defaultCheck unit: status mapping, validate,
│                                    abort/timeout, pre-aborted caller signal
├─ network-matrix.test.ts (13) ────── cross-cutting conditions: decision-4
│                                    independence, browser-offline episodes,
│                                    online recovery, 4xx fast-path, hidden tab,
│                                    engine-level caller-abort semantics
├─ registry.test.ts (11) ──────────── key derivation, sharing, ref-count teardown
├─ use-server-status.test.tsx (13) ── hook: modes, StrictMode, capture-on-mount,
│                                    provider wiring, usage errors
├─ server-status.test.tsx (21) ────── default UI + axe-core a11y: silence rules,
│                                    banners, retry, i18n messages, style inject
└─ use-sync-external-store.test.tsx ─ React 17 legacy shim behavior (5)
```

Coverage gate ([vitest.config.ts](../vitest.config.ts)): per-glob thresholds on `src/core/**` — **≥90% lines / functions / statements, ≥85% branches** (the branch allowance covers the engine's settle-safety catch, which is unreachable today — `runCustomCheck` cannot reject and `defaultCheck` never rejects). `src/react/**` is excluded from the gate but heavily exercised through the component/hook suites. [tests/smoke.test.ts](../tests/smoke.test.ts) pins `DEFAULT_CONFIG` to the exact locked table, so a silent default change fails CI.

---

## 13. Quality gates & the `pnpm verify` pipeline

`pnpm verify` ([package.json](../package.json)) is the definition of done — every layer actually runs, in order:

```
pnpm verify
  │
  ├─ 1. format:check   Prettier check (whole repo; proseWrap "never")
  ├─ 2. lint           ESLint 10 flat config (type-aware, react-hooks rules)
  ├─ 3. typecheck      tsc --noEmit (strict, noUncheckedIndexedAccess)
  ├─ 4. test:coverage  Vitest 4, jsdom, v8 coverage
  │                    gate: src/core/** ≥ 90 lines / 90 fns / 90 stmts / 85 branches
  ├─ 5. build          tsup → dist/ (both entries, ESM+CJS+DTS)
  ├─ 6. size           scripts/check-size.mjs (gzip budgets: core 3.5 KB, react 7 KB)
  └─ 7. lint:pkg       publint (exports/types correctness of the built package)
```

Every gate needs the previous outputs where applicable (`size` and `lint:pkg` need `dist/`, hence they run after `build`), so the order is load-bearing, not cosmetic.

## 14. CI/CD & release flow

**CI** ([.github/workflows/ci.yml](../.github/workflows/ci.yml)): triggers on PRs to `main` and pushes to `main`, `develop`, `changeset-release/**`. Node 24 + pnpm (version from `packageManager`), `pnpm install --frozen-lockfile`, then `pnpm verify`. Concurrency group per ref cancels superseded runs.

**Release** ([.github/workflows/release.yml](../.github/workflows/release.yml)) — changesets-only, tokenless:

```
feature branch ──PR──► main
   │                     │
   │ adds a changeset    │ CI: pnpm verify
   │ (pnpm changeset)    │
   │                     ▼ push to main
   │           Release workflow (build + test, then changesets/action)
   │                     │
   │     ┌───────────────┴────────────────┐
   │     │ pending changesets exist?      │ none pending?
   │     ▼ YES                            ▼
   │  opens/updates "chore: version       publish: pnpm run publish:guarded
   │  packages" PR (version bumps +       └─ scripts/publish-if-unpublished.mjs
   │  CHANGELOG.md)                          checks npm registry first (idempotent),
   │     │ merged by maintainer              then `pnpm publish --provenance`
   │     ▼                                   (npm OIDC trusted publishing —
   └── (cycle repeats)                        workflow has id-token: write;
                                              no long-lived npm tokens anywhere)
```

Rules (from [docs/development.md](../docs/development.md) and [AGENTS.md](../AGENTS.md)): never `npm publish` by hand, never push version tags; releases happen only through this workflow. Branch `develop` is the active working branch; PRs target `main`.

## 15. Design decisions & pragmatic trade-offs

Beyond the 8 locked decisions in [§1](#1-the-product-in-one-paragraph), these behaviors are **deliberate, tested, and documented** ([docs/BACKLOG.md](../docs/BACKLOG.md), README FAQ) — revisit only with real-world evidence:

| Decision | Rationale | Trade-off accepted | Code |
| --- | --- | --- | --- |
| 4xx → permanent `offline` (fast-path) | A 4xx means the server is up and answering — wrong URL/auth, not a cold start; surfacing it immediately beats showing "starting up" against a 404 | A transient 404 during a redeploy shows the red banner until Retry | [engine.ts:194-205](../src/core/engine.ts), [check.ts:95](../src/core/check.ts) |
| Server-offline recovery is manual | The browser cannot observe a remote server coming back without polling; auto-recovery would silently re-introduce polling | User must press Retry / call `refresh()` | [engine.ts:324-331](../src/core/engine.ts) |
| Browser-offline recovery is automatic | The `online` event _is_ observable | — | [engine.ts:326-331](../src/core/engine.ts) |
| Config captured on mount (no live prop reconfig) | The config keys the shared registry; live updates would tear down shared engines mid-episode for all consumers | Reconfigure = remount with `key` | [use-server-status.ts:46-56](../src/react/use-server-status.ts) |
| Custom `check`/`validate` never share without `key` | Function identity is not serializable into a registry key | N loops for N components unless keyed | [registry.ts:24-33](../src/core/registry.ts) |
| Shared registry is module-instance-scoped | Simple, zero-config dedup | Bundler package duplication (mixed ESM/CJS graphs) → two registries; standard library caveat | [registry.ts:18](../src/core/registry.ts) |
| React 17 `useSyncExternalStore` fallback | Peer range includes `^17` | Legacy path is untestable under the repo's React 19 dev install | [use-sync-external-store.ts](../src/react/use-sync-external-store.ts) |
| One emission per attempt (counter rides along) | Two listener callbacks per attempt meant two React renders per attempt | Slightly denser `onResult` signature | [engine.ts:273-275](../src/core/engine.ts) |
| Modern runtimes over graceful degradation | `AbortSignal.timeout`/`.any` are baseline across evergreen browsers; the fallback code path was dead weight, and an unsupported runtime now fails fast (with an explicit signal) instead of silently losing the per-attempt timeout | Browsers older than ~2023–24 are unsupported | [check.ts:20-23](../src/core/check.ts) |
| Jittered exponential backoff (±20%) | Prevents synchronized retry storms across many cold clients | Slightly irregular polling rhythm | [engine.ts:146-153](../src/core/engine.ts) |

**Pragmatic build choices:** tsup over hand-rolled rollup config (two entries, four output formats, minimal config); a single `tsconfig.json` with `noEmit` (tsup emits, tsc verifies — no split build-type config, a former `tsconfig.build.json` was deliberately deleted); pnpm `allowBuilds` in `pnpm-workspace.yaml` as the single build-deps allowlist; plain `.mjs` node scripts instead of extra tooling for size budgeting and guarded publish.

## 16. Contributor routing: "I want to change X"

"I want to change X" → files to touch, tests to update, and which gear applies ([docs/development.md](../docs/development.md)):

| I want to… | Touch | Tests to update | Gear |
| --- | --- | --- | --- |
| Tune default timings / UI copy | [src/core/defaults.ts](../src/core/defaults.ts) / `DEFAULT_MESSAGES` in [src/react/server-status.tsx](../src/react/server-status.tsx) | [tests/smoke.test.ts](../tests/smoke.test.ts) pins `DEFAULT_CONFIG`; [tests/server-status.test.tsx](../tests/server-status.test.tsx) | Full (public behavior) |
| Add a `MonitorConfig` option | [src/core/types.ts](../src/core/types.ts), [src/core/defaults.ts](../src/core/defaults.ts), [src/core/engine.ts](../src/core/engine.ts), behavioral key list in [src/core/registry.ts](../src/core/registry.ts) | [tests/monitor.test.ts](../tests/monitor.test.ts), [tests/registry.test.ts](../tests/registry.test.ts) | Full |
| Change a state transition | [src/core/engine.ts](../src/core/engine.ts) | [tests/monitor.test.ts](../tests/monitor.test.ts), [tests/network-matrix.test.ts](../tests/network-matrix.test.ts) | Full (ADR needed if it touches a locked decision) |
| Change HTTP behavior (validation, abort, headers) | [src/core/check.ts](../src/core/check.ts) | [tests/check.test.ts](../tests/check.test.ts) | Quick-to-Full |
| Change UI copy / variant / markup | [src/react/server-status.tsx](../src/react/server-status.tsx) | [tests/server-status.test.tsx](../tests/server-status.test.tsx) (+axe) | Quick |
| Restyle the default UI | [src/react/styles.ts](../src/react/styles.ts) | [tests/server-status.test.tsx](../tests/server-status.test.tsx) (style-id assertions) | Quick |
| Change hook/provider semantics | [src/react/use-server-status.ts](../src/react/use-server-status.ts), [src/react/server-status-provider.tsx](../src/react/server-status-provider.tsx) | [tests/use-server-status.test.tsx](../tests/use-server-status.test.tsx) | Full (public API) |
| Change React version support | [src/react/use-sync-external-store.ts](../src/react/use-sync-external-store.ts) + peer range in [package.json](../package.json) | [tests/use-sync-external-store.test.tsx](../tests/use-sync-external-store.test.tsx) | Full |
| Adjust build outputs / exports map | [tsup.config.ts](../tsup.config.ts), [package.json](../package.json) | [tests/smoke.test.ts](../tests/smoke.test.ts); check with `pnpm build && pnpm lint:pkg` | Full |
| Adjust size budgets | [scripts/check-size.mjs](../scripts/check-size.mjs) | — | Quick (investigate before raising) |
| Ship a user-facing change | add a changeset (`pnpm changeset`) + README if needed | — | required by release flow |

## 17. Glossary & further reading

- **Episode** — the span from a `refresh()`/fresh start through consecutive failing checks until `active` or `offline`; `episodeStartAt`, `attempts`, `wasCold`, and `elapsedSeconds` are all episode-scoped ([engine.ts](../src/core/engine.ts)).
- **Cold start / `wasCold`** — an episode that passed through `waking`. Only a witnessed cold start earns the green confirmation; a warm success stays silent.
- **`offlineKind`** — `server` (backend unreachable / 4xx / budget exhausted) vs `browser` (`navigator.onLine === false`); drives distinct copy, icon, and recovery semantics.
- **Engine vs Monitor** — _engine_ = the single shared health loop per unique config; _monitor_ = a per-consumer ref-counted handle onto an engine ([registry.ts](../src/core/registry.ts)).
- **`ABORTED`** — internal sentinel symbol ([check.ts:4](../src/core/check.ts)) meaning "the caller cancelled this attempt"; never leaks into state.

Further reading, in the order a new contributor should read it:

1. [README.md](../README.md) — user-facing behavior and FAQ (the product contract).
2. [AGENTS.md](../AGENTS.md) — locked decisions and agent boundaries.
3. [docs/development.md](../docs/development.md) — the two-gear workflow and definition of done.
4. [docs/research/research-report.md](../docs/research/research-report.md) and [docs/research/Server-Active-Indicator-Feature-Dossier.md](../docs/research/Server-Active-Indicator-Feature-Dossier.md) — the verified platform research and design rationale behind every default ("research §N" citations in code comments point here).
5. [docs/BACKLOG.md](../docs/BACKLOG.md) — deliberate behaviors and deferred polish.
6. Then the source in dependency order: [src/core/types.ts](../src/core/types.ts) → [src/core/defaults.ts](../src/core/defaults.ts) → [src/core/check.ts](../src/core/check.ts) → [src/core/engine.ts](../src/core/engine.ts) → [src/core/registry.ts](../src/core/registry.ts) → [src/react/use-server-status.ts](../src/react/use-server-status.ts) → [src/react/server-status.tsx](../src/react/server-status.tsx).

---

_Created 2026-08-29 against commit `5a61c5f` (branch `develop`), `server-active-indicator@0.2.3`. Line numbers refer to the files as of that commit._
