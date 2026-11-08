/**
 * `npm run build:verify` (part of `npm run build`): the production bundle in dist/ must not contain the debug panel
 * or the Playwright harness (R-20, TECH_DESIGN §12.2–§12.3). Exit 1 when a marker is found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const TEXT_EXTENSIONS = ['.js', '.mjs', '.html', '.css', '.json', '.map', '.txt', '.webmanifest'];

/** Content markers that only debug/harness code produces (generic words like "debug" also occur inside Phaser). */
const CONTENT_MARKERS: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /__debug/, why: '__debug global' },
  { pattern: /__harness/, why: '__harness global' },
  { pattern: /src\/debug\//, why: 'src/debug module path' },
  { pattern: /src\/harness\//, why: 'src/harness module path' },
  { pattern: /\.get\(\s*["']debug["']\s*\)/, why: '?debug query handler' },
  { pattern: /\.get\(\s*["']harness["']\s*\)/, why: '?harness query handler' },
  { pattern: /[?&]debug=1/, why: '?debug=1 handler' },
];

/** File-name markers: a chunk named after the debug panel or harness. */
const NAME_MARKER = /(^|[/\\._-])(debug|harness)([/\\._-]|$)/i;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
}

function main(): number {
  let files: string[] = [];
  try {
    walk(DIST, files);
  } catch {
    process.stderr.write(`verify-dist: ${DIST}/ not found; run "vite build" first.\n`);
    return 1;
  }
  files = files.sort();
  const problems: string[] = [];
  for (const file of files) {
    const rel = relative(DIST, file);
    if (NAME_MARKER.test(rel)) problems.push(`${rel}: file name looks like a debug/harness chunk`);
    if (!TEXT_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of CONTENT_MARKERS) {
      if (marker.pattern.test(text)) problems.push(`${rel}: contains ${marker.why}`);
    }
  }
  if (problems.length > 0) {
    process.stderr.write(`verify-dist: ${problems.length} problem(s) in ${DIST}/ (R-20)\n`);
    for (const p of problems) process.stderr.write(`  ${p}\n`);
    return 1;
  }
  process.stdout.write(`verify-dist: ${files.length} files in ${DIST}/, no debug/harness code (R-20)\n`);
  return 0;
}

process.exitCode = main();
