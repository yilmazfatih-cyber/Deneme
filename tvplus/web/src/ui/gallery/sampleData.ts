/**
 * Galeri ve kabuk örneği için gerçek görseller: profil seçiliyse ana sayfa lolomo'sundan (Falcor) ilk satırlar.
 * Yalnız görsel QA içindir; sayfalar kendi veri katmanlarını kullanır. Profil yoksa görselsiz örnekler döner.
 */
import { useEffect, useState } from 'react'
import { falcor } from '../../api/falcor'
import { peekBoot } from '../../api/session'

interface Art {
  url: string
}
interface VideoNode {
  summary?: { id: number; type: string }
  title?: string
  shortSynopsis?: string
  boxart?: Art
  storyArt?: Art
  billboardArt?: Art
  titleLogo?: Art
  maturity?: { certificationValue: string; reasons: string[] }
  tags?: string[]
  releaseYear?: number
  displayRuntime?: string
}
interface ListNode {
  summary?: { displayName: string; context: string }
  [i: string]: VideoNode | ListNode['summary'] | undefined
}

export interface SampleTitle {
  id: number
  title: string
  synopsis: string
  boxart: string | null
  storyArt: string | null
  billboardArt: string | null
  titleLogo: string | null
  certification: string
  reasons: string[]
  tags: string[]
  year: number | null
  runtime: string
}

export interface SampleRow {
  name: string
  context: string
  items: SampleTitle[]
}

const LEAVES = [
  'summary',
  'title',
  'shortSynopsis',
  'boxart',
  'storyArt',
  'billboardArt',
  'titleLogo',
  'maturity',
  'tags',
  'releaseYear',
  'displayRuntime',
]

const FALLBACK_NAMES = ['Sintel', 'Kuzgun', 'Big Buck Bunny', 'Tears of Steel', 'Elephants Dream', 'Cosmos Laundromat']

function fallback(): SampleRow[] {
  const items = Array.from({ length: 14 }, (_, i) => ({
    id: 1000 + i,
    title: FALLBACK_NAMES[i % FALLBACK_NAMES.length]!,
    synopsis: 'Görsel için bir profille giriş yap; galeri ana sayfanın ilk satırlarını kullanır.',
    boxart: null,
    storyArt: null,
    billboardArt: null,
    titleLogo: null,
    certification: '13+',
    reasons: ['Şiddet ve Korku'],
    tags: ['Gerilim', 'Karanlık', 'Dram'],
    year: 2024,
    runtime: '1 sa 28 dk',
  }))
  return [{ name: 'Örnek satır', context: 'genre', items }]
}

function toTitle(v: VideoNode | undefined): SampleTitle | null {
  if (!v?.summary || !v.title) return null
  return {
    id: v.summary.id,
    title: v.title,
    synopsis: v.shortSynopsis ?? '',
    boxart: v.boxart?.url ?? null,
    storyArt: v.storyArt?.url ?? null,
    billboardArt: v.billboardArt?.url ?? null,
    titleLogo: v.titleLogo?.url ?? null,
    certification: v.maturity?.certificationValue ?? 'Genel İzleyici',
    reasons: v.maturity?.reasons ?? [],
    tags: v.tags ?? [],
    year: v.releaseYear ?? null,
    runtime: v.displayRuntime ?? '',
  }
}

/** İlk 8 satır × 16 öğe. */
export function useSampleRows(): { rows: SampleRow[]; real: boolean; loading: boolean } {
  const hasProfile = !!peekBoot()?.activeProfile
  const [state, setState] = useState<{ rows: SampleRow[]; real: boolean; loading: boolean }>(() => ({
    rows: fallback(),
    real: false,
    loading: hasProfile,
  }))
  useEffect(() => {
    if (!hasProfile) return
    let alive = true
    falcor
      .get<{ lolomo?: Record<string, ListNode> }>(
        ['lolomo', { from: 0, to: 7 }, 'summary'],
        ['lolomo', { from: 0, to: 7 }, { from: 0, to: 15 }, LEAVES],
      )
      .then((json) => {
        if (!alive) return
        const rows: SampleRow[] = []
        for (const list of Object.values(json.lolomo ?? {})) {
          if (!list || typeof list !== 'object' || !list.summary) continue
          if (list.summary.context === 'billboard' || list.summary.context === 'bridge') continue
          const items: SampleTitle[] = []
          for (let i = 0; i < 16; i++) {
            const t = toTitle(list[String(i)] as VideoNode | undefined)
            if (t) items.push(t)
          }
          if (items.length) rows.push({ name: list.summary.displayName, context: list.summary.context, items })
        }
        setState(rows.length ? { rows, real: true, loading: false } : { rows: fallback(), real: false, loading: false })
      })
      .catch(() => alive && setState({ rows: fallback(), real: false, loading: false }))
    return () => {
      alive = false
    }
  }, [hasProfile])
  return state
}

/** Tüm satırlardaki benzersiz başlıklar (vitrin için billboardArt'lı olan önce). */
export function uniqueTitles(rows: SampleRow[]): SampleTitle[] {
  const seen = new Map<number, SampleTitle>()
  for (const r of rows) for (const t of r.items) if (!seen.has(t.id)) seen.set(t.id, t)
  return [...seen.values()].sort((a, b) => Number(!!b.billboardArt) - Number(!!a.billboardArt))
}
