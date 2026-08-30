---
"server-active-indicator": minor
---

Subscriber error isolation; `successDisplayMs` moved to React layer; `sideEffects` corrected.

- fix(core): a throwing subscriber in `setSnapshot` is now isolated via per-listener `try/catch` — subsequent subscribers in the same engine still receive state updates; errors are reported via `console.error` rather than propagated. Previously, one bad subscriber could abort the entire notification loop.
- fix(core): remove `successDisplayMs` from `MonitorConfig` and `DEFAULT_CONFIG` — it was a presentation-only value the engine never read, and its presence misled vanilla-JS consumers. The prop is re-declared on `ServerStatusProps` with a local `DEFAULT_SUCCESS_DISPLAY_MS = 2_500` constant. `<ServerStatus successDisplayMs={…}>` continues to work unchanged; `createMonitor({ successDisplayMs: … })` is now a TypeScript error.
- fix(pkg): correct `sideEffects` from `false` to `["./dist/react/*"]` — the React subpath injects a `<style>` element into `document.head`, which is a genuine DOM side effect that aggressive bundlers must not tree-shake.
