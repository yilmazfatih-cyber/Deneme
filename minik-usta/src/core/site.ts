/**
 * Site mode strategy (docs/GDD.md K-22; K-23 carousel and K-24 elevator are Phase 3; TECH_DESIGN §7.1 `SiteStrategy`,
 * §6.2 steps 8 and 10, S1).
 *
 * `segments` (S1, K-22): one active segment at a time. When it is complete (K-15) in K-35 step 8, the completed count
 * (`deliveryCursor`) goes up, the site shifts to the next segment, which comes empty, and the next truck batch joins the
 * end of the queue (delivered in step 9, K-25). After the last segment there is no shift: step 11 checks the win.
 *
 * Phase 3 stubs: `carousel` (K-23) segment completion and counter tick, and the elevator (K-24) tick throw
 * "Phase 3". Reading the visible segment and the frame offset works for every mode (other modules already use them).
 */
import type { PieceId } from './types.ts';
import { H, hdr, setHdr } from './state.ts';
import type { GameState } from './state.ts';
import type { CompiledLevel } from './level/compile.ts';
import { isSegmentComplete } from './placement.ts';
import { enqueueBatchesFor } from './delivery.ts';

/** What K-35 step 8 did. */
export interface SegmentCompletion {
  /** The segment that was completed. */
  readonly seg: number;
  /** Completed segments after this one (`deliveryCursor`). */
  readonly completed: number;
  /** Segment now on the site; null after the last segment (no shift, K-22). */
  readonly shiftedTo: number | null;
  /** Truck pieces appended to the queue (K-25), delivered in step 9. */
  readonly enqueued: readonly PieceId[];
}

export interface SiteStrategy {
  readonly mode: CompiledLevel['mode'];
  /** Segment shown on the site: active (segments) or front (carousel). */
  activeSegment(s: GameState): number;
  /** Elevator offset `e` (K-24); 0 without elevator. */
  frameOffset(s: GameState): number;
  /** K-35 step 8: completes the shown segment when it is done (K-15); null when it is not. */
  completeIfDone(s: GameState): SegmentCompletion | null;
  /** K-35 step 10, timer S5 (K-23): returns the new front segment when the platform turned, else null. */
  carouselTick(s: GameState): number | null;
  /** K-35 step 10, timer S6 (K-24): returns the new offset. */
  elevatorTick(s: GameState): number;
}

function phase3(what: string): never {
  throw new Error(`Phase 3: ${what} is not implemented yet (TECH_DESIGN §14.2)`);
}

const SEGMENTS: SiteStrategy = Object.freeze({
  mode: 'segments',
  activeSegment: (s: GameState) => hdr(s, H.activeSeg),
  frameOffset: (s: GameState) => hdr(s, H.elev),
  completeIfDone(s: GameState): SegmentCompletion | null {
    const seg = hdr(s, H.activeSeg);
    if (!isSegmentComplete(s, seg)) return null;
    const completed = hdr(s, H.deliveryCursor) + 1;
    setHdr(s, H.deliveryCursor, completed);
    let shiftedTo: number | null = null;
    if (seg + 1 < s.lvl.segments.length) {
      shiftedTo = seg + 1;
      setHdr(s, H.activeSeg, shiftedTo);
    }
    const enqueued = enqueueBatchesFor(s, completed);
    return { seg, completed, shiftedTo, enqueued };
  },
  carouselTick: (): number | null => null,
  elevatorTick: (): number => phase3('the elevator scaffold tick (S6, K-24)'),
});

const CAROUSEL: SiteStrategy = Object.freeze({
  mode: 'carousel',
  activeSegment: (s: GameState) => hdr(s, H.frontSeg),
  frameOffset: (s: GameState) => hdr(s, H.elev),
  completeIfDone: (): SegmentCompletion | null => phase3('carousel segment completion (S5, K-23)'),
  carouselTick: (): number | null => phase3('the carousel counter (S5, K-23)'),
  elevatorTick: (): number => phase3('the elevator scaffold tick (S6, K-24)'),
});

/** The strategy of a level's `build.mode` (S1 segments; S5 carousel stub). */
export function siteStrategy(lvl: CompiledLevel): SiteStrategy {
  return lvl.mode === 'carousel' ? CAROUSEL : SEGMENTS;
}
