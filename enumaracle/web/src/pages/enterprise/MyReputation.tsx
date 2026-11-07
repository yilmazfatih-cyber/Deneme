import { Link } from 'react-router-dom'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ScoreGauge } from '../../components/Charts'
import { FactorTable, ScoreSummary } from '../../components/FactorTable'
import { ListState, Notice, PageHeader } from '../../components/Feedback'
import { StatusBadge } from '../../components/StatusBadge'
import { fmtTN, REPUTATION_LABEL } from '../../format'
import { useApi } from '../../hooks'

export function MyReputationPage() {
  const { has } = useAuth()
  const res = useApi(() => api.myReputation(), 'rep')
  return (
    <>
      <PageHeader title="İtibarım" description="Numaralarınızın arama davranışına göre hesaplanan itibar puanları" />
      <Notice tone="info">
        Puan 100’den başlar; kısa süreli çağrılar, düşük cevaplanma oranı, şikâyet ve engellemeler puanı düşürür. Doğrulanmış
        şirketlerin numaraları, ağır şikâyet olmadıkça 50’nin altına düşmez. Hatalı bir etiket görüyorsanız{' '}
        {has('enterprise:write') ? <Link to="/kurum/itirazlar">itiraz açabilirsiniz</Link> : 'itiraz açılabilir'}.
      </Notice>
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Henüz puanlanmış numaranız yok. Puanlar çağrı verisi geldikçe oluşur." onRetry={res.reload}>
        {(list) => (
          <ul className="card-list">
            {list.map((s) => (
              <li key={s.tn} className="card">
                <details>
                  <summary className="rep-summary">
                    <ScoreGauge score={s.score} size={44} />
                    <span className="mono">{fmtTN(s.tn)}</span>
                    <StatusBadge map={REPUTATION_LABEL} value={s.label} />
                    <span className="muted small">Ayrıntılar</span>
                  </summary>
                  <ScoreSummary score={s} />
                  <h3>Puanı etkileyenler</h3>
                  <FactorTable factors={s.factors} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </ListState>
    </>
  )
}
