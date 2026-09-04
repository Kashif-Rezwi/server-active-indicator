import type { MonitorSnapshot } from "server-active-indicator";
import { CpuIcon, TrashIcon } from "./Icons";

interface LiveInspectorProps {
  snapshot: MonitorSnapshot;
  events: Array<{ timestamp: string; state: string; details: string }>;
  onClearEvents?: () => void;
}

export function LiveInspector({ snapshot, events, onClearEvents }: LiveInspectorProps) {
  return (
    <div className="control-card runtime-inspector-card">
      <div className="card-title-bar">
        <div className="inspector-title-row">
          <CpuIcon className="card-title-icon" />
          <span className="card-title-heading">State Machine & Telemetry</span>
        </div>

        {/* Clean status indicator without pill styling; maintains font, dot color, and smooth blink */}
        <div className={`inspector-live-status ${snapshot.status}`}>
          <span className={`live-status-dot ${snapshot.status}`} aria-hidden="true" />
          <span className="live-status-text">{snapshot.status}</span>
        </div>
      </div>

      <div className="runtime-inspector-grid">
        {/* Left Window: Live Snapshot Readout */}
        <div className="inspector-window">
          <div className="inspector-window-header">
            <span className="inspector-window-title">Snapshot State</span>
            <span className="inspector-window-tag">MonitorSnapshot</span>
          </div>

          <div className="inspector-window-body telemetry-body">
            <div className="telemetry-row">
              <span className="telemetry-key">status</span>
              <span className={`telemetry-val ${snapshot.status}`}>
                &quot;{snapshot.status}&quot;
              </span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-key">elapsedSeconds</span>
              <span className="telemetry-val">{snapshot.elapsedSeconds}s</span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-key">attempts</span>
              <span className="telemetry-val">{snapshot.attempts}</span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-key">wasCold</span>
              <span className="telemetry-val">{snapshot.wasCold ? "true" : "false"}</span>
            </div>

            <div className="telemetry-row">
              <span className="telemetry-key">lastLatencyMs</span>
              <span className="telemetry-val">
                {snapshot.lastLatencyMs !== null ? `${snapshot.lastLatencyMs}ms` : "null"}
              </span>
            </div>

            {snapshot.reason && (
              <div className="telemetry-row">
                <span className="telemetry-key">reason</span>
                <span className="telemetry-val warning">&quot;{snapshot.reason}&quot;</span>
              </div>
            )}

            {snapshot.offlineKind && (
              <div className="telemetry-row">
                <span className="telemetry-key">offlineKind</span>
                <span className="telemetry-val danger">&quot;{snapshot.offlineKind}&quot;</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Window: Transition Event Log */}
        <div className="inspector-window">
          <div className="inspector-window-header">
            <span className="inspector-window-title">Transition Trace</span>
            <div className="inspector-window-actions">
              <span className="inspector-window-tag">{events.length} events</span>
              {onClearEvents && events.length > 0 && (
                <button
                  type="button"
                  className="clear-log-btn"
                  onClick={onClearEvents}
                  title="Clear transition trace log"
                  aria-label="Clear trace log"
                >
                  <TrashIcon />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="inspector-window-body log-body" role="log" aria-live="polite">
            {events.length === 0 ? (
              <div className="event-log-empty">Waiting for status events...</div>
            ) : (
              events.slice(0, 10).map((evt, idx) => (
                <div key={idx} className="event-log-entry">
                  <span className="event-timestamp">{evt.timestamp}</span>
                  <span className={`event-tag ${evt.state}`}>{evt.state}</span>
                  <span className="event-detail" title={evt.details}>
                    {evt.details}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
