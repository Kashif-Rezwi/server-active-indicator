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

/**
 * Default health-check strategy: a plain GET with `no-store`, success = `res.ok`
 * (or the user's `validate`). Never parses the body.
 *
 * Classification follows docs/research/research-report.md §9:
 * - 2xx          → ok
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

  // Combine the per-attempt timeout with the caller's abort signal.
  const timeoutSignal = AbortSignal.timeout(config.timeout);
  const signal = callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(config.healthUrl, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: config.headers,
      credentials: config.credentials,
    });
  } catch (err) {
    if (callerSignal?.aborted) return ABORTED;
    void err;
    return { ok: false, reason: "request-failed" };
  }

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
