---
"server-active-indicator": minor
---

Require modern runtimes: drop the internal degradation fallbacks for environments without `AbortSignal.timeout`/`AbortSignal.any` (pre-2023–24 browsers) and the missing-`fetch` guard for Node < 18. No public API change — every config and behavior is identical on evergreen browsers; the core bundle shrinks and the health-check path is simpler. SSR health checks need Node ≥ 20.3.
