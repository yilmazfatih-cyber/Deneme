/**
 * Vitrin yerleşimi (UX_SPEC §2 "Vitrin", §3 "Vitrin kartı"). Veri ve davranış sayfanındır; burada yalnız iskelet var.
 *
 * Masaüstü:
 *   <Billboard media={<BillboardImage src={art} />} side={<BillboardSide muted onToggleMute certification="13+" />}>
 *     <BillboardInfo logo={logoUrl} title="Sintel" synopsis="…" topTen={<TopTenLine rank={3} category="Dizilerde" />}
 *       actions={<><ButtonLink variant="play" size="lg" icon="play" to="/izle/…">Oynat</ButtonLink>
 *                  <Button size="lg" icon="info">Daha Fazla Bilgi</Button></>} />
 *   </Billboard>
 *   Yükseklik 56.25vw (en çok 85vh); altta `--bg`'ye, solda karartma. Ardından gelen satırlar vitrinin altına
 *   biner: satır kapsayıcısına `ui-billboard-rows` sınıfını verin.
 * Mobil:
 *   <MobileHero image={boxart} title="Sintel" logo={logoUrl} tags={['Gerilim', 'Karanlık']} tint="#3b2a1a"
 *     actions={<><Button variant="play" icon="play" block>Oynat</Button><Button icon="plus" block>Listem</Button></>} />
 */
import { useState, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from './Feedback'
import { RoundButton } from './Button'
import { cx } from './cx'
import './billboard.css'

export interface BillboardProps {
  /** Arka plan: <BillboardImage> ya da sessiz tanıtım oynatıcısı (kutuyu doldurmalı: position:absolute; inset:0) */
  media: ReactNode
  /** Sol bilgi katmanı (<BillboardInfo>) */
  children?: ReactNode
  /** Sağ kenar: ses düğmesi + yaş işareti şeridi (<BillboardSide>) */
  side?: ReactNode
  /** Erişilebilir bölge adı; varsayılan "Öne çıkan" */
  label?: string
  className?: string
}

export function Billboard({ media, children, side, label = 'Öne çıkan', className }: BillboardProps): ReactElement {
  return (
    <section className={cx('ui-billboard', className)} aria-label={label}>
      <div className="ui-billboard__media">{media}</div>
      <div className="ui-billboard__vignette" aria-hidden="true" />
      <div className="ui-billboard__fade" aria-hidden="true" />
      {children && <div className="ui-billboard__info">{children}</div>}
      {side && <div className="ui-billboard__side">{side}</div>}
    </section>
  )
}

/** Vitrin görseli (16:9 BILLBOARD art), alanı doldurur. Yüklenemezse koyu zemin kalır. */
export function BillboardImage({
  src,
  alt = '',
}: {
  src: string | null | undefined
  alt?: string
}): ReactElement | null {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return <img className="ui-billboard__img" src={src} alt={alt} draggable={false} onError={() => setFailed(true)} />
}

export interface BillboardInfoProps {
  /** Başlık logosu (TITLE_LOGO); yoksa başlık metni büyük yazılır */
  logo?: string | null
  title: string
  /** En çok üç satır */
  synopsis?: ReactNode
  /** "Bugün Dizilerde 3 Numara" satırı (<TopTenLine>) */
  topTen?: ReactNode
  /** Düğmeler: ▶ Oynat (beyaz) · ⓘ Daha Fazla Bilgi (gri) */
  actions?: ReactNode
  /** Tanıtım başlayınca Netflix gibi özet solar, logo küçülür */
  compact?: boolean
}

export function BillboardInfo({ logo, title, synopsis, topTen, actions, compact }: BillboardInfoProps): ReactElement {
  const [logoFailed, setLogoFailed] = useState(false)
  return (
    <div className={cx('ui-billboard-info', compact && 'is-compact')}>
      <h2 className="ui-billboard-info__title">
        {logo && !logoFailed ? (
          <img src={logo} alt={title} className="ui-billboard-info__logo" onError={() => setLogoFailed(true)} />
        ) : (
          <span className="ui-billboard-info__text">{title}</span>
        )}
      </h2>
      {topTen && <div className="ui-billboard-info__top10">{topTen}</div>}
      {synopsis && <p className="ui-billboard-info__synopsis">{synopsis}</p>}
      {actions && <div className="ui-billboard-info__actions">{actions}</div>}
    </div>
  )
}

/** Top 10 satırı: sarı "TOP 10" karesi + "Bugün Dizilerde 3 Numara". */
export function TopTenLine({
  rank,
  category,
}: {
  rank: number
  /** "Dizilerde" | "Filmlerde" */
  category: string
}): ReactElement {
  return (
    <span className="ui-top10-line">
      <Badge tone="top10" />
      <span>
        Bugün {category} {rank} Numara
      </span>
    </span>
  )
}

/** Yaş işareti şeridi: sol kenarı 3 px çizgi, yarı saydam zemin, "13+". */
export function MaturityStrip({
  certification,
  reasons,
}: {
  certification: string
  reasons?: readonly string[]
}): ReactElement {
  const general = certification === 'Genel İzleyici'
  return (
    <span
      className="ui-maturity-strip"
      role="img"
      aria-label={['Yaş sınırı: ' + certification, ...(reasons ?? [])].join(', ')}
    >
      {general ? 'Genel' : certification}
    </span>
  )
}

export interface BillboardSideProps {
  /** Tanıtım sessizse true; verilmezse ses düğmesi çizilmez */
  muted?: boolean
  onToggleMute?: () => void
  /** Tanıtım bitti: ses yerine "Yeniden oynat" */
  ended?: boolean
  onReplay?: () => void
  certification?: string | null
  reasons?: readonly string[]
}

/** Sağ küme: yuvarlak çerçeveli ses düğmesi + yaş işareti şeridi. */
export function BillboardSide({
  muted,
  onToggleMute,
  ended,
  onReplay,
  certification,
  reasons,
}: BillboardSideProps): ReactElement {
  return (
    <>
      {ended && onReplay ? (
        <RoundButton icon="startOver" label="Yeniden oynat" onClick={onReplay} className="ui-billboard__mute" />
      ) : (
        onToggleMute &&
        muted !== undefined && (
          <RoundButton
            icon={muted ? 'mute' : 'volume'}
            label={muted ? 'Sesi aç' : 'Sesi kapat'}
            onClick={onToggleMute}
            className="ui-billboard__mute"
          />
        )
      )}
      {certification && <MaturityStrip certification={certification} reasons={reasons} />}
    </>
  )
}

/* ───────────── Mobil vitrin kartı ───────────── */

export interface MobileHeroProps {
  /** 2:3 görsel (BOXART) */
  image?: string | null
  title: string
  logo?: string | null
  /** Noktalı etiket satırı: ["Gerilim", "Karanlık", "Dram"] */
  tags?: readonly string[]
  /** Kartın içindeki iki düğme: ▶ Oynat (beyaz) · ＋ Listem (gri) */
  actions?: ReactNode
  /** Karta dokununca (detay) — uygulama içi yol */
  to?: string
  onOpen?: (e: MouseEvent<HTMLElement>) => void
  /** Kartın arkasındaki renk parıltısı (görselin baskın rengi); verilmezse nötr */
  tint?: string
  /** Logo yokken başlığı yaz (varsayılan true); görsel başlığı zaten içeriyorsa false */
  showTitle?: boolean
  className?: string
}

export function MobileHero({
  image,
  title,
  logo,
  tags = [],
  actions,
  to,
  onOpen,
  tint,
  showTitle = true,
  className,
}: MobileHeroProps): ReactElement {
  const [imgFailed, setImgFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const art = (
    <>
      {image && !imgFailed ? (
        <img className="ui-mhero__img" src={image} alt="" draggable={false} onError={() => setImgFailed(true)} />
      ) : (
        <span className="ui-mhero__img ui-art-fallback" aria-hidden="true" />
      )}
      <span className="ui-mhero__shade" aria-hidden="true" />
    </>
  )
  return (
    <section
      className={cx('ui-mhero', className)}
      aria-label={`Öne çıkan: ${title}`}
      style={tint ? { ['--hero-tint' as string]: tint } : undefined}
    >
      <div className="ui-mhero__glow" aria-hidden="true" />
      <div className="ui-mhero__card">
        {to !== undefined ? (
          <Link to={to} className="ui-mhero__art" aria-label={title} onClick={onOpen}>
            {art}
          </Link>
        ) : (
          <div className="ui-mhero__art" onClick={onOpen}>
            {art}
          </div>
        )}
        <div className="ui-mhero__info">
          {logo && !logoFailed ? (
            <img className="ui-mhero__logo" src={logo} alt={title} onError={() => setLogoFailed(true)} />
          ) : showTitle ? (
            <h2 className="ui-mhero__title">{title}</h2>
          ) : null}
          {tags.length > 0 && (
            <ul className="ui-dotted ui-mhero__tags">
              {tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          {actions && <div className="ui-mhero__actions">{actions}</div>}
        </div>
      </div>
    </section>
  )
}
