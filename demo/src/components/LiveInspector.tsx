import { useState } from "react";
import type { MonitorSnapshot } from "server-active-indicator";
import type { DemoIndicatorConfig } from "./ControlPanel";

interface LiveInspectorProps {
  snapshot: MonitorSnapshot;
  events: Array<{ timestamp: string; state: string; details: string }>;
  config: DemoIndicatorConfig;
}

export function LiveInspector({ snapshot, events, config }: LiveInspectorProps) {
  const [copied, setCopied] = useState(false);
  const [codeType, setCodeType] = useState<"react" | "vanilla">("react");

  const generateReactCode = () => {
    const props: string[] = ['healthUrl="https://api.example.com/health"'];
    if (config.variant !== "banner") props.push(`variant="${config.variant}"`);
    if (config.revealDelay !== 3000) props.push(`revealDelay={${config.revealDelay}}`);
    if (config.pollInterval !== 5000) props.push(`pollInterval={${config.pollInterval}}`);
    if (config.offlineAfter !== 60000) props.push(`offlineAfter={${config.offlineAfter}}`);
    if (config.successDisplayMs !== 2500)
      props.push(`successDisplayMs={${config.successDisplayMs}}`);

    const hasMessages = Object.values(config.messages).some(Boolean);
    if (hasMessages) {
      props.push(`messages={${JSON.stringify(config.messages, null, 2)}}`);
    }

    if (config.useRenderProp) {
      return `import { ServerStatus } from "server-active-indicator/react";

export function App() {
  return (
    <ServerStatus
      ${props.join("\n      ")}
    >
      {({ status, elapsedSeconds, refresh }) => (
        status === "waking" ? (
          <div className="custom-banner">
            Waking up... ({elapsedSeconds}s)
          </div>
        ) : null
      )}
    </ServerStatus>
  );
}`;
    }

    return `import { ServerStatus } from "server-active-indicator/react";

export function App() {
  return (
    <ServerStatus
      ${props.join("\n      ")}
    />
  );
}`;
  };

  const generateVanillaCode = () => {
    return `import { createMonitor } from "server-active-indicator";

const monitor = createMonitor({
  healthUrl: "https://api.example.com/health",
  revealDelay: ${config.revealDelay},
  pollInterval: ${config.pollInterval},
  offlineAfter: ${config.offlineAfter},
});

const unsubscribe = monitor.subscribe(({ status, elapsedSeconds }) => {
  console.log("Server status:", status, "Elapsed:", elapsedSeconds);
  if (status === "waking") {
    // Show your custom waking banner
  } else if (status === "active") {
    // Backend is ready!
  }
});

// Teardown when component/page unmounts:
// unsubscribe();
// monitor.destroy();`;
  };

  const handleCopyCode = async () => {
    const text = codeType === "react" ? generateReactCode() : generateVanillaCode();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Live Snapshot Telemetry */}
      <div className="telemetry-box">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          Live MonitorSnapshot State
        </div>

        <div className="telemetry-row">
          <span className="telemetry-key">status:</span>
          <span className={`telemetry-val ${snapshot.status}`}>&quot;{snapshot.status}&quot;</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-key">elapsedSeconds:</span>
          <span className="telemetry-val">{snapshot.elapsedSeconds}s</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-key">attempts:</span>
          <span className="telemetry-val">{snapshot.attempts}</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-key">wasCold:</span>
          <span className="telemetry-val">{snapshot.wasCold ? "true" : "false"}</span>
        </div>

        <div className="telemetry-row">
          <span className="telemetry-key">lastLatencyMs:</span>
          <span className="telemetry-val">
            {snapshot.lastLatencyMs ? `${snapshot.lastLatencyMs}ms` : "null"}
          </span>
        </div>

        {snapshot.reason && (
          <div className="telemetry-row">
            <span className="telemetry-key">reason:</span>
            <span className="telemetry-val" style={{ color: "var(--color-warning)" }}>
              &quot;{snapshot.reason}&quot;
            </span>
          </div>
        )}

        {snapshot.offlineKind && (
          <div className="telemetry-row">
            <span className="telemetry-key">offlineKind:</span>
            <span className="telemetry-val" style={{ color: "var(--color-danger)" }}>
              &quot;{snapshot.offlineKind}&quot;
            </span>
          </div>
        )}
      </div>

      {/* Transition Events Stream */}
      <div>
        <div
          style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}
        >
          Live Transition Event Log
        </div>
        <div className="event-log-container">
          {events.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 4 }}>
              Waiting for first health check attempt...
            </div>
          ) : (
            events.map((evt, idx) => (
              <div key={idx} className="event-log-entry">
                <span className="event-timestamp">{evt.timestamp}</span>
                <span className={`event-tag ${evt.state}`}>{evt.state}</span>
                <span style={{ color: "var(--text-secondary)" }}>{evt.details}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Code Export Generator */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
            Generated Code Snippet
          </div>
          <div className="segmented-control" style={{ maxWidth: 140 }}>
            <button
              type="button"
              className={`segment-btn ${codeType === "react" ? "active" : ""}`}
              onClick={() => setCodeType("react")}
            >
              React
            </button>
            <button
              type="button"
              className={`segment-btn ${codeType === "vanilla" ? "active" : ""}`}
              onClick={() => setCodeType("vanilla")}
            >
              JS
            </button>
          </div>
        </div>

        <div className="code-snippet-box">
          <button
            type="button"
            className="copy-code-btn"
            onClick={handleCopyCode}
            title="Copy code to clipboard"
          >
            {copied ? "✓ Copied!" : "Copy"}
          </button>
          <pre>{codeType === "react" ? generateReactCode() : generateVanillaCode()}</pre>
        </div>
      </div>
    </div>
  );
}
