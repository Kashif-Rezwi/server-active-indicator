import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without vitest globals, RTL's auto-cleanup doesn't self-register — unmount
// every rendered tree so monitor handles are released after each test.
afterEach(() => {
  cleanup();
});
