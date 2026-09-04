import type { CheckResult } from "server-active-indicator";

export type BackendSimulationMode =
  "cold-start" | "warm-start" | "server-error" | "browser-offline";

export type SimulatedServerState = "sleeping" | "booting" | "ready" | "crashed" | "disconnected";

export interface SimulationConfig {
  /** Simulated time (ms) for the backend to wake up in cold-start mode */
  wakeDuration: number;
  /** Simulated network latency (ms) per health check request */
  latency: number;
  /** Auto-sleep idle timeout in ms (0 = disabled) */
  autoSleepTimeout: number;
  /** Current simulation scenario */
  mode: BackendSimulationMode;
}

export interface SimulationTelemetry {
  serverState: SimulatedServerState;
  bootProgress: number; // 0 to 100
  elapsedBootSeconds: number;
  requestsReceived: number;
  lastResponseMs: number | null;
  lastRequestTimestamp: number | null;
  isBrowserOnline: boolean;
}

export interface SimulatedBackendHandle {
  config: SimulationConfig;
  updateConfig: (patch: Partial<SimulationConfig>) => void;
  telemetry: SimulationTelemetry;
  check: () => Promise<boolean | CheckResult>;
  triggerColdStart: () => void;
  triggerWarmStart: () => void;
  triggerServerError: () => void;
  triggerBrowserOffline: () => void;
  triggerSleep: () => void;
  reset: () => void;
}
