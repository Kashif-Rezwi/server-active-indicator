import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckResult } from "server-active-indicator";
import type {
  SimulatedBackendHandle,
  SimulatedServerState,
  SimulationConfig,
  SimulationTelemetry,
} from "./types";

const DEFAULT_SIM_CONFIG: SimulationConfig = {
  wakeDuration: 6_500, // 6.5 seconds cold-start wake
  latency: 180, // 180ms network latency
  autoSleepTimeout: 20_000, // sleep after 20s of idle when warm
  mode: "cold-start",
};

export function useSimulatedBackend(
  initialConfig?: Partial<SimulationConfig>,
): SimulatedBackendHandle {
  const [config, setConfig] = useState<SimulationConfig>({
    ...DEFAULT_SIM_CONFIG,
    ...initialConfig,
  });

  const [telemetry, setTelemetry] = useState<SimulationTelemetry>({
    serverState: "sleeping",
    bootProgress: 0,
    elapsedBootSeconds: 0,
    requestsReceived: 0,
    lastResponseMs: null,
    lastRequestTimestamp: null,
    isBrowserOnline: true,
  });

  const configRef = useRef(config);
  configRef.current = config;

  const serverStateRef = useRef<SimulatedServerState>("sleeping");
  const bootStartRef = useRef<number | null>(null);
  const requestsCountRef = useRef<number>(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateTelemetryState = useCallback((state: SimulatedServerState) => {
    serverStateRef.current = state;
    setTelemetry((prev) => ({
      ...prev,
      serverState: state,
      isBrowserOnline: state !== "disconnected",
    }));
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const clearBootProgressInterval = useCallback(() => {
    if (bootProgressIntervalRef.current) {
      clearInterval(bootProgressIntervalRef.current);
      bootProgressIntervalRef.current = null;
    }
  }, []);

  const scheduleIdleSleep = useCallback(() => {
    clearIdleTimer();
    if (configRef.current.autoSleepTimeout <= 0) return;

    idleTimerRef.current = setTimeout(() => {
      if (serverStateRef.current === "ready") {
        updateTelemetryState("sleeping");
        bootStartRef.current = null;
        setTelemetry((prev) => ({
          ...prev,
          bootProgress: 0,
          elapsedBootSeconds: 0,
        }));
      }
    }, configRef.current.autoSleepTimeout);
  }, [clearIdleTimer, updateTelemetryState]);

  const startBootTracking = useCallback(() => {
    clearBootProgressInterval();
    bootStartRef.current = Date.now();

    bootProgressIntervalRef.current = setInterval(() => {
      if (serverStateRef.current !== "booting" || !bootStartRef.current) {
        return;
      }
      const elapsed = Date.now() - bootStartRef.current;
      const progress = Math.min(100, Math.round((elapsed / configRef.current.wakeDuration) * 100));
      const elapsedSec = Math.floor(elapsed / 1000);

      setTelemetry((prev) => ({
        ...prev,
        bootProgress: progress,
        elapsedBootSeconds: elapsedSec,
      }));

      if (elapsed >= configRef.current.wakeDuration) {
        updateTelemetryState("ready");
        clearBootProgressInterval();
      }
    }, 100);
  }, [clearBootProgressInterval, updateTelemetryState]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearIdleTimer();
      clearBootProgressInterval();
    };
  }, [clearIdleTimer, clearBootProgressInterval]);

  // The custom check function passed into server-active-indicator
  const check = useCallback(async (): Promise<boolean | CheckResult> => {
    const currentConfig = configRef.current;
    requestsCountRef.current += 1;
    const reqNum = requestsCountRef.current;
    const reqStart = Date.now();

    clearIdleTimer();

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, currentConfig.latency));
    const latency = Date.now() - reqStart;

    setTelemetry((prev) => ({
      ...prev,
      requestsReceived: reqNum,
      lastResponseMs: latency,
      lastRequestTimestamp: reqStart,
    }));

    // 1. Browser Offline Scenario
    if (currentConfig.mode === "browser-offline" || serverStateRef.current === "disconnected") {
      // Simulate network request error / browser connection down
      throw new TypeError("Failed to fetch: browser offline");
    }

    // 2. Server Error Scenario
    if (currentConfig.mode === "server-error" || serverStateRef.current === "crashed") {
      return {
        ok: false,
        status: 503,
        reason: "http-error",
      };
    }

    // 3. Warm Start Scenario
    if (currentConfig.mode === "warm-start" || serverStateRef.current === "ready") {
      updateTelemetryState("ready");
      scheduleIdleSleep();
      return { ok: true, status: 200 };
    }

    // 4. Cold Start Scenario
    if (serverStateRef.current === "sleeping") {
      updateTelemetryState("booting");
      startBootTracking();
    }

    if (serverStateRef.current === "booting") {
      if (bootStartRef.current) {
        const elapsed = Date.now() - bootStartRef.current;
        if (elapsed >= currentConfig.wakeDuration) {
          updateTelemetryState("ready");
          clearBootProgressInterval();
          setTelemetry((prev) => ({ ...prev, bootProgress: 100 }));
          scheduleIdleSleep();
          return { ok: true, status: 200 };
        }
      }
      // Still waking up: 503 Service Unavailable / Connection refused
      return {
        ok: false,
        status: 503,
        reason: "request-failed",
      };
    }

    return { ok: true, status: 200 };
  }, [
    clearBootProgressInterval,
    clearIdleTimer,
    scheduleIdleSleep,
    startBootTracking,
    updateTelemetryState,
  ]);

  const updateConfig = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const triggerColdStart = useCallback(() => {
    clearIdleTimer();
    clearBootProgressInterval();
    bootStartRef.current = null;
    setConfig((prev) => ({ ...prev, mode: "cold-start" }));
    updateTelemetryState("sleeping");
    setTelemetry((prev) => ({
      ...prev,
      bootProgress: 0,
      elapsedBootSeconds: 0,
    }));
  }, [clearBootProgressInterval, clearIdleTimer, updateTelemetryState]);

  const triggerWarmStart = useCallback(() => {
    clearIdleTimer();
    clearBootProgressInterval();
    setConfig((prev) => ({ ...prev, mode: "warm-start" }));
    updateTelemetryState("ready");
    setTelemetry((prev) => ({
      ...prev,
      bootProgress: 100,
      elapsedBootSeconds: 0,
    }));
    scheduleIdleSleep();
  }, [clearBootProgressInterval, clearIdleTimer, scheduleIdleSleep, updateTelemetryState]);

  const triggerServerError = useCallback(() => {
    clearIdleTimer();
    clearBootProgressInterval();
    setConfig((prev) => ({ ...prev, mode: "server-error" }));
    updateTelemetryState("crashed");
    setTelemetry((prev) => ({
      ...prev,
      bootProgress: 0,
    }));
  }, [clearBootProgressInterval, clearIdleTimer, updateTelemetryState]);

  const triggerBrowserOffline = useCallback(() => {
    clearIdleTimer();
    clearBootProgressInterval();
    setConfig((prev) => ({ ...prev, mode: "browser-offline" }));
    updateTelemetryState("disconnected");
    setTelemetry((prev) => ({
      ...prev,
      isBrowserOnline: false,
    }));
  }, [clearBootProgressInterval, clearIdleTimer, updateTelemetryState]);

  const triggerSleep = useCallback(() => {
    clearIdleTimer();
    clearBootProgressInterval();
    bootStartRef.current = null;
    updateTelemetryState("sleeping");
    setTelemetry((prev) => ({
      ...prev,
      bootProgress: 0,
      elapsedBootSeconds: 0,
    }));
  }, [clearBootProgressInterval, clearIdleTimer, updateTelemetryState]);

  const reset = useCallback(() => {
    triggerColdStart();
  }, [triggerColdStart]);

  return {
    config,
    updateConfig,
    telemetry,
    check,
    triggerColdStart,
    triggerWarmStart,
    triggerServerError,
    triggerBrowserOffline,
    triggerSleep,
    reset,
  };
}
