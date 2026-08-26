import { ABORTED, defaultCheck } from "./check";
import type { CheckOutcome } from "./check";
import { DEFAULT_CONFIG } from "./defaults";
import type { FailureReason, MonitorConfig, MonitorSnapshot } from "./types";

/** A running monitor instance returned by `createMonitor`. */
export interface Monitor {
  /** Current state snapshot. */
  getSnapshot(): MonitorSnapshot;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (snapshot: MonitorSnapshot) => void): () => void;
  /** Trigger an immediate check (single-flight: concurrent calls share one request). */
  refresh(): void;
  /** Stop all timers/requests and release the engine. */
  destroy(): void;
}

type ResolvedConfig = Required<
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
> &
  MonitorConfig;

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function runCustomCheck(check: NonNullable<MonitorConfig["check"]>): Promise<CheckOutcome> {
  try {
    const r = await check();
    return typeof r === "boolean" ? { ok: r } : r;
  } catch {
    return { ok: false, reason: "request-failed" };
  }
}

const INITIAL_SNAPSHOT: MonitorSnapshot = {
  status: "unknown",
  elapsedSeconds: 0,
  lastCheckedAt: null,
  attempts: 0,
  wasCold: false,
  lastLatencyMs: null,
};

/**
 * Creates the health monitor for a given config and starts the first check.
 *
 * Phase 2 scope: single engine, framework-free state machine + poll loop.
 * Phase 3 wraps this in the shared registry (dedup), backoff, and
 * visibility/active-interval policies — the public surface above is stable.
 */
export function createMonitor(config: MonitorConfig): Monitor {
  if (!config.healthUrl && !config.check) {
    throw new Error(
      "server-active-indicator: createMonitor requires either `healthUrl` or a custom `check` function.",
    );
  }
  const cfg: ResolvedConfig = { ...DEFAULT_CONFIG, ...config };

  let snapshot: MonitorSnapshot = { ...INITIAL_SNAPSHOT, status: "checking" };
  const listeners = new Set<(s: MonitorSnapshot) => void>();

  let destroyed = false;
  let attemptController: AbortController | null = null;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let episodeStartAt: number | null = null;
  let inFlight = false;

  const setSnapshot = (patch: Partial<MonitorSnapshot>) => {
    if (destroyed) return;
    snapshot = { ...snapshot, ...patch };
    for (const l of listeners) l(snapshot);
  };

  const clearTimers = () => {
    if (revealTimer) clearTimeout(revealTimer);
    if (pollTimer) clearTimeout(pollTimer);
    revealTimer = pollTimer = null;
  };

  const ensureElapsedTicker = () => {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(() => {
      if (destroyed || snapshot.status !== "waking" || episodeStartAt === null) return;
      setSnapshot({ elapsedSeconds: Math.floor((Date.now() - episodeStartAt) / 1000) });
    }, 1_000);
  };

  const runCheck = (): Promise<CheckOutcome> => {
    if (config.check) {
      return runCustomCheck(config.check);
    }
    return defaultCheck(
      {
        healthUrl: cfg.healthUrl!,
        timeout: cfg.timeout,
        headers: cfg.headers,
        credentials: cfg.credentials,
        validate: cfg.validate,
      },
      attemptController?.signal,
    );
  };

  const scheduleNext = () => {
    if (destroyed) return;
    const elapsed = episodeStartAt === null ? 0 : Date.now() - episodeStartAt;
    if (elapsed >= cfg.offlineAfter) {
      setSnapshot({ status: "offline", offlineKind: "server" });
      return;
    }
    pollTimer = setTimeout(() => void attempt(), cfg.pollInterval);
  };

  const onResult = (outcome: CheckOutcome, latencyMs: number) => {
    inFlight = false;
    if (destroyed || outcome === ABORTED) return;

    if (outcome.ok) {
      clearTimers();
      episodeStartAt = null; // stop the elapsed clock; status set below freezes the ticker
      setSnapshot({
        status: "active",
        reason: undefined,
        lastCheckedAt: Date.now(),
        lastLatencyMs: latencyMs,
        offlineKind: undefined,
      });
      return;
    }

    const reason: FailureReason = outcome.reason ?? "request-failed";
    if (reason === "http-error") {
      clearTimers();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "server" });
      return;
    }
    if (isBrowserOffline()) {
      clearTimers();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "browser" });
      return;
    }
    // request-failed (5xx / network / timeout): the server is not healthy →
    // show `waking` (a failed check means "not up", per research §4; the
    // revealDelay only guards *in-flight* checks). Mark the episode cold and
    // start the episode clock, then keep polling.
    if (episodeStartAt === null) episodeStartAt = Date.now();
    setSnapshot({ status: "waking", wasCold: true, reason, lastCheckedAt: Date.now() });
    scheduleNext();
  };

  const attempt = async () => {
    if (destroyed || inFlight) return;
    inFlight = true;
    attemptController = new AbortController();
    const started = Date.now();

    if (isBrowserOffline()) {
      inFlight = false;
      clearTimers();
      setSnapshot({
        status: "offline",
        reason: "request-failed",
        offlineKind: "browser",
        lastCheckedAt: Date.now(),
      });
      return;
    }

    // Reveal `waking` if the attempt stays unresolved past revealDelay.
    revealTimer = setTimeout(() => {
      if (episodeStartAt === null) episodeStartAt = Date.now();
      setSnapshot({ status: "waking", wasCold: true, reason: "slow-response" });
    }, cfg.revealDelay);

    const outcome = await runCheck();
    const latency = Date.now() - started;
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;

    setSnapshot({ attempts: snapshot.attempts + 1 });
    onResult(outcome, latency);
  };

  const monitor: Monitor = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      if (destroyed || inFlight) return;
      // New episode.
      clearTimers();
      episodeStartAt = null;
      setSnapshot({
        status: "checking",
        wasCold: false,
        elapsedSeconds: 0,
        offlineKind: undefined,
      });
      void attempt();
    },
    destroy() {
      destroyed = true;
      clearTimers();
      if (elapsedTimer) clearInterval(elapsedTimer);
      attemptController?.abort();
      listeners.clear();
    },
  };

  ensureElapsedTicker();
  void attempt();

  return monitor;
}
