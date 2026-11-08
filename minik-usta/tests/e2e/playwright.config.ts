/**
 * Playwright scene smoke test (docs/TECH_DESIGN.md §12.4 "Sahne duman testi", §14.1 #15) on the harness build:
 * `npx playwright test -c tests/e2e/playwright.config.ts`. The web server builds `--mode harness` (artifacts/harness)
 * and serves it with `vite preview --mode harness`. Chromium is the preinstalled /opt/pw-browsers/chromium (never
 * `playwright install`). Only `*.spec.ts` files run here; `*.test.ts` files in this folder are Vitest tests.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { CHROMIUM_PATH } from '../../tools/lib/harnessClient.ts';

const PORT = 4183;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // headless Chromium renders WebGL with SwiftShader (a few frames per second): the golden levels take minutes
  timeout: 300_000,
  workers: 1,
  reporter: 'list',
  outputDir: `${ROOT}artifacts/e2e`,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: CHROMIUM_PATH },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `npx vite build --mode harness && npx vite preview --mode harness --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
