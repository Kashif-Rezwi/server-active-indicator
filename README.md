# server-active-indicator

> A tiny, framework-agnostic client-side status indicator for backends that sleep — tells users your app is waking up instead of looking broken.

**Your frontend loads. Your backend doesn't. Tell the user why.**

Built for free-tier deployments on Render, Railway, Fly.io, Koyeb, and any cold-starting API.

---

🚧 **Work in progress** — this package is under active development. See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased build plan and [docs/research/](docs/research/) for the research and architecture decisions behind it.

## Status

| Phase                                 | State   |
| ------------------------------------- | ------- |
| Phase 0 — Research & repository setup | ✅ Done |
| Phase 1 — Architecture & scaffold     | 🔜 Next |

## Why this exists

Frontend apps on free-tier hosting (e.g. Render) load instantly from a CDN while the backend may be spun down after inactivity. The first API request can hang for up to a minute while the service wakes — and nothing in the UI explains why. Users assume the app is broken.

This package detects that state and communicates it honestly: _"The server is starting up — this can take up to a minute on first visit."_

## License

[MIT](LICENSE)
