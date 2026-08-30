import type { MonitorConfig } from "./types";

/** Locked defaults (docs/research/research-report.md §8). */
export const DEFAULT_CONFIG = {
  timeout: 10_000,
  revealDelay: 3_000,
  pollInterval: 5_000,
  offlineAfter: 60_000,
  activeCheckInterval: 0,
  pauseWhenHidden: true,
  backoffFactor: 1.5,
  backoffCap: 15_000,
} as const satisfies Required<
  Pick<
    MonitorConfig,
    | "timeout"
    | "revealDelay"
    | "pollInterval"
    | "offlineAfter"
    | "activeCheckInterval"
    | "pauseWhenHidden"
    | "backoffFactor"
    | "backoffCap"
  >
>;
