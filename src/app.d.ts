declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    readonly VITE_GIT_HASH?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
