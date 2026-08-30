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
 * Combines the per-attempt timeout with the caller's abort signal. Requires the
 * evergreen `AbortSignal.timeout`/`AbortSignal.any` pair (all evergreen browsers
 * since 2023–24; Node ≥ 20.3) — no manual fallback for older runtimes.
 */
function combineSignals(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;
}

/**
 * Default health-check strategy: plain GET with `no-store`, success = `res.ok` (or
 * user `validate`). Never rejects — every failure resolves to a `CheckOutcome` (research §9).
 */
export async function defaultCheck(
  config: ResolvedRequestConfig,
  callerSignal?: AbortSignal,
): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetch(config.healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: combineSignals(config.timeout, callerSignal),
      headers: config.headers,
      credentials: config.credentials,
    });
  } catch {
    if (callerSignal?.aborted) return ABORTED;
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
