# Spec: Phase 10 — CI/CD

**Status:** implemented
**Phase:** 10 (CI/CD)
**Date:** 2026-08-26

## Goal

Safe, automated releases. Every PR is verified the same way a maintainer verifies locally (`pnpm verify`). Merging to `main` never publishes directly; the changesets action opens or updates a single "Version Packages" PR, and merging that PR publishes to npm via OIDC trusted publishing with provenance attestation — no long-lived `NPM_TOKEN`, no manual `npm publish`, no manual tag pushes.

## Non-goals

- **No new runtime code or public API.** This phase is infra only (` .github/workflows/`, optional `publishConfig.provenance`). No `src/` changes.
- **No deployment of the demo** (Render/static host). Phase 8 leaves that to the maintainer; CI does not deploy examples.
- **No npm publishing from PRs or feature branches.** Only the `release` workflow on `main` publishes, and only when a changeset-triggered version commit is present.
- **No branch protection / required checks configuration in code** — that is a GitHub settings step documented as a manual follow-up (API cannot reliably set it from a workflow).

## Background

- Roadmap Phase 10: "PR workflow (lint → typecheck → test → build); release workflow with changesets + npm OIDC trusted publishing + provenance attestation. Depends on Phase 9."
- Phase 9 left the repo with: `pnpm verify = format:check → lint → typecheck → test:coverage → build → size → lint:pkg`, strict TS, Vitest 4 with jsdom + `src/core/**` 90/85 coverage gate, tsup 8.5 producing ESM+CJS+DTS+IIFE, changesets 3 (`access: public`, `baseBranch: main`, `commit: false`), `publint` + `check-size.mjs` gates, `packageManager: pnpm@11.24.0`, `engines.node >=18`.
- Locked decision: single package, subpath exports, zero runtime deps — CI must not add runtime deps.
- Releases are changesets-driven per `docs/development.md`: feature branches merge to `main`, the changesets action opens/updates a release PR, merging it publishes via OIDC with provenance.
- npm OIDC trusted publishing (2023+) removes long-lived tokens: the npm package is configured once on npmjs.org to trust the GitHub repo + workflow, and the workflow requests an `id-token` from GitHub and exchanges it for a short-lived npm token at publish time. Provenance (SLSA-style attestations) requires npm ≥10 / Node ≥20 plus `id-token: write` and either `publishConfig.provenance: true` or `npm publish --provenance`.
- This repo's default branch is `main`, remote is `github.com/Kashif-Rezwi/server-active-indicator`.

## Approach

Two workflows under `.github/workflows/`. Both use `pnpm/action-setup@v4` (no `version` input — reads `packageManager: pnpm@11.24.0` from `package.json` as single source of truth, avoiding `ERR_PNPM_BAD_PM_VERSION`) + `actions/setup-node@v4` with Node 22, cache on `pnpm-lock.yaml`, and `pnpm install --frozen-lockfile` for determinism.

1. **PR workflow — `.github/workflows/ci.yml`**
   - Name: `CI`
   - Triggers: `pull_request` targeting `main` + `push` to `main` (so `main` itself is always green; push to other branches is not CI'd — PRs cover them).
   - `permissions: contents: read` (least privilege).
   - Concurrency: `ci-${{ github.ref }}` with `cancel-in-progress: true`.
   - Single job `verify` on `ubuntu-latest` with `timeout-minutes: 10`; `actions/checkout@v4` → pnpm setup → Node setup → install → **run the full `pnpm verify` gate** (format:check, lint, typecheck, test:coverage, build, size, lint:pkg) in one step so the job mirrors the local DoD exactly. Splitting into separate jobs is deferred — it adds matrix complexity without benefit at this package size (<10 min even with coverage).
   - No artifact upload needed; coverage is enforced by the threshold exit code (no separate coverage comment action).

2. **Release workflow — `.github/workflows/release.yml`**
   - Name: `Release`
   - Triggers: `push` to `main` only (not PRs). Concurrency: `release-${{ github.ref }}` with `cancel-in-progress: false` (publishes must not be cancelled).
   - `permissions: contents: write`, `pull-requests: write`, `id-token: write` — the minimal set changesets + OIDC + provenance require.
   - Single job `release` on `ubuntu-latest`, `if: github.repository_owner == 'Kashif-Rezwi'` guard optional but kept to avoid forks attempting OIDC.
   - Steps: checkout → pnpm setup → Node setup (with `registry-url: https://registry.npmjs.org` so `setup-node` writes the auth-adjacent `.npmrc` for OIDC; no `NODE_AUTH_TOKEN` secret needed) → `pnpm install --frozen-lockfile` → `pnpm build` (changesets version needs `dist/` present for `publint`/`size` if they re-run, and `pnpm publish` publishes `dist/`).
   - Publish step uses `changesets/action@v1`:
     ```yaml
     - uses: changesets/action@v1
       with:
         version: pnpm changeset version
         publish: pnpm publish --provenance
         commit: "chore: version packages"
         title: "chore: version packages"
       env:
         GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     ```
     No `NPM_TOKEN` — OIDC flow uses the workflow's `id-token`. The `publish` command carries `--provenance` to emit the npm provenance attestation (SLSA). As a defense-in-depth, `package.json:publishConfig.provenance` is also set to `true` so a future manual `pnpm publish` outside the workflow would still attest (one line, no behavior change for the workflow).
   - `commit: false` in `.changeset/config.json` (Phase 9) is intentional: the action creates the version commit itself with the `commit:` param above; no extra bot commit config needed.
   - `changesets/action` behavior: if no publishable changeset is present, it opens/updates a "Version Packages" PR; if a version PR was just merged, it runs `pnpm publish --provenance` and pushes tags.

3. **`package.json` tweak**
   - Add `"provenance": true` under `publishConfig` (now `{ "access": "public", "provenance": true }`). This is additive, does not affect `pnpm pack` contents, and `publint` accepts it.

4. **Manual follow-up (documented, not automated)**
   - On npmjs.org: enable trusted publishing for package `server-active-indicator` → GitHub repo `Kashif-Rezwi/server-active-indicator`, workflow `release.yml`, environment `*` (or none). Without this, OIDC publish fails — the workflow error message is the signal.
   - On GitHub: enable branch protection on `main` requiring the `CI / verify` check to pass. Not codified in-repo.

### Alternatives considered

| Option                                                                                | Pros                                                                                                         | Cons                                                                                               | Verdict                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| A. One combined workflow (`ci.yml` does verify on PRs and publish on `main`)          | Fewer files                                                                                                  | Mixes read-only PR perms with write+id-token publish perms; harder to reason about least-privilege | Rejected                                                       |
| B. **Two workflows: `ci.yml` (PR verify) + `release.yml` (changesets+OIDC) (chosen)** | Least-privilege per workflow; standard changesets pattern; easy to require `ci` as a branch-protection check | Two files                                                                                          | **Chosen**                                                     |
| C. Split `ci.yml` into 4 jobs (lint / typecheck / test / build)                       | Finer-grained status checks                                                                                  | 4× setup-node overhead; cache contention; overkill for <10 min verify                              | Rejected (deferred; can split later without spec change)       |
| D. Keep `NPM_TOKEN` secret + `NODE_AUTH_TOKEN`                                        | Works today; no npm trusted-publisher setup                                                                  | Long-lived token contradicts AGENTS.md/stack; weaker supply-chain posture                          | Rejected                                                       |
| E. `provenance` via flag only vs `publishConfig` only vs both                         | Flag is explicit in workflow; config is defense-in-depth                                                     | Config alone would also work but is invisible in workflow logs                                     | **Both** (flag in workflow + `publishConfig.provenance: true`) |

## Design

### File layout

```
.github/
  workflows/
    ci.yml        # PR verification
    release.yml   # changesets + OIDC publish
```

### `ci.yml` (sketch)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # no version — reads packageManager
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

### `release.yml` (sketch)

```yaml
name: Release
on:
  push:
    branches: [main]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # no version — reads packageManager
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Create Release Pull Request or Publish to npm
        uses: changesets/action@v1
        with:
          version: pnpm changeset version
          publish: pnpm publish --provenance
          commit: "chore: version packages"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Pinning: `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `changesets/action@v1` — major-pinned per ecosystem convention; Dependabot can bump.

### `package.json` diff

```diff
  "publishConfig": {
-   "access": "public"
+   "access": "public",
+   "provenance": true
  },
```

No new dependencies. No `NPM_TOKEN` in workflows.

## Edge cases & failure modes

- **Fork PRs cannot publish.** `release.yml` only triggers on `push` to `main` in the upstream repo; forks never satisfy `push: branches: [main]` on upstream. The `contents: write` / `id-token: write` permissions are also unavailable on fork PRs.
- **No changeset present.** `changesets/action` opens no PR and publishes nothing — workflow succeeds with "No changed packages". This is the normal idle state on `main`.
- **OIDC trusted publisher not configured on npm.** Publish step fails with `403 / trusted publishing not configured`. Fix is the one-time manual setup on npmjs.org (documented in spec + ROADMAP notes). No workflow change needed.
- **Provenance requires registry-url.** `actions/setup-node` with `registry-url` writes the OIDC-aware `.npmrc`; without it `pnpm publish --provenance` would lack the registry context and provenance would be skipped.
- **Concurrent pushes to `main`.** `concurrency.group: release-${{ github.ref }}` + `cancel-in-progress: false` serializes releases; the second run queues rather than cancels.
- **`pnpm verify` is the whole gate.** If any sub-gate fails (lint, typecheck, coverage threshold <90/85, size budget, publint), `ci.yml` fails and (once branch protection is enabled) blocks merge.
- **Node version drift.** Workflows pin Node 22 (current LTS at spec time) to match local `.nvmrc`/engines `>=18`. Bumping Node is a one-line change in both workflows; no matrix needed now.
- **`packageManager` field is single source of truth.** `pnpm/action-setup@v4` with no `version` input reads `packageManager: pnpm@11.24.0` — prevents `ERR_PNPM_BAD_PM_VERSION` (mismatch between `version: 11` in workflow and `11.24.0` in `package.json` that caused simultaneous CI+Release failures).

## Acceptance criteria

- [ ] `docs/specs/phase-10-cicd.md` exists and is marked implemented.
- [ ] `.github/workflows/ci.yml` runs `pnpm verify` on `pull_request`→`main` and `push`→`main`, with `contents: read`, concurrency/cancel, pnpm 11 + Node 22 + frozen lockfile.
- [ ] `.github/workflows/release.yml` triggers only on `push`→`main`, has `contents: write` + `pull-requests: write` + `id-token: write`, uses `changesets/action@v1` with `version: pnpm changeset version` and `publish: pnpm publish --provenance`, depends on `GITHUB_TOKEN` only (no `NPM_TOKEN`), and sets `registry-url`.
- [ ] `package.json:publishConfig.provenance` is `true`; `publint` still exits clean and `pnpm pack` still contains only `dist/**` + `package.json` + `README.md` + `LICENSE`.
- [ ] Workflows are valid YAML and use pinned major action versions (`checkout@v4`, `pnpm/action-setup@v4`, `setup-node@v4`, `changesets/action@v1`).
- [ ] `pnpm verify` green locally (format → lint → typecheck → test:coverage (≥90/85) → build → size → lint:pkg).
- [ ] `docs/ROADMAP.md` Phase 10 marked done; `AGENTS.md` unchanged (no new commands).

## Validation gate

`pnpm verify` green plus manual workflow inspection (`actionlint` or `yamllint` if available; otherwise `node --check` on YAML structure and `pnpm lint:pkg` for package correctness). No publish is performed locally. After merge, the live validation is: open a dummy PR → CI passes; merge a changeset → release workflow opens a Version Packages PR → merging it publishes with provenance (observed on npm).
