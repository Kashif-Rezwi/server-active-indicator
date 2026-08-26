import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without vitest globals, React Testing Library's auto-cleanup doesn't
// self-register — unmount every rendered tree so monitor handles (and their
// registry references) are released after each test.
afterEach(() => {
  cleanup();
});
