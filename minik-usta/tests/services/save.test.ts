import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import type { SessionAction } from '../../src/core/types.ts';
import type { AnalyticsEvent } from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  MIGRATIONS,
  MemoryStore,
  SAVE_DEBOUNCE_MS,
  SAVE_KEY,
  SAVE_VERSION,
  SaveService,
  attemptBoosters,
  canonicalJson,
  createDefaultSave,
  decodeSave,
  encodeSave,
  levelHash,
  migrate,
  recordWin,
  resumeCause,
} from '../../src/services/save.ts';
import type { AttemptStart, KeyValueStore, LevelIdentity, SaveData } from '../../src/services/save.ts';

const WALLET = economy.startingWallet;
const IDENTITY: LevelIdentity = { levelHash: 'h-level-3', rulesVersion: 1 };

interface Harness {
  readonly store: MemoryStore;
  readonly clock: FakeClock;
  readonly events: AnalyticsEvent[];
  /** Snapshot of the stored main save at the moment of each tracked event. */
  readonly storedAtTrack: (string | null)[];
  open(): SaveService;
}

function harness(store = new MemoryStore(), clock = new FakeClock(1_700_000_000_000)): Harness {
  const events: AnalyticsEvent[] = [];
  const storedAtTrack: (string | null)[] = [];
  let id = 0;
  return {
    store,
    clock,
    events,
    storedAtTrack,
    open: () =>
      SaveService.open({
        store,
        clock,
        scheduler: clock,
        startingWallet: WALLET,
        newId: () => `id-${++id}`,
        track: (e) => {
          events.push(e);
          storedAtTrack.push(store.get(SAVE_KEY));
        },
      }),
  };
}

const start = (over: Partial<AttemptStart> = {}): AttemptStart => ({
  levelId: 3,
  seed: 3003,
  mode: 'story',
  preBoosters: [],
  streakTier: 0,
  levelHash: IDENTITY.levelHash,
  rulesVersion: IDENTITY.rulesVersion,
  reserveLife: true,
  ...over,
});

const drag = (pieceId: number, ix: number, iy: number): SessionAction => ({
  kind: 'drag',
  pieceId,
  to: { ix, iy, mode: 0 },
});

const stored = (store: KeyValueStore, key = SAVE_KEY): SaveData => {
  const r = decodeSave(store.get(key) ?? '');
  if (!r.ok) throw new Error(`stored save does not decode: ${r.error}`);
  return r.data;
};

describe('save v1 storage (TECH 11.1)', () => {
  it('TECH 11.1 first launch writes defaults with the starting wallet and fresh ids', () => {
    const h = harness();
    const s = h.open();
    expect(s.loadReport).toEqual({ source: 'new', failedStage: null, migratedFrom: null });
    expect(s.data.coins).toBe(WALLET.coins);
    expect(s.data.lives).toEqual({
      stored: WALLET.lives,
      regenAnchor: h.clock.now(),
      unlimitedUntil: 0,
      reserved: 0,
    });
    expect(s.data.settings.lang).toBe('tr');
    expect(s.data.analyticsId).not.toBe(s.data.installId);
    expect(stored(h.store)).toEqual(s.data);
    expect(h.store.get(BACKUP_KEY)).toBe(h.store.get(SAVE_KEY));
    expect(h.events).toEqual([]);
  });

  it('TECH 11.1 save round-trips through the store (main + backup copy, envelope { v, data })', () => {
    const h = harness();
    const s = h.open();
    s.commit((d) => {
      d.coins = 1234;
      d.stars = 7;
      d.settings.reduceMotion = true;
      d.seenContextTips['support'] = true;
      d.progress.levels['2'] = { won: true, attempts: 3 };
    });
    const env = JSON.parse(h.store.get(SAVE_KEY) ?? '{}') as { v: number };
    expect(env.v).toBe(SAVE_VERSION);
    const again = h.open();
    expect(again.loadReport.source).toBe('main');
    expect(again.data).toEqual(s.data);
    expect(decodeSave(encodeSave(s.data as SaveData))).toEqual({
      ok: true,
      data: s.data,
      migratedFrom: null,
    });
  });

  it('TECH 11.1 update() coalesces writes for 500 ms; commit() and flush() write at once', () => {
    const h = harness();
    const s = h.open();
    const writes: string[] = [];
    const spy: KeyValueStore = {
      get: (k) => h.store.get(k),
      set: (k, v) => {
        if (k === SAVE_KEY) writes.push(v);
        h.store.set(k, v);
      },
      remove: (k) => h.store.remove(k),
    };
    const s2 = SaveService.open({ store: spy, clock: h.clock, scheduler: h.clock, startingWallet: WALLET });
    expect(s.data.coins).toBe(s2.data.coins);
    s2.update((d) => void (d.coins += 1));
    s2.update((d) => void (d.coins += 1));
    expect(writes).toHaveLength(0);
    h.clock.advance(SAVE_DEBOUNCE_MS - 1);
    expect(writes).toHaveLength(0);
    h.clock.advance(1);
    expect(writes).toHaveLength(1);
    expect(stored(h.store).coins).toBe(WALLET.coins + 2);
    s2.update((d) => void (d.stars += 1));
    s2.commit((d) => void (d.coins += 10));
    expect(writes).toHaveLength(2);
    expect(stored(h.store)).toMatchObject({ stars: 1, coins: WALLET.coins + 12 });
    h.clock.advance(SAVE_DEBOUNCE_MS * 2);
    expect(writes).toHaveLength(2);
    s2.update((d) => void (d.stars += 1));
    s2.flush();
    expect(writes).toHaveLength(3);
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('TECH 11.1 a change that breaks the schema throws and keeps the old data (never written)', () => {
    const h = harness();
    const s = h.open();
    const before = h.store.get(SAVE_KEY);
    expect(() => s.commit((d) => void (d.coins = -5))).toThrow(/schema/);
    expect(() =>
      s.commit((d) => {
        d.coins = 99;
        d.lives.reserved = 2 as 0;
      }),
    ).toThrow();
    expect(s.data.coins).toBe(WALLET.coins);
    expect(h.store.get(SAVE_KEY)).toBe(before);
  });

  it('TECH 11.1 lastSeenNow never decreases when the clock is set back', () => {
    const h = harness();
    const s = h.open();
    const t0 = h.clock.now();
    h.clock.set(t0 - 3_600_000);
    s.commit((d) => void (d.coins += 1));
    expect(s.data.lastSeenNow).toBe(t0);
    h.clock.set(t0 + 10);
    s.commit();
    expect(s.data.lastSeenNow).toBe(t0 + 10);
  });

  it('TECH 11.1 a failing storage write keeps the data in memory and logs a diagnostic', () => {
    const h = harness();
    h.open();
    let full = false;
    const flaky: KeyValueStore = {
      get: (k) => h.store.get(k),
      set: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        h.store.set(k, v);
      },
      remove: (k) => h.store.remove(k),
    };
    const s = SaveService.open({ store: flaky, clock: h.clock, scheduler: h.clock, startingWallet: WALLET });
    full = true;
    s.commit((d) => void (d.coins = 42));
    expect(s.data.coins).toBe(42);
    expect(s.diagnostics().at(-1)).toMatchObject({ kind: 'writeFailed', key: SAVE_KEY });
    full = false;
    s.flush();
    expect(stored(h.store).coins).toBe(42);
  });
});

describe('save migration and corrupt recovery (TECH 11.1, ANALYTICS save_corrupt)', () => {
  it('TECH 11.1 migration chain runs v → v+1 → … and rejects newer saves and missing steps', () => {
    const steps = {
      1: (d: unknown) => ({ ...(d as object), b: 2 }),
      2: (d: unknown) => ({ ...(d as object), c: 3 }),
    };
    expect(migrate(1, { a: 1 }, steps, 3)).toEqual({ a: 1, b: 2, c: 3 });
    expect(migrate(2, { a: 1 }, steps, 3)).toEqual({ a: 1, c: 3 });
    expect(migrate(3, { a: 1 }, steps, 3)).toEqual({ a: 1 });
    expect(() => migrate(4, {}, steps, 3)).toThrow(/newer/);
    expect(() => migrate(1, {}, { 1: steps[1] }, 3)).toThrow(/v2 → v3/);
  });

  it('TECH 11.1 MIGRATIONS has a step for every older schema version', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(MIGRATIONS[v], `v${v} → v${v + 1}`).toBeTypeOf('function');
  });

  it('TECH 11.1 decodeSave reports the first failing stage (parse, migrate, validate)', () => {
    const good = encodeSave(createDefaultSave({ analyticsId: 'a', installId: 'i', now: 0, wallet: WALLET }));
    expect(decodeSave(good).ok).toBe(true);
    expect(decodeSave('{"v":1,"data":')).toMatchObject({ ok: false, stage: 'parse' });
    expect(decodeSave(good.replace('"v":1', '"v":99'))).toMatchObject({ ok: false, stage: 'migrate' });
    expect(decodeSave(good.replace('"coins":500', '"coins":"500"'))).toMatchObject({
      ok: false,
      stage: 'validate',
    });
    expect(decodeSave('[1,2]')).toMatchObject({ ok: false, stage: 'validate' });
    expect(decodeSave('{"data":{}}')).toMatchObject({ ok: false, stage: 'validate' });
  });

  it('ANALYTICS save_corrupt sent once after recovery write (backup and defaults)', () => {
    // backup: the main save is truncated, the backup holds the previous good write
    const h = harness();
    const s = h.open();
    s.commit((d) => void (d.coins = 777));
    const broken = '{"v":1,"data":{"coins":';
    h.store.set(SAVE_KEY, broken);
    const r1 = h.open();
    expect(r1.loadReport).toEqual({ source: 'backup', failedStage: 'parse', migratedFrom: null });
    expect(r1.data.coins).toBe(777);
    expect(h.store.get(CORRUPT_KEY)).toBe(broken);
    expect(h.events).toEqual([{ name: 'save_corrupt', stage: 'parse', recovered: 'backup' }]);
    expect(h.storedAtTrack[0]).toBe(encodeSave(r1.data as SaveData)); // recovery written BEFORE the event
    expect(r1.diagnostics()[0]).toMatchObject({ kind: 'saveCorrupt', stage: 'parse' });

    // defaults: main fails validation and the backup is unusable too (progress loss)
    const h2 = harness();
    h2.open().commit((d) => void (d.stars = 9));
    h2.store.set(SAVE_KEY, (h2.store.get(SAVE_KEY) ?? '').replace('"stars":9', '"stars":-1'));
    h2.store.set(BACKUP_KEY, 'garbage');
    const r2 = h2.open();
    expect(r2.loadReport).toEqual({ source: 'defaults', failedStage: 'validate', migratedFrom: null });
    expect(r2.data.stars).toBe(0);
    expect(r2.data.coins).toBe(WALLET.coins);
    expect(h2.events).toEqual([{ name: 'save_corrupt', stage: 'validate', recovered: 'defaults' }]);
    expect(h2.storedAtTrack[0]).toBe(h2.store.get(SAVE_KEY));
    expect(stored(h2.store)).toEqual(r2.data);

    // a later normal launch sends nothing
    h2.open();
    expect(h2.events).toHaveLength(1);
  });

  it('TECH 11.1 a newer-than-build save is a migrate failure and recovers from the backup', () => {
    const h = harness();
    h.open().commit((d) => void (d.coins = 600));
    h.store.set(SAVE_KEY, (h.store.get(SAVE_KEY) ?? '').replace('"v":1', '"v":2'));
    const s = h.open();
    expect(s.loadReport.failedStage).toBe('migrate');
    expect(s.data.coins).toBe(600);
    expect(h.events).toEqual([{ name: 'save_corrupt', stage: 'migrate', recovered: 'backup' }]);
  });

  it('TECH 11.1 a missing main save with a good backup restores silently', () => {
    const h = harness();
    h.open().commit((d) => void (d.coins = 650));
    h.store.remove(SAVE_KEY);
    const s = h.open();
    expect(s.loadReport).toEqual({ source: 'backup', failedStage: null, migratedFrom: null });
    expect(s.data.coins).toBe(650);
    expect(h.store.get(SAVE_KEY)).not.toBeNull();
    expect(h.events).toEqual([]);
  });
});

describe('K-43 in-level record and resume (TECH 11.1)', () => {
  it('GDD 14 attempts +1 per new attempt; a resume does not count', () => {
    const h = harness();
    const s = h.open();
    expect(s.beginAttempt(start())).toBe(1);
    s.endAttempt();
    expect(s.beginAttempt(start())).toBe(2);
    const resumed = h.open();
    expect(resumed.resumeOnLaunch(() => IDENTITY).kind).toBe('resume');
    expect(resumed.data.progress.levels['3']).toEqual({ won: false, attempts: 2 });
    resumed.endAttempt();
    expect(resumed.beginAttempt(start())).toBe(3);
  });

  it('K-43 app killed mid-level resumes same state', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start({ preBoosters: ['thermos'], streakTier: 2 }));
    const moves = [
      drag(4, 6, 0),
      drag(1, 7, 0),
      { ...drag(2, 6, 2), steer: { dir: 1, atRow: 3 } } as SessionAction,
    ];
    moves.forEach((m, i) => s.recordAction(m, { movesMade: i + 1 }));
    // the process dies here: nothing else is flushed
    const after = h.open();
    const d = after.resumeOnLaunch(() => IDENTITY);
    expect(d.kind).toBe('resume');
    if (d.kind !== 'resume') return;
    expect(d.window).toBe('pause');
    expect(d.inLevel.actions).toEqual([{ kind: 'start', preBoosters: ['thermos'], streakTier: 2 }, ...moves]);
    expect(d.inLevel.movesMade).toBe(3);
    expect(after.data.lives.reserved).toBe(1); // the reserved life stays reserved (E-38)
    expect(h.events).toEqual([{ name: 'level_resume', level: 3, movesMade: 3 }]);
    // the decision is a snapshot for replay; play continues on the live record
    const action = drag(3, 6, 4) as { pieceId: number };
    after.recordAction(action as SessionAction, { movesMade: 4 });
    action.pieceId = 99; // the stored entry is a copy, not the caller's object
    expect(d.inLevel.actions).toHaveLength(4);
    expect(after.data.inLevel?.actions.at(-1)).toEqual(drag(3, 6, 4));
    expect(stored(h.store).inLevel?.actions).toHaveLength(5);
  });

  it('K-43 app hidden during a pending G-L fall commits the released move before the write', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.update((d) => void (d.settings.music = false)); // a coalesced change waiting for 500 ms
    const order: string[] = [];
    // GameSession.flushPending(): the falling block lands unsteered and the move is committed
    s.setPendingFlusher(() => {
      order.push('flushPending');
      s.recordAction(drag(5, 7, 4), { movesMade: 2 });
    });
    let fire: (() => void) | null = null;
    const unsubscribe = s.attachLifecycle((handler) => {
      fire = handler;
      return () => {
        fire = null;
      };
    });
    (fire as unknown as () => void)();
    order.push('hidden handled');
    const saved = stored(h.store);
    expect(saved.inLevel?.actions.at(-1)).toEqual(drag(5, 7, 4));
    expect(saved.inLevel?.movesMade).toBe(2);
    expect(saved.settings.music).toBe(false);
    expect(order).toEqual(['flushPending', 'hidden handled']);
    unsubscribe();
    expect(fire).toBeNull();
  });

  it('K-43 loss window survives restart', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    const d = h.open().resumeOnLaunch(() => IDENTITY);
    expect(d).toMatchObject({ kind: 'resume', window: 'outOfMoves' });
    if (d.kind === 'resume') expect(d.inLevel.offersUsed).toBe(0); // same offer number n = offersUsed + 1
  });

  it('K-29 accepted offers update offersUsed, adOfferUsed and offerSpendCoins and close the window', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start());
    s.setOutcomeWindow('outOfMoves');
    s.recordAction({ kind: 'addMoves', amount: 5, source: 'offerAd' }, { movesMade: 10 });
    s.setOutcomeWindow('outOfMoves');
    s.recordAction(
      { kind: 'addMoves', amount: 5, source: 'offerCoins' },
      { movesMade: 15, offerCoins: 1350 },
    );
    s.recordAction({ kind: 'addMoves', amount: 3, source: 'thermos' }, { movesMade: 15 });
    expect(s.data.inLevel).toMatchObject({
      offersUsed: 2,
      adOfferUsed: true,
      offerSpendCoins: 1350,
      outcomeWindow: 'none',
    });
  });

  it('K-43 another level cannot start while an attempt exists; actions need an attempt', () => {
    const h = harness();
    const s = h.open();
    expect(() => s.recordAction(drag(0, 6, 0), { movesMade: 1 })).toThrow(/no attempt/);
    s.beginAttempt(start());
    expect(() => s.beginAttempt(start({ levelId: 4 }))).toThrow(/K-43/);
    expect(() =>
      s.recordAction({ kind: 'drag', pieceId: -1, to: { ix: 0, iy: 0, mode: 0 } }, { movesMade: 1 }),
    ).toThrow();
    expect(s.data.inLevel?.actions).toHaveLength(1);
  });

  it('K-43 win clears inLevel and records the win in one atomic write', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.endAttempt((d) => {
      recordWin(d, 3);
      d.stars += 1;
      d.pendingChest = 'level';
    });
    const saved = stored(h.store);
    expect(saved.inLevel).toBeNull();
    expect(saved.lives.reserved).toBe(0);
    expect(saved.progress).toEqual({ highestLevel: 3, levels: { '3': { won: true, attempts: 1 } } });
    expect(saved.stars).toBe(1);
    expect(saved.pendingChest).toBe('level');
    expect(h.open().resumeOnLaunch(() => IDENTITY)).toEqual({ kind: 'none' });
  });

  it('K-43 level hash mismatch aborts without penalty', () => {
    const h = harness();
    const s = h.open();
    s.commit((d) => void (d.winStreak = 3));
    s.beginAttempt(start({ preBoosters: ['thermos'], streakTier: 2 }));
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.recordAction({ kind: 'hammer', target: { pieceId: 4 } }, { movesMade: 1 });
    s.recordAction(drag(2, 7, 0), { movesMade: 2 });
    s.recordAction({ kind: 'undo' }, { movesMade: 1 });
    const before = stored(h.store);
    const r = h.open();
    const d = r.resumeOnLaunch(() => ({ levelHash: 'h-level-3-updated', rulesVersion: 1 }));
    expect(d).toMatchObject({ kind: 'void', cause: 'level_hash' });
    const after = stored(h.store);
    expect(after.inLevel).toBeNull();
    expect(after.lives).toEqual({ ...before.lives, reserved: 0 });
    expect(after.boosters.inventory).toEqual({ thermos: 1, hammer: 1, undo: 1 });
    expect(after.coins).toBe(before.coins);
    expect(after.winStreak).toBe(3);
    expect(after.progress.levels['3']?.attempts).toBe(1); // attempts are not taken back
    expect(after.voidNotice).toEqual({
      level: 3,
      refunds: { life: 1, boosters: { thermos: 1, hammer: 1, undo: 1 }, coins: 0 },
      bridge: false,
    });
    expect(h.events).toEqual([{ name: 'level_resume_invalid', level: 3, movesMade: 1, cause: 'level_hash' }]);
    expect(r.diagnostics().at(-1)).toEqual({
      kind: 'attemptVoided',
      levelId: 3,
      cause: 'level_hash',
      movesMade: 1,
    });
  });

  it('K-43 rulesVersion mismatch is treated like level hash mismatch', () => {
    const base = { ...createDefaultSave({ analyticsId: 'a', installId: 'i', now: 0, wallet: WALLET }) };
    const il = {
      levelId: 3,
      seed: 3003,
      mode: 'story' as const,
      preBoosters: [],
      streakTier: 0 as const,
      actions: [],
      movesMade: 0,
      offersUsed: 0,
      adOfferUsed: false,
      offerSpendCoins: 0,
      outcomeWindow: 'none' as const,
      levelHash: 'h',
      rulesVersion: 1,
      attemptId: 'x',
      startedAt: 0,
      bridgeEventId: null,
    };
    expect(base.inLevel).toBeNull();
    expect(resumeCause(il, { levelHash: 'h', rulesVersion: 1 })).toBeNull();
    expect(resumeCause(il, { levelHash: 'h', rulesVersion: 2 })).toBe('rules_version');
    expect(resumeCause(il, { levelHash: 'g', rulesVersion: 2 })).toBe('both');
    expect(resumeCause(il, null)).toBe('level_hash');

    const h = harness();
    h.open().beginAttempt(start({ reserveLife: false }));
    const d = h.open().resumeOnLaunch(() => ({ levelHash: IDENTITY.levelHash, rulesVersion: 2 }));
    expect(d).toMatchObject({ kind: 'void', cause: 'rules_version', notice: { refunds: { life: 0 } } });
    expect(h.events).toEqual([
      { name: 'level_resume_invalid', level: 3, movesMade: 0, cause: 'rules_version' },
    ]);
  });

  it('E-45 invalidated attempt refunds life, boosters and offer coins and reduces bridge run spend', () => {
    const h = harness();
    const s = h.open();
    s.commit((d) => {
      d.coins = 3000;
      d.winStreak = 4;
      d.firstOfferGiftUsed = true;
      d.events['bridge-7'] = { joinedAt: 0, runSpend: 2250 };
    });
    s.beginAttempt(
      start({ levelId: 18, preBoosters: ['thermos', 'trowelStart'], bridgeEventId: 'bridge-7' }),
    );
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    s.recordAction({ kind: 'addMoves', amount: 5, source: 'offerAd' }, { movesMade: 14 }); // 1st offer: ad
    s.setOutcomeWindow('outOfMoves');
    s.commit((d) => {
      d.coins -= 1350; // Wallet.apply: 2nd offer paid with coins
      (d.events['bridge-7'] as { runSpend: number }).runSpend += 1350;
    });
    s.recordAction(
      { kind: 'addMoves', amount: 5, source: 'offerCoins' },
      { movesMade: 19, offerCoins: 1350 },
    );
    expect(s.data.events['bridge-7']?.runSpend).toBe(3600);

    const r = h.open();
    const d = r.resumeOnLaunch(() => ({ levelHash: 'new', rulesVersion: 1 }));
    expect(d).toMatchObject({ kind: 'void', cause: 'level_hash' });
    const saved = stored(h.store);
    expect(saved.coins).toBe(3000);
    expect(saved.events['bridge-7']?.runSpend).toBe(2250);
    expect(saved.lives.reserved).toBe(0);
    expect(saved.boosters.inventory).toEqual({ thermos: 1, trowelStart: 1 });
    expect(saved.winStreak).toBe(4);
    expect(saved.firstOfferGiftUsed).toBe(true);
    expect(saved.voidNotice).toEqual({
      level: 18,
      refunds: { life: 1, boosters: { thermos: 1, trowelStart: 1 }, coins: 1350 },
      bridge: true,
    });
  });

  it('K-43 level_resume_invalid then coin_source refund sent after void write', () => {
    const h = harness();
    const s = h.open();
    s.commit((d) => void (d.coins = 1650));
    s.beginAttempt(start({ levelId: 18 }));
    s.recordAction(
      { kind: 'addMoves', amount: 5, source: 'offerCoins' },
      { movesMade: 20, offerCoins: 1350 },
    );
    s.commit((d) => void (d.coins -= 1350));
    h.open().resumeOnLaunch(() => ({ levelHash: 'x', rulesVersion: 9 }));
    expect(h.events).toEqual([
      { name: 'level_resume_invalid', level: 18, movesMade: 20, cause: 'both' },
      { name: 'coin_source', amount: 1350, reason: 'refund', balanceAfter: 1650 },
    ]);
    for (const snap of h.storedAtTrack) {
      const saved = decodeSave(snap ?? '');
      expect(saved.ok && saved.data.inLevel === null && saved.data.coins === 1650).toBe(true);
    }
  });

  it('K-43 void notice shown once on home and survives restart without second refund', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start());
    s.recordAction(
      { kind: 'crane', pieceId: 2, to: { zone: 'yard', x: 0, y: 0 }, rotation: 90 },
      { movesMade: 0 },
    );
    h.open().resumeOnLaunch(() => null);
    const killedBeforeOk = h.open();
    expect(killedBeforeOk.resumeOnLaunch(() => IDENTITY)).toEqual({ kind: 'none' });
    expect(killedBeforeOk.data.voidNotice?.refunds.boosters).toEqual({ crane: 1 });
    expect(killedBeforeOk.data.boosters.inventory).toEqual({ crane: 1 }); // refunded once, not twice
    killedBeforeOk.dismissVoidNotice();
    const next = h.open();
    expect(next.data.voidNotice).toBeNull();
    expect(next.data.boosters.inventory).toEqual({ crane: 1 });
    expect(h.events.filter((e) => e.name === 'level_resume_invalid')).toHaveLength(1);
  });

  it('K-43 attemptBoosters counts pre-level boosters and applied in-level boosters (paint → paintBrush)', () => {
    const h = harness();
    const s = h.open();
    s.beginAttempt(start({ preBoosters: ['openShutter'] }));
    s.recordAction({ kind: 'paint', pieceId: 1, color: 'R' }, { movesMade: 0 });
    s.recordAction({ kind: 'paint', pieceId: 2, color: 'B' }, { movesMade: 0 });
    s.recordAction({ kind: 'trowel', seg: 0, x: 1, y: 2 }, { movesMade: 0 });
    expect(attemptBoosters(s.data.inLevel as NonNullable<SaveData['inLevel']>)).toEqual({
      openShutter: 1,
      paintBrush: 2,
    });
  });

  it('GDD 14.1 context tips are marked once per account', () => {
    const h = harness();
    const s = h.open();
    s.markContextTip('support');
    s.markContextTip('support');
    expect(h.open().data.seenContextTips).toEqual({ support: true });
  });
});

describe('level hash (TECH 11.1 levelHash)', () => {
  it('TECH 11.1 levelHash ignores key order and whitespace and changes with the data', () => {
    const a = { id: 3, moves: 14, wall: { height: 6, gaps: [{ y: 2, size: 1 }] } };
    const b = JSON.parse(
      '{ "wall": { "gaps": [ { "size": 1, "y": 2 } ], "height": 6 }, "moves": 14, "id": 3 }',
    );
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(levelHash(a)).toBe(levelHash(b));
    expect(levelHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(levelHash({ ...a, moves: 15 })).not.toBe(levelHash(a));
    expect(levelHash({ ...a, wall: { height: 6, gaps: [{ y: 3, size: 1 }] } })).not.toBe(levelHash(a));
  });
});
