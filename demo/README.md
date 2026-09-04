# server-active-indicator: Interactive Live Demo

Interactive live sandbox and realistic application demonstration for [`server-active-indicator`](https://github.com/Kashif-Rezwi/server-active-indicator).

## What is this?

This demo showcases a realistic SaaS analytics dashboard (**"Pulse"**) powered by a simulated backend host that sleeps when idle (mimicking free-tier deployments on Render, Railway, Fly.io, or Koyeb).

### Key Features Demonstrated

- **Real-world Cold Start Simulation**: Experience how the indicator stays silent during the fast `revealDelay` (3s), displays the amber _"The server is starting up..."_ banner with live elapsed timer while booting, confirms with green _"The server is ready."_, and auto-hides after `successDisplayMs`.
- **Silence on Success**: Test instant warm responses and observe that zero UI is rendered when the server is awake.
- **Server Offline & Error States**: Test HTTP 503 / network drops and interact with the built-in `Retry` button.
- **Full Customization Controls**:
  - Visual Variants: `banner` vs `pill`
  - Flexible Placements: Fixed top-bar, embedded card header, or floating bottom badge
  - Timing Controls: Adjust `revealDelay`, `pollInterval`, `offlineAfter`, `successDisplayMs`
  - i18n & Copy Overrides: Live message customization
  - Render Prop Escape Hatch: Test building custom headless UI via `children={(snapshot) => ...}`
- **DevTools & Telemetry Console**:
  - Live `MonitorSnapshot` state inspector
  - Real-time transition event stream log
  - Instant copyable React and Vanilla JS code snippet generator

## Running Locally

From the root directory:

```bash
# Start the demo development server
pnpm demo:dev

# Build for production
pnpm demo:build
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.
