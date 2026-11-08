/**
 * Node side of the Playwright harness (docs/TECH_DESIGN.md §10.7, §12.2, §12.4): browser launch on the preinstalled
 * Chromium (`/opt/pw-browsers/chromium`, never `playwright install`), phone profiles, a CDP touch driver
 * (`Input.dispatchTouchEvent`: touchStart → 60 Hz touchMove → touchEnd, trusted events through Phaser's input manager)
 * and thin wrappers over `window.__harness` (src/harness/api.ts). Shared by tools/screens.ts, tools/perf.ts and
 * tests/e2e.
 */
import { chromium } from '@playwright/test';
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import type {
  ClientPoint,
  DragKind,
  DragMove,
  DragPlanOptions,
  HarnessState,
  HarnessStatus,
  PerfStats,
  TapTarget,
  TouchPlan,
} from '../../src/harness/api.ts';

/** Preinstalled Chromium (TECH §10.7 item 2; Playwright's own download is never used). */
export const CHROMIUM_PATH = '/opt/pw-browsers/chromium';

export interface Profile {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Phase 2 phone profiles (CSS px, DPR 3): iPhone 12–15 class and the common 360 × 800 Android. */
export const PROFILES: readonly Profile[] = [
  { name: '390x844', width: 390, height: 844, dpr: 3 },
  { name: '360x800', width: 360, height: 800, dpr: 3 },
];

/**
 * Short browser views (TECH §10.1: 390 × 844 inside Safari's bars is 390 × 763; a small Android at 360 × 740): the
 * tutorial bubble's placement there (review Faz 2 tur 2 #15). `npm run screens` shoots the level 1–5 starts in them.
 */
export const SHORT_PROFILES: readonly Profile[] = [
  { name: '390x763', width: 390, height: 763, dpr: 3 },
  { name: '360x740', width: 360, height: 740, dpr: 3 },
];

/**
 * Chrome DevTools "Fast 4G" preset (DevTools `NetworkManager`: 9 Mbit/s down, 1.5 Mbit/s up, 60 ms × 2.75 latency, both
 * throughputs × 0.9), bytes per second for CDP `Network.emulateNetworkConditions`.
 */
export const FAST_4G = {
  latency: 60 * 2.75,
  downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
} as const;

export type NetworkConditions = typeof FAST_4G;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
}

/** CDP touch input: one finger, coordinates in CSS px of the viewport. */
export class TouchDriver {
  private readonly cdp: CDPSession;
  private readonly page: Page;

  constructor(cdp: CDPSession, page: Page) {
    this.cdp = cdp;
    this.page = page;
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', p?: ClientPoint): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] : [],
    });
  }

  /**
   * Plays a planned gesture on its own clock (moves at `atMs` after the start). `release: false` keeps the finger down
   * on the last point (mid-drag screen shots); `release()` lifts it later. Pace `ack` waits for the renderer's ack of
   * every move (one move per rendered frame on a slow page); `clock` sends the moves at their times like a 60 Hz
   * digitizer and lets the browser coalesce them (perf), awaiting all acks before the release.
   */
  async gesture(plan: TouchPlan, release = true, pace: 'ack' | 'clock' = 'ack'): Promise<void> {
    const first = plan.moves[0]?.atMs ?? 0;
    await this.send('touchStart', plan.down);
    // The finger rests for the plan's lift hold in GAME time (`waitGameMs`): the press lifts by time and the offset
    // glide completes before the first move even when the game clock runs slower than the wall clock (CPU throttling,
    // software GPU), so no move is followed with a partial offset.
    await this.page.evaluate((ms) => window.__harness!.waitGameMs(ms), first);
    const t0 = performance.now() - first;
    const pending: Promise<void>[] = [];
    let failure: unknown = null;
    for (const m of plan.moves) {
      await sleep(t0 + m.atMs - performance.now());
      if (pace === 'ack') await this.send('touchMove', m);
      else
        pending.push(
          this.send('touchMove', m).catch((e: unknown) => {
            failure ??= e;
          }),
        );
    }
    await Promise.all(pending);
    if (failure) throw failure;
    await sleep(t0 + plan.upAtMs - performance.now());
    if (release) await this.release();
  }

  release(): Promise<void> {
    return this.send('touchEnd');
  }

  /** A held gesture goes back along its path to the start node and is released there: K-07 row 1, nothing spent. */
  async cancel(plan: TouchPlan, stepMs = 1000 / 60): Promise<void> {
    for (const p of plan.back) {
      await this.send('touchMove', p);
      await sleep(stepMs);
    }
    await sleep(stepMs * 4);
    await this.release();
  }

  async tap(p: ClientPoint, holdMs = 60): Promise<void> {
    await this.send('touchStart', p);
    await sleep(holdMs);
    await this.send('touchEnd');
  }
}

export interface GamePage {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly cdp: CDPSession;
  readonly touch: TouchDriver;
  /** Console errors and uncaught page errors seen so far. */
  readonly errors: string[];
  close(): Promise<void>;
}

export interface OpenOptions {
  /** Base URL of the harness server (no trailing slash). */
  readonly url: string;
  readonly profile: Profile;
  /** `prefers-reduced-motion: reduce` + `?reducedMotion=1` (screens: still frames, JUICE §0 rule 8). */
  readonly reducedMotion?: boolean;
  /** CDP `Emulation.setCPUThrottlingRate` (perf: 4). */
  readonly cpuRate?: number;
  readonly network?: NetworkConditions;
  /** Extra query parameters after `?harness=1`. */
  readonly query?: string;
  /** Wait for `window.__ready` (default true). */
  readonly waitReady?: boolean;
}

/** A fresh browser context (empty storage and cache) on the harness page. */
export async function openGame(browser: Browser, opts: OpenOptions): Promise<GamePage> {
  const { profile } = opts;
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: true,
    hasTouch: true,
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const gp = await attachGame(page, context);
  if (opts.cpuRate && opts.cpuRate !== 1)
    await gp.cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuRate });
  if (opts.network) {
    await gp.cdp.send('Network.enable');
    await gp.cdp.send('Network.emulateNetworkConditions', { offline: false, ...opts.network });
  }
  const rm = opts.reducedMotion ? '&reducedMotion=1' : '&reducedMotion=0';
  await page.goto(`${opts.url}/?harness=1${rm}${opts.query ?? ''}`);
  if (opts.waitReady !== false) await waitReady(page);
  return gp;
}

/** Wraps an existing page (Playwright test fixtures): console error capture, CDP session, touch driver. */
export async function attachGame(page: Page, context: BrowserContext): Promise<GamePage> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  const cdp = await context.newCDPSession(page);
  return { page, context, cdp, touch: new TouchDriver(cdp, page), errors, close: () => context.close() };
}

export async function waitReady(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(() => window.__ready === true && window.__harness !== undefined, null, {
    timeout: timeoutMs,
    polling: 100,
  });
}

// --- window.__harness wrappers ------------------------------------------------------------------------------------------

export const status = (page: Page): Promise<HarnessStatus> => page.evaluate(() => window.__harness!.status());
export const state = (page: Page): Promise<HarnessState> => page.evaluate(() => window.__harness!.state());
export const loadLevel = (page: Page, id: number): Promise<HarnessState> =>
  page.evaluate((n) => window.__harness!.loadLevel(n), id);
export const waitInteractive = (page: Page, id?: number, timeoutMs = 120_000): Promise<HarnessState> =>
  page.evaluate(([n, ms]) => window.__harness!.waitInteractive(ms, n ?? undefined), [
    id ?? null,
    timeoutMs,
  ] as const);
export const golden = (page: Page, id: number): Promise<DragMove[]> =>
  page.evaluate((n) => window.__harness!.golden(n), id);
export const findDrag = (page: Page, kind: DragKind): Promise<DragMove | null> =>
  page.evaluate((k) => window.__harness!.findDrag(k), kind);
export const planDrag = (page: Page, move: DragMove, opts: DragPlanOptions = {}): Promise<TouchPlan> =>
  page.evaluate(([m, o]) => window.__harness!.planDrag(m, o), [move, opts] as const);
export const perfStart = (page: Page, label: string): Promise<void> =>
  page.evaluate((l) => window.__harness!.perfStart(l), label);
export const perfStop = (page: Page): Promise<void> => page.evaluate(() => window.__harness!.perfStop());
export const perfStats = (page: Page, label: string): Promise<PerfStats | null> =>
  page.evaluate((l) => window.__harness!.perfStats(l), label);

/** Waits until the level window `kind` is open (`pause`, `exit`, `offer`, `loss`, `win`). */
export async function waitWindow(page: Page, kind: string, timeoutMs = 120_000): Promise<void> {
  await page.waitForFunction((k) => window.__harness!.status().window === k, kind, {
    timeout: timeoutMs,
    polling: 50,
  });
}

/** Waits until the attempt's log has more than `n` actions. */
export async function waitLog(page: Page, n: number, timeoutMs = 5_000): Promise<void> {
  await page.waitForFunction((k) => window.__harness!.status().logLength > k, n, {
    timeout: timeoutMs,
    polling: 30,
  });
}

/**
 * Taps a harness tap target (pause button, a text button) through the touch driver, once it is on screen and at rest
 * (the same point twice, 200 ms apart: window entries fade and slide in, JUICE #52 / #70 / #87).
 */
export async function tap(gp: GamePage, target: TapTarget, timeoutMs = 60_000): Promise<void> {
  const end = performance.now() + timeoutMs;
  let prev: ClientPoint | null = null;
  for (;;) {
    const p = await gp.page.evaluate((t) => window.__harness!.tapPoint(t), target);
    if (p && prev && Math.abs(p.x - prev.x) < 0.5 && Math.abs(p.y - prev.y) < 0.5) {
      await gp.touch.tap(p);
      return;
    }
    if (performance.now() > end) throw new Error(`tap target not on screen: ${JSON.stringify(target)}`);
    prev = p;
    await sleep(200);
  }
}

/**
 * Plays one drag move as a real touch gesture and checks that the scene committed exactly that move (log grows by one,
 * last action = `move`). Does not wait for the move's cues; `waitInteractive` / `waitWindow` do.
 */
export async function playMove(
  gp: GamePage,
  move: DragMove,
  opts: DragPlanOptions = {},
  pace: 'ack' | 'clock' = 'ack',
): Promise<void> {
  const before = (await status(gp.page)).logLength;
  const plan = await planDrag(gp.page, move, opts);
  await gp.touch.gesture(plan, true, pace);
  try {
    await waitLog(gp.page, before);
  } catch {
    throw new Error(`move not committed: ${JSON.stringify(move)} (log length ${before})`);
  }
  await assertLastMove(gp.page, move);
}

/** The attempt's last action is exactly `move` (the scene committed what the gesture planned). */
export async function assertLastMove(page: Page, move: DragMove): Promise<void> {
  const s = await state(page);
  const last = s.log[s.log.length - 1];
  const same =
    last?.kind === 'drag' &&
    last.pieceId === move.pieceId &&
    last.to.ix === move.to.ix &&
    last.to.iy === move.to.iy &&
    last.to.mode === move.to.mode;
  if (!same) throw new Error(`committed ${JSON.stringify(last)} instead of ${JSON.stringify(move)}`);
}

/** Plays `moves` in order, each after the board became interactive again (the last one's cues are not awaited). */
export async function playMoves(
  gp: GamePage,
  moves: readonly DragMove[],
  opts: DragPlanOptions = {},
): Promise<void> {
  for (const move of moves) {
    await waitInteractive(gp.page);
    await playMove(gp, move, opts);
  }
}
