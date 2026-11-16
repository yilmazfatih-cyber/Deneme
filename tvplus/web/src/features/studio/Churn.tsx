/**
 * Kayıp Analizi — laboratuvarın `churn` sonucunun (shared/lab ChurnDeep; uç /api/studio/lab/sonuc/churn) salt okunur
 * görünümü: veri satırı · sayı kutuları (tanım, dönemlik churn, gitmiş olanlar, risk modeli) · bulgular · nedenler ·
 * tetikleyiciler (risk oranı, logaritmik eksen) · yeni kullanıcı tutunması · kim gidiyor · risk etkenleri · yorum sınırları.
 * Sonuçta bir bölüm yoksa (veri yetersiz → null) yalnız o panel bunu söyler. Yalnız toplamlar gösterilir.
 */
import { useMemo, useState, type ReactElement } from 'react'
import {
  REASON_LABEL,
  type ChurnDeep,
  type ChurnModel,
  type ChurnOverview,
  type ChurnReasons,
  type ChurnSegments,
  type ChurnTriggers,
  type DriverRow,
  type Finding,
  type LabEnvelope,
  type ReasonFamily,
  type TriggerRow,
} from '../../../../shared/lab'
import { useStudio } from './api'
import { fmtDec, fmtInt, fmtPct } from './format'
import { IntervalChart, IntervalLegend, SurvivalChart, type IntervalRow, type IntervalTone } from './labCharts'
import { Cmd, DataLine, hasResult, LabEmpty, LabHint, StaleChip, useLabIndex } from './labParts'
import {
  fin,
  fmtDay,
  fmtInterval,
  fmtP,
  fmtPlain,
  fmtTimes,
  fmtTimesTick,
  ivStrength,
  logAxis,
  significant,
} from './labScales'
import { Chip, Disclosure, Loadable, LoadingBlock, Panel, SectionHead, Segmented, Stat } from './parts'
import { niceMax } from './scales'

type Filter = 'sig' | 'all'

const familyLabel = (f: ReasonFamily | null | undefined): string => (f ? (REASON_LABEL[f] ?? f) : '')
/** Kısa aile adı (tablolarda): "İçerik (tükenme / uyum)" → "İçerik" */
const familyShort = (f: ReasonFamily): string => familyLabel(f).split(' ')[0] ?? f

export function ChurnSection(): ReactElement {
  const index = useLabIndex()
  const churn = useStudio<LabEnvelope<ChurnDeep>>(hasResult(index.data, 'churn') ? '/lab/sonuc/churn' : null)
  const refresh = () => {
    index.refetch()
    churn.refetch()
  }
  return (
    <>
      <SectionHead
        title="Kayıp Analizi"
        lead="Kullanıcılar ne zaman ve neden gidiyor (churn): tanım, nedenler, o günü son gün yapan deneyimler ve risk etkenleri. Sonuçlar laboratuvardan gelir ve burada salt okunurdur; yalnız toplamlar gösterilir."
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
          ) : !hasResult(ix, 'churn') ? (
            <>
              <DataLine status={ix.status} />
              <LabHint title="Churn analizi henüz çalıştırılmadı">
                {ix.status?.ready ? (
                  <>
                    Veri kurulmuş ama churn sonucu yok. Terminalde <Cmd>npm run lab -- churn</Cmd> çalıştırın, sonra bu
                    sayfayı yenileyin.
                  </>
                ) : (
                  <>
                    Önce analiz tablolarını kurun (<Cmd>npm run lab -- kur</Cmd>), sonra <Cmd>npm run lab -- churn</Cmd>{' '}
                    çalıştırın. Sıradaki adımı <Cmd>npm run lab -- durum</Cmd> söyler.
                  </>
                )}
              </LabHint>
            </>
          ) : (
            <Loadable res={churn} what="Churn sonucu" skeleton={<LoadingBlock lines={4} />}>
              {(env) => <ChurnBody env={env} currentRev={ix.status?.dataRev ?? null} />}
            </Loadable>
          )
        }
      </Loadable>
    </>
  )
}

function ChurnBody({ env, currentRev }: { env: LabEnvelope<ChurnDeep>; currentRev: string | null }): ReactElement {
  const d = env.data
  return (
    <>
      <DataLine status={d.status} at={env.at}>
        <StaleChip resultRev={env.dataRev} currentRev={currentRev} />
      </DataLine>
      <Kpis d={d} />
      <Findings findings={d.findings ?? []} />
      <Reasons r={d.reasons} />
      <Triggers t={d.triggers} />
      <div className="st-labgrid">
        <Survival ov={d.overview} />
        <WhoLeaves s={d.segments} />
      </div>
      <Drivers m={d.model} />
      {(d.caveats ?? []).length > 0 && (
        <Panel id="sinirlar" title="Yorum sınırları" sub="Bu sayfadaki sayıları okurken akılda tutulacaklar.">
          <ul className="st-reasons st-labnotes">
            {d.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}

/* ───────────── Sayı kutuları ───────────── */

function Kpis({ d }: { d: ChurnDeep }): ReactElement {
  const ov = d.overview
  const def = ov.definition
  const gap = def.gaps.find((g) => g.n === def.n)
  const last = ov.periods[ov.periods.length - 1]
  const quality = d.model ? (d.model.gbdt ?? d.model.logistic) : null
  const what = def.activity === 'izleme' ? 'izleme' : 'oturum'
  return (
    <div className="st-stats st-stats--lab">
      <Stat
        label="Churn tanımı"
        value={`${fmtInt(def.n)} gün`}
        note={
          def.chosenBy === 'veri'
            ? `${what} yok. Veriden seçildi: bu kadar sessiz kalanın geri dönme olasılığı ${
                gap ? fmtPct(gap.returnRate, 0) : '—'
              } (eşik ${fmtPct(def.threshold, 0)}).`
            : `${what} yok. Süre elle verildi.`
        }
      />
      <Stat
        label={`Dönemlik churn (${fmtInt(def.n)} gün)`}
        value={last ? fmtPct(last.rate) : '—'}
        note={
          last
            ? `Son dönem ${fmtDay(last.from)} – ${fmtDay(last.to)}: etkin ${fmtInt(last.base)} kullanıcıdan ${fmtInt(
                last.churned,
              )} sonraki dönemde hiç etkin olmadı.`
            : 'Veri penceresi bir dönemi ölçmeye yetmiyor.'
        }
      />
      <Stat
        label="Gitmiş olanların payı"
        value={fmtPct(ov.churnedShare)}
        note={`Pencere sonunda: en az bir kez etkin olmuş ${fmtInt(ov.everActive)} kullanıcıdan ${fmtInt(
          ov.churned,
        )} gitmiş, ${fmtInt(ov.active)} hâlâ etkin.`}
      />
      <Stat
        label="Risk modeli AUC"
        value={quality ? fmtDec(quality.auc, 2) : '—'}
        note={
          d.model && quality
            ? `${d.model.gbdt ? `Ağaç modeli; lojistik ${fmtDec(d.model.logistic.auc, 2)}` : 'Lojistik model'}. En riskli %10'da churn genelin ${fmtDec(
                quality.lift10,
                1,
              )} katı.`
            : 'Model için veri yetersiz.'
        }
      />
    </div>
  )
}

/* ───────────── Bulgular ───────────── */

const TOP_FINDINGS = 8
const SEVERITY_LABEL: Record<Finding['severity'], string> = { 3: 'yüksek', 2: 'orta', 1: 'düşük' }

function Findings({ findings }: { findings: Finding[] }): ReactElement {
  const [all, setAll] = useState(false)
  const shown = all ? findings : findings.slice(0, TOP_FINDINGS)
  return (
    <Panel
      id="bulgular"
      title="Bulgular"
      sub="Önem sırasıyla. Bulgular gözlemseldir; nedensellik için simülasyon ya da gerçek deney gerekir."
    >
      {findings.length === 0 ? (
        <p className="ui-meta">Bu sonuçta bulgu yok.</p>
      ) : (
        <ol className="st-findings">
          {shown.map((f, i) => (
            <li key={f.id} className={`st-finding st-finding--s${f.severity}`}>
              <span className="st-finding__rank" aria-hidden="true">
                {i + 1}
              </span>
              <div className="st-finding__body">
                <p className="st-finding__title">{f.title}</p>
                <p className="ui-meta">{f.evidence}</p>
                <p className="st-finding__meta">
                  <span title={`Önem ${f.severity} / 3`}>
                    <span aria-hidden="true">{'●'.repeat(f.severity) + '○'.repeat(Math.max(0, 3 - f.severity))}</span>{' '}
                    önem {SEVERITY_LABEL[f.severity] ?? f.severity}
                  </span>
                  {f.family && <Chip>{familyLabel(f.family)}</Chip>}
                  {f.next && (
                    <span>
                      Ayrıntı: <Cmd>npm run lab -- {f.next}</Cmd>
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {findings.length > TOP_FINDINGS && (
        <p className="st-more">
          <button type="button" className="st-link" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `İlk ${TOP_FINDINGS} bulguyu göster` : `Tüm bulguları göster (${fmtInt(findings.length)})`}
          </button>
        </p>
      )}
    </Panel>
  )
}

/* ───────────── Nedenler ───────────── */

function Reasons({ r }: { r: ChurnReasons | null }): ReactElement {
  if (!r)
    return (
      <Panel id="nedenler" title="Neden gidiyorlar">
        <p className="ui-meta">Neden dağılımı için veri yetersiz (çok az churn olayı).</p>
      </Panel>
    )
  const max = niceMax(
    Math.max(0, fin(r.baselineFraction) ?? 0, ...r.rows.flatMap((x) => [x.fraction, x.avoidableShare])),
  )
  // En uzun çubuk hücrenin %80'ine kadar uzar: değer etiketi hep sığar
  const width = (v: number): string => `${(Math.max(0, Math.min(1, (fin(v) ?? 0) / max)) * 80).toFixed(2)}%`
  return (
    <Panel
      id="nedenler"
      title="Neden gidiyorlar"
      sub={`${fmtInt(r.churners)} churn olayı (kullanıcının son uygulama günü) ortak risk modeliyle ayrıştırıldı. Pay: riskin o neden ailesine düşen kısmı; aileler ve taban risk toplamı %100'dür. Giderilirse: ailenin zararlı etkileri hiç olmasaydı churn'de beklenen en çok azalma (modele dayalı üst sınır).`}
    >
      <div className="st-scroll">
        <table className="st-paired st-reasontable">
          <caption className="ui-sr-only">Neden ailesine göre churn payı ve giderilirse beklenen en çok azalma</caption>
          <thead>
            <tr>
              <th scope="col">Neden ailesi · bu nedenle gidenlerin son gününde en sık görülenler</th>
              <th scope="col">
                <span className="st-key st-key--accent" aria-hidden="true" />
                Churn&apos;deki pay <span className="st-dim">·</span>{' '}
                <span className="st-key st-key--base" aria-hidden="true" />
                Giderilirse en çok azalma
              </th>
              <th scope="col" className="st-num">
                Birincil neden
              </th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.family}>
                <th scope="row" className="st-paired__name">
                  {x.label}
                  {x.signals.length > 0 && (
                    <ul className="st-signals">
                      {x.signals.map((s) => (
                        <li key={s.key}>
                          {s.label}{' '}
                          <span className="st-dim">
                            · bu gidenlerde {fmtPct(s.share)}; tüm günlerde {fmtPct(s.overall)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </th>
                <td>
                  <div className="st-paired__bars">
                    <span className="st-pbar">
                      <span className="st-pbar__fill st-pbar__fill--accent" style={{ width: width(x.fraction) }} />
                      <span className="st-pbar__val">{fmtPct(x.fraction)}</span>
                    </span>
                    <span className="st-pbar">
                      <span className="st-pbar__fill st-pbar__fill--base" style={{ width: width(x.avoidableShare) }} />
                      <span className="st-pbar__val">{fmtPct(x.avoidableShare)}</span>
                    </span>
                  </div>
                </td>
                <td className="st-num">
                  {fmtPct(x.share)}
                  <span className="st-dim"> · {fmtInt(x.churners)} olay</span>
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="st-paired__name">
                Taban risk
                <ul className="st-signals">
                  <li>
                    <span className="st-dim">Özel bir işarete bağlanamayan, hiçbir işaret yokken de var olan risk</span>
                  </li>
                </ul>
              </th>
              <td>
                <div className="st-paired__bars">
                  <span className="st-pbar">
                    <span className="st-pbar__fill st-pbar__fill--rest" style={{ width: width(r.baselineFraction) }} />
                    <span className="st-pbar__val">{fmtPct(r.baselineFraction)}</span>
                  </span>
                </div>
              </td>
              <td className="st-num">{fmtPct(r.baselineShare)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="ui-caption">
        Birincil neden: baskın nedeni o aile olan churn olaylarının payı. Cihaz, sürüm, şehir gibi bağlam boyutları
        neden sayılmaz; onlar &quot;Kim gidiyor&quot; tablosundadır.
      </p>
    </Panel>
  )
}

/* ───────────── Tetikleyiciler ───────────── */

function triggerTone(r: TriggerRow): IntervalTone {
  const rr = fin(r.rr)
  if (rr === null || !significant(r.pAdj)) return 'neutral'
  return rr > 1 ? 'bad' : rr < 1 ? 'good' : 'neutral'
}

function Triggers({ t }: { t: ChurnTriggers | null }): ReactElement {
  const [filter, setFilter] = useState<Filter>('sig')
  const all = useMemo(() => t?.rows ?? [], [t])
  const sig = useMemo(() => all.filter((r) => significant(r.pAdj)), [all])
  // Eksen tüm satırlardan kurulur: süzgeç değişince ölçek oynamaz
  const axis = useMemo(() => logAxis(all.map((r) => ({ value: r.rr, lo: r.lo, hi: r.hi }))), [all])
  if (!t)
    return (
      <Panel id="tetikleyiciler" title="Tetikleyiciler">
        <p className="ui-meta">Tetikleyici analizi için veri yetersiz.</p>
      </Panel>
    )
  const list = filter === 'sig' ? sig : all
  const rows: IntervalRow[] = list.map((r) => ({
    key: r.key,
    text: r.label,
    label: (
      <>
        {r.label}
        <span className="st-dim" title={familyLabel(r.family)}>
          {' '}
          · {familyShort(r.family)}
        </span>
      </>
    ),
    value: r.rr,
    lo: r.lo,
    hi: r.hi,
    tone: triggerTone(r),
    reading: `${fmtTimes(r.rr)} ${fmtInterval(r.lo, r.hi, (v) => fmtDec(v, 2))}`,
    before: [fmtPct(r.prevalence)],
    after: [fmtP(r.pAdj), (fin(r.attributableShare) ?? 0) > 0 ? fmtPct(r.attributableShare) : '—'],
  }))
  return (
    <Panel
      id="tetikleyiciler"
      className="st-labpanel"
      title="Tetikleyiciler"
      sub={`Hangi deneyim, yaşandığı günü kullanıcının son günü yapıyor? ${fmtInt(t.days)} uygulama gününden ${fmtInt(
        t.terminal,
      )} tanesi son gün (${fmtPct(t.baseRate, 2)}). Risk oranı: deneyimin yaşandığı günün son gün olma riski ÷ benzer kullanıcıların (kıdem × önceki etkinlik × cihaz) yaşamadığı günlerdeki risk.`}
      actions={
        <Segmented<Filter>
          label="Gösterilen deneyimler"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'sig', label: `Anlamlı (${sig.length})` },
            { id: 'all', label: `Tümü (${all.length})` },
          ]}
        />
      }
    >
      {list.length === 0 ? (
        <p className="ui-meta">
          {all.length === 0
            ? 'Bu sonuçta tetikleyici satırı yok.'
            : 'Hiçbir deneyimin etkisi anlamlı değil (düzeltilmiş p ≥ 0,05). Hepsini görmek için "Tümü"nü seçin.'}
        </p>
      ) : (
        <>
          <IntervalLegend
            items={[
              { tone: 'bad', label: 'Riski artırır (anlamlı)' },
              { tone: 'good', label: 'Koruyucu (anlamlı)' },
              { tone: 'neutral', label: 'Fark gösterilemedi' },
            ]}
          />
          <IntervalChart
            rows={rows}
            axis={axis}
            caption="Deneyimlere göre son gün olma risk oranı ve %95 güven aralığı"
            labelHead="Deneyim · neden ailesi"
            readingHead="Risk oranı [%95 aralık]"
            formatTick={fmtTimesTick}
            before={[
              { key: 'prev', head: <span title="Uygulama günlerinin kaçında yaşandı">Günlerde</span>, num: true },
            ]}
            after={[
              { key: 'p', head: <span title="Çoklu karşılaştırma düzeltmeli p">p (düz.)</span>, num: true },
              {
                key: 'attr',
                head: <span title="Son günlerin bu deneyime bağlanabilen payı">Atfedilen</span>,
                num: true,
              },
            ]}
          />
          <p className="ui-caption">
            Eksen logaritmiktir: 1×&apos;in sağı riski artırır, solu koruyucudur. Günlerde: deneyimin yaşandığı uygulama
            günlerinin payı. Atfedilen: son günlerin bu deneyime bağlanabilen kısmı (yalnız risk oranı 1&apos;in
            üstündeyse). p (düz.): çoklu karşılaştırmaya göre düzeltilmiş p (Benjamini–Hochberg).
          </p>
        </>
      )}
    </Panel>
  )
}

/* ───────────── Yeni kullanıcı tutunması ───────────── */

function Survival({ ov }: { ov: ChurnOverview }): ReactElement {
  const n = ov.definition.n
  const at = ov.survival.find((p) => p.day === n) ?? null
  const last = ov.survival[ov.survival.length - 1] ?? null
  return (
    <Panel
      id="tutunma"
      title="Yeni kullanıcı tutunması"
      sub={`Pencere içinde başlayan ${fmtInt(ov.newUsers)} kullanıcıdan hâlâ etkin kalanların payı (Kaplan–Meier). Gölge %95 güven aralığıdır; dikey eksen sıfırdan başlamaz.`}
    >
      {ov.survival.length === 0 ? (
        <p className="ui-meta">Tutunma eğrisi için veri yok (pencerede yeni kullanıcı yok ya da çok az).</p>
      ) : (
        <>
          <SurvivalChart
            points={ov.survival}
            markDay={n}
            caption={
              last
                ? `Yeni kullanıcı tutunması: ${last.day}. günde ${fmtPct(last.s)} hâlâ etkin${
                    at ? `; ${at.day}. günde ${fmtPct(at.s)}` : ''
                  }.`
                : 'Yeni kullanıcı tutunması'
            }
          />
          <p className="ui-meta">
            {at && (
              <>
                {at.day}. gün tutunma <strong>{fmtPct(at.s)}</strong> {fmtInterval(at.lo, at.hi, (v) => fmtPct(v))}
                .{' '}
              </>
            )}
            Yarısının bıraktığı gün:{' '}
            {fin(ov.medianLifetime) !== null ? `${fmtInt(ov.medianLifetime)}. gün` : 'pencere içinde ulaşılmadı'}.
          </p>
          <Disclosure summary="Tablo olarak">
            <table className="st-table st-table--compact">
              <caption className="ui-sr-only">Yeni kullanıcı tutunması, güne göre</caption>
              <thead>
                <tr>
                  <th scope="col">Gün</th>
                  <th scope="col" className="st-num">
                    Hâlâ etkin
                  </th>
                  <th scope="col" className="st-num">
                    %95 aralık
                  </th>
                </tr>
              </thead>
              <tbody>
                {ov.survival.map((p) => (
                  <tr key={p.day}>
                    <th scope="row">{p.day}</th>
                    <td className="st-num">{fmtPct(p.s)}</td>
                    <td className="st-num">{fmtInterval(p.lo, p.hi, (v) => fmtPct(v))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
        </>
      )}
    </Panel>
  )
}

/* ───────────── Kim gidiyor ───────────── */

function WhoLeaves({ s }: { s: ChurnSegments | null }): ReactElement {
  const [filter, setFilter] = useState<Filter>('sig')
  if (!s)
    return (
      <Panel id="kim" title="Kim gidiyor">
        <p className="ui-meta">Kırılım analizi için veri yetersiz.</p>
      </Panel>
    )
  const sig = s.dims.filter((r) => significant(r.p))
  const list = filter === 'sig' ? sig : s.dims
  return (
    <Panel
      id="kim"
      className="st-labpanel"
      title="Kim gidiyor"
      sub={`Boyut değerlerine göre churn; genel oran ${fmtPct(s.baseRate)}.`}
      actions={
        <Segmented<Filter>
          label="Gösterilen kırılımlar"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'sig', label: `Anlamlı (${sig.length})` },
            { id: 'all', label: `Tümü (${s.dims.length})` },
          ]}
        />
      }
    >
      {list.length === 0 ? (
        <p className="ui-meta">
          {s.dims.length === 0
            ? 'Bu sonuçta kırılım satırı yok.'
            : 'Hiçbir boyut değerinde churn genelden anlamlı ölçüde farklı değil. Hepsini görmek için "Tümü"nü seçin.'}
        </p>
      ) : (
        <div className="st-scroll st-scroll--tall">
          <table className="st-table st-table--compact">
            <caption className="ui-sr-only">Boyut değerlerine göre churn oranı ve genele oranı</caption>
            <thead>
              <tr>
                <th scope="col">Boyut = değer</th>
                <th scope="col" className="st-num" title="Bir kullanıcının bir anlık görüntüdeki durumu">
                  Kullanıcı-anı
                </th>
                <th scope="col" className="st-num">
                  Churn
                </th>
                <th scope="col" className="st-num" title="O değerdeki churn ÷ genel churn">
                  Genele göre
                </th>
                <th scope="col" className="st-num" title="Çoklu karşılaştırma düzeltmeli p">
                  p (düz.)
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const on = significant(r.p)
                return (
                  <tr key={`${r.dim}=${r.value}`}>
                    <th scope="row">
                      <span className="st-dim">{r.dim} = </span>
                      {r.value}
                    </th>
                    <td className="st-num">{fmtInt(r.n)}</td>
                    <td className="st-num">{fmtPct(r.churnRate)}</td>
                    <td className={`st-num${on ? ' st-strong' : ''}`}>{fmtTimes(r.lift)}</td>
                    <td className="st-num">{fmtP(r.p)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ui-caption">
        Kullanıcı-anı: bir kullanıcının bir anlık görüntüdeki durumu. Genele göre: o değerdeki churn ÷ genel churn
        (1×&apos;in üstü daha çok giden). p (düz.): çoklu karşılaştırmaya göre düzeltilmiş p.
      </p>
    </Panel>
  )
}

/* ───────────── Risk etkenleri ───────────── */

const TOP_DRIVERS = 12
const DIRECTION: Record<DriverRow['direction'], { text: string; hint: string }> = {
  'artınca artar': { text: '↑ artar', hint: 'Etken arttıkça churn artıyor' },
  'artınca azalır': { text: '↓ azalır', hint: 'Etken arttıkça churn azalıyor' },
  karışık: { text: '↕ karışık', hint: 'İlişki tek yönlü değil' },
  '-': { text: '—', hint: 'Yön tanımlı değil (kategorik ya da tek değerli etken)' },
}

function Drivers({ m }: { m: ChurnModel | null }): ReactElement {
  const [all, setAll] = useState(false)
  if (!m)
    return (
      <Panel id="etkenler" title="Risk etkenleri">
        <p className="ui-meta">Etken modeli için veri yetersiz (anlık görüntüde çok az satır ya da churn).</p>
      </Panel>
    )
  const shown = all ? m.drivers : m.drivers.slice(0, TOP_DRIVERS)
  return (
    <Panel
      id="etkenler"
      title="Risk etkenleri"
      sub={`Gidecek kullanıcıyı önceden ayıran işaretler, önem sırasıyla. Model ${fmtInt(m.rows)} kullanıcı-anıyla, son ${fmtInt(
        m.lookback,
      )} günün özelliklerinden kuruldu; geçmiş anlık görüntülerle eğitildi, en yenisiyle sınandı (lojistik AUC ${fmtDec(
        m.logistic.auc,
        3,
      )}${m.gbdt ? `, ağaç AUC ${fmtDec(m.gbdt.auc, 3)}` : ''}).`}
    >
      <div className="st-scroll">
        <table className="st-table st-table--compact st-table--wide">
          <caption className="ui-sr-only">Churn risk etkenleri</caption>
          <thead>
            <tr>
              <th scope="col">Etken · neden ailesi</th>
              <th scope="col" title="Etken arttıkça churn nasıl değişiyor">
                Artınca churn
              </th>
              <th scope="col">En riskli dilim</th>
              <th scope="col" className="st-num">
                Dilimde churn
              </th>
              <th scope="col" className="st-num" title="Tek başına churn edenleri ayırma gücü">
                Bilgi değeri
              </th>
              <th scope="col" className="st-num" title="Tek değişkenli AUC (0,5 rastgele, 1 kusursuz)">
                AUC
              </th>
              <th
                scope="col"
                className="st-num"
                title="Öteki etkenler sabitken, bir standart sapma artışın churn olasılık oranı"
              >
                Olasılık oranı [%95]
              </th>
              <th
                scope="col"
                className="st-num"
                title="Ağaç modelinde permütasyon önemi: etken karıştırılınca AUC ne kadar düşüyor"
              >
                Ağaç önemi
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const strength = ivStrength(x.iv)
              return (
                <tr key={x.feature}>
                  <th scope="row">
                    {x.label}
                    <span className="st-dim" title={familyLabel(x.family)}>
                      {' '}
                      · {familyShort(x.family)}
                    </span>
                  </th>
                  <td className="st-nowrap" title={(DIRECTION[x.direction] ?? DIRECTION['-']).hint}>
                    {(DIRECTION[x.direction] ?? DIRECTION['-']).text}
                  </td>
                  <td>
                    {x.worst.label}
                    <span className="st-dim"> · {fmtInt(x.worst.n)}</span>
                  </td>
                  <td className="st-num">
                    {fmtPct(x.worst.rate)}
                    <span className="st-dim"> · {fmtTimes(x.worst.lift)}</span>
                  </td>
                  <td className={`st-num${strength === 'güçlü' ? ' st-strong' : ''}`}>
                    {fmtDec(x.iv, 2)}
                    {strength && <span className="st-dim"> {strength}</span>}
                  </td>
                  <td className="st-num">{fmtDec(x.auc, 2)}</td>
                  <td className="st-num">
                    {fin(x.oddsRatio) === null ? (
                      '—'
                    ) : (
                      <>
                        {fmtDec(x.oddsRatio, 2)}{' '}
                        <span className="st-dim">{fmtInterval(x.orLo, x.orHi, (v) => fmtDec(v, 2))}</span>
                      </>
                    )}
                  </td>
                  <td className="st-num">{fmtPlain(x.importance, 3)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {m.drivers.length > TOP_DRIVERS && (
        <p className="st-more">
          <button type="button" className="st-link" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `İlk ${TOP_DRIVERS} etkeni göster` : `Tüm etkenleri göster (${fmtInt(m.drivers.length)})`}
          </button>
        </p>
      )}
      <p className="ui-caption">
        Bilgi değeri: 0,02&apos;nin altı zayıf, 0,02–0,1 orta, üstü güçlü. En riskli dilim: churn oranı en yüksek değer
        aralığı ve o dilimdeki kullanıcı-anı sayısı; yanındaki kat genel churn&apos;e oranıdır. Kategorik etkenlerde
        olasılık oranı hesaplanmaz.
      </p>
    </Panel>
  )
}
