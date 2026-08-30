import { useState, useRef, useCallback } from "react";
import { ServerStatus } from "server-active-indicator/react";
import type { MonitorSnapshot } from "server-active-indicator";

import { useSimulatedBackend } from "./simulation/useSimulatedBackend";
import { HeaderNav } from "./components/HeaderNav";
import { PulseApp } from "./components/PulseApp";
import { ControlPanel, type DemoIndicatorConfig } from "./components/ControlPanel";
import { LiveInspector } from "./components/LiveInspector";

const INITIAL_DEMO_CONFIG: DemoIndicatorConfig = {
  variant: "banner",
  position: "top-bar",
  revealDelay: 3_000,
  pollInterval: 5_000,
  offlineAfter: 60_000,
  successDisplayMs: 2_500,
  useRenderProp: false,
  messages: {},
};

export function App() {
  const backend = useSimulatedBackend();
  const [config, setConfig] = useState<DemoIndicatorConfig>(INITIAL_DEMO_CONFIG);
  const [sessionKey, setSessionKey] = useState(0);
  const [activeControlTab, setActiveControlTab] = useState<
    "scenarios" | "config" | "i18n" | "theme" | "telemetry"
  >("scenarios");

  const [currentSnapshot, setCurrentSnapshot] = useState<MonitorSnapshot>({
    status: "checking",
    elapsedSeconds: 0,
    attempts: 0,
    wasCold: false,
    lastLatencyMs: null,
    lastCheckedAt: null,
  });

  const [events, setEvents] = useState<
    Array<{ timestamp: string; state: string; details: string }>
  >([]);
  const lastStateRef = useRef<string>("checking");

  const handleRemount = useCallback(() => {
    setSessionKey((k) => k + 1);
  }, []);

  const handleConfigChange = useCallback((patch: Partial<DemoIndicatorConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const recordEvent = useCallback((state: string, details: string) => {
    const now = new Date();
    const timeStr =
      now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
    setEvents((prev) => [{ timestamp: timeStr, state, details }, ...prev.slice(0, 19)]);
  }, []);

  // Track snapshot transitions
  const handleSnapshotChange = useCallback(
    (snap: MonitorSnapshot) => {
      setCurrentSnapshot(snap);
      if (snap.status !== lastStateRef.current) {
        const detail =
          snap.status === "waking"
            ? `Cold start detected (${snap.reason || "starting up"})`
            : snap.status === "active"
              ? `Backend ready in ${snap.lastLatencyMs || 0}ms (attempts: ${snap.attempts})`
              : snap.status === "offline"
                ? `Unavailable (${snap.offlineKind || "server error"})`
                : "Checking health";

        recordEvent(snap.status, detail);
        lastStateRef.current = snap.status;
      }
    },
    [recordEvent],
  );

  // Render Indicator Component
  const renderIndicator = () => {
    const commonProps = {
      key: `session-${sessionKey}`,
      check: backend.check,
      variant: config.variant,
      revealDelay: config.revealDelay,
      pollInterval: config.pollInterval,
      offlineAfter: config.offlineAfter,
      successDisplayMs: config.successDisplayMs,
      messages: Object.values(config.messages).some(Boolean) ? config.messages : undefined,
    };

    if (config.useRenderProp) {
      return (
        <ServerStatus {...commonProps}>
          {(snapshot) => {
            // Update snapshot state
            handleSnapshotChange(snapshot);
            if (snapshot.status === "unknown" || snapshot.status === "checking") return null;
            if (snapshot.status === "active" && !snapshot.wasCold) return null;

            return (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  margin: "8px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background:
                    snapshot.status === "waking"
                      ? "rgba(245, 158, 11, 0.15)"
                      : snapshot.status === "active"
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(244, 63, 94, 0.15)",
                  border: `1px solid ${
                    snapshot.status === "waking"
                      ? "rgba(245, 158, 11, 0.4)"
                      : snapshot.status === "active"
                        ? "rgba(16, 185, 129, 0.4)"
                        : "rgba(244, 63, 94, 0.4)"
                  }`,
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                <span>
                  {snapshot.status === "waking" &&
                    `✨ Custom Render Prop: Waking Up (${snapshot.elapsedSeconds}s)`}
                  {snapshot.status === "active" && "✨ Custom Render Prop: Server Online!"}
                  {snapshot.status === "offline" && "✨ Custom Render Prop: Backend Offline"}
                </span>
                {snapshot.status === "offline" && (
                  <button
                    type="button"
                    onClick={snapshot.refresh}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      background: "var(--brand-500)",
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            );
          }}
        </ServerStatus>
      );
    }

    return <ServerStatus {...commonProps} />;
  };

  return (
    <div className="demo-container">
      <div className="app-bg-glow" />

      {/* Header Bar */}
      <HeaderNav backend={backend} onRemount={handleRemount} />

      {/* Fixed Top Indicator Slot */}
      {config.position === "top-bar" && (
        <div className="indicator-slot-top">{renderIndicator()}</div>
      )}

      {/* Main 2-Column Grid */}
      <main className="demo-main-grid">
        {/* Left Column: Pulse SaaS Application */}
        <section className="app-shell-container">
          {/* Embedded Indicator Slot */}
          {config.position === "inside-header" && (
            <div className="indicator-slot-inline">{renderIndicator()}</div>
          )}

          <PulseApp
            backend={backend}
            onRefreshTriggered={() => {
              backend.triggerColdStart();
              handleRemount();
            }}
          />
        </section>

        {/* Right Column: Interactive Control Center & Live Telemetry */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ControlPanel
            config={config}
            onConfigChange={handleConfigChange}
            backend={backend}
            onRemountRequired={handleRemount}
            activeTab={activeControlTab}
            onTabChange={setActiveControlTab}
          />

          <div className="control-center-card" style={{ padding: 20 }}>
            <LiveInspector snapshot={currentSnapshot} events={events} config={config} />
          </div>
        </aside>
      </main>

      {/* Floating Bottom Right Indicator Slot */}
      {config.position === "floating-bottom" && (
        <div className="indicator-slot-floating">{renderIndicator()}</div>
      )}
    </div>
  );
}
