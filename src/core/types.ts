/**
 * Core public types for server-active-indicator.
 *
 * Locked decisions (see docs/research/research-report.md §4–§8):
 * - Exactly five user-visible states. There is deliberately no `sleeping` state —
 *   a browser cannot distinguish sleeping from slow or unreachable.
 * - `revealDelay` (when UI appears) and `timeout` (per-attempt ceiling) are
 *   separate concepts. Do not merge them.
 */

/** The five user-visible states of the backend monitor. */
export type ServerStatus = "unknown" | "checking" | "waking" | "active" | "offline";

/** Why a check is not succeeding. Developer-facing detail, never user-facing claims. */
export type FailureReason = "slow-response" | "request-failed" | "http-error";

/** Result contract for custom health checks. */
export interface CheckResult {
  /** Whether the backend responded healthy. */
  ok: boolean;
  /** Optional detail about the failure mode. */
  reason?: FailureReason;
  /** HTTP status code, when the check was an HTTP request. */
  status?: number;
}

/** Configuration accepted by the core monitor. All fields except the check source are optional. */
export interface MonitorConfig {
  /** URL of a lightweight health endpoint (e.g. `https://api.example.com/health`). */
  healthUrl?: string;
  /** Custom health check; overrides `healthUrl` when provided. */
  check?: () => Promise<boolean | CheckResult>;
  /** Per-attempt ceiling in ms. Default: 10_000. Bounds every attempt —
   *  `healthUrl` requests (via an abort signal) and custom `check` calls
   *  (via a timeout race) alike, so a hung check can never wedge the engine. */
  timeout?: number;
  /** Show `waking` only if a check stays unresolved this long (ms). Default: 3_000. */
  revealDelay?: number;
  /** Interval between attempts while `waking` (ms). Default: 5_000. */
  pollInterval?: number;
  /** Give up on `waking` and declare `offline` after this much elapsed time (ms). Default: 60_000. */
  offlineAfter?: number;
  /** How long the `active` confirmation stays visible (ms). Default: 2_500.
   *  Presentation-only: the engine never reads it — it is applied by the
   *  default `<ServerStatus>` UI, so set it on the component's props (not on
   *  `<ServerStatusProvider>`, where it has no effect). */
  successDisplayMs?: number;
  /** Opt-in periodic re-check while `active` to detect re-sleep (ms). Default: 0 (off). */
  activeCheckInterval?: number;
  /** Pause checks while the tab is hidden. Default: true. */
  pauseWhenHidden?: boolean;
  /** Extra request headers (opt-in; none sent by default). */
  headers?: Record<string, string>;
  /** Fetch credentials mode (opt-in; omitted by default). */
  credentials?: RequestCredentials;
  /** Custom response validator, e.g. to reject degraded bodies. Default: `res.ok`. */
  validate?: (res: Response) => boolean;
  /** Explicit registry key. Required to share an engine across consumers when using a
   *  custom `check` or custom `validate` (functions aren't serializable). Ignored for
   *  plain `healthUrl` configs. */
  key?: string;
  /** Multiplier applied to the retry delay after each consecutive failure. Default: 1.5.
   *  Set to 1 for flat polling. */
  backoffFactor?: number;
  /** Upper bound for the retry delay (ms). Default: 15_000. */
  backoffCap?: number;
}

/** Immutable snapshot of monitor state, emitted to subscribers. */
export interface MonitorSnapshot {
  status: ServerStatus;
  reason?: FailureReason;
  /** Seconds elapsed since the current `waking` episode began. */
  elapsedSeconds: number;
  /** Epoch ms of the last completed check, or null before the first one. */
  lastCheckedAt: number | null;
  /** Number of attempts made in the current episode. */
  attempts: number;
  /** Whether the current episode passed through `waking`. Drives the "recovery
   *  confirmation only after a cold start, silence on warm start" UI policy. */
  wasCold: boolean;
  /** Latency of the last completed attempt in ms, or null before the first one. */
  lastLatencyMs: number | null;
  /** Distinguishes "backend unreachable" from "the browser itself is offline". */
  offlineKind?: "server" | "browser";
}
