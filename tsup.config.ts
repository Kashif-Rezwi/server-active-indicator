import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
} satisfies Parameters<typeof defineConfig>[0];

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    clean: true,
  },
  {
    ...shared,
    entry: { "react/index": "src/react/index.ts" },
    // Next.js App Router client-boundary directive. Applied to the React subpath
    // only — the framework-free core must not carry a client directive. The banner
    // guarantees the directive is the first statement of both the ESM and CJS
    // outputs regardless of bundler directive handling.
    banner: { js: '"use client"' },
    clean: false,
  },
  {
    entry: { "server-active-indicator.iife": "src/index.ts" },
    format: ["iife"],
    globalName: "ServerActiveIndicator",
    minify: true,
    sourcemap: true,
    clean: false,
  },
]);
