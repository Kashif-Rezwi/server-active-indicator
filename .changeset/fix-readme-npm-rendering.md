---
"server-active-indicator": patch
---

Fix the README as rendered on npmjs.com: the demo GIF and all repository links used repo-relative paths, which npm cannot resolve (the demo image was broken and repo links 404'd). They now use absolute URLs pinned to the repository, and an npm version badge was added.
