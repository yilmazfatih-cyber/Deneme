import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/persona-sim/',
  build: { target: 'es2022', outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
});
