import { Link } from 'react-router-dom'
import { api } from '../../api'
import { BarChart } from '../../components/Charts'
import { ErrorBox, Loading, PageHeader } from '../../components/Feedback'
import { BRANDING_STATUS, ENTITY_STATUS, fmtNum, NUMBER_STATUS, REPUTATION_LABEL, type StatusInfo } from '../../format'
import { useApi } from '../../hooks'
import type { CountMap, ReputationLabel } from '../../types'

function sum(m: CountMap | undefined): number {
  return Object.values(m ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0)
}

function StatusList({ map, counts }: { map: Record<string, StatusInfo>; counts: CountMap | undefined }) {
  return (
    <ul className="status-list">
      {Object.entries(map).map(([k, info]) => (
        <li key={k}>
          <span className={`dot dot-${info.tone}`} aria-hidden="true" />
          <span>{info.text}</span>
          <strong>{fmtNum(counts?.[k] ?? 0)}</strong>
        </li>
      ))}
    </ul>
  )
}

const LABEL_COLORS: Record<ReputationLabel, string> = {
  clean: '--c-success',
  watch: '--c-info',
  suspect: '--c-warning',
  spam: '--c-danger',
  unknown: '--c-muted',
}

export function DashboardPage() {
  const stats = useApi(() => api.stats(), 'stats')
  const rep = useApi(() => api.reputationStats(), 'rep')

  const s = stats.data
  const r = rep.data
  const labelData = (Object.keys(REPUTATION_LABEL) as ReputationLabel[])
    .filter((l) => l !== 'unknown' || (r?.labels.unknown ?? 0) > 0)
    .map((l) => ({ label: REPUTATION_LABEL[l].text, value: r?.labels[l] ?? 0, color: LABEL_COLORS[l] }))

  return (
    <>
      <PageHeader title="Genel bakış" description="Kayıt, doğrulama ve itibar durumunun özeti" />
      <ErrorBox message={stats.error} onRetry={stats.reload} />
      {!s && !stats.error ? <Loading /> : null}
      {s ? (
        <>
          <section className="kpis" aria-label="Öne çıkan sayılar">
            <Link to="/operator/dogrulama?status=in_review" className="kpi kpi-link">
              <span className="kpi-label">İnceleme bekleyen şirket</span>
              <span className="kpi-value">{fmtNum(s.entities.in_review ?? 0)}</span>
            </Link>
            <Link to="/operator/marka" className="kpi kpi-link">
              <span className="kpi-label">Onay bekleyen marka</span>
              <span className="kpi-value">{fmtNum(s.branding.pending_review ?? 0)}</span>
            </Link>
            <Link to="/operator/numaralar?status=pending_verification" className="kpi kpi-link">
              <span className="kpi-label">Doğrulama bekleyen numara</span>
              <span className="kpi-value">{fmtNum(s.numbers.pending_verification ?? 0)}</span>
            </Link>
            <div className="kpi">
              <span className="kpi-label">Etkin numara kaydı</span>
              <span className="kpi-value">{fmtNum(s.numbers.active ?? 0)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Son 24 saatteki çağrı olayı</span>
              <span className="kpi-value">{r ? fmtNum(r.events_24h) : '…'}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Son 7 gündeki geri bildirim</span>
              <span className="kpi-value">{r ? fmtNum(r.feedback_7d) : '…'}</span>
            </div>
          </section>
          <div className="grid-3">
            <section className="card">
              <h2>Şirketler <span className="muted small">({fmtNum(sum(s.entities))})</span></h2>
              <StatusList map={ENTITY_STATUS} counts={s.entities} />
            </section>
            <section className="card">
              <h2>Numaralar <span className="muted small">({fmtNum(sum(s.numbers))})</span></h2>
              <StatusList map={NUMBER_STATUS} counts={s.numbers} />
            </section>
            <section className="card">
              <h2>Markalar <span className="muted small">({fmtNum(sum(s.branding))})</span></h2>
              <StatusList map={BRANDING_STATUS} counts={s.branding} />
            </section>
          </div>
        </>
      ) : null}
      <section className="card">
        <h2>İtibar etiketi dağılımı</h2>
        <ErrorBox message={rep.error} onRetry={rep.reload} />
        {r ? (
          <>
            <BarChart title="İtibar etiketi dağılımı" data={labelData} />
            <p className="muted small">
              Puan eşikleri: 70 ve üzeri temiz, 50–69 izlemede, 30–49 şüpheli, 30 altı spam.{' '}
              <Link to="/operator/itibar">En kötü puanları gör</Link>
            </p>
          </>
        ) : !rep.error ? (
          <Loading />
        ) : null}
      </section>
    </>
  )
}
