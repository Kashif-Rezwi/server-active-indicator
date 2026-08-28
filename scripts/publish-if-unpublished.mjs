/**
 * Idempotent publish step for the changesets GitHub Action.
 *
 * The action runs its `publish` input on every push to main that has no
 * pending changesets, but `pnpm publish` is not idempotent and fails with
 * 403 when the exact version is already on the registry. This script checks
 * the registry first and only publishes when the current version is missing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));

function isPublished(pkg) {
  try {
    execFileSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (isPublished({ name, version })) {
  console.log(`${name}@${version} is already published — skipping`);
} else {
  console.log(`Publishing ${name}@${version} …`);
  execFileSync("pnpm", ["publish", "--provenance"], { stdio: "inherit" });
}
