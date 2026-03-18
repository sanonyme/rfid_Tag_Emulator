/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IS_MOBILE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

