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

  it("core entry exposes createMonitor", () => {
    expect(typeof createMonitor).toBe("function");
    // Requires a check source; behavior is validated in tests/monitor.test.ts.
    expect(() => createMonitor({})).toThrow(/healthUrl.*check/);
  });

  it("react entry exposes the public API (hook + provider + default UI)", () => {
    expect(typeof useServerStatus).toBe("function");
    expect(typeof ServerStatusProvider).toBe("function");
    expect(typeof ServerStatus).toBe("function");
    // Behavior is covered by tests/use-server-status.test.tsx and
    // tests/server-status.test.tsx under React Testing Library.
  });
});
