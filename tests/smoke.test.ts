import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, createMonitor } from "../src/index";
import { ServerStatus, ServerStatusProvider, useServerStatus } from "../src/react/index";

describe("package entries", () => {
  it("core entry exposes the locked defaults", () => {
    expect(DEFAULT_CONFIG).toEqual({
      timeout: 10_000,
      revealDelay: 3_000,
      pollInterval: 5_000,
      offlineAfter: 60_000,
      successDisplayMs: 2_500,
      activeCheckInterval: 0,
      pauseWhenHidden: true,
      backoffFactor: 1.5,
      backoffCap: 15_000,
    });
  });

  it("core entry exposes createMonitor (implemented in Phase 2)", () => {
    expect(typeof createMonitor).toBe("function");
    // Requires a check source; validated for real in tests/monitor.test.ts.
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
  });

  it("react entry exposes the public API (hook + provider live; UI lands in Phase 5)", () => {
    expect(typeof useServerStatus).toBe("function");
    expect(typeof ServerStatusProvider).toBe("function");
    expect(typeof ServerStatus).toBe("function");
    // The hook is a React hook — its behavior is covered by
    // tests/use-server-status.test.tsx under React Testing Library.
    expect(() => ServerStatus({ healthUrl: "https://example.com/health" })).toThrow(
      /not implemented yet \(Phase 5\)/,
    );
  });
});
