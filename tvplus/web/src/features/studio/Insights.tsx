/**
 * İçgörüler (docs/ICERIK_ZEKASI.md §7; uçlar /api/studio/insights/*): katalog payı ↔ izlenme payı kırılımları
 * (tür, edinim, ülke, dil, RTÜK, film/dizi), yerli içerik, en büyük farkların düz okunuşu, 12 aylık zaman çizelgesi.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { CatalogMix, MixRow, Timeline } from '../../../../shared/intelligence'
import { useStudio } from './api'
import { LineChart, PairedBars, TwinBars } from './charts'
import { fmtHours, fmtInt, fmtMonth, fmtPct } from './format'
import { Disclosure, Loadable, LoadingBlock, Panel, SectionHead, Segmented, SOURCE_LABEL, Stat, SyntheticTag, usesSynthetic } from './parts'
import { gapReadings, pairedRows } from './scales'

type Scope = 'ALL' | 'MOVIE' | 'SHOW'
type Dim = Timeline['dimension']

export function InsightsSection(): ReactElement {
  const [scope, setScope] = useState<Scope>('ALL')
  const mix = useStudio<CatalogMix>(`/insights/mix?type=${scope}`)
  return (
    <>
      <SectionHead
        title="İçgörüler"
        lead="Katalog payı: bir özelliği taşıyan başlıkların oranı. İzlenme payı: o başlıkların izlenen saatteki oranı. Verim, ikisinin bölümüdür; 1'in üstü talebin arzın önünde olduğunu söyler."
        actions={
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
        }
      />
      <Loadable res={mix} what="Katalog karması" skeleton={<LoadingBlock lines={4} />}>
        {(m) => <Mix m={m} />}
      </Loadable>
      <TimelinePanel />
    </>
  )
}

function Mix({ m }: { m: CatalogMix }): ReactElement {
  const synthetic = usesSynthetic(m.sources)
  const readings = gapReadings(m.byGenre)
  const tag = synthetic ? <SyntheticTag /> : undefined
  const noViews = m.totalHours === 0
  return (
    <>
      <div className="st-stats">
        <Stat label="Başlık" value={fmtInt(m.totalTitles)} />
        <Stat label="İzlenen saat" value={fmtHours(m.totalHours)} note={<SyntheticTag show={synthetic} />} />
        <Stat label="Kaynaklar" value={<span className="st-small">{m.sources.map((s) => SOURCE_LABEL[s]).join(', ') || 'Yok'}</span>} />
        <Stat label="Yerli içerik — katalog" value={fmtPct(m.local.catalogShare)} />
        <Stat label="Yerli içerik — izlenme" value={fmtPct(m.local.viewShare)} note={<SyntheticTag show={synthetic} />} />
      </div>
      {readings.length > 0 && (
        <Panel className="st-reading">
          <p className="st-reading__text">
            {readings.join(' ')} {synthetic && <SyntheticTag />}
          </p>
        </Panel>
      )}
      {noViews && (
        <Panel>
          <p className="ui-meta">Etkin kaynaklarda izleme yok; yalnız katalog payları gösteriliyor.</p>
        </Panel>
      )}
      <div className="st-grid2 st-grid2--wide-left">
        <Panel title="Tür" sub="Verime göre sıralı. Bir yapım birden çok tür taşıdığından paylar toplamda %100'ü aşar.">
          <PairedBars data={pairedRows(m.byGenre)} caption="Türlere göre katalog payı ve izlenme payı" sampleTag={tag} />
        </Panel>
        <div className="st-stack">
          <Panel title="Yerli içerik">
            <TwinBars a={m.local.catalogShare} b={m.local.viewShare} aLabel="Katalog payı" bLabel="İzlenme payı" />
          </Panel>
          <Breakdown title="Edinim" rows={m.byAcquisition} tag={tag} />
          <Breakdown title="Film / dizi" rows={m.byType} tag={tag} />
        </div>
      </div>
      <div className="st-grid3">
        <Breakdown title="Yapım ülkesi" rows={m.byCountry} tag={tag} limit={10} />
        <Breakdown title="Dil" rows={m.byLanguage} tag={tag} limit={10} />
        <Breakdown title="RTÜK işareti" rows={m.byMaturity} tag={tag} />
      </div>
    </>
  )
}

function Breakdown({ title, rows, tag, limit }: { title: string; rows: MixRow[]; tag: ReactElement | undefined; limit?: number }): ReactElement {
  const data = pairedRows(rows, limit)
  return (
    <Panel title={title} sub={limit && rows.length > limit ? `İlk ${limit} / ${rows.length}` : undefined}>
      <PairedBars data={data} caption={`${title}: katalog payı ve izlenme payı`} sampleTag={tag} />
    </Panel>
  )
}

/* ───────────── Zaman çizelgesi ───────────── */

function TimelinePanel(): ReactElement {
  const [dim, setDim] = useState<Dim>('genre')
  const tl = useStudio<Timeline>(`/insights/timeline?dimension=${dim}&months=12`)
  return (
    <Panel
      id="zaman"
      title="Zaman çizelgesi"
      sub="Son 12 ay: ay sonundaki birikimli katalog payı (kesikli, gri) ve o ayın izlenme payı (dolu)."
      actions={
        <Segmented<Dim>
          label="Boyut"
          value={dim}
          onChange={setDim}
          options={[
            { id: 'genre', label: 'Tür' },
            { id: 'acquisition', label: 'Edinim' },
            { id: 'origin', label: 'Köken' },
          ]}
        />
      }
    >
      <Loadable res={tl} what="Zaman çizelgesi" skeleton={<LoadingBlock lines={1} />}>
        {(t) => <TimelineChart key={dim} t={t} />}
      </Loadable>
    </Panel>
  )
}

function TimelineChart({ t }: { t: Timeline }): ReactElement {
  const ranked = useMemo(
    () => [...t.series].sort((a, b) => (b.viewShare[b.viewShare.length - 1] ?? 0) - (a.viewShare[a.viewShare.length - 1] ?? 0)),
    [t],
  )
  const [key, setKey] = useState<string | null>(null)
  const sel = ranked.find((s) => s.key === key) ?? ranked[0]
  if (!sel || !t.months.length) return <p className="ui-meta">Zaman çizelgesi boş.</p>
  const others = ranked.filter((s) => s !== sel)
  const last = t.months.length - 1
  return (
    <>
      <label className="st-select st-select--inline">
        <span className="st-select__label">Vurgulanan seri</span>
        <select value={sel.key} onChange={(e) => setKey(e.target.value)}>
          {ranked.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <LineChart
        xLabels={t.months.map(fmtMonth)}
        caption={`${sel.name}: ${fmtMonth(t.months[last]!)} ayında katalog payı ${fmtPct(sel.catalogShare[last])}, izlenme payı ${fmtPct(sel.viewShare[last])}.`}
        series={[
          ...others.map((s) => ({ key: s.key, label: s.name, values: s.viewShare, tone: 'faint' as const })),
          { key: `${sel.key}-c`, label: 'Katalog', values: sel.catalogShare, tone: 'base' as const, dashed: true },
          { key: sel.key, label: 'İzlenme', values: sel.viewShare, tone: 'accent' as const },
        ]}
        height={260}
      />
      <p className="ui-caption">İnce gri çizgiler diğer serilerin izlenme payı (bağlam).</p>
      <Disclosure summary="Tablo olarak">
        <table className="st-table st-table--compact">
          <caption className="ui-sr-only">{sel.name} aylık paylar</caption>
          <thead>
            <tr>
              <th scope="col">Ay</th>
              <th scope="col" className="st-num">
                Katalog payı
              </th>
              <th scope="col" className="st-num">
                İzlenme payı
              </th>
            </tr>
          </thead>
          <tbody>
            {t.months.map((m, i) => (
              <tr key={m}>
                <th scope="row">{fmtMonth(m)}</th>
                <td className="st-num">{fmtPct(sel.catalogShare[i])}</td>
                <td className="st-num">{fmtPct(sel.viewShare[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </>
  )
}
