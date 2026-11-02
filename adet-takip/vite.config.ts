import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Göreli taban: GitHub Pages alt klasöründe ve herhangi bir statik barındırmada aynı derleme çalışır.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  server: { host: true },
  preview: { host: true, port: 4174, strictPort: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
