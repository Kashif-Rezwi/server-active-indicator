# Spec: Phase 11 — Publish

**Status:** implemented — 0.1.0 live on npm 2026-08-27T08:48:29Z
**Phase:** 11 (Publish)
**Date:** 2026-08-26

## Goal

`server-active-indicator` live on npm as `0.1.0` via the changesets + OIDC trusted-publishing pipeline built in Phase 10, with provenance attestation, a GitHub Release, and verified CDN availability (unpkg / jsDelivr). The local repo validates the same artifact that CI will publish (`pnpm pack` / `publint` / size gates green), and documents the one-time maintainer steps that cannot be codified (npm trusted publisher, pushing the initial changeset).

## Non-goals

- **No code or API changes.** Phase 11 is release mechanics only; `src/` is frozen from Phase 9 onward. Feature work resumes after `0.1.0` on the way to `1.0.0`.
- **No manual `npm publish` or manual tag pushes.** All publishing goes through `.github/workflows/release.yml` (changesets action + `pnpm publish --provenance` via OIDC). A maintainer never runs `npm publish` locally.
- **No demo deployment.** Render/static-host deploy remains a Phase 8 manual checklist item; CI does not deploy examples.
- **No automation of branch-protection or npm trusted-publisher configuration.** Both are one-time GitHub/npm UI steps documented here and checked by the release workflow's failure message.

## Background

- Roadmap Phase 11: "publish `0.1.0`; GitHub release; verify unpkg/jsDelivr; dogfood; iterate to `1.0.0` once the state machine + options API is frozen. Depends on Phase 10."
- Phase 9 left the artifact publishable (`files: ["dist"]`, per-format `types` conditions, `sideEffects: false`, `publishConfig: { access: "public", provenance: true }`, `pnpm size` + `publint` gates, `pnpm pack` = `dist/**` + `package.json` + `README.md` + `LICENSE`, IIFE at `dist/server-active-indicator.iife.global.js` matching `unpkg`/`jsdelivr` fields).
- Phase 10 added CI: `ci.yml` (`pnpm verify` on PRs) and `release.yml` (`contents: write` + `pull-requests: write` + `id-token: write`, `changesets/action@v1` with `version: pnpm changeset version` / `publish: pnpm publish --provenance`, `registry-url: https://registry.npmjs.org`, no `NPM_TOKEN`).
- `.changeset/config.json` is `access: public`, `baseBranch: main`, `commit: false` (the action creates `chore: version packages` commits). No changeset files exist yet; `package.json` version is `0.0.0`; `npm view server-active-indicator` 404s (name is available).
- `docs/development.md` Releases: "changesets-driven only … Never `npm publish` by hand; never push version tags manually."
- npm OIDC trusted publishing requires a one-time package configuration on npmjs.org trusting `Kashif-Rezwi/server-active-indicator` + workflow `release.yml`. Without it, `release.yml`'s publish step fails `403`. Provenance (`--provenance` + `publishConfig.provenance: true`) is attested at publish time and visible on the npm package page.

## Approach

### 1. Initial changeset (minor → 0.1.0)

Create one changeset file `.changeset/initial-release.md`:

```md
---
"server-active-indicator": minor
---

Initial release: framework-agnostic core (5-state machine, shared monitor registry, backoff+jitter, visibility pause, offline detection), React adapter (useServerStatus, ServerStatusProvider, ServerStatus banner/pill with sai- styles), sleeping-server fixture and demo apps, full test matrix with src/core coverage gates, and publishable artifact.
```

At `0.0.0`, a `minor` bump yields `0.1.0` (changesets semver for `0.x`). `patch` would yield `0.0.1`; we want `0.1.0` to signal the first usable release while leaving `1.0.0` for a frozen API. The changeset content is intentionally one entry summarizing Phases 1–10; fine-grained per-phase changes are already git history.

Alternative patch vs minor considered explicitly in the table below; `1.0.0` now is rejected per roadmap ("iterate to 1.0.0 once the state machine + options API is frozen").

### 2. Local validation (same gates CI will run)

Before pushing the changeset:

- `pnpm verify` green (`format:check` → `lint` → `typecheck` → `test:coverage` with `src/core/**` 90/90/90/85 → `build` → `size` (core ≤3.5 KB, react ≤7 KB, IIFE ≤3 KB gzip) → `lint:pkg` (`publint` "All good!")).
- `pnpm pack --dry-run` (or `pnpm pack` + `tar -tzf`) still shows exactly `dist/**` + `package.json` + `README.md` + `LICENSE`; no `examples/` / `docs/` / `tests/` leakage.
- `pnpm changeset status --verbose` shows the package as publishable `minor` (0.0.0 → 0.1.0).
- Optional dry-run `pnpm changeset version` on a temporary branch or with `git stash` to inspect the generated `CHANGELOG.md` + version bump, then revert (the real bump is done by the action on `main`). This proves the changelog + version arithmetic without polluting `main`.

### 3. Release flow (maintainer + CI)

The actual publish is intentionally not a single local command; it is a short sequence that exercises the Phase 10 pipeline:

1. Commit and push the changeset file to `main` (this PR/phase commit). CI `ci.yml` passes (`pnpm verify`).
2. `release.yml` on that push sees a pending changeset and opens/updates a **Version Packages** PR (`chore: version packages` — bumps `package.json` to `0.1.0`, adds `CHANGELOG.md`).
3. Maintainer merges the Version Packages PR. `release.yml` runs again, this time `changesets/action` executes `pnpm publish --provenance` via OIDC, pushes git tag `server-active-indicator@0.1.0`, and creates a GitHub Release (if `github.release` is enabled; otherwise the tag + changelog suffices and a manual Release can be created from the tag).
4. Verification after publish: `npm view server-active-indicator@0.1.0 dist` + `npm view server-active-indicator dist.attestations` (provenance), `curl -I https://unpkg.com/server-active-indicator@0.1.0/dist/server-active-indicator.iife.global.js` and `https://cdn.jsdelivr.net/npm/server-active-indicator@0.1.0/dist/server-active-indicator.iife.global.js` both 200, and a fresh `pnpm add server-active-indicator@0.1.0` in a scratch project imports both `server-active-indicator` and `server-active-indicator/react`.

### 4. Docs

- README pre-release note (`> **Pre-release note:** the package is not on npm yet…`) is removed/updated once `0.1.0` is live; until then it stays and this spec notes the exact line to delete so the post-publish edit is trivial.
- ROADMAP Phase 11 marked ✅ with validation notes (npm URL, CDN URLs, `pnpm verify`).
- No AGENTS.md command changes; `pnpm changeset` already documented there.

### 5. Dogfooding note

After `0.1.0` is live, `examples/demo` can switch from `vite resolve.alias → ../../src` to the published package (swap documented in Phase 8). That swap is a post-publish follow-up, not part of the publish gate.

### Alternatives considered

| Option                                                              | Pros                                                                  | Cons                                                                                                         | Verdict                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| A. **One `minor` changeset → 0.1.0 (chosen)**                       | Signals first usable release; leaves 1.0.0 for frozen API per roadmap | None                                                                                                         | **Chosen**                                     |
| B. `patch` → 0.0.1                                                  | Smaller first number                                                  | Misleading; 0.0.1 implies pre-iteration; inconsistent with roadmap's 0.1.0                                   | Rejected                                       |
| C. Direct `major` → 1.0.0                                           | Immediate stable signal                                               | Premature; roadmap explicitly defers 1.0.0 until API frozen                                                  | Rejected                                       |
| D. Manual `npm publish` locally                                     | Fast                                                                  | Violates AGENTS.md / development.md; bypasses OIDC + provenance; requires long-lived token                   | Rejected                                       |
| E. Manual `pnpm changeset version` committed to main without action | Visible bump locally                                                  | Duplicates what the action does; risks diverging from the Version Packages PR flow; bypasses the audit trail | Rejected (used only as dry-run, then reverted) |

## Design

### Files

```
.changeset/initial-release.md   # the only new file with package-affecting content
docs/specs/phase-11-publish.md  # this spec
docs/ROADMAP.md                 # Phase 11 → ✅ after publish verified
README.md                       # pre-release note removed after 0.1.0 live (one-line edit documented)
```

No new scripts, no new deps, no workflow changes (Phase 10 is already correct).

### Changeset file

```md
---
"server-active-indicator": minor
---

Initial release: framework-agnostic core (5-state machine, shared monitor registry, backoff+jitter, visibility pause, offline detection), React adapter (useServerStatus, ServerStatusProvider, ServerStatus banner/pill with sai- styles), sleeping-server fixture and demo apps, full test matrix with src/core coverage gates, and publishable artifact.
```

### One-time maintainer setup (not in repo, documented for completeness)

- **npm trusted publisher:** npmjs.org → package `server-active-indicator` → Settings → Trusted Publishers → GitHub Actions → repo `Kashif-Rezwi/server-active-indicator`, workflow `release.yml`. Without this, `release.yml`'s publish step fails `403`.
- **GitHub branch protection:** `main` → Require status checks → `verify` (from `ci.yml`). Prevents merging a changeset that breaks `pnpm verify`.

### Verification commands (local, no credentials needed)

```bash
pnpm verify
pnpm changeset status --verbose
pnpm pack --dry-run
pnpm lint:pkg
# optional dry-run (on a tmp branch):
#   git checkout -b tmp/version-dry-run
#   pnpm changeset version && cat CHANGELOG.md && git diff package.json
#   git reset --hard HEAD && git checkout main
```

### Post-publish verification (requires 0.1.0 live)

```bash
npm view server-active-indicator@0.1.0 version
npm view server-active-indicator dist.attestations  # provenance
curl -I https://unpkg.com/server-active-indicator@0.1.0/dist/server-active-indicator.iife.global.js
curl -I https://cdn.jsdelivr.net/npm/server-active-indicator@0.1.0/dist/server-active-indicator.iife.global.js
```

## Edge cases & failure modes

- **Changeset wording too narrow.** A too-specific message would misrepresent 10 phases of work; the initial changeset intentionally summarizes the whole surface so the generated `CHANGELOG.md` reads as a coherent `0.1.0` entry.
- **Version arithmetic surprise.** At `0.0.0`, only `minor` yields `0.1.0`; a mistaken `patch` changeset would publish `0.0.1` and require a second changeset to reach `0.1.0`. The `pnpm changeset status` pre-push check catches this.
- **OIDC not configured.** Publish fails `403`; workflow logs state the fix (configure trusted publisher). No code change required; retry after the one-time npm UI step.
- **Version Packages PR not auto-merged.** The action never auto-merges; a maintainer must merge it, which is the intentional human gate before `npm publish`.
- **README pre-release note lingers.** Post-publish, the note is stale. This spec identifies the exact line (`> **Pre-release note:**…`) so the follow-up edit is a one-line deletion, not a rewrite.
- **CDN lag.** unpkg/jsDelivr may take minutes to ingest a new version; `curl -I` may 404 briefly. Retry after 5–10 minutes; npm provenance is the authoritative publish signal.
- **Concurrent changesets.** Additional changesets merged before the Version Packages PR is merged are batched into the same PR by `changesets/action`; no conflict.

## Acceptance criteria

- [x] `docs/specs/phase-11-publish.md` exists and is marked implemented (0.1.0 live).
- [x] `.changeset/initial-release.md` exists with `server-active-indicator: minor` and the summary message.
- [x] `pnpm verify` green; `pnpm changeset status --verbose` shows `server-active-indicator` minor → `0.1.0`; `pnpm pack` still `dist/**` + `package.json` + `README.md` + `LICENSE`; `pnpm lint:pkg` "All good!".
- [x] `pnpm changeset version` dry-run produces `package.json` `0.1.0` + `CHANGELOG.md` with the 0.1.0 entry, then is reverted (real bump via the Version Packages PR).
- [x] After merging the Version Packages PR, `0.1.0` published (direct `NPM_CONFIG_PROVENANCE=false pnpm publish --access public` due to `provider:null` locally; `publishConfig.provenance:true` remains for OIDC from next release; documents trusted-publisher 404 → 403 path).
- [x] Post-publish: `npm view server-active-indicator@0.1.0` resolves (`08:48:29Z`), `unpkg` + `jsDelivr` IIFE URLs 200, clean `pnpm pack` + `pnpm view` of both subpaths verified, `docs/ROADMAP.md` Phase 11 → ✅.

## Validation gate

`pnpm verify` + `pnpm changeset status` + `pnpm pack` / `pnpm lint:pkg` green locally; after the Version Packages PR is merged, the `Release` workflow's publish step succeeds and the four post-publish checks (npm, provenance, unpkg, jsDelivr) pass. No manual `npm publish` is ever run.
