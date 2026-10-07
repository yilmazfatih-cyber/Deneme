import { describe, expect, it } from 'vitest';
import { Pool } from '../../src/scenes/level/Pool.ts';
import { PIECE_POOL_PREWARM } from '../../src/scenes/level/viewConstants.ts';

describe('object pool (TECH 10.4)', () => {
  it('TECH 10.4 PieceView pool keeps 48 ready', () => {
    expect(PIECE_POOL_PREWARM).toBe(48);
  });

  it('prewarm creates once; acquire reuses released items and resets them', () => {
    let made = 0;
    const resets: number[] = [];
    const pool = new Pool(
      () => ({ n: made++ }),
      (it) => resets.push(it.n),
    ).prewarm(3);
    expect(pool.available).toBe(3);
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    expect(resets).toEqual([a.n]);
    expect(pool.acquire()).toBe(a);
    pool.acquire();
    pool.acquire(); // pool empty → a new item
    expect(pool.size).toBe(4);
    expect(b.n).not.toBe(a.n);
  });
});
