/**
 * archive.org içerik hattı: `npx tsx scripts/ingest-archive.ts --id <tanımlayıcı> [--dir content]`
 * https://archive.org/metadata/<id> okunur, en iyi H.264 MP4 türevi seçilir ve PROGRESSIVE kaynaklı bir
 * ContentTitle iskeleti basılır (8002xxxx aralığında boş kimlikle). Dosyaya yazmaz; editör düzenleyip ekler.
 */
import { allocateIds, defaultContentDir, slugify, usedVideoIds, type Json } from './lib/content'
import { httpGet, isMain, type HttpGet } from './lib/net'

export interface ArchiveFile {
  name: string
  source?: string
  format?: string
  size?: string
  length?: string
  height?: string
  width?: string
}
export interface ArchiveMetadata {
  metadata?: Record<string, unknown>
  files?: ArchiveFile[]
}

/** "5432.12" ya da "01:30:32" / "90:32" → saniye. */
export function parseLength(v: string | undefined): number | null {
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v.trim())) return Math.round(parseFloat(v))
  const parts = v.trim().split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return null
  return Math.round(parts.reduce((acc, n) => acc * 60 + n, 0))
}

/** Biçim önceliği: büyük → iyi. */
function formatRank(format: string): number {
  const f = format.toLowerCase()
  if (f === 'h.264 hd') return 60
  if (f === 'h.264') return 50
  if (f === 'h.264 ia') return 45
  if (f.includes('h.264')) return 40
  if (f === 'mpeg4') return 30
  if (f.includes('512kb')) return 10
  if (f.includes('mpeg4')) return 20
  return 0
}

/**
 * En iyi H.264 MP4 türevi: .mp4 uzantılı ve biçimi H.264/MPEG4 olanlar arasından biçim önceliği, sonra 1080'i aşmayan
 * en yüksek çözünürlük, sonra boyut. Yalnızca orijinal MP4 varsa o seçilir.
 */
export function pickBestMp4(files: ArchiveFile[]): ArchiveFile | null {
  const cands = files.filter((f) => /\.mp4$/i.test(f.name) && formatRank(f.format ?? '') > 0)
  if (cands.length === 0) return null
  const height = (f: ArchiveFile) => Number(f.height ?? 0) || 0
  const score = (f: ArchiveFile) => {
    const h = height(f)
    const hScore = h === 0 ? 0 : h <= 1080 ? h : Math.max(1, 2160 - h) // 1080 üstü (4K) tarayıcıda gereksiz ağır: en sona
    return [formatRank(f.format ?? ''), f.source === 'derivative' ? 1 : 0, hScore, Number(f.size ?? 0)]
  }
  return (
    [...cands].sort((a, b) => {
      const sa = score(a)
      const sb = score(b)
      for (let i = 0; i < sa.length; i++) if ((sa[i] ?? 0) !== (sb[i] ?? 0)) return (sb[i] ?? 0) - (sa[i] ?? 0)
      return 0
    })[0] ?? null
  )
}

/** En büyük özgün JPEG/PNG (afiş/kare adayı). */
export function pickArtwork(files: ArchiveFile[]): ArchiveFile | null {
  const imgs = files.filter(
    (f) => f.source === 'original' && /\.(jpe?g|png)$/i.test(f.name) && !/thumb|__ia_thumb/i.test(f.name),
  )
  return imgs.sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0] ?? null
}

const first = (v: unknown): string =>
  Array.isArray(v) ? first(v[0]) : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
const stripHtml = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Lisans adresinden kısa ad: publicdomain → "Kamu malı", creativecommons by-sa/4.0 → "CC BY-SA 4.0". */
export function licenseName(url: string, rights: string): string {
  const u = url.toLowerCase()
  if (u.includes('publicdomain/mark') || u.includes('publicdomain/zero'))
    return u.includes('zero') ? 'CC0 1.0' : 'Kamu malı'
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/.exec(u)
  if (m && m[1] && m[2]) return `CC ${m[1].toUpperCase()} ${m[2]}`
  if (/public domain|kamu mal/i.test(rights)) return 'Kamu malı'
  return rights ? cut(rights, 60) : 'Lisans belirtilmemiş — kontrol edin'
}

export function archiveSkeleton(id: string, meta: ArchiveMetadata, opts: { videoId: number; today: string }): Json {
  const m = meta.metadata ?? {}
  const files = meta.files ?? []
  const mp4 = pickBestMp4(files)
  if (!mp4) throw new Error('Bu öğede H.264/MPEG4 MP4 dosyası yok.')
  const title = first(m.title) || id
  const yearRaw = first(m.year) || first(m.date)
  const year = Number(/\d{4}/.exec(yearRaw)?.[0] ?? 0) || Number(opts.today.slice(0, 4))
  const desc = stripHtml(first(m.description))
  const licenseUrl = first(m.licenseurl)
  const rights = stripHtml(first(m.rights))
  const creator = first(m.creator)
  const art = pickArtwork(files)
  const artUrl = art ? `https://archive.org/download/${id}/${encodeURIComponent(art.name)}` : null
  const artPortrait = art ? Number(art.height ?? 0) > Number(art.width ?? 0) : false
  const runtimeSec = parseLength(mp4.length)
  const size = Number(mp4.size ?? 0)
  return {
    videoId: opts.videoId,
    slug: slugify(title) || slugify(id),
    type: 'MOVIE',
    title,
    year: Math.min(2100, Math.max(1888, year)),
    synopsis: desc.length >= 20 ? cut(desc, 500) : `${title} (${year}). (Özet yazılacak.)`,
    shortSynopsis: cut(desc || title, 140),
    genres: ['klasik'],
    moods: [],
    directors: creator ? [creator] : [],
    maturity: { rating: '7+', reasons: [] },
    runtimeSec,
    sources: [
      {
        type: 'PROGRESSIVE',
        url: `https://archive.org/download/${id}/${encodeURIComponent(mp4.name)}`,
        mimeType: 'video/mp4',
        ...(size > 0 ? { sizeBytes: size } : {}),
      },
    ],
    artwork: { boxart: artPortrait ? artUrl : null, storyArt: artPortrait ? null : artUrl, focal: '50% 35%' },
    license: {
      name: licenseName(licenseUrl, rights),
      attribution: `${creator ? `${creator} · ` : ''}Internet Archive: ${id}`,
      url: licenseUrl || `https://archive.org/details/${id}`,
    },
    availability: { addedAt: opts.today },
  }
}

export async function fetchArchiveMetadata(id: string, get: HttpGet = httpGet): Promise<ArchiveMetadata> {
  const res = await get(`https://archive.org/metadata/${encodeURIComponent(id)}`, { timeoutMs: 8000 })
  if (res.status !== 200) throw new Error(`archive.org yanıtı HTTP ${res.status}`)
  const j = JSON.parse(res.text) as ArchiveMetadata
  if (!j.metadata || !Array.isArray(j.files)) throw new Error(`"${id}" adlı öğe bulunamadı.`)
  return j
}

async function main() {
  const argv = process.argv.slice(2)
  let id: string | null = null
  let dir = defaultContentDir()
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') id = argv[++i] ?? null
    else if (argv[i] === '--dir') dir = argv[++i] ?? dir
  }
  if (!id) {
    console.error('Kullanım: npx tsx scripts/ingest-archive.ts --id <archive.org tanımlayıcısı>')
    process.exit(2)
  }
  const meta = await fetchArchiveMetadata(id)
  const mp4 = pickBestMp4(meta.files ?? [])
  const [videoId] = allocateIds(usedVideoIds(dir), 80020001, 80029999, 1)
  const skeleton = archiveSkeleton(id, meta, { videoId: videoId ?? 0, today: new Date().toISOString().slice(0, 10) })
  console.error(
    `Seçilen dosya: ${mp4?.name} (${mp4?.format}, ${mp4?.height ?? '?'}p, ${(Number(mp4?.size ?? 0) / 1048576) | 0} MB)`,
  )
  console.error('İskelet (stdout): tür, olgunluk işareti ve özeti gözden geçirip content/titles/ altına ekleyin.')
  console.log(JSON.stringify(skeleton, null, 2))
}

if (isMain(import.meta.url))
  main().catch((e: unknown) => {
    console.error(`Hata: ${(e as Error).message}`)
    process.exit(1)
  })
