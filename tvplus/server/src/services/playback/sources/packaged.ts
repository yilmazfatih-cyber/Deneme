/**
 * Yerelde paketlenmiş içerik (`npm run package:title`): <mediaDir>/packaged/<id>/index.json.
 * Biçimi paketleyici (scripts/package-title.ts) yazar; burada okunur ve doğrulanır.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { z } from 'zod'

const zRange = z.object({ start: z.number().int().min(0), end: z.number().int().min(0) })

export const zPackagedStream = z.object({
  /** index.json ile aynı klasördeki dosya adı */
  file: z.string().regex(/^[\w.-]+$/),
  type: z.enum(['video', 'audio']),
  mimeType: z.enum(['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4']),
  codecs: z.string(),
  profile: z.enum(['vp9-webm', 'h264-mp4', 'opus-webm', 'aac-mp4']),
  /** ortalama bit hızı (kbit/sn) */
  bitrateKbps: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  language: z.string().optional(),
  channels: z.number().int().positive().optional(),
  init: zRange,
  index: zRange,
  durationSec: z.number().positive(),
  /** dizindeki parça sayısı (bilgi amaçlı) */
  segments: z.number().int().positive(),
})
export const zPackagedIndex = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  createdAt: z.string(),
  durationSec: z.number().positive(),
  gopSec: z.number().positive(),
  source: z.string(),
  streams: z.array(zPackagedStream).min(1),
})
export type PackagedStream = z.infer<typeof zPackagedStream>
export type PackagedIndex = z.infer<typeof zPackagedIndex>

export function packagedDir(mediaDir: string, id: string): string {
  return join(mediaDir, 'packaged', id)
}

export interface LoadedPackage {
  index: PackagedIndex
  /** dosya adı → mutlak yol */
  paths: Map<string, string>
}

/** index.json'u okur; dosyalar yoksa ya da boyları tutmuyorsa null. */
export function loadPackaged(mediaDir: string, id: string): LoadedPackage | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null
  const dir = resolve(packagedDir(mediaDir, id))
  const file = join(dir, 'index.json')
  if (!existsSync(file)) return null
  let index: PackagedIndex
  try {
    index = zPackagedIndex.parse(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
  const paths = new Map<string, string>()
  for (const s of index.streams) {
    const p = resolve(dir, s.file)
    if (!p.startsWith(dir + sep)) return null
    try {
      if (statSync(p).size !== s.sizeBytes) return null
    } catch {
      return null
    }
    paths.set(s.file, p)
  }
  return { index, paths }
}
