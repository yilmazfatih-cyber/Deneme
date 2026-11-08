/**
 * Labels of the debug panel (docs/TECH_DESIGN.md §12.3; R-20).
 *
 * The panel is a developer tool that exists only in the development build: it is not game text, players never see
 * it, and it is never translated. Its labels therefore live here, in one English table (the code language), instead of
 * src/i18n/tr.json / en.json — putting them in the game dictionaries would ship debug strings in every production
 * bundle (the dictionaries are bundled; the panel is not, verify-dist R-20).
 */
export const LABEL = {
  toggle: 'DBG',
  close: 'Hide',
  level: 'Level',
  restart: 'Restart',
  restartTitle: 'Drop the running attempt (no penalty) and start the level again',
  levelTitle: 'Start this level as a new attempt (the running attempt is dropped, no penalty)',
  status: 'State',
  noLevel: 'no level running',
  rules: 'Rules',
  rulesHint: 'A change reopens the running attempt under the new rules (its move log is replayed).',
  unlimitedMoves: 'Unlimited moves',
  yardGravity: 'Yard gravity (K-20)',
  buildGravity: 'Build gravity (K-19)',
  levelValue: 'level',
  on: 'on',
  off: 'off',
  obstacles: 'Obstacle rules',
  coreModel: 'core model, no hook',
  noRules: 'none in this level',
  board: 'Board (Appendix A)',
  copyAscii: 'Copy ASCII',
  copyIds: 'Copy ASCII ids',
  copyLog: 'Copy move log',
  copyAnalytics: 'Copy analytics',
  copied: 'copied',
  copyFailed: 'clipboard blocked: see console',
  golden: 'Golden solution',
  play: 'Play',
  step: 'Step',
  stop: 'Stop',
  fps: 'FPS',
  events: 'Events (last 50)',
  clear: 'Clear',
} as const;
