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

/**
 * Custom checks are bounded by `timeout` like any other attempt: a check that
 * never settles must not wedge the engine in `waking` forever (locked
 * decision 5 — `waking` is time-bounded by `offlineAfter`, which is only
 * enforced after a *completed* attempt).
 */
async function runCustomCheck(
  check: NonNullable<MonitorConfig["check"]>,
  timeoutMs: number,
): Promise<CheckOutcome> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const r = await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("server-active-indicator: custom check timed out")),
          timeoutMs,
        );
      }),
    ]);
    return typeof r === "boolean" ? { ok: r } : r;
  } catch {
    return { ok: false, reason: "request-failed" };
  } finally {
    if (timer) clearTimeout(timer);
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

  const stopElapsedTicker = () => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  };

  const ensureElapsedTicker = () => {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(() => {
      if (destroyed || snapshot.status !== "waking" || episodeStartAt === null) return;
      setSnapshot({ elapsedSeconds: Math.floor((Date.now() - episodeStartAt) / 1000) });
    }, 1_000);
  };

  const runCheck = (): Promise<CheckOutcome> => {
    if (config.check) return runCustomCheck(config.check, cfg.timeout);
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
      stopElapsedTicker();
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
      stopElapsedTicker();
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
      stopElapsedTicker();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "server" });
      return;
    }
    if (isBrowserOffline()) {
      clearAttemptTimers();
      stopActiveTimer();
      stopElapsedTicker();
      setSnapshot({ status: "offline", reason, lastCheckedAt: Date.now(), offlineKind: "browser" });
      return;
    }
    // request-failed (5xx / network / timeout): not healthy → waking, keep polling.
    if (episodeStartAt === null) episodeStartAt = Date.now();
    consecutiveFailures += 1;
    ensureElapsedTicker();
    setSnapshot({ status: "waking", wasCold: true, reason, lastCheckedAt: Date.now() });
    scheduleNext();
  };

  const attempt = async () => {
    if (destroyed || inFlight) return;
    if (cfg.pauseWhenHidden && isDocumentHidden()) return; // resume on visibilitychange
    inFlight = true;
    try {
      attemptController = new AbortController();
    } catch {
      // Degraded environment without a working AbortController: run the
      // attempt without a caller-abort channel rather than wedging the loop.
      attemptController = null;
    }
    const started = Date.now();

    if (isBrowserOffline()) {
      inFlight = false;
      clearAttemptTimers();
      stopActiveTimer();
      stopElapsedTicker();
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
      ensureElapsedTicker();
      setSnapshot({ status: "waking", wasCold: true, reason: "slow-response" });
    }, cfg.revealDelay);

    let outcome: CheckOutcome;
    try {
      outcome = await runCheck();
    } catch {
      // Settle-safety: a check must never reject out of the engine. Any throw
      // is a failed attempt, not a dead loop (`inFlight` would otherwise stick
      // and every later attempt/refresh would silently no-op).
      outcome = { ok: false, reason: "request-failed" };
    }
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
      // Cancel pending timers while hidden; in-flight attempt may resolve but
      // scheduling is suppressed. Clearing revealTimer prevents a hidden-tab
      // promotion of checking→waking. Pausing active/elapsed intervals saves
      // wakeups and matches the "no polling while hidden" contract.
      if (revealTimer) clearTimeout(revealTimer);
      if (pollTimer) clearTimeout(pollTimer);
      revealTimer = pollTimer = null;
      if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
      }
      stopElapsedTicker();
      return;
    }
    // Visible again: fresh check or active interval. The elapsed ticker only
    // runs during waking episodes.
    if (snapshot.status === "waking" || snapshot.status === "checking") {
      if (snapshot.status === "waking") ensureElapsedTicker();
      void attempt();
    } else if (snapshot.status === "active") {
      scheduleActiveInterval();
    }
    // unknown/offline: nothing to resume — offline recovery is refresh()-driven,
    // or automatic via the window `online` event for browser-offline episodes.
  };

  const attachVisibility = () => {
    if (!cfg.pauseWhenHidden || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", onVisibilityChange);
  };
  const detachVisibility = () => {
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };

  // A browser-offline episode ends automatically: when the browser reports
  // connectivity again, re-check immediately instead of stranding the user on
  // "you appear to be offline" until a manual Retry. Server-offline stays
  // manual — the server coming back is not observable via window events.
  const onOnline = () => {
    if (destroyed) return;
    if (snapshot.status === "offline" && snapshot.offlineKind === "browser") {
      engine.refresh();
    }
  };
  const attachOnline = () => {
    if (typeof window === "undefined") return;
    window.addEventListener("online", onOnline);
  };
  const detachOnline = () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("online", onOnline);
  };

  const engine: Engine = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      if (destroyed || inFlight) return;
      // Single-flight by design: while an attempt is outstanding, a refresh is
      // a no-op — the in-flight result will land imminently.
      clearAttemptTimers();
      stopActiveTimer();
      stopElapsedTicker();
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
      stopElapsedTicker();
      detachVisibility();
      detachOnline();
      attemptController?.abort();
      listeners.clear();
    },
  };

  attachVisibility();
  attachOnline();
  void attempt();

  return engine;
}
