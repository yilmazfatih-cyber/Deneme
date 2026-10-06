import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** Names imported from src/core modules, per file. */
function coreImports(file: string): { module: string; names: string[] }[] {
  const code = readFileSync(file, 'utf8');
  const out: { module: string; names: string[] }[] = [];
  for (const m of code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']*\/core\/[^']*)'/g)) {
    if (m[1]) continue; // type-only import
    const names = (m[2] ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !n.startsWith('type '));
    out.push({ module: m[3] ?? '', names });
  }
  return out;
}

/**
 * Core functions that change a GameState. The scene only commits through `GameSession` (TECH §1.4 "sahne durumu asla
 * kendisi değiştirmez"): none of them may be imported by src/scenes or src/ui.
 */
const WRITERS = new Set([
  'applyMove',
  'movePiece',
  'lockPiece',
  'stickPiece',
  'occupyPiece',
  'vacatePiece',
  'refreshSiteMasks',
  'settleYard',
  'settlePlacement',
  'returnBrokenPiece',
  'applyTrowel',
  'grantTrowels',
  'comboOnCorrect',
  'comboReset',
  'enqueuePiece',
  'removeQueueAt',
  'deliverQueue',
  'enqueueBatchesFor',
  'addGoalCount',
  'setBuildProgress',
]);

describe('scene layering (TECH 1.1–1.4)', () => {
  const files = [...tsFiles(join(ROOT, 'src/scenes')), ...tsFiles(join(ROOT, 'src/ui'))];

  it('TECH 1.4 scenes and ui never write the game state: no core writer is imported, moves go through GameSession', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { module, names } of coreImports(file)) {
        for (const n of names) {
          if (WRITERS.has(n) || /^set[A-Z]/.test(n))
            offenders.push(`${file.slice(ROOT.length)}: ${n} from ${module}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('TECH 1.4 the level scene commits drags through GameSession.commit and asks the core for the shadow', () => {
    const scene = readFileSync(join(ROOT, 'src/scenes/level/LevelScene.ts'), 'utf8');
    expect(scene).toMatch(/\.commit\(\{ kind: 'drag', pieceId: id, to: node \}, sink\)/);
    expect(scene).toMatch(/computeFall\(s, session\.pieceId, node, \{ rules: this\.hooks\.fall \}\)/);
    const drag = readFileSync(join(ROOT, 'src/scenes/level/DragController.ts'), 'utf8');
    expect(drag).toMatch(/tryBeginDrag\(s, id, host\.dragRules\(\)\)/);
    expect(drag).toMatch(/\.follow\(target\.px, target\.py\)/);
  });
});
