import { ABORTED, defaultCheck } from "./check";
import type { CheckOutcome } from "./check";
import { DEFAULT_CONFIG } from "./defaults";
import type { FailureReason, MonitorConfig, MonitorSnapshot } from "./types";

/** Internal engine interface — the shared, ref-counted health loop. */
export interface Engine {
  getSnapshot(): MonitorSnapshot;
  subscribe(listener: (snapshot: MonitorSnapshot) => void): () => void;
  refresh(): void;
  destroy(): void;
}

export type ResolvedConfig = Required<
  Pick<
    MonitorConfig,
    | "timeout"
    | "revealDelay"
    | "pollInterval"
    | "offlineAfter"
    | "successDisplayMs"
    | "activeCheckInterval"
    | "pauseWhenHidden"
    | "backoffFactor"
    | "backoffCap"
  >
> &
  MonitorConfig;

export function resolveConfig(config: MonitorConfig): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
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
 * The shared health engine. One instance per unique effective config (see registry).
 * Owns the state machine, timers, backoff, visibility and active-interval policies.
 *
 * Internal — consumers get a per-handle `Monitor` from `createMonitor`.
 */
export function createEngine(config: MonitorConfig, random: () => number = Math.random): Engine {
  if (!config.healthUrl && !config.check) {
    throw new Error(
      "server-active-indicator: createMonitor requires either `healthUrl` or a custom `check` function.",
    );
  }
  const cfg = resolveConfig(config);

  let snapshot: MonitorSnapshot = { ...INITIAL_SNAPSHOT, status: "checking" };
  const listeners = new Set<(s: MonitorSnapshot) => void>();

  let destroyed = false;
  let attemptController: AbortController | null = null;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let activeTimer: ReturnType<typeof setInterval> | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let episodeStartAt: number | null = null;
  let inFlight = false;
  let consecutiveFailures = 0;

  const setSnapshot = (patch: Partial<MonitorSnapshot>) => {
    if (destroyed) return;
    snapshot = { ...snapshot, ...patch };
    for (const l of listeners) l(snapshot);
  };

  const clearAttemptTimers = () => {
    if (revealTimer) clearTimeout(revealTimer);
    if (pollTimer) clearTimeout(pollTimer);
    revealTimer = pollTimer = null;
  };

  const stopActiveTimer = () => {
    if (activeTimer) clearInterval(activeTimer);
    activeTimer = null;
  };

  const ensureElapsedTicker = () => {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(() => {
      if (destroyed || snapshot.status !== "waking" || episodeStartAt === null) return;
      setSnapshot({ elapsedSeconds: Math.floor((Date.now() - episodeStartAt) / 1000) });
    }, 1_000);
  };

  const runCheck = (): Promise<CheckOutcome> => {
    if (config.check) return runCustomCheck(config.check);
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

  /** Backoff delay for the next retry, jittered ±20%. */
  const nextDelay = () => {
    const base = Math.min(
      cfg.pollInterval * Math.pow(cfg.backoffFactor, Math.max(0, consecutiveFailures - 1)),
      cfg.backoffCap,
    );
    return base * (0.8 + random() * 0.4);
  };

  const scheduleNext = () => {
    if (destroyed) return;
    const elapsed = episodeStartAt === null ? 0 : Date.now() - episodeStartAt;
    if (elapsed >= cfg.offlineAfter) {
      setSnapshot({ status: "offline", offlineKind: "server" });
      return;
    }
    pollTimer = setTimeout(() => void attempt(), nextDelay());
  };

  const onResult = (outcome: CheckOutcome, latencyMs: number) => {
    inFlight = false;
    if (destroyed || outcome === ABORTED) return;

    if (outcome.ok) {
      clearAttemptTimers();
      episodeStartAt = null;
      consecutiveFailures = 0;
      setSnapshot({
        status: "active",
        reason: undefined,
        lastCheckedAt: Date.now(),
        lastLatencyMs: latencyMs,
        offlineKind: undefined,
      });
      scheduleActiveInterval();
      return;
    }

    const reason: FailureReason = outcome.reason ?? "request-failed";
    if (reason === "http-error") {
      clearAttemptTimers();
      stopActiveTimer();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "server" });
      return;
    }
    if (isBrowserOffline()) {
      clearAttemptTimers();
      stopActiveTimer();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "browser" });
      return;
    }
    // request-failed (5xx / network / timeout): not healthy → waking, keep polling.
    if (episodeStartAt === null) episodeStartAt = Date.now();
    consecutiveFailures += 1;
    setSnapshot({ status: "waking", wasCold: true, reason, lastCheckedAt: Date.now() });
    scheduleNext();
  };

  const attempt = async () => {
    if (destroyed || inFlight) return;
    if (cfg.pauseWhenHidden && isDocumentHidden()) return; // resume on visibilitychange
    inFlight = true;
    attemptController = new AbortController();
    const started = Date.now();

    if (isBrowserOffline()) {
      inFlight = false;
      clearAttemptTimers();
      stopActiveTimer();
      setSnapshot({
        status: "offline",
        reason: "request-failed",
        offlineKind: "browser",
        lastCheckedAt: Date.now(),
      });
      return;
    }

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

  const scheduleActiveInterval = () => {
    stopActiveTimer();
    if (cfg.activeCheckInterval <= 0) return;
    activeTimer = setInterval(() => {
      if (destroyed || snapshot.status !== "active") return;
      if (cfg.pauseWhenHidden && isDocumentHidden()) return;
      void attempt();
    }, cfg.activeCheckInterval);
  };

  const onVisibilityChange = () => {
    if (destroyed || !cfg.pauseWhenHidden) return;
    if (isDocumentHidden()) {
      // Cancel pending poll; in-flight attempt may resolve but won't schedule while hidden.
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      return;
    }
    // Visible again: fresh check if we're mid-episode; resume active-interval.
    if (snapshot.status === "waking" || snapshot.status === "checking") {
      void attempt();
    } else if (snapshot.status === "active") {
      scheduleActiveInterval();
    }
  };

  const attachVisibility = () => {
    if (!cfg.pauseWhenHidden || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", onVisibilityChange);
  };
  const detachVisibility = () => {
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const engine: Engine = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      if (destroyed || inFlight) return;
      clearAttemptTimers();
      stopActiveTimer();
      episodeStartAt = null;
      consecutiveFailures = 0;
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
      clearAttemptTimers();
      stopActiveTimer();
      if (elapsedTimer) clearInterval(elapsedTimer);
      detachVisibility();
      attemptController?.abort();
      listeners.clear();
    },
  };

  ensureElapsedTicker();
  attachVisibility();
  void attempt();

  return engine;
}
