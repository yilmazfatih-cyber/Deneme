import { describe, expect, it } from 'vitest';
import { panoramaView } from '../../src/core/panorama.ts';
import { createInitialState, H, hdr } from '../../src/core/state.ts';
import { initialState } from '../fixtures/builders.ts';
import { HAND, dragTo, levelFile, run } from './moves.fixtures.ts';

const statuses = (s: Parameters<typeof panoramaView>[0]): string[] => panoramaView(s).map((p) => p.status);

describe('K-06 build panorama', () => {
  it('K-06 GDD example: 3 segments, after segment 1 the panorama reads [done][active][future]', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: [['WW'], ['YY'], ['WW']],
      pieces: [
        ['D2_90', 'W', 0, 0],
        ['D2_90', 'Y', 2, 0],
        ['D2_90', 'W', 4, 0],
      ],
    });
    expect(statuses(s)).toEqual(['active', 'future', 'future']);
    run(s, dragTo(0, 6, 8));
    expect(hdr(s, H.activeSeg)).toBe(1);
    expect(statuses(s)).toEqual(['done', 'active', 'future']);
    expect(panoramaView(s).map((p) => p.rows)).toEqual([[['W', 'W']], [['Y', 'Y']], [['W', 'W']]]);
  });

  it('K-06 hidden `?` cells show `?` in the panorama until they are revealed (K-32)', () => {
    const s = initialState({
      wall: { height: 2 },
      plan: ['??', 'WY'],
      hidden: [{ kind: 'repeat', period: 1 }],
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'Y', 1, 0],
        ['B1_0', 'W', 2, 0],
      ],
    });
    expect(panoramaView(s)[0]?.rows).toEqual([
      ['?', '?'],
      ['W', 'Y'],
    ]);
    run(s, dragTo(0, 6, 8));
    run(s, dragTo(1, 7, 8));
    run(s, dragTo(2, 6, 8)); // W on the hidden (6,1): correct, opens it
    expect(panoramaView(s)[0]?.rows).toEqual([
      ['W', '?'],
      ['W', 'Y'],
    ]);
  });

  it('K-06 reading the panorama never changes the game state (bit-identical buffer, same m)', () => {
    const s = createInitialState(levelFile(5));
    for (const m of HAND[5].slice(0, 3)) run(s, m);
    const before = s.buf.slice();
    const views = [panoramaView(s), panoramaView(s), panoramaView(s)];
    expect(s.buf).toEqual(before);
    expect(hdr(s, H.turn)).toBe(3);
    expect(views[1]).toEqual(views[0]);
    expect(views[0]).toEqual([
      {
        index: 0,
        status: 'done',
        rows: [
          ['R', 'R'],
          ['W', 'W'],
          ['W', 'W'],
          ['G', 'G'],
        ],
      },
      {
        index: 1,
        status: 'active',
        rows: [
          ['R', 'R'],
          ['G', 'G'],
          ['W', 'G'],
          ['W', 'W'],
        ],
      },
    ]);
  });

  it('K-06 an S2 window cell stays `.` in the panorama (level 4)', () => {
    const view = panoramaView(createInitialState(levelFile(4)));
    expect(view).toEqual([
      {
        index: 0,
        status: 'active',
        rows: [
          ['R', 'R'],
          ['W', 'W'],
          ['W', '.'],
          ['W', 'W'],
          ['Y', 'Y'],
        ],
      },
    ]);
  });
});
