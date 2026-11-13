/**
 * SENTETİK Mixpanel dışa aktarımı üretir (gerçek veri değildir; hattı denemek içindir).
 *
 *   npm run sample:viewing -- --viewers 1500 --days 90 --seed 7 --out /tmp/ornek.jsonl[.gz] [--end YYYY-MM-DD]
 *
 * Dosya Mixpanel ham dışa aktarım biçimindedir; `npm run mixpanel:import -- --file <dosya>` ile içe alınabilir
 * (o zaman MIXPANEL kaynağına girer — sentetik kaynağa almak için POST /api/studio/sources/synthetic/generate).
 * Aynı tohum ve aynı bitiş günü bayt bayt aynı dosyayı verir.
 */
import { createWriteStream } from 'node:fs'
import { PassThrough, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { loadContent } from '../server/src/services/catalog/load'
import { generateSyntheticExport, istanbulToday, SYNTHETIC_LIMITS } from '../server/src/services/mixpanel/synthetic'
import { defaultContentDir } from './lib/content'
import { isMain } from './lib/net'

export interface SampleArgs {
  viewers: number
  days: number
  seed: number
  out: string
  end: string
}

/** Komut satırı → seçenekler; hatalıysa Türkçe hata metni fırlatır. */
export function parseSampleArgs(argv: string[], today = istanbulToday()): SampleArgs {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const int = (name: string, def: number, min: number, max: number): number => {
    const v = get(name)
    if (v === undefined) return def
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} ${min}–${max} arası bir tam sayı olmalı`)
    return n
  }
  const out = get('out')
  if (!out) throw new Error('--out <dosya.jsonl[.gz]> gerekli')
  const end = get('end') ?? today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(Date.parse(`${end}T00:00:00Z`)))
    throw new Error("--end 'YYYY-MM-DD' biçiminde olmalı")
  return {
    viewers: int('viewers', 1500, 1, SYNTHETIC_LIMITS.maxViewers),
    days: int('days', 90, 1, SYNTHETIC_LIMITS.maxDays),
    seed: int('seed', 7, 0, 2 ** 31 - 1),
    out,
    end,
  }
}

/** Dosyayı yazar; satır ve bayt sayısını döner. */
export async function writeSample(
  args: SampleArgs,
  contentDir = defaultContentDir(),
): Promise<{ lines: number; bytes: number; ms: number }> {
  const t0 = Date.now()
  const bundle = loadContent(contentDir, (level, msg) => {
    if (level === 'error') console.error(msg)
  })
  const titles = bundle.titles.map((t) => t.title)
  if (!titles.length) throw new Error(`Katalogda başlık yok: ${contentDir}`)
  let lines = 0
  let bytes = 0
  const counted = async function* () {
    for await (const chunk of generateSyntheticExport(titles, args)) {
      lines += chunk.split('\n').length - 1
      bytes += Buffer.byteLength(chunk)
      yield chunk
    }
  }
  const gz = args.out.endsWith('.gz')
  await pipeline(Readable.from(counted()), gz ? createGzip() : new PassThrough(), createWriteStream(args.out))
  return { lines, bytes, ms: Date.now() - t0 }
}

if (isMain(import.meta.url)) {
  try {
    const args = parseSampleArgs(process.argv.slice(2))
    const r = await writeSample(args)
    console.log(
      `SENTETİK örnek yazıldı: ${args.out} — ${r.lines} satır, ${(r.bytes / 1024 / 1024).toFixed(1)} MB (açık), ${args.viewers} izleyici × ${args.days} gün (bitiş ${args.end}), tohum ${args.seed}, ${r.ms} ms`,
    )
  } catch (e) {
    console.error(`Hata: ${(e as Error).message}`)
    process.exit(1)
  }
}
