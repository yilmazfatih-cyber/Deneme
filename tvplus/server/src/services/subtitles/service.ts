/**
 * Altyazı servisi: kaynak (uzak VTT/TTML ya da content/subtitles altındaki dosya) → tik tabanlı TTML.
 * Dönüştürülen belgeler bellekte ve <dataDir>/ttml-cache altında saklanır; çevrimdışıyken disk önbelleği kullanılır.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppConfig } from '../../kernel/config'
import { upstreamText } from '../oca/upstream'
import { convertToTtml } from './convert'

export interface SubtitleSource {
  url?: string
  /** mutlak yerel yol */
  path?: string
  format: 'vtt' | 'ttml'
  lang: string
}

export interface TtmlDocument {
  ttml: string
  cues: number
}

export interface SubtitleService {
  /** TTML belgesini getirir (önbellek → dönüştürme). Kaynağa ulaşılamazsa hata fırlatır. */
  ttml(src: SubtitleSource): Promise<TtmlDocument>
}

/** Dönüştürücü sürümü: çıktı biçimi değişirse eski önbellek kendiliğinden geçersizleşir. */
const CONVERTER_VERSION = 1

export function createSubtitleService(config: AppConfig): SubtitleService {
  const dir = join(config.dataDir, 'ttml-cache')
  const memory = new Map<string, TtmlDocument>()
  const inflight = new Map<string, Promise<TtmlDocument>>()

  const keyOf = (src: SubtitleSource) =>
    createHash('sha1')
      .update(`${CONVERTER_VERSION}|${src.format}|${src.lang}|${src.url ?? ''}|${src.path ?? ''}`)
      .digest('hex')

  async function load(src: SubtitleSource, key: string): Promise<TtmlDocument> {
    const file = join(dir, `${key}.ttml`)
    // Yerel dosya her seferinde değişmiş olabilir; uzak kaynak için disk önbelleği kalıcıdır.
    if (src.url && existsSync(file)) {
      const ttml = readFileSync(file, 'utf8')
      const m = /<tvpm:cueCount>(\d+)<\/tvpm:cueCount>/.exec(ttml)
      return { ttml, cues: m ? Number(m[1]) : 0 }
    }
    let raw: string
    if (src.path) raw = await readFile(src.path, 'utf8')
    else if (src.url) raw = await upstreamText(config, src.url, 8000)
    else throw new Error('Altyazı kaynağı tanımsız')
    const doc = convertToTtml(raw, src.format, { lang: src.lang })
    if (src.url) {
      mkdirSync(dir, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, doc.ttml)
      renameSync(tmp, file)
    }
    return doc
  }

  return {
    async ttml(src) {
      const key = keyOf(src)
      const hit = memory.get(key)
      if (hit) return hit
      let p = inflight.get(key)
      if (!p) {
        p = load(src, key).finally(() => inflight.delete(key))
        inflight.set(key, p)
      }
      const doc = await p
      if (memory.size > 200) memory.delete(memory.keys().next().value!)
      memory.set(key, doc)
      return doc
    },
  }
}
