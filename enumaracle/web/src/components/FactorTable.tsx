import type { Factor, Score } from '../types'
import { fmtDateTime, fmtNum, REPUTATION_LABEL } from '../format'
import { StatusBadge } from './StatusBadge'
import { ScoreGauge } from './Charts'

function fmtVal(v: number): string {
  return Number.isInteger(v) ? fmtNum(v) : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(v)
}

export function FactorTable({ factors }: { factors: Factor[] | null | undefined }) {
  const list = factors ?? []
  if (list.length === 0) return <p className="muted">Puanı düşüren bir etken yok.</p>
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Puan etkenleri</caption>
        <thead>
          <tr>
            <th scope="col">Etken</th>
            <th scope="col" className="num">
              Değer
            </th>
            <th scope="col" className="num">
              Eşik
            </th>
            <th scope="col" className="num">
              Puan etkisi
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => (
            <tr key={f.code}>
              <td>
                <span>{f.text_tr || f.code}</span>
                <span className="muted small block">{f.code}</span>
              </td>
              <td className="num">{fmtVal(f.value)}</td>
              <td className="num">{fmtVal(f.threshold)}</td>
              <td className="num">
                <span className={f.penalty > 0 ? 'penalty' : 'muted'}>
                  {f.penalty > 0 ? `−${f.penalty}` : '0'}
                </span>{' '}
                <span className="muted small">/ {f.max_penalty}</span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${f.max_penalty ? (f.penalty / f.max_penalty) * 100 : 0}%` }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ScoreSummary({ score }: { score: Score }) {
  return (
    <div className="score-summary">
      <ScoreGauge score={score.score} />
      <dl className="kv">
        <div>
          <dt>Etiket</dt>
          <dd>
            <StatusBadge map={REPUTATION_LABEL} value={score.label} />
          </dd>
        </div>
        <div>
          <dt>Ham puan</dt>
          <dd>{score.raw_score}</dd>
        </div>
        <div>
          <dt>Son 24 saat / 7 gün</dt>
          <dd>
            {fmtNum(score.calls_24h)} / {fmtNum(score.calls_7d)} çağrı
          </dd>
        </div>
        <div>
          <dt>Hesaplanma</dt>
          <dd>
            {fmtDateTime(score.computed_at)} <span className="muted small">({score.version})</span>
          </dd>
        </div>
        {score.floored ? (
          <div>
            <dt>Koruma</dt>
            <dd>Doğrulanmış kimlik nedeniyle taban puan (50) uygulandı</dd>
          </div>
        ) : null}
        {score.override_label ? (
          <div>
            <dt>Operatör kararı</dt>
            <dd>
              <StatusBadge map={REPUTATION_LABEL} value={score.override_label} /> — {fmtDateTime(score.override_until)} tarihine
              kadar
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}
