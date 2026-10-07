/**
 * `npm run perf` (= `vite build --mode harness && node tools/perf.ts`): the Phase 2 performance gates of
 * docs/TECH_DESIGN.md §10.7 and §14.1 ("perf 4× ≥ 50 FPS (CPU tarafı) ve FTUE ≤ 10 s"), CLAUDE.md "Bitti tanımı".
 *
 * 1. Gameplay: the harness build on `vite preview --mode harness`, Chromium at /opt/pw-browsers/chromium, 390 × 844,
 *    DPR 3, `isMobile`, `hasTouch`, full animations. For each CPU rate (CDP `Emulation.setCPUThrottlingRate`, default
 *    4 then 1) levels 1–5 are played by their hand goldens as real 60 Hz CDP touch gestures (touchStart → touchMove …
 *    → touchEnd); the in-page sampler (src/harness/perf.ts) records every drag into `drag` and every level end (release
 *    of the winning move → win window open + 1.5 s) into `win`.
 * 2. FTUE: a cold context (empty cache and storage) at 4× CPU + DevTools "Fast 4G", navigation start →
 *    `window.__levelInteractive` (Level 1 takes input after the untouched 3-panel intro, UX §2.1).
 *
 * Gates (TECH §10.7 item 6, on the CPU side at 4×; exit 1 when one fails or a gated value is missing — a broken sampler
 * or a run without frames never passes): mean CPU-side FPS ≥ 50 for `drag` and `win` (`cpuFps`: touch handlers + Phaser
 * step per frame, GPU waits excluded), CPU-side p95 ≤ 25 ms for both, no CPU-side frame > 50 ms while dragging, FTUE
 * ≤ 10 000 ms. Input latency (touch move that wrote the block's pose → the frame that draws it) is reported in frames
 * (≤ 1 expected, TECH §4.6) as an indicator: on SwiftShader the frame pace is the software GPU's. The rAF frame rate
 * carries the GPU share too (TECH §10.7 item 7: "CPU güvenilir, GPU gösterge"). `--isolate-gpu` pins the GPU process to CPU 0 and the page's renderer to the other CPUs
 * (`taskset`) so the software GPU cannot steal the measured main thread's CPU; on the 4-core sandbox it changed the
 * CPU-side numbers by less than the run-to-run spread and halved the frame rate, so it is off by default.
 *
 * Options: `--rates 4,1`, `--levels 1,2,3,4,5`, `--renderer webgl|canvas` (`canvas` = `--disable-3d-apis`, Phaser's
 * Canvas fallback, a control run without SwiftShader), `--skip-ftue`, `--ftue-only`, `--isolate-gpu`. Report: artifacts/perf/report.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import type { PerfStats } from '../src/harness/api.ts';
import {
  CHROMIUM_PATH,
  assertLastMove,
  FAST_4G,
  PROFILES,
  golden,
  loadLevel,
  openGame,
  perfStart,
  perfStats,
  perfStop,
  planDrag,
  state,
  status,
  waitInteractive,
  waitLog,
  waitWindow,
} from './lib/harnessClient.ts';
import type { GamePage } from './lib/harnessClient.ts';
import { startHarnessServer } from './lib/harnessServer.ts';
import { ROOT } from './lib/levels.ts';

const OUT = join(ROOT, 'artifacts', 'perf');
const GATE_CPU_FPS = 50;
const GATE_CPU_P95_MS = 25;
const GATE_DRAG_LONG_FRAMES = 0;
const GATE_FTUE_MS = 10_000;
const INPUT_FRAMES = 1;
/** After the win window opened: its JUICE #70 entry and the #55–#57 banners keep animating. */
const WIN_TAIL_MS = 1500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string): boolean => process.argv.includes(name);

// --- GPU process isolation (taskset) ------------------------------------------------------------------------------------

function hasTaskset(): boolean {
  try {
    execFileSync('taskset', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Chromium processes of one browser (every child carries the launch's `--user-data-dir`), by `--type`. */
function chromiumProcesses(userDataDir: string): { pid: number; type: string }[] {
  const out: { pid: number; type: string }[] = [];
  if (userDataDir === '') return out;
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    let cmd: string;
    try {
      cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8').replaceAll('\0', ' ');
    } catch {
      continue;
    }
    if (!cmd.includes(`--user-data-dir=${userDataDir}`)) continue;
    out.push({ pid: Number(name), type: /--type=([a-z-]+)/.exec(cmd)?.[1] ?? 'browser' });
  }
  return out;
}

/** Pins the GPU process to CPU 0 and the renderers to CPUs 1…n−1 (all their threads). */
function isolateGpu(pids: { pid: number; type: string }[]): string {
  const n = availableParallelism();
  if (n < 2) return 'not isolated (1 CPU)';
  const rest = `1-${n - 1}`;
  let gpu = 0;
  let renderers = 0;
  for (const p of pids) {
    try {
      if (p.type === 'gpu-process') {
        execFileSync('taskset', ['-a', '-p', '-c', '0', String(p.pid)], { stdio: 'ignore' });
        gpu += 1;
      } else if (p.type === 'renderer') {
        execFileSync('taskset', ['-a', '-p', '-c', rest, String(p.pid)], { stdio: 'ignore' });
        renderers += 1;
      }
    } catch {
      // the process may be gone
    }
  }
  return `GPU process on CPU 0 (${gpu}), renderers on CPUs ${rest} (${renderers})`;
}

// --- runs ----------------------------------------------------------------------------------------------------------------

interface RateResult {
  readonly rate: number;
  readonly renderer: string;
  readonly isolation: string;
  readonly drag: PerfStats | null;
  /** Level and move whose drag window holds the drag bucket's longest CPU frame (diagnostics). */
  readonly dragWorstAt: string | null;
  readonly win: PerfStats | null;
  readonly levels: { readonly id: number; readonly moves: number; readonly won: boolean }[];
  readonly heapMB: number | null;
  readonly consoleErrors: readonly string[];
}

interface FtueResult {
  readonly rate: number;
  readonly network: string;
  readonly levelInteractiveMs: number | null;
  /** The intro ran (boot done), then the level screen ran (level 1 loaded and baked). */
  readonly introShownMs: number | null;
  readonly levelShownMs: number | null;
  /** rAF rate of the page over the run (SwiftShader share: the game clock follows it, see `waitGameMs`). */
  readonly fps: number | null;
  readonly domContentLoadedMs: number | null;
  readonly loadMs: number | null;
  readonly transferKB: number | null;
  readonly consoleErrors: readonly string[];
}

async function userDataDirOf(browser: Browser): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.goto('chrome://version');
    const text = await page.locator('body').innerText();
    return /--user-data-dir=(\S+)/.exec(text)?.[1] ?? '';
  } finally {
    await page.close();
  }
}

/** Where the drag bucket's longest CPU frame was recorded (`L<level> m<move>`), updated after every drag window. */
const dragWorst = { cpuMs: 0, at: null as string | null };

async function noteDragWorst(gp: GamePage, at: string): Promise<void> {
  const w = (await perfStats(gp.page, 'drag'))?.cpuMaxFrame ?? null;
  if (w && w.cpuMs > dragWorst.cpuMs) {
    dragWorst.cpuMs = w.cpuMs;
    dragWorst.at = at;
  }
}

async function playLevelMeasured(gp: GamePage, id: number): Promise<{ moves: number; won: boolean }> {
  await loadLevel(gp.page, id);
  const moves = await golden(gp.page, id);
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move) break;
    await waitInteractive(gp.page, id, 900_000);
    const before = (await status(gp.page)).logLength;
    const plan = await planDrag(gp.page, move);
    const last = i === moves.length - 1;
    await perfStart(gp.page, 'drag');
    await gp.touch.gesture(plan, false, 'clock');
    if (last) await perfStart(gp.page, 'win');
    await gp.touch.release();
    if (!last) await perfStop(gp.page);
    await waitLog(gp.page, before, 20_000);
    await noteDragWorst(gp, `L${id} m${i}`);
    if (!last) await assertLastMove(gp.page, move);
    if (last) {
      await waitWindow(gp.page, 'win', 900_000);
      await sleep(WIN_TAIL_MS);
      await perfStop(gp.page);
      await assertLastMove(gp.page, move);
    }
  }
  const s = await state(gp.page);
  return { moves: moves.length, won: s.outcome === 'won' };
}

async function gameplayRun(
  browser: Browser,
  url: string,
  rate: number,
  renderer: string,
  isolate: boolean,
  levels: readonly number[],
): Promise<RateResult> {
  const profile = PROFILES[0];
  if (!profile) throw new Error('no profile');
  const gp = await openGame(browser, { url, profile, reducedMotion: false });
  try {
    let isolation = 'off';
    if (isolate) isolation = isolateGpu(chromiumProcesses(await userDataDirOf(browser)));
    await gp.page.evaluate(() => window.__harness!.perfReset());
    dragWorst.cpuMs = 0;
    dragWorst.at = null;
    await gp.cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const played: { id: number; moves: number; won: boolean }[] = [];
    for (const id of levels) {
      const r = await playLevelMeasured(gp, id);
      played.push({ id, ...r });
      process.stdout.write(`  ${rate}× level ${id}: ${r.moves} moves, ${r.won ? 'won' : 'NOT WON'}\n`);
    }
    await gp.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const heap = (await gp.cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    return {
      rate,
      renderer,
      isolation,
      drag: await perfStats(gp.page, 'drag'),
      dragWorstAt: dragWorst.at,
      win: await perfStats(gp.page, 'win'),
      levels: played,
      heapMB: Math.round((heap.usedSize / 1024 / 1024) * 10) / 10,
      consoleErrors: gp.errors,
    };
  } finally {
    await gp.close();
  }
}

async function ftueRun(browser: Browser, url: string, rate: number, network: boolean): Promise<FtueResult> {
  const profile = PROFILES[0];
  if (!profile) throw new Error('no profile');
  const gp = await openGame(browser, {
    url,
    profile,
    reducedMotion: false,
    cpuRate: rate,
    ...(network ? { network: FAST_4G } : {}),
    waitReady: false,
  });
  try {
    await gp.page.waitForFunction(() => window.__levelInteractive !== undefined, null, {
      timeout: 120_000,
      polling: 50,
    });
    const r = await gp.page.evaluate(async () => {
      // rAF rate on the level screen right after, over 2 s (the game clock follows it on a slow page)
      const t0 = performance.now();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          frames += 1;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const fps = Math.round(((frames * 1000) / (performance.now() - t0)) * 10) / 10;
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const transfer = performance
        .getEntriesByType('resource')
        .reduce((a, e) => a + ((e as PerformanceResourceTiming).transferSize || 0), nav?.transferSize ?? 0);
      return {
        interactive: window.__levelInteractive ?? null,
        shown: window.__levelShown ?? null,
        intro: window.__introShown ?? null,
        fps,
        dcl: nav ? nav.domContentLoadedEventEnd : null,
        load: nav ? nav.loadEventEnd : null,
        transfer,
      };
    });
    return {
      rate,
      network: network ? 'Fast 4G' : 'none',
      levelInteractiveMs: r.interactive,
      introShownMs: r.intro,
      levelShownMs: r.shown,
      fps: r.fps,
      domContentLoadedMs: r.dcl === null ? null : Math.round(r.dcl),
      loadMs: r.load === null ? null : Math.round(r.load),
      transferKB: Math.round(r.transfer / 1024),
      consoleErrors: gp.errors,
    };
  } finally {
    await gp.close();
  }
}

// --- report --------------------------------------------------------------------------------------------------------------

/** The longest CPU frame of a bucket, split (diagnostics: which drag, which part of the frame). */
function worstRow(s: PerfStats | null, at: string | null): string {
  const w = s?.cpuMaxFrame;
  if (!w) return '';
  return (
    `    longest CPU frame ${w.cpuMs} ms${at ? ` in ${at}` : ''}: touch handlers ${w.handlersMs} ` +
    `(${w.touches || 'none'}), update ${w.updateMs}, render ${w.renderMs}; frame ${w.frameInWindow} of its window\n`
  );
}

function row(label: string, s: PerfStats | null): string {
  if (!s) return `  ${label.padEnd(10)} no frames`;
  return (
    `  ${label.padEnd(10)} frames ${String(s.frames).padStart(4)}  rAF ${s.fps.toFixed(1).padStart(5)} fps ` +
    `(p50 ${s.intervalP50} / p95 ${s.intervalP95} / p99 ${s.intervalP99} ms, >20 ms ${(s.over20Ratio * 100).toFixed(0)} %, >50 ms ${s.over50})  ` +
    `CPU ${s.cpuFps.toFixed(1).padStart(5)} fps (p50 ${s.cpuP50} / p95 ${s.cpuP95} / max ${s.cpuMax} ms; update ${s.updateP50}, render ${s.renderP50})  ` +
    `input p50 ${s.inputP50} / p95 ${s.inputP95} ms, ≤ ${s.inputFramesMax} frame(s) (${s.inputSamples})  LoAF ${s.longFrames} (max ${s.longestFrameMs} ms)`
  );
}

async function main(): Promise<number> {
  const rates = flag('--ftue-only') ? [] : (arg('--rates') ?? '4,1').split(',').map(Number);
  const levels = (arg('--levels') ?? '1,2,3,4,5').split(',').map(Number);
  const renderer = arg('--renderer') ?? 'webgl';
  const isolate = flag('--isolate-gpu') && hasTaskset();
  const server = await startHarnessServer();
  const launch = (): Promise<Browser> =>
    chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: renderer === 'canvas' ? ['--disable-3d-apis'] : [],
    });
  const runs: RateResult[] = [];
  const ftue: FtueResult[] = [];
  try {
    for (const rate of rates) {
      process.stdout.write(`gameplay ${rate}× CPU (${renderer})\n`);
      const browser = await launch();
      try {
        runs.push(await gameplayRun(browser, server.url, rate, renderer, isolate, levels));
      } finally {
        await browser.close();
      }
    }
    if (!flag('--skip-ftue')) {
      for (const [rate, network] of [
        [4, true],
        [1, false],
      ] as const) {
        process.stdout.write(`FTUE ${rate}× CPU, network ${network ? 'Fast 4G' : 'none'}\n`);
        const browser = await launch();
        try {
          ftue.push(await ftueRun(browser, server.url, rate, network));
        } finally {
          await browser.close();
        }
      }
    }
  } finally {
    await server.close();
  }

  const gated = runs.find((r) => r.rate === 4);
  const ftueGated = ftue.find((f) => f.rate === 4);
  const gameplayGated = rates.includes(4);
  const ftueRan = !flag('--skip-ftue');
  /** A gate that applies to this run: null value = FAIL (no frames or a broken sampler never passes). */
  const gate = (applies: boolean, value: number | null, ok: (v: number) => boolean): boolean | null =>
    !applies ? null : value === null ? false : ok(value);
  const gates = {
    dragCpuFps: { value: gated?.drag?.cpuFps ?? null, min: GATE_CPU_FPS },
    winCpuFps: { value: gated?.win?.cpuFps ?? null, min: GATE_CPU_FPS },
    dragCpuP95: { value: gated?.drag?.cpuP95 ?? null, max: GATE_CPU_P95_MS },
    winCpuP95: { value: gated?.win?.cpuP95 ?? null, max: GATE_CPU_P95_MS },
    dragLongFrames: { value: gated?.drag?.cpuOver50 ?? null, max: GATE_DRAG_LONG_FRAMES },
    ftueMs: { value: ftueGated?.levelInteractiveMs ?? null, max: GATE_FTUE_MS },
  };
  const pass = {
    dragCpuFps: gate(gameplayGated, gates.dragCpuFps.value, (v) => v >= GATE_CPU_FPS),
    winCpuFps: gate(gameplayGated, gates.winCpuFps.value, (v) => v >= GATE_CPU_FPS),
    dragCpuP95: gate(gameplayGated, gates.dragCpuP95.value, (v) => v <= GATE_CPU_P95_MS),
    winCpuP95: gate(gameplayGated, gates.winCpuP95.value, (v) => v <= GATE_CPU_P95_MS),
    dragLongFrames: gate(gameplayGated, gates.dragLongFrames.value, (v) => v <= GATE_DRAG_LONG_FRAMES),
    ftueMs: gate(ftueRan, gates.ftueMs.value, (v) => v <= GATE_FTUE_MS),
  };
  /** Indicator (SwiftShader frame pace): frames from the touch move to the drawn pose, p95 and max. */
  const inputFrames = {
    p95: gated?.drag?.inputFramesP95 ?? null,
    max: gated?.drag?.inputFramesMax ?? null,
    samples: gated?.drag?.inputSamples ?? 0,
    expected: INPUT_FRAMES,
  };
  mkdirSync(OUT, { recursive: true });
  const report = {
    date: new Date().toISOString(),
    chromium: CHROMIUM_PATH,
    profile: PROFILES[0],
    renderer,
    note: 'rAF fps includes the SwiftShader (software GPU) share: indicator only; the gates use the CPU side (TECH §10.7 item 7)',
    gates,
    pass,
    inputFrames,
    runs,
    ftue,
  };
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  for (const r of runs) {
    process.stdout.write(`\n${r.rate}× CPU, ${r.renderer}, isolation: ${r.isolation}, heap ${r.heapMB} MB\n`);
    process.stdout.write(`${row('drag', r.drag)}\n${worstRow(r.drag, r.dragWorstAt)}${row('win', r.win)}\n`);
    for (const c of r.consoleErrors) process.stdout.write(`  console error: ${c}\n`);
  }
  for (const f of ftue) {
    process.stdout.write(
      `\nFTUE ${f.rate}× CPU, network ${f.network}: level 1 interactive at ${f.levelInteractiveMs} ms ` +
        `(intro at ${f.introShownMs} ms, level screen at ${f.levelShownMs} ms, DOMContentLoaded ${f.domContentLoadedMs} ms, load ${f.loadMs} ms, ` +
        `${f.transferKB} KB; page ${f.fps} fps after)\n`,
    );
    for (const c of f.consoleErrors) process.stdout.write(`  console error: ${c}\n`);
  }
  const mark = (ok: boolean | null): string => (ok === null ? 'n/a ' : ok ? 'PASS' : 'FAIL');
  process.stdout.write(
    `\ngates (4× CPU, CPU side):\n` +
      `  ${mark(pass.dragCpuFps)} drag mean ${gates.dragCpuFps.value} fps ≥ ${GATE_CPU_FPS}\n` +
      `  ${mark(pass.winCpuFps)} win mean ${gates.winCpuFps.value} fps ≥ ${GATE_CPU_FPS}\n` +
      `  ${mark(pass.dragCpuP95)} drag p95 ${gates.dragCpuP95.value} ms ≤ ${GATE_CPU_P95_MS}\n` +
      `  ${mark(pass.winCpuP95)} win p95 ${gates.winCpuP95.value} ms ≤ ${GATE_CPU_P95_MS}\n` +
      `  ${mark(pass.dragLongFrames)} drag frames > 50 ms: ${gates.dragLongFrames.value} ≤ ${GATE_DRAG_LONG_FRAMES}\n` +
      `  ${mark(pass.ftueMs)} FTUE ${gates.ftueMs.value} ms ≤ ${GATE_FTUE_MS}\n` +
      `  info input latency: p95 ${inputFrames.p95} / max ${inputFrames.max} frame(s) (${inputFrames.samples} samples; ` +
      `${INPUT_FRAMES} expected, SwiftShader frame pace)\n` +
      `report: ${join(OUT, 'report.json')}\n`,
  );
  const failed = Object.values(pass).some((v) => v === false);
  const errors = [...runs, ...ftue].some((r) => r.consoleErrors.length > 0);
  return failed || errors ? 1 : 0;
}

process.exitCode = await main();
