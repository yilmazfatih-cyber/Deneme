/**
 * Playwright harness (docs/TECH_DESIGN.md §1.2, §10.7, §12.2, §12.4, §14.1 #15; R-20): `window.__harness` for
 * tools/screens.ts, tools/perf.ts and tests/e2e. Loaded only by `vite build --mode harness` (main.ts guards the dynamic
 * import with `import.meta.env.MODE`), never in the store/web bundle (tools/verify-dist.ts checks dist/).
 *
 * The harness reads the game and plans gestures; it never changes the game state itself and decides no rule:
 * - levels start through the scene manager like the home button does (`Level` scene, `{ levelId }`);
 * - moves are played as touch gestures through the real input path (Phaser input → DragController → core); the
 *   gesture is planned from core queries (BFS path, plan.ts) and dispatched by the tool (CDP) or in the page
 *   (synthetic.ts);
 * - "reduce motion" goes through the settings stub `changeSetting` (JUICE §0 rule 8);
 * - state reads are core read-only functions (`toAscii`, `hashHex`, `queueIds`) and the scene's public getters.
 *
 * Page flags: `window.__ready` (boot finished + fonts loaded, TECH §12.2), `window.__levelInteractive` (ms since
 * navigation start when the level screen first took input, the FTUE gate of TECH §10.7 item 6).
 * URL parameters: `reducedMotion=1|0`, `level=N` (start level N after the boot), `autoplay=golden` (with `level`:
 * play the hand golden in the page), `cvd=protanopia|deuteranopia|tritanopia` (colour-vision simulation on `#game`,
 * screens `--cvd`).
 */
import Phaser from 'phaser';
import { scaleMode } from '../config/display.ts';
import { toAscii } from '../core/ascii.ts';
import { hashHex } from '../core/hash.ts';
import { levelHooks } from '../core/obstacles/registry.ts';
import { queueIds } from '../core/state.ts';
import { appSave, changeSetting } from '../scenes/appServices.ts';
import { DEPTH } from '../scenes/level/depth.ts';
import { LEVEL_SCENE_KEY } from '../scenes/level/LevelScene.ts';
import type { LevelScene, LevelSceneData } from '../scenes/level/LevelScene.ts';
import type { JuiceId } from '../scenes/level/juice/catalog.ts';
import { tDynamic, upper } from '../services/i18n.ts';
import { createLayout, designHeight } from '../theme/layout.ts';
import type { Layout } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import type {
  ClientPoint,
  DragKind,
  DragMove,
  DragPlanOptions,
  HarnessApi,
  HarnessState,
  HarnessStatus,
  TapTarget,
  TouchPlan,
  TutorialInfo,
} from './api.ts';
import { goldenMoves } from './golden.ts';
import { PerfSampler } from './perf.ts';
import { planDragDesign } from './plan.ts';
import type { DesignPoint } from './plan.ts';
import { findDragOn } from './search.ts';
import { dispatchGesture } from './synthetic.ts';
import { applyCvd, isCvdKind } from './cvd.ts';
import { PALETTE_SCENE_KEY, PaletteScene } from './palette.ts';
import type { IntroScene } from '../scenes/IntroScene.ts';

const BOOT_SCENE_KEY = 'Boot';
const INTRO_SCENE_KEY = 'Intro';
const DEFAULT_WAIT_MS = 20_000;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

async function waitFor(pred: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const end = performance.now() + timeoutMs;
  while (!pred()) {
    if (performance.now() > end) throw new Error(`harness: timed out waiting for ${what}`);
    await nextFrame();
  }
}

export function installHarness(game: Phaser.Game): HarnessApi {
  const sampler = new PerfSampler(game);
  /** TECH §10.4: how many times the level scene ran `create` (a home round trip wakes it, review Faz 2 tur 1 #17). */
  let levelCreates = 0;
  let levelHooked = false;
  const hookLevel = (): void => {
    if (levelHooked) return;
    const lv = game.scene.getScene(LEVEL_SCENE_KEY);
    if (!lv) return;
    levelHooked = true;
    if (game.scene.isActive(LEVEL_SCENE_KEY) || game.scene.isSleeping(LEVEL_SCENE_KEY)) levelCreates += 1;
    lv.sys.events.on(Phaser.Scenes.Events.CREATE, () => {
      levelCreates += 1;
    });
  };
  /** Game clock: sum of Phaser's smoothed frame deltas (what the scenes' `update(time, delta)` receive). */
  let gameClock = 0;
  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    gameClock += game.loop.delta;
  });
  const waitGameMs = async (ms: number): Promise<void> => {
    const start = gameClock;
    await waitFor(() => gameClock - start >= ms, DEFAULT_WAIT_MS * 6, `${ms} ms of game time`);
  };

  const activeKey = (): string | null => game.scene.getScenes(true)[0]?.sys.settings.key ?? null;
  const bootDone = (): boolean => !game.scene.isActive(BOOT_SCENE_KEY) && activeKey() !== null;
  const fontsReady = (): boolean => document.fonts.status === 'loaded';

  /** The level scene while it runs (its views exist once `create` ran). */
  const level = (): LevelScene | null => {
    if (!game.scene.isActive(LEVEL_SCENE_KEY)) return null;
    const lv = game.scene.getScene(LEVEL_SCENE_KEY) as LevelScene | null;
    return lv && (lv.eventPlayer as LevelScene['eventPlayer'] | undefined) ? lv : null;
  };

  /** Same layout as the scenes build (`createLayout` over the EXPAND design height, D-015). */
  const layout = (): Layout => {
    const parent = game.scale.parentSize;
    const vp =
      parent.width > 0 && parent.height > 0
        ? { width: parent.width, height: parent.height }
        : { width: game.scale.width, height: game.scale.height };
    return createLayout(TOKENS, designHeight(scaleMode, vp, TOKENS));
  };

  /** Design px → CSS px of the viewport (inverse of Phaser `ScaleManager.transformX/Y`). */
  const toClient = (p: DesignPoint): ClientPoint => {
    const sm = game.scale;
    sm.updateBounds();
    const b = sm.canvasBounds;
    const d = sm.displayScale;
    return { x: round2(b.x - window.scrollX + p.x / d.x), y: round2(b.y - window.scrollY + p.y / d.y) };
  };

  /** A window object (dim, panel) still shows: an open one, or one closing (JUICE #71) whose dim takes touches. */
  const windowShown = (lv: LevelScene): boolean =>
    lv.children.list.some((obj) => {
      const o = obj as Phaser.GameObjects.GameObject & { depth?: number; visible?: boolean; alpha?: number };
      return (o.depth ?? 0) >= DEPTH.windows && o.visible !== false && (o.alpha ?? 1) > 0;
    });

  const interactive = (lv: LevelScene | null): boolean => {
    const session = lv?.gameSession;
    if (!lv || !session || session.outcome !== 'playing') return false;
    if (lv.openWindow !== null || windowShown(lv)) return false;
    const player = lv.eventPlayer;
    return !player.locked && !player.busy;
  };

  const tutorialInfo = (lv: LevelScene): TutorialInfo | null => {
    const step = lv.tutorialController?.current ?? null;
    if (!step) return null;
    return {
      index: step.index,
      required: step.required,
      pieces: [...step.pieces],
      textKey: step.data.textKey,
    };
  };

  const rendererName = (): HarnessState['renderer'] => {
    const type = game.renderer?.type;
    if (type === Phaser.WEBGL) return 'webgl';
    if (type === Phaser.CANVAS) return 'canvas';
    if (type === Phaser.HEADLESS) return 'headless';
    return 'unknown';
  };

  const status = (): HarnessStatus => {
    const lv = level();
    const session = lv?.gameSession ?? null;
    return {
      scene: activeKey(),
      ready: bootDone() && fontsReady(),
      levelId: session ? session.state.lvl.id : null,
      outcome: session?.outcome ?? null,
      movesMade: session?.movesMade ?? null,
      logLength: session ? session.log.length : 0,
      window: lv?.openWindow ?? null,
      interactive: interactive(lv),
    };
  };

  /** Objects of the active scene's display list, containers walked; `visible` = visible with all parents. */
  const objectCount = (): { total: number; visible: number } => {
    const scene = game.scene.getScenes(true)[0];
    let total = 0;
    let visible = 0;
    const visit = (obj: Phaser.GameObjects.GameObject, shown: boolean): void => {
      const o = obj as Phaser.GameObjects.GameObject & { visible?: boolean; alpha?: number };
      const on = shown && o.visible !== false && (o.alpha ?? 1) > 0;
      total += 1;
      if (on) visible += 1;
      if (obj instanceof Phaser.GameObjects.Container) for (const child of obj.list) visit(child, on);
    };
    for (const obj of scene?.children.list ?? []) visit(obj, true);
    return { total, visible };
  };

  const state = (): HarnessState => {
    const lv = level();
    const session = lv?.gameSession ?? null;
    const s = session?.state ?? null;
    const il = appSave().data.inLevel;
    const log = session?.log ?? [];
    return {
      ...status(),
      renderer: rendererName(),
      designHeight: layout().H,
      displayScale: round2(1 / game.scale.displayScale.x),
      movesLeft: session?.movesLeft ?? null,
      log,
      ascii: s ? toAscii(s) : null,
      hash: s ? hashHex(s) : null,
      queue: s ? queueIds(s) : [],
      busy: lv?.eventPlayer.busy ?? false,
      locked: lv?.eventPlayer.locked ?? false,
      tutorial: lv ? tutorialInfo(lv) : null,
      lives: { stored: appSave().data.lives.stored, reserved: appSave().data.lives.reserved },
      savedAttempt: il ? { levelId: il.levelId, actions: il.actions.length } : null,
      reducedMotion: lv?.eventPlayer.reduced ?? appSave().data.settings.reduceMotion,
      levelCreates,
      objects: objectCount(),
    };
  };

  const running = (): LevelScene => {
    const lv = level();
    if (!lv?.gameSession) throw new Error('harness: no level is running');
    return lv;
  };

  const waitInteractive = async (timeoutMs = DEFAULT_WAIT_MS * 6, id?: number): Promise<HarnessState> => {
    await waitFor(
      () => {
        const lv = level();
        return interactive(lv) && (id === undefined || lv?.gameSession?.state.lvl.id === id);
      },
      timeoutMs,
      id === undefined ? 'an interactive level' : `level ${id} to be interactive`,
    );
    return state();
  };

  const planDrag = (move: DragMove, opts: DragPlanOptions = {}): TouchPlan => {
    const lv = running();
    const s = lv.gameSession?.state;
    if (!s) throw new Error('harness: no level is running');
    const L = layout();
    const plan = planDragDesign(
      s,
      move,
      levelHooks(s.lvl).drag ?? {},
      L.grid,
      {
        holdMs: TOKENS.drag.holdMs,
        fingerOffsetMs: TOKENS.duration.fingerOffset,
        fingerOffsetCells: TOKENS.drag.fingerOffsetCells,
        hitSlopPx: L.touch.hitSlopPx,
      },
      opts,
    );
    return {
      pieceId: plan.pieceId,
      to: plan.to,
      nodes: plan.nodes.length,
      down: toClient(plan.down),
      moves: plan.moves.map((m) => ({ ...toClient(m), atMs: round2(m.atMs) })),
      upAtMs: round2(plan.upAtMs),
      back: plan.back.map(toClient),
    };
  };

  /** Visible text object showing `t(key)` (or its upper-cased form), the top-most one; its centre. */
  const textPoint = (key: string, params?: Readonly<Record<string, string | number>>): ClientPoint | null => {
    const scene = game.scene.getScenes(true)[0];
    if (!scene) return null;
    const wanted = tDynamic(key, params);
    const texts = new Set([wanted, upper(wanted)]);
    let best: { p: DesignPoint; depth: number } | null = null;
    const visit = (obj: Phaser.GameObjects.GameObject, depth: number, visible: boolean): void => {
      const o = obj as Phaser.GameObjects.GameObject & { visible?: boolean; alpha?: number; depth?: number };
      const shown = visible && o.visible !== false && (o.alpha ?? 1) > 0;
      const d = depth >= 0 ? depth : (o.depth ?? 0);
      if (obj instanceof Phaser.GameObjects.Container) {
        for (const child of obj.list) visit(child, d, shown);
        return;
      }
      if (!shown || !(obj instanceof Phaser.GameObjects.Text) || !texts.has(obj.text)) return;
      const r = obj.getBounds();
      if (!best || d >= best.depth) best = { p: { x: r.centerX, y: r.centerY }, depth: d };
    };
    for (const obj of scene.children.list) visit(obj, -1, true);
    const found = best as { p: DesignPoint; depth: number } | null;
    return found ? toClient(found.p) : null;
  };

  const tapPoint = (target: TapTarget): ClientPoint | null => {
    if (target.kind === 'pause') {
      if (!level()) return null;
      const r = layout().top.pause;
      return toClient({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    }
    if (target.kind === 'trowel') {
      const lv = level();
      return lv ? toClient(lv.trowelPoint) : null;
    }
    if (target.kind === 'close') {
      const p = level()?.windowClosePoint ?? null;
      return p ? toClient(p) : null;
    }
    return textPoint(target.key, target.params);
  };

  const api: HarnessApi = {
    version: 1,
    status,
    state,
    async loadLevel(id: number): Promise<HarnessState> {
      await waitFor(bootDone, DEFAULT_WAIT_MS, 'the boot');
      const saved = appSave().data.inLevel;
      if (saved && saved.levelId !== id)
        throw new Error(
          `harness: an attempt of level ${saved.levelId} is saved (K-43: one attempt at a time)`,
        );
      for (const sc of game.scene.getScenes(true)) {
        const key = sc.sys.settings.key;
        if (key !== LEVEL_SCENE_KEY) game.scene.stop(key);
      }
      game.scene.start(LEVEL_SCENE_KEY, { levelId: id } satisfies LevelSceneData);
      // resolves once the level is loaded and baked (a saved attempt of this level resumes on its window, K-43);
      // the first board fall still plays: `waitInteractive` waits for the board
      await waitFor(
        () => level()?.gameSession?.state.lvl.id === id,
        DEFAULT_WAIT_MS * 6,
        `level ${id} to start`,
      );
      return state();
    },
    waitInteractive,
    golden: goldenMoves,
    findDrag(kind: DragKind) {
      const lv = running();
      const s = lv.gameSession?.state;
      if (!s) return null;
      const tut = tutorialInfo(lv);
      const allowed = tut?.required ? new Set(tut.pieces) : null;
      return findDragOn(s, levelHooks(s.lvl), kind, allowed);
    },
    planDrag,
    tapPoint,
    waitGameMs,
    cueCount(id: number): number {
      return level()?.eventPlayer.cueRuns.get(id as JuiceId) ?? 0;
    },
    async waitCue(id: number, after: number): Promise<void> {
      await waitFor(
        () => (level()?.eventPlayer.cueRuns.get(id as JuiceId) ?? 0) > after,
        DEFAULT_WAIT_MS * 6,
        `JUICE cue #${id}`,
      );
    },
    setReducedMotion(on: boolean): void {
      changeSetting('reduceMotion', on);
    },
    async playInPage(moves: readonly DragMove[], opts: DragPlanOptions = {}): Promise<void> {
      for (const move of moves) {
        await waitInteractive();
        await dispatchGesture(game.canvas, planDrag(move, opts), game.device.input.touch, waitGameMs);
      }
    },
    async introPanel(n: number): Promise<void> {
      await waitFor(() => activeKey() === INTRO_SCENE_KEY, DEFAULT_WAIT_MS, 'the intro');
      (game.scene.getScene(INTRO_SCENE_KEY) as IntroScene).holdPanel(n);
      await waitGameMs(TOKENS.duration.panelEnter + 100);
    },
    async showPalette(): Promise<void> {
      await waitFor(bootDone, DEFAULT_WAIT_MS, 'the boot');
      for (const sc of game.scene.getScenes(false)) {
        const key = sc.sys.settings.key;
        if (key !== PALETTE_SCENE_KEY && (game.scene.isActive(key) || game.scene.isSleeping(key)))
          game.scene.stop(key);
      }
      if (!game.scene.getScene(PALETTE_SCENE_KEY)) game.scene.add(PALETTE_SCENE_KEY, PaletteScene, false);
      game.scene.start(PALETTE_SCENE_KEY);
      await waitFor(() => activeKey() === PALETTE_SCENE_KEY, DEFAULT_WAIT_MS, 'the palette');
      await waitGameMs(200);
    },
    perfStart: (label: string) => sampler.start(label),
    perfStop: () => sampler.stop(),
    perfStats: (label: string) => sampler.stats(label),
    perfReset: () => sampler.reset(),
  };

  window.__harness = api;
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    hookLevel();
    if (!window.__ready && bootDone() && fontsReady()) window.__ready = true;
    if (window.__introShown === undefined && activeKey() === INTRO_SCENE_KEY)
      window.__introShown = round2(performance.now());
    if (window.__levelShown === undefined && level()?.gameSession)
      window.__levelShown = round2(performance.now());
    if (window.__levelInteractive === undefined && interactive(level()))
      window.__levelInteractive = round2(performance.now());
  });

  const q = new URLSearchParams(window.location.search);
  const cvd = q.get('cvd');
  if (isCvdKind(cvd)) applyCvd(cvd);
  const rm = q.get('reducedMotion');
  if (rm === '1' || rm === '0') api.setReducedMotion(rm === '1');
  const lvl = Number(q.get('level'));
  if (Number.isInteger(lvl) && lvl > 0) {
    void api
      .loadLevel(lvl)
      .then(() => (q.get('autoplay') === 'golden' ? api.playInPage(goldenMoves(lvl)) : undefined))
      .catch((e: unknown) => console.error(e));
  }
  return api;
}
