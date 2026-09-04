---
"server-active-indicator": patch
---

Docs only: refresh the README demo GIF. The new recording is captured from the live interactive demo app (server-active-indicator.vercel.app) in a single full-page frame — dark theme only, with the integration-code panel cropped out — walking through all four scenarios: cold start (waking banner with live timer → ready confirmation → auto-dismiss), warm start (silence on success), server 503 (offline banner with Retry), and client offline (ambiguous network drop converging to offline at the `offlineAfter` cutoff). The README also now links to the interactive demo.
