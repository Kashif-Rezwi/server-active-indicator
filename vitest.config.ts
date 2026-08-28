import { defineConfig } from "vitest/config";

/**
 * Coverage gate (Phase 6): ≥90% on `src/core/` per AGENTS.md — branches at 85% because
 * the remaining gap is SSR defensive branches we deliberately don't assert on.
 */
const coreThreshold = {
  // POSIX-ish glob; matched against the relative file path.
  "src/core/**/*.ts": {
    lines: 90,
    functions: 90,
    statements: 90,
    branches: 85,
  },
};

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Per-glob thresholds (Vitest 4): the `src/core/**` gate is the meaningful
      // one; `src/react/**` and `src/index.ts` are excluded by glob scope.
      thresholds: coreThreshold,
    },
  },
});
