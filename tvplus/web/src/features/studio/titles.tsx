/**
 * Başlık adları ve görselleri. Stüdyo yanıtları çoğunlukla yalnız `titleId` taşır:
 *   ad + tür  — GET /api/studio/tagging/queue (katalogdaki her film/dizi; profil kısıtı yok), bir kez çekilir
 *   görsel    — Falcor `videos[id].storyArt` (16:9; uygulamanın kendi önbelleğiyle), görünür olduğunda toplu
 * Görsel gelmezse kart başlıklı yer tutucuyla çizilir.
 */
import { useEffect, useMemo, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import type { TaggingQueueItem } from '../../../../shared/intelligence'
import { falcor } from '../../api/falcor'
import { TitleCard } from '../../ui'
import { studioGet } from './api'

export interface TitleInfo {
  id: number
  title: string
  type: 'MOVIE' | 'SHOW'
}

/* ───────────── ad dizini ───────────── */

let index: Map<number, TitleInfo> | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function loadIndex(force = false): Promise<void> {
  if (loading && !force) return loading
  loading = studioGet<TaggingQueueItem[]>('/tagging/queue')
    .then((items) => {
      index = new Map(items.map((i) => [i.titleId, { id: i.titleId, title: i.title, type: i.type }]))
      emit()
    })
    .catch(() => {
      loading = null // sonraki kullanımda yeniden denenir
    })
  return loading
}

/** Etiketleme fişi değişince (ad değişmez ama sıra değişebilir) dizini tazelemeye gerek yok; yeni başlık için çağrılır. */
export function refreshTitleIndex(): void {
  void loadIndex(true)
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Başlık dizini (yüklenene dek boş). */
export function useTitleIndex(): Map<number, TitleInfo> {
  const snap = useSyncExternalStore(
    subscribe,
    () => index,
    () => index,
  )
  useEffect(() => {
    if (!index) void loadIndex()
  }, [])
  return snap ?? EMPTY
}
const EMPTY = new Map<number, TitleInfo>()

export function titleName(idx: Map<number, TitleInfo>, id: number): string {
  return idx.get(id)?.title ?? `#${id}`
}

/* ───────────── görseller ───────────── */

const art = new Map<number, string | null>()
const artPending = new Set<number>()
let artQueue: number[] = []
let artTimer: number | null = null
const artListeners = new Set<() => void>()
let artVersion = 0

function flushArt(): void {
  artTimer = null
  const ids = artQueue
  artQueue = []
  if (!ids.length) return
  falcor
    .get<{ videos?: Record<string, { storyArt?: { url?: string } }> }>(['videos', ids, 'storyArt'])
    .then((json) => {
      for (const id of ids) art.set(id, json.videos?.[String(id)]?.storyArt?.url ?? null)
    })
    .catch(() => {
      for (const id of ids) art.set(id, null)
    })
    .finally(() => {
      for (const id of ids) artPending.delete(id)
      artVersion++
      artListeners.forEach((l) => l())
    })
}

function requestArt(ids: readonly number[]): void {
  let added = false
  for (const id of ids) {
    if (art.has(id) || artPending.has(id)) continue
    artPending.add(id)
    artQueue.push(id)
    added = true
  }
  if (added && artTimer === null) artTimer = window.setTimeout(flushArt, 30)
}

/** Görsel adresi; ilk çağrıda toplu istek kuyruğa girer. */
export function useArt(ids: readonly number[]): (id: number) => string | null {
  const key = ids.join(',')
  useSyncExternalStore(
    (fn) => {
      artListeners.add(fn)
      return () => artListeners.delete(fn)
    },
    () => artVersion,
    () => artVersion,
  )
  useEffect(() => {
    requestArt(ids)
  }, [key])
  return (id) => art.get(id) ?? null
}

/* ───────────── kart ───────────── */

/** Stüdyo başlık kartı: 16:9 görsel + ad + isteğe bağlı alt satır. */
export function StudioTitleCard({
  id,
  caption,
  badge,
  onClick,
  selected,
  progress,
  label,
}: {
  id: number
  caption?: ReactNode
  badge?: ReactNode
  onClick?: () => void
  selected?: boolean
  progress?: number | null
  label?: string
}): ReactElement {
  const idx = useTitleIndex()
  const ids = useMemo(() => [id], [id])
  const artOf = useArt(ids)
  const name = titleName(idx, id)
  return (
    <div className={selected ? 'st-card is-selected' : 'st-card'}>
      <TitleCard
        title={name}
        image={artOf(id)}
        badge={badge}
        progress={progress}
        onClick={onClick}
        aria-label={label ?? name}
        aria-pressed={onClick && selected !== undefined ? selected : undefined}
        caption={
          <>
            <span className="st-card__name">{name}</span>
            {caption && <span className="st-card__sub">{caption}</span>}
          </>
        }
      />
    </div>
  )
}

/** Kısa ad etiketi (tablolarda): ad yoksa #kimlik. */
export function TitleName({ id }: { id: number }): ReactElement {
  const idx = useTitleIndex()
  return <>{titleName(idx, id)}</>
}
