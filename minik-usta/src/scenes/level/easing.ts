/**
 * Phaser ease functions by token name (`tokens.easing.*`, JUICE §0 rule 9: Phaser naming), as pure `Ease` values for
 * motion.ts tracks. Unknown names fall back to Phaser's default (Power0 / Linear).
 */
import Phaser from 'phaser';
import type { Ease } from './motion.ts';

const cache = new Map<string, Ease>();

export function easeOf(name: string): Ease {
  let ease = cache.get(name);
  if (!ease) {
    const f = Phaser.Tweens.Builders.GetEaseFunction(name) as (v: number) => number;
    ease = (u: number): number => f(u);
    cache.set(name, ease);
  }
  return ease;
}
