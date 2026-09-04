import { useCallback, useEffect, useRef, useState } from "react";
import { ServerStatus, ServerStatusProvider, useServerStatus } from "server-active-indicator/react";

import { HeaderNav } from "./components/HeaderNav";
import { PulseApp } from "./components/PulseApp";
import { ControlPanel, type DemoIndicatorConfig } from "./components/ControlPanel";
import { LiveInspector } from "./components/LiveInspector";
import { CodeExport } from "./components/CodeExport";
import { useSimulatedBackend } from "./simulation/useSimulatedBackend";
import type { SimulatedBackendHandle } from "./simulation/types";

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

function IndicatorSlot({ config }: { config: DemoIndicatorConfig }) {
  if (config.useRenderProp) {
    return (
      <ServerStatus
        variant={config.variant}
        successDisplayMs={config.successDisplayMs}
        messages={Object.values(config.messages).some(Boolean) ? config.messages : undefined}
      >
        {(snapshot) => {
          if (snapshot.status === "unknown" || snapshot.status === "checking") return null;
          if (snapshot.status === "active" && !snapshot.wasCold) return null;

          const bannerClass = `custom-render-prop-banner ${snapshot.status}`;

          return (
            <div className={bannerClass}>
              <span>
                {snapshot.status === "waking" &&
                  `Custom Render Prop: Server waking up (${snapshot.elapsedSeconds}s)`}
                {snapshot.status === "active" && "Custom Render Prop: Server online"}
                {snapshot.status === "offline" && "Custom Render Prop: Backend offline"}
              </span>
              {snapshot.status === "offline" && (
                <button
                  type="button"
                  onClick={snapshot.refresh}
                  className="custom-render-prop-retry"
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

  return (
    <ServerStatus
      variant={config.variant}
      successDisplayMs={config.successDisplayMs}
      messages={Object.values(config.messages).some(Boolean) ? config.messages : undefined}
    />
  );
}

interface DemoContentProps {
  backend: SimulatedBackendHandle;
  config: DemoIndicatorConfig;
  onConfigChange: (patch: Partial<DemoIndicatorConfig>) => void;
  onRemount: () => void;
  events: Array<{ timestamp: string; state: string; details: string }>;
  onRecordEvent: (state: string, details: string) => void;
  onClearEvents: () => void;
  controlsOpen: boolean;
  onCloseControls: () => void;
}

function DemoContent({
  backend,
  config,
  onConfigChange,
  onRemount,
  events,
  onRecordEvent,
  onClearEvents,
  controlsOpen,
  onCloseControls,
}: DemoContentProps) {
  const snapshot = useServerStatus();
  const lastStateRef = useRef<string>("unknown");

  useEffect(() => {
    if (snapshot.status !== "unknown" && snapshot.status !== lastStateRef.current) {
      const detail =
        snapshot.status === "waking"
          ? `Cold start detected (${snapshot.reason || "starting up"})`
          : snapshot.status === "active"
            ? `Backend ready in ${snapshot.lastLatencyMs || 0}ms (attempts: ${snapshot.attempts})`
            : snapshot.status === "offline"
              ? `Unavailable (${snapshot.offlineKind || "server error"})`
              : "Checking server status";

      onRecordEvent(snapshot.status, detail);
      lastStateRef.current = snapshot.status;
    }
  }, [
    snapshot.status,
    snapshot.reason,
    snapshot.lastLatencyMs,
    snapshot.attempts,
    snapshot.offlineKind,
    onRecordEvent,
  ]);

  return (
    <>
      {/* Fixed Top Indicator Slot */}
      {config.position === "top-bar" && (
        <div className="indicator-slot-top" role="region" aria-label="Server status alert">
          <IndicatorSlot config={config} />
        </div>
      )}

      {/* Main 2-Column Grid (Left: Main stage + Inspector + Integration Code; Right: Sidebar controls) */}
      <main className="demo-main-grid">
        {/* Left Column: Pulse Console + State Machine Telemetry + Integration Code */}
        <section className="app-shell-container">
          <PulseApp
            backend={backend}
            snapshot={snapshot}
            onRefreshTriggered={() => {
              backend.triggerColdStart();
              onRemount();
            }}
            revealDelay={config.revealDelay}
            headerSlot={
              config.position === "inside-header" ? (
                <div className="indicator-slot-inline">
                  <IndicatorSlot config={config} />
                </div>
              ) : undefined
            }
          />

          <LiveInspector snapshot={snapshot} events={events} onClearEvents={onClearEvents} />

          <CodeExport config={config} />
        </section>

        {/* Right Column: Control Sidebar (becomes a right drawer on small screens) */}
        <aside
          id="demo-sidebar"
          className={`demo-sidebar ${controlsOpen ? "open" : ""}`}
          aria-label="Demo controls"
        >
          <ControlPanel
            config={config}
            onConfigChange={onConfigChange}
            backend={backend}
            onRemountRequired={onRemount}
          />
        </aside>
      </main>

      {/* Backdrop for the small-screen controls drawer */}
      {controlsOpen && (
        <div className="sidebar-backdrop" onClick={onCloseControls} aria-hidden="true" />
      )}

      {/* Floating Bottom Right Indicator Slot */}
      {config.position === "floating-bottom" && (
        <div className="indicator-slot-floating" role="region" aria-label="Floating server status">
          <IndicatorSlot config={config} />
        </div>
      )}
    </>
  );
}

export function App() {
  const backend = useSimulatedBackend();
  const [config, setConfig] = useState<DemoIndicatorConfig>(INITIAL_DEMO_CONFIG);
  const [sessionKey, setSessionKey] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [events, setEvents] = useState<
    Array<{ timestamp: string; state: string; details: string }>
  >([]);

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

  const handleClearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Close the small-screen controls drawer with Escape
  useEffect(() => {
    if (!controlsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controlsOpen]);

  // Lock page scroll while the drawer is open (only takes effect <= 1100px, via CSS)
  useEffect(() => {
    document.body.classList.toggle("controls-open", controlsOpen);
    return () => document.body.classList.remove("controls-open");
  }, [controlsOpen]);

  return (
    <div className="demo-container">
      <div className="app-bg-glow" aria-hidden="true" />

      <HeaderNav
        controlsOpen={controlsOpen}
        onToggleControls={() => setControlsOpen((open) => !open)}
      />

      <ServerStatusProvider
        key={`session-${sessionKey}`}
        check={backend.check}
        revealDelay={config.revealDelay}
        pollInterval={config.pollInterval}
        offlineAfter={config.offlineAfter}
      >
        <DemoContent
          backend={backend}
          config={config}
          onConfigChange={handleConfigChange}
          onRemount={handleRemount}
          events={events}
          onRecordEvent={recordEvent}
          onClearEvents={handleClearEvents}
          controlsOpen={controlsOpen}
          onCloseControls={() => setControlsOpen(false)}
        />
      </ServerStatusProvider>
    </div>
  );
}
