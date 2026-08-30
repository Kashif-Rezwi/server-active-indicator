# Backlog — optional future improvements

Deferred items from the pre-Phase-12 comprehensive audit (2026-08-27). None of these block integration; they are polish, not debt. Pick them up one at a time, quick gear each, after Phase 12 dogfooding has provided real-world signal.

## Repo & docs hygiene

- [x] **Delete `tsconfig.build.json`.** ✅ Deleted (2026-08-29 audit) — nothing referenced it (build is tsup; typecheck uses `tsconfig.json`).
- [x] **Deduplicate pnpm build-deps config.** ✅ `.npmrc` deleted (2026-08-29 audit); `pnpm-workspace.yaml` (`allowBuilds` + `onlyBuiltDependencies`) is the single canonical config and a fresh `pnpm install` still builds esbuild.
- **Add a minimal vanilla-JS example** (or a README recipe) — every runnable example is currently React, while framework-agnosticism is the headline claim. ~20 lines: `createMonitor` + `subscribe` + DOM toggle.

## Runtime micro-polish (behavior-preserving)

- [x] **Fold the per-attempt double emission into one.** ✅ Done (2026-08-29) — `attempt()` now passes the incremented counter into `onResult`, which merges it into its single state-change `setSnapshot` (the ABORTED path keeps the counter-only emission). One listener callback per attempt instead of two.
- [x] **Reset `elapsedSeconds: 0` on transition to `active`.** ✅ Done (2026-08-29) — included in the `active` branch's `setSnapshot`.
- [x] **`engines: { node: ">=18" }`** in package.json is meaningless for a browser library. Keep (harmless) or drop. ✅ Dropped (2026-08-29). **Re-added as `node: ">=20.3.0"` (2026-08-29 audit)** — now meaningful, not browser-related: it declares the Node floor for SSR/server-side health checks (`AbortSignal.any` arrived in Node 20.3) and resolves the publint advisory. Update it if the runtime floor ever changes.

## Documented-as-deliberate behaviors to revisit only with real-world evidence

- **4xx → permanent `offline`.** A transient 404 during a redeploy leaves the red banner until manual Retry. The fast-path is a locked, tested behavior (4xx = misconfiguration, not cold start); revisit only if Phase 12 usage shows false positives in practice.
- **Server-offline recovery is manual** (Retry / `refresh()`). Browser-offline auto-recovers via the `online` event (shipped in the audit-hardening release); server-offline deliberately does not poll its way back.
- **Shared registry is module-instance-scoped.** If a consumer's bundler duplicates the package (mixed ESM/CJS graphs), two registries = two health loops. Standard library caveat; worth one FAQ line if it ever bites.
- **React 17 `useSyncExternalStore` fallback** is legacy-only by construction and untestable under this repo's React 19 install. Accepted, documented in the shim; remove the fallback when the peer range drops `^17`.
