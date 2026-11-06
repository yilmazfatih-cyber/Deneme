/**
 * Serves the harness build (artifacts/harness, `vite build --mode harness`) with `vite preview --mode harness` on a
 * local port for tools/screens.ts and tools/perf.ts (docs/TECH_DESIGN.md §10.7 item 1, §12.2).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';
import { ROOT } from './levels.ts';

export const HARNESS_DIR = join(ROOT, 'artifacts', 'harness');

export interface HarnessServer {
  /** Base URL without a trailing slash, e.g. `http://127.0.0.1:4180`. */
  readonly url: string;
  close(): Promise<void>;
}

export async function startHarnessServer(port = 4180): Promise<HarnessServer> {
  if (!existsSync(join(HARNESS_DIR, 'index.html')))
    throw new Error(`${HARNESS_DIR}/index.html missing: run "npm run build:harness" first`);
  const server = await preview({
    root: ROOT,
    mode: 'harness',
    logLevel: 'warn',
    preview: { host: '127.0.0.1', port, strictPort: false, open: false },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    await server.close();
    throw new Error('vite preview did not report a local URL');
  }
  return { url: url.replace(/\/$/, ''), close: () => server.close() };
}
