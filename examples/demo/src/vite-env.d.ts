/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the demo API, e.g. http://127.0.0.1:4100 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
