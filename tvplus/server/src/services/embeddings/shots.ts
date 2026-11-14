/**
 * Depodaki çekim çözümlemesi dosyalarını (content/shots) okur ve katalogla birleştirip sağlayıcı girdisini kurar.
 * Ağ yok, ffmpeg yok: yalnız JSON okunur. Çözümlemesi olmayan yaprak tek bir "yalnız metin" sözde çekimiyle temsil edilir.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentTitle } from '../../../../shared/content-schema'
import type { EffectiveTags } from '../../../../shared/intelligence'
import {
  KEYFRAMES_FILE,
  SHOTS_DIR,
  STILL_SPANS,
  zKeyframesFile,
  zSceneDetectFile,
  type ShotFlag,
  type ShotRecord,
  type SpriteInfo,
} from '../../../../shared/shots-schema'
import type { CatalogService, PlayableVideo } from '../../kernel/services'
import type { EmbeddingInput, ShotInput, ShotMethod } from './provider'

export interface VideoShots {
  videoId: number
  titleId: number
  method: ShotMethod
  durationSec: number | null
  shots: ShotRecord[]
  sprite: SpriteInfo | null
  flags: ShotFlag[]
}

export interface ShotIndexLoad {
  videos: Map<number, VideoShots>
  /** Okunamayan / şemaya uymayan dosyalar */
  problems: { file: string; reason: string }[]
}

/** content/shots altındaki tüm dosyaları okur (SCENE_DETECT dosyaları KEYFRAMES kaydının önüne geçer). */
export function loadShotIndex(contentDir: string): ShotIndexLoad {
  const dir = join(contentDir, SHOTS_DIR)
  const videos = new Map<number, VideoShots>()
  const problems: ShotIndexLoad['problems'] = []
  if (!existsSync(dir)) return { videos, problems }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  const kf = files.indexOf(KEYFRAMES_FILE)
  if (kf >= 0) {
    try {
      const f = zKeyframesFile.parse(JSON.parse(readFileSync(join(dir, KEYFRAMES_FILE), 'utf8')))
      for (const v of f.videos)
        videos.set(v.videoId, {
          videoId: v.videoId,
          titleId: v.titleId,
          method: 'KEYFRAMES',
          durationSec: v.durationSec,
          shots: v.shots,
          sprite: f.sprite,
          flags: v.flags,
        })
    } catch (e) {
      problems.push({ file: KEYFRAMES_FILE, reason: e instanceof Error ? e.message.slice(0, 300) : String(e) })
    }
  }
  for (const name of files) {
    if (name === KEYFRAMES_FILE) continue
    try {
      const f = zSceneDetectFile.parse(JSON.parse(readFileSync(join(dir, name), 'utf8')))
      videos.set(f.videoId, {
        videoId: f.videoId,
        titleId: f.titleId,
        method: 'SCENE_DETECT',
        durationSec: f.durationSec,
        shots: f.shots,
        sprite: f.sprite,
        flags: f.flags,
      })
    } catch (e) {
      problems.push({ file: name, reason: e instanceof Error ? e.message.slice(0, 300) : String(e) })
    }
  }
  return { videos, problems }
}

/** Başlık vektörüne giren yapraklar: filmde kendisi, dizide bölümler (fragman / ek videolar hariç). */
export function embeddablePlayables(catalog: CatalogService, title: ContentTitle): PlayableVideo[] {
  return catalog.listPlayables(title.videoId).filter((p) => p.kind === 'MOVIE' || p.kind === 'EPISODE')
}

/** Çekimin zaman aralığı: dosyada yoksa (süre bilinmiyordu) katalog süresi ve kare dilimiyle doldurulur. */
export function shotSpan(shot: ShotRecord, durationSec: number | null): [number, number] {
  if (shot.s !== null && shot.e !== null) return [shot.s, shot.e]
  if (durationSec && shot.src) {
    const [a, b] = STILL_SPANS[shot.src]
    return [Math.round(a * durationSec * 10) / 10, Math.round(b * durationSec * 10) / 10]
  }
  if (durationSec && shot.v === null) return [0, durationSec]
  return [0, 0]
}

/** Yaprağın kendi özeti (bölüm / ek video); film için boş (filmin özeti genel bağlamdadır). */
export function videoTextOf(catalog: CatalogService, videoId: number): string {
  const info = catalog.videoInfo(videoId)
  return info?.episode?.data.synopsis ?? info?.supplemental?.synopsis ?? ''
}

/** Sağlayıcı girdisi: çekimler + genel bağlam. */
export function buildInput(
  catalog: CatalogService,
  title: ContentTitle,
  playable: PlayableVideo,
  tags: EffectiveTags | null,
  rec: VideoShots | null,
): EmbeddingInput {
  const durationSec = rec?.durationSec ?? playable.runtimeSec ?? null
  const shots: ShotInput[] = rec
    ? rec.shots.map((s, i) => {
        const [startSec, endSec] = shotSpan(s, durationSec)
        return { index: i, startSec, endSec, visual: s.v, audio: s.a, text: s.t }
      })
    : [{ index: 0, startSec: 0, endSec: durationSec ?? 0, visual: null, audio: null, text: '' }]
  return {
    videoId: playable.videoId,
    titleId: title.videoId,
    method: rec?.method ?? 'KEYFRAMES',
    durationSec,
    videoText: videoTextOf(catalog, playable.videoId),
    shots,
    context: {
      titleId: title.videoId,
      type: title.type,
      title: title.title,
      synopsis: title.synopsis,
      genres: [...title.genres],
      moods: [...title.moods],
      keywords: [...title.keywords],
      tags: {
        basis: tags?.basis ?? 'NONE',
        scales: { ...(tags?.scales ?? {}) },
        facets: Object.fromEntries(Object.entries(tags?.facets ?? {}).map(([k, v]) => [k, [...v].sort()])),
        descriptors: [...(tags?.descriptors ?? [])].sort(),
      },
    },
  }
}

/** Girdinin kararlı JSON'u (anahtarlar sıralı) — içerik özeti için. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}
