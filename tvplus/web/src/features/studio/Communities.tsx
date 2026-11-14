/**
 * Zevk toplulukları (docs/ICERIK_ZEKASI.md §6; uçlar /api/studio/communities*): kümeleme özeti, aday k'ların
 * siluetleri, topluluk satırları (izleyici payı ↔ saat payı, ayırt edici özellikler, öne çıkan başlıklar, cihaz ve ülke),
 * "Yeniden hesapla" (isteğe bağlı k).
 */
import { useState, type ReactElement } from 'react'
import type { ClusteringRun, CommunitiesResponse, TasteCommunity } from '../../../../shared/intelligence'
import { Button, TextField, toast } from '../../ui'
import { studioSend, useAction, useStudio } from './api'
import { TwinBars } from './charts'
import { fmtDateTime, fmtDec, fmtDuration, fmtInt, fmtPct, fmtRatio } from './format'
import { niceMax } from './scales'
import {
  countryName,
  DEVICE_LABEL,
  Loadable,
  LoadingBlock,
  Panel,
  SectionHead,
  SOURCE_LABEL,
  Stat,
  SyntheticTag,
  usesSynthetic,
} from './parts'
import { StudioTitleCard } from './titles'

const KIND_LABEL = { GENRE: 'Tür', MICROGENRE: 'Mikro tür', DESCRIPTOR: 'Niteleyici', FACET: 'Yüz' } as const

export function CommunitiesSection(): ReactElement {
  const res = useStudio<CommunitiesResponse>('/communities')
  const [k, setK] = useState('')
  const action = useAction()
  const recompute = async () => {
    const n = Number(k)
    const body = k.trim() && Number.isInteger(n) && n >= 1 ? { k: n } : {}
    const r = await action.run(() => studioSend<ClusteringRun>('POST', '/communities/recompute', body))
    if (r) {
      toast(`Yeniden hesaplandı: ${r.k} topluluk.`, { kind: 'success' })
      res.refetch()
    }
  }
  return (
    <>
      <SectionHead
        title="Zevk Toplulukları"
        lead="İzleyiciler yaşa ya da cinsiyete göre değil, ne izlediklerine göre kümelenir. Aynı toplulukta farklı ülkelerden izleyiciler olabilir."
        actions={
          <div className="st-inline">
            <TextField
              label="k (isteğe bağlı)"
              inputMode="numeric"
              placeholder="veriden"
              value={k}
              onChange={(v) => setK(v.replace(/\D/g, ''))}
            />
            <Button variant="accent" size="sm" onClick={recompute} busy={action.busy} disabled={action.busy}>
              Yeniden hesapla
            </Button>
          </div>
        }
      />
      {action.error && (
        <p className="st-error" role="alert">
          {action.error}
        </p>
      )}
      <Loadable res={res} what="Zevk toplulukları" skeleton={<LoadingBlock lines={4} />}>
        {(d) =>
          d.run === null ? (
            <Panel>
              <p className="ui-meta">
                Henüz kümeleme yok. İzleme verisi geldikçe hesaplanır ya da yukarıdan başlatılabilir.
              </p>
            </Panel>
          ) : (
            <>
              <RunSummary run={d.run} />
              <div className="st-communities">
                {d.items.map((c) => (
                  <CommunityRow
                    key={c.id}
                    c={c}
                    synthetic={usesSynthetic(d.run!.sources)}
                    max={niceMax(Math.max(...d.items.map((x) => Math.max(x.share, x.hoursShare))))}
                  />
                ))}
                {d.items.length === 0 && <p className="ui-meta">Topluluk yok.</p>}
              </div>
            </>
          )
        }
      </Loadable>
    </>
  )
}

function RunSummary({ run }: { run: ClusteringRun }): ReactElement {
  const synthetic = usesSynthetic(run.sources)
  const cands = run.candidates ?? []
  const top = Math.max(0.0001, ...cands.map((c) => c.silhouette ?? 0))
  return (
    <div className="st-grid2 st-grid2--wide-left">
      <div className="st-stats">
        <Stat
          label="İzleyici"
          value={fmtInt(run.viewers)}
          note={run.unassigned ? `${fmtInt(run.unassigned)} kümelenmedi` : undefined}
        />
        <Stat label="Topluluk (k)" value={fmtInt(run.k)} />
        <Stat label="Siluet" value={fmtDec(run.silhouette, 3)} note={<SyntheticTag show={synthetic} />} />
        <Stat label="Özellik" value={fmtInt(run.featureCount)} note={`${run.iterations} yineleme`} />
        <Stat
          label="Hesaplandı"
          value={<span className="st-small">{fmtDateTime(run.computedAt)}</span>}
          note={`${fmtDuration(run.durationMs)} · ${run.sources.map((s) => SOURCE_LABEL[s]).join(', ')}`}
        />
      </div>
      {cands.length > 0 && (
        <Panel title="Aday k'lar" sub="Siluete göre seçildi">
          <ul className="st-kbars" aria-label="Aday küme sayıları ve siluetleri">
            {cands.map((c) => (
              <li
                key={c.k}
                className={c.k === run.k ? 'is-on' : ''}
                aria-label={`k ${c.k}: siluet ${fmtDec(c.silhouette, 3)}`}
              >
                <span className="st-kbars__bar" style={{ height: `${((c.silhouette ?? 0) / top) * 100}%` }} />
                <span className="st-kbars__k">{c.k}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function CommunityRow({ c, synthetic, max }: { c: TasteCommunity; synthetic: boolean; max: number }): ReactElement {
  const devices = Object.entries(c.devices).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  const countries = Object.entries(c.countries).sort((a, b) => b[1] - a[1])
  return (
    <article className="st-community" aria-labelledby={`tc-${c.id}`}>
      <header className="st-community__head">
        <h3 id={`tc-${c.id}`} className="st-h3">
          <span className="st-mono st-dim">{c.id}</span> {c.name}
        </h3>
        <span className="ui-meta">
          {fmtInt(c.size)} izleyici · sıkılık {fmtDec(c.cohesion, 2)} <SyntheticTag show={synthetic} />
        </span>
      </header>
      <div className="st-community__grid">
        <div>
          <TwinBars a={c.share} b={c.hoursShare} aLabel="İzleyici payı" bLabel="Saat payı" max={max} />
          <p className="ui-caption">
            {c.hoursShare > c.share * 1.1
              ? 'Kişi başına ortalamadan çok izliyor.'
              : c.hoursShare < c.share * 0.9
                ? 'Kişi başına ortalamadan az izliyor.'
                : 'İzleme yoğunluğu ortalamaya yakın.'}
          </p>
          <p className="st-h4">Cihaz</p>
          <p className="ui-caption">
            {devices.map(([d, v]) => `${DEVICE_LABEL[d] ?? d} ${fmtPct(v ?? 0, 0)}`).join(' · ') || '—'}
          </p>
          <p className="st-h4">Ülke</p>
          <p className="ui-caption">
            {countries
              .slice(0, 4)
              .map(([k, v]) => `${countryName(k)} ${fmtPct(v, 0)}`)
              .join(' · ') || '—'}
          </p>
        </div>
        <div>
          <p className="st-h4">Ayırt edici özellikler</p>
          <ul className="st-features">
            {c.topFeatures.slice(0, 8).map((f) => (
              <li key={`${f.kind}-${f.key}`}>
                <span className="st-dim">{KIND_LABEL[f.kind]}</span> {f.name}{' '}
                <span className="st-num st-strong">{fmtRatio(f.lift)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="st-h4">Öne çıkan başlıklar</p>
          <div className="st-cards st-cards--xs">
            {c.topTitles.slice(0, 4).map((t) => (
              <StudioTitleCard
                key={t.titleId}
                id={t.titleId}
                caption={`erişim ${fmtPct(t.reach, 0)} · ${fmtRatio(t.lift)}`}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}
