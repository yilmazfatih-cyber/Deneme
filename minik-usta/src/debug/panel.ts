/**
 * Debug panel (docs/TECH_DESIGN.md §12.3, §14.1 #14; R-20: development only — loaded by main.ts behind
 * `import.meta.env.DEV`, so production builds contain none of it and `?debug=1` does nothing there).
 *
 * A DOM layer over the game, folded into a small button at the top right (it shows the FPS). Opened, it offers:
 * - level select (every bundled level; Phase 2: 1–5) and restart — a new attempt, the running one is dropped without
 *   penalty (sceneBridge.ts `dropAttempt`);
 * - rules: unlimited moves, yard gravity, build gravity profile, obstacle rules (rules.ts; only what the core can
 *   switch) — a change reopens the running attempt under the new rules (its move log is replayed, K-43 path);
 * - the board as Appendix A ASCII (core `toAscii`, colour and id variants), copied to the clipboard and the console,
 *   the move log (TECH §11.1 format: level, `levelHash`, actions) and the state hash (core `hashHex`);
 * - the event log of the attempt (last 50 core events with action, K-35 step and seq — eventLog.ts);
 * - FPS and frame-time graph (frameStats.ts);
 * - golden solution replay, step by step or continuous, with the drag animation (goldenReplay.ts).
 * Touches on the panel never reach the game (Phaser also listens on window).
 */
import type Phaser from 'phaser';
import { toAscii } from '../core/ascii.ts';
import { hashHex } from '../core/hash.ts';
import { levelHash } from '../core/session.ts';
import type { GameSession } from '../core/session.ts';
import type { RuleId } from '../core/obstacles/types.ts';
import { appAnalytics } from '../scenes/appServices.ts';
import { availableLevels } from '../scenes/level/levels.ts';
import { EventLog, formatEntry } from './eventLog.ts';
import { FRAME_BUDGET_MS, FrameStats } from './frameStats.ts';
import { GoldenReplay } from './goldenReplay.ts';
import { LABEL } from './labels.ts';
import { applyGravityOverride } from './levelOverride.ts';
import { BUILD_GRAVITIES, NO_DEBUG_RULES, ruleSwitches, rulesActive, sessionHooks } from './rules.ts';
import type { BuildGravity, DebugRules } from './rules.ts';
import { SceneBridge } from './sceneBridge.ts';
import { installSessionTap } from './sessionTap.ts';
import type { SessionTap } from './sessionTap.ts';

const ROOT_ID = 'mu-debug';
/** The FPS figure and graph are redrawn at this rate (the meter itself samples every frame). */
const STATS_REFRESH_MS = 250;
const GRAPH_W = 240;
const GRAPH_H = 40;
/** Graph scale: 0 … 50 ms (3 frame budgets). */
const GRAPH_MAX_MS = 3 * FRAME_BUDGET_MS;
/** Events that must not reach the game below the panel (Phaser listens on the canvas and on window). */
const SWALLOWED = [
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'pointerdown',
  'pointerup',
  'pointermove',
  'wheel',
  'contextmenu',
] as const;

const CSS = `
#${ROOT_ID}{position:fixed;top:env(safe-area-inset-top);right:0;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#f4f4f4;max-width:min(372px,100vw);touch-action:pan-y;user-select:text}
#${ROOT_ID} button,#${ROOT_ID} select{font:inherit;color:#111;background:#e8e8e8;border:1px solid #888;border-radius:4px;min-height:28px;min-width:28px;margin:2px;padding:0 6px}
#${ROOT_ID} button:disabled,#${ROOT_ID} input:disabled+span{opacity:.45}
#${ROOT_ID} .toggle{min-height:18px;margin:0;padding:0 4px;font-size:10px;background:rgba(20,20,20,.6);color:#fff;border-color:#555;border-radius:0 0 0 4px}
#${ROOT_ID} .toggle[aria-pressed=true]{background:#ffd23f;color:#111}
#${ROOT_ID} .body{box-sizing:border-box;width:100%;background:rgba(16,18,22,.92);border:1px solid #444;border-radius:6px 0 0 6px;padding:6px 8px;max-height:82vh;overflow:auto;overscroll-behavior:contain}
#${ROOT_ID} h4{margin:8px 0 2px;font-size:11px;color:#9fd3ff;letter-spacing:.04em}
#${ROOT_ID} pre{margin:2px 0;white-space:pre;overflow-x:auto;background:rgba(0,0,0,.35);padding:4px;border-radius:4px}
#${ROOT_ID} label{display:block;margin:2px 0}
#${ROOT_ID} .hint{color:#aaa}
#${ROOT_ID} .warn{color:#ffb347}
#${ROOT_ID} canvas{display:block;background:rgba(0,0,0,.35);border-radius:4px}
`;

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

function button(text: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = el('button', { type: 'button', ...(title ? { title } : {}) }, [text]);
  b.addEventListener('click', onClick);
  return b;
}

/** Writes `text` to the clipboard (and always to the console); false when the browser refused. */
async function copyText(text: string, what: string): Promise<boolean> {
  console.info(`[debug] ${what}\n${text}`);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http:// on a phone (no secure context): the old selection copy
    const area = el('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Panel UI state kept across reloads (development only). */
export interface PanelUi {
  enabled: boolean;
  open: boolean;
}

/** `window.__debug` (console use). */
export interface DebugApi {
  readonly level: (id: number) => Promise<string | null>;
  readonly restart: () => Promise<string | null>;
  readonly ascii: (ids?: boolean) => string | null;
  readonly events: () => string[];
  readonly rules: () => DebugRules;
  readonly setRules: (patch: Partial<DebugRules>) => Promise<void>;
  readonly golden: (mode?: 'step' | 'play', levelId?: number) => Promise<void>;
  readonly stopGolden: () => void;
  readonly toggle: (open?: boolean) => void;
  readonly destroy: () => void;
}

export class DebugPanel {
  readonly api: DebugApi;
  readonly #bridge: SceneBridge;
  readonly #ui: PanelUi;
  readonly #saveUi: (ui: PanelUi) => void;
  readonly #tap: SessionTap;
  readonly #log = new EventLog();
  readonly #frames = new FrameStats();
  readonly #golden: GoldenReplay;
  #rules: DebugRules = NO_DEBUG_RULES;
  #dirty = true;
  #lastFrame = 0;
  #lastStats = 0;
  #raf = 0;
  #rulesLevel: number | null = null;
  /** The session the panel shows (a level start / end with no action also redraws it). */
  #shown: GameSession | null = null;

  // DOM
  readonly #root: HTMLDivElement;
  readonly #toggle: HTMLButtonElement;
  readonly #body: HTMLDivElement;
  readonly #levels: HTMLDivElement;
  readonly #state: HTMLPreElement;
  readonly #board: HTMLPreElement;
  readonly #events: HTMLPreElement;
  readonly #obstacles: HTMLDivElement;
  readonly #rulesNote: HTMLDivElement;
  readonly #copyNote: HTMLSpanElement;
  readonly #levelNote: HTMLSpanElement;
  readonly #goldenNote: HTMLDivElement;
  readonly #fpsText: HTMLDivElement;
  readonly #graph: HTMLCanvasElement;
  readonly #unlimited: HTMLInputElement;
  readonly #yard: HTMLSelectElement;
  readonly #build: HTMLSelectElement;

  constructor(game: Phaser.Game, ui: PanelUi, saveUi: (ui: PanelUi) => void) {
    this.#bridge = new SceneBridge(game);
    this.#ui = ui;
    this.#saveUi = saveUi;
    this.#golden = new GoldenReplay(this.#bridge, (text) => {
      this.#goldenNote.textContent = text;
    });
    this.#tap = installSessionTap({
      hooks: (lvl, base) => sessionHooks(lvl, this.#rules, base),
      listener: {
        sessionStarted: (session, kind) => this.#sessionStarted(session, kind),
        action: (session, action, events, result) => {
          if (session !== this.#tap.current) return;
          const n = session.log.length - 1;
          const note = result ? `${result.status}${result.reason ? ` (${result.reason})` : ''}` : '';
          this.#log.action(n, action, note);
          this.#log.events(n, events);
          this.#dirty = true;
        },
      },
    });

    // --- DOM ---
    const style = el('style', {}, [CSS]);
    this.#toggle = button(LABEL.toggle, () => this.toggle());
    this.#toggle.className = 'toggle';
    this.#levels = el('div');
    this.#state = el('pre');
    this.#board = el('pre');
    this.#events = el('pre');
    this.#obstacles = el('div');
    this.#rulesNote = el('div', { class: 'hint' }, [LABEL.rulesHint]);
    this.#copyNote = el('span', { class: 'hint' });
    this.#levelNote = el('span', { class: 'warn' });
    this.#goldenNote = el('div', { class: 'hint' });
    this.#fpsText = el('div');
    this.#graph = el('canvas', { width: String(GRAPH_W), height: String(GRAPH_H) });
    this.#unlimited = el('input', { type: 'checkbox' });
    this.#unlimited.addEventListener('change', () => {
      void this.setRules({ unlimitedMoves: this.#unlimited.checked });
    });
    this.#yard = this.#select([
      ['', LABEL.levelValue],
      ['on', LABEL.on],
      ['off', LABEL.off],
    ]);
    this.#yard.addEventListener('change', () => {
      const v = this.#yard.value;
      void this.setRules({ yardGravity: v === '' ? null : v === 'on' });
    });
    this.#build = this.#select([['', LABEL.levelValue], ...BUILD_GRAVITIES.map((g) => [g, g] as const)]);
    this.#build.addEventListener('change', () => {
      const v = this.#build.value;
      void this.setRules({ buildGravity: v === '' ? null : (v as BuildGravity) });
    });

    for (const id of availableLevels())
      this.#levels.append(button(String(id), () => void this.#openLevel(id, true), LABEL.levelTitle));
    this.#levels.append(
      button(LABEL.restart, () => void this.restart(), LABEL.restartTitle),
      this.#levelNote,
    );

    this.#body = el('div', { class: 'body' }, [
      el('h4', {}, [LABEL.level]),
      this.#levels,
      el('h4', {}, [LABEL.status]),
      this.#state,
      el('h4', {}, [LABEL.rules]),
      el('label', {}, [this.#unlimited, ` ${LABEL.unlimitedMoves}`]),
      el('label', {}, [`${LABEL.yardGravity} `, this.#yard]),
      el('label', {}, [`${LABEL.buildGravity} `, this.#build]),
      el('div', {}, [`${LABEL.obstacles}:`]),
      this.#obstacles,
      this.#rulesNote,
      el('h4', {}, [LABEL.board]),
      this.#board,
      el('div', {}, [
        button(LABEL.copyAscii, () => void this.#copyAscii(false)),
        button(LABEL.copyIds, () => void this.#copyAscii(true)),
        button(LABEL.copyLog, () => void this.#copyLog()),
        button(LABEL.copyAnalytics, () => void this.#copyAnalytics()),
        this.#copyNote,
      ]),
      el('h4', {}, [LABEL.golden]),
      el('div', {}, [
        button(LABEL.play, () => void this.#golden.run('play')),
        button(LABEL.step, () => void this.#golden.run('step')),
        button(LABEL.stop, () => this.#golden.stop()),
      ]),
      this.#goldenNote,
      el('h4', {}, [LABEL.fps]),
      this.#fpsText,
      this.#graph,
      el('h4', {}, [LABEL.events, ' ', button(LABEL.clear, () => this.#clearLog())]),
      this.#events,
    ]);
    // English developer labels (labels.ts): `lang` keeps the page's Turkish casing rules off the panel
    this.#root = el('div', { id: ROOT_ID, lang: 'en' }, [style, this.#toggle, this.#body]);
    for (const type of SWALLOWED) this.#root.addEventListener(type, (e) => e.stopPropagation());
    document.getElementById(ROOT_ID)?.remove();
    document.body.append(this.#root);
    this.#applyOpen();

    this.#raf = requestAnimationFrame((t) => this.#frame(t));

    this.api = Object.freeze({
      level: (id: number) => this.#openLevel(id, true),
      restart: () => this.restart(),
      ascii: (ids = false) => {
        const s = this.#bridge.session();
        return s ? toAscii(s.state, { ids }) : null;
      },
      events: () => this.#log.entries().map(formatEntry),
      rules: () => this.#rules,
      setRules: (patch: Partial<DebugRules>) => this.setRules(patch),
      golden: (mode: 'step' | 'play' = 'play', levelId?: number) => this.#golden.run(mode, levelId),
      stopGolden: () => this.#golden.stop(),
      toggle: (open?: boolean) => this.toggle(open),
      destroy: () => this.destroy(),
    });
  }

  toggle(open = !this.#ui.open): void {
    this.#ui.open = open;
    this.#saveUi(this.#ui);
    this.#applyOpen();
    this.#dirty = true;
  }

  /** New attempt of the running level (or level 1). */
  restart(): Promise<string | null> {
    return this.#openLevel(this.#bridge.session()?.lvl.id ?? 1, true);
  }

  /**
   * Changes the debug rules; the gravity override is written into the level data, and a running level is reopened
   * so the attempt runs under the new rules (its saved move log is replayed, or a new attempt starts).
   */
  async setRules(patch: Partial<DebugRules>): Promise<void> {
    const prev = this.#rules;
    this.#rules = Object.freeze({ ...prev, ...patch });
    this.#syncRuleControls();
    if (prev.yardGravity !== this.#rules.yardGravity || prev.buildGravity !== this.#rules.buildGravity)
      await applyGravityOverride(this.#rules);
    const id = this.#bridge.session()?.lvl.id;
    if (id === undefined) return;
    const err = await this.#bridge.openLevel(id, false);
    this.#rulesNote.textContent = err ?? LABEL.rulesHint;
    this.#rulesNote.className = err ? 'warn' : 'hint';
  }

  destroy(): void {
    cancelAnimationFrame(this.#raf);
    this.#golden.stop();
    this.#tap.uninstall();
    this.#root.remove();
  }

  // --- internals -------------------------------------------------------------------------------------------------------

  #select(options: readonly (readonly [string, string])[]): HTMLSelectElement {
    const s = el('select');
    for (const [value, text] of options) s.append(el('option', { value }, [text]));
    return s;
  }

  #applyOpen(): void {
    this.#body.hidden = !this.#ui.open;
    this.#toggle.setAttribute('aria-pressed', String(this.#ui.open));
  }

  async #openLevel(id: number, fresh: boolean): Promise<string | null> {
    const err = await this.#bridge.openLevel(id, fresh);
    this.#levelNote.textContent = err ?? '';
    return err;
  }

  #sessionStarted(session: GameSession, kind: 'start' | 'replay'): void {
    this.#log.clear();
    const n = session.log.length - 1;
    const rules = rulesActive(this.#rules) ? ' · debug rules on' : '';
    this.#log.note(
      n,
      kind === 'start'
        ? `start L${session.lvl.id} · moves ${session.movesLeft}${rules}`
        : `resume L${session.lvl.id} · ${n} actions replayed${rules}`,
    );
    this.#dirty = true;
  }

  #clearLog(): void {
    this.#log.clear();
    this.#dirty = true;
  }

  async #copyAscii(ids: boolean): Promise<void> {
    const s = this.#bridge.session();
    if (!s) return;
    const ok = await copyText(toAscii(s.state, { ids }), ids ? 'board (ids)' : 'board');
    this.#copyNote.textContent = ok ? LABEL.copied : LABEL.copyFailed;
  }

  /** TECH §12.3 "son 500 analytics olayı": the local analytics ring buffer (TECH §11.4), oldest first. */
  async #copyAnalytics(): Promise<void> {
    const records = appAnalytics().recent();
    const ok = await copyText(JSON.stringify(records), `analytics (${records.length} events)`);
    this.#copyNote.textContent = ok ? `${LABEL.copied} (${records.length})` : LABEL.copyFailed;
  }

  /** TECH §12.3 / §11.1 bug report: level + `levelHash` + action log. */
  async #copyLog(): Promise<void> {
    const s = this.#bridge.session();
    if (!s) return;
    const report = { levelId: s.lvl.id, levelHash: levelHash(s.lvl.data), actions: s.log };
    const ok = await copyText(JSON.stringify(report), 'move log');
    this.#copyNote.textContent = ok ? LABEL.copied : LABEL.copyFailed;
  }

  #syncRuleControls(): void {
    const r = this.#rules;
    this.#unlimited.checked = r.unlimitedMoves;
    this.#yard.value = r.yardGravity === null ? '' : r.yardGravity ? 'on' : 'off';
    this.#build.value = r.buildGravity ?? '';
    this.#rulesLevel = null; // obstacle switches are rebuilt on the next refresh
    this.#dirty = true;
  }

  /** The level's obstacle switches (rebuilt when the level changes). */
  #renderObstacles(session: GameSession | null): void {
    const id = session?.lvl.id ?? null;
    if (id === this.#rulesLevel) return;
    this.#rulesLevel = id;
    this.#obstacles.replaceChildren();
    if (!session) return;
    const switches = ruleSwitches(session.lvl);
    if (switches.length === 0) this.#obstacles.append(el('span', { class: 'hint' }, [LABEL.noRules]));
    for (const sw of switches) {
      const box = el('input', { type: 'checkbox' });
      box.checked = !this.#rules.disabledRules.has(sw.id);
      box.disabled = !sw.switchable;
      box.addEventListener('change', () => {
        const disabled = new Set<RuleId>(this.#rules.disabledRules);
        if (box.checked) disabled.delete(sw.id);
        else disabled.add(sw.id);
        void this.setRules({ disabledRules: disabled });
      });
      const text = sw.switchable ? ` ${sw.id}` : ` ${sw.id} (${LABEL.coreModel})`;
      this.#obstacles.append(el('label', {}, [box, el('span', {}, [text])]));
    }
  }

  #frame(t: number): void {
    if (this.#lastFrame > 0) this.#frames.push(t - this.#lastFrame);
    this.#lastFrame = t;
    if (t - this.#lastStats >= STATS_REFRESH_MS) {
      this.#lastStats = t;
      this.#renderStats();
      if (this.#bridge.session() !== this.#shown) this.#dirty = true;
    }
    if (this.#dirty && this.#ui.open) {
      this.#dirty = false;
      this.#render();
    }
    this.#raf = requestAnimationFrame((next) => this.#frame(next));
  }

  #renderStats(): void {
    const f = this.#frames;
    const fps = Math.round(f.fps);
    this.#toggle.textContent = `${LABEL.toggle} ${fps}`;
    if (!this.#ui.open) return;
    const phaser = this.#bridge.game.loop.actualFps;
    this.#fpsText.textContent =
      `${f.fps.toFixed(1)} fps (Phaser ${phaser.toFixed(1)}) · worst ${f.worstMs.toFixed(1)} ms · ` +
      `over ${FRAME_BUDGET_MS.toFixed(1)} ms: ${f.slowFrames}`;
    const ctx = this.#graph.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    const y = (ms: number): number => GRAPH_H - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * GRAPH_H;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, y(FRAME_BUDGET_MS));
    ctx.lineTo(GRAPH_W, y(FRAME_BUDGET_MS));
    ctx.stroke();
    const hist = f.history();
    const bar = GRAPH_W / f.capacity;
    hist.forEach((ms, i) => {
      ctx.fillStyle = ms > FRAME_BUDGET_MS + 1 ? '#ff7a59' : '#5ad17a';
      const top = y(ms);
      ctx.fillRect(i * bar, top, Math.max(1, bar - 0.5), GRAPH_H - top);
    });
  }

  #render(): void {
    const session = this.#bridge.session();
    this.#shown = session;
    this.#renderObstacles(session);
    if (!session) {
      this.#state.textContent = LABEL.noLevel;
      this.#board.textContent = '';
    } else {
      const s = session.state;
      const rules = rulesActive(this.#rules) ? ' · DEBUG RULES' : '';
      this.#state.textContent =
        `L${session.lvl.id} · ${session.outcome} · m ${session.movesMade} · left ${session.movesLeft}${rules}\n` +
        `gravity ${session.lvl.gravity.build}/${session.lvl.gravity.yard ? 'yard' : 'no yard'} · ` +
        `undo ${session.canUndo() ? 'yes' : 'no'} · offers ${session.offersUsed}\n` +
        `state ${hashHex(s)} · level ${levelHash(session.lvl.data)}`;
      this.#board.textContent = toAscii(s);
    }
    this.#events.textContent = [...this.#log.entries()].reverse().map(formatEntry).join('\n');
  }
}
