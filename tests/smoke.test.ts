import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, createMonitor } from "../src/index";
import { ServerStatus, useServerStatus } from "../src/react/index";

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
    });
  });

  it("core entry exposes createMonitor (implemented in Phase 2)", () => {
    expect(typeof createMonitor).toBe("function");
    // Requires a check source; validated for real in tests/monitor.test.ts.
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
  });

  it("react entry exposes the public API (stubs until Phases 4–5)", () => {
    expect(typeof useServerStatus).toBe("function");
    expect(typeof ServerStatus).toBe("function");
    expect(() => useServerStatus({ healthUrl: "https://example.com/health" })).toThrow(
      /not implemented yet \(Phase 4\)/,
    );
  });
});
