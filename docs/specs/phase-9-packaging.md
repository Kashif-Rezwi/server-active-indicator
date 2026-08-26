# Spec: Phase 9 — Packaging

**Status:** implemented
**Phase:** 9 (Packaging)
**Date:** 2026-08-26

## Goal

A publishable artifact: `pnpm pack` produces a tarball containing exactly
`dist/` + README + LICENSE, `publint` is clean, subpath exports resolve
correctly for ESM and CJS consumers (including per-format type declarations),
a bundle-size budget is enforced mechanically, and changesets is initialized
so Phase 10 can wire the release workflow.

## Non-goals

- **No publishing.** Phase 11 publishes; Phase 10 wires CI. `npm publish` is
  never run by hand (AGENTS.md release boundary).
- **No API or source changes.** Only `package.json` metadata, packaging
  scripts, and tooling config. If `publint` surfaces a real code issue, it
  gets its own spec — none expected.
- **No monorepo/versioning tooling beyond changesets** (locked decision 1).
- **No `attw` (are-the-types-wrong) gate yet** — publint covers the roadmap's
  requirement; `attw` can be added in Phase 10 CI if desired.

## Background

- Roadmap Phase 9: "changesets init; `files`/`exports`/`sideEffects: false`
  audit; bundle-size budget check (<5 KB gzip total target); LICENSE/README in
  tarball. Validation: `pnpm pack` inspected; `publint` clean."
- Current `package.json`: `files: ["dist"]`, `sideEffects: false`, subpath
  exports for `.` and `./react` with a single `types` condition per subpath.
- tsup emits per-format declarations: `dist/index.d.ts` (ESM) **and**
  `dist/index.d.cts` (CJS), same for `dist/react/`. The current exports map
  points both `import` and `require` at the ESM `.d.ts` — under
  `node16`/`nodenext` resolution that makes CJS consumers resolve ESM types
  (the "masquerading as CJS" class of issue publint flags).
- Phase 6 measured sizes: core 2.94 KB gzip ESM, react 6.04 KB gzip ESM.
  The roadmap's "<5 KB total" target predates the Phase 5 UI; the enforced
  budget is per-export with headroom (core ≤ 3.5 KB, react ≤ 7 KB,
  IIFE ≤ 3 KB gzip) — documented as a decision, not a silent miss.
- `sideEffects: false` is safe: the React adapter injects styles from an
  effect (runtime behavior, not a module-evaluation side effect), so
  tree-shaking cannot strip anything observable.

## Approach

1. **Changesets:** `@changesets/cli` devDep + `changeset init`; config:
   `access: "public"` (matches `publishConfig`), `baseBranch: "main"`,
   default changelog. No changesets content yet — the first changeset lands
   with the first user-facing change after this phase.
2. **Exports map fix:** per-format `types` conditions —
   `import` → `.d.ts` + `.js`, `require` → `.d.cts` + `.cjs` — for both
   subpaths. Keep top-level `main`/`module`/`types` for legacy resolvers and
   `unpkg`/`jsdelivr` pointing at the IIFE build.
3. **publint gate:** `publint` devDep + `pnpm lint:pkg` script; must exit
   clean. Added to `pnpm verify` after build.
4. **Size budget:** `scripts/check-size.mjs` (node, zero deps) gzips the dist
   entry points and asserts the budgets above; `pnpm size` script, wired into
   `pnpm verify` after build (budgets are enforced on built output).
5. **Tarball inspection:** `pnpm pack`, then `tar -tzf` to confirm contents
   are exactly `dist/**`, `package.json`, `README.md`, `LICENSE`.
6. **Docs:** AGENTS.md commands table gains `size` / `lint:pkg`; roadmap
   Phase 9 marked done.

### Alternatives considered

| Option                                             | Pros                                            | Cons                                                             | Verdict  |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | -------- |
| A. `scripts/check-size.mjs` (node zlib, zero deps) | No new dependency; exact budgets; runs anywhere | ~40 lines to maintain                                            | Chosen   |
| B. `size-limit` devDep                             | Ecosystem standard                              | Extra dep + config for a 3-file check; runs its own bundler pass | Rejected |
| C. Single `types` condition (status quo)           | No change                                       | publint flags CJS/ESM types mismatch; real risk under `nodenext` | Rejected |

## Design

### `package.json` changes

```jsonc
"exports": {
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  },
  "./react": {
    "import": { "types": "./dist/react/index.d.ts", "default": "./dist/react/index.js" },
    "require": { "types": "./dist/react/index.d.cts", "default": "./dist/react/index.cjs" }
  },
  "./package.json": "./package.json"
}
```

New scripts: `"size": "node scripts/check-size.mjs"`,
`"lint:pkg": "publint"`, `"changeset": "changeset"`. `verify` becomes
`format:check → lint → typecheck → test:coverage → build → size → lint:pkg`.

New devDeps: `@changesets/cli`, `publint` (both dev-only; zero runtime
dependency rule untouched).

### `scripts/check-size.mjs`

Reads each entry (`dist/index.js`, `dist/react/index.js`,
`dist/server-active-indicator.iife.global.js`), reports raw + gzip bytes,
fails (exit 1) if any exceeds its budget. Budgets (gzip): core 3.5 KB,
react 7 KB, IIFE 3 KB — Phase 6 actuals + ~20% headroom.

### `.changeset/config.json`

`access: "public"`, `baseBranch: "main"`, default changelog, `commit: false`
(the Phase 10 action handles release commits).

## Edge cases & failure modes

- **Verify order** — `size`/`lint:pkg` need `dist/`; they run after `build`
  in the composed `verify` script.
- **Tarball drift** — `files: ["dist"]` + npm's automatic README/LICENSE
  inclusion is verified by actual `tar -tzf` inspection, not assumption.
- **IIFE naming** — `unpkg`/`jsdelivr` fields must match tsup's actual output
  name (`server-active-indicator.iife.global.js`); asserted by tarball
  inspection.
- **Examples leaking into the tarball** — `files` whitelist prevents it;
  confirmed in the inspection (demo apps must not ship).

## Acceptance criteria

- [x] changesets initialized with `access: "public"`.
- [x] `publint` exits clean (0 problems).
- [x] `pnpm size` passes with the documented budgets.
- [x] `pnpm pack` tarball = `dist/**` + `package.json` + `README.md` +
      `LICENSE` only; IIFE filename matches `unpkg`/`jsdelivr` fields.
- [x] `pnpm verify` green with the new gates; AGENTS.md commands table in sync.
- [x] `docs/ROADMAP.md` Phase 9 marked done.

## Validation gate

`pnpm verify` green (now including `size` + `lint:pkg`); tarball contents
inspected; spec + roadmap updated in the same commit.
