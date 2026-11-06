import type { ScaleMode } from '../theme/layout.ts';

/**
 * Design resolution (TECH §10.1, R-06): the width is always 1080. The height is 1920 in FIT and grows with the viewport
 * aspect from 1920 up to `tokens.meta.scale.expandMaxHeight` (2400) in EXPAND; `theme/layout.ts` anchors every group
 * (top / board / bottom / popup) for both modes.
 */
export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;

/** The single scale setting (TECH §10.1 "Seçim tek ayardır"). D-015 KABUL (owner, 2026-10-06): EXPAND. */
export const scaleMode: ScaleMode = 'expand';
