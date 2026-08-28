# Development workflow

Two gears, not bureaucracy. Pick the smallest gear that fits the change.

## Quick gear — small changes

Use when: ≤3 files touched, no public API / data model / infra change, trivially reversible. Examples: typo fixes, copy tweaks, internal refactors, test additions, dependency bumps.

1. Make the change.
2. Run `pnpm verify` (format:check → lint → typecheck → test:coverage with `src/core/**` 90/90/90/85 gate → build → size → lint:pkg).
3. Commit with a conventional-commit message.

## Full gear — features & architecture

Use when: touching >3 files, public API, the state machine, build/CI infra, or anything not trivially reversible. All roadmap phases (see `docs/ROADMAP.md`) run in full gear.

1. **Spec first.** Copy `docs/specs/_template.md` to `docs/specs/<phase-or-feature>.md` and fill it. If the approach is ambiguous, write down at least two options with a trade-off table and pick one before coding.
2. **Decisions of record.** Anything that changes a locked decision in `AGENTS.md` needs an ADR (`docs/adr/_template.md`).
3. **Implement** against the spec. Keep commits small and scoped.
4. **Verify.** `pnpm verify` green is the definition of done. Coverage gate: ≥90% lines/functions/statements and ≥85% branches on `src/core/**` (enforced in `vitest.config.ts`).
5. **Close the loop.** Update the checkbox in `docs/ROADMAP.md`, the spec status, and any docs affected. Request review at the phase gate before starting the next phase.

## Definition of done

- `pnpm verify` green (all layers actually ran — never claim a skipped layer passed).
- Public API changes are reflected in types, docs, and (from Phase 9) a changeset.
- No state or copy that the browser cannot honestly support (see AGENTS.md, locked decision 2).

## Releases

Releases are changesets-driven only: feature branches merge to `main`, the changesets action opens/updates a release PR, merging it publishes to npm via OIDC trusted publishing with provenance. Never `npm publish` by hand; never push version tags manually.
