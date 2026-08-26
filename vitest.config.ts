import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        // Enforced meaningfully from Phase 3 (core engine) onward.
        lines: 0,
      },
    },
  },
});
