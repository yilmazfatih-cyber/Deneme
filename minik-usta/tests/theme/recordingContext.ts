/**
 * Recording mock of the Canvas2D surface (src/theme/draw/context.ts) for Node tests.
 * Every method call and property write is appended to `ops`; reading or calling a member that is not part of
 * `DrawContext` throws, so drawers cannot silently depend on browser-only API (Path2D, roundRect …).
 * It also models the save/restore state stack, so tests can check that drawers do not leak sticky state.
 */
import type { DrawContext } from '../../src/theme/draw/context.ts';

export type Op = readonly [string, ...unknown[]];

const METHODS = new Set([
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arcTo',
  'arc',
  'ellipse',
  'bezierCurveTo',
  'quadraticCurveTo',
  'rect',
  'fill',
  'stroke',
  'clip',
  'fillRect',
  'clearRect',
  'translate',
  'scale',
  'rotate',
  'setLineDash',
  'fillText',
]);

interface State {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: unknown;
  lineCap: unknown;
  lineJoin: unknown;
  lineDashOffset: unknown;
  globalAlpha: unknown;
  shadowColor: unknown;
  shadowBlur: unknown;
  shadowOffsetX: unknown;
  shadowOffsetY: unknown;
  font: unknown;
  textAlign: unknown;
  textBaseline: unknown;
  lineDash: readonly number[];
  /** Number of transform calls since the matching save (0 = identity relative to the start). */
  transforms: number;
  clips: number;
}

const initialState = (): State => ({
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  lineDashOffset: 0,
  globalAlpha: 1,
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  lineDash: [],
  transforms: 0,
  clips: 0,
});

/** State that would corrupt the next drawer if left behind. */
export const STICKY_KEYS = [
  'lineDash',
  'lineDashOffset',
  'globalAlpha',
  'shadowColor',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'transforms',
  'clips',
] as const;

export interface Recorder {
  readonly ctx: DrawContext;
  readonly ops: Op[];
  /** Current save depth. */
  depth(): number;
  state(): Readonly<State>;
}

const copy = (v: unknown): unknown => (Array.isArray(v) ? [...(v as unknown[])] : v);

export function createRecorder(): Recorder {
  const ops: Op[] = [];
  let state = initialState();
  const stack: State[] = [];
  const target = {} as Record<string, unknown>;
  const ctx = new Proxy(target, {
    get(_t, prop) {
      if (typeof prop !== 'string') throw new Error(`recorder: symbol access ${String(prop)}`);
      if (METHODS.has(prop)) {
        return (...args: unknown[]) => {
          ops.push([prop, ...args.map(copy)]);
          switch (prop) {
            case 'save':
              stack.push({ ...state, lineDash: [...state.lineDash] });
              break;
            case 'restore': {
              const s = stack.pop();
              if (!s) throw new Error('recorder: restore without save');
              state = s;
              break;
            }
            case 'setLineDash':
              state.lineDash = [...(args[0] as number[])];
              break;
            case 'translate':
            case 'scale':
            case 'rotate':
              state.transforms++;
              break;
            case 'clip':
              state.clips++;
              break;
          }
        };
      }
      if (prop in state && prop !== 'lineDash' && prop !== 'transforms' && prop !== 'clips') {
        return state[prop as keyof State];
      }
      throw new Error(`recorder: drawers may not use ctx.${prop} (not part of DrawContext)`);
    },
    set(_t, prop, value) {
      if (typeof prop !== 'string' || !(prop in state) || prop === 'lineDash' || prop === 'transforms') {
        throw new Error(`recorder: drawers may not set ctx.${String(prop)}`);
      }
      ops.push(['=' + prop, value]);
      (state as unknown as Record<string, unknown>)[prop] = value;
      return true;
    },
  });
  return {
    ctx: ctx as unknown as DrawContext,
    ops,
    depth: () => stack.length,
    state: () => state,
  };
}

/** Runs `draw` on a fresh recorder and returns its ops. */
export function record(draw: (ctx: DrawContext) => void): Op[] {
  const r = createRecorder();
  draw(r.ctx);
  return r.ops;
}

/** Ops of the given kind. */
export const opsOf = (ops: readonly Op[], name: string): Op[] => ops.filter((o) => o[0] === name);

/** Value of `prop` (e.g. 'fillStyle') at the moment of each `name` call (e.g. 'fill'). */
export function styleAt(ops: readonly Op[], name: string, prop: string): unknown[] {
  let current: unknown = undefined;
  const out: unknown[] = [];
  const stack: unknown[] = [];
  for (const o of ops) {
    if (o[0] === '=' + prop) current = o[1];
    else if (o[0] === 'save') stack.push(current);
    else if (o[0] === 'restore') current = stack.pop();
    else if (o[0] === name) out.push(current);
  }
  return out;
}
