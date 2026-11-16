/**
 * Deney Laboratuvarı — simülasyonun gerçeklik karnesi (sim-karne) ve deney koşuları (deney-*: simülasyon, gercek-*:
 * gerçek deney). Uçlar: /api/studio/lab, /lab/deneyler, /lab/sonuc/<ad>; sözleşme shared/lab.ts. Salt okunur.
 *   Karne    puan · gerçek ↔ simülasyon ölçü tablosu (✓/✗, "uyduruldu") · haftalık etkin payı · parametre kaynakları
 *   Koşular  liste (karar rozetleri) → seçilen koşu: kol başına ölçüler ve göreli etkinin aralık grafiği
 *            (★ birincil, ◆ koruma), notlar, yorum sınırları, gerçek deneyde örneklem oranı denetimi (SRM)
 * Yol: /studyo/deney-laboratuvari[?kosu=<ad>] — seçili koşu adresin sorgusundadır (verilmezse en yeni koşu). Sorgu
 * bilerek seçildi: kabuk, yol değişince sayfayı yeniden kurar ve en üste kaydırır; yalnız sorgu değişince ikisi de olmaz.
 */
import { useMemo, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type {
  ExperimentArm,
  ExperimentMetric,
  ExperimentRun,
  FidelityMetric,
  LabEnvelope,
  SimAssumption,
  SimCalibration,
} from '../../../../shared/lab'
import type { ExperimentRunSummary } from '../../../../shared/types'
import { useStudio, type Resource } from './api'
import { LineChart } from './charts'
import { fmtDateTime, fmtDec, fmtInt, fmtPct } from './format'
import { IntervalChart, IntervalLegend, type IntervalRow, type IntervalTone } from './labCharts'
import { Cmd, DataLine, hasResult, LabEmpty, LabHint, StaleChip, SyntheticDemoBadge, useLabIndex } from './labParts'
import {
  fin,
  fmtDay,
  fmtInterval,
  fmtP,
  fmtSignedPct,
  fmtTimes,
  fmtUnit,
  fmtUnitDiff,
  linearAxis,
  pctTickDigits,
} from './labScales'
import { Chip, Disclosure, Loadable, LoadingBlock, Panel, SectionHead, Stat, type ChipTone } from './parts'

const RUNS_PATH = '/studyo/deney-laboratuvari'
/** Seçili koşunun sorgu parametresi */
const RUN_PARAM = 'kosu'

const DECISION: Record<ExperimentArm['decision'], { label: string; tone: ChipTone; hint: string }> = {
  aday: { label: 'Gerçek deneye aday', tone: 'ok', hint: 'Birincil ölçü iyileşti, koruma ölçüleri bozulmadı' },
  riskli: { label: 'Riskli', tone: 'warn', hint: 'Bir koruma ölçüsü bozuldu' },
  zararlı: { label: 'Zararlı', tone: 'warn', hint: 'Birincil ölçü bozuldu' },
  etkisiz: { label: 'Etkisiz', tone: 'muted', hint: 'Birincil ölçüde fark gösterilemedi' },
}

const VERDICT: Record<ExperimentMetric['verdict'], { label: string; tone: ChipTone; mark: IntervalTone }> = {
  iyi: { label: 'İyileşme', tone: 'ok', mark: 'good' },
  kötü: { label: 'Bozulma', tone: 'warn', mark: 'bad' },
  belirsiz: { label: 'Fark yok', tone: 'muted', mark: 'neutral' },
}

const SOURCE: Record<ExperimentRun['source'], { label: string; tone: ChipTone; hint: string }> = {
  simülasyon: { label: 'Simülasyon', tone: 'model', hint: 'İkizler uygulamanın kodunu simülasyonda sürdü' },
  gerçek: { label: 'Gerçek deney', tone: 'neutral', hint: 'İçe alınan maruziyet ve davranış verisi' },
}

function DecisionChip({
  decision,
  prefix,
  detail,
}: {
  decision: ExperimentArm['decision']
  /** Çok kollu koşuda kolun anahtarı */
  prefix?: string
  /** İmleç ipucunda kararın gerekçesi (kolun özet cümlesi); verilmezse kararın genel tanımı */
  detail?: string
}): ReactElement {
  const d = DECISION[decision] ?? { label: String(decision), tone: 'neutral' as const, hint: '' }
  return (
    <Chip tone={d.tone} title={detail || d.hint}>
      {prefix ? `${prefix}: ` : ''}
      {d.label}
    </Chip>
  )
}

function SourceChip({ source }: { source: ExperimentRun['source'] }): ReactElement {
  const s = SOURCE[source] ?? { label: String(source), tone: 'neutral' as const, hint: '' }
  return (
    <Chip tone={s.tone} title={s.hint}>
      {s.label}
    </Chip>
  )
}

export function LabSection(): ReactElement {
  const [params] = useSearchParams()
  const runParam = params.get(RUN_PARAM)
  const index = useLabIndex()
  const hasResults = (index.data?.results.length ?? 0) > 0
  const card = useStudio<LabEnvelope<SimCalibration>>(
    hasResult(index.data, 'sim-karne') ? '/lab/sonuc/sim-karne' : null,
  )
  const runs = useStudio<ExperimentRunSummary[]>(hasResults ? '/lab/deneyler' : null)
  const selected = runs.data?.find((r) => r.name === runParam)?.name ?? runs.data?.[0]?.name ?? null
  const detail = useStudio<LabEnvelope<ExperimentRun>>(selected ? `/lab/sonuc/${selected}` : null)
  const refresh = () => {
    index.refetch()
    card.refetch()
    runs.refetch()
    detail.refetch()
  }
  return (
    <>
      <SectionHead
        title="Deney Laboratuvarı"
        lead="Uygulama, verinizden kurulan simülasyonda çalıştırılır ve değişiklikler önce orada denenir. Önce simülatöre ne kadar güvenileceğini gösteren gerçeklik karnesi, sonra deney koşuları. Sonuçlar laboratuvardan gelir ve burada salt okunurdur."
        actions={
          <button type="button" className="st-link" onClick={refresh}>
            Yenile
          </button>
        }
      />
      <Loadable res={index} what="Laboratuvar" skeleton={<LoadingBlock lines={3} />}>
        {(ix) =>
          ix.results.length === 0 ? (
            <LabEmpty onRetry={refresh} />
          ) : (
            <>
              <DataLine status={ix.status} />
              <Panel
                id="karne"
                title="Simülasyonun gerçeklik karnesi"
                sub="Simülatör geçmişteki bir günün kullanıcılarından başlatılır, sonraki günleri yeniden yaşar ve sonuç gerçekte olanla karşılaştırılır. Simülasyon sonuçlarına ne kadar güvenileceğinin ölçüsüdür."
              >
                {hasResult(ix, 'sim-karne') ? (
                  <Loadable res={card} what="Gerçeklik karnesi" skeleton={<LoadingBlock lines={3} />}>
                    {(env) => <Scorecard env={env} currentRev={ix.status?.dataRev ?? null} />}
                  </Loadable>
                ) : (
                  <LabHint title="Karne henüz çıkarılmadı">
                    Terminalde <Cmd>npm run lab -- sim karne</Cmd> çalıştırın: simülatör kalibre edilir ve gerçek
                    veriyle karşılaştırılır.
                  </LabHint>
                )}
              </Panel>
              <Runs
                runs={runs}
                selected={selected}
                missing={runParam && runs.data && !runs.data.some((r) => r.name === runParam) ? runParam : null}
              />
              {selected && (
                <Loadable res={detail} what="Deney sonucu" skeleton={<LoadingBlock lines={4} />}>
                  {(env) => <RunDetail env={env} currentRev={ix.status?.dataRev ?? null} />}
                </Loadable>
              )}
            </>
          )
        }
      </Loadable>
    </>
  )
}

/* ───────────── Gerçeklik karnesi ───────────── */

const ASSUMPTION_SOURCES: { id: SimAssumption['source']; label: string; tone: ChipTone; note: string }[] = [
  { id: 'veriden', label: 'Veriden', tone: 'ok', note: 'gerçek veriden kestirildi' },
  { id: 'kalibrasyon', label: 'Kalibrasyon', tone: 'model', note: 'gerçek veriye uydurularak bulundu' },
  { id: 'varsayım', label: 'Varsayım', tone: 'warn', note: 'veride karşılığı yok; sonuçların en zayıf yeri' },
]

function Scorecard({ env, currentRev }: { env: LabEnvelope<SimCalibration>; currentRev: string | null }): ReactElement {
  const c = env.data
  const free = c.metrics.filter((m) => !m.calibrated)
  const fitted = c.metrics.filter((m) => m.calibrated)
  const off = free.filter((m) => !m.ok)
  const lastWeek = c.weekly[c.weekly.length - 1]
  const known = new Set<string>(ASSUMPTION_SOURCES.map((s) => s.id))
  const others = c.assumptions.filter((a) => !known.has(a.source))
  return (
    <>
      <p className="st-dataline">
        <span>
          Sınama: <strong>{fmtDay(c.from)}</strong> gününden başlayarak {fmtInt(c.horizon)} gün
        </span>
        <span>
          {fmtInt(c.twins)} ikiz (o gün etkin {fmtInt(c.alive)} gerçek kullanıcıdan)
        </span>
        <span>churn süresi {fmtInt(c.n)} gün</span>
        <span>karne {fmtDateTime(env.at)}</span>
        <SyntheticDemoBadge show={c.synthetic} />
        <StaleChip resultRev={env.dataRev} currentRev={currentRev} />
      </p>
      <div className="st-stats st-stats--lab">
        <Stat
          label="Karne puanı"
          value={
            <>
              {fmtDec(c.score, 2)} <span className="st-stat__unit">/ 1</span>
            </>
          }
          note="Uydurulmayan ölçülerin ortalama uyumu; 1 birebir aynı demektir."
        />
        <Stat
          label="Uyumlu ölçü"
          value={
            <>
              {fmtInt(free.length - off.length)} <span className="st-stat__unit">/ {fmtInt(free.length)}</span>
            </>
          }
          note={`Uydurulmayan ölçülerde. ${fmtInt(fitted.length)} ölçü kalibrasyonda gerçeğe uyduruldu; puana girmez.`}
        />
        <Stat
          label="Tercih kâhini AUC"
          value={fmtDec(c.oracle.auc, 2)}
          note={`İzleyicinin neyi seçeceğini kestiren model; gerçek seçimleri sıralama gücü (${fmtInt(c.oracle.rows)} satır).`}
        />
        <Stat
          label="Simülasyon dünyası"
          value={
            <>
              {fmtInt(c.world.titles)} <span className="st-stat__unit">başlık</span>
            </>
          }
          note={
            c.world.modelReady
              ? `Tahmin modeli ${fmtInt(c.world.viewers)} izleyiciyle eğitildi; ${fmtInt(c.world.communities)} zevk topluluğu.`
              : 'Tahmin modeli eğitilemedi.'
          }
        />
      </div>
      {off.length > 0 && (
        <p className="st-warnnote" role="note">
          <strong>✗ Simülatör şu ölçüleri yeniden üretemiyor:</strong> {off.map((m) => m.label).join('; ')}. Olası
          neden: dönem içinde değişen bir şey (sürüm, sezon, katalog) ya da modelde olmayan bir davranış. Bu ölçülere
          dayanan deney sonuçlarına temkinli bakın.
        </p>
      )}
      <h3 className="st-h3">Gerçek ↔ simülasyon</h3>
      <div className="st-scroll">
        <table className="st-table st-table--compact st-table--narrow">
          <caption className="ui-sr-only">Gerçeklik karnesi ölçüleri: gerçek ve simülasyon değerleri</caption>
          <thead>
            <tr>
              <th scope="col">Ölçü</th>
              <th scope="col" className="st-num">
                Gerçek
              </th>
              <th scope="col" className="st-num">
                Simülasyon
              </th>
              <th scope="col" className="st-num">
                Sim ÷ gerçek
              </th>
              <th scope="col">Uyum</th>
            </tr>
          </thead>
          <FidelityRows title="Uydurulmayan ölçüler — karne puanını bunlar belirler" rows={free} />
          <FidelityRows title="Kalibrasyonda uydurulan ölçüler — puana girmez" rows={fitted} />
        </table>
      </div>
      <div className="st-labgrid st-labgrid--gap">
        <div>
          <h3 className="st-h3">Haftalık etkin ikiz payı</h3>
          {c.weekly.length > 1 ? (
            <>
              <p className="st-legend" aria-hidden="true">
                <span className="st-legend__item">
                  <span className="st-key st-key--accent" />
                  Simülasyon
                </span>
                <span className="st-legend__item">
                  <span className="st-key st-key--base" />
                  Gerçek
                </span>
              </p>
              <LineChart
                xLabels={c.weekly.map((w) => String(w.week))}
                series={[
                  { key: 'real', label: 'Gerçek', values: c.weekly.map((w) => fin(w.real)), tone: 'base' },
                  { key: 'sim', label: 'Sim.', values: c.weekly.map((w) => fin(w.sim)), tone: 'accent' },
                ]}
                caption={
                  lastWeek
                    ? `Haftalık etkin ikiz payı: ${lastWeek.week}. haftada gerçek ${fmtPct(lastWeek.real)}, simülasyon ${fmtPct(lastWeek.sim)}.`
                    : 'Haftalık etkin ikiz payı'
                }
                width={470}
                height={210}
              />
              <p className="ui-caption">
                Yatay eksen: başlangıçtan sonraki hafta. Değer: o hafta en az bir gün etkin olan ikizlerin payı.
              </p>
              <Disclosure summary="Tablo olarak">
                <table className="st-table st-table--compact">
                  <caption className="ui-sr-only">Haftalık etkin ikiz payı: gerçek ve simülasyon</caption>
                  <thead>
                    <tr>
                      <th scope="col">Hafta</th>
                      <th scope="col" className="st-num">
                        Gerçek
                      </th>
                      <th scope="col" className="st-num">
                        Simülasyon
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.weekly.map((w) => (
                      <tr key={w.week}>
                        <th scope="row">{w.week}</th>
                        <td className="st-num">{fmtPct(w.real)}</td>
                        <td className="st-num">{fmtPct(w.sim)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            </>
          ) : (
            <p className="ui-meta">Haftalık karşılaştırma için ufuk çok kısa.</p>
          )}
        </div>
        <div>
          <h3 className="st-h3">Karne nasıl okunur</h3>
          <ul className="st-reasons st-labnotes">
            <li>
              <strong>Uyumlu (✓):</strong> simülasyon gerçeğin ±%25&apos;i içinde ya da, oranlarda, fark en çok 1,5
              puan.
            </li>
            <li>
              <strong>Uyduruldu:</strong> ölçü kalibrasyonda gerçeğe eşitlenecek biçimde ayarlandı. Uyması beklenir;
              kanıt sayılmaz ve puana girmez.
            </li>
            <li>
              <strong>Puan:</strong> uydurulmayan ölçülerde simülasyonun gerçeğe ortalama yakınlığı; 1 birebir aynı
              demektir.
            </li>
          </ul>
        </div>
      </div>
      <h3 className="st-h3">Simülatörün parametreleri nereden geliyor</h3>
      <div className="st-scroll">
        <table className="st-table st-table--compact st-table--narrow">
          <caption className="ui-sr-only">Simülatör parametreleri, kaynağına göre gruplu</caption>
          <thead>
            <tr>
              <th scope="col">Parametre</th>
              <th scope="col">Değer</th>
            </tr>
          </thead>
          {ASSUMPTION_SOURCES.map((s) => (
            <AssumptionRows
              key={s.id}
              head={
                <>
                  <Chip tone={s.tone}>{s.label}</Chip> <span className="st-dim">{s.note}</span>
                </>
              }
              rows={c.assumptions.filter((a) => a.source === s.id)}
            />
          ))}
          <AssumptionRows head={<Chip>Diğer</Chip>} rows={others} />
        </table>
      </div>
    </>
  )
}

function FidelityRows({ title, rows }: { title: string; rows: FidelityMetric[] }): ReactElement | null {
  if (!rows.length) return null
  return (
    <tbody>
      <tr className="st-grouprow">
        <th scope="colgroup" colSpan={5}>
          {title}
        </th>
      </tr>
      {rows.map((m) => (
        <tr key={m.key}>
          <th scope="row">{m.label}</th>
          <td className="st-num">{fmtUnit(m.real, m.unit)}</td>
          <td className="st-num">{fmtUnit(m.sim, m.unit)}</td>
          <td className="st-num">{fmtTimes(m.ratio)}</td>
          <td className="st-fit">
            {m.calibrated && m.ok ? (
              <span className="st-fit--fitted" title="Kalibrasyonda gerçeğe uyduruldu: uyması beklenir, puana girmez">
                <span aria-hidden="true">✓</span> uyduruldu
              </span>
            ) : (
              <span className={m.ok ? 'st-fit--ok' : 'st-fit--off'}>
                <span aria-hidden="true">{m.ok ? '✓' : '✗'}</span> {m.ok ? 'uyumlu' : 'sapıyor'}
                {m.calibrated && ' (uyduruldu)'}
              </span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  )
}

function AssumptionRows({ head, rows }: { head: ReactElement; rows: SimAssumption[] }): ReactElement | null {
  if (!rows.length) return null
  return (
    <tbody>
      <tr className="st-grouprow">
        <th scope="colgroup" colSpan={2}>
          {head}
        </th>
      </tr>
      {rows.map((a) => (
        <tr key={a.name}>
          <th scope="row">{a.name}</th>
          <td>{a.value}</td>
        </tr>
      ))}
    </tbody>
  )
}

/* ───────────── Deney koşuları ───────────── */

function Runs({
  runs,
  selected,
  missing,
}: {
  runs: Resource<ExperimentRunSummary[]>
  selected: string | null
  /** Adreste istenen ama listede olmayan koşu adı */
  missing: string | null
}): ReactElement {
  return (
    <Panel
      id="kosular"
      title="Deney koşuları"
      sub="En yeni önce. Simülasyon koşularında aynı ikizler her kolda yaşatılır (ikiz evren); gerçek deneyler içe alınan maruziyet verisinden çözümlenir. Bir koşuyu seçince ayrıntısı aşağıda açılır."
    >
      <Loadable res={runs} what="Deney koşuları" skeleton={<LoadingBlock lines={3} block={false} />}>
        {(list) =>
          list.length === 0 ? (
            <LabHint title="Kayıtlı deney koşusu yok">
              Tanımlı bir deneyi simülasyonda çalıştırmak için <Cmd>npm run lab -- deney calistir &lt;anahtar&gt;</Cmd>{' '}
              (tanımlar: <Cmd>npm run lab -- deney liste</Cmd>); veride maruziyeti olan gerçek bir deneyi çözümlemek
              için <Cmd>npm run lab -- deney gercek</Cmd>.
            </LabHint>
          ) : (
            <>
              {missing && (
                <p className="ui-meta" role="status">
                  &quot;{missing}&quot; adlı koşu bulunamadı; en yeni koşu gösteriliyor.
                </p>
              )}
              <div className="st-scroll">
                <table className="st-table st-runs">
                  <caption className="ui-sr-only">Deney koşuları, en yeni önce</caption>
                  <thead>
                    <tr>
                      <th scope="col">Deney</th>
                      <th scope="col">Kaynak</th>
                      <th scope="col" className="st-num">
                        Süre
                      </th>
                      <th scope="col">Çalıştırıldı</th>
                      <th scope="col">Karar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const on = r.name === selected
                      return (
                        <tr key={r.name} className={on ? 'is-on' : undefined}>
                          <th scope="row">
                            <Link
                              to={`${RUNS_PATH}?${RUN_PARAM}=${encodeURIComponent(r.name)}`}
                              className="st-runs__link"
                              aria-current={on ? 'true' : undefined}
                            >
                              {r.title}
                            </Link>
                            <span className="st-mono st-dim st-runs__name">{r.name}</span>
                          </th>
                          <td>
                            <SourceChip source={r.source} />
                            {r.source === 'simülasyon' && fin(r.fidelity) !== null && (
                              <span className="st-dim"> karne {fmtDec(r.fidelity, 2)}</span>
                            )}
                          </td>
                          <td className="st-num">{fmtInt(r.days)} gün</td>
                          <td>{fmtDateTime(r.at)}</td>
                          <td>
                            <span className="st-chips">
                              {r.arms.map((a) => (
                                <DecisionChip
                                  key={a.key}
                                  decision={a.decision}
                                  prefix={r.arms.length > 1 ? a.key : undefined}
                                  detail={a.summary}
                                />
                              ))}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </Loadable>
    </Panel>
  )
}

/* ───────────── Seçilen koşu ───────────── */

function RunDetail({ env, currentRev }: { env: LabEnvelope<ExperimentRun>; currentRev: string | null }): ReactElement {
  const run = env.data
  const sim = run.source === 'simülasyon'
  const unit = run.design === 'ikiz evren' ? 'ikiz' : 'kullanıcı'
  return (
    <Panel
      id="kosu"
      title={run.name}
      sub={
        <>
          <span className="st-mono">{run.key}</span> · {run.design} · {fmtInt(run.days)} gün · {fmtDateTime(run.at)}
        </>
      }
      actions={
        <>
          <SourceChip source={run.source} />
          <SyntheticDemoBadge show={run.synthetic} />
          <StaleChip resultRev={env.dataRev} currentRev={currentRev} />
        </>
      }
    >
      {sim ? (
        <aside className="st-banner" role="note" aria-label="Simülasyon uyarısı">
          <p className="st-banner__title">Simülasyon, gerçek A/B testinin yerini tutmaz</p>
          <p className="ui-meta">
            Bu sonuç modele dayalı bir öngörüdür: fikirleri eler, sıralar ve gerçek deneyin örneklemini planlamaya
            yarar. Karar vermeden önce değişikliği gerçek kullanıcılarla deneyin.{' '}
            {fin(run.fidelity) !== null ? (
              <>
                Simülatörün gerçeklik karnesi: <strong>{fmtDec(run.fidelity, 2)} / 1</strong>.
              </>
            ) : (
              <>
                Gerçeklik karnesi yok; güven için önce <Cmd>npm run lab -- sim karne</Cmd>.
              </>
            )}
          </p>
        </aside>
      ) : (
        <p className="st-srm" role="note">
          {run.srm ? (
            <>
              <Chip tone={run.srm.ok ? 'ok' : 'warn'}>{run.srm.ok ? 'SRM uyumlu' : 'SRM UYUMSUZ'}</Chip> Örneklem oranı
              denetimi: kol büyüklükleri beklenen paylarla {run.srm.ok ? 'uyumlu' : 'uyumsuz'} (p {fmtP(run.srm.p)};
              eşik {fmtP(run.srm.threshold ?? 0.001)} — yalnız bunun altı atama bozukluğu sayılır).
              {!run.srm.ok && ' Atama ya da olay kaydı bozuk olabilir; sonuçlara güvenmeyin.'}
            </>
          ) : (
            'Örneklem oranı denetimi (SRM) bu koşuda yok.'
          )}
        </p>
      )}
      {run.arms.map((arm, i) => (
        <Arm key={arm.key} run={run} arm={arm} unit={unit} showKey={i === 0} />
      ))}
      {run.arms.length === 0 && <p className="ui-meta">Bu koşuda karşılaştırılacak kol yok.</p>}
      <div className="st-labgrid">
        {run.notes.length > 0 && (
          <div>
            <h3 className="st-h3">Notlar</h3>
            <ul className="st-reasons st-labnotes">
              {run.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {run.caveats.length > 0 && (
          <div>
            <h3 className="st-h3">Yorum sınırları</h3>
            <ul className="st-reasons st-labnotes">
              {run.caveats.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}

const ROLE: Record<ExperimentMetric['role'], { mark: string; text: string }> = {
  birincil: { mark: '★', text: 'birincil ölçü' },
  koruma: { mark: '◆', text: 'koruma ölçüsü' },
  ikincil: { mark: '', text: '' },
}

function MetricLabel({ m }: { m: ExperimentMetric }): ReactElement {
  const role = ROLE[m.role] ?? ROLE.ikincil
  return (
    <span className="st-metric">
      <span className="st-role" title={role.text || undefined} aria-hidden="true">
        {role.mark}
      </span>
      <span>
        {m.label}
        {role.text && <span className="ui-sr-only"> ({role.text})</span>}
        {!m.higherIsBetter && <span className="st-metric__hint">düşük olması iyi</span>}
      </span>
    </span>
  )
}

function Arm({
  run,
  arm,
  unit,
  showKey,
}: {
  run: ExperimentRun
  arm: ExperimentArm
  unit: string
  /** İşaretlerin açıklaması (★ ◆, göreli fark, p) bu kolun altına yazılsın mı: çok kollu koşuda yalnız ilkinde */
  showKey: boolean
}): ReactElement {
  const axis = useMemo(
    () => linearAxis(arm.metrics.map((m) => ({ value: m.rel, lo: m.relLo, hi: m.relHi }))),
    [arm.metrics],
  )
  const digits = pctTickDigits(axis.ticks)
  const rows: IntervalRow[] = arm.metrics.map((m) => {
    const v = VERDICT[m.verdict] ?? VERDICT.belirsiz
    return {
      key: m.key,
      text: m.label,
      label: <MetricLabel m={m} />,
      value: m.rel,
      lo: m.relLo,
      hi: m.relHi,
      tone: v.mark,
      reading:
        fin(m.rel) === null
          ? 'tanımsız (kontrol 0)'
          : `${fmtSignedPct(m.rel)} ${fmtInterval(m.relLo, m.relHi, (x) => fmtSignedPct(x))}`,
      before: [fmtUnit(m.control, m.unit), fmtUnit(m.treatment, m.unit)],
      after: [
        fmtP(m.pAdj),
        <Chip key="v" tone={v.tone}>
          {v.label}
        </Chip>,
      ],
    }
  })
  return (
    <section className="st-arm" aria-label={`${run.control.name} ile ${arm.name} karşılaştırması`}>
      <header className="st-arm__head">
        <h3 className="st-h3">
          {run.control.name} <span className="st-dim">↔</span> {arm.name}
        </h3>
        <DecisionChip decision={arm.decision} />
      </header>
      <p className="ui-body">{arm.summary}</p>
      <p className="ui-meta">
        Değişen: {arm.changes.join(' · ') || '—'} <span className="st-dim">·</span> kontrol {fmtInt(run.control.n)},
        varyant {fmtInt(arm.n)} {unit}
      </p>
      {arm.metrics.length === 0 ? (
        <p className="ui-meta">Bu kol için ölçü yok.</p>
      ) : (
        <>
          <IntervalLegend
            items={[
              { tone: 'good', label: 'İyileşme' },
              { tone: 'bad', label: 'Bozulma' },
              { tone: 'neutral', label: 'Fark gösterilemedi' },
            ]}
            clipped={axis.clipped}
          />
          <IntervalChart
            rows={rows}
            axis={axis}
            caption={`${arm.name} kolunun kontrole göre göreli etkisi, ölçü başına %95 güven aralığıyla`}
            labelHead="Ölçü"
            readingHead="Göreli fark [%95 aralık]"
            formatTick={(t) => fmtSignedPct(t, digits)}
            before={[
              { key: 'c', head: 'Kontrol', num: true },
              { key: 't', head: 'Varyant', num: true },
            ]}
            after={[
              { key: 'p', head: <span title="Çoklu karşılaştırma düzeltmeli p">p (düz.)</span>, num: true },
              { key: 'v', head: 'Sonuç' },
            ]}
          />
          {showKey && (
            <p className="ui-caption">
              ★ birincil ölçü (karar bununla verilir) · ◆ koruma ölçüsü (bozulmamalı) · işaretsiz: ikincil (bilgi için).
              Göreli fark: (varyant − kontrol) ÷ kontrol. p (düz.): koruma ve ikincil ölçülerde çoklu karşılaştırmaya
              göre düzeltilmiş p.
            </p>
          )}
          <Disclosure summary="Ayrıntılı sayılar (mutlak fark, ham p, iyi olma olasılığı, yöntem)">
            <div className="st-scroll">
              <table className="st-table st-table--compact">
                <caption className="ui-sr-only">{arm.name} kolunun ölçü ayrıntıları</caption>
                <thead>
                  <tr>
                    <th scope="col">Ölçü</th>
                    <th scope="col" className="st-num">
                      Fark
                    </th>
                    <th scope="col" className="st-num">
                      %95 aralık
                    </th>
                    <th scope="col" className="st-num">
                      p
                    </th>
                    <th scope="col" className="st-num">
                      p (düzeltilmiş)
                    </th>
                    <th scope="col" className="st-num" title="Varyantın ölçüyü iyi yönde değiştirme olasılığı">
                      İyi olma olasılığı
                    </th>
                    <th scope="col">Yöntem</th>
                  </tr>
                </thead>
                <tbody>
                  {arm.metrics.map((m) => {
                    // Fark ve aralık uçları aynı basamakla yazılır
                    const scale = Math.max(
                      Math.abs(fin(m.diff) ?? 0),
                      Math.abs(fin(m.lo) ?? 0),
                      Math.abs(fin(m.hi) ?? 0),
                    )
                    return (
                      <tr key={m.key}>
                        <th scope="row">
                          <MetricLabel m={m} />
                        </th>
                        <td className="st-num">{fmtUnitDiff(m.diff, m.unit, scale)}</td>
                        <td className="st-num">{fmtInterval(m.lo, m.hi, (x) => fmtUnitDiff(x, m.unit, scale))}</td>
                        <td className="st-num">{fmtP(m.p)}</td>
                        <td className="st-num">{fmtP(m.pAdj)}</td>
                        <td className="st-num">{fmtPct(m.probBetter, 0)}</td>
                        <td>{m.method}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </>
      )}
    </section>
  )
}
