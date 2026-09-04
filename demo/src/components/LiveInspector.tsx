import type { MonitorSnapshot } from "server-active-indicator";

interface LiveInspectorProps {
  snapshot: MonitorSnapshot;
  events: Array<{ timestamp: string; state: string; details: string }>;
}

export function LiveInspector({ snapshot, events }: LiveInspectorProps) {
  return (
    <div className="control-card">
      <div className="card-title-bar">
        <span className="card-title-heading">Live Telemetry & State</span>
      </div>

      <div className="card-body">
        {/* Live Snapshot Telemetry */}
        <div className="telemetry-box">
          <div className="telemetry-row">
            <span className="telemetry-key">status:</span>
            <span className={`telemetry-val ${snapshot.status}`}>
              &quot;{snapshot.status}&quot;
            </span>
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
              {snapshot.lastLatencyMs !== null ? `${snapshot.lastLatencyMs}ms` : "null"}
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
        <div className="control-group">
          <div className="control-label-row">
            <span>Transition Log</span>
            <span className="control-val-badge">Last 10</span>
          </div>
          <div className="event-log-container">
            {events.length === 0 ? (
              <div className="event-log-empty">Waiting for health probe transitions...</div>
            ) : (
              events.slice(0, 10).map((evt, idx) => (
                <div key={idx} className="event-log-entry">
                  <span className="event-timestamp">{evt.timestamp}</span>
                  <span className={`event-tag ${evt.state}`}>{evt.state}</span>
                  <span className="event-detail">{evt.details}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
