import type { CheckResult } from "./types";

/** Sentinel for "the caller aborted this attempt" — never a state change. */
export const ABORTED: unique symbol = Symbol("server-active-indicator.aborted");
export type CheckOutcome = CheckResult | typeof ABORTED;

interface ResolvedRequestConfig {
  healthUrl: string;
  timeout: number;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  validate?: (res: Response) => boolean;
}

interface CombinedSignal {
  signal: AbortSignal | undefined;
  /** Release the fallback timer/listener. No-op on the native path. */
  cleanup: () => void;
}

const noop = (): void => {};

/**
 * Combines the per-attempt timeout with the caller's abort signal.
 *
 * Native path: `AbortSignal.timeout` + `AbortSignal.any`. Fallback path: a
 * manual `AbortController` + `setTimeout` pair — `AbortSignal.any` only exists
 * on Chrome 116+ / Safari 17.4+ / Firefox 124+, and the indicator must keep
 * working on older browsers (pre-2024 iOS Safari is still a meaningful
 * installed base) instead of throwing the engine into a stuck state.
 */
function combineSignals(timeoutMs: number, callerSignal?: AbortSignal): CombinedSignal {
  if (
    typeof AbortSignal.timeout === "function" &&
    (callerSignal === undefined || typeof AbortSignal.any === "function")
  ) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return {
      signal: callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal,
      cleanup: noop,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

/**
 * Default health-check strategy: a plain GET with `no-store`, success = `res.ok`
 * (or the user's `validate`). Never parses the body — and never rejects: every
 * failure mode resolves to a `CheckOutcome` so the engine can always settle.
 *
 * Classification follows docs/research/research-report.md §9:
 * - 2xx          → ok
 * - 3xx          → request-failed by default (`res.ok` is 200–299). If your
 *                  health endpoint may redirect, provide `validate: r => r.ok || (r.status >= 300 && r.status < 400)` or `r.status < 400`.
 *                  Render's own health probe accepts 2xx/3xx but the default stays strict.
 * - 4xx          → http-error   (won't fix itself by waking → fast-path to offline)
 * - 5xx          → request-failed (incl. Railway's documented 502-on-wake)
 * - throw/CORS/DNS/timeout-abort → request-failed
 * - caller abort → ABORTED (superseded/unmounted; caller decides what to do)
 */
export async function defaultCheck(
  config: ResolvedRequestConfig,
  callerSignal?: AbortSignal,
): Promise<CheckOutcome> {
  if (typeof fetch !== "function") {
    return { ok: false, reason: "request-failed" };
  }

  // Combine the per-attempt timeout with the caller's abort signal. If even
  // the AbortController machinery is missing or broken, degrade to an
  // unsignaled fetch (no per-attempt timeout) rather than fail every attempt.
  let combined: CombinedSignal;
  try {
    combined = combineSignals(config.timeout, callerSignal);
  } catch {
    combined = { signal: undefined, cleanup: noop };
  }

  let res: Response;
  try {
    res = await fetch(config.healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: combined.signal,
      headers: config.headers,
      credentials: config.credentials,
    });
  } catch (err) {
    combined.cleanup();
    if (callerSignal?.aborted) return ABORTED;
    void err;
    return { ok: false, reason: "request-failed" };
  }
  combined.cleanup();

  const ok = config.validate ? safeValidate(config.validate, res) : res.ok;
  if (ok) return { ok: true, status: res.status };
  // 4xx on a health endpoint is a misconfiguration, not a cold start.
  const reason = res.status >= 400 && res.status < 500 ? "http-error" : "request-failed";
  return { ok: false, reason, status: res.status };
}

function safeValidate(validate: (res: Response) => boolean, res: Response): boolean {
  try {
    return validate(res);
  } catch {
    return false;
  }
}
