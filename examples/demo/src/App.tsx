import { useState } from "react";

import { ServerStatus, ServerStatusProvider, useServerStatus } from "server-active-indicator/react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4100";
const HEALTH_URL = `${API_URL}/health`;

/** Data card: app-level fetch whose latency parallels the indicator banner. */
function DataCard() {
  const { status } = useServerStatus();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; message: string; roundTripMs: number }
    | { kind: "error"; detail: string }
  >({ kind: "idle" });

  async function fetchMessage() {
    setState({ kind: "loading" });
    const start = performance.now();
    try {
      const res = await fetch(`${API_URL}/api/message`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { message: string };
      setState({
        kind: "done",
        message: body.message,
        roundTripMs: Math.round(performance.now() - start),
      });
    } catch (err) {
      setState({ kind: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section className="card">
      <h2>App data fetch</h2>
      <p className="hint">
        This calls <code>GET /api/message</code> on the same backend. During a cold start the
        request hangs — the banner above explains why; current indicator state:{" "}
        <code>{status}</code>.
      </p>
      <button type="button" onClick={fetchMessage} disabled={state.kind === "loading"}>
        {state.kind === "loading" ? "Fetching…" : "Fetch data from the API"}
      </button>
      {state.kind === "done" && (
        <p className="result">
          “{state.message}” <span className="muted">({state.roundTripMs} ms round trip)</span>
        </p>
      )}
      {state.kind === "error" && <p className="result error">Failed: {state.detail}</p>}
    </section>
  );
}

/** Re-sleep control: re-arms the demo API so the next visit cold-starts. */
function ResetCard() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function simulateIdleTimeout() {
    setBusy(true);
    setDone(false);
    try {
      await fetch(`${API_URL}/reset`, { method: "POST" });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Simulate idle timeout</h2>
      <p className="hint">
        Re-arms the backend's sleep. Reload the page (or hit Retry when it goes offline) to watch
        the cold start again — no need to wait 15 minutes.
      </p>
      <button type="button" onClick={simulateIdleTimeout} disabled={busy}>
        {busy ? "Re-arming…" : "Re-arm the sleep"}
      </button>
      {done && <p className="result">Sleep re-armed — the next request will cold-start.</p>}
    </section>
  );
}

export function App() {
  return (
    <ServerStatusProvider healthUrl={HEALTH_URL}>
      {/* Banner: the drop-in default UI, reading the provider's monitor. */}
      <ServerStatus />
      <main className="page">
        <header>
          <h1>server-active-indicator</h1>
          <p className="tagline">
            This page's backend is a free-tier service that sleeps when idle. If you arrived during
            a cold start, the banner above is telling you so — instead of leaving you staring at a
            broken app.
          </p>
          <p className="hint">
            Backend: <code>{API_URL}</code> ·{" "}
            <a href="https://github.com/Kashif-Rezwi/server-active-indicator">GitHub repo</a>
          </p>
        </header>

        <DataCard />
        <ResetCard />

        <section className="card">
          <h2>Pill variant</h2>
          <p className="hint">
            The same monitor, rendered as a compact pill. It stays silent while the backend is warm
            — you'll only see it during a cold start or outage.
          </p>
          <div className="pill-row">
            <ServerStatus variant="pill" />
          </div>
        </section>
      </main>
    </ServerStatusProvider>
  );
}
