import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Read version from the root package.json — the single source of truth.
// Changesets bumps this automatically, so the demo always reflects the
// published version without any manual step.
const { version } = require("../package.json") as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    // Injected as a compile-time string literal — zero runtime cost.
    __PKG_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "server-active-indicator/react": path.resolve(__dirname, "../src/react/index.ts"),
      "server-active-indicator": path.resolve(__dirname, "../src/index.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
