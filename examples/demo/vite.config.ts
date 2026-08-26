import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local dev dogfoods the library source directly (no build step needed).
// For the deployed demo, install the published package instead and delete
// the alias — see README ("Deploy").
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-active-indicator/react": fileURLToPath(
        new URL("../../src/react/index.ts", import.meta.url),
      ),
      "server-active-indicator": fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    },
  },
});
