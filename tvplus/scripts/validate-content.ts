/**
 * İçerik doğrulayıcı (`npm run validate:content [klasör]`).
 * 1) Her içerik dosyasını zod şemasıyla okur (shared/content-schema.ts).
 * 2) Dosyalar arası tutarlılığı denetler: benzersiz kimlikler, kırık başvurular, altyazı dosyaları, çocuk içeriği.
 * Hata varsa çıkış kodu 1'dir. Eksik isteğe bağlı dosya yalnızca uyarıdır.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { z } from 'zod'
import {
  CONTENT_FILES,
  zChannelsFile,
  zCollectionsFile,
  zEpgFile,
  zHomeLayout,
  zInterstitialsFile,
  zNotificationsFile,
  zTitle,
  type ContentChannel,
  type ContentCollection,
  type ContentEpgTemplate,
  type ContentHomeLayout,
  type ContentSource,
  type ContentTitle,
} from '../shared/content-schema'
import { GENRES } from '../shared/taxonomy'
import { defaultContentDir, titleFiles } from './lib/content'
import { isMain } from './lib/net'

export interface ContentIssue {
  file: string
  /** JSON yolu, ör. "[3].seasons[0].episodes[1].sources[0]" */
  path: string
  message: string
}
export interface ContentStats {
  titles: number
  movies: number
  shows: number
  seasons: number
  episodes: number
  supplementals: number
  channels: number
  epgTemplates: number
  collections: number
  homeRows: number
  notifications: number
  interstitials: number
  /** Oynatma kaynakları türe göre (başlık/bölüm/ek video/kanal kaynakları; önizleme hariç) */
  bySourceKind: Record<string, number>
}
export interface ContentReport {
  errors: ContentIssue[]
  warnings: ContentIssue[]
  stats: ContentStats
}

type NotificationSeed = z.infer<typeof zNotificationsFile>[number]
type Interstitial = z.infer<typeof zInterstitialsFile>[number]

/** Yalnızca "dizi mi" denetimi; öğeler ayrıca zTitle ile doğrulanır. */
const zLooseArray = z.array(z.unknown())

const fmtPath = (p: readonly PropertyKey[]) =>
  p
    .map((k) => (typeof k === 'number' ? `[${k}]` : `.${String(k)}`))
    .join('')
    .replace(/^\./, '') || '(kök)'

export function validateContent(dir: string): ContentReport {
  const errors: ContentIssue[] = []
  const warnings: ContentIssue[] = []
  const err = (file: string, path: string, message: string) => errors.push({ file, path, message })
  const warn = (file: string, path: string, message: string) => warnings.push({ file, path, message })
  const stats: ContentStats = {
    titles: 0,
    movies: 0,
    shows: 0,
    seasons: 0,
    episodes: 0,
    supplementals: 0,
    channels: 0,
    epgTemplates: 0,
    collections: 0,
    homeRows: 0,
    notifications: 0,
    interstitials: 0,
    bySourceKind: {},
  }

  if (
    !existsSync(dir) ||
    (statSync(dir).isDirectory() && readdirSync(dir).filter((f) => !f.startsWith('.')).length === 0)
  ) {
    warn('', '', `İçerik klasörü boş ya da yok: ${dir}`)
    return { errors, warnings, stats }
  }

  /** Dosyayı okur ve şemayla doğrular; yoksa uyarı, bozuksa hata verir, ikisinde de null döner. */
  function load<T>(rel: string, schema: z.ZodType<T>, required = false): T | null {
    const file = join(dir, rel)
    if (!existsSync(file)) {
      if (required) err(rel, '', 'Dosya yok')
      else warn(rel, '', 'Dosya yok (isteğe bağlı)')
      return null
    }
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      err(rel, '', `JSON okunamadı: ${(e as Error).message}`)
      return null
    }
    const res = schema.safeParse(raw)
    if (!res.success) {
      for (const issue of res.error.issues.slice(0, 50)) err(rel, fmtPath(issue.path), issue.message)
      if (res.error.issues.length > 50) err(rel, '', `… ve ${res.error.issues.length - 50} şema hatası daha`)
      return null
    }
    return res.data
  }

  /* ───────── Başlıklar ───────── */
  interface Located<T> {
    file: string
    path: string
    value: T
  }
  const titles: Located<ContentTitle>[] = []
  /** Şemadan geçemeyen başlıkların (ve bölümlerinin) kimlikleri: hataları zaten raporlandı, başvurular zincirleme hata vermesin. */
  const brokenIds = new Set<number>()
  const collectIds = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collectIds)
    else if (typeof v === 'object' && v !== null)
      for (const [k, x] of Object.entries(v)) {
        if (k === 'videoId' && typeof x === 'number') brokenIds.add(x)
        else collectIds(x)
      }
  }
  const tFiles = titleFiles(dir)
  if (tFiles.length === 0) warn(CONTENT_FILES.titlesDir, '', 'Başlık dosyası yok')
  for (const abs of tFiles) {
    const rel = relative(dir, abs)
    // Öğe öğe doğrulanır: tek bozuk başlık, dosyadaki diğerlerini (ve onlara başvuranları) hataya sürüklemesin.
    const raw = load<unknown[]>(rel, zLooseArray)
    if (!raw) continue
    raw.forEach((item, i) => {
      const res = zTitle.safeParse(item)
      if (res.success) titles.push({ file: rel, path: `[${i}]`, value: res.data })
      else {
        collectIds(item)
        for (const issue of res.error.issues.slice(0, 20))
          err(
            rel,
            `[${i}]${fmtPath(issue.path) === '(kök)' ? '' : fmtPath(issue.path).replace(/^(?!\[)/, '.')}`,
            issue.message,
          )
      }
    })
  }

  // videoId → nerede (başlık/bölüm/ek video)
  type VideoKind = 'MOVIE' | 'SHOW' | 'EPISODE' | 'SUPPLEMENTAL'
  const videos = new Map<number, { kind: VideoKind; file: string; path: string; kids: boolean }>()
  const slugs = new Map<string, string>()
  const genresUsed = new Set<string>()
  const allSources: { file: string; path: string; source: ContentSource; countStat: boolean }[] = []

  const registerVideo = (id: number, kind: VideoKind, file: string, path: string, kids: boolean) => {
    const prev = videos.get(id)
    if (prev) err(file, `${path}.videoId`, `videoId ${id} yinelenmiş (ilk: ${prev.file} ${prev.path})`)
    else videos.set(id, { kind, file, path, kids })
  }

  for (const { file, path, value: t } of titles) {
    stats.titles++
    if (t.type === 'MOVIE') stats.movies++
    else stats.shows++
    registerVideo(t.videoId, t.type, file, path, t.kids)
    const prevSlug = slugs.get(t.slug)
    if (prevSlug) err(file, `${path}.slug`, `slug "${t.slug}" yinelenmiş (ilk: ${prevSlug})`)
    else slugs.set(t.slug, `${file} ${path}`)
    t.genres.forEach((g) => genresUsed.add(g))

    if (t.kids && t.maturity.rating !== 'GENEL' && t.maturity.rating !== '7+')
      err(file, `${path}.maturity.rating`, `Çocuk başlığı GENEL ya da 7+ olmalı (şu an ${t.maturity.rating})`)

    t.sources.forEach((s, i) => allSources.push({ file, path: `${path}.sources[${i}]`, source: s, countStat: true }))
    if (t.promo) allSources.push({ file, path: `${path}.promo.source`, source: t.promo.source, countStat: false })

    if (t.type === 'MOVIE') {
      if (t.sources.length === 0) err(file, `${path}.sources`, 'Filmde en az bir oynatma kaynağı olmalı')
      if (t.seasons.length > 0) warn(file, `${path}.seasons`, 'Filmde sezon tanımlı; yok sayılır')
    } else {
      if (t.seasons.length === 0) err(file, `${path}.seasons`, 'Dizide en az bir sezon olmalı')
      if (t.sources.length > 0)
        warn(file, `${path}.sources`, 'Dizinin kaynağı bölümlerdedir; üst düzey kaynak yok sayılır')
      const seasonNos = new Set<number>()
      t.seasons.forEach((s, si) => {
        stats.seasons++
        const sp = `${path}.seasons[${si}]`
        if (seasonNos.has(s.number)) warn(file, `${sp}.number`, `Sezon numarası ${s.number} yinelenmiş`)
        seasonNos.add(s.number)
        if (s.episodes.length === 0) err(file, `${sp}.episodes`, 'Sezonda bölüm yok')
        const epNos = new Set<number>()
        s.episodes.forEach((e, ei) => {
          stats.episodes++
          const ep = `${sp}.episodes[${ei}]`
          registerVideo(e.videoId, 'EPISODE', file, ep, t.kids)
          if (epNos.has(e.number)) warn(file, `${ep}.number`, `Bölüm numarası ${e.number} yinelenmiş`)
          epNos.add(e.number)
          if (e.sources.length === 0) err(file, `${ep}.sources`, 'Bölümde oynatma kaynağı yok')
          e.sources.forEach((src, i) =>
            allSources.push({ file, path: `${ep}.sources[${i}]`, source: src, countStat: true }),
          )
        })
      })
    }
    t.supplementals.forEach((s, si) => {
      stats.supplementals++
      const sp = `${path}.supplementals[${si}]`
      registerVideo(s.videoId, 'SUPPLEMENTAL', file, sp, t.kids)
      s.sources.forEach((src, i) =>
        allSources.push({ file, path: `${sp}.sources[${i}]`, source: src, countStat: true }),
      )
    })
  }

  /* ───────── Kanallar ───────── */
  const channels = load<ContentChannel[]>(CONTENT_FILES.channels, zChannelsFile) ?? []
  const channelIds = new Map<number, string>()
  const channelNumbers = new Map<number, string>()
  const channelSlugs = new Map<string, string>()
  channels.forEach((c, i) => {
    stats.channels++
    const f = CONTENT_FILES.channels
    const p = `[${i}]`
    const dupe = <K extends number | string>(m: Map<K, string>, key: K, field: string, label: string) => {
      const prev = m.get(key)
      if (prev !== undefined) err(f, `${p}.${field}`, `${label} ${key} yinelenmiş (ilk: ${prev})`)
      else m.set(key, p)
    }
    dupe(channelIds, c.channelId, 'channelId', 'Kanal kimliği')
    dupe(channelNumbers, c.number, 'number', 'Kanal numarası')
    dupe(channelSlugs, c.slug, 'slug', 'Kanal slug')
    allSources.push({ file: f, path: `${p}.source`, source: c.source, countStat: true })
    if (c.source.type === 'LINEAR')
      c.source.playlist.forEach((vid, vi) => {
        const v = videos.get(vid)
        if (!v) {
          if (!brokenIds.has(vid))
            err(f, `${p}.source.playlist[${vi}]`, `Çalma listesindeki videoId ${vid} katalogda yok`)
        } else if (v.kind === 'SHOW')
          warn(
            f,
            `${p}.source.playlist[${vi}]`,
            `videoId ${vid} bir dizi; doğrusal kanalda bölüm kimlikleri tercih edilmeli`,
          )
        else if (c.kids && !v.kids)
          warn(f, `${p}.source.playlist[${vi}]`, `Çocuk kanalında çocuk içeriği olmayan video (${vid})`)
      })
    if (c.logo && !/^https?:/.test(c.logo)) {
      const pub = join(dir, '..', 'web', 'public')
      const found = [join(pub, c.logo), join(pub, 'brand', 'channels', c.logo), join(pub, 'brand', c.logo)].some((x) =>
        existsSync(x),
      )
      if (existsSync(pub) && !found)
        warn(f, `${p}.logo`, `Logo dosyası bulunamadı: ${c.logo} (baş harflerden logo üretilecek)`)
    }
  })

  /* ───────── Kaynaklar: istatistik + altyazı dosyaları ───────── */
  const subsDir = join(dir, CONTENT_FILES.subtitlesDir)
  for (const { file, path, source, countStat } of allSources) {
    if (countStat) stats.bySourceKind[source.type] = (stats.bySourceKind[source.type] ?? 0) + 1
    if (source.type === 'DASH' || source.type === 'PACKAGED' || source.type === 'PROGRESSIVE')
      source.timedText.forEach((tt, i) => {
        const tp = `${path}.timedText[${i}]`
        if (!tt.url && !tt.file) err(file, tp, 'Altyazıda "url" ya da "file" olmalı')
        if (tt.file) {
          if (tt.file.includes('..')) err(file, `${tp}.file`, 'Altyazı dosya adı klasör dışına çıkamaz')
          else if (!existsSync(join(subsDir, tt.file)))
            err(file, `${tp}.file`, `Altyazı dosyası yok: ${CONTENT_FILES.subtitlesDir}/${tt.file}`)
        }
      })
    if (source.type === 'LINEAR' && !file.startsWith(CONTENT_FILES.channels))
      warn(file, path, 'LINEAR kaynak yalnızca kanallarda anlamlıdır')
  }

  /* ───────── Yayın akışı ───────── */
  const epg = load<ContentEpgTemplate[]>(CONTENT_FILES.epg, zEpgFile) ?? []
  const epgChannels = new Set<number>()
  epg.forEach((tpl, i) => {
    stats.epgTemplates++
    const f = CONTENT_FILES.epg
    if (!channelIds.has(tpl.channelId)) err(f, `[${i}].channelId`, `Kanal ${tpl.channelId} channels.json'da yok`)
    if (epgChannels.has(tpl.channelId))
      warn(f, `[${i}].channelId`, `Kanal ${tpl.channelId} için birden çok akış şablonu`)
    epgChannels.add(tpl.channelId)
    tpl.programs.forEach((pr, pi) => {
      if (pr.videoId !== undefined && !videos.has(pr.videoId) && !brokenIds.has(pr.videoId))
        err(f, `[${i}].programs[${pi}].videoId`, `videoId ${pr.videoId} katalogda yok`)
    })
  })

  /* ───────── Koleksiyonlar ───────── */
  const titleIds = new Set(titles.map((t) => t.value.videoId))
  const checkTitleRef = (f: string, p: string, id: number) => {
    if (titleIds.has(id) || brokenIds.has(id)) return
    const v = videos.get(id)
    if (v)
      err(
        f,
        p,
        `videoId ${id} bir üst başlık değil (${v.kind === 'EPISODE' ? 'bölüm' : 'ek video'}); film/dizi kimliği gerekir`,
      )
    else err(f, p, `videoId ${id} katalogda yok`)
  }
  const collections = load<ContentCollection[]>(CONTENT_FILES.collections, zCollectionsFile) ?? []
  const collectionIds = new Set<number>()
  const collectionSlugs = new Set<string>()
  collections.forEach((c, i) => {
    stats.collections++
    const f = CONTENT_FILES.collections
    if (collectionIds.has(c.collectionId))
      err(f, `[${i}].collectionId`, `Koleksiyon kimliği ${c.collectionId} yinelenmiş`)
    collectionIds.add(c.collectionId)
    if (collectionSlugs.has(c.slug)) err(f, `[${i}].slug`, `Koleksiyon slug "${c.slug}" yinelenmiş`)
    collectionSlugs.add(c.slug)
    c.videoIds.forEach((id, vi) => checkTitleRef(f, `[${i}].videoIds[${vi}]`, id))
  })

  /* ───────── Ana sayfa düzeni ───────── */
  const home = load<ContentHomeLayout>(CONTENT_FILES.homeLayout, zHomeLayout)
  if (home) {
    const f = CONTENT_FILES.homeLayout
    home.billboard.forEach((id, i) => checkTitleRef(f, `billboard[${i}]`, id))
    home.rows.forEach((row, i) => {
      stats.homeRows++
      if (row.kind === 'collection' && !collectionIds.has(row.collectionId))
        err(f, `rows[${i}].collectionId`, `Koleksiyon ${row.collectionId} collections.json'da yok`)
      if (row.kind === 'curated') row.videoIds.forEach((id, vi) => checkTitleRef(f, `rows[${i}].videoIds[${vi}]`, id))
      if (row.kind === 'genre' && !genresUsed.has(row.genre))
        warn(f, `rows[${i}].genre`, `"${GENRES[row.genre].name}" türünde başlık yok; satır boş kalacak`)
    })
  }

  /* ───────── Bildirimler ve ara ekranlar ───────── */
  const notifications = load<NotificationSeed[]>(CONTENT_FILES.notifications, zNotificationsFile) ?? []
  const nIds = new Set<string>()
  notifications.forEach((n, i) => {
    stats.notifications++
    const f = CONTENT_FILES.notifications
    if (nIds.has(n.id)) err(f, `[${i}].id`, `Bildirim kimliği "${n.id}" yinelenmiş`)
    nIds.add(n.id)
    if (n.videoId !== undefined && !videos.has(n.videoId) && !brokenIds.has(n.videoId))
      err(f, `[${i}].videoId`, `videoId ${n.videoId} katalogda yok`)
    if (n.channelId !== undefined && !channelIds.has(n.channelId))
      err(f, `[${i}].channelId`, `Kanal ${n.channelId} channels.json'da yok`)
  })
  const interstitials = load<Interstitial[]>(CONTENT_FILES.interstitials, zInterstitialsFile) ?? []
  const iIds = new Set<string>()
  interstitials.forEach((it, i) => {
    stats.interstitials++
    if (iIds.has(it.id)) err(CONTENT_FILES.interstitials, `[${i}].id`, `Ara ekran kimliği "${it.id}" yinelenmiş`)
    iIds.add(it.id)
  })

  return { errors, warnings, stats }
}

/** Kısa Türkçe rapor metni. */
export function formatReport(r: ContentReport, dir: string): string {
  const s = r.stats
  const lines: string[] = []
  lines.push(`İçerik doğrulama: ${dir}`)
  lines.push(
    `  Başlık ${s.titles} (film ${s.movies}, dizi ${s.shows}) · sezon ${s.seasons} · bölüm ${s.episodes} · ek video ${s.supplementals}`,
  )
  lines.push(
    `  Kanal ${s.channels} · akış şablonu ${s.epgTemplates} · koleksiyon ${s.collections} · ana sayfa satırı ${s.homeRows} · bildirim ${s.notifications} · ara ekran ${s.interstitials}`,
  )
  const kinds = Object.entries(s.bySourceKind)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
  lines.push(`  Kaynak türleri: ${kinds || '—'}`)
  const issue = (i: ContentIssue) => `${i.file || '(klasör)'}${i.path ? ` ${i.path}` : ''}: ${i.message}`
  if (r.warnings.length) {
    lines.push(`Uyarılar (${r.warnings.length}):`)
    r.warnings.forEach((w) => lines.push(`  ! ${issue(w)}`))
  }
  if (r.errors.length) {
    lines.push(`Hatalar (${r.errors.length}):`)
    r.errors.forEach((e) => lines.push(`  ✗ ${issue(e)}`))
    lines.push('Sonuç: BAŞARISIZ')
  } else lines.push('Sonuç: geçerli')
  return lines.join('\n')
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] ?? defaultContentDir()
  const report = validateContent(dir)
  console.log(formatReport(report, dir))
  process.exit(report.errors.length > 0 ? 1 : 0)
}
