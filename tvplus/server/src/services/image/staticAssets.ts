/**
 * Durağan barındırma (GitHub Pages, `config.staticHost`) için görsel yardımcıları. Bu dosya sharp ve undici
 * İÇERMEZ: tarayıcıdaki sunucu (worker) da yükleyebilir.
 *
 * Adres düzeni `kernel/imageUrls.ts` içindedir (img/<tip>/<G>x<Y>/<varlık>.webp). Burada:
 *   · çalışma anında sayılamayan varlıkların (profil, günlük yayın) önceden üretilmiş bir varlığa eşlenmesi,
 *   · derleme betiğinin de kullandığı yollar (pages-assets kökü, altyazı ve çekim ana karesi yolları),
 *   · yalnız Node'da sınama kolaylığı: pages-assets'teki dosyaların sunucunun durağan dosya sunucusundan verilmesi.
 */
import type { FastifyInstance } from 'fastify'
import { parseEntityId } from '../../../../shared/tctx'
import type { ArtworkTypeName } from '../../kernel/imageUrls'
import { avatarKeyOf } from '../identity/avatars'

/** tvplus/ altındaki önceden üretilmiş dosyaların klasörü; içindeki yollar site yollarıdır. */
export const PAGES_ASSETS_DIR = 'pages-assets'
/** content/subtitles altındaki yerel altyazıların site yolu (göreli) */
export const STATIC_SUBTITLES_DIR = 'subtitles'

export const staticSubtitlePath = (file: string) =>
  `${STATIC_SUBTITLES_DIR}/${file.split('/').map(encodeURIComponent).join('/')}`

/** Videosuz yayının (program) önceden üretilen görsel varlığı: kanal + program adı. */
export const programEntityId = (channelId: number, title: string) => `Program:${channelId}:${title.trim()}`

interface AliasDeps {
  profileAvatar(guid: string): string | null
  airing(airingId: string): { channelId: number; title: string; videoId: number | null } | null
  hasVideo(videoId: number): boolean
}

/**
 * Çalışma anında çoğalan varlıkları derlemede sayılabilen varlıklara eşler:
 *   Profile:<guid> → Avatar:<anahtar> · Airing:<id> → Video:<videoId> ya da Program:<kanal>:<ad>
 * Tanınmayan her şey aynen döner.
 */
export function createStaticAlias(deps: AliasDeps) {
  return (entityId: string, _type: ArtworkTypeName): string => {
    const p = parseEntityId(entityId)
    if (!p) return entityId
    if (p.kind === 'Profile') {
      const key = deps.profileAvatar(p.id)
      return key ? `Avatar:${key}` : entityId
    }
    if (p.kind === 'Airing') {
      const a = deps.airing(p.id)
      if (!a) return entityId
      if (a.videoId !== null && deps.hasVideo(a.videoId)) return `Video:${a.videoId}`
      return programEntityId(a.channelId, a.title)
    }
    return entityId
  }
}

/** Uygulamanın servislerinden eşleyici (servisler istek anında okunur). */
export function staticAliasOf(app: FastifyInstance) {
  return createStaticAlias({
    profileAvatar(guid) {
      const p = app.services.identity?.getProfile(guid) ?? null
      return p ? avatarKeyOf(p.avatar) : null
    },
    airing(id) {
      const a = app.services.epg?.getAiring(id) ?? null
      return a ? { channelId: a.channelId, title: a.title, videoId: a.videoId } : null
    },
    hasVideo: (videoId) => !!app.services.catalog?.videoInfo(videoId),
  })
}

/**
 * Yalnız Node sunucusunda (sınama): pages-assets/img → /img/*, pages-assets/subtitles → /subtitles/*.
 * Tarayıcıdaki worker'da bu dosyaları GitHub Pages verir; Node modülleri yoksa sessizce atlanır.
 */
export async function serveStaticAssetsForTesting(app: FastifyInstance): Promise<void> {
  try {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fastifyStatic = (await import('@fastify/static')).default
    const root = join(app.config.rootDir, PAGES_ASSETS_DIR)
    for (const dir of ['img', STATIC_SUBTITLES_DIR]) {
      const abs = join(root, dir)
      if (!existsSync(abs)) {
        app.log.warn(
          { dir: abs },
          'durağan kip: önceden üretilmiş dosya klasörü yok (npx tsx scripts/build-pages-assets.ts)',
        )
        continue
      }
      await app.register(fastifyStatic, {
        root: abs,
        prefix: `/${dir}/`,
        decorateReply: false,
        index: false,
        cacheControl: false,
        setHeaders: (res) => {
          res.header('cache-control', 'public, max-age=3600')
          // Altyazıyı oynatıcı fetch ile okur; GitHub Pages da `access-control-allow-origin: *` verir
          res.header('access-control-allow-origin', '*')
        },
      })
    }
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'durağan kip: pages-assets sunulamadı')
  }
}
