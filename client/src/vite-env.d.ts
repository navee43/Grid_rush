/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the GridRush API, e.g. https://gridrush-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
