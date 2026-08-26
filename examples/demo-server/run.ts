/**
 * Standalone runner for the demo API (Phase 8).
 *
 *   pnpm --dir examples/demo-server start
 *   # or from the repo root via tsx:
 *   node --import tsx examples/demo-server/run.ts
 *
 * Env: PORT (4100), SLEEP_MS (20000), ALLOWED_ORIGIN (*).
 * Send SIGINT (Ctrl-C) to stop.
 */
import { startDemoServer } from "./server";

const handle = await startDemoServer();
console.log(`demo-server up at ${handle.url}`);
console.log(`  GET  ${handle.healthUrl}  (first call sleeps ${handle.sleepMs}ms, then instant)`);
console.log(`  GET  ${handle.apiUrl}   (demo data endpoint, shares the cold start)`);
console.log(`  POST ${handle.url}/reset        (re-arm the sleep — "simulate idle timeout")`);
console.log("  Ctrl-C to stop.");

process.on("SIGINT", async () => {
  console.log("\nshutting down…");
  await handle.close();
  process.exit(0);
});
