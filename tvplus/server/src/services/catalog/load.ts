/**
 * İçerik yükleyici: content/ altındaki JSON dosyalarını Zod şemasıyla doğrular.
 * Hoşgörülü çalışır — içerik ekibi dosyaları eşzamanlı yazdığı için:
 *   · klasör ya da dosya yoksa boş liste (katalog boş açılır),
 *   · JSON bozuksa dosya atlanır ve açık bir hata günlüğe yazılır,
 *   · dosya dizi olarak geçerli ama tek tek kayıtlar hatalıysa yalnızca hatalı kayıtlar atlanır.
 * Sunucu hiçbir içerik hatasında çökmez.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { z } from 'zod'
import {
  CONTENT_FILES,
  zChannel,
  zCollection,
  zEpgTemplate,
  zHomeLayout,
  zInterstitial,
  zTitle,
  type ContentChannel,
  type ContentCollection,
  type ContentEpgTemplate,
  type ContentHomeLayout,
  type ContentTitle,
} from '../../../../shared/content-schema'
import type { InterstitialRecord } from '../../kernel/services'

export type ContentLogLevel = 'error' | 'warn' | 'info'
export type ContentLog = (level: ContentLogLevel, message: string) => void

export interface ContentBundle {
  /** Her başlık hangi dosyadan geldi (hata iletileri için) */
  titles: { title: ContentTitle; file: string }[]
  channels: ContentChannel[]
  epg: ContentEpgTemplate[]
  collections: ContentCollection[]
  homeLayout: ContentHomeLayout | null
  interstitials: InterstitialRecord[]
}

function formatIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') : '(kök)'}: ${i.message}`)
    .join('; ')
}

/** Dosyayı okur ve JSON olarak ayrıştırır. Yoksa ya da bozuksa null (bozuksa hata günlüğe yazılır). */
function readJson(file: string, log: ContentLog, required: boolean): unknown {
  if (!existsSync(file)) {
    log(required ? 'warn' : 'info', `İçerik dosyası yok, boş sayılıyor: ${file}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch (e) {
    log('error', `İçerik dosyası okunamadı, atlanıyor: ${file} — ${(e as Error).message}`)
    return null
  }
}

/** Dizi dosyasını kayıt kayıt doğrular; geçersiz kayıtları atlar. */
function validateList<S extends z.ZodType>(file: string, raw: unknown, item: S, log: ContentLog): z.output<S>[] {
  if (raw === null) return []
  if (!Array.isArray(raw)) {
    log('error', `İçerik dosyası dizi değil, atlanıyor: ${file}`)
    return []
  }
  const out: z.output<S>[] = []
  raw.forEach((entry: unknown, i) => {
    const r = item.safeParse(entry)
    if (r.success) out.push(r.data)
    else {
      const label =
        typeof entry === 'object' && entry && 'videoId' in entry ? ` (videoId ${String(entry.videoId)})` : ''
      log('error', `Geçersiz içerik kaydı atlandı: ${file} [${i}]${label} — ${formatIssues(r.error)}`)
    }
  })
  return out
}

export function loadContent(contentDir: string, log: ContentLog): ContentBundle {
  const bundle: ContentBundle = {
    titles: [],
    channels: [],
    epg: [],
    collections: [],
    homeLayout: null,
    interstitials: [],
  }
  if (!existsSync(contentDir)) {
    log('warn', `İçerik klasörü yok, katalog boş: ${contentDir}`)
    return bundle
  }

  const titlesDir = join(contentDir, CONTENT_FILES.titlesDir)
  if (existsSync(titlesDir) && statSync(titlesDir).isDirectory()) {
    const files = readdirSync(titlesDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    for (const f of files) {
      const path = join(titlesDir, f)
      for (const title of validateList(path, readJson(path, log, true), zTitle, log))
        bundle.titles.push({ title, file: f })
    }
  } else log('warn', `Başlık klasörü yok: ${titlesDir}`)

  const at = (name: string) => join(contentDir, name)
  bundle.channels = validateList(
    at(CONTENT_FILES.channels),
    readJson(at(CONTENT_FILES.channels), log, true),
    zChannel,
    log,
  )
  bundle.epg = validateList(at(CONTENT_FILES.epg), readJson(at(CONTENT_FILES.epg), log, false), zEpgTemplate, log)
  bundle.collections = validateList(
    at(CONTENT_FILES.collections),
    readJson(at(CONTENT_FILES.collections), log, false),
    zCollection,
    log,
  )
  bundle.interstitials = validateList(
    at(CONTENT_FILES.interstitials),
    readJson(at(CONTENT_FILES.interstitials), log, false),
    zInterstitial,
    log,
  )

  const layoutRaw = readJson(at(CONTENT_FILES.homeLayout), log, false)
  if (layoutRaw !== null) {
    const r = zHomeLayout.safeParse(layoutRaw)
    if (r.success) bundle.homeLayout = r.data
    else
      log('error', `Ana sayfa düzeni geçersiz, atlanıyor: ${at(CONTENT_FILES.homeLayout)} — ${formatIssues(r.error)}`)
  }
  return bundle
}
