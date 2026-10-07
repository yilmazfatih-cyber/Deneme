/**
 * Scene smoke test (docs/TECH_DESIGN.md §12.4 "Sahne duman testi", §14.1 #15; GDD K-28, K-43) on the harness build,
 * through the real input path: CDP touch gestures → Phaser input → DragController → core. Run with
 * `npx playwright test -c tests/e2e/playwright.config.ts`.
 *
 * - load: the first launch boots into the 3-panel intro;
 * - level 1 played by its hand golden wins with exactly the golden's action log and moves left; the level-end titles
 *   made at level start stay hidden until the win;
 * - level 2 reloaded mid-level resumes the same attempt (same log, same board hash) on the Pause window, and the rest
 *   of the golden wins it;
 * - UX §12 / §5.1 exit confirm: "Kal" and × go back to the Pause window, "Devam" plays on (K-43 item 2: no life lost);
 * - a system-cancelled touch (`touchcancel`: notification shade, incoming call) commits no move (K-07);
 * - K-43 + GDD §14.1: a reload mid-level reopens the tutorial step that was on screen (level 3 step 2, its gate), also
 *   after a cancelled drag whose `overWall` ended a step (level 1) and after a fast release (level 2) — review Faz 2
 *   tur 3 #1, `inLevel.tutorial`;
 * - UX §13.1: the pause button opens the Pause window during a required step (level 1 step 1);
 * - UX §13.2 (Faz 2 tur 3): opening the Golden Trowel pick closes / drops `tut.ctx.goldtrowel` and marks it seen.
 * No console error and no uncaught page error in any of them.
 */
import { expect, test } from '@playwright/test';
import {
  attachGame,
  golden,
  loadLevel,
  planDrag,
  playMove,
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
    await waitInteractive(page, 1);
    // the #55 / #57 titles are made at level start (TECH §10.6) but stay hidden until a level ends
    const title = (key: string) =>
      page.evaluate((k) => window.__harness!.tapPoint({ kind: 'text', key: k }), key);
    expect(await title('lose.title')).toBeNull();
    expect(await title('win.title')).toBeNull();
    const moves = await golden(page, 1);
    await playMoves(gp, moves);
    await waitWindow(page, 'win', 120_000);
    expect(await title('win.title')).not.toBeNull(); // UX §6: the win screen keeps "KAZANDIN!"
    expect(await title('lose.title')).toBeNull();
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
    expect(before.savedAttempt).toMatchObject({ levelId: 2, actions: 3 });

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

  test('UX 13.1 level 3 step 3: f on the rail is only highlighted, the glove drags b, and lifting b hides it (LEVELS 5 tap rule, PL-F2T4-0)', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 3);
    const moves = await golden(page, 3);
    await playMoves(gp, moves.slice(0, 2)); // a, then f through the gap onto the rail
    await waitInteractive(page);
    const shown = await state(page);
    expect(shown.tutorial).toMatchObject({ index: 2, pieces: [1, 2], textKey: 'tut.l3.rail' });
    expect(shown.tutorialHand).toEqual({ kind: 'drag', hidden: false });
    const b = moves[2];
    if (!b || b.pieceId !== 2) throw new Error('golden move 3 of level 3 is not b');
    // the finger stays down at the end of b's drag: the lift already hid the glove
    await gp.touch.gesture(await planDrag(page, b), false);
    expect((await state(page)).tutorialHand).toEqual({ kind: 'drag', hidden: true });
    await gp.touch.release();
    await playMoves(gp, moves.slice(3));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('K-43 resume keeps the tutorial step: level 1 `a` released straddling the wall at (5,8) (cancelled) → step 2, not step 1 and its gate', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 1);
    await waitInteractive(page, 1);
    expect((await state(page)).tutorial).toMatchObject({ index: 0, required: true });
    // K-07 row 4: a crosses the wall (overWall ends the required step 1 in the air) and is released straddling it
    const plan = await planDrag(page, { pieceId: 0, to: { ix: 5, iy: 8, mode: 0 } });
    await gp.touch.gesture(plan, true);
    await waitInteractive(page);
    const before = await state(page);
    expect(before.logLength).toBe(1); // cancelled: nothing logged
    expect(before.tutorial).toMatchObject({ index: 1, required: false, textKey: 'tut.l1.drop' });
    expect(before.savedAttempt?.tutorial).toEqual({ index: 1, shown: true, count: 0, actions: 1 });

    await page.reload();
    await waitReady(page);
    await waitWindow(page, 'pause', 30_000);
    await tap(gp, { kind: 'text', key: 'common.continue' });
    await waitInteractive(page);
    const after = await state(page);
    expect(after.log).toEqual(before.log);
    expect(after.tutorial).toEqual(before.tutorial);
    await playMoves(gp, await golden(page, 1));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('K-43 resume keeps the tutorial step: level 2 `b` released fast (no rest over the site) → step 3 after the reload', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 2);
    const moves = await golden(page, 2);
    const [mA, mB] = moves;
    if (!mA || !mB) throw new Error('level 2 golden');
    await playMoves(gp, [mA]);
    await waitInteractive(page);
    expect((await state(page)).tutorial).toMatchObject({ index: 1, textKey: 'tut.l2.shadow' });
    await playMove(gp, mB, { speedCellsPerSec: 40, endHoldMs: 0 });
    await waitInteractive(page);
    const before = await state(page);
    expect(before.tutorial).toMatchObject({ index: 2, textKey: 'tut.l1.match' });
    expect(before.savedAttempt?.tutorial).toEqual({ index: 2, shown: true, count: 0, actions: 3 });

    await page.reload();
    await waitReady(page);
    await waitWindow(page, 'pause', 30_000);
    await tap(gp, { kind: 'text', key: 'common.continue' });
    await waitInteractive(page);
    const after = await state(page);
    expect(after.log).toEqual(before.log);
    expect(after.tutorial).toEqual(before.tutorial);
    await playMoves(gp, moves.slice(2));
    await waitWindow(page, 'win', 120_000);
    expect(gp.errors).toEqual([]);
  });

  test('UX 13.2 opening the trowel pick closes and marks tut.ctx.goldtrowel (level 5, first Golden Trowel)', async ({
    page,
    context,
  }) => {
    const gp = await attachGame(page, context);
    await page.goto('/?harness=1&reducedMotion=1');
    await waitReady(page);
    await loadLevel(page, 5);
    const moves = await golden(page, 5);
    await playMoves(gp, moves.slice(0, 4)); // the 4th correct placement in a row earns the trowel (K-33)
    await waitInteractive(page, 5);
    const before = (await state(page)).contextTip;
    // on screen or waiting behind the truck step, but there and not yet seen unless it showed
    expect(before.showing === 'goldtrowel' || before.queued.includes('goldtrowel')).toBe(true);
    await tap(gp, { kind: 'trowel' });
    const hint = (): Promise<unknown> =>
      page.evaluate(() => window.__harness!.tapPoint({ kind: 'text', key: 'booster.hint.trowel' }));
    await page.waitForFunction(
      () => window.__harness!.tapPoint({ kind: 'text', key: 'booster.hint.trowel' }) !== null,
      null,
      { timeout: 30_000 },
    );
    await page.evaluate(() => window.__harness!.waitGameMs(100));
    const open = (await state(page)).contextTip;
    expect(open.showing).toBeNull();
    expect(open.queued).not.toContain('goldtrowel');
    expect(open.seen).toContain('goldtrowel');
    expect(
      await page.evaluate(() => window.__harness!.tapPoint({ kind: 'text', key: 'tut.ctx.goldtrowel' })),
    ).toBeNull();
    // it never comes back: not while the pick stays open, nor after "Vazgeç"
    await page.evaluate(() => window.__harness!.waitGameMs(3000));
    expect((await state(page)).contextTip.showing).toBeNull();
    expect(await hint()).not.toBeNull();
    await tap(gp, { kind: 'text', key: 'common.cancel' });
    await page.evaluate(() => window.__harness!.waitGameMs(3000));
    expect((await state(page)).contextTip.showing).not.toBe('goldtrowel');
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
