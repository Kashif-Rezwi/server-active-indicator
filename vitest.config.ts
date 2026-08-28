import { defineConfig } from "vitest/config";

/**
 * Coverage gate (Phase 6): ≥90% on `src/core/` is the definition of
 * "confidence to publish" per AGENTS.md. Branches sit at 85% because
 * the remaining gap is `typeof document === "undefined"` SSR defensive
 * branches that we explicitly do NOT want to assert on.
 *
 * `pnpm test` runs without coverage (fast feedback). `pnpm test:coverage`
 * and `pnpm verify` enforce the gate.
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
      // Per-glob thresholds (Vitest 4 supports `thresholds` as a record).
      // The `src/core/**` gate is the meaningful one; everything else
      // (`src/react/**`, `src/index.ts`) is excluded by
      // glob scope rather than by per-file numbers.
      thresholds: coreThreshold,
    },
  },
});
