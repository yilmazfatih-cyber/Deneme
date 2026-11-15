/**
 * Yönetici Paneli: etkin profilin arka plandaki durumu (GET /api/studio/me/insight → ViewerInsight).
 *
 *   Segmentim            hangi zevk topluluğundasın, benzerlik, sistem nasıl karar verdi (özellik ve başlık katkıları),
 *                        sıradaki adaylar, topluluğun öne çıkardıkları
 *   İzleme özetim        kararın dayandığı veri
 *   Sana kurulan satırlar ana sayfadaki her satır neye göre kuruldu, hangileri kişisel
 *   Alt tür motoru       ana sayfan için seçilen alt türler ve nedenleri
 *   Tahmin modeli        hazır mı, bu profil için ilk seçimleri ve gerekçeleri
 *   Arama modeli         sürüm, son aramalar, öğrenilmiş ağırlıklar
 *
 * Sayılar bu profilin kendi verisidir. Topluluklar örnek veriyle hesaplandıysa "Örnek veri" etiketi görünür.
 * Bu sayfa yalnız yönetici kipinde çizilir (index.tsx); sunucu da ucu yalnız yöneticiye açar.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { InsightTitle, ViewerInsight, ViewerSegment } from '../../../../shared/intelligence'
import { lockAdmin, toggleDevtoolsPanel, useSession, useTitleHref } from '../../app'
import { Button, cx, EmptyState, Icon, Skeleton, toast } from '../../ui'
import { useStudio } from '../studio/api'
import { fmtDateTime, fmtHours, fmtInt } from '../studio/format'
import {
  barWidth,
  decisionMargin,
  decisionSteps,
  KIND_LABEL,
  pct,
  personalRowCount,
  runLine,
  shareOf,
  statusCopy,
} from './model'

/* ───────────── Küçük parçalar ───────────── */

function Card({
  id,
  title,
  note,
  children,
  className,
}: {
  id: string
  title: string
  note?: ReactNode
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <section className={cx('ad-card', className)} aria-labelledby={`${id}-h`}>
      <header className="ad-card__head">
        <h2 id={`${id}-h`} className="ad-card__title">
          {title}
        </h2>
        {note ? <p className="ad-card__note">{note}</p> : null}
      </header>
      {children}
    </section>
  )
}

function SampleTag(): ReactElement {
  return <span className="ad-tag ad-tag--sample">Örnek veri</span>
}

function Bar({
  label,
  tag,
  value,
  width,
  tone,
}: {
  label: ReactNode
  tag?: string
  value: string
  width: number
  tone?: 'accent' | 'muted' | 'negative'
}): ReactElement {
  return (
    <li className="ad-bar">
      <span className="ad-bar__label">
        {label}
        {tag ? <span className="ad-bar__tag">{tag}</span> : null}
      </span>
      <span className="ad-bar__track" aria-hidden="true">
        <span className={cx('ad-bar__fill', tone && `is-${tone}`)} style={{ width: `${width}%` }} />
      </span>
      <span className="ad-bar__value">{value}</span>
    </li>
  )
}

function TitleLink({ t }: { t: InsightTitle }): ReactElement {
  const href = useTitleHref()
  return (
    <Link to={href(t.titleId)} className="ad-title">
      {t.title}
    </Link>
  )
}

/* ───────────── Segmentim ───────────── */

function SegmentBody({ insight, segment }: { insight: ViewerInsight; segment: ViewerSegment }): ReactElement {
  const margin = decisionMargin(segment)
  const whyMax = Math.max(0, ...segment.why.map((w) => w.contribution))
  const driverMax = Math.max(0, ...segment.drivers.map((d) => d.contribution))
  const run = runLine(insight.run, fmtDateTime)
  return (
    <>
      <p className="ad-seg__eyebrow">Şu an bu toplulukta sayılıyorsun</p>
      <p className="ad-seg__name">{segment.name}</p>
      <div className="ad-seg__meter" role="img" aria-label={`Benzerlik ${pct(segment.similarity)}`}>
        <span className="ad-seg__meterlabel">Benzerlik</span>
        <span className="ad-seg__metertrack" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, segment.similarity)) * 100)}%` }} />
        </span>
        <span className="ad-seg__metervalue">{pct(segment.similarity)}</span>
      </div>
      <p className="ad-seg__facts">
        İzleyicilerin {pct(segment.share)} kadarı bu toplulukta ({fmtInt(segment.size)} izleyici)
        {insight.sampleData ? <SampleTag /> : null}
        {margin ? <span className={cx('ad-tag', `ad-tag--${margin.tone}`)}>{margin.label}</span> : null}
      </p>

      {segment.traits.length ? (
        <>
          <h3 className="ad-sub">Bu topluluğu ayıranlar</h3>
          <ul className="ad-chips">
            {segment.traits.map((f) => (
              <li key={`${f.kind}:${f.key}`} className="ad-chip">
                {f.name}
                <span className="ad-chip__num">×{f.lift.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>
              </li>
            ))}
          </ul>
          <p className="ad-hint">×: toplulukta genele göre kaç kat daha ağır bastığı.</p>
        </>
      ) : null}

      <h3 className="ad-sub">Sistem nasıl karar verdi?</h3>
      <ol className="ad-steps">
        {decisionSteps(insight, segment).map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {segment.why.length ? (
        <>
          <h3 className="ad-sub">Kararı en çok etkileyen özellikler</h3>
          <ul className="ad-bars">
            {segment.why.map((w) => (
              <Bar
                key={`${w.kind}:${w.key}`}
                label={w.name}
                tag={KIND_LABEL[w.kind]}
                value={pct(shareOf(w.contribution, segment.similarity))}
                width={barWidth(w.contribution, whyMax)}
                tone="accent"
              />
            ))}
          </ul>
          <p className="ad-hint">Yüzde: özelliğin benzerliğe katkısı.</p>
        </>
      ) : null}

      {segment.drivers.length ? (
        <>
          <h3 className="ad-sub">Seni buraya çeken izlediklerin</h3>
          <ul className="ad-bars">
            {segment.drivers.map((d) => (
              <Bar
                key={d.titleId}
                label={<TitleLink t={d} />}
                tag={d.type === 'SHOW' ? 'Dizi' : 'Film'}
                value={pct(shareOf(d.contribution, segment.similarity))}
                width={barWidth(d.contribution, driverMax)}
                tone="accent"
              />
            ))}
          </ul>
        </>
      ) : null}

      {segment.alternatives.length ? (
        <>
          <h3 className="ad-sub">Sıradaki adaylar</h3>
          <ul className="ad-bars">
            <Bar
              label={segment.name}
              tag="Seçilen"
              value={pct(segment.similarity)}
              width={barWidth(segment.similarity, segment.similarity)}
              tone="accent"
            />
            {segment.alternatives.map((a) => (
              <Bar
                key={a.communityId}
                label={a.name}
                value={pct(a.similarity)}
                width={barWidth(a.similarity, segment.similarity)}
                tone="muted"
              />
            ))}
          </ul>
        </>
      ) : null}

      {segment.picks.length ? (
        <>
          <h3 className="ad-sub">Topluluğunun öne çıkardıkları</h3>
          <ul className="ad-chips">
            {segment.picks.map((p) => (
              <li key={p.titleId} className="ad-chip ad-chip--link">
                <TitleLink t={p} />
              </li>
            ))}
          </ul>
          <p className="ad-hint">Henüz izlemediklerin; ana sayfadaki "Senin Gibi İzleyenler Bunları Seviyor" satırı.</p>
        </>
      ) : null}

      {run ? <p className="ad-meta">Topluluk hesabı: {run}</p> : null}
      <p className="ad-meta">
        <Link to="/studyo/topluluklar">Tüm toplulukları Stüdyo'da gör</Link>
      </p>
    </>
  )
}

function SegmentCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const empty = statusCopy(insight.segmentStatus, insight.history)
  const run = runLine(insight.run, fmtDateTime)
  return (
    <Card id="ad-seg" title="Segmentim" className="ad-card--segment">
      {insight.segment ? (
        <SegmentBody insight={insight} segment={insight.segment} />
      ) : (
        <>
          <p className="ad-seg__name ad-seg__name--none">{empty?.title ?? 'Segment yok'}</p>
          <p className="ad-text">{empty?.body}</p>
          {run ? (
            <p className="ad-meta">
              Topluluk hesabı: {run}
              {insight.sampleData ? <SampleTag /> : null}
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}

/* ───────────── İzleme özetim ───────────── */

function HistoryCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const h = insight.history
  const max = Math.max(0, ...h.top.map((t) => t.engagement))
  return (
    <Card id="ad-hist" title="İzleme özetim" note="Kararın dayandığı veri: bu profilin kendi izlemeleri.">
      <dl className="ad-stats">
        <div>
          <dt>Başlık</dt>
          <dd>{fmtInt(h.titles)}</dd>
        </div>
        <div>
          <dt>Kararda sayılan</dt>
          <dd>{fmtInt(h.engagedTitles)}</dd>
        </div>
        <div>
          <dt>Süre</dt>
          <dd>{fmtHours(h.hours)}</dd>
        </div>
        <div>
          <dt>Son izleme</dt>
          <dd>{h.lastTs ? fmtDateTime(h.lastTs) : '—'}</dd>
        </div>
      </dl>
      {h.top.length ? (
        <>
          <h3 className="ad-sub">En çok ilgi gösterdiklerin</h3>
          <ul className="ad-bars">
            {h.top.map((t) => (
              <Bar
                key={t.titleId}
                label={<TitleLink t={t} />}
                tag={t.type === 'SHOW' ? 'Dizi' : 'Film'}
                value={pct(t.engagement)}
                width={barWidth(t.engagement, max)}
              />
            ))}
          </ul>
          <p className="ad-hint">Yüzde: ilgi puanı (izlenen oran, tamamlama, liste ve beğeni).</p>
        </>
      ) : (
        <p className="ad-text">Bu profille henüz bir şey izlenmedi.</p>
      )}
      <p className="ad-meta ad-meta--mono">Takma izleyici kimliği: {insight.viewerId}</p>
    </Card>
  )
}

/* ───────────── Sana kurulan satırlar ───────────── */

function RowsCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const { personal, total } = personalRowCount(insight.rows)
  return (
    <Card
      id="ad-rows"
      title="Ana sayfandaki satırlar"
      note={total ? `${total} satırın ${personal} tanesi bu profile özel kuruldu.` : undefined}
    >
      {insight.rows.length ? (
        <ul className="ad-rows">
          {insight.rows.map((r, i) => (
            <li key={`${r.context}:${i}`} className="ad-row">
              <span className="ad-row__title">
                {r.title}
                <span className={cx('ad-tag', r.personal ? 'ad-tag--personal' : 'ad-tag--common')}>
                  {r.personal ? 'Kişisel' : 'Herkese aynı'}
                </span>
              </span>
              <span className="ad-row__basis">{r.basis}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-text">Satır bilgisi alınamadı.</p>
      )}
    </Card>
  )
}

/* ───────────── Alt tür motoru ───────────── */

function SubgenresCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const max = Math.max(0, ...insight.subgenres.map((s) => s.score))
  return (
    <Card
      id="ad-sub"
      title="Alt tür motorunun seçtikleri"
      note="Ana sayfan için üretilen alt tür satırları ve nedenleri."
    >
      {insight.subgenres.length ? (
        <ul className="ad-subs">
          {insight.subgenres.map((s) => (
            <li key={s.id} className="ad-subitem">
              <div className="ad-subitem__head">
                <Link to={`/tur/${encodeURIComponent(s.id)}`} className="ad-title">
                  {s.name}
                </Link>
                <span className="ad-subitem__size">{fmtInt(s.size)} başlık</span>
              </div>
              <p className="ad-subitem__def">{s.definition}</p>
              {max > 0 ? (
                <div className="ad-subitem__score">
                  <span className="ad-bar__track" aria-hidden="true">
                    <span className="ad-bar__fill is-accent" style={{ width: `${barWidth(s.score, max)}%` }} />
                  </span>
                  <span className="ad-bar__value">
                    puan {s.score.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ) : null}
              <p className="ad-subitem__why">
                {s.watched.length
                  ? `İzlediklerinden bu alt türe girenler: ${s.watched.map((w) => w.title).join(', ')}`
                  : 'İzlediklerinden bu alt türe giren yok; zevk yakınlığı ya da kalabalıklığıyla seçildi.'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-text">Bu profil için alt tür satırı seçilmedi.</p>
      )}
      <p className="ad-meta">
        <Link to="/studyo/mikro-turler">Tüm alt türleri Stüdyo'da gör</Link>
      </p>
    </Card>
  )
}

/* ───────────── Tahmin modeli ───────────── */

function ModelCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const m = insight.model
  return (
    <Card
      id="ad-model"
      title="Tahmin modeli"
      note={m.ready ? (m.version ?? undefined) : 'Model henüz hazır değil; o zamana dek kural tabanlı seçim çalışır.'}
    >
      {m.picks.length ? (
        <ul className="ad-picks">
          {m.picks.map((p) => (
            <li key={p.titleId} className="ad-pick">
              <span className="ad-pick__head">
                <TitleLink t={p} />
                <span className="ad-pick__match">%{Math.round(p.match)} eşleşme</span>
              </span>
              {p.reasons.length ? <span className="ad-pick__why">{p.reasons.slice(0, 2).join(' · ')}</span> : null}
            </li>
          ))}
        </ul>
      ) : m.ready ? (
        <p className="ad-text">Model bu profil için henüz seçim üretmedi.</p>
      ) : null}
      {m.note ? <p className="ad-meta">{m.note}</p> : null}
      <p className="ad-meta">
        <Link to="/studyo/tahmin">Model kartını Stüdyo'da gör</Link>
      </p>
    </Card>
  )
}

/* ───────────── Arama modeli ───────────── */

function SearchCard({ insight }: { insight: ViewerInsight }): ReactElement {
  const s = insight.search
  const max = Math.max(0, ...s.features.map((f) => Math.abs(f.weight)))
  return (
    <Card id="ad-search" title="Arama modeli" note={s.modelVersion || undefined}>
      {s.features.length ? (
        <>
          <h3 className="ad-sub">Sıralamada neye ne kadar bakıyor</h3>
          <ul className="ad-bars">
            {s.features.map((f) => (
              <Bar
                key={f.name}
                label={f.name}
                value={f.weight.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                width={barWidth(Math.abs(f.weight), max)}
                tone={f.weight < 0 ? 'negative' : undefined}
              />
            ))}
          </ul>
          <p className="ad-hint">Ağırlıklar tıklamalardan öğrenilir; her aramadan sonra güncellenir.</p>
        </>
      ) : null}
      <h3 className="ad-sub">Son aramaların</h3>
      {s.recent.length ? (
        <ul className="ad-chips">
          {s.recent.map((q) => (
            <li key={q} className="ad-chip ad-chip--link">
              <Link to={`/ara?q=${encodeURIComponent(q)}&aciklama=1`} className="ad-title">
                {q}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-text">Bu profille henüz arama yapılmadı.</p>
      )}
      <p className="ad-meta">
        <Link to="/ara?aciklama=1">Aramayı açıklamalı aç</Link>: her sonucun puanına dokununca neden o sırada olduğu
        görünür.
      </p>
    </Card>
  )
}

/* ───────────── Sayfa ───────────── */

export function AdminPanel(): ReactElement {
  const res = useStudio<ViewerInsight>('/me/insight')
  const reloadBoot = useSession((s) => s.reloadBoot)
  const navigate = useNavigate()
  const [locking, setLocking] = useState(false)
  const { refetch } = res

  // Sekmeye dönünce veri tazelenir (izleme → segment değişmiş olabilir).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  // Yönetici oturumu sunucuda geçersizse (süresi doldu) açılış bağlamı yenilenir: sayfa kod girişine döner.
  const denied = res.error?.status === 403 || res.error?.status === 401
  useEffect(() => {
    if (denied) void reloadBoot()
  }, [denied, reloadBoot])

  const onLock = async () => {
    setLocking(true)
    const ok = await lockAdmin()
    setLocking(false)
    if (ok) {
      toast('Yönetici kipi kapatıldı', { kind: 'success' })
      navigate('/goz-at', { replace: true })
    } else toast('Yönetici kipi kapatılamadı. Tekrar dene.', { kind: 'error' })
  }

  const insight = res.data
  return (
    <div className="ad-page" aria-busy={res.loading}>
      <header className="ad-head">
        <div>
          <h1 className="ad-head__title">Yönetici Paneli</h1>
          <p className="ad-head__sub">
            <Icon name="lock" size={14} />
            Yalnız yönetici kipinde görünür
            {insight ? ` · ${insight.profile.name} profili` : ''}
          </p>
        </div>
        <div className="ad-head__actions">
          <Button size="sm" icon="startOver" onClick={() => refetch()} busy={res.loading && !!insight}>
            Yenile
          </Button>
          <Link to="/studyo" className="ad-head__link">
            Stüdyo
          </Link>
          <button type="button" className="ad-head__link ad-head__link--desktop" onClick={toggleDevtoolsPanel}>
            Kaputun altı
          </button>
        </div>
      </header>

      {!insight && res.loading ? (
        <div className="ad-grid">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : null}

      {!insight && res.error && !denied ? (
        <EmptyState
          title="Panel verisi alınamadı"
          message={
            res.error.unavailable ? 'Sunucunun bu sürümünde içgörü ucu yok ya da henüz hazır değil.' : res.error.message
          }
        />
      ) : null}

      {insight ? (
        <div className="ad-grid">
          <SegmentCard insight={insight} />
          <div className="ad-col">
            <HistoryCard insight={insight} />
            <RowsCard insight={insight} />
          </div>
          <SubgenresCard insight={insight} />
          <div className="ad-col">
            <ModelCard insight={insight} />
            <SearchCard insight={insight} />
          </div>
        </div>
      ) : null}

      <footer className="ad-foot">
        <p className="ad-meta">
          {insight ? `Bu görünüm ${fmtDateTime(insight.generatedAt)} itibarıyla. ` : ''}Yönetici kipi bu cihazda 30 gün
          açık kalır.
        </p>
        <Button size="sm" icon="logout" busy={locking} onClick={() => void onLock()}>
          Yönetici kipinden çık
        </Button>
      </footer>
    </div>
  )
}
