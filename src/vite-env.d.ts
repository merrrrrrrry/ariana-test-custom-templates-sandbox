/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BSTAGE_PHASE: string
  readonly VITE_BSTAGE_APP_ID: string
  readonly VITE_BSTAGE_APP_SECRET: string
  readonly VITE_BSTAGE_TENANT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
