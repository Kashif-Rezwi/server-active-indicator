/**
 * Bundle-size budget gate (Phase 9): gzips each published entry point and fails over
 * budget (budgets = Phase 6 actuals + ~20% headroom). Needs `pnpm build`; in `pnpm verify`.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const KB = 1024;

/** @type {Array<{ file: string; label: string; budgetKb: number }>} */
const ENTRIES = [
  { file: "dist/index.js", label: "core ESM", budgetKb: 3.5 },
  { file: "dist/react/index.js", label: "react ESM", budgetKb: 7 },
];

let failed = false;

for (const { file, label, budgetKb } of ENTRIES) {
  let raw;
  try {
    raw = readFileSync(file);
  } catch {
    console.error(`✖ ${label}: ${file} not found — run \`pnpm build\` first`);
    failed = true;
    continue;
  }
  const gzip = gzipSync(raw).length;
  const budget = budgetKb * KB;
  const status = gzip <= budget ? "✓" : "✖";
  if (gzip > budget) failed = true;
  console.log(
    `${status} ${label.padEnd(10)} ${(gzip / KB).toFixed(2)} KB gzip ` +
      `(raw ${(raw.length / KB).toFixed(2)} KB, budget ${budgetKb} KB) — ${file}`,
  );
}

if (failed) {
  console.error("\nBundle-size budget exceeded. Investigate before raising a budget.");
  process.exit(1);
}
