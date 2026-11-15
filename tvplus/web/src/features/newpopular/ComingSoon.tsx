/**
 * Yeni ve Popüler "Çok Yakında": canlı TV'de birazdan başlayacak yayınlar.
 *
 * Her kanalın sıradaki yayını alınır (UpcomingAirings). Önümüzdeki dört saat içinde başlayanlardan film, dizi, spor,
 * belgesel ve müzik öne geçer; seçilenler başlama saatine göre sıralanır. Kart: görsel, "Bugün 21:00'de başlıyor",
 * ad, kanal, özet ve "Bana Hatırlat" (Rehber ve Canlı TV ile aynı hatırlatma deposu). Yayın akışı örnek veri olan
 * kanallar her zaman etiketlenir.
 */
import { useMemo, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { useGql } from '../../api/hooks'
import { cx, Icon, useNow } from '../../ui'
import { setReminder, useReminder } from '../live/actions'
import { upcomingNote } from '../live/airing'
import { SAMPLE_LABEL } from '../live/parts'
import type { AiringBriefData, ArtworkData } from '../live/types'

export const SOON_WINDOW_MS = 4 * 60 * 60_000
export const SOON_MAX = 6
const SURFACE = 'yeni-ve-populer'

const KIND_LABEL: Record<string, string> = {
  haber: 'Haber',
  film: 'Film',
  dizi: 'Dizi',
  spor: 'Spor',
  belgesel: 'Belgesel',
  cocuk: 'Çocuk',
  program: 'Program',
  muzik: 'Müzik',
}
/** "Çok Yakında"da öne geçen yayın türleri */
const PRIME_KINDS = new Set(['film', 'dizi', 'spor', 'belgesel', 'muzik'])

export interface UpcomingAiring extends AiringBriefData {
  synopsis: string
  hasReminder: boolean
  artwork: ArtworkData | null
}

export interface UpcomingChannel {
  channelId: number
  name: string
  number: number
  isKids: boolean
  isSampleSchedule: boolean
  logo: ArtworkData | null
  next: UpcomingAiring | null
}

export interface UpcomingData {
  channels: UpcomingChannel[]
}

export interface SoonItem {
  channelId: number
  channelName: string
  channelNumber: number
  logoUrl: string | null
  sample: boolean
  airing: UpcomingAiring
}

/** Kanalların sıradaki yayınlarından "Çok Yakında" listesini seçer (saf). */
export function pickUpcoming(channels: UpcomingChannel[], now: number): SoonItem[] {
  const pool: (SoonItem & { start: number; prime: boolean })[] = []
  for (const ch of channels) {
    const a = ch.next
    if (!a || a.access.state !== 'PLAYABLE') continue
    const start = Date.parse(a.startAt)
    if (!Number.isFinite(start) || start <= now || start - now > SOON_WINDOW_MS) continue
    pool.push({
      channelId: ch.channelId,
      channelName: ch.name,
      channelNumber: ch.number,
      logoUrl: ch.logo?.url ?? null,
      sample: ch.isSampleSchedule,
      airing: a,
      start,
      prime: PRIME_KINDS.has(a.kind),
    })
  }
  const byStart = (x: { start: number; channelNumber: number }, y: { start: number; channelNumber: number }) =>
    x.start - y.start || x.channelNumber - y.channelNumber
  return pool
    .sort((x, y) => Number(y.prime) - Number(x.prime) || byStart(x, y))
    .slice(0, SOON_MAX)
    .sort(byStart)
    .map(({ start: _start, prime: _prime, ...item }) => item)
}

export function SoonCard({ item, now }: { item: SoonItem; now: number }): ReactElement {
  const a = item.airing
  const r = useReminder(a.airingId, a.hasReminder)
  const kind = KIND_LABEL[a.kind] ?? null
  return (
    <article className="npf-card npf-card--soon" aria-label={`${a.title}, ${item.channelName}`}>
      <div className="npf-card__box">
        <div className="npf-card__art">
          {a.artwork?.url ? (
            <img src={a.artwork.url} alt="" loading="lazy" />
          ) : (
            <span className="ui-art-fallback">
              <span>{a.title}</span>
            </span>
          )}
          <span className="npf-card__chan">
            {item.logoUrl ? <img src={item.logoUrl} alt="" loading="lazy" /> : null}
            {item.channelName}
          </span>
        </div>
        <div className="npf-card__body">
          <p className="npf-card__signal">{upcomingNote(a.startAt, now)}</p>
          <h3 className="npf-card__title">{a.title}</h3>
          <p className="npf-card__meta">
            {[kind, item.channelName].filter(Boolean).join(' · ')}
            {item.sample ? <span className="npf-sample">{SAMPLE_LABEL}</span> : null}
          </p>
          {a.synopsis ? <p className="npf-card__synopsis">{a.synopsis}</p> : null}
          <div className="npf-card__actions">
            <button
              type="button"
              className={cx('npf-btn', r.on ? 'is-on' : 'npf-btn--primary')}
              aria-pressed={r.on}
              disabled={r.busy}
              onClick={() => setReminder(a, SURFACE)}
            >
              <Icon name={r.on ? 'check' : 'bell'} size={20} />
              {r.on ? 'Hatırlatma Kuruldu' : 'Bana Hatırlat'}
            </button>
            <Link to="/rehber" className="npf-btn npf-btn--guide">
              <Icon name="guide" size={20} />
              Yayın Akışı
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

/** Sorgu + seçim: "Çok Yakında" listesi ve paylaşılan şimdi. */
export function useComingSoon(): { soon: SoonItem[]; now: number } {
  const now = useNow()
  const { data } = useGql<UpcomingData>('UpcomingAirings', {}, { ttlMs: 60_000 })
  const soon = useMemo(() => pickUpcoming(data?.channels ?? [], now), [data, now])
  return { soon, now }
}

/** Masaüstü: satırların altında üç sütunlu "Çok Yakında" bölümü. Yayın yoksa hiçbir şey çizmez. */
export function ComingSoonSection(): ReactElement | null {
  const { soon, now } = useComingSoon()
  if (!soon.length) return null
  return (
    <section className="np-soon ui-gutter" aria-labelledby="np-soon-h">
      <h2 id="np-soon-h" className="ui-row-title">
        Çok Yakında
      </h2>
      <p className="np-soon__note">Canlı TV'de birazdan başlayacaklar</p>
      <ol className="np-soon__grid">
        {soon.map((item) => (
          <li key={item.airing.airingId}>
            <SoonCard item={item} now={now} />
          </li>
        ))}
      </ol>
    </section>
  )
}
