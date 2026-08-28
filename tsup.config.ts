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
    // Next.js App Router client directive, React subpath only — the framework-free
    // core must not carry it. The banner keeps it the first statement of both outputs.
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
