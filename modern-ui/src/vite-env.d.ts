/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IS_MOBILE?: string
  /** Set to `"false"` to hide the Workshop game from the UI. */
  readonly VITE_ENABLE_WORKSHOP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

