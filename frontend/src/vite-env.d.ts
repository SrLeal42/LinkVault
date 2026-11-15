/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom/vitest" />

interface ImportMetaEnv {
  readonly VITE_DEMO_PUBLIC_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}