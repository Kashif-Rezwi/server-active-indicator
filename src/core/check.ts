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
 * Combines the per-attempt timeout with the caller's abort signal; falls back to
 * a manual controller + timer where `AbortSignal.any` is unavailable (pre-2024).
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
 * Default health-check strategy: plain GET with `no-store`, success = `res.ok` (or
 * user `validate`). Never rejects — every failure resolves to a `CheckOutcome` (research §9).
 */
export async function defaultCheck(
  config: ResolvedRequestConfig,
  callerSignal?: AbortSignal,
): Promise<CheckOutcome> {
  if (typeof fetch !== "function") {
    return { ok: false, reason: "request-failed" };
  }

  // If even the AbortController machinery is missing, degrade to an unsignaled
  // fetch (no per-attempt timeout) rather than fail every attempt.
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
