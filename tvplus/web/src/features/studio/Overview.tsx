/**
 * Genel Bakış: hattın soldan sağa şeması, her düğümde canlı sayı ve ilgili bölüme bağlantı.
 *   etiketler → mikro türler → izleme verisi → zevk toplulukları → tahmin modeli
 *   çekimler → gömme ──────────────────────────────────────────────↗
 * Veri: GET /overview (StudioOverview) ve ayrıca GET /model (model ayrı yüklenir; yoksa yalnız o düğüm boş kalır).
 */
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PredictionModelInfo, StudioOverview } from '../../../../shared/intelligence'
import { useStudio } from './api'
import { fmtDate, fmtDateTime, fmtDec, fmtInt, fmtPct } from './format'
import { embeddingKind } from './Embeddings'
import { Chip, LoadingBlock, NotReady, SectionHead, SOURCE_LABEL, SyntheticTag, usesSynthetic } from './parts'

function Node({
  title,
  to,
  value,
  unit,
  children,
  state,
}: {
  title: string
  to: string
  value: ReactNode
  unit?: string
  children?: ReactNode
  /** 'off' sönük (veri yok / servis yok) */
  state?: 'on' | 'off' | 'hero'
}): ReactElement {
  return (
    <Link to={to} className={`st-node${state === 'off' ? ' is-off' : ''}${state === 'hero' ? ' is-hero' : ''}`}>
      <span className="st-node__title">{title}</span>
      <span className="st-node__value">
        {value}
        {unit && <span className="st-node__unit"> {unit}</span>}
      </span>
      {children && <span className="st-node__body">{children}</span>}
      <span className="st-node__go" aria-hidden="true">
        Aç →
      </span>
    </Link>
  )
}

const Arrow = ({ col, row }: { col: number; row: number }) => (
  <span className="st-arrow" style={{ gridColumn: col, gridRow: row }} aria-hidden="true">
    →
  </span>
)

export function OverviewSection(): ReactElement {
  const ov = useStudio<StudioOverview>('/overview')
  const model = useStudio<PredictionModelInfo>('/model')
  return (
    <>
      <SectionHead
        title="Genel Bakış"
        lead="İçerik zekâsı hattı soldan sağa akar. Her kutu canlı sayıyı gösterir; tıklayınca o bölüm açılır."
        actions={
          <button
            type="button"
            className="st-link"
            onClick={() => {
              ov.refetch()
              model.refetch()
            }}
          >
            Yenile
          </button>
        }
      />
      {ov.data === undefined ? (
        ov.error ? (
          <NotReady detail={ov.error.message} onRetry={ov.refetch} />
        ) : (
          <LoadingBlock lines={2} />
        )
      ) : (
        <Pipeline ov={ov.data} model={model.data ?? null} modelError={model.error?.message ?? null} modelLoading={model.loading} />
      )}
    </>
  )
}

function Pipeline({
  ov,
  model,
  modelError,
  modelLoading,
}: {
  ov: StudioOverview
  model: PredictionModelInfo | null
  modelError: string | null
  modelLoading: boolean
}): ReactElement {
  const t = ov.tagging
  const tagged = t.consensus + t.sampleOnly + t.modelOnly
  const active = ov.sources.filter((s) => s.active)
  const activeSources = active.map((s) => s.source)
  const synthetic = usesSynthetic(activeSources)
  const events = active.reduce((a, s) => a + s.events, 0)
  const mg = ov.microgenres
  const au = ov.audience
  const em = ov.embeddings
  const kind = em ? embeddingKind(em.provider) : null
  const metrics = model?.run?.metrics?.model ?? null
  const modelSynthetic = usesSynthetic(model?.run?.sources)
  return (
    <div className="st-pipeline" role="list" aria-label="İçerik zekâsı hattı">
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 1, gridRow: 1 }}>
        <Node title="Etiketler" to="/studyo/etiketleme" value={fmtInt(tagged)} unit={`/ ${fmtInt(ov.catalog.titles)} başlık`}>
          <span>
            Uzlaşı {fmtInt(t.consensus)} · <Chip tone="sample">Örnek</Chip> {fmtInt(t.sampleOnly)} · <Chip tone="model">Model önerisi</Chip>{' '}
            {fmtInt(t.modelOnly)}
          </span>
          <span>
            Etiketsiz {fmtInt(t.untagged)} · insan fişi {fmtInt(t.humanSheets)}
          </span>
          <span className="st-dim">Kılavuz {t.rubricVersion}</span>
        </Node>
      </div>
      <Arrow col={2} row={1} />
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 3, gridRow: 1 }}>
        <Node title="Mikro türler" to="/studyo/mikro-turler" value={mg ? fmtInt(mg.total) : '—'} state={mg ? 'on' : 'off'}>
          {mg ? (
            <>
              <span>
                Görünen {fmtInt(mg.visible)} · görünmeyen {fmtInt(mg.hidden)}
              </span>
              <span>Kapsanan başlık {fmtInt(mg.coveredTitles)}</span>
            </>
          ) : (
            <span>Servis yanıt vermedi</span>
          )}
        </Node>
      </div>
      <Arrow col={4} row={1} />
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 5, gridRow: 1 }}>
        <Node title="İzleme verisi" to="/studyo/kaynaklar" value={fmtInt(events)} unit="olay" state={active.length ? 'on' : 'off'}>
          {ov.sources.map((s) => (
            <span key={s.source} className={s.active ? '' : 'st-dim'}>
              {SOURCE_LABEL[s.source]}: {fmtInt(s.events)} olay · {fmtInt(s.viewers)} izleyici {s.active ? '· etkin' : '· etkin değil'}
            </span>
          ))}
          {synthetic && (
            <span>
              <SyntheticTag />
            </span>
          )}
        </Node>
      </div>
      <Arrow col={6} row={1} />
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 7, gridRow: 1 }}>
        <Node title="Zevk toplulukları" to="/studyo/topluluklar" value={au ? fmtInt(au.k) : '—'} unit="topluluk" state={au ? 'on' : 'off'}>
          {au ? (
            <>
              <span>{fmtInt(au.viewers)} izleyici kümelendi</span>
              <span>
                Siluet {fmtDec(au.silhouette, 3)} <SyntheticTag show={usesSynthetic(au.sources)} />
              </span>
              <span className="st-dim">{fmtDateTime(au.computedAt)}</span>
            </>
          ) : (
            <span>Henüz kümeleme yok</span>
          )}
        </Node>
      </div>
      <Arrow col={8} row={1} />
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 9, gridRow: '1 / span 2' }}>
        <Node
          title="Tahmin modeli"
          to="/studyo/tahmin"
          value={model?.ready ? model.version : modelLoading ? '…' : 'Hazır değil'}
          state={model?.ready ? 'hero' : 'off'}
        >
          {model?.ready ? (
            <>
              <span>
                Recall@10 <strong>{fmtPct(metrics?.recallAt10)}</strong> <SyntheticTag show={modelSynthetic} />
              </span>
              <span>NDCG@10 {fmtPct(metrics?.ndcgAt10)}</span>
              <span className="st-dim">Eğitim {fmtDate(model.trainedAt)}</span>
            </>
          ) : (
            <span>{modelError ? 'Model servisi yanıt vermedi' : (model?.note ?? 'Yükleniyor')}</span>
          )}
        </Node>
      </div>
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 5, gridRow: 2 }}>
        <Node title="Çekimler" to="/studyo/gomme" value={em ? fmtInt(em.shots) : '—'} unit="çekim" state={em ? 'on' : 'off'}>
          {em ? <span>Sahne algılanan {fmtInt(em.sceneDetected)} video; kalanlar anahtar karelerle</span> : <span>Servis yanıt vermedi</span>}
        </Node>
      </div>
      <Arrow col={6} row={2} />
      <div role="listitem" className="st-pipeline__cell" style={{ gridColumn: 7, gridRow: 2 }}>
        <Node title="Gömme" to="/studyo/gomme" value={em ? fmtInt(em.titles) : '—'} unit="başlık vektörü" state={em ? 'on' : 'off'}>
          {em && kind ? (
            <>
              <span>
                <Chip tone={kind.tone}>{kind.label}</Chip>
              </span>
              <span className="st-dim">
                {em.provider} · {em.modelVersion} · {em.dims} boyut
              </span>
              <span className="st-dim">Etiketler ve özet bağlam girdisi</span>
            </>
          ) : (
            <span>Henüz kurulmadı</span>
          )}
        </Node>
      </div>
      <span className="st-arrow st-arrow--up" style={{ gridColumn: 8, gridRow: 2 }} aria-hidden="true">
        ↗
      </span>
    </div>
  )
}
