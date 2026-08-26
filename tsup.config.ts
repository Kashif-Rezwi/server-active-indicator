import { defineConfig } from "tsup";

const shared = {
  entry: ["src/index.ts", "src/react/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "react/jsx-runtime"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
} satisfies Parameters<typeof defineConfig>[0];

export default defineConfig([
  shared,
  {
    entry: { "server-active-indicator.iife": "src/index.ts" },
    format: ["iife"],
    globalName: "ServerActiveIndicator",
    minify: true,
    sourcemap: true,
    clean: false,
  },
]);
