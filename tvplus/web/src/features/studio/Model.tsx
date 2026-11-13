/**
 * Tahmin Modeli — stüdyonun ana ekranı (docs/ICERIK_ZEKASI.md §13.2; uçlar /api/studio/model*).
 *   Model kartı · Değerlendirme (model ↔ tabanlar ↔ soğuk başlangıç; kayıp eğrisi; sıralayıcı ağırlıkları)
 *   Eğitim (parametreler, RUNNING → DONE izleme, geçmiş) · Simülatör (topluluk → izleyici → izledikleri ↔ öneriler →
 *   gerekçe) ve "Bu profil".
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  CommunitiesResponse,
  ModelViewerSample,
  PredictionExplanation,
  PredictionModelInfo,
  RankingMetrics,
  TrainingRun,
  TrainRequest,
  ViewerPrediction,
} from '../../../../shared/intelligence'
import { useActiveProfile } from '../../app'
import { Button, ProgressBar, TextField, toast } from '../../ui'
import { studioSend, useAction, usePolling, useStudio } from './api'
import { GroupedBarChart, LineChart, SignedBars, type BarSeries } from './charts'
import { fmtDateTime, fmtDec, fmtDuration, fmtInt, fmtPct, fmtSigned } from './format'
import {
  Chip,
  Disclosure,
  Loadable,
  LoadingBlock,
  NotReady,
  Panel,
  SectionHead,
  SOURCE_LABEL,
  Stat,
  SyntheticTag,
  usesSynthetic,
} from './parts'
import { StudioTitleCard, TitleName } from './titles'

const METRIC_ROWS: { key: keyof RankingMetrics; label: string; hint: string }[] = [
  { key: 'recallAt10', label: 'Recall@10', hint: 'Sınama kümesinde izlenenlerin ilk 10 öneride yakalanan oranı' },
  { key: 'ndcgAt10', label: 'NDCG@10', hint: 'İsabetlerin sırası: üstteki isabet daha çok sayılır' },
  { key: 'hitRateAt10', label: 'İsabet oranı', hint: 'İlk 10 öneride en az bir isabet alan izleyici oranı' },
  { key: 'coverage', label: 'Kapsam', hint: 'Önerilerde en az bir kez yer alan başlıkların kataloğa oranı' },
]

const SERIES: (BarSeries & { field: 'model' | 'genreAffinity' | 'popularity' | 'coldStart' })[] = [
  { key: 'model', field: 'model', label: 'Model', tone: 'accent' },
  { key: 'genreAffinity', field: 'genreAffinity', label: 'Tür yakınlığı (taban)', tone: 'base1' },
  { key: 'popularity', field: 'popularity', label: 'Popülerlik (taban)', tone: 'base2' },
  { key: 'coldStart', field: 'coldStart', label: 'Soğuk başlangıç', tone: 'base3' },
]

const FEATURE_LABEL: Record<string, string> = {
  isbirlikci: 'İş birlikçi',
  icerik: 'İçerik kulesi',
  populerlik: 'Popülerlik',
  yenilik: 'Yenilik',
  topluluk: 'Topluluk kaldıracı',
  yarim: 'Yarım kalmış',
  listede: 'Listemde',
}
export const featureLabel = (name: string): string => FEATURE_LABEL[name] ?? name

export function ModelSection(): ReactElement {
  const info = useStudio<PredictionModelInfo>('/model')
  const runs = useStudio<TrainingRun[]>('/model/runs')
  const running = !!runs.data?.some((r) => r.status === 'RUNNING')
  usePolling(running, runs.refetch, 1500)
  // Eğitim bitince model kartını tazele
  const [wasRunning, setWasRunning] = useState(false)
  useEffect(() => {
    if (running) setWasRunning(true)
    else if (wasRunning) {
      setWasRunning(false)
      info.refetch()
      const last = runs.data?.[0]
      if (last?.status === 'DONE') toast('Eğitim bitti; ölçümler güncellendi.', { kind: 'success' })
      if (last?.status === 'FAILED') toast(`Eğitim başarısız: ${last.error ?? 'bilinmeyen hata'}`, { kind: 'error' })
    }
  }, [running, wasRunning, info, runs.data])

  return (
    <>
      <SectionHead
        title="Tahmin Modeli"
        lead="İzleme verisinden eğitilen öneri modeli. Her profil için her başlığa bir puan ve eşleşme yüzdesi üretir."
      />
      <Loadable res={info} what="Tahmin modeli" skeleton={<LoadingBlock lines={4} />}>
        {(m) => (
          <>
            <ModelCard m={m} />
            {m.ready && m.run?.metrics ? <Evaluation m={m} /> : <NotTrained m={m} />}
          </>
        )}
      </Loadable>
      <Training runs={runs} running={running} lastParams={info.data?.run?.params ?? runs.data?.[0]?.params ?? null} />
      {info.data?.ready && <Simulator synthetic={usesSynthetic(info.data.run?.sources)} />}
    </>
  )
}

/* ───────────── Model kartı ───────────── */

function ModelCard({ m }: { m: PredictionModelInfo }): ReactElement {
  const run = m.run
  const synthetic = usesSynthetic(run?.sources)
  return (
    <Panel
      id="model-kart"
      title="Model kartı"
      actions={m.ready ? <Chip tone="accent">{m.version}</Chip> : <Chip tone="muted">Eğitilmedi</Chip>}
      className="st-modelcard"
    >
      <div className="st-modelcard__grid">
        <div>
          <p className="ui-body">
            İzleyicilerin ne izlediğinden ve başlıkların içeriğinden öğrenir; her profil için başlıkları sıralar ve
            eşleşme yüzdesini verir. Hiç izlenmemiş yeni başlıkları içerik işaretleriyle puanlar.
          </p>
          <dl className="st-dl">
            <dt>Yöntem</dt>
            <dd>{m.algorithm || '—'}</dd>
            <dt>Eğitim</dt>
            <dd>{m.trainedAt ? fmtDateTime(m.trainedAt) : 'Henüz yok'}</dd>
            <dt>Veri</dt>
            <dd>
              {run ? (
                <>
                  {fmtInt(run.viewers)} izleyici · {fmtInt(run.titles)} başlık · {fmtInt(run.interactions)} etkileşim{' '}
                  <span className="st-dim">({run.sources.map((s) => SOURCE_LABEL[s]).join(', ') || 'kaynak yok'})</span>{' '}
                  <SyntheticTag show={synthetic} />
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt>İçerik işaretleri</dt>
            <dd className="st-chips">
              <Chip tone={m.contentSignals.tags ? 'neutral' : 'muted'}>Etiket ölçekleri {m.contentSignals.tags ? 'var' : 'yok'}</Chip>
              <Chip tone={m.contentSignals.microgenres ? 'neutral' : 'muted'}>
                Mikro türler {m.contentSignals.microgenres ? 'var' : 'yok'}
              </Chip>
              <Chip tone={m.contentSignals.embeddings ? 'neutral' : 'muted'}>
                Gömme: {m.contentSignals.embeddings ?? 'vektör yok'}
              </Chip>
              {m.contentSignals.embeddings?.startsWith('taban') && <Chip tone="sample">taban — eğitilmemiş</Chip>}
            </dd>
          </dl>
        </div>
        <aside className="st-note" aria-label="Veri notu">
          <p className="st-note__title">Veri notu</p>
          <p className="ui-meta">{m.note || '—'}</p>
          {run?.params && (
            <p className="ui-caption">
              Parametreler: {run.params.factors} etken · {run.params.iterations} yineleme · λ {fmtDec(run.params.regularization, 3)} · α{' '}
              {fmtDec(run.params.alpha, 1)} · tohum {run.params.seed}
            </p>
          )}
        </aside>
      </div>
    </Panel>
  )
}

function NotTrained({ m }: { m: PredictionModelInfo }): ReactElement {
  return (
    <Panel title="Değerlendirme">
      <NotReady title="Henüz ölçüm yok" detail={`${m.note || 'Model eğitilmedi.'} Aşağıdan bir eğitim başlatabilirsiniz.`} />
    </Panel>
  )
}

/* ───────────── Değerlendirme ───────────── */

function Evaluation({ m }: { m: PredictionModelInfo }): ReactElement {
  const run = m.run!
  const metrics = run.metrics!
  const synthetic = usesSynthetic(run.sources)
  const series = SERIES.filter((s) => s.field !== 'coldStart' || metrics.coldStart !== null)
  const values = METRIC_ROWS.map((r) => series.map((s) => metrics[s.field]?.[r.key] ?? null))
  const lift = metrics.popularity.recallAt10 > 0 ? metrics.model.recallAt10 / metrics.popularity.recallAt10 : null
  const summary = `Model Recall@10 ${fmtPct(metrics.model.recallAt10)}, popülerlik tabanı ${fmtPct(
    metrics.popularity.recallAt10,
  )}, tür yakınlığı ${fmtPct(metrics.genreAffinity.recallAt10)}${
    metrics.coldStart ? `, soğuk başlangıç ${fmtPct(metrics.coldStart.recallAt10)}` : ''
  }.`
  const weights = [...m.features].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
  return (
    <>
      <div className="st-stats">
        <Stat label="Recall@10" value={fmtPct(metrics.model.recallAt10)} note={<SyntheticTag show={synthetic} />} />
        <Stat label="NDCG@10" value={fmtPct(metrics.model.ndcgAt10)} note={<SyntheticTag show={synthetic} />} />
        <Stat label="İsabet oranı" value={fmtPct(metrics.model.hitRateAt10)} note={<SyntheticTag show={synthetic} />} />
        <Stat label="Kapsam" value={fmtPct(metrics.model.coverage)} note="katalogdan" />
        <Stat
          label="Popülerliğe göre"
          value={lift === null ? '—' : `${fmtDec(lift, 1)} kat`}
          note="Recall@10 oranı"
        />
      </div>
      <div className="st-grid2">
        <Panel
          id="degerlendirme"
          title="Değerlendirme"
          sub="Zamana göre ayrılmış sınama kümesi. Gri çubuklar karşılaştırma tabanları."
        >
          <GroupedBarChart groups={METRIC_ROWS.map((r) => r.label)} series={series} values={values} caption={summary} />
          <table className="st-table st-table--compact">
            <caption className="ui-sr-only">Sıralama ölçümleri</caption>
            <thead>
              <tr>
                <th scope="col">Ölçüm</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="st-num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((r, gi) => (
                <tr key={r.key}>
                  <th scope="row" title={r.hint}>
                    {r.label}
                  </th>
                  {series.map((s, si) => (
                    <td key={s.key} className={`st-num${s.tone === 'accent' ? ' st-strong' : ''}`}>
                      {fmtPct(values[gi]?.[si] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ui-caption">
            Soğuk başlangıç: eğitimde hiç görülmemiş başlıklar yalnız içerik kulesiyle sıralanır.{' '}
            {synthetic && 'Ölçümler sentetik örnekle hesaplandı; gerçek izleyici davranışını göstermez.'}
          </p>
        </Panel>
        <div className="st-stack">
          <Panel title="Kayıp eğrisi" sub={`Son eğitim · ${run.loss.length} yineleme · ${fmtDuration(run.durationMs)}`}>
            {run.loss.length > 1 ? (
              <LineChart
                xLabels={run.loss.map((_, i) => String(i + 1))}
                series={[{ key: 'loss', label: 'Kayıp', values: run.loss, tone: 'accent' }]}
                caption={`Eğitim kaybı ${fmtDec(run.loss[0], 3)} değerinden ${fmtDec(run.loss[run.loss.length - 1], 3)} değerine indi.`}
                format={(v) => fmtDec(v, 2)}
                height={170}
                xLabelEvery={Math.max(1, Math.ceil(run.loss.length / 8))}
              />
            ) : (
              <p className="ui-meta">Kayıp kaydı yok.</p>
            )}
          </Panel>
          <Panel title="Sıralayıcının ağırlıkları" sub="Ölçeklenmiş özelliklerin öğrenilmiş katsayıları">
            <SignedBars
              caption="Sıralayıcı özellik ağırlıkları"
              items={weights.map((f) => ({
                key: f.name,
                text: featureLabel(f.name),
                label: featureLabel(f.name),
                note: f.description,
                value: f.weight,
              }))}
            />
          </Panel>
        </div>
      </div>
    </>
  )
}

/* ───────────── Eğitim ───────────── */

const PARAM_FIELDS: { key: keyof TrainRequest; label: string; hint: string; step: string }[] = [
  { key: 'factors', label: 'Etken sayısı', hint: 'Vektör boyutu', step: '1' },
  { key: 'iterations', label: 'Yineleme', hint: 'ALS turu', step: '1' },
  { key: 'regularization', label: 'Düzenlileştirme (λ)', hint: 'Aşırı öğrenmeyi frenler', step: '0.01' },
  { key: 'alpha', label: 'Güven (α)', hint: 'c = 1 + α × ilgi', step: '1' },
  { key: 'seed', label: 'Tohum', hint: 'Aynı veri + tohum → aynı model', step: '1' },
]

function Training({
  runs,
  running,
  lastParams,
}: {
  runs: ReturnType<typeof useStudio<TrainingRun[]>>
  running: boolean
  lastParams: Required<TrainRequest> | null
}): ReactElement {
  const [params, setParams] = useState<Record<string, string>>({})
  const action = useAction()
  const body = (): TrainRequest | string => {
    const out: TrainRequest = {}
    for (const f of PARAM_FIELDS) {
      const raw = (params[f.key] ?? '').trim().replace(',', '.')
      if (!raw) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) return `${f.label} geçerli bir sayı olmalı.`
      out[f.key] = n
    }
    return out
  }
  const train = async () => {
    const b = body()
    if (typeof b === 'string') {
      toast(b, { kind: 'error' })
      return
    }
    const r = await action.run(() => studioSend<TrainingRun>('POST', '/model/train', b))
    if (r) {
      toast('Eğitim başladı.', { kind: 'info' })
      runs.refetch()
    }
  }
  const list = runs.data ?? []
  const current = list.find((r) => r.status === 'RUNNING') ?? null
  return (
    <Panel
      id="egitim"
      title="Eğitim"
      sub="Eğitim sunucuda arka planda çalışır. Aynı veri ve tohum aynı modeli verir."
      actions={
        <Button variant="accent" size="sm" onClick={train} busy={action.busy} disabled={running || action.busy}>
          {running ? 'Eğitiliyor' : 'Eğit'}
        </Button>
      }
    >
      <Disclosure summary="Parametreler (isteğe bağlı)">
        <div className="st-form-row">
          {PARAM_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              hint={f.hint}
              inputMode="decimal"
              placeholder={lastParams ? String(lastParams[f.key]) : 'varsayılan'}
              value={params[f.key] ?? ''}
              onChange={(v) => setParams((p) => ({ ...p, [f.key]: v }))}
            />
          ))}
        </div>
        <p className="ui-caption">Boş bırakılan alan sunucunun varsayılanını kullanır.</p>
      </Disclosure>
      {action.error && (
        <p className="st-error" role="alert">
          {action.error}
        </p>
      )}
      {current && (
        <div className="st-running" role="status">
          <Chip tone="accent">Sürüyor</Chip> {current.runId} · başladı {fmtDateTime(current.startedAt)} ·{' '}
          {current.loss.length} yineleme tamamlandı
          <ProgressBar
            value={current.params.iterations ? current.loss.length / current.params.iterations : 0}
            label="Eğitim ilerlemesi"
          />
        </div>
      )}
      <Loadable res={runs} what="Eğitim geçmişi" skeleton={<LoadingBlock lines={2} block={false} />}>
        {(rs) =>
          rs.length === 0 ? (
            <p className="ui-meta">Henüz eğitim yok.</p>
          ) : (
            <table className="st-table">
              <caption className="ui-sr-only">Eğitim geçmişi, en yeni önce</caption>
              <thead>
                <tr>
                  <th scope="col">Eğitim</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Başladı</th>
                  <th scope="col" className="st-num">
                    Süre
                  </th>
                  <th scope="col" className="st-num">
                    İzleyici
                  </th>
                  <th scope="col" className="st-num">
                    Etkileşim
                  </th>
                  <th scope="col" className="st-num">
                    Etken
                  </th>
                  <th scope="col" className="st-num">
                    Recall@10
                  </th>
                </tr>
              </thead>
              <tbody>
                {rs.slice(0, 10).map((r) => (
                  <tr key={r.runId}>
                    <td className="st-mono">{r.runId}</td>
                    <td>
                      <Chip tone={r.status === 'DONE' ? 'ok' : r.status === 'RUNNING' ? 'accent' : 'warn'}>
                        {r.status === 'DONE' ? 'Bitti' : r.status === 'RUNNING' ? 'Sürüyor' : 'Başarısız'}
                      </Chip>
                      {r.error && <span className="ui-caption"> {r.error}</span>}
                    </td>
                    <td>{fmtDateTime(r.startedAt)}</td>
                    <td className="st-num">{fmtDuration(r.durationMs)}</td>
                    <td className="st-num">{fmtInt(r.viewers)}</td>
                    <td className="st-num">{fmtInt(r.interactions)}</td>
                    <td className="st-num">{r.params.factors}</td>
                    <td className="st-num">
                      {fmtPct(r.metrics?.model.recallAt10)} <SyntheticTag show={!!r.metrics && usesSynthetic(r.sources)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Loadable>
    </Panel>
  )
}

/* ───────────── Simülatör ───────────── */

type Who = { kind: 'viewer'; viewerId: string } | { kind: 'profile'; guid: string; name: string }

const whoQuery = (w: Who) => (w.kind === 'viewer' ? `viewerId=${encodeURIComponent(w.viewerId)}` : `profileGuid=${encodeURIComponent(w.guid)}`)

function Simulator({ synthetic }: { synthetic: boolean }): ReactElement {
  const comms = useStudio<CommunitiesResponse>('/communities')
  const profile = useActiveProfile()
  const [communityId, setCommunityId] = useState<string | null>(null)
  const [who, setWho] = useState<Who | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const items = comms.data?.items ?? []
  const cid = communityId ?? items[0]?.id ?? null
  const viewers = useStudio<ModelViewerSample[]>(cid ? `/model/viewers?communityId=${encodeURIComponent(cid)}&first=12` : null)
  // Topluluk değişince ilk örnek izleyici seçilir
  useEffect(() => {
    const first = viewers.data?.[0]
    if (first && (who === null || (who.kind === 'viewer' && !viewers.data!.some((v) => v.viewerId === who.viewerId))))
      setWho({ kind: 'viewer', viewerId: first.viewerId })
  }, [viewers.data, who])
  const pred = useStudio<ViewerPrediction>(who ? `/model/predict?${whoQuery(who)}&first=12` : null)
  useEffect(() => setPick(null), [who])
  const commName = useMemo(() => new Map(items.map((c) => [c.id, c.name])), [items])

  return (
    <Panel
      id="simulator"
      title="Simülatör"
      sub="Bir zevk topluluğundan örnek bir izleyici seçin: solda izledikleri, sağda modelin önerileri. Bir öneriye basınca gerekçesi açılır."
      className="st-sim"
    >
      <div className="st-sim__pickers">
        <label className="st-select">
          <span className="st-select__label">Zevk topluluğu</span>
          <select
            value={cid ?? ''}
            onChange={(e) => {
              setCommunityId(e.target.value)
              setWho(null)
            }}
            disabled={!items.length}
          >
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.name} ({fmtInt(c.size)})
              </option>
            ))}
          </select>
        </label>
        {profile && (
          <Button
            variant={who?.kind === 'profile' ? 'accent' : 'secondary'}
            size="sm"
            onClick={() => setWho({ kind: 'profile', guid: profile.guid, name: profile.name })}
          >
            Bu profil ({profile.name})
          </Button>
        )}
      </div>
      {comms.error && !items.length && <NotReady detail={`Topluluklar yüklenemedi: ${comms.error.message}`} onRetry={comms.refetch} />}
      <div className="st-sim__viewers" role="radiogroup" aria-label="Örnek izleyiciler">
        {viewers.loading && !viewers.data && <span className="ui-meta">İzleyiciler yükleniyor</span>}
        {viewers.error && <span className="ui-meta">İzleyiciler yüklenemedi: {viewers.error.message}</span>}
        {viewers.data?.length === 0 && <span className="ui-meta">Bu toplulukta örnek izleyici yok.</span>}
        {viewers.data?.map((v) => {
          const on = who?.kind === 'viewer' && who.viewerId === v.viewerId
          return (
            <button
              key={v.viewerId}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'st-viewer is-on' : 'st-viewer'}
              onClick={() => setWho({ kind: 'viewer', viewerId: v.viewerId })}
            >
              <span className="st-mono">{v.viewerId.slice(0, 12)}</span>
              <span className="st-dim">
                {v.titles} başlık · {fmtDec(v.hours, 1)} sa
              </span>
            </button>
          )
        })}
      </div>
      {who && (
        <p className="ui-meta st-sim__who">
          {who.kind === 'profile' ? (
            <>
              Profil: <strong>{who.name}</strong> — kendi izleme özetinden anında çözülür.
            </>
          ) : (
            <>
              İzleyici <span className="st-mono">{who.viewerId}</span> <SyntheticTag show={synthetic} />
            </>
          )}
          {pred.data?.communityId && <> · topluluğu {commName.get(pred.data.communityId) ?? pred.data.communityId}</>}
        </p>
      )}
      {who && (
        <Loadable res={pred} what="Tahmin" skeleton={<LoadingBlock lines={1} />}>
          {(p) => (
            <div className="st-sim__cols">
              <div>
                <h3 className="st-h3">İzledikleri</h3>
                {p.history.length === 0 ? (
                  <p className="ui-meta">İzleme geçmişi yok. Öneriler popülerlik ve içerikten gelir.</p>
                ) : (
                  <div className="st-cards st-cards--sm">
                    {p.history.map((h) => (
                      <StudioTitleCard
                        key={h.titleId}
                        id={h.titleId}
                        progress={h.engagement}
                        caption={`İlgi ${fmtPct(h.engagement, 0)}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="st-h3">Modelin önerileri</h3>
                {p.picks.length === 0 ? (
                  <p className="ui-meta">Öneri yok.</p>
                ) : (
                  <div className="st-cards">
                    {p.picks.map((k, i) => (
                      <StudioTitleCard
                        key={k.titleId}
                        id={k.titleId}
                        selected={pick === k.titleId}
                        onClick={() => setPick(pick === k.titleId ? null : k.titleId)}
                        badge={<span className="st-rank">{i + 1}</span>}
                        caption={<span className="st-match">%{Math.round(k.match)} Eşleşme</span>}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Loadable>
      )}
      {who && pick !== null && <Explanation who={who} titleId={pick} onClose={() => setPick(null)} />}
    </Panel>
  )
}

function Explanation({ who, titleId, onClose }: { who: Who; titleId: number; onClose: () => void }): ReactElement {
  const ex = useStudio<PredictionExplanation>(`/model/explain?${whoQuery(who)}&titleId=${titleId}`)
  return (
    <section className="st-explain" aria-label="Önerinin gerekçesi" tabIndex={-1}>
      <header className="st-explain__head">
        <h3 className="st-h3">
          Neden <TitleName id={titleId} />?
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Kapat
        </Button>
      </header>
      <Loadable res={ex} what="Gerekçe" skeleton={<LoadingBlock lines={2} block={false} />}>
        {(e) => {
          const parts = [...e.parts].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
          return (
            <div className="st-explain__grid">
              <div>
                <p className="st-explain__match">
                  <span className="st-match st-match--lg">%{Math.round(e.match)} Eşleşme</span>{' '}
                  <span className="st-dim">puan {fmtSigned(e.score, 3)}</span>
                </p>
                <ul className="st-reasons">
                  {e.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <h4 className="st-h4">Sıralayıcı özelliklerinin katkısı</h4>
                <SignedBars
                  caption="Özellik katkıları"
                  items={parts.map((p) => ({
                    key: p.name,
                    text: featureLabel(p.name),
                    label: featureLabel(p.name),
                    note: `değer ${fmtDec(p.value, 2)}`,
                    value: p.contribution,
                  }))}
                />
              </div>
              <div>
                <h4 className="st-h4">Çünkü izledi</h4>
                {e.becauseOf.length === 0 ? (
                  <p className="ui-meta">İzlediklerinden belirgin bir katkı yok.</p>
                ) : (
                  <div className="st-cards st-cards--sm">
                    {e.becauseOf.map((b) => (
                      <StudioTitleCard key={b.titleId} id={b.titleId} caption={`Katkı ${fmtDec(b.weight, 2)}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }}
      </Loadable>
    </section>
  )
}
