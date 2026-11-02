import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The built portal is embedded into the Go binary from ../internal/portal/dist.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: { outDir: '../internal/portal/dist', emptyOutDir: true },
  server: { proxy: { '/v1': 'http://127.0.0.1:8080', '/auth': 'http://127.0.0.1:8080' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
