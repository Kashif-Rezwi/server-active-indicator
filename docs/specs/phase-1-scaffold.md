# Spec: Phase 1 — Architecture & scaffold

**Status:** implemented **Phase:** 1 — Architecture & scaffold (docs/ROADMAP.md) **Date:** 2026-08-26

## Goal

Produce a buildable, typecheckable, testable package skeleton with the locked toolchain, so every later phase has a working `pnpm verify` loop from day one. No product logic ships in this phase — module shells and placeholder types only.

## Non-goals

- No state machine, no fetch logic, no React components (Phases 2–5).
- No changesets, CI/CD, or publish config (Phases 9–10).

## Background

Locked decisions from `docs/research/research-report.md` §7, §13 and `AGENTS.md`:

- Single package with subpath exports: `"."` = framework-free core, `"./react"` = React adapter. No monorepo tooling.
- tsup 8.x builds ESM + CJS + `.d.ts` per entry, plus one IIFE bundle (core only) for unpkg/jsDelivr consumers.
- Zero runtime dependencies; `react`/`react-dom` are peer dependencies.
- Vitest 4 (jsdom) + ESLint 10 flat + Prettier; pnpm 11.

## Approach

Standard modern library layout, configured to fail loudly on misconfiguration (strict TS, `verify` script as single gate). The `exports` map is authored now — even though Phase 1 code is empty shells — because export-map mistakes are the most expensive library bug to fix post-publish.

### Alternatives considered

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| tsup (multi-entry) | esbuild-fast, one config, ESM+CJS+DTS+IIFE; actively maintained | d.ts via rollup-plugin-dts can struggle with exotic types | **Chosen** — our types are plain |
| tsc + Rollup by hand | full control | slow, 3 configs to keep in sync | Rejected — complexity for no gain |
| unbuild | nice defaults | less flexible IIFE; smaller community for React libs | Rejected |

## Design

### Layout

```
package.json  tsconfig.json  tsconfig.build.json  tsup.config.ts
eslint.config.js  .prettierrc.json  vitest.config.ts
src/index.ts            → core entry (re-exports src/core/*)
src/core/types.ts       → ServerStatus, MonitorConfig, MonitorSnapshot, CheckResult
src/core/defaults.ts    → DEFAULT_CONFIG constant (values from research §8)
src/core/monitor.ts     → createMonitor() stub (throws "not implemented")
src/react/index.ts      → react entry (re-exports)
src/react/use-server-status.ts   → stub throwing "not implemented"
src/react/server-status.tsx      → stub component throwing "not implemented"
tests/smoke.test.ts     → verifies entries import & defaults have locked values
```

### package.json (key fields)

- `name: server-active-indicator`, `version: 0.0.0` (changesets owns versions later)
- `type: "module"`, `sideEffects: false`
- `exports`:
  - `"."` → `dist/index.js` (import) / `dist/index.cjs` (require) / `dist/index.d.ts`
  - `"./react"` → `dist/react/index.js` / `dist/react/index.cjs` / `dist/react/index.d.ts`
- `files: ["dist"]`, `publishConfig: { access: "public" }`
- `peerDependencies: react ^17||^18||^19, react-dom ^17||^18||^19` with `peerDependenciesMeta` both `optional: true` (core export must not force React)
- scripts: `build`, `test`, `test:coverage`, `lint`, `lint:pkg`, `size`, `format`, `format:check`, `typecheck`, `verify` (= format:check && lint && typecheck && test:coverage → build → size → lint:pkg)

### TypeScript

`tsconfig.json`: strict, `moduleResolution: "bundler"`, `module: "ESNext"`, `target: "ES2020"`, `lib: ["ES2020", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `isolatedModules`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `skipLibCheck: true`, `noEmit: true`. `tsconfig.build.json` extends it with `noEmit: false`, `declaration`, excluding tests (deleted post-Phase-11 — see `docs/BACKLOG.md`).

### tsup

Entries `src/index.ts` + `src/react/index.ts`: formats `esm`+`cjs`, `dts: true`, `sourcemap: true`, `clean: true`, `external: ["react", "react-dom"]`. Second config for `src/index.ts` → `format: ["iife"]`, `globalName: "ServerActiveIndicator"`, `minify: true`, out file `dist/server-active-indicator.iife.global.js`.

### Placeholder types (shape only — implementation is Phase 2–3)

```ts
export type ServerStatus = "unknown" | "checking" | "waking" | "active" | "offline";
export type FailureReason = "slow-response" | "request-failed" | "http-error";
export interface MonitorConfig {
  healthUrl?: string;
  check?: () => Promise<boolean | CheckResult>;
  timeout?: number;
  revealDelay?: number;
  pollInterval?: number;
  offlineAfter?: number;
  successDisplayMs?: number;
  activeCheckInterval?: number;
  pauseWhenHidden?: boolean;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  validate?: (res: Response) => boolean;
}
export interface CheckResult {
  ok: boolean;
  reason?: FailureReason;
  status?: number;
}
export interface MonitorSnapshot {
  status: ServerStatus;
  reason?: FailureReason;
  elapsedSeconds: number;
  lastCheckedAt: number | null;
  attempts: number;
}
```

## Edge cases & failure modes

- **React-less consumers**: `peerDependenciesMeta.optional` + `external` in tsup — `import "server-active-indicator"` must never resolve react.
- **Bundler interop**: both `import` and `require` paths must resolve; verified by smoke-importing built `dist/` output in the test phase of `verify`.
- **IIFE global**: core only; react layer never ships IIFE (needs a React global — out of scope).

## Acceptance criteria

- [x] `pnpm install` clean; all devDeps pinned per locked tooling
- [x] `pnpm verify` (format:check → lint → typecheck → test:coverage → build → size → lint:pkg) green
- [x] `dist/` contains ESM+CJS+DTS for both entries + one minified IIFE
- [x] `pnpm pack` tarball contains only `dist/`, `README.md`, `LICENSE`, `package.json`
- [x] Built core importable from Node ESM and CJS without react installed
- [x] `AGENTS.md` commands table matches final scripts
- [x] Roadmap Phase 1 box checked

## Validation gate

Run `pnpm verify`, inspect `pnpm pack` contents, smoke-import the built output from a temp dir with both `node --input-type=module` and `require()`. Demo to maintainer, check the Phase 1 box in `docs/ROADMAP.md`, then proceed to Phase 2.
