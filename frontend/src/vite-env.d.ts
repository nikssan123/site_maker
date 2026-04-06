/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PREVIEW_USE_HOST_PORT?: string;
  readonly VITE_PREVIEW_HOST?: string;
  readonly VITE_PREVIEW_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

