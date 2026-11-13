/**
 * İçerik karması planlayıcısı (docs/ICERIK_ZEKASI.md §7; POST /api/studio/plan). Planlayıcı önerir, insanlar karar verir:
 *   puan = veriAğırlığı × talep + (1 − veriAğırlığı) × yargı ; maliyet verilirse saat/maliyet verimi; bütçe verilirse sığdırma.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { PlanInput, PlanResult } from '../../../../shared/intelligence'
import { GENRES } from '../../../../shared/taxonomy'
import { Button, TextField } from '../../ui'
import { studioSend, useAction } from './api'
import { TwinBars } from './charts'
import { fmtDateTime, fmtDec, fmtInt, fmtPct, fmtRatio, fmtSigned } from './format'
import { Disclosure, NotReady, Panel, SectionHead, Segmented, Stat } from './parts'

type Scope = 'ALL' | 'MOVIE' | 'SHOW'
const GENRE_LIST = Object.entries(GENRES).map(([key, g]) => ({ key, name: g.name }))

export function PlannerSection(): ReactElement {
  const [slots, setSlots] = useState('10')
  const [scope, setScope] = useState<Scope>('ALL')
  const [dataWeight, setDataWeight] = useState(0.7)
  const [judgment, setJudgment] = useState<Record<string, number>>({})
  const [cost, setCost] = useState<Record<string, string>>({})
  const [budget, setBudget] = useState('')
  const [result, setResult] = useState<PlanResult | null>(null)
  const action = useAction()

  const input = useMemo((): PlanInput | string => {
    const n = Number(slots)
    if (!Number.isInteger(n) || n < 1 || n > 1000) return 'Başlık sayısı 1–1000 arasında tam sayı olmalı.'
    const body: PlanInput = { slots: n, scope, dataWeight }
    const j = Object.fromEntries(Object.entries(judgment).filter(([, v]) => v !== 0))
    if (Object.keys(j).length) body.judgment = j
    const c: Record<string, number> = {}
    for (const [k, v] of Object.entries(cost)) {
      const x = Number(v.replace(',', '.'))
      if (v.trim() && Number.isFinite(x) && x > 0) c[k] = x
    }
    if (Object.keys(c).length) body.costPerTitle = c
    if (budget.trim()) {
      const b = Number(budget.replace(',', '.'))
      if (!Number.isFinite(b) || b <= 0) return 'Bütçe pozitif bir sayı olmalı.'
      if (!Object.keys(c).length) return 'Bütçe için en az bir türün başlık maliyeti girilmeli.'
      body.budget = b
    }
    return body
  }, [slots, scope, dataWeight, judgment, cost, budget])

  const plan = async () => {
    if (typeof input === 'string') return
    const r = await action.run(() => studioSend<PlanResult>('POST', '/plan', input))
    if (r) setResult(r)
  }
  // İlk açılışta varsayılanlarla bir plan
  useEffect(() => {
    void plan()
  }, [])

  return (
    <>
      <SectionHead
        title="Planlayıcı"
        lead="Eklenecek başlıkların türlere dağılımını önerir. Veri talebi gösterir; editör yargısı ve maliyet dengeyi kurar. Karar insanlarındır."
      />
      <Panel title="Girdiler">
        <div className="st-form-row st-form-row--plan">
          <TextField
            label="Eklenecek başlık"
            inputMode="numeric"
            value={slots}
            onChange={(v) => setSlots(v.replace(/\D/g, ''))}
          />
          <div className="st-field">
            <span className="st-select__label">Kapsam</span>
            <Segmented<Scope>
              label="Kapsam"
              value={scope}
              onChange={setScope}
              options={[
                { id: 'ALL', label: 'Tümü' },
                { id: 'MOVIE', label: 'Filmler' },
                { id: 'SHOW', label: 'Diziler' },
              ]}
            />
          </div>
          <label className="st-range">
            <span className="st-select__label">
              Veri ↔ yargı: veri %{Math.round(dataWeight * 100)} · yargı %{Math.round((1 - dataWeight) * 100)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={dataWeight}
              onChange={(e) => setDataWeight(Number(e.target.value))}
              aria-valuetext={`veri yüzde ${Math.round(dataWeight * 100)}`}
            />
            <span className="st-range__ends" aria-hidden="true">
              <span>Yalnız yargı</span>
              <span>Yalnız veri</span>
            </span>
          </label>
          <TextField
            label="Bütçe (isteğe bağlı)"
            inputMode="decimal"
            value={budget}
            onChange={setBudget}
            hint="Maliyet girilen türlere göre"
          />
        </div>
        <Disclosure
          summary={`Tür başına editör yargısı ve maliyet${Object.values(judgment).some((v) => v !== 0) ? ' · değişti' : ''}`}
        >
          <table className="st-table st-table--compact st-nudges">
            <caption className="ui-sr-only">Tür başına yargı (−1 azalt … +1 artır) ve başlık maliyeti</caption>
            <thead>
              <tr>
                <th scope="col">Tür</th>
                <th scope="col">Yargı (−1 … +1)</th>
                <th scope="col" className="st-num">
                  Değer
                </th>
                <th scope="col">Başlık maliyeti</th>
              </tr>
            </thead>
            <tbody>
              {GENRE_LIST.map((g) => {
                const v = judgment[g.key] ?? 0
                return (
                  <tr key={g.key}>
                    <th scope="row">{g.name}</th>
                    <td>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.25}
                        value={v}
                        aria-label={`${g.name} yargısı`}
                        aria-valuetext={fmtSigned(v, 2)}
                        onChange={(e) => setJudgment((j) => ({ ...j, [g.key]: Number(e.target.value) }))}
                      />
                    </td>
                    <td className="st-num">{v === 0 ? 'yansız' : fmtSigned(v, 2)}</td>
                    <td>
                      <input
                        className="st-input st-input--sm"
                        inputMode="decimal"
                        aria-label={`${g.name} başlık maliyeti`}
                        placeholder="—"
                        value={cost[g.key] ?? ''}
                        onChange={(e) => setCost((c) => ({ ...c, [g.key]: e.target.value }))}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="st-actions">
            <Button variant="ghost" size="sm" onClick={() => (setJudgment({}), setCost({}), setBudget(''))}>
              Hepsini sıfırla
            </Button>
          </div>
        </Disclosure>
        {typeof input === 'string' && <p className="st-error">{input}</p>}
        {action.error && (
          <p className="st-error" role="alert">
            {action.error}
          </p>
        )}
        <div className="st-actions">
          <Button
            variant="accent"
            size="sm"
            onClick={plan}
            busy={action.busy}
            disabled={action.busy || typeof input === 'string'}
          >
            Planla
          </Button>
        </div>
      </Panel>
      {result ? (
        <PlanView r={result} />
      ) : action.busy ? null : action.error ? (
        <NotReady detail={action.error} onRetry={plan} />
      ) : null}
    </>
  )
}

function PlanView({ r }: { r: PlanResult }): ReactElement {
  const rows = [...r.rows].sort((a, b) => b.slots - a.slots || b.targetShare - a.targetShare)
  const allocated = rows.reduce((a, x) => a + x.slots, 0)
  const maxSlots = Math.max(1, ...rows.map((x) => x.slots))
  const withCost = rows.some((x) => x.costEfficiency !== null)
  return (
    <>
      <Panel className="st-reading">
        <p className="st-reading__text">{r.note}</p>
        <p className="ui-caption">
          {fmtDateTime(r.generatedAt)} · {r.input.slots} başlık · veri ağırlığı {fmtDec(r.input.dataWeight, 2)} · kapsam{' '}
          {r.input.scope === 'ALL' ? 'tümü' : r.input.scope === 'MOVIE' ? 'filmler' : 'diziler'}
        </p>
      </Panel>
      <div className="st-stats">
        <Stat label="Dağıtılan" value={`${fmtInt(allocated)} / ${fmtInt(r.input.slots)}`} />
        <Stat label="Tür" value={fmtInt(rows.filter((x) => x.slots > 0).length)} note="en az bir başlık alan" />
        <Stat label="Boşluk" value={fmtInt(r.gaps.length)} note="talebi yüksek, başlığı az" />
        <Stat label="Beslenmeyen topluluk" value={fmtInt(r.underserved.length)} />
      </div>
      <Panel title="Önerilen dağılım" sub="Hedef pay ve başlık sayısı, gerekçeleriyle">
        <table className="st-table">
          <caption className="ui-sr-only">Tür başına önerilen başlık sayısı</caption>
          <thead>
            <tr>
              <th scope="col">Tür</th>
              <th scope="col" className="st-num">
                Başlık
              </th>
              <th scope="col">Hedef pay</th>
              <th scope="col" className="st-num">
                Katalog
              </th>
              <th scope="col" className="st-num">
                İzlenme
              </th>
              <th scope="col" className="st-num">
                Verim
              </th>
              <th scope="col" className="st-num">
                Talep
              </th>
              <th scope="col" className="st-num">
                Yargı
              </th>
              {withCost && (
                <th scope="col" className="st-num">
                  Saat/maliyet
                </th>
              )}
              <th scope="col">Gerekçe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className={x.slots === 0 ? 'is-dim' : undefined}>
                <th scope="row">{x.name}</th>
                <td className="st-num st-strong">{x.slots}</td>
                <td>
                  <span className="st-inlinebar" aria-hidden="true">
                    <span style={{ width: `${(x.slots / maxSlots) * 100}%` }} />
                  </span>{' '}
                  {fmtPct(x.targetShare)}
                </td>
                <td className="st-num">{fmtPct(x.catalogShare)}</td>
                <td className="st-num">{fmtPct(x.viewShare)}</td>
                <td className="st-num">{fmtRatio(x.efficiency)}</td>
                <td className="st-num">{fmtDec(x.demandScore, 2)}</td>
                <td className="st-num">{fmtDec(x.judgmentScore, 2)}</td>
                {withCost && <td className="st-num">{fmtDec(x.costEfficiency, 2)}</td>}
                <td className="st-reasons-cell">{x.reasons.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="st-grid2">
        <Panel title="Boşluklar" sub="Talebi yüksek ama başlığı az mikro türler">
          {r.gaps.length === 0 ? (
            <p className="ui-meta">Belirgin boşluk yok.</p>
          ) : (
            <ul className="st-kv">
              {r.gaps.map((g) => (
                <li key={g.microgenreId}>
                  <span>{g.name}</span>
                  <span className="st-num">
                    {g.size} başlık · talep {fmtRatio(g.demandLift)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Yeterince beslenmeyen topluluklar"
          sub="İzlenme payı, kendilerine uygun katalog payından belirgin büyük"
        >
          {r.underserved.length === 0 ? (
            <p className="ui-meta">Yok.</p>
          ) : (
            r.underserved.map((u) => (
              <div key={u.communityId} className="st-underserved">
                <p className="ui-body">
                  <span className="st-mono st-dim">{u.communityId}</span> {u.name}
                </p>
                <TwinBars a={u.supplyShare} b={u.demandShare} aLabel="Katalog (arz)" bLabel="İzlenme (talep)" />
              </div>
            ))
          )}
        </Panel>
      </div>
    </>
  )
}
