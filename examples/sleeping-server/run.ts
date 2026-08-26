/**
 * Standalone runner for the sleeping-server fixture. Use this for manual
 * exploration and as the seed for the Phase 8 demo.
 *
 *   pnpm fixture:sleep-server
 *   # or with a custom sleep:
 *   SLEEP_MS=3000 pnpm fixture:sleep-server
 *
 * Send `SIGINT` (Ctrl-C) to stop.
 */
import { startServer } from "./server";

const sleepMs = Number(process.env.SLEEP_MS ?? 20_000);
const port = Number(process.env.PORT ?? 0);

const handle = await startServer({ port, sleepMs });
console.log(`sleeping-server up at ${handle.url}`);
console.log(
  `  first GET ${handle.healthUrl} will sleep ${sleepMs}ms; subsequent calls are instant.`,
);
console.log(`  POST ${handle.url}/reset to re-arm the sleep.`);
console.log("  Ctrl-C to stop.");

process.on("SIGINT", async () => {
  console.log("\nshutting down…");
  await handle.close();
  process.exit(0);
});
