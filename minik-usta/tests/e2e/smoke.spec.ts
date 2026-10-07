/**
 * Scene smoke test (docs/TECH_DESIGN.md §12.4 "Sahne duman testi", §14.1 #15; GDD K-28, K-43) on the harness build,
 * through the real input path: CDP touch gestures → Phaser input → DragController → core. Run with
 * `npx playwright test -c tests/e2e/playwright.config.ts`.
 *
 * - load: the first launch boots into the 3-panel intro;
 * - level 1 played by its hand golden wins with exactly the golden's action log and moves left;
 * - level 2 reloaded mid-level resumes the same attempt (same log, same board hash) on the Pause window, and the rest
 *   of the golden wins it;
 * - UX §12 / §5.1 exit confirm: "Kal" and × go back to the Pause window, "Devam" plays on (K-43 item 2: no life lost);
 * - a system-cancelled touch (`touchcancel`: notification shade, incoming call) commits no move (K-07);
 * - K-43 + GDD §14.1: a reload mid-level reopens the tutorial step that was on screen (level 3 step 2, its gate);
 * - UX §13.1: the pause button opens the Pause window during a required step (level 1 step 1).
 * No console error and no uncaught page error in any of them.
 */
import { expect, test } from '@playwright/test';
import {
  attachGame,
  golden,
  loadLevel,
  planDrag,
  playMoves,
  state,
  status,
  tap,
  waitInteractive,
  waitReady,
  waitWindow,
} from '../../tools/lib/harnessClient.ts';

test.describe('scene smoke (TECH 12.4)', () => {
  test('load: the first launch boots into the intro without errors', async ({ page, context }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    const s = await state(page);
    expect(s.scene).toBe('Intro');
    expect(s.renderer).toBe('webgl');
    expect(gp.errors).toEqual([]);
  });

  test('K-28 level 1: the hand golden played by touch wins with the golden log', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 1);
    const moves = await golden(page, 1);
    await playMoves(gp, moves);
    await waitWindow(page, 'win', 120_000);
    const s = await state(page);
    expect(s.outcome).toBe('won');
    expect(s.log.slice(1)).toEqual(moves.map((m) => ({ kind: 'drag', pieceId: m.pieceId, to: m.to })));
    expect(s.movesLeft).toBe(8); // tests/golden/level_001.hand.json `movesLeft`
    expect(s.savedAttempt).toBeNull();
    expect(gp.errors).toEqual([]);
  });

  test('K-43 level 2: a reload mid-level resumes the same attempt, then the golden wins', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 2);
    const moves = await golden(page, 2);
    await playMoves(gp, moves.slice(0, 2));
    await waitInteractive(page);
    const before = await state(page);
    expect(before.savedAttempt).toEqual({ levelId: 2, actions: 3 });

    await page.reload();
    await waitReady(page);
    await waitWindow(page, 'pause', 30_000);
    const after = await state(page);
    expect(after.scene).toBe('Level');
    expect(after.levelId).toBe(2);
    expect(after.log).toEqual(before.log);
    expect(after.hash).toBe(before.hash);
    expect(after.ascii).toBe(before.ascii);

    await tap(gp, { kind: 'text', key: 'common.continue' });
    await waitInteractive(page);
    await playMoves(gp, moves.slice(2));
    await waitWindow(page, 'win', 120_000);
    expect((await state(page)).outcome).toBe('won');
    expect(gp.errors).toEqual([]);
  });

  test('UX 12 exit confirm: "Kal" and × return to the Pause window, then the level plays on', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 2);
    const moves = await golden(page, 2);
    await playMoves(gp, moves.slice(0, 1));
    await waitInteractive(page);
    const lives = (await state(page)).lives;
    for (const stay of [{ kind: 'text', key: 'exit.stay' } as const, { kind: 'close' } as const]) {
      await tap(gp, { kind: 'pause' });
      await waitWindow(page, 'pause', 30_000);
      await tap(gp, { kind: 'text', key: 'pause.exit' });
      await waitWindow(page, 'exit', 30_000);
      await tap(gp, stay);
      await waitWindow(page, 'pause', 30_000);
      await tap(gp, { kind: 'text', key: 'common.continue' });
      await waitInteractive(page);
    }
    const s = await state(page);
    expect(s.outcome).toBe('playing');
    expect(s.logLength).toBe(2);
    expect(s.lives).toEqual(lives);
    await playMoves(gp, moves.slice(1));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('K-07 a system-cancelled touch (touchcancel) mid-drag commits no move and the block goes home', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 2);
    const moves = await golden(page, 2);
    const first = moves[0];
    if (!first) throw new Error('level 2 golden is empty');
    await waitInteractive(page);
    const before = await state(page);
    const plan = await planDrag(page, first);
    await gp.touch.gesture(plan, false);
    await gp.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await waitInteractive(page);
    const after = await status(page);
    expect(after.logLength).toBe(before.logLength);
    expect(after.movesMade).toBe(0);
    expect((await state(page)).hash).toBe(before.hash);
    // the cancelled gesture leaves nothing behind: the same move by a real release still commits
    await playMoves(gp, [first]);
    expect((await status(page)).logLength).toBe(before.logLength + 1);
    expect(gp.errors).toEqual([]);
  });

  test('TECH 10.4 level 1 won → "Devam" → home → "BÖLÜM 2": the level scene is woken, not created again', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 1);
    const moves = await golden(page, 1);
    await playMoves(gp, moves);
    await waitWindow(page, 'win', 120_000);
    const creates = (await state(page)).levelCreates;
    await tap(gp, { kind: 'text', key: 'common.continue' });
    await page.waitForFunction(() => window.__harness!.status().scene === 'Home', null, { timeout: 60_000 });
    await tap(gp, { kind: 'text', key: 'home.play', params: { n: 2 } });
    await waitInteractive(page, 2);
    const s = await state(page);
    expect(s.levelId).toBe(2);
    expect(s.levelCreates).toBe(creates);
    expect(s.window).toBeNull();
    // and level 2 plays through the woken scene
    await playMoves(gp, await golden(page, 2));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('K-43 resume keeps the tutorial step (level 3 step 2: the required gap step and its gate)', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 3);
    const moves = await golden(page, 3);
    await playMoves(gp, moves.slice(0, 1)); // a: step 1 done, step 2 (Z, gapPass with f) opens
    await waitInteractive(page);
    const before = await state(page);
    expect(before.tutorial).toMatchObject({ index: 1, required: true, textKey: 'tut.l3.gap' });

    await page.reload();
    await waitReady(page);
    await waitWindow(page, 'pause', 30_000);
    await tap(gp, { kind: 'text', key: 'common.continue' });
    await waitInteractive(page);
    const after = await state(page);
    expect(after.log).toEqual(before.log);
    expect(after.tutorial).toEqual(before.tutorial);
    // the gate is back: the rest of the golden (f through the gap first) still wins
    await playMoves(gp, moves.slice(1));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('UX 13.1 required step keeps the pause button (level 1 step 1): the Pause window opens, "Devam" goes back', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 1);
    await waitInteractive(page);
    expect((await state(page)).tutorial).toMatchObject({ index: 0, required: true });
    await tap(gp, { kind: 'pause' });
    await waitWindow(page, 'pause', 30_000);
    await tap(gp, { kind: 'text', key: 'common.continue' });
    await waitInteractive(page);
    const s = await state(page);
    expect(s.window).toBeNull();
    expect(s.tutorial).toMatchObject({ index: 0, required: true });
    expect(gp.errors).toEqual([]);
  });
});
