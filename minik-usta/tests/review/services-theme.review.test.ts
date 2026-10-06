/**
 * Independent rule review, round 1 (reviewer, not the author): services, i18n and theme against the docs.
 *
 * Scope: save v1 + K-43 resume record / void rules (TECH_DESIGN §11.1, GDD K-43, E-38, E-41, E-45, K-29 offer counters),
 * the analytics union (ANALYTICS §2 v5 / §3, TECH §11.4), Phase 2 i18n keys in TR + EN with no hard-coded UI text
 * (TECH §11.5, §14.1, STORY §0, §6, §7), layout invariants (120 / 60 px, FIT + EXPAND, 390×844 and 360×800; UX §0,
 * TECH §2.2, §10.1, D-011, D-015, R-03, R-06) and the draw recipes against ART_DIRECTION §2–§5, §10, D-012, D-013.
 * Every expectation is taken from the document text or its worked examples (quoted next to the test); the
 * implementation is only exercised through its public API (services/save, analytics, i18n, clock; theme/layout,
 * tokens, draw/*). Where a doc table is the source (ART §2.1, §3, §4) it is parsed at test time.
 *
 * Round 2 (same reviewer role, after the round-1 fixes): the areas the fixes touched (cellAt half-open boxes on both
 * phones, the build-front plan art and its boot-atlas frames, the i18n texts) and the gaps round 1 left: K-43 edges
 * (unlimited lives, the K-29 ad/coin offer chain across kills, recovery from the backup mid-level, the TECH §11.1 log
 * size budget, the save never writing what its own load rejects), every save-emitted event against ANALYTICS §2,
 * STORY §0 / ART §8 / D-012 text rules (glyph subset, no suffix on placeholders, no colour names, tone limits, town and
 * company only via placeholders), UX §0.1 / §5.1 numbers on the phone profiles, and ART §2.4 / §4 / §5 / §8 recipes
 * (board colour table, wall body, crane line, blueprint paper and corner, yard floor, scaffold, typography).
 *
 * Round 3 (same reviewer role): no src/services, src/i18n or src/theme file changed after round 2, so round 3 widens the
 * net instead: K-43 / TECH §11.1 "one atomic write" per state change and the order write → events, the two pending home
 * windows across kills (UX §1 (b) chest after a win, (c) void notice without a second refund), the local diagnostics
 * ring (GDD K-43/4), `pagehide` with a G-L move still falling (TECH §4.7 (5)), the analytics values the save feeds
 * (`level_start.attempt`, `mode`, `extensions`), TECH §10.1's 390×763 worked example and the EXPAND clamp, UX §0.1 / §5.1
 * margins, ribbon and streak strip numbers, D-015's single scale setting, ART §3's "120 px'te" column and the layer
 * colours the ART §3 table leaves out, the ART §4 plan cell box, the W1 rail colour, the TECH §10.2 / ASSET texture names,
 * `{company}` and the tone of `resume.void.*`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import { RULES_VERSION } from '../../src/core/session.ts';
import * as display from '../../src/config/display.ts';
import { COLOR_CODES } from '../../src/core/types.ts';
import type { ColorCode, SessionAction, ShapeId } from '../../src/core/types.ts';
import { ANALYTICS_EVENTS, Analytics, validateEvent } from '../../src/services/analytics.ts';
import type { AnalyticsEvent, AnalyticsRecord, CommonParams } from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';
import { HAPTIC_NAMES, createWebHaptics } from '../../src/services/haptics.ts';
import {
  COMPANY_NAME,
  DICTIONARIES,
  createTranslator,
  flattenKeys,
  splitInline,
} from '../../src/services/i18n.ts';
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  DEFAULT_SETTINGS,
  MemoryStore,
  SAVE_KEY,
  SaveService,
  addBoosters,
  decodeSave,
  recordWin,
} from '../../src/services/save.ts';
import type { AttemptStart, KeyValueStore, LevelIdentity, SaveData } from '../../src/services/save.ts';
import { drawBlock } from '../../src/theme/draw/block.ts';
import {
  drawCeilingBeam,
  drawCraneLine,
  drawScaffoldClamp,
  drawScaffoldLedger,
  drawScaffoldPole,
  drawYardFloor,
} from '../../src/theme/draw/board.ts';
import type { DrawContext } from '../../src/theme/draw/context.ts';
import {
  blueprintCornerSize,
  drawBlueprintCorner,
  drawBuildFront,
  drawPlanCell,
  drawPlanDots,
  drawSupportHatch,
} from '../../src/theme/draw/plan.ts';
import { drawGapRail, drawWall, wallFrameOffset, wallSize } from '../../src/theme/draw/wall.ts';
import { createLayout, designHeight, fitViewport, hitArea } from '../../src/theme/layout.ts';
import {
  BOOT_PAGE,
  FRAME,
  blockFrameName,
  bootAtlasFrames,
  packFrames,
  planFrameName,
  planFrontFrameName,
  shapeFrames,
} from '../../src/theme/textures.ts';
import { TOKENS } from '../../src/theme/tokens.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

// =====================================================================================================================
// Save / K-43 helpers
// =====================================================================================================================

const IDENT: LevelIdentity = { levelHash: 'review-level-hash-A', rulesVersion: RULES_VERSION };
const UPDATED: LevelIdentity = { levelHash: 'review-level-hash-B', rulesVersion: RULES_VERSION };

interface Rig {
  readonly store: MemoryStore;
  readonly clock: FakeClock;
  readonly events: AnalyticsEvent[];
  open(): SaveService;
}

function rig(clock = new FakeClock(1_790_000_000_000)): Rig {
  const store = new MemoryStore();
  const events: AnalyticsEvent[] = [];
  let n = 0;
  return {
    store,
    clock,
    events,
    open: () =>
      SaveService.open({
        store,
        clock,
        scheduler: clock,
        startingWallet: economy.startingWallet,
        newId: () => `rid-${++n}`,
        track: (e) => events.push(e),
      }),
  };
}

const start = (over: Partial<AttemptStart> = {}): AttemptStart => ({
  levelId: 3,
  seed: 3003,
  mode: 'story',
  preBoosters: [],
  streakTier: 0,
  levelHash: IDENT.levelHash,
  rulesVersion: IDENT.rulesVersion,
  reserveLife: true,
  ...over,
});

const drag = (pieceId: number, ix: number, iy: number): SessionAction => ({
  kind: 'drag',
  pieceId,
  to: { ix, iy, mode: 0 },
});

const offer = (source: 'offerCoins' | 'offerAd'): SessionAction => ({
  kind: 'addMoves',
  amount: economy.outOfMoves.extraMoves,
  source,
});

function stored(store: MemoryStore, key = SAVE_KEY): SaveData {
  const r = decodeSave(store.get(key) ?? '');
  if (!r.ok) throw new Error(`stored save does not decode: ${r.error}`);
  return r.data;
}

function bridgeRun(d: SaveData, id: string): { runSpend: number } {
  const run = d.events[id];
  if (run === undefined) throw new Error(`no event run ${id}`);
  return run;
}

/** ANALYTICS §3 common parameters as the app would read them; `lives` = stored − reserved (META "ayrılır"). */
function commonOf(d: SaveData): CommonParams {
  return {
    sessionId: 's-1',
    appVersion: 'dev',
    platform: 'web',
    lang: d.settings.lang,
    coins: d.coins,
    lives: d.lives.stored - d.lives.reserved,
    highestLevel: d.progress.highestLevel,
    payer: d.payer,
  };
}

const offerCost = (n: 1 | 2 | 3): number => {
  const c = economy.outOfMoves.offerCosts[n - 1];
  if (c === undefined) throw new Error(`no offer cost ${n}`);
  return c;
};

// =====================================================================================================================
// 1. Save v1 + K-43
// =====================================================================================================================

describe('K-43 in-level record, resume and void (GDD K-43, TECH 11.1)', () => {
  it('K-43 GDD example: "3 hamle, çıkışı onaylar → can 5 → 4, seri 3 → 0"; "3 hamle, telefon çaldı → aynı bölüm, can ayrılmış, seri 3"', () => {
    // Half 2 first: a kill is not a loss.
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.winStreak = 3));
    s.beginAttempt(start());
    [drag(1, 6, 0), drag(2, 7, 0), drag(3, 6, 1)].forEach((m, i) => s.recordAction(m, { movesMade: i + 1 }));
    const relaunch = r.open();
    const decision = relaunch.resumeOnLaunch(() => IDENT);
    expect(decision.kind).toBe('resume');
    if (decision.kind !== 'resume') return;
    expect(decision.inLevel.movesMade).toBe(3);
    expect(decision.inLevel.actions).toHaveLength(4); // 'start' + 3 drags
    expect(relaunch.data.lives).toMatchObject({ stored: 5, reserved: 1 }); // "can ayrılmış"
    expect(relaunch.data.winStreak).toBe(3); // "seri 3"
    expect(r.events).toEqual([{ name: 'level_resume', level: 3, movesMade: 3 }]);

    // Half 1: confirmed exit with m = 3 ≥ 1 is a loss (meta charges the reserved life and resets the streak in the
    // same atomic endAttempt write).
    relaunch.endAttempt((d) => {
      d.lives.stored -= 1;
      d.winStreak = 0;
    });
    const after = stored(r.store);
    expect(after.inLevel).toBeNull();
    expect(after.lives.stored - after.lives.reserved).toBe(4); // "can 5 → 4"
    expect(after.winStreak).toBe(0); // "seri 3 → 0"
  });

  it('K-43 E-38 killed after move 5, reopened 2 h later: same log, life still reserved, streak kept, not voided', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.winStreak = 2));
    s.beginAttempt(start({ levelId: 5, streakTier: 1 }));
    for (let m = 1; m <= 5; m++) s.recordAction(drag(m, 6 + (m % 2), 0), { movesMade: m });
    const savedLog = stored(r.store).inLevel?.actions;
    r.clock.advance(2 * 60 * 60 * 1000);
    const later = r.open();
    const decision = later.resumeOnLaunch((id) => (id === 5 ? IDENT : null));
    expect(decision).toMatchObject({ kind: 'resume', window: 'pause' });
    if (decision.kind !== 'resume') return;
    expect(decision.inLevel.actions).toEqual(savedLog);
    expect(decision.inLevel.streakTier).toBe(1);
    expect(later.data.lives.reserved).toBe(1);
    expect(later.data.winStreak).toBe(2);
    expect(later.data.voidNotice).toBeNull();
    expect(r.events.map((e) => e.name)).toEqual(['level_resume']);
  });

  it('K-43 E-45 worked example: ad offer 1 + 1.350-coin offer 2 on the bridge; update → 1.350 back, run spend 2.250 → 900', () => {
    // E-45: "Oyuncu 2. teklifi 1.350 altınla almış (1. teklif reklamla); uygulama kapanır, güncellenir, bölüm verisi
    // değişmiştir; Sallanan Köprü'de, tur harcaması 2.250 → Deneme cezasız kapanır: can ve güçlendiriciler iade, 1.350
    // altın iade, tur harcaması 2.250 → 900; elenme ve tahta yok; reklam sayacı geri verilmez; oyuncu ana ekranda".
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.coins = 2000;
      d.winStreak = 2;
      d.firstOfferGiftUsed = true;
      d.events['bridge-1'] = { joinedAt: 0, runSpend: 900 };
    });
    s.beginAttempt(start({ levelId: 18, bridgeEventId: 'bridge-1' }));
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    s.recordAction(offer('offerAd'), { movesMade: 11 }); // offer 1: ad
    s.setOutcomeWindow('outOfMoves');
    // offer 2: Wallet.apply (meta) coalesced with the log entry (update() + recordAction() = one store write)
    s.update((d) => {
      d.coins -= offerCost(2);
      bridgeRun(d, 'bridge-1').runSpend += offerCost(2);
    });
    s.recordAction(offer('offerCoins'), { movesMade: 16, offerCoins: offerCost(2) });
    expect(bridgeRun(stored(r.store), 'bridge-1').runSpend).toBe(2250);
    expect(stored(r.store).coins).toBe(650);

    const decision = r.open().resumeOnLaunch(() => UPDATED);
    expect(decision).toMatchObject({ kind: 'void', cause: 'level_hash' });
    const d = stored(r.store);
    expect(d.inLevel).toBeNull(); // "oyuncu ana ekranda"
    expect(d.coins).toBe(2000); // "1.350 altın iade"
    expect(bridgeRun(d, 'bridge-1').runSpend).toBe(900); // "tur harcaması 2.250 → 900"
    expect(d.lives.reserved).toBe(0); // "can ... iade"
    expect(d.winStreak).toBe(2); // "seri bozulmaz"
    expect(d.firstOfferGiftUsed).toBe(true); // "ömür ilk teklif hediyesi" not given back
    expect(d.voidNotice).toEqual({
      level: 18,
      refunds: { life: 1, boosters: {}, coins: 1350 },
      bridge: true,
    });
    // "bu denemede level_end, level_resume, life_lost, event_eliminated gönderilmez"
    expect(r.events).toEqual([
      { name: 'level_resume_invalid', level: 18, movesMade: 16, cause: 'level_hash' },
      { name: 'coin_source', amount: 1350, reason: 'refund', balanceAfter: 2000 },
    ]);
  });

  it('K-29 the lifetime-first free offer counts as offer 1: a kill in the next window reopens offer n = 2 at 1.350', () => {
    // K-29: "Ömrün ilk teklif penceresinde altın seçeneğinin fiyatı 0'dır; teklif 1'e sayılır";
    // K-43/3: "Hamleler bitti penceresi açıkken kapanırsa açılışta aynı pencere aynı teklif numarasıyla gelir".
    const r = rig();
    const s = r.open();
    s.beginAttempt(start());
    s.setOutcomeWindow('outOfMoves');
    s.update((d) => void (d.firstOfferGiftUsed = true));
    s.recordAction(offer('offerCoins'), { movesMade: 11, offerCoins: 0 });
    expect(s.data.inLevel).toMatchObject({ offersUsed: 1, offerSpendCoins: 0, outcomeWindow: 'none' });
    s.setOutcomeWindow('outOfMoves');

    for (let launch = 0; launch < 2; launch++) {
      const decision = r.open().resumeOnLaunch(() => IDENT);
      expect(decision).toMatchObject({ kind: 'resume', window: 'outOfMoves' });
      if (decision.kind !== 'resume') return;
      const n = (decision.inLevel.offersUsed + 1) as 1 | 2 | 3;
      expect(n).toBe(2);
      expect(offerCost(n)).toBe(1350);
    }
    expect(stored(r.store).firstOfferGiftUsed).toBe(true);
  });

  it('K-43 void after the free gift offer: no coin_source (refund 0), gift stays used, attempts not taken back', () => {
    const r = rig();
    const s = r.open();
    s.beginAttempt(start({ levelId: 2 }));
    s.setOutcomeWindow('outOfMoves');
    s.update((d) => void (d.firstOfferGiftUsed = true));
    s.recordAction(offer('offerCoins'), { movesMade: 11, offerCoins: 0 });
    const coins = stored(r.store).coins;
    r.open().resumeOnLaunch(() => ({ levelHash: IDENT.levelHash, rulesVersion: RULES_VERSION + 1 }));
    const d = stored(r.store);
    expect(d.coins).toBe(coins);
    expect(d.firstOfferGiftUsed).toBe(true);
    expect(d.progress.levels['2']?.attempts).toBe(1);
    expect(r.events).toEqual([
      { name: 'level_resume_invalid', level: 2, movesMade: 11, cause: 'rules_version' },
    ]);
  });

  it('K-43 void wins over an open out-of-moves window: no window, no life lost, streak kept', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.winStreak = 4));
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    const decision = r.open().resumeOnLaunch(() => ({ levelHash: 'other', rulesVersion: RULES_VERSION + 1 }));
    expect(decision).toMatchObject({ kind: 'void', cause: 'both' });
    const d = stored(r.store);
    expect(d.inLevel).toBeNull();
    expect(d.lives).toMatchObject({ stored: 5, reserved: 0 });
    expect(d.winStreak).toBe(4);
    expect(r.events.map((e) => e.name)).toEqual(['level_resume_invalid']);
  });

  it('K-43 voidNotice sums the same booster id (pre-level + in-level); Golden Trowel, thermos and streak moves are not boosters', () => {
    // TECH 11.1: "`boosters` = güçlendirici kimliği → iade adedi (oyun öncesi + bölüm içi, aynı kimlik toplanır)";
    // "Altın Mala envanter güçlendiricisi değildir".
    const r = rig();
    const s = r.open();
    s.beginAttempt(start({ levelId: 20, preBoosters: ['thermos', 'trowelStart'], streakTier: 2 }));
    s.recordAction({ kind: 'addMoves', amount: 3, source: 'thermos' }, { movesMade: 0 });
    s.recordAction({ kind: 'addMoves', amount: 2, source: 'streak' }, { movesMade: 0 });
    s.recordAction({ kind: 'hammer', target: { pieceId: 4 } }, { movesMade: 0 });
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.recordAction({ kind: 'undo' }, { movesMade: 0 });
    s.recordAction({ kind: 'hammer', target: { pieceId: 7 } }, { movesMade: 0 });
    s.recordAction({ kind: 'trowel', seg: 0, x: 0, y: 1 }, { movesMade: 0 });
    s.recordAction({ kind: 'paint', pieceId: 2, color: 'Y' }, { movesMade: 0 });
    const decision = r.open().resumeOnLaunch(() => null);
    expect(decision).toMatchObject({ kind: 'void', cause: 'level_hash' });
    const want = { thermos: 1, trowelStart: 1, hammer: 2, undo: 1, paintBrush: 1 };
    expect(stored(r.store).voidNotice?.refunds.boosters).toEqual(want);
    expect(stored(r.store).boosters.inventory).toEqual(want);
  });

  it('K-43 the next attempt after a void counts the voided one (level_start.attempt = 2)', () => {
    // ANALYTICS §2: "levels[id].attempts geri alınmaz; sonraki level_start.attempt iptal edilen denemeyi de sayar".
    const r = rig();
    r.open().beginAttempt(start({ levelId: 4 }));
    const s = r.open();
    s.resumeOnLaunch(() => UPDATED);
    s.dismissVoidNotice();
    expect(s.beginAttempt(start({ levelId: 4, levelHash: UPDATED.levelHash }))).toBe(2);
  });

  it('K-40 pre-level boosters spent at level start (coalesced with beginAttempt) come back once on a void: net zero', () => {
    // K-40: "seçilen güçlendiriciler bölüm başlarken harcanır"; K-43/4: "deneme hiç oynanmamış sayılır ... oyun öncesi
    // güçlendiriciler iade". The spend is a pending update() that the beginAttempt write carries (one store write).
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.boosters.inventory.thermos = 2));
    const writesBefore = r.store.get(SAVE_KEY);
    s.update((d) => void (d.boosters.inventory.thermos = (d.boosters.inventory.thermos ?? 0) - 1));
    expect(r.store.get(SAVE_KEY)).toBe(writesBefore); // not written on its own: a kill here loses nothing
    s.beginAttempt(start({ preBoosters: ['thermos'] }));
    const atStart = stored(r.store);
    expect(atStart.boosters.inventory.thermos).toBe(1);
    expect(atStart.inLevel?.preBoosters).toEqual(['thermos']);
    r.clock.advance(10_000); // the coalescing timer must not write anything else later
    r.open().resumeOnLaunch(() => UPDATED);
    expect(stored(r.store).boosters.inventory.thermos).toBe(2);
  });

  it('K-43 E-41 m = 0 exit: life and pre-level boosters back, streak bonus not consumed, all in one write', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.winStreak = 2;
      d.boosters.inventory.thermos = 1;
    });
    s.update((d) => void (d.boosters.inventory.thermos = 0));
    s.beginAttempt(start({ preBoosters: ['thermos'], streakTier: 2 }));
    const il = s.data.inLevel;
    if (il === null) throw new Error('no attempt');
    expect(il.movesMade).toBe(0);
    s.endAttempt((d) => addBoosters(d, { thermos: 1 }));
    const d = stored(r.store);
    expect(d.inLevel).toBeNull();
    expect(d.lives).toMatchObject({ stored: 5, reserved: 0 });
    expect(d.boosters.inventory.thermos).toBe(1);
    expect(d.winStreak).toBe(2);
  });

  it('K-43 win is one atomic write: a reward step that throws leaves inLevel and the stored save untouched', () => {
    // TECH 11.1: "ödüller ... kazanma anında, tek atomik kayıt yazımında verilir ve aynı yazımda inLevel silinir".
    const r = rig();
    const s = r.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    const before = r.store.get(SAVE_KEY);
    expect(() =>
      s.endAttempt((d) => {
        d.coins += 30;
        d.stars += 1;
        throw new Error('reward table missing');
      }),
    ).toThrow(/reward table missing/);
    expect(r.store.get(SAVE_KEY)).toBe(before);
    expect(s.data.inLevel).not.toBeNull();
    expect(s.data.coins).toBe(economy.startingWallet.coins);
    expect(r.open().resumeOnLaunch(() => IDENT).kind).toBe('resume');
  });
});

describe('save v1 corrupt recovery (TECH 11.1, ANALYTICS save_corrupt, §3)', () => {
  it('TECH 11.1 save_corrupt.stage is the MAIN save’s first failing step even when the backup fails elsewhere', () => {
    const r = rig();
    const mainText = JSON.stringify({ v: 1, data: { coins: 'lots' } }); // parses, no migration, fails the schema
    r.store.set(SAVE_KEY, mainText);
    r.store.set(BACKUP_KEY, '{"v":1,"data":'); // backup fails at parse
    const s = r.open();
    expect(s.loadReport).toMatchObject({ source: 'defaults', failedStage: 'validate' });
    expect(r.store.get(CORRUPT_KEY)).toBe(mainText); // kept locally, verbatim
    expect(r.events).toEqual([{ name: 'save_corrupt', stage: 'validate', recovered: 'defaults' }]);
    const main = stored(r.store);
    expect(main.coins).toBe(economy.startingWallet.coins);
    expect(stored(r.store, BACKUP_KEY)).toEqual(main); // the bad backup is replaced by the recovery write
  });

  it('ANALYTICS §3 save_corrupt and the K-43 void events carry the post-write common params', () => {
    // §3: "save_corrupt, level_resume_invalid ve coin_source{refund} kurtarma / iade yazımından sonra gönderilir; ortak
    // parametreler (coins, lives, highestLevel) yeni durumu taşır".
    const clock = new FakeClock(1_790_000_000_000);
    const store = new MemoryStore();
    const analytics = new Analytics({
      clock,
      common: () => {
        const r = decodeSave(store.get(SAVE_KEY) ?? '');
        if (!r.ok) throw new Error('common read before the recovery write');
        return commonOf(r.data);
      },
      onInvalid: (issues) => {
        throw new Error(issues.join('; '));
      },
    });
    let id = 0;
    const open = (): SaveService =>
      SaveService.open({
        store,
        clock,
        scheduler: clock,
        startingWallet: economy.startingWallet,
        newId: () => `a-${++id}`,
        track: analytics.track,
      });
    const s = open();
    s.commit((d) => {
      d.coins = 1650;
      d.progress.highestLevel = 17;
    });
    s.beginAttempt(start({ levelId: 18 }));
    s.update((d) => void (d.coins -= offerCost(2)));
    s.recordAction(offer('offerCoins'), { movesMade: 20, offerCoins: offerCost(2) });
    // main save corrupted, backup is the last good write (attempt in progress, 300 coins)
    store.set(SAVE_KEY, '{"v":1,"data":{');
    const recovered = open();
    recovered.resumeOnLaunch(() => UPDATED);
    const recs: readonly AnalyticsRecord[] = analytics.recent();
    expect(recs.map((x) => x.event.name)).toEqual(['save_corrupt', 'level_resume_invalid', 'coin_source']);
    const [corrupt, invalid, refund] = recs as [AnalyticsRecord, AnalyticsRecord, AnalyticsRecord];
    expect(corrupt.common).toMatchObject({ coins: 300, lives: 4, highestLevel: 17 });
    expect(invalid.common).toMatchObject({ coins: 1650, lives: 5, highestLevel: 17 });
    expect(refund.event).toMatchObject({ amount: 1350, balanceAfter: 1650 });
    expect(refund.common.coins).toBe(1650);
  });
});

// =====================================================================================================================
// 2. Analytics union (ANALYTICS §2 v5)
// =====================================================================================================================

describe('analytics union = ANALYTICS §2 v5 (TECH 11.4)', () => {
  it('ANALYTICS §2 settings_changed.key covers exactly the save v1 settings (TECH 11.1 "ayarlar (erişilebilirlik dahil)")', () => {
    expect([...ANALYTICS_EVENTS.settings_changed.key.values].sort()).toEqual(
      Object.keys(DEFAULT_SETTINGS).sort(),
    );
  });

  it('TECH 11.7 HapticName = light | medium | heavy | doubleLight | success | win; patterns come from tokens.haptic; Settings switch only', () => {
    expect([...HAPTIC_NAMES].sort()).toEqual(['doubleLight', 'heavy', 'light', 'medium', 'success', 'win']);
    const calls: (number | number[])[] = [];
    const h = createWebHaptics({
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
    });
    h.play('win');
    h.play('light');
    expect(calls).toEqual([[...TOKENS.haptic.win], TOKENS.haptic.light]);
    h.setEnabled(false);
    h.play('heavy');
    expect(calls).toHaveLength(2);
  });

  it('ANALYTICS §2 v5 offer_shown daily_double: offerIndex/priceCoins null valid; offerIndex 0 and 4 rejected', () => {
    const daily = {
      name: 'offer_shown',
      offer: 'daily_double',
      placement: 'daily_double',
      offerIndex: null,
      priceCoins: null,
    };
    expect(validateEvent(daily)).toEqual([]);
    expect(validateEvent({ ...daily, offerIndex: 0 })).not.toEqual([]);
    expect(validateEvent({ ...daily, offerIndex: 4 })).not.toEqual([]);
    expect(validateEvent({ ...daily, placement: 'daily' })).not.toEqual([]); // v3: "eski placement = daily kaldırıldı"
    expect(validateEvent({ name: 'ad_rewarded', placement: 'daily_double', outcome: 'rewarded' })).toEqual(
      [],
    );
    expect(validateEvent({ name: 'ad_rewarded', placement: 'shop', outcome: 'rewarded' })).not.toEqual([]);
  });

  it('ANALYTICS §2 level_end: yao 0–100, extensions 0–3, exitFree bool, mode += replay (v4)', () => {
    const end = {
      name: 'level_end',
      level: 12,
      mode: 'replay',
      result: 'quit',
      movesLeft: 9,
      wrongPlacements: 0,
      yao: 100,
      durationMs: 41_000,
      extensions: 3,
      exitFree: true,
      truckHelps: 0,
    };
    expect(validateEvent(end)).toEqual([]);
    expect(validateEvent({ ...end, yao: 101 })).not.toEqual([]);
    expect(validateEvent({ ...end, extensions: 4 })).not.toEqual([]);
    expect(validateEvent({ ...end, exitFree: 'true' })).not.toEqual([]);
    expect(validateEvent({ ...end, yao: 66.7 })).not.toEqual([]); // "yao = round(100 · YAO)" is an int
  });

  it('ANALYTICS §2 v5 store_open.source covers every UX entry; level_load_failed code is str | null', () => {
    for (const source of [
      'nav',
      'coin_plus',
      'piggy',
      'out_of_moves',
      'bridge_loss',
      'lives_zero',
      'booster_plus',
    ]) {
      expect(validateEvent({ name: 'store_open', source }), source).toEqual([]);
    }
    expect(validateEvent({ name: 'store_open', source: 'shop' })).not.toEqual([]);
    expect(validateEvent({ name: 'level_load_failed', level: 4, stage: 'schema', code: null })).toEqual([]);
    expect(
      validateEvent({ name: 'level_load_failed', level: 4, stage: 'logic', code: 'slider_range' }),
    ).toEqual([]);
    expect(validateEvent({ name: 'level_resume_invalid', level: 4, movesMade: 2, cause: 'both' })).toEqual(
      [],
    );
    expect(
      validateEvent({ name: 'level_resume_invalid', level: 4, movesMade: 2, cause: 'hash' }),
    ).not.toEqual([]);
    expect(
      validateEvent({ name: 'coin_source', amount: 1350, reason: 'refund', balanceAfter: 1650 }),
    ).toEqual([]);
    expect(
      validateEvent({
        name: 'event_continue',
        event: 'bridge',
        plank: 8,
        offerIndex: 1,
        payment: 'ad',
        runCoinsSpent: 0,
      }),
    ).not.toEqual([]);
  });
});

// =====================================================================================================================
// 3. i18n (TECH 11.5, 14.1; STORY §0, §6, §7)
// =====================================================================================================================

const TR_KEYS = new Set(flattenKeys(DICTIONARIES.tr));
const EN_KEYS = new Set(flattenKeys(DICTIONARIES.en));

function textOf(locale: 'tr' | 'en', key: string): string | undefined {
  let node: unknown = DICTIONARIES[locale];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('i18n Phase 2 keys and texts (TECH 11.5, 14.1)', () => {
  it('TECH 11.5 Phase 2 contextual tips (K-05, K-09, K-16/K-17, K-26, K-33, K-34, K-43) exist in TR and EN', () => {
    const keys = [
      'tut.ctx.support',
      'tut.ctx.bounce.color',
      'tut.ctx.bounce.window',
      'tut.ctx.bounce.offplan',
      'tut.ctx.streak',
      'tut.ctx.goldtrowel',
      'tut.ctx.queue',
      'tut.ctx.lastmoves',
      'tut.ctx.resume',
      'tut.ctx.blocked',
      'tut.ctx.tootall',
      'exit.stay',
      'exit.leave',
      'lose.decline',
      'lose.offer.moves',
      'lose.offer.count',
      'lose.offer.last',
      'lose.offer.gift',
      'lose.ad',
      'lose.buygold',
      'lose.streak',
    ];
    for (const k of keys) {
      expect(TR_KEYS.has(k), `tr ${k}`).toBe(true);
      expect(EN_KEYS.has(k), `en ${k}`).toBe(true);
    }
  });

  it('TECH 11.5 keys added by the last consistency rounds exist in TR and EN (TECH 14.1 #13 "i18n anahtar değişiklikleri")', () => {
    const exact = [
      'tut.l23.light',
      'build.done',
      'replay.button',
      'bridge.rule_card.extra',
      'bridge.rule_card.daily',
      'bridge.extra.got',
      'bridge.dailyLimit',
      'bridge.play',
      'league.points_line',
      'league.rule_card.lines.both',
      'league.rule_card.lines.bronze',
      'league.rule_card.lines.diamond',
      'town.name',
      'resume.void.title',
      'resume.void.body',
      'resume.void.bridge',
      'common.ok',
      'common.minutes',
      'common.unlockAt',
    ];
    const prefixes = ['replay.card.', 'league.bonus.', 'difficulty.', 'league.header_lines.'];
    const missing = [
      ...exact.filter((k) => !TR_KEYS.has(k) || !EN_KEYS.has(k)),
      ...prefixes.filter((p) => ![...TR_KEYS].some((k) => k.startsWith(p))).map((p) => `${p}*`),
    ];
    expect(missing).toEqual([]);
  });

  // UX §6 / §7 / §1 name the texts "KAZANDIN!", "Devam" and "Ana sayfa"; STORY §7.6 (Phase 2A gap 1, 2026-10-06) gives
  // them the rows `win.title` (drawn with upper()), `common.continue` and `common.home`, copied verbatim (D-017).
  it('CLAUDE.md "kodda sabit metin yok": Phase 2 windows (UX 6 win "KAZANDIN!" / "Devam", UX 7 "Ana sayfa", UX 1 resume "Devam") have i18n texts', () => {
    const norm = (s: string): string =>
      s
        .toLocaleLowerCase('tr-TR')
        .replace(/[!?.…]/g, '')
        .trim();
    const trTexts = new Set([...TR_KEYS].map((k) => norm(textOf('tr', k) ?? '')));
    const missing = ['Kazandın!', 'Devam', 'Ana sayfa'].filter((t) => !trTexts.has(norm(t)));
    expect(missing).toEqual([]);
    // STORY §7.6: one key per text, shared by every screen ("ekran başına kopya anahtar açılmaz")
    const tr = createTranslator('tr');
    expect(tr.upper(tr.t('win.title'))).toBe('KAZANDIN!');
    expect([tr.t('common.continue'), tr.t('common.home')]).toEqual(['Devam', 'Ana sayfa']);
    expect([EN_KEYS.has('win.title'), EN_KEYS.has('common.continue'), EN_KEYS.has('common.home')]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('STORY 0-10 "Oyun adı app.title anahtarından gelir": no Phaser / canvas text literal in src', () => {
    const offenders: string[] = [];
    const patterns = [
      /\.text\(\s*[^,()]+,\s*[^,()]+,\s*(['"`])((?:(?!\1).)+)\1/g, // scene.add.text(x, y, 'literal')
      /\.setText\(\s*(['"`])((?:(?!\1).)+)\1/g,
      /fillText\(\s*(['"`])((?:(?!\1).)+)\1/g,
    ];
    for (const file of srcFiles(join(ROOT, 'src'))) {
      const code = readFileSync(file, 'utf8');
      for (const re of patterns) {
        for (const m of code.matchAll(re)) {
          const literal = m[2] ?? '';
          if (/\p{L}/u.test(literal)) offenders.push(`${file.slice(ROOT.length + 1)}: "${literal}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // STORY §0-10 "Oyun adı `app.title` anahtarından gelir"; STORY §7.6 gives the working value "Lift & Land" in both
  // languages (D-068 candidate 1, NAMING §5), never upper-cased (ART §8 exception: TR upper() would write "LİFT").
  it('STORY 0-10 app.title exists in TR and EN', () => {
    expect(TR_KEYS.has('app.title') && EN_KEYS.has('app.title')).toBe(true);
    expect(createTranslator('tr').t('app.title')).toBe(createTranslator('en').t('app.title'));
    // BootScene draws t('app.title') and never upper-cases it (comments stripped before the check)
    const bootScene = readFileSync(join(ROOT, 'src/scenes/BootScene.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(bootScene).toMatch(/\bt\(\s*['"]app\.title['"]\s*\)/);
    expect(bootScene).not.toMatch(/upper|toLocaleUpperCase|toUpperCase/);
  });

  it('STORY 7.3 offer texts with config numbers (D-017): "+5 hamle", "Teklif 3/3 · son teklif", EN "Offer 2/3"', () => {
    const tr = createTranslator('tr');
    const en = createTranslator('en');
    const max = economy.outOfMoves.maxOffersPerAttempt;
    expect(tr.t('lose.offer.moves', { n: economy.outOfMoves.extraMoves })).toBe('+5 hamle');
    expect(tr.t('lose.offer.last', { n: max, max })).toBe('Teklif 3/3 · son teklif');
    expect(en.t('lose.offer.count', { n: 2, max })).toBe('Offer 2/3');
    expect(tr.t('lose.ad', { n: economy.outOfMoves.rewardedAdOffer.extraMoves })).toBe(
      'Reklam izle · +5 hamle',
    );
    expect(en.t('lose.offer.gift', { n: economy.outOfMoves.extraMoves })).toBe(
      '+5 moves · a gift from Grandpa',
    );
  });

  it('STORY 0-9 / 0-11 TR number formatting and the {coin} icon run: "eksik ●1.350", "Bölüm 18 baştan başlayacak"', () => {
    const tr = createTranslator('tr');
    const en = createTranslator('en');
    expect(splitInline(tr.t('lose.buygold', { n: 1350 }))).toEqual([
      { kind: 'text', text: 'Altın al · eksik ' },
      { kind: 'icon', icon: 'coin' },
      { kind: 'text', text: '1.350' },
    ]);
    expect(en.t('lose.buygold', { n: 1350 })).toBe('Get coins · {coin}1,350 short');
    expect(tr.t('resume.void.body', { n: 18 })).toBe(
      'Bölüm 18 baştan başlayacak. Harcadıkların geri verildi.',
    );
    expect(tr.t('common.unlockAt', { n: 15 })).toBe('15. bölümde açılır');
  });

  it('CLAUDE.md upper case with the locale: "Kaldığın yerden devam" → "KALDIĞIN YERDEN DEVAM", "Yapı tamam!" → "YAPI TAMAM!"', () => {
    const tr = createTranslator('tr');
    const en = createTranslator('en');
    expect(tr.upper(tr.t('resume.title'))).toBe('KALDIĞIN YERDEN DEVAM');
    expect(tr.upper(tr.t('build.done'))).toBe('YAPI TAMAM!');
    expect(tr.upper(tr.t('exit.title'))).toBe('BÖLÜMDEN ÇIK?');
    expect(tr.upper('işçi')).toBe('İŞÇİ');
    expect(en.upper(en.t('exit.title'))).toBe('LEAVE THE LEVEL?');
  });
});

// =====================================================================================================================
// 4. Layout (UX §0, TECH §2.2, §10.1, D-011, D-015, R-03, R-06)
// =====================================================================================================================

const FIT = createLayout(TOKENS, 1920);
const PHONES = [
  { label: '390×844', viewport: { width: 390, height: 844 } },
  { label: '360×800', viewport: { width: 360, height: 800 } },
] as const;

describe('layout invariants (UX 0.1–0.3, TECH 2.2, 10.1)', () => {
  it('D-011 cell 120 px, wall 60 px; K-01 crane rows 8–9 end at the board top; wall-8 cap sits on the crane-area bottom (ART 5)', () => {
    const g = FIT.grid;
    expect(g.cellPx).toBe(120);
    expect(g.wallW).toBe(60);
    expect(g.cellRect(0, 9)).toEqual({ x: 30, y: 288, w: 120, h: 120 });
    expect(g.cellRect(0, 8).y + 120).toBe(g.boardTopY);
    expect(g.cellRect(7, 0)).toEqual({ x: 930, y: 1368, w: 120, h: 120 });
    // ART 5: "Duvar 8 satırsa başlık vinç alanının alt sınırına oturur"
    const wall8 = g.wallRect(8);
    const capTop = wall8.y + wallFrameOffset(TOKENS).y;
    expect(capTop + wallSize({ height: 8, gaps: [] }, TOKENS).h - 8 * 120).toBe(g.boardTopY);
    expect(capTop).toBeLessThan(g.boardTopY);
  });

  it('UX 0.1 FIT popups: 3 options 1056–1560, 1 option 1408–1560, the 1 280 px pre-level panel starts at y 344', () => {
    const three = FIT.popup.options(3);
    expect(three[0]?.y).toBe(1056);
    expect((three[2]?.y ?? 0) + (three[2]?.h ?? 0)).toBe(1560);
    expect(FIT.popup.options(1)[0]).toMatchObject({ y: 1408, h: 152 });
    expect(FIT.popup.panelBottomY - 1280).toBe(344);
    // UX 0.3 "Eşit seçenekler": equal size 920 × 152, centred
    for (const o of three) expect(o).toMatchObject({ x: 80, w: 920, h: 152 });
  });

  it('UX 0.1 / R-06 phones: FIT letterbox 151 pt (390×844) and 160 px = 20 % (360×800); EXPAND H 2337 / 2400, board 208 px lower', () => {
    const fit390 = fitViewport('fit', PHONES[0].viewport, TOKENS);
    const fit360 = fitViewport('fit', PHONES[1].viewport, TOKENS);
    expect(Math.round(fit390.letterboxPx)).toBe(151);
    expect(fit360.letterboxPx).toBeCloseTo(160, 6);
    expect(fit360.letterboxPx / 800).toBeCloseTo(0.2, 6);
    expect(designHeight('expand', PHONES[0].viewport, TOKENS)).toBe(2337);
    expect(designHeight('expand', PHONES[1].viewport, TOKENS)).toBe(2400);
    // UX 0.1: "2337 px'te (390×844, EXPAND) tahta 208 px aşağı kayar"
    const l = createLayout(TOKENS, 2337);
    expect(Math.abs(l.grid.boardBottomY - FIT.grid.boardBottomY - 208)).toBeLessThanOrEqual(1);
    for (const p of PHONES) {
      expect(fitViewport('expand', p.viewport, TOKENS).pillarboxPx, p.label).toBeCloseTo(0, 6);
    }
  });

  it('UX 0.2 primary action y ≥ 1400 and ≥ 128 px; EXPAND popups stay in the lower 45 % on both phones', () => {
    for (const H of [1920, 2337, 2400]) {
      const l = createLayout(TOKENS, H);
      const comfortTop = Math.round(0.55 * H);
      const play = l.bottom.playButton;
      expect(play.y, `play H=${H}`).toBeGreaterThanOrEqual(1400);
      expect(play.h).toBeGreaterThanOrEqual(128);
      const one = l.popup.options(1)[0];
      expect(one?.y ?? 0, `1 option H=${H}`).toBeGreaterThanOrEqual(1400);
      for (const n of [1, 2, 3]) {
        const opts = l.popup.options(n);
        expect(opts[0]?.y ?? 0, `${n} options H=${H}`).toBeGreaterThanOrEqual(comfortTop);
        expect((opts.at(-1)?.y ?? 0) + (opts.at(-1)?.h ?? 0)).toBeLessThanOrEqual(H);
      }
      // the booster bar is in the comfort zone too (UX 0.2 "güçlendiriciler")
      for (const b of l.bottom.boosters) expect(b.y).toBeGreaterThanOrEqual(comfortTop);
    }
  });

  it('UX 0.3 "Görsel + pay": 112 → 8 px, 96 → 16 px, 88 → 20 px each side; 172 px booster slot unchanged', () => {
    const min = TOKENS.touch.minTargetPx;
    expect(min).toBe(128);
    for (const [side, pad] of [
      [112, 8],
      [96, 16],
      [88, 20],
    ] as const) {
      expect(hitArea({ x: 100, y: 200, w: side, h: side }, min)).toEqual({
        x: 100 - pad,
        y: 200 - pad,
        w: min,
        h: min,
      });
    }
    const slot = FIT.bottom.boosters[0];
    if (slot === undefined) throw new Error('no booster slot');
    expect(hitArea(slot, min)).toEqual(slot);
    // UX 0.1: "120 px hücre … touch.hitSlopPx = 30 … 180 px'e çıkar"
    expect(120 + 2 * TOKENS.touch.hitSlopPx).toBe(180);
  });

  it('TECH 10.1 H = 2400: board group +240 (statusY 1504 → 1744), top group fixed, bottom group follows the bottom edge', () => {
    const l = createLayout(TOKENS, 2400);
    expect(l.board.status.y).toBe(1744);
    expect(l.grid.boardBottomY).toBe(1728);
    expect(l.grid.craneTopY).toBe(528);
    expect(l.top.pause).toEqual(FIT.top.pause);
    expect(l.top.moves).toEqual(FIT.top.moves);
    expect(l.bottom.boosters[0]?.y).toBe(2400 - 88 - 172);
    expect(l.bottom.groupTopY).toBe(2080);
    expect(l.board.status.y + l.board.status.h).toBeLessThanOrEqual(l.bottom.groupTopY);
    expect(l.board.siteRibbon.x).toBe(FIT.board.siteRibbon.x); // ribbon x/w/h/tilt do not depend on H
    expect(l.board.siteRibbon.y).toBe(FIT.board.siteRibbon.y + 240);
  });

  it('R-03 dragged piece over the wall: 1-wide centred at ax 5.5, 2-wide at ax 5 covers it with two 30 px halves; anchorXAt inverts', () => {
    const g = FIT.grid;
    const wallMid = g.wallX + g.wallW / 2;
    expect(g.pieceX(5.5, 1) + 60).toBeCloseTo(wallMid, 9);
    expect(g.pieceX(5, 1)).toBe(g.colLeft(5));
    expect(g.pieceX(6, 1)).toBe(g.buildX);
    const r2 = g.pieceRect(5, 0, 2, 1);
    expect(g.wallX - r2.x - 120).toBeCloseTo(-30, 9); // left cell overlaps the wall by 30 px
    expect(r2.x + 240 - (g.wallX + g.wallW) - 120).toBeCloseTo(-30, 9); // right cell overlaps by 30 px
    expect(r2.x).toBeGreaterThanOrEqual(g.colLeft(5)); // does not spill over column 4
    expect(r2.x + r2.w).toBeLessThanOrEqual(g.colLeft(7)); // nor over column 7
    for (const w of [1, 2]) {
      for (let ax = 0; ax <= 8 - w; ax += 0.125) {
        expect(g.anchorXAt(g.pieceX(ax, w), w)).toBeCloseTo(ax, 9);
      }
    }
    // a resting piece never straddles: whole anchors map to cell edges
    expect(g.pieceX(4, 2)).toBe(g.colLeft(4));
    expect(g.pieceX(6, 2)).toBe(g.colLeft(6));
  });

  it('K-04 / R-03 cellAt: the 60 px wall strip (x 750–809) and the margins outside the 8 × 10 grid are no cell', () => {
    const g = FIT.grid;
    expect(g.cellAt(749, 1487)).toEqual({ x: 5, y: 0 });
    expect(g.cellAt(750, 1487)).toBeNull();
    expect(g.cellAt(809, 1000)).toBeNull();
    expect(g.cellAt(810, 1487)).toEqual({ x: 6, y: 0 });
    expect(g.cellAt(30, 287)).toBeNull();
    expect(g.cellAt(29, 1000)).toBeNull();
    expect(g.cellAt(1050, 1000)).toBeNull();
  });

  it('K-01 cellAt is the exact inverse of cellRect on pixel edges: every cell owns [x, x + 120) × [y, y + 120)', () => {
    // TECH 2.2: "satır y → boardBottomY' − (y + 1)·cellPx" is the cell's TOP edge (canvas y down), so the cell box is
    // [top, top + 120); a hit test must give the top-left pixel of a cell to that cell and the board's bottom line
    // (y = boardBottomY, first pixel below row 0) to nobody.
    const g = FIT.grid;
    const wrong: string[] = [];
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 10; y++) {
        const r = g.cellRect(x, y);
        for (const [px, py] of [
          [r.x, r.y],
          [r.x + r.w - 0.5, r.y],
          [r.x, r.y + r.h - 0.5],
        ] as const) {
          const hit = g.cellAt(px, py);
          if (hit?.x !== x || hit.y !== y) wrong.push(`(${px},${py}) → ${JSON.stringify(hit)} ≠ (${x},${y})`);
        }
      }
    }
    expect.soft(wrong.slice(0, 4), `${wrong.length} edge pixels map to the wrong cell`).toEqual([]);
    expect.soft(g.cellAt(30, g.boardBottomY)).toBeNull();
  });
});

// =====================================================================================================================
// 5. Draw recipes (ART §2–§5, §10; D-012, D-013)
// =====================================================================================================================

type Op = readonly [string, ...unknown[]];

function recordOps(draw: (ctx: DrawContext) => void): Op[] {
  const ops: Op[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, p) {
      if (typeof p !== 'string') return undefined;
      if (Object.hasOwn(props, p)) return props[p];
      return (...args: unknown[]): void => {
        ops.push([p, ...args.map((a) => (Array.isArray(a) ? [...(a as unknown[])] : a))]);
      };
    },
    set(_t, p, v: unknown) {
      if (typeof p === 'string') {
        props[p] = v;
        ops.push([`=${p}`, v]);
      }
      return true;
    },
  });
  draw(ctx as unknown as DrawContext);
  return ops;
}

interface Paint {
  readonly op: 'fill' | 'stroke' | 'fillRect';
  readonly style: string;
  readonly lineWidth: number;
  readonly dash: readonly number[];
  readonly args: readonly unknown[];
  /** Path commands since the last beginPath. */
  readonly path: readonly Op[];
  readonly clipped: boolean;
}

function paints(ops: readonly Op[]): Paint[] {
  interface St {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    dash: readonly number[];
    clipped: boolean;
  }
  let st: St = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, dash: [], clipped: false };
  const stack: St[] = [];
  let path: Op[] = [];
  const out: Paint[] = [];
  for (const o of ops) {
    const [name, ...args] = o;
    switch (name) {
      case 'save':
        stack.push({ ...st });
        break;
      case 'restore':
        st = stack.pop() ?? st;
        break;
      case '=fillStyle':
        st.fillStyle = String(args[0]);
        break;
      case '=strokeStyle':
        st.strokeStyle = String(args[0]);
        break;
      case '=lineWidth':
        st.lineWidth = Number(args[0]);
        break;
      case 'setLineDash':
        st.dash = [...(args[0] as number[])];
        break;
      case 'clip':
        st.clipped = true;
        break;
      case 'beginPath':
        path = [];
        break;
      case 'fill':
      case 'stroke':
      case 'fillRect':
        out.push({
          op: name,
          style: name === 'stroke' ? st.strokeStyle : st.fillStyle,
          lineWidth: st.lineWidth,
          dash: st.dash,
          args,
          path: [...path], // snapshot: later ops (translate, scale) must not join the painted path
          clipped: st.clipped,
        });
        break;
      default:
        if (!name.startsWith('=')) path.push(o);
    }
  }
  return out;
}

type Rgb = readonly [number, number, number];
interface Rgba {
  readonly rgb: Rgb;
  readonly a: number;
}

function parseColor(s: string): Rgba {
  const hex = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(s);
  if (hex) {
    return {
      rgb: [parseInt(hex[1] ?? '', 16), parseInt(hex[2] ?? '', 16), parseInt(hex[3] ?? '', 16)],
      a: 1,
    };
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s);
  if (rgba) return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], a: Number(rgba[4]) };
  throw new Error(`unparsed colour ${s}`);
}

const hexRgb = (h: string): Rgb => parseColor(h).rgb;
const WHITE: Rgb = [255, 255, 255];
const over = (bottom: Rgb, top: Rgba): Rgb =>
  [0, 1, 2].map((i) => (bottom[i] ?? 0) * (1 - top.a) + (top.rgb[i] ?? 0) * top.a) as unknown as Rgb;
const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** WCAG 2 contrast ratio. */
const contrast = (a: Rgb, b: Rgb): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const near = (a: Rgb, b: Rgb, tol = 1): boolean => a.every((v, i) => Math.abs(v - (b[i] ?? -99)) <= tol);

const ART_MD = read('docs/ART_DIRECTION.md');

/** ART §2.1 "Yeni hex" column. */
function artPalette(): Record<ColorCode, string> {
  const out: Partial<Record<ColorCode, string>> = {};
  for (const m of ART_MD.matchAll(
    /^\| ([WYGROCBP]) \| [^|]+\| #[0-9A-F]{6} \| \*\*(#[0-9A-F]{6})\*\* \|/gm,
  )) {
    out[m[1] as ColorCode] = m[2] as string;
  }
  expect(Object.keys(out).sort()).toEqual([...COLOR_CODES].sort());
  return out as Record<ColorCode, string>;
}

/** ART §3 "Hesaplanmış katman renkleri" table. */
function artLayerTable(): Record<
  ColorCode,
  { base: string; top: string; bottom: string; outline: string; ink: string }
> {
  const out: Partial<
    Record<ColorCode, { base: string; top: string; bottom: string; outline: string; ink: string }>
  > = {};
  const re =
    /^\| ([WYGROCBP]) \| (#[0-9A-F]{6}) \| (#[0-9A-F]{6}) \| (#[0-9A-F]{6}) \| (#[0-9A-F]{6}) \| ([^|]+) \|$/gm;
  for (const m of ART_MD.matchAll(re)) {
    out[m[1] as ColorCode] = {
      base: m[2] as string,
      top: m[3] as string,
      bottom: m[4] as string,
      outline: m[5] as string,
      ink: (m[6] as string).trim(),
    };
  }
  expect(Object.keys(out).sort()).toEqual([...COLOR_CODES].sort());
  return out as Record<
    ColorCode,
    { base: string; top: string; bottom: string; outline: string; ink: string }
  >;
}

/** ART §4 "Bileşik plan renkleri (kontrol için)". */
function artPlanComposites(): Record<ColorCode, string> {
  const line =
    /Bileşik plan renkleri \(kontrol için\):\s*([^\n]+(?:\n[^\n-][^\n]*)?)/.exec(ART_MD)?.[1] ?? '';
  const out: Partial<Record<ColorCode, string>> = {};
  for (const m of line.matchAll(/([WYGROCBP]) (#[0-9A-F]{6})/g)) out[m[1] as ColorCode] = m[2] as string;
  expect(Object.keys(out).sort()).toEqual([...COLOR_CODES].sort());
  return out as Record<ColorCode, string>;
}

/** Plan cell as drawn: opaque composite fill and the symbol ink (fill or stroke with an 'ink' style ≠ carve). */
function drawnPlan(
  color: ColorCode,
  colorBlind = false,
  front = false,
): { fill: Rgb; stroke: Rgb; dash: readonly number[]; ink: Rgba } {
  const p = paints(recordOps((ctx) => drawPlanCell(ctx, { color, mode: { colorBlind }, front }, TOKENS)));
  const fill = p.find((x) => x.op === 'fill');
  const outline = p.find((x) => x.op === 'stroke');
  if (fill === undefined || outline === undefined) throw new Error('plan cell not drawn');
  const fillRgb = parseColor(fill.style).rgb;
  // symbol parts come after the outline; the ink is the style that is not the fill colour (carve uses the fill)
  const inkPaint = p.slice(2).find((x) => !near(parseColor(x.style).rgb, fillRgb, 0));
  if (inkPaint === undefined) throw new Error(`no symbol ink for ${color}`);
  return {
    fill: fillRgb,
    stroke: parseColor(outline.style).rgb,
    dash: outline.dash,
    ink: parseColor(inkPaint.style),
  };
}

describe('draw recipes vs ART_DIRECTION (D-012, D-013)', () => {
  it('D-012 block base colours are the ART 2.1 "Yeni hex" palette (drawn B1 fill and tokens)', () => {
    const pal = artPalette();
    for (const c of COLOR_CODES) {
      expect(TOKENS.color.block[c].toUpperCase(), c).toBe(pal[c]);
      const first = paints(recordOps((ctx) => drawBlock(ctx, { shape: 'B1_0', color: c }, TOKENS))).find(
        (x) => x.op === 'fill',
      );
      expect(first?.style.toUpperCase(), c).toBe(pal[c]);
    }
  });

  it('ART 3 drawn layer colours equal the ART 3 table (top +20 %, bottom ×0.75, outline ×0.55, symbol ink) ±1', () => {
    const table = artLayerTable();
    for (const c of COLOR_CODES) {
      const p = paints(recordOps((ctx) => drawBlock(ctx, { shape: 'B1_0', color: c }, TOKENS)));
      const fills = p.filter((x) => x.op !== 'stroke').map((x) => parseColor(x.style));
      const strokes = p.filter((x) => x.op === 'stroke').map((x) => parseColor(x.style));
      const row = table[c];
      for (const [layer, hex] of [
        ['base', row.base],
        ['top', row.top],
        ['bottom', row.bottom],
      ] as const) {
        expect(
          fills.some((f) => f.a === 1 && near(f.rgb, hexRgb(hex))),
          `${c} ${layer} ${hex}`,
        ).toBe(true);
      }
      expect(
        strokes.some((s) => s.a === 1 && near(s.rgb, hexRgb(row.outline))),
        `${c} outline ${row.outline}`,
      ).toBe(true);
      const ink = row.ink.startsWith('#FFFFFF %')
        ? { rgb: WHITE, a: Number(row.ink.replace('#FFFFFF %', '')) / 100 }
        : { rgb: hexRgb(row.ink), a: 1 };
      expect(
        [...fills, ...strokes].some((x) => Math.abs(x.a - ink.a) < 1e-6 && near(x.rgb, ink.rgb)),
        `${c} symbol ink ${row.ink}`,
      ).toBe(true);
    }
  });

  it('D-013 plan cells: composite = ART 4 list (Y #F2DD5E …), dashed 4 px 14/10 stroke = composite × 0.65, ink #14233D on Y G O C B, white 100 % on W R P', () => {
    const want = artPlanComposites();
    for (const c of COLOR_CODES) {
      const d = drawnPlan(c);
      expect(near(d.fill, hexRgb(want[c])), `${c} fill ${want[c]}`).toBe(true);
      expect(near(d.stroke, hexRgb(want[c]).map((v) => v * 0.65) as unknown as Rgb), `${c} stroke`).toBe(
        true,
      );
      expect(d.dash).toEqual([14, 10]);
      const dark = ['Y', 'G', 'O', 'C', 'B'].includes(c);
      expect(d.ink, c).toEqual(dark ? { rgb: hexRgb('#14233D'), a: 1 } : { rgb: WHITE, a: 1 });
    }
  });

  it('ART 2.2 block symbol contrast (Y 5,33 · C 4,93 · G 4,55 · O 4,10 · W 6,5 · P 6,2 · R 3,8 · B 3,2), all ≥ 3:1', () => {
    const want: Record<ColorCode, number> = {
      Y: 5.33,
      C: 4.93,
      G: 4.55,
      O: 4.1,
      W: 6.5,
      P: 6.2,
      R: 3.8,
      B: 3.2,
    };
    const table = artLayerTable();
    for (const c of COLOR_CODES) {
      const base = hexRgb(table[c].base);
      const p = paints(recordOps((ctx) => drawBlock(ctx, { shape: 'B1_0', color: c }, TOKENS)));
      const symbolPaints = p.slice(p.findIndex((x) => x.op === 'stroke' && x.lineWidth === 12) + 1);
      const ink = parseColor(symbolPaints[0]?.style ?? '#000000');
      const ratio = contrast(base, over(base, ink));
      expect(ratio, `${c} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      expect(Math.abs(ratio - want[c]), `${c} ${ratio.toFixed(2)} vs ${want[c]}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('ART 4 plan symbol contrast, default state (W 5,9 · R 4,0 · P 5,6 · B 4,8 · Y 11,4 · G 8,1 · O 6,6 · C 9,9), all ≥ 3:1', () => {
    const want: Record<ColorCode, number> = {
      W: 5.9,
      R: 4.0,
      P: 5.6,
      B: 4.8,
      Y: 11.4,
      G: 8.1,
      O: 6.6,
      C: 9.9,
    };
    for (const c of COLOR_CODES) {
      const d = drawnPlan(c);
      const ratio = contrast(d.fill, over(d.fill, d.ink));
      expect(ratio, c).toBeGreaterThanOrEqual(3);
      expect(Math.abs(ratio - want[c]), `${c} ${ratio.toFixed(2)} vs ${want[c]}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('ART 4 plan symbol contrast on the build front as rendered (front plan cell + plan_front contour): W 4,3 · R 3,2 · P 4,1 · B 4,8 / 5,8; colour-blind lowest R 3,5', () => {
    // ART §4: "her durumda WCAG 1.4.11 ≥ 3:1 (ölçüldü; varsayılan / inşa cephesi +%15 açık): W 5,9 / 4,3 · R 4,0 / 3,2 ·
    // P 5,6 / 4,1 · B 4,8 / 5,8 · …; renk körü modu (%90 dolgu) en düşük R 3,5". Layer order (ART §4, TECH §10.3):
    // plan cells → grid overlay → build front contour → blocks. The measured numbers keep the symbol ink at 100 %
    // (B 4,8 → 5,8 only when the dark ink is not lightened), so the +15 % lightening is the front plan cell's fill
    // (`plan_<c>_front`) and the `plan_front` contour frame paints nothing over the symbol.
    const front = paints(recordOps((ctx) => drawBuildFront(ctx, TOKENS)));
    expect(front.filter((x) => x.op === 'fill')).toEqual([]);
    const rendered = (c: ColorCode, colorBlind: boolean): number => {
      const d = drawnPlan(c, colorBlind, true);
      return contrast(d.fill, over(d.fill, d.ink));
    };
    const want: Partial<Record<ColorCode, number>> = { W: 4.3, R: 3.2, P: 4.1, B: 5.8 };
    for (const [c, v] of Object.entries(want) as [ColorCode, number][]) {
      const ratio = rendered(c, false);
      expect.soft(ratio, `${c} front`).toBeGreaterThanOrEqual(3);
      expect.soft(Math.abs(ratio - v), `${c} front ${ratio.toFixed(2)} vs ART ${v}`).toBeLessThanOrEqual(0.1);
    }
    const cb = COLOR_CODES.map((c) => ({ c, ratio: rendered(c, true) })).sort((a, b) => a.ratio - b.ratio)[0];
    expect.soft(cb?.c, `colour-blind lowest is ${cb?.c} ${cb?.ratio.toFixed(2)}`).toBe('R');
    expect.soft(Math.abs((cb?.ratio ?? 0) - 3.5)).toBeLessThanOrEqual(0.1);
  });

  it('ART 10 colour-blind mode: plan fill 90 %, block white ink 85 % → 98 %, dark ink ×0.40 → ×0.34, symbols ×1.2', () => {
    const under = hexRgb(TOKENS.color.board.planUnderlay);
    expect(near(drawnPlan('R', true).fill, over(under, { rgb: hexRgb(TOKENS.color.block.R), a: 0.9 }))).toBe(
      true,
    );
    const inkOf = (c: ColorCode, colorBlind: boolean): Rgba => {
      const p = paints(
        recordOps((ctx) => drawBlock(ctx, { shape: 'B1_0', color: c, mode: { colorBlind } }, TOKENS)),
      );
      const after = p.slice(p.findIndex((x) => x.op === 'stroke' && x.lineWidth === 12) + 1);
      return parseColor(after[0]?.style ?? '#000000');
    };
    expect(inkOf('B', true).a).toBeCloseTo(0.98, 2);
    expect(
      near(inkOf('Y', true).rgb, hexRgb(TOKENS.color.block.Y).map((v) => v * 0.34) as unknown as Rgb),
    ).toBe(true);
    // symbol box: 0,46c = 55,2 px → ×1,2 = 66,24 px (the symbol is scaled from its 100-unit box)
    const scaleOf = (colorBlind: boolean): number => {
      const ops = recordOps((ctx) =>
        drawBlock(ctx, { shape: 'B1_0', color: 'G', mode: { colorBlind } }, TOKENS),
      );
      const s = ops.find((o) => o[0] === 'scale');
      return Number(s?.[1]) * 100;
    };
    expect(scaleOf(false)).toBeCloseTo(0.46 * 120, 6);
    expect(scaleOf(true)).toBeCloseTo(0.46 * 120 * 1.2, 6);
  });

  it('ART 4 "." cell: 45° hatch, 4 px lines 16 px apart (perpendicular), white 28 %; single cell 3 px white 40 % dashed', () => {
    const p = paints(
      recordOps((ctx) => drawPlanDots(ctx, { rows: 5, cols: 2, dots: [{ x: 1, y: 2 }] }, TOKENS)),
    );
    const hatch = p.find((x) => x.op === 'stroke' && x.lineWidth === 4);
    if (hatch === undefined) throw new Error('no hatch');
    expect(hatch.clipped).toBe(true);
    expect(parseColor(hatch.style)).toEqual({ rgb: WHITE, a: 0.28 });
    const starts = hatch.path
      .filter((o) => o[0] === 'moveTo')
      .map((o) => [Number(o[1]), Number(o[2])] as const);
    const ends = hatch.path
      .filter((o) => o[0] === 'lineTo')
      .map((o) => [Number(o[1]), Number(o[2])] as const);
    expect(starts.length).toBeGreaterThan(3);
    // every line is at 45° (dx = −dy) and neighbouring lines are 16 px apart measured perpendicular to them
    starts.forEach(([x0, y0], i) => {
      const [x1, y1] = ends[i] ?? [NaN, NaN];
      expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 9);
    });
    const offsets = starts.map(([x, y]) => (x + y) / Math.SQRT2);
    for (let i = 1; i < offsets.length; i++)
      expect((offsets[i] ?? 0) - (offsets[i - 1] ?? 0)).toBeCloseTo(16, 9);
    const outline = p.find((x) => x.op === 'stroke' && x.lineWidth === 3);
    expect(outline && parseColor(outline.style)).toEqual({ rgb: WHITE, a: 0.4 });
    expect(outline?.dash.length).toBeGreaterThan(0);
  });

  it('ART 5 W1 (level 3: height 6, gap y 2 size 2): 14 px hazard bands right above and below the opening, opening transparent, 20 px cap', () => {
    const spec = { height: 6, gaps: [{ y: 2, size: 2, type: 'static' }] };
    expect(wallSize(spec, TOKENS)).toEqual({ w: 72, h: 6 * 120 + 20 });
    const p = paints(recordOps((ctx) => drawWall(ctx, spec, TOKENS)));
    const yellow = TOKENS.color.ui.hazardYellow.toUpperCase();
    const bands = p
      .filter((x) => x.op === 'fillRect' && x.style.toUpperCase() === yellow)
      .map((x) => x.args.map(Number));
    // frame y: cap 0–20, row r occupies 20 + (5 − r)·120 … +120 → opening rows 2–3 = 260–500
    expect(bands).toContainEqual([0, 0, 72, 20]);
    expect(bands).toContainEqual([0, 260 - 14, 72, 14]);
    expect(bands).toContainEqual([0, 500, 72, 14]);
    const body = p
      .filter((x) => x.op === 'fillRect' && x.style.toUpperCase() === TOKENS.color.board.wall.toUpperCase())
      .map((x) => x.args.map(Number));
    expect(body).toEqual([
      [6, 500, 60, 240],
      [6, 20, 60, 240],
    ]);
    for (const [, y, , h] of body) expect((y ?? 0) >= 500 || (y ?? 0) + (h ?? 0) <= 260).toBe(true);
  });
});

// =====================================================================================================================
// Round 2 — 1. Save / K-43 edges and the save-emitted analytics events
// =====================================================================================================================

describe('round 2: K-43 / K-29 edges (GDD K-29, K-43; TECH 11.1)', () => {
  it('K-29 GDD example survives kills: ad on offer 1 → the reopened window 2 costs 1.350 with no ad; after 3 offers the reopened window has no offer; a void refunds 1.350 + 1.800', () => {
    // K-29 Örnek: "teklif 1'de oyuncu reklam izler → kalan 5. Yine biter → teklif 2: altın 1.350, reklam seçeneği yok".
    // K-29: "3 teklif kullanılmışsa pencere teklif içermez"; K-43/3: "aynı pencere aynı teklif numarasıyla gelir";
    // K-43/4: "bu denemede +5 tekliflerine ödenen altının tamamı" back.
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.coins = 5000;
      d.firstOfferGiftUsed = true;
    });
    s.beginAttempt(start({ levelId: 4 }));
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    s.recordAction(offer('offerAd'), { movesMade: 10 });
    s.setOutcomeWindow('outOfMoves'); // "Yine biter" → killed while window 2 is open

    const ad = economy.outOfMoves.rewardedAdOffer;
    const reopen = (): { svc: SaveService; n: number; adOffered: boolean } => {
      const svc = r.open();
      const decision = svc.resumeOnLaunch(() => IDENT);
      if (decision.kind !== 'resume') throw new Error(`expected resume, got ${decision.kind}`);
      expect(decision.window).toBe('outOfMoves');
      const n = decision.inLevel.offersUsed + 1;
      const adOffered = n === ad.offerIndex && !decision.inLevel.adOfferUsed;
      return { svc, n, adOffered };
    };

    const w2 = reopen();
    expect([w2.n, w2.adOffered, offerCost(2)]).toEqual([2, false, 1350]);
    expect(w2.svc.data.inLevel?.adOfferUsed).toBe(true);
    w2.svc.update((d) => void (d.coins -= offerCost(2)));
    w2.svc.recordAction(offer('offerCoins'), { movesMade: 15, offerCoins: offerCost(2) });
    w2.svc.setOutcomeWindow('outOfMoves');

    const w3 = reopen();
    expect([w3.n, w3.adOffered]).toEqual([3, false]);
    w3.svc.update((d) => void (d.coins -= offerCost(3)));
    w3.svc.recordAction(offer('offerCoins'), { movesMade: 20, offerCoins: offerCost(3) });
    w3.svc.setOutcomeWindow('outOfMoves');

    const w4 = reopen();
    expect(w4.n).toBeGreaterThan(economy.outOfMoves.maxOffersPerAttempt); // no offer, the loss result only
    expect(stored(r.store).coins).toBe(5000 - 1350 - 1800);

    r.open().resumeOnLaunch(() => UPDATED);
    expect(stored(r.store).coins).toBe(5000);
    expect(r.events.filter((e) => e.name !== 'level_resume')).toEqual([
      { name: 'level_resume_invalid', level: 4, movesMade: 20, cause: 'level_hash' },
      { name: 'coin_source', amount: 3150, reason: 'refund', balanceAfter: 5000 },
    ]);
    expect(r.events.filter((e) => e.name === 'level_resume')).toHaveLength(3);
  });

  it('K-43 unlimited lives: no life was reserved, so a void refunds life 0 (voidNotice.life = 0) and the stored lives stay', () => {
    // TECH 11.1: "`life` = iade edilen can (0 | 1; sınırsız can süresinde can ayrılmadıysa 0)".
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.lives.unlimitedUntil = r.clock.now() + 60 * 60 * 1000;
      d.lives.stored = 3;
    });
    s.beginAttempt(start({ reserveLife: false }));
    expect(stored(r.store).lives).toMatchObject({ stored: 3, reserved: 0 });
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    const decision = r.open().resumeOnLaunch(() => UPDATED);
    expect(decision).toMatchObject({ kind: 'void', notice: { refunds: { life: 0 } } });
    const d = stored(r.store);
    expect(d.lives).toMatchObject({ stored: 3, reserved: 0 });
    expect(d.voidNotice).toEqual({ level: 3, refunds: { life: 0, boosters: {}, coins: 0 }, bridge: false });
    expect(r.events).toEqual([{ name: 'level_resume_invalid', level: 3, movesMade: 1, cause: 'level_hash' }]);
  });

  it('K-43 + TECH 11.1 recovery mid-level: main save broken, backup holds the attempt → same log, life still reserved, streak kept; save_corrupt goes out before level_resume', () => {
    // TECH 11.1: "başarısızsa yedekten dene"; K-43/3: "Açılış: inLevel varsa ... o bölüme döner ... Ayrılan can ayrılmış
    // kalır"; ANALYTICS §3: save_corrupt is sent after the recovery write.
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.winStreak = 3));
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.recordAction(drag(2, 7, 0), { movesMade: 2 });
    const log = stored(r.store).inLevel?.actions;
    r.store.set(SAVE_KEY, (r.store.get(SAVE_KEY) ?? '').slice(0, 40)); // torn write
    const again = r.open();
    expect(again.loadReport).toMatchObject({ source: 'backup', failedStage: 'parse' });
    const decision = again.resumeOnLaunch(() => IDENT);
    expect(decision.kind).toBe('resume');
    if (decision.kind !== 'resume') return;
    expect(decision.inLevel.actions).toEqual(log);
    expect(again.data.lives).toMatchObject({ stored: 5, reserved: 1 });
    expect(again.data.winStreak).toBe(3);
    expect(r.events).toEqual([
      { name: 'save_corrupt', stage: 'parse', recovered: 'backup' },
      { name: 'level_resume', level: 3, movesMade: 2 },
    ]);
    expect(stored(r.store)).toEqual(stored(r.store, BACKUP_KEY));
  });

  it('TECH 11.1 the in-level writes never store what the load rejects: malformed actions / counters throw, nothing is written, the next launch loads "main" with no save_corrupt', () => {
    // TECH 11.1 load = "JSON parse → migration → zod/mini şeması ile doğrulama → başarısızsa yedekten dene"; K-43/3 writes
    // after every action. A bad entry written here would turn the running attempt into a save_corrupt at the next launch.
    const r = rig();
    const s = r.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    const before = r.store.get(SAVE_KEY);
    const bad: [SessionAction, { readonly movesMade: number; readonly offerCoins?: number }][] = [
      [{ kind: 'drag', pieceId: 2, to: { ix: 6.5, iy: 0, mode: 0 } }, { movesMade: 2 }],
      [drag(2, 6, 1), { movesMade: -1 }],
      [offer('offerCoins'), { movesMade: 11, offerCoins: -900 }],
      [{ kind: 'paint', pieceId: 2, color: 'X' as ColorCode }, { movesMade: 1 }],
    ];
    for (const [action, info] of bad) expect(() => s.recordAction(action, info)).toThrow();
    expect(r.store.get(SAVE_KEY)).toBe(before);
    const again = r.open();
    expect(again.loadReport).toEqual({ source: 'main', failedStage: null, migratedFrom: null });
    const decision = again.resumeOnLaunch(() => IDENT);
    expect(decision.kind === 'resume' ? decision.inLevel.actions.length : -1).toBe(2);
    expect(r.events.map((e) => e.name)).toEqual(['level_resume']);
  });

  it('TECH 11.1 log size: one drag adds ≈ 50–150 bytes; a 100-action attempt (via + steer on every drag) stays ≤ 15 KB', () => {
    // TECH 11.1: "her eylemden sonra ... actions'a eklenip hemen kaydedilir (≈ 50–150 bayt/hamle; bölüm başına ≤ 15 KB)".
    const r = rig();
    const s = r.open();
    s.beginAttempt(
      start({ levelId: 50, preBoosters: ['thermos', 'trowelStart', 'openShutter'], streakTier: 3 }),
    );
    const enc = new TextEncoder();
    const bytes = (): number => enc.encode(r.store.get(SAVE_KEY) ?? '').length;
    const rich = (i: number): SessionAction => ({
      kind: 'drag',
      pieceId: 10 + (i % 40),
      to: { ix: 6 + (i % 2), iy: i % 8, mode: 2 },
      via: 3,
      steer: { dir: -1, atRow: 7 },
    });
    let prev = bytes();
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    const plainBytes = bytes() - prev;
    prev = bytes();
    s.recordAction(rich(0), { movesMade: 2 });
    const richBytes = bytes() - prev;
    expect(plainBytes).toBeGreaterThanOrEqual(50);
    expect(richBytes).toBeLessThanOrEqual(150);
    for (let i = 1; i < 99; i++) s.recordAction(rich(i), { movesMade: 2 + i });
    const il = stored(r.store).inLevel;
    expect(il?.actions).toHaveLength(101); // 'start' + 100
    expect(enc.encode(JSON.stringify(il)).length).toBeLessThanOrEqual(15 * 1024);
  });
});

describe('round 2: every save-emitted event matches ANALYTICS §2 (TECH 11.4)', () => {
  it('ANALYTICS §2 save_corrupt (validate/defaults, migrate/backup, parse/backup), level_resume, level_resume_invalid (level_hash, rules_version) and coin_source{refund} all pass the table check', () => {
    const clock = new FakeClock(1_790_000_000_000);
    const store = new MemoryStore();
    const invalid: string[] = [];
    const analytics = new Analytics({
      clock,
      common: () => {
        const r = decodeSave(store.get(SAVE_KEY) ?? '');
        return r.ok
          ? commonOf(r.data)
          : {
              sessionId: 's-1',
              appVersion: 'dev',
              platform: 'web',
              lang: 'tr',
              coins: 0,
              lives: 0,
              highestLevel: 0,
              payer: false,
            };
      },
      onInvalid: (issues) => invalid.push(...issues),
    });
    let id = 0;
    const open = (): SaveService =>
      SaveService.open({
        store,
        clock,
        scheduler: clock,
        startingWallet: economy.startingWallet,
        newId: () => `e-${++id}`,
        track: analytics.track,
      });
    store.set(SAVE_KEY, JSON.stringify({ v: 1, data: {} })); // no backup yet → defaults
    open();
    store.set(SAVE_KEY, JSON.stringify({ v: 99, data: {} })); // newer than the build → migrate, backup exists
    open();
    store.set(SAVE_KEY, '{"v":1,"data":'); // torn → parse
    const s = open();
    s.commit((d) => void (d.coins = 2000));
    s.beginAttempt(start());
    s.setOutcomeWindow('outOfMoves');
    s.update((d) => void (d.coins -= offerCost(1)));
    s.recordAction(offer('offerCoins'), { movesMade: 10, offerCoins: offerCost(1) });
    open().resumeOnLaunch(() => IDENT);
    const v = open();
    v.resumeOnLaunch(() => UPDATED);
    v.dismissVoidNotice();
    v.beginAttempt(start({ levelHash: UPDATED.levelHash }));
    open().resumeOnLaunch(() => ({ levelHash: UPDATED.levelHash, rulesVersion: RULES_VERSION + 1 }));

    expect(invalid).toEqual([]);
    const events = analytics.recent().map((x) => x.event);
    for (const e of events) expect(validateEvent(e), e.name).toEqual([]);
    expect(events).toEqual([
      { name: 'save_corrupt', stage: 'validate', recovered: 'defaults' },
      { name: 'save_corrupt', stage: 'migrate', recovered: 'backup' },
      { name: 'save_corrupt', stage: 'parse', recovered: 'backup' },
      { name: 'level_resume', level: 3, movesMade: 10 },
      { name: 'level_resume_invalid', level: 3, movesMade: 10, cause: 'level_hash' },
      { name: 'coin_source', amount: 900, reason: 'refund', balanceAfter: 2000 },
      { name: 'level_resume_invalid', level: 3, movesMade: 0, cause: 'rules_version' },
    ]);
  });
});

// =====================================================================================================================
// Round 2 — 2. i18n text rules (ART §8, STORY §0, D-012, R-08)
// =====================================================================================================================

/** Every text of a dictionary as [key, text]; a plural node gives one entry per form. */
function allTexts(locale: 'tr' | 'en'): [string, string][] {
  const out: [string, string][] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') out.push([path, node]);
    else if (typeof node === 'object' && node !== null) {
      for (const [k, v] of Object.entries(node)) walk(v, path === '' ? k : `${path}.${k}`);
    }
  };
  walk(DICTIONARIES[locale], '');
  expect(out.length).toBeGreaterThan(50);
  return out;
}

const placeholdersOf = (text: string): string[] =>
  [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] ?? '');

describe('round 2: i18n text rules (ART 8, STORY 0, D-012)', () => {
  it('ART 8 i18n glyphs within the Baloo 2 subset (ranges parsed from ART 8 "Teslim"); ● ✓ ★ ♥ ∞ ↔ ↕ never in a text', () => {
    // ART §8: "i18n metinlerinde (tr.json, en.json) yalnız yukarıdaki aralıklardaki karakterler bulunur"; test note:
    // "i18n glyphs within Baloo 2 subset".
    const teslim = /\*\*Teslim:\*\*([^\n]+(?:\n {2}[^\n]+)*)/.exec(ART_MD)?.[1] ?? '';
    const ranges = [...teslim.matchAll(/U\+([0-9A-F]{4})(?:–([0-9A-F]{4}))?/g)].map((m) => {
      const lo = parseInt(m[1] ?? '', 16);
      return [lo, m[2] === undefined ? lo : parseInt(m[2], 16)] as const;
    });
    expect(ranges).toContainEqual([0x20, 0x7e]);
    expect(ranges).toContainEqual([0xa0, 0x17f]);
    expect(ranges).toContainEqual([0x2248, 0x2248]);
    const inSubset = (cp: number): boolean => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
    const outside: string[] = [];
    for (const locale of ['tr', 'en'] as const) {
      for (const [key, text] of allTexts(locale)) {
        for (const ch of text) {
          const cp = ch.codePointAt(0) ?? 0;
          if (!inSubset(cp)) outside.push(`${locale} ${key}: "${ch}" U+${cp.toString(16).toUpperCase()}`);
        }
      }
    }
    expect(outside).toEqual([]);
    for (const banned of ['●', '✓', '★', '♥', '∞', '↔', '↕']) {
      expect(inSubset(banned.codePointAt(0) ?? 0), banned).toBe(false);
    }
  });

  it('STORY 0-9 / 0-10 TR: no suffix glued to a placeholder ({n}\'ü, {n}\'te, {town}\'da); the ordinal "{n}." and "{coin}{n}" stay allowed', () => {
    // STORY §0-9: "TR'de sayı yer tutucusuna ... ek bağlanmaz"; §0-10: "yer tutucunun kendisine ek gelmez".
    const glued = allTexts('tr').filter(([, text]) => /\}['’]?\p{L}/u.test(text));
    expect(glued).toEqual([]);
    expect(textOf('tr', 'common.unlockAt')).toBe('{n}. bölümde açılır');
  });

  it('D-012 / R-08 / STORY 0-9: no colour name in any player text (TR + EN), and the player term is "blok" / "block", never "parça" / "piece"', () => {
    // D-012: "Renk adları yalnız belgelerde, oyuncuya görünen metinde yok"; ART §2.1: "oyuncuya görünen hiçbir metinde
    // (öğretici, ipucu, renk körü modu dahil) renk adı yoktur"; STORY §0-9: "terim 'blok' / 'block' ('parça/piece' yok)".
    const trHue =
      /(?<!\p{L})(sarı|yeşil|kırmızı|turuncu|mavi|mor|gri|kahverengi|pembe|lacivert)(ları|leri|lar|ler|sı|si|su|sü|ya|ye|yı|yi|ı|i|u|ü|a|e|da|de|dan|den)?(?!\p{L})/u;
    const enHue = /(?<![a-z])(yellow|green|red|orange|gr[ae]y|blue|purple|brown|pink|violet|navy)(?![a-z])/;
    const hits: string[] = [];
    for (const [key, text] of allTexts('tr')) {
      const low = text.toLocaleLowerCase('tr-TR');
      if (trHue.test(low)) hits.push(`tr ${key}: ${text}`);
      if (/(?<!\p{L})parça/u.test(low)) hits.push(`tr ${key} (parça): ${text}`);
    }
    for (const [key, text] of allTexts('en')) {
      const low = text.toLowerCase();
      if (enHue.test(low)) hits.push(`en ${key}: ${text}`);
      if (/(?<![a-z])piece/.test(low)) hits.push(`en ${key} (piece): ${text}`);
    }
    expect(hits).toEqual([]);
    // the term itself is in use where a tip names the object
    expect(allTexts('tr').some(([k, t]) => k.startsWith('tut.') && /(?<!\p{L})blo[kğ]/u.test(t))).toBe(true);
    expect(allTexts('en').some(([k, t]) => k.startsWith('tut.') && /\bblocks?\b/.test(t))).toBe(true);
  });

  it('STORY 0-4 / 0-5 / 0-6 tone limits: Dede tips (tut.*) TR ≤ 8 words, speech balloons (story.*) TR ≤ 12 words; EN has no he/she/his/her, no "Little Builder", "Scoop", "Kepçe" or "Minik Usta"', () => {
    const words = (text: string): number => text.split(/\s+/).filter((w) => /\p{L}|\{/u.test(w)).length;
    const long: string[] = [];
    for (const [key, text] of allTexts('tr')) {
      if (key.startsWith('tut.') && words(text) > 8) long.push(`${key} (${words(text)}): ${text}`);
      if (key.startsWith('story.') && words(text) > 12) long.push(`${key} (${words(text)}): ${text}`);
    }
    expect(long).toEqual([]);
    const en = allTexts('en');
    expect(en.filter(([, t]) => /\b(he|she|his|her|hers|him|himself|herself)\b/i.test(t))).toEqual([]);
    expect(en.filter(([, t]) => /little builder|scoop|kepçe|minik usta/i.test(t))).toEqual([]);
  });

  it('STORY 0-10 town and company only via placeholders: "Renkli Tepe" / "Hue Hill" live only in town.name, EN never spells the company; every text renders with no open placeholder except {coin} / {ok}', () => {
    // STORY §0-10: "Kasaba adı oyuncuya görünen her metinde (TR ve EN) {town} yer tutucusudur; değeri tek kaynaktan,
    // town.name anahtarından gelir"; §0-6: "Firma adı EN'de {company} yer tutucusudur".
    for (const locale of ['tr', 'en'] as const) {
      const town = textOf(locale, 'town.name') ?? '';
      expect(town.length).toBeGreaterThan(0);
      const spelled = allTexts(locale).filter(([k, t]) => k !== 'town.name' && t.includes(town));
      expect(spelled, locale).toEqual([]);
      const tr = createTranslator(locale);
      const open: string[] = [];
      for (const [key, text] of allTexts(locale)) {
        const params = Object.fromEntries(
          placeholdersOf(text)
            .filter((n) => !['town', 'company', 'coin', 'ok'].includes(n))
            .map((n) => [n, 7]),
        );
        const leaf = key.replace(/\.(one|other)$/, '');
        const out = tr.tDynamic(leaf, params);
        if (/\{(?!coin\}|ok\})[A-Za-z_]\w*\}/.test(out)) open.push(`${locale} ${key}: ${out}`);
      }
      expect(open).toEqual([]);
    }
    expect(allTexts('en').filter(([, t]) => t.includes('Tuna & Co.'))).toEqual([]);
    expect(createTranslator('en').t('story.prologue.p3.tuna')).toBe('Tuna & Co. is open again!');
  });

  // UX §5.1 (status strip) shows the K-26 truck queue chip "Kamyonda: 3"; JUICE #20 / #88 animate it. STORY §7.6
  // `truck.queue` "Kamyonda: {n}" / "On the truck: {n}", `{n}` = queued BLOCKS (GDD K-26, product-lead PL-F2-5).
  it('K-26 UX 5.1 the "Kamyonda: N" queue chip has an i18n text in TR and EN', () => {
    const tr = createTranslator('tr');
    const hits = [...TR_KEYS].filter((k) => /^Kamyonda: 3$/.test(tr.tDynamic(k, { n: 3 })));
    expect(hits).toHaveLength(1);
    expect(EN_KEYS.has(hits[0] ?? '')).toBe(true);
    expect(createTranslator('en').tDynamic(hits[0] ?? '', { n: 3 })).toBe('On the truck: 3');
  });
});

// =====================================================================================================================
// Round 2 — 3. Layout on the phone profiles (UX §0.1, §5.1; TECH §2.2, §10.1; K-01, K-04)
// =====================================================================================================================

describe('round 2: layout on 390×844 and 360×800 (UX 0.1, 5.1; TECH 2.2)', () => {
  it("K-01 cellAt partitions the 8 × 10 grid on both phones in EXPAND (shift 208.5 / 240 px): the first pixel right of / below a cell is the neighbour's, or nobody's at the wall strip, the site edge and the board bottom", () => {
    for (const p of PHONES) {
      const H = designHeight('expand', p.viewport, TOKENS);
      const g = createLayout(TOKENS, H).grid;
      expect(g.boardBottomY - FIT.grid.boardBottomY, p.label).toBe((H - 1920) * 0.5);
      const wrong: string[] = [];
      const check = (px: number, py: number, want: { x: number; y: number } | null): void => {
        const got = g.cellAt(px, py);
        const same = want === null ? got === null : got?.x === want.x && got.y === want.y;
        if (!same) wrong.push(`${p.label} (${px},${py}) → ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
      };
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 10; y++) {
          const r = g.cellRect(x, y);
          check(r.x + r.w - 1e-6, r.y + r.h - 1e-6, { x, y });
          check(r.x + r.w, r.y, x === 5 || x === 7 ? null : { x: x + 1, y });
          check(r.x, r.y + r.h, y === 0 ? null : { x, y: y - 1 });
          if (y === 9) check(r.x, r.y - 1e-6, null);
        }
      }
      expect(wrong.slice(0, 5), `${wrong.length} wrong`).toEqual([]);
    }
  });

  it('K-04 / TECH 2.2 wall strip and gap opening cut whole rows in FIT and on both phones: level 3 wall (height 6, gap y 2 size 2)', () => {
    for (const H of [1920, ...PHONES.map((p) => designHeight('expand', p.viewport, TOKENS))]) {
      const g = createLayout(TOKENS, H).grid;
      expect(g.wallRect(6)).toEqual({ x: 750, y: g.rowTop(5), w: 60, h: 6 * 120 });
      expect(g.wallRect(6).y + g.wallRect(6).h).toBe(g.boardBottomY);
      const gap = g.gapRect(2, 2);
      expect(gap.y, `H ${H}`).toBe(g.cellRect(5, 3).y); // top of row 3
      expect(gap.y + gap.h).toBe(g.cellRect(6, 2).y + 120); // bottom of row 2
      expect([gap.x, gap.w]).toEqual([g.colLeft(5) + 120, g.colLeft(6) - g.colLeft(5) - 120]);
    }
  });

  it('UX 5.1 wireframe (FIT): pause 128 at (24,40), panorama 592×110 (168,40), moves 280×224 (776,40), goals 592×104 (168,160), crane rows 288 / 408 / 528, row 0 ends 1488, status 1504 h 96, Tuna 280×296 (16,1600), boosters 172 x 314–1056 y 1660–1832, board 1020 px = 94 %', () => {
    const l = FIT;
    expect(l.top.pause).toEqual({ x: 24, y: 40, w: 128, h: 128 });
    expect(l.top.panorama).toEqual({ x: 168, y: 40, w: 592, h: 110 });
    expect(l.top.moves).toEqual({ x: 776, y: 40, w: 280, h: 224 });
    expect(l.top.goals).toEqual({ x: 168, y: 160, w: 592, h: 104 });
    expect([l.grid.rowTop(9), l.grid.rowTop(8), l.grid.boardTopY, l.grid.boardBottomY]).toEqual([
      288, 408, 528, 1488,
    ]);
    // "saha x 30–750 (6×120)", "duvar x 750–810 (60)", "şantiye x 810–1050 (2×120)"
    expect([l.board.yard.x, l.board.yard.x + l.board.yard.w]).toEqual([30, 750]);
    expect([l.grid.wallX, l.grid.wallX + l.grid.wallW]).toEqual([750, 810]);
    expect([l.board.site.x, l.board.site.x + l.board.site.w]).toEqual([810, 1050]);
    expect([l.board.status.y, l.board.status.h]).toEqual([1504, 96]);
    expect(l.bottom.character).toEqual({ x: 16, y: 1600, w: 280, h: 296 });
    const slots = l.bottom.boosters;
    expect(slots).toHaveLength(4);
    expect(slots.every((b) => b.w === 172 && b.h === 172 && b.y === 1660)).toBe(true);
    expect([slots[0]?.x, (slots[3]?.x ?? 0) + 172, 1660 + 172]).toEqual([314, 1056, 1832]);
    expect(l.board.board.w).toBe(1020);
    expect(Math.round((100 * l.board.board.w) / 1080)).toBe(94);
  });

  it('UX 0.1 pt mapping: 120 px cell = 41,7 pt (375) / 43,3 pt (390); 172 px booster slot = 60 / 62 pt — FIT and EXPAND', () => {
    const cases = [
      { viewport: { width: 375, height: 812 }, cell: 41.7, slot: 60 },
      { viewport: { width: 390, height: 844 }, cell: 43.3, slot: 62 },
    ];
    for (const c of cases) {
      for (const mode of ['fit', 'expand'] as const) {
        const { scale } = fitViewport(mode, c.viewport, TOKENS);
        expect(Math.round(120 * scale * 10) / 10, `${mode} ${c.viewport.width}`).toBe(c.cell);
        expect(Math.round(172 * scale)).toBe(c.slot);
      }
    }
  });

  // UX §0.1 decision (b) (design-lead, 2026-10-06; tokens `touch._doc`): "en küçük dokunma hedefi her ekran genişliğinde
  // 128 px … token touch.minTargetPx = 128, genişliğe göre değişmez. Karşılığı 375 pt'de 44,4 pt, 390 pt'de 46,2 pt,
  // 360 dp'de 42,7 dp … bilerek kabul edilir" and "sık dokunulan hedefler 144 px tabanındadır (360 dp'de ≥ 48 dp …).
  // Kapalı liste: … pencere seçenekleri (920×152), güçlendirici yuvaları (172), blok hücresi + pay (180), Bölüm düğmesi
  // (176), alt navigasyon sekmeleri (176) …". TECH §10.1: `layout.touch` reads the tokens and does not depend on H.
  it('UX 0.1 44 pt rule decision (b): touch.minTargetPx stays 128 px on 390×844 and 360×800 in FIT and EXPAND (≥ 44 pt on the iOS widths, 42.7 dp accepted at 360) and the closed-list frequent targets are ≥ 144 px', () => {
    const frequentPx = (1080 / 360) * 48; // 48 dp at 360 dp
    expect(frequentPx).toBe(144);
    const seen: string[] = [];
    const short: string[] = [];
    for (const p of PHONES) {
      for (const mode of ['fit', 'expand'] as const) {
        const l = createLayout(TOKENS, designHeight(mode, p.viewport, TOKENS));
        const units = Math.round(l.touch.minTargetPx * fitViewport(mode, p.viewport, TOKENS).scale * 10) / 10;
        seen.push(`${p.label} ${mode}: ${l.touch.minTargetPx} px = ${units}`);
        const frequent: [string, { w: number; h: number }][] = [
          ['booster slot', l.bottom.boosters[0] ?? { w: 0, h: 0 }],
          ['Bölüm button', l.bottom.playButton],
          ['nav tab', l.bottom.navTabs[0] ?? { w: 0, h: 0 }],
          ['popup option', l.popup.options(1)[0] ?? { w: 0, h: 0 }],
          ['block cell + pad', l.touch.blockHit(l.grid.cellRect(0, 0))],
        ];
        for (const [name, r] of frequent) {
          if (Math.min(r.w, r.h) < frequentPx)
            short.push(`${p.label} ${mode} ${name}: ${Math.min(r.w, r.h)} px`);
        }
      }
    }
    expect(seen).toEqual([
      '390×844 fit: 128 px = 46.2',
      '390×844 expand: 128 px = 46.2',
      '360×800 fit: 128 px = 42.7',
      '360×800 expand: 128 px = 42.7',
    ]);
    expect(short).toEqual([]);
    expect(TOKENS.touch.minTargetPx).toBe(128);
    expect(TOKENS.layout.grid.cellPx + 2 * TOKENS.touch.hitSlopPx).toBe(180);
  });
});

// =====================================================================================================================
// Round 2 — 4. Draw recipes (ART §2.4, §4, §5, §8; K-34 build front)
// =====================================================================================================================

const artSection = (from: string, to: string): string => ART_MD.split(from)[1]?.split(to)[0] ?? '';

describe('round 2: draw recipes vs ART (2.4, 4, 5, 8)', () => {
  it('ART 2.4 board colour table = tokens (every colour and every "%" alpha of the table)', () => {
    const rows = artSection('### 2.4 Tahta renkleri', '## 3.')
      .split('\n')
      .filter((l) => l.startsWith('| `board.'));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const colors = TOKENS.color.board as unknown as Record<string, string>;
    const alphas = TOKENS.alpha as unknown as Record<string, number>;
    const wrong: string[] = [];
    for (const row of rows) {
      const [, names = '', values = ''] = row.split('|').map((s) => s.trim());
      const [colorPart = '', alphaPart] = names.split(' + ');
      const tokens = colorPart.split(' / ').map((n) => n.replace(/`/g, '').replace(/^board\./, ''));
      const vals = values.split(' / ').map((v) => v.trim());
      tokens.forEach((name, i) => {
        const m = /^(#[0-9A-F]{6})(?: %(\d+))?$/.exec(vals[i] ?? '');
        if (!m) return void wrong.push(`unparsed ${row}`);
        if (colors[name]?.toUpperCase() !== m[1]) wrong.push(`board.${name} ${colors[name]} ≠ ${m[1]}`);
        if (m[2] !== undefined) {
          const alphaName = alphaPart?.replace(/`/g, '').replace(/^alpha\./, '') ?? name;
          if (alphas[alphaName] !== Number(m[2]) / 100) {
            wrong.push(`alpha.${alphaName} ${alphas[alphaName]} ≠ ${Number(m[2]) / 100}`);
          }
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it('ART 5 wall body: #A9AFB8 concrete, 2 px vertical formwork lines every 20 px in #7D848E 40 %, 6 px #C9CED5 left / #7D848E right edges, 6 px #3B2A1A 80 % outline; 20 px yellow-black cap with the same outline', () => {
    const p = paints(recordOps((ctx) => drawWall(ctx, { height: 3, gaps: [] }, TOKENS)));
    const rectsOf = (hex: string): number[][] =>
      p.filter((x) => x.op === 'fillRect' && x.style.toUpperCase() === hex).map((x) => x.args.map(Number));
    // frame: 72 px wide (6 px cap overhang), body x 6–66 under the 20 px cap, rows 0–2 = 360 px
    expect(rectsOf('#A9AFB8')).toEqual([[6, 20, 60, 360]]);
    expect(rectsOf('#C9CED5')).toEqual([[6, 20, 6, 360]]);
    expect(rectsOf('#7D848E')).toEqual([[60, 20, 6, 360]]);
    const formwork = p.find((x) => x.op === 'stroke' && x.lineWidth === 2);
    if (formwork === undefined) throw new Error('no formwork lines');
    expect(parseColor(formwork.style)).toEqual({ rgb: hexRgb('#7D848E'), a: 0.4 });
    const xs = formwork.path.filter((o) => o[0] === 'moveTo').map((o) => Number(o[1]) - 6);
    const ends = formwork.path.filter((o) => o[0] === 'lineTo').map((o) => Number(o[1]) - 6);
    expect(xs).toEqual(ends); // vertical
    expect(xs.length).toBeGreaterThan(0);
    xs.forEach((x, i) => expect(x - (i === 0 ? 0 : (xs[i - 1] ?? 0))).toBe(20));
    const outlines = p.filter((x) => x.op === 'stroke' && x.lineWidth === 6);
    expect(outlines).toHaveLength(2); // body + cap
    for (const o of outlines) expect(parseColor(o.style)).toEqual({ rgb: hexRgb('#3B2A1A'), a: 0.8 });
    const yellow = hexRgb(TOKENS.color.ui.hazardYellow);
    expect(
      p.some(
        (x) =>
          x.op === 'fillRect' && near(parseColor(x.style).rgb, yellow, 0) && x.args.join() === '0,0,72,20',
      ),
    ).toBe(true);
    expect(
      p.some((x) => x.op === 'fill' && near(parseColor(x.style).rgb, hexRgb(TOKENS.color.ui.hazardBlack), 0)),
    ).toBe(true);
  });

  it('ART 5 crane-area bottom line: 4 px, dashed 16 / 12, #FFFFFF 45 % (ART 2.4 board.craneLine), baked as wide as the board (1020 px)', () => {
    const p = paints(recordOps((ctx) => drawCraneLine(ctx, { length: 1020 }, TOKENS)));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ op: 'stroke', lineWidth: 4, dash: [16, 12] });
    expect(parseColor(p[0]?.style ?? '')).toEqual({ rgb: WHITE, a: 0.45 });
    const frame = bootAtlasFrames(TOKENS).find((f) => f.name === FRAME.craneLine);
    expect(frame?.w).toBe(FIT.board.board.w);
  });

  it('ART 4 blueprint paper: #1F4F8F floor with 2 px white 4 % specks repeated across tile edges (seamless); "pafta" corner 0,6c = 72 px, white 30 % L along the left and bottom edges', () => {
    const tile = bootAtlasFrames(TOKENS).find((f) => f.name === FRAME.blueprintFloor);
    if (tile === undefined) throw new Error('no blueprint floor frame');
    const p = paints(recordOps((ctx) => tile.draw(ctx)));
    expect(p[0]).toMatchObject({ op: 'fillRect', args: [0, 0, tile.w, tile.h] });
    expect(p[0]?.style.toUpperCase()).toBe('#1F4F8F');
    const specks = p.slice(1);
    expect(specks.length).toBeGreaterThan(10);
    const at = new Set(specks.map((s) => `${String(s.args[0])},${String(s.args[1])}`));
    for (const s of specks) {
      expect(s.op).toBe('fillRect');
      expect(parseColor(s.style)).toEqual({ rgb: WHITE, a: 0.04 });
      const [x = 0, y = 0, w = 0, h = 0] = s.args.map(Number);
      expect([w, h]).toEqual([2, 2]);
      if (x + 2 > tile.w && x >= 0) expect(at.has(`${x - tile.w},${y}`), `twin of ${x},${y}`).toBe(true);
      if (y + 2 > tile.h && y >= 0) expect(at.has(`${x},${y - tile.h}`), `twin of ${x},${y}`).toBe(true);
    }
    const size = blueprintCornerSize(TOKENS);
    expect(size).toEqual({ w: 72, h: 72 });
    const corner = paints(recordOps((ctx) => drawBlueprintCorner(ctx, TOKENS)));
    expect(corner).toHaveLength(1);
    expect(parseColor(corner[0]?.style ?? '')).toEqual({ rgb: WHITE, a: 0.3 });
    const pts = (corner[0]?.path ?? [])
      .filter((o) => o[0] === 'moveTo' || o[0] === 'lineTo')
      .map((o) => [Number(o[1]), Number(o[2])] as const);
    const lw = corner[0]?.lineWidth ?? 0;
    // one vertical leg on the left edge over the full height, one horizontal leg on the bottom edge over the full width
    const legs = pts.slice(1).map((b, i) => [pts[i] ?? b, b] as const);
    expect(legs.some(([a, b]) => a[0] === b[0] && a[0] <= lw && Math.abs(a[1] - b[1]) >= 72 - lw)).toBe(true);
    expect(legs.some(([a, b]) => a[1] === b[1] && a[1] >= 72 - lw && Math.abs(a[0] - b[0]) >= 72 - lw)).toBe(
      true,
    );
  });

  it('ART 2.4 / ART 4 yard floor and scaffold: checker #E9C891 / #E2BD80 (50 % cells), 3 px #D4AE6E grid; pole 16 px #8A96A3 with a 4 px light, ledger 10 px at 70 %, clamp 20 × 20 #FF9A1F, ceiling beam 12 px #8A96A3', () => {
    const yard = paints(recordOps((ctx) => drawYardFloor(ctx, TOKENS)));
    const cells = yard.filter((x) => x.op === 'fillRect');
    expect(cells).toHaveLength(4);
    expect(cells.filter((x) => x.style.toUpperCase() === '#E9C891')).toHaveLength(2);
    expect(cells.filter((x) => x.style.toUpperCase() === '#E2BD80')).toHaveLength(2);
    // checker: equal colours only on the diagonal
    const tone = (cx: number, cy: number): string =>
      cells.find((x) => Number(x.args[0]) === cx * 120 && Number(x.args[1]) === cy * 120)?.style ?? '';
    expect(tone(0, 0)).toBe(tone(1, 1));
    expect(tone(1, 0)).toBe(tone(0, 1));
    expect(tone(0, 0)).not.toBe(tone(1, 0));
    expect(yard.filter((x) => x.op === 'stroke').map((x) => [x.style.toUpperCase(), x.lineWidth])).toEqual([
      ['#D4AE6E', 3],
    ]);

    const pole = paints(recordOps((ctx) => drawScaffoldPole(ctx, { length: 100 }, TOKENS)));
    expect(pole[0]).toMatchObject({ op: 'fillRect', args: [0, 0, 16, 100] });
    expect(pole[0]?.style.toUpperCase()).toBe('#8A96A3');
    expect(pole.slice(1).some((x) => Math.min(Number(x.args[2]), Number(x.args[3])) === 4)).toBe(true);
    const ledger = paints(recordOps((ctx) => drawScaffoldLedger(ctx, { length: 100 }, TOKENS)));
    expect(ledger[0]?.args.map(Number)).toEqual([0, 0, 100, 10]);
    expect(parseColor(ledger[0]?.style ?? '')).toEqual({ rgb: hexRgb('#8A96A3'), a: 0.7 });
    const clamp = paints(recordOps((ctx) => drawScaffoldClamp(ctx, TOKENS)));
    expect(clamp.map((x) => [x.style.toUpperCase(), ...x.args.map(Number)])).toEqual([
      ['#FF9A1F', 0, 0, 20, 20],
    ]);
    const beam = paints(recordOps((ctx) => drawCeilingBeam(ctx, { length: 240 }, TOKENS)));
    expect(beam[0]?.args.map(Number)).toEqual([0, 0, 240, 12]);
    expect(beam[0]?.style.toUpperCase()).toBe('#8A96A3');
  });

  it('K-34 ART 4 build front: plan_front strokes the SAME outline as the dashed plan stroke, solid and wider (6 ≥ 4 px), so the front cell shows no dash; plan_<c>_front frames (both modes) = ART composite + 15 % white with the plan ink kept', () => {
    // ART §4: "İnşa cephesi ... düz 6 px kontur ... ve +%15 açıklık ... Diğer boş hücreler kesik konturda kalır".
    const front = paints(recordOps((ctx) => drawBuildFront(ctx, TOKENS))).filter((x) => x.op === 'stroke');
    expect(front).toHaveLength(1);
    const cell = paints(recordOps((ctx) => drawPlanCell(ctx, { color: 'R' }, TOKENS)));
    const dashed = cell.find((x) => x.op === 'stroke');
    expect(dashed?.dash).toEqual([14, 10]);
    expect(front[0]?.dash).toEqual([]);
    expect(front[0]?.path).toEqual(dashed?.path);
    expect(front[0]?.lineWidth).toBe(6);
    expect((front[0]?.lineWidth ?? 0) >= (dashed?.lineWidth ?? Infinity)).toBe(true);
    expect(parseColor(front[0]?.style ?? '')).toEqual({ rgb: WHITE, a: 1 }); // board.buildFront #FFFFFF

    const pal = artPalette();
    const underlay = hexRgb('#BCCADD'); // ART 2.4 board.planUnderlay
    const darkInk = ['Y', 'G', 'O', 'C', 'B'];
    for (const colorBlind of [false, true]) {
      const frames = bootAtlasFrames(TOKENS, { colorBlind });
      for (const c of COLOR_CODES) {
        const f = frames.find((x) => x.name === planFrontFrameName(c));
        if (f === undefined) throw new Error(`no ${planFrontFrameName(c)}`);
        const p = paints(recordOps((ctx) => f.draw(ctx)));
        const fill = parseColor(p.find((x) => x.op === 'fill')?.style ?? '').rgb;
        const composite = over(underlay, { rgb: hexRgb(pal[c]), a: colorBlind ? 0.9 : 0.8 });
        const want = over(composite, { rgb: WHITE, a: 0.15 });
        expect(
          near(fill, want),
          `${c} cb=${colorBlind} ${fill.join()} vs ${want.map(Math.round).join()}`,
        ).toBe(true);
        const ink = dark(c) ? hexRgb('#14233D') : WHITE;
        expect(
          p.slice(2).some((x) => near(parseColor(x.style).rgb, ink, 0) && parseColor(x.style).a === 1),
          `${c} ink`,
        ).toBe(true);
      }
    }
    function dark(c: ColorCode): boolean {
      return darkInk.includes(c);
    }
  });

  it('K-34 / ART 10 / TECH 10.2 (a) the boot atlas with the 8 extra plan_<c>_front frames still fits ONE 2048 × 2048 page in both modes; colour-blind re-bake keeps every name and changes every plan and front plan frame', () => {
    // TECH 10.2 (a): "açılış atlası (≤ 2048 × 2048, açılışta bir kez)"; ART 10: "Blok ve plan dokuları modla birlikte
    // yeniden pişirilir" (plan fill 80 % → 90 %, symbols ×1,2).
    const def = bootAtlasFrames(TOKENS);
    const cb = bootAtlasFrames(TOKENS, { colorBlind: true });
    for (const frames of [def, cb]) {
      const pages = packFrames(frames, BOOT_PAGE);
      expect(pages).toHaveLength(1);
      expect(Math.max(pages[0]?.width ?? 0, pages[0]?.height ?? 0)).toBeLessThanOrEqual(2048);
    }
    expect(cb.map((f) => f.name)).toEqual(def.map((f) => f.name));
    const ops = (frames: typeof def, name: string): Op[] =>
      recordOps((ctx) => frames.find((f) => f.name === name)?.draw(ctx));
    for (const c of COLOR_CODES) {
      for (const name of [planFrameName(c), planFrontFrameName(c)]) {
        expect(ops(cb, name), name).not.toEqual(ops(def, name));
        expect(ops(def, name).length, name).toBeGreaterThan(0);
      }
    }
    expect(ops(cb, FRAME.front)).toEqual(ops(def, FRAME.front)); // the contour frame does not depend on the mode
  });

  it('ART 8 typography tokens = ART 8 table (size, weight, line height, ≈ pt @390); caption 34 px is the smallest; family "Baloo 2" with fallback Nunito, system-ui, sans-serif', () => {
    const rows = [
      ...artSection('## 8. Tipografi', '## 9.').matchAll(
        /^\| `font\.size\.(\w+)` \| (\d+) \| (\d+) \| (\d+) \| ([\d,]+) \|/gm,
      ),
    ];
    expect(rows.map((m) => m[1])).toEqual(['display', 'h1', 'h2', 'button', 'body', 'small', 'caption']);
    const font = TOKENS.font as unknown as {
      family: string;
      fallback: string[];
      size: Record<string, number>;
      weight: Record<string, number>;
      lineHeight: Record<string, number>;
    };
    const scale390 = fitViewport('fit', PHONES[0].viewport, TOKENS).scale;
    for (const m of rows) {
      const k = m[1] ?? '';
      expect(font.size[k], `size ${k}`).toBe(Number(m[2]));
      expect(Math.round((font.size[k] ?? 0) * scale390), `pt ${k}`).toBe(Number(m[3]));
      expect(font.weight[k], `weight ${k}`).toBe(Number(m[4]));
      expect(font.lineHeight[k], `line height ${k}`).toBeCloseTo(Number((m[5] ?? '').replace(',', '.')), 6);
    }
    expect(Math.min(...Object.values(font.size))).toBe(font.size['caption']);
    expect([font.family, ...font.fallback]).toEqual(['Baloo 2', 'Nunito', 'system-ui', 'sans-serif']);
  });
});

// =====================================================================================================================
// Round 3 — 1. Save / K-43: one write per state change, pending home windows across kills, diagnostics, app hidden
// =====================================================================================================================

interface Journal {
  readonly store: MemoryStore;
  readonly clock: FakeClock;
  /** `set <key>` per store write and `event <name>` per tracked event, in call order. */
  readonly log: string[];
  open(): SaveService;
}

function journal(): Journal {
  const store = new MemoryStore();
  const clock = new FakeClock(1_790_000_000_000);
  const log: string[] = [];
  const spy: KeyValueStore = {
    get: (k) => store.get(k),
    set: (k, v) => {
      log.push(`set ${k}`);
      store.set(k, v);
    },
    remove: (k) => store.remove(k),
  };
  let n = 0;
  return {
    store,
    clock,
    log,
    open: () =>
      SaveService.open({
        store: spy,
        clock,
        scheduler: clock,
        startingWallet: economy.startingWallet,
        newId: () => `j-${++n}`,
        track: (e) => log.push(`event ${e.name}`),
      }),
  };
}

/** One save write = the main document and then its backup copy (TECH 11.1 "son başarılı yazımın kopyası"). */
const ONE_WRITE = [`set ${SAVE_KEY}`, `set ${BACKUP_KEY}`];
const take = (log: string[]): string[] => log.splice(0, log.length);

describe('round 3: K-43 atomic writes and the pending home windows (GDD K-43, TECH 11.1, UX 1)', () => {
  it('K-43 / TECH 11.1 every state change is ONE save write (main + backup copy): attempt start, each action, the win with its rewards, the void with its refunds and notice, "Tamam"; the void events go out only after that write', () => {
    const j = journal();
    const s = j.open();
    s.commit((d) => {
      d.coins = 2000;
      d.firstOfferGiftUsed = true;
      d.winStreak = 1;
    });
    take(j.log);
    expect(s.beginAttempt(start({ levelId: 3 }))).toBe(1);
    expect(take(j.log)).toEqual(ONE_WRITE);
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    expect(take(j.log)).toEqual(ONE_WRITE); // K-43/3 "her eylemden sonra ... yazılır"
    // TECH 11.1: "ödüller ... kazanma anında, tek atomik kayıt yazımında verilir ve aynı yazımda inLevel silinir";
    // "Bölüm sandığı ... bu kazanmayla dolduysa aynı yazım pendingChest işaretini de yazar".
    s.endAttempt((d) => {
      d.coins += 61;
      d.stars += 1;
      d.winStreak += 1;
      recordWin(d, 3);
      d.pendingChest = 'level';
    });
    expect(take(j.log)).toEqual(ONE_WRITE);
    expect(stored(j.store)).toMatchObject({
      inLevel: null,
      coins: 2061,
      stars: 1,
      winStreak: 2,
      pendingChest: 'level',
      lives: { reserved: 0 },
      progress: { highestLevel: 3, levels: { '3': { won: true, attempts: 1 } } },
    });

    s.commit((d) => void (d.pendingChest = null));
    s.beginAttempt(start({ levelId: 4 }));
    s.setOutcomeWindow('outOfMoves');
    s.update((d) => void (d.coins -= offerCost(1)));
    s.recordAction(offer('offerCoins'), { movesMade: 10, offerCoins: offerCost(1) });
    take(j.log);
    const v = j.open();
    expect(take(j.log)).toEqual([]); // a valid main save is not rewritten at launch
    expect(v.resumeOnLaunch(() => UPDATED).kind).toBe('void');
    // TECH 11.1 / ANALYTICS 3: "atomik yazım bittikten sonra, bu sırayla: önce level_resume_invalid ... sonra coin_source"
    expect(take(j.log)).toEqual([...ONE_WRITE, 'event level_resume_invalid', 'event coin_source']);
    expect(stored(j.store).coins).toBe(2061);
    v.dismissVoidNotice(); // UX 1 (c): "Tamam voidNotice'i tek kayıt yazımında siler"
    expect(take(j.log)).toEqual(ONE_WRITE);
    v.dismissVoidNotice();
    expect(take(j.log)).toEqual([]);
  });

  it('K-43 "kazanma ekranındayken kapanırsa ödüller verilmiş sayılır": later launches go home (no resume, no level_resume, nothing granted or written twice) and the chest window flag waits until the window opens (UX 1 (b))', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => void (d.winStreak = 2));
    s.beginAttempt(start({ levelId: 10 }));
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.endAttempt((d) => {
      d.coins += 61;
      d.stars += 1;
      d.winStreak += 1;
      recordWin(d, 10);
      d.pendingChest = 'level';
    });
    const atWin = r.store.get(SAVE_KEY);
    for (let launch = 0; launch < 2; launch++) {
      // killed on the win screen, then again before the chest window opened
      const next = r.open();
      expect(next.resumeOnLaunch(() => IDENT)).toEqual({ kind: 'none' });
      expect(r.store.get(SAVE_KEY)).toBe(atWin);
      expect(next.data.pendingChest).toBe('level');
    }
    r.open().commit((d) => void (d.pendingChest = null)); // the chest window opened once
    expect(r.open().data.pendingChest).toBeNull();
    expect(stored(r.store)).toMatchObject({
      coins: economy.startingWallet.coins + 61,
      stars: 1,
      winStreak: 3,
      inLevel: null,
    });
    expect(r.events).toEqual([]);
  });

  it('K-43 UX 1 (c) E-45 + crane + Açık Kepenk: a kill before "Tamam" brings the SAME notice back with no second refund (coins 2.000, run spend 900, life, crane and Açık Kepenk once) and no event; "Tamam" clears it for good', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.coins = 2000;
      d.winStreak = 2;
      d.firstOfferGiftUsed = true;
      d.events['bridge-1'] = { joinedAt: 0, runSpend: 900 };
      d.boosters.inventory = { crane: 1, openShutter: 1 };
    });
    s.update((d) => void (d.boosters.inventory.openShutter = 0)); // K-40: spent as the level starts
    s.beginAttempt(start({ levelId: 18, bridgeEventId: 'bridge-1', preBoosters: ['openShutter'] }));
    s.update((d) => void (d.boosters.inventory.crane = 0)); // K-37 crane booster applied
    s.recordAction(
      { kind: 'crane', pieceId: 3, to: { zone: 'site', x: 0, y: 0 }, rotation: 90 },
      { movesMade: 0 },
    );
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.setOutcomeWindow('outOfMoves');
    s.recordAction(offer('offerAd'), { movesMade: 11 });
    s.setOutcomeWindow('outOfMoves');
    s.update((d) => {
      d.coins -= offerCost(2);
      bridgeRun(d, 'bridge-1').runSpend += offerCost(2);
    });
    s.recordAction(offer('offerCoins'), { movesMade: 16, offerCoins: offerCost(2) });

    r.open().resumeOnLaunch(() => UPDATED);
    const afterVoid = stored(r.store);
    expect(afterVoid).toMatchObject({ coins: 2000, winStreak: 2, lives: { stored: 5, reserved: 0 } });
    expect(afterVoid.boosters.inventory).toMatchObject({ crane: 1, openShutter: 1 });
    expect(bridgeRun(afterVoid, 'bridge-1').runSpend).toBe(900);
    expect(afterVoid.voidNotice).toEqual({
      level: 18,
      refunds: { life: 1, boosters: { openShutter: 1, crane: 1 }, coins: 1350 },
      bridge: true,
    });
    const sent = r.events.length;

    for (let launch = 0; launch < 2; launch++) {
      // "Tamam"dan önce kapanırsa sonraki açılışta aynı içerikle yeniden gelir (iade tekrar yapılmaz)
      const again = r.open();
      expect(again.resumeOnLaunch(() => UPDATED)).toEqual({ kind: 'none' });
      expect(again.data.voidNotice).toEqual(afterVoid.voidNotice);
      expect(stored(r.store)).toEqual(afterVoid);
    }
    expect(r.events).toHaveLength(sent);
    r.open().dismissVoidNotice();
    const cleared = stored(r.store);
    expect(cleared.voidNotice).toBeNull();
    expect({ ...cleared, voidNotice: 'x' }).toEqual({ ...afterVoid, voidNotice: 'x' });
    expect(r.open().data.voidNotice).toBeNull();
  });

  it('K-43 4 "yerel tanılama kaydı" + TECH 11.1 corrupt save: the diagnostics ring holds { levelId, cause, movesMade } and the corrupt stage; the corrupt text stays local in minikusta.save.corrupt and never reaches an analytics event', () => {
    const r = rig();
    const s = r.open();
    s.beginAttempt(start({ levelId: 4 }));
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.recordAction(drag(2, 7, 0), { movesMade: 2 });
    const v = r.open();
    v.resumeOnLaunch(() => ({ levelHash: IDENT.levelHash, rulesVersion: RULES_VERSION + 1 }));
    expect(v.diagnostics()).toContainEqual({
      kind: 'attemptVoided',
      levelId: 4,
      cause: 'rules_version',
      movesMade: 2,
    });

    const marker = 'corrupt-marker-7f3a';
    const broken = `{"v":1,"data":{"analyticsId":"${marker}"`;
    r.store.set(SAVE_KEY, broken);
    const c = r.open();
    expect(c.loadReport).toMatchObject({ source: 'backup', failedStage: 'parse' });
    expect(c.diagnostics().map((x) => (x.kind === 'saveCorrupt' ? x.stage : x.kind))).toEqual(['parse']);
    expect(r.store.get(CORRUPT_KEY)).toBe(broken);
    expect(JSON.stringify(r.events)).not.toContain(marker); // ANALYTICS: "Bozuk metin gönderilmez"
    expect(r.events.at(-1)).toEqual({ name: 'save_corrupt', stage: 'parse', recovered: 'backup' });
  });

  it('K-43 3 / TECH 4.7 (5) pagehide with a G-L move still falling: the move is committed first, the save is written at once with the coalesced change (no 500 ms timer left) and a kill right after resumes WITH that move', () => {
    // K-43/3: "Kayıt: ... pagehide/visibilitychange anında"; TECH 11.1: "G-L pending varsa önce flushPending() ile commit
    // edilir"; TECH 4.7: "kayıt hiçbir zaman bırakılmış bir hamleyi kaçırmaz".
    const r = rig();
    const s = r.open();
    s.beginAttempt(start());
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.update((d) => void (d.piggy.coins += 12)); // an ordinary coalesced change
    const released = drag(2, 7, 3);
    s.setPendingFlusher(() => s.recordAction(released, { movesMade: 2 }));
    const hook: { fn: (() => void) | null } = { fn: null };
    const unsubscribe = s.attachLifecycle((h) => {
      hook.fn = h;
      return () => void (hook.fn = null);
    });
    expect(hook.fn).not.toBeNull();
    hook.fn?.(); // visibilitychange: hidden
    const d = stored(r.store);
    expect(d.piggy.coins).toBe(12);
    expect(d.inLevel?.actions.at(-1)).toEqual(released);
    expect(d.inLevel?.movesMade).toBe(2);
    expect(r.clock.pendingTimers).toBe(0);
    expect(r.open().resumeOnLaunch(() => IDENT)).toMatchObject({
      kind: 'resume',
      window: 'pause',
      inLevel: { movesMade: 2 },
    });
    unsubscribe();
    expect(hook.fn).toBeNull();
  });

  it('ANALYTICS v4 level_start / level_end fed by the save: attempt = levels[id].attempts, the same mode after a kill (replay), extensions = offersUsed = 3 after three +5 (thermos and streak moves are not offers, K-29) — all pass the §2 table', () => {
    const r = rig();
    const s = r.open();
    s.commit((d) => {
      d.coins = 9000;
      d.firstOfferGiftUsed = true;
    });
    const attempt = s.beginAttempt(
      start({ levelId: 12, mode: 'replay', preBoosters: ['thermos', 'openShutter'] }),
    );
    expect(
      validateEvent({ name: 'level_start', level: 12, attempt, mode: 'replay', preBoosters: 2 }),
    ).toEqual([]);
    s.recordAction({ kind: 'addMoves', amount: 3, source: 'thermos' }, { movesMade: 0 });
    s.recordAction({ kind: 'addMoves', amount: 2, source: 'streak' }, { movesMade: 0 });
    expect(s.data.inLevel).toMatchObject({ offersUsed: 0, adOfferUsed: false, offerSpendCoins: 0 });
    for (const n of [1, 2, 3] as const) {
      s.setOutcomeWindow('outOfMoves');
      s.update((d) => void (d.coins -= offerCost(n)));
      s.recordAction(offer('offerCoins'), { movesMade: 20 + 5 * n, offerCoins: offerCost(n) });
    }
    const decision = r.open().resumeOnLaunch(() => IDENT);
    if (decision.kind !== 'resume') throw new Error(`expected resume, got ${decision.kind}`);
    expect(decision.inLevel).toMatchObject({
      mode: 'replay',
      offersUsed: 3,
      offerSpendCoins: offerCost(1) + offerCost(2) + offerCost(3),
    });
    const end = {
      name: 'level_end',
      level: 12,
      mode: decision.inLevel.mode,
      result: 'win',
      movesLeft: 2,
      wrongPlacements: 1,
      yao: 67,
      durationMs: 95_000,
      extensions: decision.inLevel.offersUsed,
      exitFree: false,
      truckHelps: 0,
    };
    expect(validateEvent(end)).toEqual([]);
    expect(r.events).toEqual([{ name: 'level_resume', level: 12, movesMade: 35 }]);
  });

  it('GDD 14 / ANALYTICS level_start.attempt: attempts count per level across a loss, a resume and a win, and a replay win of an older level keeps highestLevel ("level iki döngüde de özgün bölüm numarasıdır")', () => {
    const r = rig();
    let s = r.open();
    expect(s.beginAttempt(start({ levelId: 3 }))).toBe(1);
    s.endAttempt((d) => recordWin(d, 3));
    expect(s.beginAttempt(start({ levelId: 4 }))).toBe(1);
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s.endAttempt((d) => {
      d.lives.stored -= 1; // confirmed exit with m = 1 (K-43/2)
      d.winStreak = 0;
    });
    expect(s.beginAttempt(start({ levelId: 4 }))).toBe(2);
    s.recordAction(drag(1, 6, 0), { movesMade: 1 });
    s = r.open();
    expect(s.resumeOnLaunch(() => IDENT).kind).toBe('resume'); // "devam artırmaz"
    s.endAttempt((d) => recordWin(d, 4));
    expect(s.beginAttempt(start({ levelId: 3, mode: 'replay' }))).toBe(2);
    s.endAttempt((d) => recordWin(d, 3));
    expect(stored(r.store).progress).toEqual({
      highestLevel: 4,
      levels: { '3': { won: true, attempts: 2 }, '4': { won: true, attempts: 2 } },
    });
  });
});

// =====================================================================================================================
// Round 3 — 2. Layout (TECH §10.1, UX §0.1, §5.1, D-015)
// =====================================================================================================================

describe('round 3: scaling and layout numbers (TECH 10.1, UX 0.1, 5.1, D-015)', () => {
  it('TECH 10.1 worked example: 390×844 with the safe areas out (≈ 390×763) leaves 9 % empty in FIT and nothing in EXPAND (H 2113); outside 1920–2400 EXPAND clamps H and bands the rest (D-015)', () => {
    const vp = { width: 390, height: 763 };
    const fit = fitViewport('fit', vp, TOKENS);
    expect(Math.round((100 * fit.letterboxPx) / vp.height)).toBe(9);
    expect(designHeight('expand', vp, TOKENS)).toBe(2113);
    const exp = fitViewport('expand', vp, TOKENS);
    expect(exp.letterboxPx).toBeLessThan(1);
    expect(exp.pillarboxPx).toBeLessThan(1);
    const tall = fitViewport('expand', { width: 360, height: 900 }, TOKENS);
    expect(tall.H).toBe(2400);
    expect(tall.letterboxPx).toBeCloseTo(900 - 800, 6);
    const wide = fitViewport('expand', { width: 480, height: 800 }, TOKENS);
    expect(wide.H).toBe(1920);
    expect(wide.letterboxPx).toBeCloseTo(0, 6);
    expect(wide.pillarboxPx).toBeCloseTo(480 - (1080 * 800) / 1920, 6);
  });

  it('UX 0.1 "üstte 24 px, altta 24 px kenar boşluğu": top-group elements start ≥ 24 px below the top; bottom-group elements and the popup panel end ≥ 24 px above the bottom (FIT, 390×844, 360×800)', () => {
    for (const H of [1920, 2337, 2400]) {
      const l = createLayout(TOKENS, H);
      const tops = {
        pause: l.top.pause,
        panorama: l.top.panorama,
        goals: l.top.goals,
        moves: l.top.moves,
        topBar: l.top.topBar,
      };
      for (const [name, r] of Object.entries(tops)) expect(r.y, `${name} H=${H}`).toBeGreaterThanOrEqual(24);
      const bottoms = {
        character: l.bottom.character,
        nav: l.bottom.nav,
        play: l.bottom.playButton,
        ...Object.fromEntries(l.bottom.boosters.map((b, i) => [`booster${i}`, b])),
      };
      for (const [name, r] of Object.entries(bottoms)) {
        expect(r.y + r.h, `${name} H=${H}`).toBeLessThanOrEqual(H - 24);
      }
      expect(l.popup.panelBottomY).toBeLessThanOrEqual(H - 24);
    }
  });

  it('UX 5.1 "Yapı tamam!" ribbon 306 × 96 at x 750–1056, y 960–1056, −6°, 24 px V notch, moving with the board (+208,5 / +240); the Usta Serisi strip is 96 px + 16 px pads = 128 px and stays between the board and the booster bar', () => {
    expect(FIT.board.siteRibbon).toEqual({ x: 750, y: 960, w: 306, h: 96, tiltDeg: -6, notchPx: 24 });
    for (const p of PHONES) {
      const H = designHeight('expand', p.viewport, TOKENS);
      const l = createLayout(TOKENS, H);
      expect(l.board.siteRibbon, p.label).toEqual({ ...FIT.board.siteRibbon, y: 960 + (H - 1920) * 0.5 });
    }
    for (const H of [1920, 2337, 2400]) {
      const l = createLayout(TOKENS, H);
      const strip = l.board.status;
      expect(strip.h).toBe(96);
      const hit = hitArea(strip, TOKENS.touch.minTargetPx);
      expect([hit.y, hit.h]).toEqual([strip.y - 16, 128]);
      expect(hit.y, `H=${H}`).toBeGreaterThanOrEqual(l.grid.boardBottomY);
      expect(hit.y + hit.h, `H=${H}`).toBeLessThanOrEqual(Math.min(...l.bottom.boosters.map((b) => b.y)));
    }
  });

  it('D-015 (KABUL; owner approval 2026-10-06 "önerilen yanıtla" = EXPAND) / TECH 10.1 "Seçim tek ayardır (src/config/display.ts → scaleMode)": scaleMode is "expand" and the Phaser config reads it instead of a fixed Scale.FIT', () => {
    const setting = (display as unknown as Record<string, unknown>)['scaleMode'];
    expect.soft(setting, 'src/config/display.ts scaleMode').toBe('expand');
    const main = read('src/main.ts');
    expect.soft(main, 'src/main.ts reads display.scaleMode').toMatch(/scaleMode/);
    expect.soft(main, 'src/main.ts hard-codes Phaser.Scale.FIT').not.toMatch(/mode:\s*Phaser\.Scale\.FIT\b/);
  });
});

// =====================================================================================================================
// Round 3 — 3. Draw recipes (ART §3 "120 px'te", §4 plan cell, §5 rails; TECH §10.2 / ASSET names)
// =====================================================================================================================

type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

function pathPoints(path: readonly Op[]): (readonly [number, number])[] {
  const pts: (readonly [number, number])[] = [];
  for (const o of path) {
    if (o[0] === 'moveTo' || o[0] === 'lineTo') pts.push([Number(o[1]), Number(o[2])]);
    if (o[0] === 'arcTo') pts.push([Number(o[1]), Number(o[2])], [Number(o[3]), Number(o[4])]);
  }
  return pts;
}

function bbox(pts: readonly (readonly [number, number])[]): Box {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const roundBox = (b: Box): Box => ({
  x0: Math.round(b.x0 * 10) / 10,
  y0: Math.round(b.y0 * 10) / 10,
  x1: Math.round(b.x1 * 10) / 10,
  y1: Math.round(b.y1 * 10) / 10,
});

const radiiOf = (path: readonly Op[]): number[] =>
  path.filter((o) => o[0] === 'arcTo').map((o) => Math.round(Number(o[5])));

/** ART 3 band kind of a fillRect by its size (bands are cell long; 0,14c / 0,16c high or 0,06c wide). */
function bandKind(args: readonly number[]): 'top' | 'bottom' | 'left' | 'right' | 'other' {
  const [x = 0, , w = 0, h = 0] = args;
  if (w === 120 && Math.round(h) === 17) return 'top';
  if (w === 120 && Math.round(h) === 19) return 'bottom';
  if (h === 120 && Math.round(w) === 7) return x % 120 < 60 ? 'left' : 'right';
  return 'other';
}

const mixWhite = (c: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => (c[i] ?? 0) + (255 - (c[i] ?? 0)) * t) as unknown as Rgb;
const times = (c: Rgb, f: number): Rgb => c.map((v) => v * f) as unknown as Rgb;

describe('round 3: draw recipes (ART 3, 4, 5; TECH 10.2; ASSET 2–3)', () => {
  it('ART 3 "120 px\'te" column on a B1 and on the TECH 10.2 L example: edges 3 px in, outer r 22 / inner r 7, bands top 17 · left 7 · bottom 19 · right 7 on open edges only, ONE gloss pill 41 × 12 at (0,14c, 0,12c) of the top-left open cell, outline 6, seam 3, symbol 55 centred', () => {
    // B1: every edge open.
    const ops = recordOps((ctx) => drawBlock(ctx, { shape: 'B1_0', color: 'G' }, TOKENS));
    const p = paints(ops);
    const base = p[0];
    if (base === undefined) throw new Error('no base fill');
    expect(roundBox(bbox(pathPoints(base.path)))).toEqual({ x0: 3, y0: 3, x1: 117, y1: 117 });
    expect(radiiOf(base.path)).toEqual([22, 22, 22, 22]);
    const bands = p.filter((x) => x.op === 'fillRect').map((x) => x.args.map(Number));
    const byKind = (k: string): number[][] => bands.filter((b) => bandKind(b) === k);
    expect(bands.map(bandKind).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    expect(byKind('top')[0]?.[1]).toBeCloseTo(3, 6); // starts on the 3 px inset edge
    expect(byKind('left')[0]?.[0]).toBeCloseTo(3, 6);
    const [rx = 0, , rw = 0] = byKind('right')[0] ?? [];
    expect(rx + rw).toBeCloseTo(117, 6);
    const [, by = 0, , bh = 0] = byKind('bottom')[0] ?? [];
    expect(by + bh).toBeCloseTo(117, 6);
    const gloss = p.filter((x) => x.op === 'fill' && x.style === 'rgba(255,255,255,0.28)');
    expect(gloss).toHaveLength(1);
    const g = bbox(pathPoints(gloss[0]?.path ?? []));
    expect([g.x0, g.y0]).toEqual([expect.closeTo(0.14 * 120, 6), expect.closeTo(0.12 * 120, 6)]);
    expect([Math.round(g.x1 - g.x0), Math.round(g.y1 - g.y0)]).toEqual([41, 12]);
    expect(radiiOf(gloss[0]?.path ?? [])).toEqual([6, 6, 6, 6]); // "tam yuvarlak"
    const outline = p.find((x) => x.op === 'stroke' && JSON.stringify(x.path) === JSON.stringify(base.path));
    if (outline === undefined) throw new Error('no outline stroke on the block outline');
    expect(outline.clipped ? outline.lineWidth / 2 : outline.lineWidth).toBe(6);
    const scale = ops.find((o) => o[0] === 'scale');
    expect(Math.round(Number(scale?.[1]) * 100)).toBe(55);
    const tr = ops.find((o) => o[0] === 'translate');
    expect(Number(tr?.[1]) + (Number(scale?.[1]) * 100) / 2).toBeCloseTo(60, 6);
    expect(Number(tr?.[2]) + (Number(scale?.[1]) * 100) / 2).toBeCloseTo(60, 6);

    // TECH 10.2 (b) L: one cell on top (x2), three below (x0–x2); canvas cells (0,1) (1,1) (2,1) (2,0).
    const lOps = recordOps((ctx) => drawBlock(ctx, { shape: 'L4_270', color: 'G' }, TOKENS));
    const lp = paints(lOps);
    expect(radiiOf(lp[0]?.path ?? []).sort()).toEqual([22, 22, 22, 22, 22, 7].sort());
    const lBands = lp.filter((x) => x.op === 'fillRect').map((x) => x.args.map(Number));
    const count = (k: string): number => lBands.filter((b) => bandKind(b) === k).length;
    expect({
      top: count('top'),
      left: count('left'),
      right: count('right'),
      bottom: count('bottom'),
    }).toEqual({
      top: 3,
      left: 2,
      right: 2,
      bottom: 3,
    });
    const lGloss = lp.filter((x) => x.op === 'fill' && x.style === 'rgba(255,255,255,0.28)');
    expect(lGloss).toHaveLength(1);
    const lg = bbox(pathPoints(lGloss[0]?.path ?? []));
    expect([lg.x0, lg.y0]).toEqual([expect.closeTo(240 + 0.14 * 120, 6), expect.closeTo(0.12 * 120, 6)]);
    const seam = lp.find((x) => x.op === 'stroke' && x.lineWidth === 3);
    expect(seam?.path.filter((o) => o[0] === 'moveTo')).toHaveLength(3); // (0,1)|(1,1), (1,1)|(2,1), (2,0)/(2,1)
    const centres = lOps
      .filter((o) => o[0] === 'translate')
      .map((o) => [Math.round(Number(o[1]) + 27.6), Math.round(Number(o[2]) + 27.6)].join(','))
      .sort();
    expect(centres).toEqual(['180,180', '300,180', '300,60', '60,180'].sort());
  });

  it('ART 3 layer colours the ART 3 table leaves out: left band = base + 10 % white, right band = base × 0,88, seam = base × 0,85 at 60 %, gloss white 28 % (all eight colours, ±1)', () => {
    const pal = artPalette();
    for (const c of COLOR_CODES) {
      const base = hexRgb(pal[c]);
      const p = paints(recordOps((ctx) => drawBlock(ctx, { shape: 'O4_0', color: c }, TOKENS)));
      const rects = p.filter((x) => x.op === 'fillRect');
      const left = rects.find((x) => bandKind(x.args.map(Number)) === 'left');
      const right = rects.find((x) => bandKind(x.args.map(Number)) === 'right');
      if (left === undefined || right === undefined) throw new Error(`${c}: no side bands`);
      expect(near(parseColor(left.style).rgb, mixWhite(base, 0.1)), `${c} left ${left.style}`).toBe(true);
      expect(near(parseColor(right.style).rgb, times(base, 0.88)), `${c} right ${right.style}`).toBe(true);
      const seam = p.find((x) => x.op === 'stroke' && x.lineWidth === 3);
      if (seam === undefined) throw new Error(`${c}: no seam`);
      expect(parseColor(seam.style).a, `${c} seam alpha`).toBeCloseTo(0.6, 6);
      expect(near(parseColor(seam.style).rgb, times(base, 0.85)), `${c} seam ${seam.style}`).toBe(true);
      const gloss = p.filter(
        (x) => x.op === 'fill' && near(parseColor(x.style).rgb, WHITE, 0) && parseColor(x.style).a < 0.5,
      );
      expect(gloss.map((x) => parseColor(x.style).a)).toEqual([0.28]);
    }
  });

  it('ART 4 / ASSET 3 plan cell 104 × 104 (8 px in, r 0,14c), ONE flat fill + ONE dashed stroke on the same box under a 55 px centred symbol — no bevel, gloss or shadow; plan_front and plan_support_hatch use the same box, the hatch horizontal 6 px every 20 px in #FFC21A 85 %', () => {
    for (const c of COLOR_CODES) {
      const ops = recordOps((ctx) => drawPlanCell(ctx, { color: c }, TOKENS));
      expect(
        ops.filter((o) => ['=shadowBlur', '=shadowColor', 'fillRect'].includes(o[0])),
        `${c} bevel / shadow`,
      ).toEqual([]);
      const p = paints(ops);
      const [fill, outline] = p;
      if (fill === undefined || outline === undefined) throw new Error(`${c}: plan cell not drawn`);
      expect([fill.op, outline.op]).toEqual(['fill', 'stroke']);
      expect(roundBox(bbox(pathPoints(fill.path))), c).toEqual({ x0: 8, y0: 8, x1: 112, y1: 112 });
      for (const r of fill.path.filter((o) => o[0] === 'arcTo')) expect(Number(r[5])).toBeCloseTo(16.8, 6);
      expect(outline.path).toEqual(fill.path);
      expect(outline.dash.length).toBeGreaterThan(0);
      // the rest is the symbol (inside its 55 px box), never a second layer over the 104 px cell
      const cellBox = JSON.stringify(roundBox(bbox(pathPoints(fill.path))));
      const layers = p.slice(2).filter((x) => JSON.stringify(roundBox(bbox(pathPoints(x.path)))) === cellBox);
      expect(layers, `${c} extra cell layers`).toEqual([]);
      for (const x of p.slice(2)) {
        const b = bbox(pathPoints(x.path));
        expect(b.x0 >= 0 && b.x1 <= 100 && b.y0 >= 0 && b.y1 <= 100, `${c} symbol part in its unit box`).toBe(
          true,
        );
      }
      const scale = ops.find((o) => o[0] === 'scale');
      const tr = ops.find((o) => o[0] === 'translate');
      expect(Number(scale?.[1]) * 100).toBeCloseTo(55.2, 6);
      expect([Number(tr?.[1]) + 27.6, Number(tr?.[2]) + 27.6]).toEqual([
        expect.closeTo(60, 6),
        expect.closeTo(60, 6),
      ]);
    }
    const front = paints(recordOps((ctx) => drawBuildFront(ctx, TOKENS)));
    expect(roundBox(bbox(pathPoints(front[0]?.path ?? [])))).toEqual({ x0: 8, y0: 8, x1: 112, y1: 112 });
    const hatchOps = recordOps((ctx) => drawSupportHatch(ctx, {}, TOKENS));
    const clipAt = hatchOps.findIndex((o) => o[0] === 'clip');
    const clipPath = hatchOps.slice(
      hatchOps
        .slice(0, clipAt)
        .map((o) => o[0])
        .lastIndexOf('beginPath') + 1,
      clipAt,
    );
    expect(roundBox(bbox(pathPoints(clipPath)))).toEqual({ x0: 8, y0: 8, x1: 112, y1: 112 });
    const hatch = paints(hatchOps).find((x) => x.op === 'stroke');
    if (hatch === undefined) throw new Error('no support hatch');
    expect(hatch.lineWidth).toBe(6);
    expect(parseColor(hatch.style)).toEqual({ rgb: hexRgb('#FFC21A'), a: 0.85 });
    const starts = hatch.path.filter((o) => o[0] === 'moveTo').map((o) => Number(o[2]));
    const ends = hatch.path.filter((o) => o[0] === 'lineTo').map((o) => Number(o[2]));
    expect(ends).toEqual(starts); // horizontal
    starts.slice(1).forEach((y, i) => expect(y - (starts[i] ?? 0)).toBeCloseTo(20, 9));
  });

  it('ART 5 W1 rails "2 çelik ray (6 px, board.scaffold)": the rail frame is a 6 px bar in #8A96A3', () => {
    const p = paints(recordOps((ctx) => drawGapRail(ctx, { length: 240 }, TOKENS)));
    expect(p.map((x) => [x.op, x.style.toUpperCase(), ...x.args.map(Number)])).toEqual([
      ['fillRect', TOKENS.color.board.scaffold.toUpperCase(), 0, 0, 240, 6],
    ]);
    expect(TOKENS.color.board.scaffold.toUpperCase()).toBe('#8A96A3');
  });

  it('TECH 10.2 / 10.3 and ASSET 2–3 texture names: plan_front, plan_support_hatch, board_ceiling_beam and ghost_badge_ok/_warn/_support/_glass/_cancel in the boot atlas; blk_<shape>_<c>, blk_sil_<shape>_<contact|lifted|crane> and ghost_<shape>_<valid|invalid|neutral> per shape', () => {
    const wrong: string[] = [];
    const boot = new Set(bootAtlasFrames(TOKENS).flatMap((f) => [f.name, ...f.aliases]));
    for (const name of [
      'plan_front',
      'plan_support_hatch',
      'board_ceiling_beam',
      ...['ok', 'warn', 'support', 'glass', 'cancel'].map((k) => `ghost_badge_${k}`),
    ]) {
      if (!boot.has(name)) wrong.push(`boot atlas has no ${name}`);
    }
    const shape: ShapeId = 'L4_270';
    if (blockFrameName(shape, 'G') !== 'blk_L4_270_G')
      wrong.push(`block frame ${blockFrameName(shape, 'G')}`);
    const perShape = new Set(shapeFrames(shape, TOKENS).flatMap((f) => [f.name, ...f.aliases]));
    for (const kind of ['contact', 'lifted', 'crane']) {
      if (!perShape.has(`blk_sil_${shape}_${kind}`)) wrong.push(`no blk_sil_${shape}_${kind}`);
    }
    for (const style of ['valid', 'invalid', 'neutral']) {
      if (!perShape.has(`ghost_${shape}_${style}`)) wrong.push(`no ghost_${shape}_${style}`);
    }
    expect(wrong, [...perShape].join(' ')).toEqual([]);
  });
});

// =====================================================================================================================
// Round 3 — 4. i18n ({company}, resume.void tone, Phase 2 window lines)
// =====================================================================================================================

describe('round 3: i18n (STORY 0, 7.5; NAMING 5.2; TECH 11.5; UX 1, 5.1, 7)', () => {
  it('STORY 0-6 / 0-10, NAMING 5.2, TECH 11.5 {company}: TR "Minik Usta İnşaat", EN "Tuna & Co."; every line using it renders the name with no params; the caller can pass neither {company} nor {town} through t or tDynamic', () => {
    expect(COMPANY_NAME).toEqual({ tr: 'Minik Usta İnşaat', en: 'Tuna & Co.' });
    let uses = 0;
    for (const locale of ['tr', 'en'] as const) {
      const tr = createTranslator(locale);
      for (const [key, text] of allTexts(locale)) {
        if (!text.includes('{company}')) continue;
        uses++;
        expect(tr.tDynamic(key.replace(/\.(one|other)$/, '')), key).toContain(COMPANY_NAME[locale]);
      }
      expect(() => tr.tDynamic('resume.void.body', { n: 1, company: 'X' } as never)).toThrow(/global/);
      expect(() => tr.t('resume.void.body', { n: 1, town: 'X' } as never)).toThrow(/global/);
    }
    expect(uses).toBeGreaterThan(0);
  });

  it('STORY 7.5 / UX 1 (c) resume.void.*: only {n} (the level) as a value — refunds are icons, never written — and no loss, elimination or blame word in TR or EN', () => {
    // STORY 7.5: "iade edilen can, güçlendirici ve altın metne yazılmaz ... elenme, kayıp ya da suçlama sözcüğü
    // kullanılmaz"; UX 1 (c): "Elenme, kayıp, 'deneme yandı' ya da suçlama dili yok".
    const keys = ['resume.void.title', 'resume.void.body', 'resume.void.bridge', 'common.ok'];
    const trBad = /kayıp|kaybet|elen|yandı|yanar|ceza|suç|hata|başarısız/u;
    const enBad = /\b(lost|lose|loss|eliminat\w*|penalt\w*|fail\w*|fault|wrong|burn\w*)\b/i;
    for (const locale of ['tr', 'en'] as const) {
      for (const k of keys) {
        const text = textOf(locale, k) ?? '';
        expect(text.length, `${locale} ${k}`).toBeGreaterThan(0);
        expect(
          placeholdersOf(text).filter((n) => n !== 'n'),
          `${locale} ${k}`,
        ).toEqual([]);
        expect(text, `${locale} ${k}`).not.toMatch(/\d/);
        if (locale === 'tr') expect(text.toLocaleLowerCase('tr-TR'), k).not.toMatch(trBad);
        else expect(text, k).not.toMatch(enBad);
      }
      expect(placeholdersOf(textOf(locale, 'resume.void.body') ?? '')).toEqual(['n']);
    }
  });

  // UX §5.1 exit confirm "m ≥ 1 : Çıkarsan 1 can gider. … + seri sıfırlanır satırı (s > 0 ise)" and UX §7 Pencere 1 ad
  // button "bugün 1/3": STORY §7.5 `exit.streak` (future tense; `lose.streak` is the past-tense Pencere 2 line) and
  // STORY §7.3 `lose.adToday` (`{n}` = today's ad number = watched + 1, `{max}` = rewardedAdOffer.perDay).
  it('UX 5.1 / UX 7 the exit-confirm streak line (s > 0) and the out-of-moves ad daily counter ("bugün 1/3") have i18n texts in TR and EN', () => {
    const tr = createTranslator('tr');
    const all = [...TR_KEYS].map((k) => [k, tr.tDynamic(k, { n: 1, max: 3 })] as const);
    const streak = all.filter(([, t]) => /seri\S* sıfırlanır/u.test(t));
    const adToday = all.filter(([k, t]) => !k.startsWith('lives.') && /bugün 1\/3/u.test(t));
    expect(streak).toHaveLength(1);
    expect(adToday).toHaveLength(1);
    expect(EN_KEYS.has(streak[0]?.[0] ?? '') && EN_KEYS.has(adToday[0]?.[0] ?? '')).toBe(true);
  });
});
