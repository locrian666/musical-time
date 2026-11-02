/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REAPER_BRIDGE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
