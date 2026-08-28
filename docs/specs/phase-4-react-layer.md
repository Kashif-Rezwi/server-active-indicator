# Spec: Phase 4 — React layer (`useServerStatus`, `ServerStatusProvider`)

**Status:** implemented **Phase:** 4 — React layer (docs/ROADMAP.md) **Date:** 2026-08-26

## Goal

Thin, correct React binding over the Phase 3 core: `useServerStatus()` implemented with `useSyncExternalStore`, an optional `ServerStatusProvider` for app-level config sharing, `'use client'` compatibility for the Next.js App Router, a manual `refresh()` trigger, and **verifiable StrictMode safety** — after mount settles there is exactly one health loop, and unmount tears everything down.

## Non-goals

- No UI (Phase 5: `<ServerStatus>` stays a stub).
- No config reactivity: options are captured on mount (Design §3) — changing them later has no effect; the documented escape hatch is React's `key` prop.
- No merging of provider config into per-hook options — options, when provided, are used as-is (a merge semantic is a footgun; add later only if asked for by real usage).
- No SSR snapshot caching / `storageKey` (research §8, v1.x). No `onStatusChange`-style callbacks (deferred with the UI layer).

## Background

- Phase 3 shipped the refcounted registry: N consumers of one behavioral config share one engine; `destroy()` releases a reference and tears the engine down at zero refs. `Monitor` handles expose stable `getSnapshot`/`subscribe`/`refresh` closures, and the engine's snapshot object is identity-stable between state changes — exactly the contract `useSyncExternalStore` needs.
- Research §7: the react subpath is `useServerStatus()` (headless), `ServerStatusProvider` (optional, app-level), `<ServerStatus>` (Phase 5). React/react-dom are peers `^17 || ^18 || ^19`. Research §10 budget: react layer < 2 KB gzip.
- StrictMode (React 18+) double-invokes effects in dev (mount → cleanup → mount). The correctness requirement is not "effects run once" (they deliberately don't) but that our cleanup is complete: no leaked engines, no duplicate health loops after settle.
- React 17 has no `useSyncExternalStore` (it shipped in React 18), yet the locked peer range includes `^17`.

## Approach

### Alternatives considered — where does the monitor live?

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| A. Lazy-create in render (`useRef` guard) | no `unknown` frame; monitor ready day 1 | side effect during render; leaked engines + orphan fetches under concurrent/StrictMode renders | rejected |
| B. Create in `useEffect`, hold in `useState`, null-guarded uSES | pure render; SSR/hydration-safe; StrictMode-safe by construction | one `unknown` frame before the first check; one extra render on mount | **chosen** |
| C. Create inside the uSES `subscribe` callback | no extra state | subscribe may be called at arbitrary times; side-effecting it is unsupported usage | rejected |

Option B's cost is honest: `unknown` means "no check has started yet", which is literally true for the first commit — and on the server, where effects never run. The pre-effect / SSR snapshot is a module-level constant, so server HTML and client hydration render agree (no hydration mismatch), and the monitor lands one commit later.

### Alternatives considered — React 17 without `useSyncExternalStore`

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| A. `use-sync-external-store` npm shim | battle-tested | new runtime dependency (needs an ADR; react layer is dep-free) | rejected |
| B. Drop React 17 from peers | simplest code | changes a locked decision (AGENTS.md peer range) | rejected |
| C. `React.useSyncExternalStore ?? internal legacy shim` | no deps, keeps locked peers | ~20 lines only exercised on React 17 (unit-tested directly) | **chosen** |

The legacy shim is the classic `useState` + `useEffect` subscription pattern. It is only correct for legacy (non-concurrent) React — which is exactly and only where it runs. Accessing `useSyncExternalStore` via the namespace import (`React.useSyncExternalStore`) avoids a link-time error when a bundler-less ESM consumer runs React 17 (named-import interop on CJS React 17 can throw before any fallback executes).

## Design

### 1. `useServerStatus(options?)` — `src/react/use-server-status.ts`

```ts
useServerStatus(options?: MonitorConfig): MonitorSnapshot & { refresh: () => void }
```

- **No argument** → uses the nearest `ServerStatusProvider`'s monitor. Throws a descriptive render-time error when there is no provider (usage error; matches context-missing conventions).
- **Argument** → creates its own monitor via `createMonitor(options)` inside `useEffect`, `setMonitor`s it, and destroys it in the effect cleanup. The provider is ignored in that case (no merge — see Non-goals).
- Subscription: `useSyncExternalStore(subscribe, getSnapshot, getSnapshot)` where `subscribe`/`getSnapshot` are `useCallback`-memoized on the active monitor and null-guarded (null → module-level `INITIAL_SNAPSHOT` with `status: "unknown"` and a no-op unsubscribe). When the monitor identity changes (null → A → B), React re-subscribes with the new closures — that is how StrictMode remount converges.
- `refresh` is the active monitor's stable `refresh` (no-op while no monitor exists). The returned object is `useMemo`ized on `[snapshot, refresh]`.

### 2. `ServerStatusProvider` — `src/react/server-status-provider.tsx`

```tsx
<ServerStatusProvider healthUrl="…" pollInterval={5_000}>
  …
</ServerStatusProvider>
```

- Props are `MonitorConfig & { children: ReactNode }` (mirrors `ServerStatusProps`).
- Acquires one monitor in `useEffect` (same pattern as the hook), provides it via context, destroys it on unmount. The provider is the "config in one place" usage: all no-arg `useServerStatus()` consumers share it (and via the registry, anything with the same behavioral config shares the engine anyway).
- **Context value shape is the SSR fix:** `createContext<{ monitor: Monitor | null } | null>(null)` — outer `null` = _no provider_ (hook throws only for this), `{ monitor: null }` = provider present but monitor not yet created (server render / first commit → snapshot `unknown`, no throw).

### 3. Options are captured on mount

Both the hook and the provider create their monitor from the first-render options and keep it for their lifetime. Reasons:

- Identity-keying an inline options object (`[options]` deps) would recreate the monitor — aborting and restarting the health check — on _every_ parent re-render.
- Behavioral-keying (a stable serialization of config, like the registry's) handles value changes, but custom `check` functions have no serializable identity; it adds core surface for a scenario this product doesn't have (a health URL is a constant).
- Documented escape hatch: change config by remounting — `<ServerStatusProvider key={url} healthUrl={url}>`.

### 4. React 17 compatibility — `src/react/use-sync-external-store.ts` (internal)

```ts
const useSyncExternalStoreCompat = React.useSyncExternalStore ?? useSyncExternalStoreLegacy;
```

`useSyncExternalStoreLegacy` is the classic subscription pattern (`useState(() => getSnapshot())`, converge-on-mount check, `[subscribe]` effect). It is exported from the internal module (not the package index) for direct unit tests — same introspection precedent as the core registry's `__engineCount`. Dead code under React ≥18; kept to honor the locked `^17` peer range without a dependency.

### 5. `'use client'` (Next.js App Router)

- Applied as a **tsup banner** on the react entry only: `banner: { js: '"use client"' }`. Guarantees the directive is the first statement of both `dist/react/index.js` (ESM) and `dist/react/index.cjs` (CJS), regardless of bundler directive handling.
- The core build is untouched — `server-active-indicator` (framework-free) must not carry a client directive.
- tsup config splits into: core entry (`clean: true`), react entry (`clean: false`, banner), IIFE (unchanged, `clean: false`) — sequential configs share `dist/`, so only the first cleans.
- Source files carry no directive (tests/Node consumers of `src/` stay agnostic).

### 6. Toolchain additions (dev-only)

- `@testing-library/react` + `@testing-library/dom` — the locked stack (AGENTS.md: "Vitest 3 + React Testing Library + axe-core"); first needed now for `renderHook`.
- `eslint-plugin-react-hooks` (v7) for `src/react/**` and react tests, wired with the canonical `rules-of-hooks` + `exhaustive-deps` pair. The capture-on-mount effects use a deliberate, commented `react-hooks/exhaustive-deps` disable.
- `tests/setup.ts` (vitest `setupFiles`): `afterEach(cleanup)` — without vitest globals, RTL's auto-cleanup doesn't register.

### Files

```
src/react/use-server-status.ts          → REWRITE: the hook (uSES, StrictMode-safe)
src/react/use-sync-external-store.ts    → NEW: uSES selection + legacy shim (internal)
src/react/server-status-provider.tsx    → NEW: context + provider
src/react/index.ts                      → export ServerStatusProvider (+ types)
tsup.config.ts                          → split core/react entries; 'use client' banner
vitest.config.ts                        → setupFiles
tests/setup.ts                          → NEW: RTL cleanup
tests/use-server-status.test.tsx        → NEW: hook + provider + StrictMode suites
tests/use-sync-external-store.test.tsx  → NEW: legacy shim unit tests
tests/smoke.test.ts                     → react entry no longer a Phase-4 stub
```

## Edge cases & failure modes

| Case | Behavior |
| --- | --- |
| `useServerStatus()` with no provider | throws render-time usage error (options or provider required) |
| `useServerStatus({})` (no `healthUrl`/`check`) | `createMonitor` throws inside the effect → surfaces through React commit |
| First commit / SSR | snapshot `unknown` (module-const); server and hydration agree — no mismatch |
| StrictMode mount → cleanup → mount | engine A created, destroyed (fetch aborted), engine B created; **one** live engine after settle |
| Parent re-renders with inline options object | no churn — options captured on mount |
| Unmount | effect cleanup destroys the handle; engine torn down at zero refs |
| Provider unmounts while hook consumers live | context re-read on next render → `unknown` + no-op refresh (defensive; consumers usually unmount with it) |
| React 17 at runtime | legacy shim subscription (namespace import avoids ESM named-export link error) |
| Snapshot identity between engine changes | uSES cache rule satisfied: engine snapshots are identity-stable; pre-monitor snapshot is a module constant |
| Next.js App Router | `dist/react/*` starts with `'use client'`; core subpath carries no directive |

## Acceptance criteria

- [ ] `useServerStatus(options)` transitions `unknown → checking → active` on a warm backend and through `waking` on a cold one (renderHook + fake timers)
- [ ] `refresh()` triggers an immediate re-check and the result reflects it
- [ ] Unmount leaves zero engines (`__engineCount() === 0`); no snapshot updates after unmount
- [ ] **StrictMode: exactly one engine after mount, exactly one fetch per poll tick (a leaked loop would double it), zero engines after unmount**
- [ ] No-arg hook works under a provider and shares its engine; no-arg without provider throws
- [ ] Legacy shim: subscribes, converges, updates, unsubscribes on unmount
- [ ] `dist/react/index.js` and `dist/react/index.cjs` begin with `"use client"`; core output does not
- [ ] `pnpm verify` green; react-layer coverage reported (gate hardens in Phase 6)

## Validation gate

Vitest suites (use-server-status + legacy shim + updated smoke) green under `renderHook`/RTL; `pnpm verify` green end-to-end; built `dist/react` inspected for the `'use client'` directive; roadmap Phase 4 marked done; then Phase 5 (default UI).
