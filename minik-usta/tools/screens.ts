/**
 * `npm run screens` (= `vite build --mode harness && node tools/screens.ts`): screen shots of the Phase 2 slice for the
 * design-lead review (docs/TECH_DESIGN.md §12.2, §14.1 #15; CLAUDE.md "Bitti tanımı": 390 × 844 and 360 × 800).
 *
 * Every scenario starts in a fresh browser context (empty storage: first launch) on the harness build served by
 * `vite preview --mode harness`, with reduced motion on (still frames, JUICE §0 rule 8), and reaches its screens only
 * through the game's own input path: taps and drags are CDP touch gestures (tools/lib/harnessClient.ts) planned by
 * `window.__harness` from core queries; nothing writes the game state. A held drag (shadow shots) goes back to its
 * start before the release, so it spends no move (K-07 row 1).
 *
 * Output: artifacts/screens/<profile>/<name>.png. The short views 390 × 763 and 360 × 740 (`SHORT_PROFILES`) get the
 * `start1`…`start5` scenarios only (one fresh context each): the level 1–5 start screens, where the first tutorial
 * step's bubble is placed (review Faz 2 tur 2 #15). Options: `--profile 390x844|360x800|390x763|360x740` (default all),
 * `--only <name-prefix>[,…]` (scenarios that produce a matching shot), `--cvd protanopia,deuteranopia,tritanopia|all`
 * (TECH §12.2: the same shots through a Machado 2009 colour-vision filter on `#game`, into
 * artifacts/screens/<profile>-<cvd>/).
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import type { DragKind, DragMove, DragPlanOptions } from '../src/harness/api.ts';
import { CVD_KINDS, isCvdKind } from '../src/harness/cvd.ts';
import type { CvdKind } from '../src/harness/cvd.ts';
import {
  PROFILES,
  SHORT_PROFILES,
  findDrag,
  golden,
  state,
  waitLog,
  launchBrowser,
  loadLevel,
  openGame,
  planDrag,
  playMove,
  playMoves,
  status,
  tap,
  waitInteractive,
  waitReady,
  waitWindow,
} from './lib/harnessClient.ts';
import type { GamePage, Profile } from './lib/harnessClient.ts';
import { startHarnessServer } from './lib/harnessServer.ts';
import { ROOT } from './lib/levels.ts';

const OUT = join(ROOT, 'artifacts', 'screens');
/** Fewer, coarser moves than the 60 Hz perf gesture: the headless frame pace is slow (SwiftShader). */
const SHOT_DRAG: DragPlanOptions = { speedCellsPerSec: 8, frameMs: 100, endHoldMs: 250 };
/**
 * Game time (ms) before a shot: the first board fall (400 ms) and the window entries (#70 / #52 / #87) in their reduced
 * variants (`duration.reducedFade` 150 ms, options 40 ms apart). Game time, not wall time: on a slow headless frame
 * pace Phaser caps the frame delta, so the game clock runs slower than the wall clock (`__harness.waitGameMs`).
 */
const SETTLE_MS = 500;
const MAX_YARD_MOVES = 40;

type Shoot = (name: string) => Promise<void>;

interface Scenario {
  readonly id: string;
  /** Shot names the scenario produces (for `--only`). */
  readonly shots: readonly string[];
  readonly run: (gp: GamePage, shoot: Shoot) => Promise<void>;
}

async function settle(gp: GamePage, ms = SETTLE_MS): Promise<void> {
  await gp.page.evaluate((t) => window.__harness!.waitGameMs(t), ms);
}

/** Holds a drag of `kind` (or `move`) on its target, shoots, then cancels it back to its start. */
async function heldDrag(gp: GamePage, shoot: Shoot, name: string, what: DragKind | DragMove): Promise<void> {
  await waitInteractive(gp.page);
  const move = typeof what === 'string' ? await findDrag(gp.page, what) : what;
  if (!move) throw new Error(`${name}: no ${String(what)} drag on this board`);
  const plan = await planDrag(gp.page, move, SHOT_DRAG);
  await gp.touch.gesture(plan, false);
  await settle(gp, 300);
  await shoot(name);
  await gp.touch.cancel(plan, 100);
}

/**
 * Pause (optional shot of the normal Pause window, UX §5.1) → "Bölümden çık" → shot of the exit confirm (K-43 item 2)
 * → "Çık": a scenario continues with a new attempt (m = 0: free exit, home) or ends (m ≥ 1: the loss window). "Kal" and
 * × go back to the Pause window (tests/e2e/smoke.spec.ts).
 */
async function exitConfirm(gp: GamePage, shoot: Shoot, name: string, pauseShot?: string): Promise<void> {
  await waitInteractive(gp.page);
  await tap(gp, { kind: 'pause' });
  await waitWindow(gp.page, 'pause');
  await settle(gp, 300);
  if (pauseShot) await shoot(pauseShot);
  await tap(gp, { kind: 'text', key: 'pause.exit' });
  await waitWindow(gp.page, 'exit');
  await settle(gp);
  await shoot(name);
  await tap(gp, { kind: 'text', key: 'exit.leave' });
}

/** The win screen's "Devam" → the minimal home screen (UX §6 "Faz 2 dikey dilimi"). */
async function continueHome(gp: GamePage): Promise<void> {
  await tap(gp, { kind: 'text', key: 'common.continue' });
  await gp.page.waitForFunction(() => window.__harness!.status().scene === 'Home', null, { timeout: 60_000 });
  await settle(gp);
}

/**
 * The short views' scenarios: the start screen of every slice level (tutorial step 1 + its Usta Dede bubble), one fresh
 * context per level — the first `loadLevel` saves an attempt and the harness loads no other level over it (K-43: one
 * attempt at a time).
 */
const STARTS: readonly Scenario[] = [
  '02-l1-start',
  '03-l2-start',
  '04-l3-start',
  '05-l4-start',
  '06-l5-start',
].map((name, i) => ({
  id: `start${i + 1}`,
  shots: [name],
  run: async (gp, shoot) => {
    await loadLevel(gp.page, i + 1);
    await settle(gp);
    await shoot(name);
  },
}));

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'intro',
    shots: ['01a-intro', '01b-intro', '01c-intro'],
    run: async (gp, shoot) => {
      // each panel held by the harness (the intro advances on the wall clock otherwise; review Faz 2 tur 1 #10)
      for (const [i, name] of ['01a-intro', '01b-intro', '01c-intro'].entries()) {
        await gp.page.evaluate((n) => window.__harness!.introPanel(n), i);
        await shoot(name);
      }
    },
  },
  {
    id: 'palette',
    shots: ['19-palette'],
    run: async (gp, shoot) => {
      await gp.page.evaluate(() => window.__harness!.showPalette());
      await shoot('19-palette');
    },
  },
  {
    id: 'level1',
    shots: ['02-l1-start', '18-tutorial-l1', '12-win', '20-home-l2'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 1);
      await settle(gp);
      await shoot('02-l1-start');
      const moves = await golden(gp.page, 1);
      await playMoves(gp, moves.slice(0, 1), SHOT_DRAG);
      await waitInteractive(gp.page);
      await settle(gp);
      await shoot('18-tutorial-l1');
      await playMoves(gp, moves.slice(1), SHOT_DRAG);
      await waitWindow(gp.page, 'win', 300_000);
      await settle(gp, 800);
      await shoot('12-win');
      // UX §2.2 step 11: "BÖLÜM 2" pulses (reduced motion: a steady gold edge, JUICE §0 rule 8)
      await continueHome(gp);
      await shoot('20-home-l2');
    },
  },
  {
    id: 'level2',
    shots: [
      '03-l2-start',
      '07-drag-correct',
      '08-drag-wrong',
      '23-cancel-preview',
      '22-pause',
      '15-exit-m0',
      '16-exit-m1',
    ],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 2);
      await settle(gp);
      await shoot('03-l2-start');
      await heldDrag(gp, shoot, '07-drag-correct', 'correct');
      await heldDrag(gp, shoot, '08-drag-wrong', 'wrong');
      await heldDrag(gp, shoot, '23-cancel-preview', 'cancel');
      await exitConfirm(gp, shoot, '15-exit-m0', '22-pause');
      // m = 0: a free exit (home); a new attempt of the same level
      await gp.page.waitForFunction(() => window.__harness!.status().scene === 'Home', null, {
        timeout: 30_000,
      });
      await loadLevel(gp.page, 2);
      const moves = await golden(gp.page, 2);
      await playMoves(gp, moves.slice(0, 1), SHOT_DRAG);
      await exitConfirm(gp, shoot, '16-exit-m1');
    },
  },
  {
    id: 'lose',
    shots: ['13-lose-1-offer', '14-lose-2-life'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 2);
      // K-29: spend every move until the out-of-moves window opens — a yard reposition (K-10) when the yard has room,
      // else a wrong placement that bounces back (K-17); level 2's yard starts full
      for (let i = 0; i < MAX_YARD_MOVES; i++) {
        await gp.page.waitForFunction(
          () => {
            const s = window.__harness!.status();
            return s.interactive || s.window !== null;
          },
          null,
          { timeout: 120_000, polling: 50 },
        );
        if ((await status(gp.page)).window === 'offer') break;
        const move = (await findDrag(gp.page, 'yard')) ?? (await findDrag(gp.page, 'wrong'));
        if (!move) throw new Error('13-lose-1-offer: no move that spends a move without placing');
        await playMove(gp, move, SHOT_DRAG);
      }
      await waitWindow(gp.page, 'offer');
      await settle(gp, 800);
      await shoot('13-lose-1-offer');
      await tap(gp, { kind: 'text', key: 'lose.decline' });
      await waitWindow(gp.page, 'loss');
      await settle(gp, 800);
      await shoot('14-lose-2-life');
    },
  },
  {
    id: 'resume',
    shots: ['17-resume-strip'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 2);
      const moves = await golden(gp.page, 2);
      await playMoves(gp, moves.slice(0, 1), SHOT_DRAG);
      await waitInteractive(gp.page);
      // K-43: the attempt was written at the commit; a reload resumes it on the Pause window with the strip (#87)
      await gp.page.reload();
      await waitReady(gp.page);
      await waitWindow(gp.page, 'pause');
      await settle(gp, 800);
      await shoot('17-resume-strip');
    },
  },
  {
    id: 'level3',
    shots: ['04-l3-start', '09-drag-support-k34', '24-bounce-support', '10-drag-rail-gap'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 3);
      await settle(gp);
      await shoot('04-l3-start');
      await heldDrag(gp, shoot, '09-drag-support-k34', 'support');
      // K-17 / K-34 hook 3: the same release, let go — the bounce with the JUICE #84 missing-support flash
      const support = await findDrag(gp.page, 'support');
      if (!support) throw new Error('24-bounce-support: no support drag');
      const before = (await status(gp.page)).logLength;
      const flashes = await gp.page.evaluate(() => window.__harness!.cueCount(84));
      await gp.touch.gesture(await planDrag(gp.page, support, SHOT_DRAG));
      await waitLog(gp.page, before, 20_000);
      // inside #84 (it starts after the bounce): its first blink peaks 100 ms in; the reduced hatch is steady 600 ms
      await gp.page.evaluate((n) => window.__harness!.waitCue(84, n), flashes);
      await settle(gp, 100);
      await shoot('24-bounce-support');
      const moves = await golden(gp.page, 3);
      await playMoves(gp, moves.slice(0, 1), SHOT_DRAG);
      const rail = moves[1];
      if (!rail || rail.to.mode === 0)
        throw new Error('10-drag-rail-gap: golden move 2 of level 3 is not a rail move');
      await heldDrag(gp, shoot, '10-drag-rail-gap', rail);
    },
  },
  {
    id: 'level4',
    shots: ['05-l4-start'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 4);
      await settle(gp);
      await shoot('05-l4-start');
    },
  },
  {
    id: 'level5',
    shots: ['06-l5-start', '11-truck-chip-l5', '25-trowel-pick', '21-home-more-soon'],
    run: async (gp, shoot) => {
      await loadLevel(gp.page, 5);
      await settle(gp);
      await shoot('06-l5-start');
      const moves = await golden(gp.page, 5);
      // LEVELS §2 level 5, move 3 completes segment 1: the truck brings batch 1, one block waits ("Kamyonda: 1")
      await playMoves(gp, moves.slice(0, 3), SHOT_DRAG);
      await waitInteractive(gp.page, 5, 300_000);
      await settle(gp, 800);
      await shoot('11-truck-chip-l5');
      // the 4th correct placement in a row earns a Golden Trowel (K-33): its pick mode (UX §5.2, JUICE #16 / #17)
      await playMoves(gp, moves.slice(3, 4), SHOT_DRAG);
      await waitInteractive(gp.page, 5, 300_000);
      await tap(gp, { kind: 'trowel' });
      await settle(gp, 400);
      await shoot('25-trowel-pick');
      await tap(gp, { kind: 'text', key: 'common.cancel' });
      await settle(gp, 300);
      await playMoves(gp, moves.slice(4), SHOT_DRAG);
      await waitWindow(gp.page, 'win', 300_000);
      await settle(gp, 800);
      if ((await state(gp.page)).outcome !== 'won') throw new Error('level 5 not won');
      // the slice is finished once: home shows `home.moreSoon` and opens level 1 (1–5 loop, UX §6)
      await continueHome(gp);
      await shoot('21-home-more-soon');
    },
  },
];

interface Result {
  readonly profile: string;
  readonly scenario: string;
  readonly shots: string[];
  readonly ms: number;
  readonly error: string | null;
  readonly consoleErrors: readonly string[];
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function runScenario(
  browser: Browser,
  url: string,
  profile: Profile,
  sc: Scenario,
  cvd: CvdKind | null,
): Promise<Result> {
  const t0 = Date.now();
  const shots: string[] = [];
  const outName = cvd ? `${profile.name}-${cvd}` : profile.name;
  const dir = join(OUT, outName);
  mkdirSync(dir, { recursive: true });
  rmSync(join(dir, `_failed-${sc.id}.png`), { force: true });
  let gp: GamePage | null = null;
  try {
    gp = await openGame(browser, {
      url,
      profile,
      reducedMotion: true,
      ...(cvd ? { query: `&cvd=${cvd}` } : {}),
    });
    const page = gp.page;
    await sc.run(gp, async (name) => {
      await page.screenshot({ path: join(dir, `${name}.png`) });
      shots.push(name);
    });
    return {
      profile: outName,
      scenario: sc.id,
      shots,
      ms: Date.now() - t0,
      error: null,
      consoleErrors: gp.errors,
    };
  } catch (e) {
    const error = e instanceof Error ? (e.message.split('\n')[0] ?? String(e)) : String(e);
    if (gp) await gp.page.screenshot({ path: join(dir, `_failed-${sc.id}.png`) }).catch(() => undefined);
    return {
      profile: outName,
      scenario: sc.id,
      shots,
      ms: Date.now() - t0,
      error,
      consoleErrors: gp?.errors ?? [],
    };
  } finally {
    await gp?.close();
  }
}

async function main(): Promise<number> {
  const profileName = arg('--profile');
  const only = arg('--only')?.split(',') ?? null;
  const profiles = [...PROFILES, ...SHORT_PROFILES].filter((p) => !profileName || p.name === profileName);
  if (profiles.length === 0) throw new Error(`unknown profile ${profileName}`);
  const wanted = (s: Scenario): boolean => !only || s.shots.some((n) => only.some((o) => n.startsWith(o)));
  const scenariosOf = (p: Profile): readonly Scenario[] =>
    SHORT_PROFILES.includes(p) ? STARTS.filter(wanted) : SCENARIOS.filter(wanted);
  const cvdArg = arg('--cvd');
  const cvds: (CvdKind | null)[] =
    cvdArg === null ? [null] : cvdArg === 'all' ? [...CVD_KINDS] : cvdArg.split(',').filter(isCvdKind);
  if (cvdArg !== null && cvds.length === 0)
    throw new Error(`unknown --cvd ${cvdArg} (${CVD_KINDS.join(', ')}, all)`);
  const server = await startHarnessServer();
  const browser = await launchBrowser();
  const results: Result[] = [];
  try {
    for (const cvd of cvds) {
      for (const profile of profiles) {
        for (const sc of scenariosOf(profile)) {
          const r = await runScenario(browser, server.url, profile, sc, cvd);
          results.push(r);
          const mark = r.error ? 'FAIL' : 'ok  ';
          process.stdout.write(
            `${mark} ${r.profile.padEnd(8)} ${sc.id.padEnd(8)} ${(r.ms / 1000).toFixed(1).padStart(6)} s  ${r.shots.join(', ')}${r.error ? `  — ${r.error}` : ''}\n`,
          );
          for (const c of r.consoleErrors) process.stdout.write(`     console error: ${c}\n`);
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const shots = results.reduce((n, r) => n + r.shots.length, 0);
  const failed = results.filter((r) => r.error !== null || r.consoleErrors.length > 0);
  process.stdout.write(
    `screens: ${shots} shots in ${OUT}/<profile>/, ${failed.length} scenario(s) with errors\n`,
  );
  return failed.length === 0 ? 0 : 1;
}

process.exitCode = await main();
