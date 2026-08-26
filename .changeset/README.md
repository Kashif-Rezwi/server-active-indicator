# Changesets

This repo uses [changesets](https://github.com/changesets/changesets) for
versioning and changelogs. To record a user-facing change:

```bash
pnpm changeset        # opens the changeset prompt, writes a markdown file here
```

The release workflow (Phase 10) consumes these files: it opens a release PR
that bumps the version and updates the changelog; merging it publishes to npm
via OIDC trusted publishing. Never `npm publish` by hand.
