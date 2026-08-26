import type { MonitorConfig } from "./types";

/**
 * Locked defaults (docs/research/research-report.md §8).
 * The 3s / 5s / 2.5s values are battle-tested in production in the original
 * code-review-agent implementation; `offlineAfter` and the raised `timeout`
 * fix its two known flaws ("waking forever", 3s per-attempt ceiling).
 */
export const DEFAULT_CONFIG = {
  timeout: 10_000,
  revealDelay: 3_000,
  pollInterval: 5_000,
  offlineAfter: 60_000,
  successDisplayMs: 2_500,
  activeCheckInterval: 0,
  pauseWhenHidden: true,
} as const satisfies Required<
  Pick<
    MonitorConfig,
    | "timeout"
    | "revealDelay"
    | "pollInterval"
    | "offlineAfter"
    | "successDisplayMs"
    | "activeCheckInterval"
    | "pauseWhenHidden"
  >
>;
