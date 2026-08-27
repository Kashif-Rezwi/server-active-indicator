# Backlog — optional future improvements

Deferred items from the pre-Phase-12 comprehensive audit (2026-08-27). None of
these block integration; they are polish, not debt. Pick them up one at a time,
quick gear each, after Phase 12 dogfooding has provided real-world signal.

## Repo & docs hygiene

- **Deploy the Phase 8 demo + replace the placeholder GIF.** The README ships
  `docs/assets/demo-placeholder.gif` with a `TODO(external:phase-8-deploy)`
  comment. The demo code is complete (`examples/demo`, `examples/demo-server`,
  `render.yaml`); only the Render + static-host deploy and the GIF capture
  remain (checklist in `examples/demo/README.md`). Nice-to-have before the
  Phase 12 "extracted to OSS" story points traffic at the repo.
- **Delete `tsconfig.build.json`.** Nothing references it (build is tsup;
  typecheck uses `tsconfig.json`). Verified dead during the audit.
- **Deduplicate pnpm build-deps config.** `.npmrc`
  (`onlyBuiltDependencies[]=esbuild`) and `pnpm-workspace.yaml`
  (`allowBuilds` + `onlyBuiltDependencies`) state the same thing twice. Keep
  the workspace file (pnpm 11 canonical) and drop the `.npmrc` line after
  confirming a fresh `pnpm install` still builds esbuild.
- **Add a minimal vanilla-JS example** (or a README recipe) — every runnable
  example is currently React, while framework-agnosticism is the headline
  claim. ~20 lines: `createMonitor` + `subscribe` + DOM toggle.

## Runtime micro-polish (behavior-preserving)

- **Fold the per-attempt double emission into one.** `attempt()` emits
  `{ attempts: n+1 }` and then `onResult` emits the state change — two
  subscriber callbacks (two React renders) per attempt. Merge into a single
  `setSnapshot` call.
- **Reset `elapsedSeconds: 0` on transition to `active`.** The stale value
  currently persists in the snapshot until the next episode.
- **`engines: { node: ">=18" }`** in package.json is meaningless for a
  browser library. Keep (harmless) or drop.

## Documented-as-deliberate behaviors to revisit only with real-world evidence

- **4xx → permanent `offline`.** A transient 404 during a redeploy leaves the
  red banner until manual Retry. The fast-path is a locked, tested behavior
  (4xx = misconfiguration, not cold start); revisit only if Phase 12 usage
  shows false positives in practice.
- **Server-offline recovery is manual** (Retry / `refresh()`). Browser-offline
  auto-recovers via the `online` event (shipped in the audit-hardening
  release); server-offline deliberately does not poll its way back.
- **Shared registry is module-instance-scoped.** If a consumer's bundler
  duplicates the package (mixed ESM/CJS graphs), two registries = two health
  loops. Standard library caveat; worth one FAQ line if it ever bites.
- **React 17 `useSyncExternalStore` fallback** is legacy-only by construction
  and untestable under this repo's React 19 install. Accepted, documented in
  the shim; remove the fallback when the peer range drops `^17`.
