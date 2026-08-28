---
"server-active-indicator": minor
---

Remove the IIFE bundle (`dist/server-active-indicator.iife.global.js`) and the `unpkg`/`jsdelivr` package fields.

**Breaking for `<script>`-tag (CDN) users:** the floating unpkg/jsDelivr URLs (`https://unpkg.com/server-active-indicator/dist/server-active-indicator.iife.global.js`) will 404 after this release. Pin an older version if you load the package via a script tag, or migrate to a bundler / ESM import (`import { createMonitor } from "server-active-indicator"`). The IIFE build served core-only usage, which is not viable for a library whose primary entry has a React peer dependency.

Also drop the meaningless `engines` field (this package runs in browsers; the Node constraint only ever applied to dev tooling), and slightly change engine internals: each health-check attempt now emits a single snapshot (attempt counter included) instead of two, and `elapsedSeconds` resets to `0` on transition to `active`. Snapshot values are unchanged; only the delivery is consolidated.
