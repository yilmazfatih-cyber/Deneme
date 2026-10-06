/**
 * `npm run test:rules` — rule coverage gate (TECH_DESIGN §12.2, §12.4).
 *
 * STUB: the real tool reads `vitest list --json`, takes the K-xx / E-xx / obstacle / [kural] N-note ids from
 * docs/GDD.md and docs/OBSTACLES.md and fails when an id required for the given phase has no test name containing
 * it. Until it is written this stub only parses its arguments and exits 0, so `npm run check` stays green.
 */

function parsePhase(argv: readonly string[]): number | null {
  const i = argv.indexOf('--phase');
  if (i < 0) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) {
    process.stderr.write('rule-coverage: --phase needs a positive integer\n');
    process.exit(2);
  }
  return n;
}

const phase = parsePhase(process.argv.slice(2));
process.stdout.write(
  `rule-coverage: not implemented yet (tools/rule-coverage.ts is a stub); ` +
    `${phase === null ? 'full' : `phase ${phase}`} coverage is NOT enforced.\n`,
);
