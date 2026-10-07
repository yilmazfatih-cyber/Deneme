/**
 * ART §8 / D-046 / TECH §10.2: the shipped font file. `public/fonts/baloo2-latin-tr.woff2` is the Baloo 2 variable font
 * (OFL 1.1, Google Fonts `ofl/baloo2/Baloo2[wght].ttf`) subset to the ART §8 "Teslim" ranges with fontTools:
 *
 *   pyftsubset 'Baloo2[wght].ttf' --unicodes=<ART §8 ranges> --flavor=woff2 --layout-features='*' \
 *     --name-IDs='*' --name-languages='*' --no-hinting --desubroutinize --output-file=baloo2-latin-tr.woff2
 *
 * The test reads the WOFF2 table directory, un-brotlis the table data (node:zlib) and checks the `cmap` (every i18n
 * character has a glyph), the `fvar` weight axis 400–800 and the size; `index.html` preloads the same file and declares
 * it with `font-display: block`; the OFL text ships next to it.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json' with { type: 'json' };
import tr from '../../src/i18n/tr.json' with { type: 'json' };
import { TOKENS } from '../../src/theme/tokens.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONT = join(ROOT, 'public', 'fonts', 'baloo2-latin-tr.woff2');

/** WOFF2 known table tags (index = the 6-bit tag code). */
const KNOWN_TAGS = (
  'cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp hdmx kern LTSH PCLT ' +
  'VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar ' +
  'fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill'
)
  .split(' ')
  .map((t) => t.replace('_', ' '));

interface Woff2 {
  readonly signature: string;
  readonly tables: ReadonlyMap<string, Buffer>;
}

/** Table directory + decompressed table data of a (non-collection) WOFF2 file (W3C WOFF2 §4–§5). */
function readWoff2(file: Buffer): Woff2 {
  const signature = file.toString('latin1', 0, 4);
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let p = 48;
  const base128 = (): number => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = file.readUInt8(p++);
      v = v * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return v;
    }
    throw new Error('bad UIntBase128');
  };
  const dir: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file.readUInt8(p++);
    let tag = KNOWN_TAGS[flags & 0x3f] ?? '';
    if ((flags & 0x3f) === 0x3f) {
      tag = file.toString('latin1', p, p + 4);
      p += 4;
    }
    const version = (flags >> 6) & 3;
    const origLength = base128();
    const glyfOrLoca = tag === 'glyf' || tag === 'loca';
    const transformed = glyfOrLoca ? version !== 3 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ tag, length });
  }
  const data = brotliDecompressSync(file.subarray(p, p + compressedSize));
  const tables = new Map<string, Buffer>();
  let off = 0;
  for (const t of dir) {
    tables.set(t.tag, data.subarray(off, off + t.length));
    off += t.length;
  }
  return { signature, tables };
}

/** Code point → glyph id from the Windows Unicode `cmap` subtable (format 4 BMP, or format 12). */
function cmapLookup(cmap: Buffer): (cp: number) => number {
  const n = cmap.readUInt16BE(2);
  let best: { format: number; at: number } | null = null;
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const at = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(at);
    if (platform === 3 && (encoding === 10 || encoding === 1) && (format === 12 || format === 4)) {
      if (best === null || format === 12) best = { format, at };
    }
  }
  if (best === null) throw new Error('no Windows Unicode cmap');
  const at = best.at;
  if (best.format === 12) {
    const groups = cmap.readUInt32BE(at + 12);
    return (cp) => {
      for (let g = 0; g < groups; g++) {
        const o = at + 16 + g * 12;
        const lo = cmap.readUInt32BE(o);
        const hi = cmap.readUInt32BE(o + 4);
        if (cp >= lo && cp <= hi) return cmap.readUInt32BE(o + 8) + (cp - lo);
      }
      return 0;
    };
  }
  const segX2 = cmap.readUInt16BE(at + 6);
  const ends = at + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return (cp) => {
    for (let s = 0; s < segX2; s += 2) {
      if (cp > cmap.readUInt16BE(ends + s)) continue;
      const start = cmap.readUInt16BE(starts + s);
      if (cp < start) return 0;
      const delta = cmap.readInt16BE(deltas + s);
      const ro = cmap.readUInt16BE(ranges + s);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = cmap.readUInt16BE(ranges + s + ro + 2 * (cp - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
}

function texts(dict: unknown, out: string[] = []): string[] {
  if (typeof dict === 'string') out.push(dict);
  else if (dict && typeof dict === 'object') for (const v of Object.values(dict)) texts(v, out);
  return out;
}

describe('Baloo 2 subset font (ART 8, D-046, TECH 10.2)', () => {
  const file = readFileSync(FONT);
  const font = readWoff2(file);

  it('D-046 public/fonts/baloo2-latin-tr.woff2 is a WOFF2 variable font, weight axis 400–800, ≈ 38 KB', () => {
    expect(font.signature).toBe('wOF2');
    expect(statSync(FONT).size).toBeLessThan(45_000);
    const fvar = font.tables.get('fvar');
    if (!fvar) throw new Error('no fvar table: not the variable font');
    const axesAt = fvar.readUInt16BE(4);
    const tag = fvar.toString('latin1', axesAt, axesAt + 4);
    const fixed = (o: number): number => fvar.readInt32BE(axesAt + o) / 65536;
    expect([tag, fixed(4), fixed(12)]).toEqual(['wght', 400, 800]);
    const name = font.tables.get('name');
    expect(name?.toString('latin1').replace(/\0/g, '')).toContain('Baloo 2');
  });

  it('ART 8 every character of tr.json and en.json has a glyph in the shipped subset (Turkish letters, ₺, ≈, ×, −)', () => {
    const glyph = cmapLookup(font.tables.get('cmap') ?? Buffer.alloc(0));
    const missing = new Set<string>();
    for (const text of [...texts(tr), ...texts(en)]) {
      for (const ch of text) if (glyph(ch.codePointAt(0) ?? 0) === 0) missing.add(ch);
    }
    expect([...missing]).toEqual([]);
    for (const ch of 'ğĞüÜşŞıİöÖçÇâîû₺≈×−“”«»') expect(glyph(ch.codePointAt(0) ?? 0), ch).toBeGreaterThan(0);
    for (const ch of '●✓★♥∞') expect(glyph(ch.codePointAt(0) ?? 0), ch).toBe(0);
  });

  it('TECH 10.2 index.html preloads the same file and declares it font-display: block, weights 400 800; OFL ships beside it', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(
      /<link rel="preload" href="\/fonts\/baloo2-latin-tr\.woff2" as="font" type="font\/woff2" crossorigin \/>/,
    );
    const face = /@font-face\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(face).toContain(`font-family: '${TOKENS.font.family}'`);
    expect(face).toContain("url('/fonts/baloo2-latin-tr.woff2') format('woff2')");
    expect(face).toContain('font-weight: 400 800');
    expect(face).toContain('font-display: block');
    const ofl = readFileSync(join(ROOT, 'public', 'fonts', 'OFL.txt'), 'utf8');
    expect(ofl).toContain('Copyright 2019 The Baloo 2 Project Authors');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
});
