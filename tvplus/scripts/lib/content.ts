/**
 * İçerik dosyalarını ham (doğrulanmamış) JSON olarak okuma ve içerikteki kaynakları gezme yardımcıları.
 * Ham okuma, dosyayı yeniden yazarken zod varsayılanlarının dosyaya sızmaması içindir.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTENT_FILES, type ContentSource } from '../../shared/content-schema'

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const defaultContentDir = () => process.env.TVP_CONTENT_DIR ?? join(ROOT_DIR, 'content')

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export type JsonObject = { [k: string]: Json }

export const isObj = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

export function readJson(file: string): Json {
  return JSON.parse(readFileSync(file, 'utf8')) as Json
}
/** 2 boşluk girintili, sonda satır sonu: içerik ekibinin biçimi. */
export function writeJson(file: string, value: Json): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** titles/ altındaki .json dosyaları, ada göre sıralı (mutlak yol). */
export function titleFiles(contentDir: string): string[] {
  const dir = join(contentDir, CONTENT_FILES.titlesDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort()
    .map((f) => join(dir, f))
}

/** İçerikteki bir kaynağın yeri: dosya + JSON yolu + sahibi (videoId / channelId). */
export interface SourceRef {
  file: string
  path: string
  ownerKind: 'title' | 'episode' | 'supplemental' | 'promo' | 'channel'
  ownerId: number
  source: ContentSource
}

/**
 * Ham içerikte gezinir ve "type" alanı olan her kaynak nesnesini verir (doğrulanmış şemadaki konumlarla aynı:
 * title.sources, title.promo.source, seasons[].episodes[].sources, supplementals[].sources, channel.source).
 */
export function collectSources(contentDir: string): SourceRef[] {
  const out: SourceRef[] = []
  const asSource = (v: Json | undefined): ContentSource | null =>
    isObj(v) && typeof v.type === 'string' ? (v as unknown as ContentSource) : null
  const num = (v: Json | undefined) => (typeof v === 'number' ? v : 0)
  const rel = (f: string) => f.slice(contentDir.length + 1)
  for (const file of titleFiles(contentDir)) {
    let data: Json
    try {
      data = readJson(file)
    } catch {
      continue
    }
    if (!Array.isArray(data)) continue
    data.forEach((t, ti) => {
      if (!isObj(t)) return
      const tid = num(t.videoId)
      const push = (arr: Json | undefined, base: string, ownerKind: SourceRef['ownerKind'], ownerId: number) => {
        if (!Array.isArray(arr)) return
        arr.forEach((s, si) => {
          const src = asSource(s)
          if (src) out.push({ file: rel(file), path: `${base}[${si}]`, ownerKind, ownerId, source: src })
        })
      }
      push(t.sources, `[${ti}].sources`, 'title', tid)
      if (isObj(t.promo)) {
        const src = asSource(t.promo.source)
        if (src)
          out.push({ file: rel(file), path: `[${ti}].promo.source`, ownerKind: 'promo', ownerId: tid, source: src })
      }
      if (Array.isArray(t.seasons))
        t.seasons.forEach((season, si) => {
          if (!isObj(season) || !Array.isArray(season.episodes)) return
          season.episodes.forEach((ep, ei) => {
            if (isObj(ep))
              push(ep.sources, `[${ti}].seasons[${si}].episodes[${ei}].sources`, 'episode', num(ep.videoId))
          })
        })
      if (Array.isArray(t.supplementals))
        t.supplementals.forEach((sp, si) => {
          if (isObj(sp)) push(sp.sources, `[${ti}].supplementals[${si}].sources`, 'supplemental', num(sp.videoId))
        })
    })
  }
  const chFile = join(contentDir, CONTENT_FILES.channels)
  if (existsSync(chFile)) {
    try {
      const data = readJson(chFile)
      if (Array.isArray(data))
        data.forEach((c, ci) => {
          if (!isObj(c)) return
          const src = asSource(c.source)
          if (src)
            out.push({
              file: CONTENT_FILES.channels,
              path: `[${ci}].source`,
              ownerKind: 'channel',
              ownerId: num(c.channelId),
              source: src,
            })
        })
    } catch {
      /* bozuk dosya: doğrulayıcı raporlar */
    }
  }
  return out
}

/** Türkçe başlıktan slug: "Gökyüzünün Işığı" → "gokyuzunun-isigi". */
export function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

/** İçerikte kullanılan tüm videoId'ler (başlık, bölüm, ek video) — yeni kimlik ayırmak için. */
export function usedVideoIds(contentDir: string): Set<number> {
  const ids = new Set<number>()
  const walk = (v: Json) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (isObj(v)) {
      if (typeof v.videoId === 'number') ids.add(v.videoId)
      Object.values(v).forEach(walk)
    }
  }
  for (const f of titleFiles(contentDir)) {
    try {
      walk(readJson(f))
    } catch {
      /* yoksay */
    }
  }
  return ids
}

/** [from, to] aralığında kullanılmayan ilk `count` kimlik. */
export function allocateIds(used: Set<number>, from: number, to: number, count: number): number[] {
  const out: number[] = []
  for (let id = from; id <= to && out.length < count; id++) if (!used.has(id)) out.push(id)
  return out
}
