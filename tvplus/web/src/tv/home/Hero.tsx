/**
 * Göz atma ekranlarının üst alanı: odaktaki başlığın bilgisi (tür satırı, başlık, bilgi satırı, 3 satır özet, üç
 * etiket) ve sağda arka plan görseli. Görsel kısa bir gecikmeyle değişir (hızlı gezinmede ara görseller
 * istenmez); odak bir başlıkta durunca, tanıtımı varsa sessiz önizleme görsel alanında oynar. Herhangi bir gezinme
 * (odak değişimi, ekrandan çıkış, odağın yan menüye geçmesi) önizlemeyi durdurur.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { PreviewPlayer } from '../../player'
import { TvBackground } from '../ui'
import type { HeroVM } from './model'

/** Görsel değişiminin gecikmesi (ms) */
export const ART_DELAY_MS = 260
/** Odak durduktan sonra sessiz önizlemenin başlaması (ms; UX_SPEC §4: 1.2 sn) */
export const PREVIEW_DELAY_MS = 1200

/** Değeri `ms` boyunca değişmezse döndürür. */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, settled, ms])
  return settled
}

function Preview({ viewableId, offset }: { viewableId: string; offset: number }): ReactElement {
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return <></>
  return (
    <div className={`tvb-preview${playing ? ' is-playing' : ''}`}>
      <PreviewPlayer
        viewableId={viewableId}
        offsetSec={offset}
        muted
        onPlaying={() => setPlaying(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export interface HeroProps {
  hero: HeroVM | null
  /** false iken önizleme oynamaz (odak yan menüde, ekran örtülü) */
  active: boolean
  /** Kategori ekranlarında başlığın üstünde sayfa adı */
  pageTitle?: string
}

export function Hero({ hero, active, pageTitle }: HeroProps): ReactElement {
  const artUrl = useSettled(hero?.artUrl ?? null, ART_DELAY_MS)
  const settledKey = useSettled(hero?.key ?? null, ART_DELAY_MS)
  const [previewOn, setPreviewOn] = useState(false)
  const promo = hero?.promo ?? null
  const promoKey = promo ? `${hero?.key}|${promo.viewableId}` : null

  useEffect(() => {
    setPreviewOn(false)
    if (!active || !promoKey || settledKey !== hero?.key) return
    const t = setTimeout(() => setPreviewOn(true), PREVIEW_DELAY_MS)
    return () => clearTimeout(t)
  }, [active, promoKey, settledKey, hero?.key])

  return (
    <>
      <TvBackground
        src={artUrl}
        width="68%"
        height="82%"
        overlay={
          previewOn && promo && active ? (
            <Preview key={promoKey} viewableId={promo.viewableId} offset={promo.offset} />
          ) : undefined
        }
      />
      {pageTitle && <h1 className="tvb-page-title">{pageTitle}</h1>}
      <div className="tvb-hero" aria-live="polite">
        {hero ? (
          <>
            <p className="tvb-hero__eyebrow">{hero.eyebrow}</p>
            <h2 className="tvb-hero__title" data-hero-title="">
              {hero.title}
            </h2>
            <p className="tvb-hero__meta">
              {hero.match && <span className="tvb-match">{hero.match}</span>}
              {hero.meta[0] && <span>{hero.meta[0]}</span>}
              {hero.maturity && <span className="tvb-maturity">{hero.maturity}</span>}
              {hero.meta.slice(1).map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
            {hero.rankLine && <p className="tvb-hero__rank">{hero.rankLine}</p>}
            {hero.synopsis && <p className="tvb-hero__synopsis">{hero.synopsis}</p>}
            {hero.tags.length > 0 && <p className="tvb-hero__tags">{hero.tags.join(' · ')}</p>}
          </>
        ) : (
          <div className="tvb-hero__skeleton" aria-hidden="true" />
        )}
      </div>
    </>
  )
}
