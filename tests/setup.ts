import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { __engineCount } from "../src/core/registry";

// jsdom has no canvas backend; axe-core probes getContext() during its color-
// contrast pass and jsdom logs "Not implemented" noise for every call. The stub
// keeps the behavior (null → axe skips canvas checks) without the noise.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;

afterEach(() => {
  // Without vitest globals, RTL's auto-cleanup doesn't self-register — unmount
  // every rendered tree so monitor handles are released after each test.
  cleanup();

  // Uniform leak guard for every suite: an engine left in the shared registry
  // fails the test that leaked it instead of a confusingly-failing later test.
  const leaked = __engineCount();
  if (leaked !== 0) {
    throw new Error(`leaked ${leaked} engine(s) into the registry`);
  }
});
