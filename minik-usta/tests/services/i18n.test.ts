import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tr from '../../src/i18n/tr.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import {
  COMPANY_NAME,
  DICTIONARIES,
  GLOBAL_PLACEHOLDERS,
  createTranslator,
  flattenKeys,
  getLocale,
  hasKey,
  setLocale,
  splitInline,
  t,
  tDynamic,
  upper,
} from '../../src/services/i18n.ts';
import type { Dictionary, I18nKey } from '../../src/services/i18n.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

function lookupText(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)]
    .map((m) => m[1] as string)
    .filter((n) => !(GLOBAL_PLACEHOLDERS as readonly string[]).includes(n))
    .sort();

/**
 * Minimal JSON object scanner that reports a key written twice in the same object (JSON.parse silently keeps the last
 * one, which would hide a key that is "both leaf and node").
 */
function duplicateKeys(text: string): string[] {
  const dups: string[] = [];
  let i = 0;
  const ws = (): void => {
    while (/\s/.test(text[i] ?? '')) i++;
  };
  const str = (): string => {
    const start = i;
    i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (path: string): void => {
    ws();
    if (text[i] === '{') {
      i++;
      const seen = new Set<string>();
      ws();
      while (text[i] !== '}') {
        ws();
        const k = str();
        if (seen.has(k)) dups.push(path + k);
        seen.add(k);
        ws();
        i++; // ':'
        value(`${path}${k}.`);
        ws();
        if (text[i] === ',') i++;
        ws();
      }
      i++;
    } else if (text[i] === '"') {
      str();
    } else {
      throw new Error(`unexpected token at ${i}: only objects and strings are allowed in i18n files`);
    }
  };
  value('');
  return dups;
}

/** STORY tables (§6, §7.x): id cell (one or several ids, `.x` = sibling of the first), TR, EN. */
function storyTableTexts(): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (const line of read('docs/STORY.md').split('\n')) {
    if (!line.startsWith('| `')) continue;
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    const ids: string[] = [];
    for (const m of (cells[0] as string).matchAll(/`([^`]+)`/g)) {
      const id = m[1] as string;
      ids.push(id.startsWith('.') && ids[0] !== undefined ? ids[0].replace(/\.[^.]+$/, '') + id : id);
    }
    const [trCell, enCell] = [cells[1] as string, cells[2] as string];
    if (ids.length === 1) out.set(ids[0] as string, [trCell, enCell]);
    else {
      const trs = trCell.split(' / ');
      const ens = enCell.split(' / ');
      if (trs.length === ids.length && ens.length === ids.length) {
        ids.forEach((id, k) => out.set(id, [trs[k] as string, ens[k] as string]));
      }
    }
  }
  return out;
}

/** STORY §4.0 prologue lines `- Speaker: "TR" / "EN"` → `story.prologue.p<n>.<speaker>`. */
function prologueTexts(): Map<string, [string, string]> {
  const speaker: Record<string, string> = { Tuna: 'tuna', 'Usta Dede': 'dede', Kepçe: 'kepce' };
  const section = read('docs/STORY.md').split('### 4.0')[1]?.split('### 4.1')[0] ?? '';
  const out = new Map<string, [string, string]>();
  let panel: string | null = null;
  for (const line of section.split('\n')) {
    const p = /^\*\*Panel (\d+)\*\*/.exec(line);
    if (p) panel = p[1] as string;
    const m = /^- ([^:]+): "([^"]+)" \/ "([^"]+)"/.exec(line);
    if (m && panel !== null) {
      const who = speaker[m[1] as string];
      if (who === undefined) throw new Error(`unknown prologue speaker ${m[1]}`);
      out.set(`story.prologue.p${panel}.${who}`, [m[2] as string, m[3] as string]);
    }
  }
  return out;
}

/** OBSTACLES info cards: `(\`obs.<id>.desc\`): TR "…" · EN "…"`. */
function obstacleCards(): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (const m of read('docs/OBSTACLES.md').matchAll(
    /\(`(obs\.[a-z0-9]+\.desc)`[^)]*\): TR "([^"]+)" · EN "([^"]+)"/g,
  )) {
    out.set(m[1] as string, [m[2] as string, m[3] as string]);
  }
  return out;
}

const trKeys = flattenKeys(tr).sort();
const enKeys = flattenKeys(en).sort();

describe('i18n files (TECH 11.5)', () => {
  it('TECH 11.5 tr.json and en.json have exactly the same keys', () => {
    expect(trKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(trKeys);
  });

  it('TECH 11.5 {param} names are equal in TR and EN (global {town}/{company} excluded)', () => {
    for (const key of trKeys) {
      const a = lookupText(tr, key) as string;
      const b = lookupText(en, key) as string;
      expect(placeholders(b), key).toEqual(placeholders(a));
    }
  });

  it('TECH 11.5 no empty text', () => {
    for (const key of trKeys) {
      expect((lookupText(tr, key) ?? '').trim().length, `tr ${key}`).toBeGreaterThan(0);
      expect((lookupText(en, key) ?? '').trim().length, `en ${key}`).toBeGreaterThan(0);
    }
  });

  it('TECH 11.5 i18n key is never both leaf and node', () => {
    for (const file of ['src/i18n/tr.json', 'src/i18n/en.json']) {
      expect(duplicateKeys(read(file)), file).toEqual([]);
    }
    for (const key of trKeys) {
      expect(
        trKeys.some((other) => other.startsWith(`${key}.`)),
        key,
      ).toBe(false);
    }
  });

  it('D-017 every text is verbatim from STORY 4.0 / 6 / 7 and the OBSTACLES info cards', () => {
    const source = new Map([...storyTableTexts(), ...prologueTexts(), ...obstacleCards()]);
    for (const key of trKeys) {
      const doc = source.get(key);
      expect(doc, `${key} has no TR/EN source line in STORY or OBSTACLES`).toBeDefined();
      expect([lookupText(tr, key), lookupText(en, key)], key).toEqual(doc);
    }
  });

  it('TECH 14.1 Phase 2 keys: level 1-5 tutorial textKeys and teaches cards resolve in both languages', () => {
    const needed = new Set<string>();
    for (let id = 1; id <= 5; id++) {
      const level = JSON.parse(read(`levels/level_00${id}.json`)) as {
        tutorial?: { textKey: string }[];
        teaches?: string;
      };
      for (const step of level.tutorial ?? []) needed.add(step.textKey);
      if (level.teaches !== undefined) needed.add(`obs.${level.teaches.toLowerCase().replace('-', '')}.desc`);
    }
    expect(needed.size).toBeGreaterThanOrEqual(13);
    for (const key of needed) {
      expect(lookupText(tr, key), `tr ${key}`).toBeDefined();
      expect(lookupText(en, key), `en ${key}`).toBeDefined();
    }
    // Phase 2 windows (STORY 7.3, 7.5): out-of-moves, life lost, exit confirm, resume, void notice.
    for (const key of [
      'lose.title',
      'lose.life',
      'lose.retry',
      'exit.title',
      'exit.free',
      'exit.cost',
      'resume.title',
    ]) {
      expect(trKeys).toContain(key);
    }
    for (const key of [
      'resume.void.title',
      'resume.void.body',
      'common.ok',
      'build.done',
      'tut.ctx.resume',
    ]) {
      expect(trKeys).toContain(key);
    }
  });
});

describe('t() (TECH 11.5)', () => {
  it('TECH 11.5 i18n {town} and {company} filled without caller params', () => {
    const dicts = {
      tr: { town: { name: 'Renkli Tepe' }, a: { b: '{town} Festivali {company}' } },
      en: { town: { name: 'Hue Hill' }, a: { b: '{town} festival by {company}' } },
    };
    expect(createTranslator('tr', dicts).tDynamic('a.b')).toBe('Renkli Tepe Festivali Minik Usta İnşaat');
    expect(createTranslator('en', dicts).tDynamic('a.b')).toBe('Hue Hill festival by Tuna & Co.');
    // Real data: the EN prologue uses {company}; TR writes the name in the line itself (STORY 4.0).
    expect(createTranslator('en').t('story.prologue.p3.tuna')).toBe(`${COMPANY_NAME.en} is open again!`);
    expect(createTranslator('tr').t('story.prologue.p3.tuna')).toBe('Minik Usta İnşaat yeniden açıldı!');
    expect(createTranslator('en').t('town.name')).toBe('Hue Hill');
    // The caller cannot pass a global placeholder.
    // @ts-expect-error town is global (STORY 0-10)
    expect(() => createTranslator('tr').t('lose.left', { town: 'X' })).toThrow(/global/);
  });

  it('TECH 11.5 numbers are formatted per locale and icon placeholders stay for the renderer', () => {
    expect(createTranslator('tr').t('lose.buygold', { n: 1350 })).toBe('Altın al · eksik {coin}1.350');
    expect(createTranslator('en').t('lose.buygold', { n: 1350 })).toBe('Get coins · {coin}1,350 short');
    expect(createTranslator('tr').t('lose.offer.count', { n: 2, max: 3 })).toBe('Teklif 2/3');
    expect(createTranslator('en').t('common.unlockAt', { n: 8 })).toBe('Unlocks at level 8');
    expect(createTranslator('tr').t('tut.l2.shadow')).toBe('Gölgede {ok} varsa yer doğru.');
  });

  it('TECH 11.5 plural nodes pick one/other with Intl.PluralRules', () => {
    const dicts = {
      tr: { x: { one: '{n} blok', other: '{n} blok' } },
      en: { x: { one: '{n} block', other: '{n} blocks' } },
    };
    const enT = createTranslator('en', dicts);
    expect(enT.tDynamic('x', { n: 1 })).toBe('1 block');
    expect(enT.tDynamic('x', { n: 4 })).toBe('4 blocks');
    expect(createTranslator('tr', dicts).tDynamic('x', { n: 4 })).toBe('4 blok');
    expect(flattenKeys(dicts.en)).toEqual(['x']);
  });

  it('CLAUDE.md upper case uses the locale (tr: i → İ)', () => {
    expect(createTranslator('tr').upper('bölümden çık? istif')).toBe('BÖLÜMDEN ÇIK? İSTİF');
    expect(createTranslator('en').upper('pick it')).toBe('PICK IT');
    setLocale('tr');
    expect(upper('kaldığın yerden devam')).toBe('KALDIĞIN YERDEN DEVAM');
  });

  it('TECH 11.5 module-level t follows setLocale; unknown dynamic key returns the key', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('exit.stay')).toBe('Stay');
    expect(tDynamic('tut.l1.lift')).toBe('Grab a block and lift it over the wall!');
    expect(tDynamic('tut.l99.none')).toBe('tut.l99.none');
    expect(hasKey('tut.ctx.support')).toBe(true);
    expect(hasKey('tut.ctx')).toBe(false);
    setLocale('tr');
    expect(t('exit.stay')).toBe('Kal');
    const key: I18nKey = 'resume.void.body';
    expect(t(key, { n: 18 })).toBe('Bölüm 18 baştan başlayacak. Harcadıkların geri verildi.');
    expect(Object.keys(DICTIONARIES)).toEqual(['tr', 'en']);
  });

  it('STORY 0-11 splitInline cuts icon runs out of a text', () => {
    expect(splitInline('Altın al · eksik {coin}1.350')).toEqual([
      { kind: 'text', text: 'Altın al · eksik ' },
      { kind: 'icon', icon: 'coin' },
      { kind: 'text', text: '1.350' },
    ]);
    expect(splitInline('{ok}')).toEqual([{ kind: 'icon', icon: 'ok' }]);
    expect(splitInline('Teklif {n}/3')).toEqual([{ kind: 'text', text: 'Teklif {n}/3' }]);
  });
});
