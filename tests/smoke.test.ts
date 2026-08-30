import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/index";
import { ServerStatus, ServerStatusProvider, useServerStatus } from "../src/react/index";

/**
 * Barrel smoke: the named imports above are themselves the resolution assertion
 * (ESM import throws on a missing export) — behavior is covered by the dedicated
 * suites. The only value-add here is pinning the locked defaults verbatim, since
 * they are a published contract (AGENTS.md locked decisions).
 */
describe("package entries", () => {
  it("core entry exposes the locked defaults", () => {
    expect(DEFAULT_CONFIG).toEqual({
      timeout: 10_000,
      revealDelay: 3_000,
      pollInterval: 5_000,
      offlineAfter: 60_000,
      activeCheckInterval: 0,
      pauseWhenHidden: true,
      backoffFactor: 1.5,
      backoffCap: 15_000,
    });
  });

  it("react entry exposes hook, provider, and default UI", () => {
    // Existence-only by design: any deeper assertion here would duplicate the
    // behavior suites; a barrel smoke proves "the export is there".
    expect(useServerStatus).toBeDefined();
    expect(ServerStatusProvider).toBeDefined();
    expect(ServerStatus).toBeDefined();
  });
});
