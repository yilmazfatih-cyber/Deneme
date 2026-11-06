import { defineConfig } from 'vitest/config';

// `vite build --mode harness` (npm run build:harness) bundles the Playwright hooks of src/harness (TECH_DESIGN §1.2,
// §10.7, §12.2). It writes to its own folder so the store/web production bundle in dist/ never contains them
// (R-20, checked by tools/verify-dist.ts). Serve it with `vite preview --mode harness`.
export default defineConfig(({ mode }) => ({
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    outDir: mode === 'harness' ? 'artifacts/harness' : 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
