/**
 * Debug panel entry (docs/TECH_DESIGN.md §12.3, §14.1 #14; R-20).
 *
 * main.ts imports this module dynamically and ONLY under `import.meta.env.DEV`: Vite turns that branch into dead code
 * in every production build, so neither this module nor anything it imports reaches `dist/` (checked by
 * `npm run build:verify`, tools/verify-dist.ts — the chunk name and the `__debug` global are its markers). In
 * production `?debug=1` therefore has no handler at all.
 *
 * Development server: the panel is on by default (folded at the top right). `?debug=0` turns it off and `?debug=1`
 * back on; the choice and the folded / open state are remembered in localStorage. Console: `window.__debug`.
 */
import type Phaser from 'phaser';
import { DebugPanel } from './panel.ts';
import type { DebugApi, PanelUi } from './panel.ts';

const STORE_KEY = 'minikusta.debug';

function readUi(): PanelUi {
  const ui: PanelUi = { enabled: true, open: false };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (raw !== null && typeof raw === 'object') {
      const r = raw as Partial<Record<keyof PanelUi, unknown>>;
      if (typeof r.enabled === 'boolean') ui.enabled = r.enabled;
      if (typeof r.open === 'boolean') ui.open = r.open;
    }
  } catch {
    // no storage (private mode): defaults
  }
  return ui;
}

function writeUi(ui: PanelUi): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ui));
  } catch {
    // no storage: the state lives for this page only
  }
}

/** The console handle (`window.__debug`); a local view of `window`, no global type augmentation. */
const host = window as unknown as { __debug?: DebugApi };

/** Installs the panel (unless switched off with `?debug=0`). Returns its console API, or null. */
export function installDebug(game: Phaser.Game): DebugApi | null {
  const ui = readUi();
  const flag = new URLSearchParams(window.location.search).get('debug');
  if (flag === '0') ui.enabled = false;
  else if (flag === '1') ui.enabled = true;
  writeUi(ui);
  host.__debug?.destroy();
  delete host.__debug;
  if (!ui.enabled) return null;
  const panel = new DebugPanel(game, ui, writeUi);
  host.__debug = panel.api;
  return panel.api;
}
