import { defineConfig } from "vitest/config";

/**
 * Coverage gate per AGENTS.md: ≥90% on `src/core/` (branches 85%). The remaining
 * branch gap is deliberate: defensive degradation branches for runtimes we no
 * longer simulate (pre-2024 `AbortSignal.any`/`.timeout` fallbacks, the
 * missing-fetch and AbortController guards in check.ts/engine.ts) and the
 * engine's unreachable-today settle-safety catch.
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
    // Centralized mock hygiene: spies, mock call history, and global stubs are
    // reset before each test, so a forgotten per-file afterEach can't leak a
    // mock into an unrelated test.
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Re-export barrels and type-only modules carry no executable logic —
      // exclude them so the "All files" row stays meaningful.
      exclude: ["src/index.ts", "src/react/index.ts", "src/core/types.ts"],
      // Per-glob thresholds (Vitest 4): the `src/core/**` gate is the meaningful
      // one; `src/react/**` is not gated.
      thresholds: coreThreshold,
    },
  },
});
