import { Link } from 'react-router-dom'
import { INTENTS, type Intent } from '../../../shared/labels.ts'
import {
  Badge,
  Card,
  ChannelBadge,
  Empty,
  Load,
  Meter,
  PageHead,
  PairChart,
  PriorityBadge,
  Stat,
  TicketStatusBadge,
} from '../../components/ui.tsx'
import { useAuth } from '../../context.tsx'
import { ago, dateTR, money, moneyShort, useApi } from '../../lib.ts'

type Dash = {
  kpis: {
    sites: number
    units: number
    receivables: number
    overdue: number
    lateFees: number
    monthCharged: number
    monthCollected: number
    collectionRate: number | null
    openTickets: number
    urgentTickets: number
    slaBreaches: number
    complianceOverdue: number
    complianceSoon: number
    pendingApprovals: number
    inboxNew: number
  }
  series: { month: string; label: string; charged: number; collected: number }[]
  tickets: { id: number; title: string; priority: string; status: string; site: string; created_at: string }[]
  compliance: { id: number; title: string; next_due: string | null; site: string; state: string }[]
  inbox: {
    id: number
    channel: string
    body: string
    status: string
    created_at: string
    person: string | null
    triage: { intent?: string; priority?: string; summary?: string } | null
  }[]
  insights: { level: 'kritik' | 'uyari' | 'bilgi'; text: string; link?: string }[]
  ai: { actions: number; automatic: number; pending: number; tokens: number }
}

export function Dashboard() {
  const { me } = useAuth()
  const { data, error, reload } = useApi<Dash>('/y/dashboard')
  return (
    <>
      <PageHead
        title={`Günaydın, ${me?.user.name.split(' ')[0] ?? ''}`}
        subtitle={`${me?.org.name} · portföy özeti`}
        actions={
          <>
            <Link className="btn" to="/gelen-kutusu">
              Gelen kutusu
            </Link>
            <Link className="btn primary" to="/onaylar">
              Onay bekleyenler
            </Link>
          </>
        }
      />
      <Load data={data} error={error} reload={reload}>
        {(d) => (
          <div className="stack" style={{ gap: 16 }}>
            {d.insights.length > 0 && (
              <Card title="Akıllı uyarılar" actions={<Badge tone="ai">✦ otomatik izleme</Badge>}>
                <div className="list">
                  {d.insights.map((i, k) => (
                    <div className="list-item" key={k}>
                      <Badge tone={i.level === 'kritik' ? 'bad' : i.level === 'uyari' ? 'warn' : 'info'}>
                        {i.level === 'kritik' ? 'Kritik' : i.level === 'uyari' ? 'Uyarı' : 'Bilgi'}
                      </Badge>
                      <div className="grow">{i.text}</div>
                      {i.link && (
                        <Link className="btn small" to={i.link}>
                          Git
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <div className="grid cols-4">
              <Stat
                label="Toplam alacak"
                value={moneyShort(d.kpis.receivables)}
                hint={`${d.kpis.units} bağımsız bölüm · ${d.kpis.sites} site`}
              />
              <Stat
                label="Vadesi geçmiş"
                value={moneyShort(d.kpis.overdue)}
                hint={`İşleyen gecikme tazminatı ${money(d.kpis.lateFees)}`}
                tone={d.kpis.overdue > 0 ? 'bad' : undefined}
              />
              <Stat
                label="Bu ay tahsilat"
                value={d.kpis.collectionRate === null ? '—' : `%${d.kpis.collectionRate}`}
                hint={`${money(d.kpis.monthCollected)} / ${money(d.kpis.monthCharged)}`}
              />
              <Stat
                label="Açık talep"
                value={d.kpis.openTickets}
                hint={`${d.kpis.urgentTickets} acil/yüksek · ${d.kpis.slaBreaches} süre aşımı`}
                tone={d.kpis.slaBreaches ? 'bad' : undefined}
              />
            </div>
            <div className="grid sidebar-right">
              <Card
                title="Aidat tahakkuku ve tahsilat"
                actions={
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    son 6 ay
                  </span>
                }
              >
                <PairChart series={d.series} />
              </Card>
              <Card title="Yapay zekâ bu ay">
                <div className="stack">
                  <div className="row between">
                    <span className="muted">İşlem</span>
                    <b>{d.ai.actions}</b>
                  </div>
                  <div className="row between">
                    <span className="muted">Kendiliğinden tamamlanan</span>
                    <b>{d.ai.automatic}</b>
                  </div>
                  <div className="row between">
                    <span className="muted">Onay bekleyen</span>
                    <b>{d.ai.pending}</b>
                  </div>
                  <Meter value={d.ai.actions ? (d.ai.automatic / d.ai.actions) * 100 : 0} tone="ok" />
                  <small className="muted">
                    Mesaj sınıflandırma, talep açma, usta önerisi, hatırlatma ve yanıt taslakları. Tüm işlemler “Yapay
                    zekâ onayları” sayfasında kayıtlıdır.
                  </small>
                </div>
              </Card>
            </div>
            <div className="grid cols-2">
              <Card title="Son gelen mesajlar" actions={<Link to="/gelen-kutusu">Tümü</Link>}>
                {d.inbox.length === 0 ? (
                  <Empty>Mesaj yok</Empty>
                ) : (
                  <div className="list">
                    {d.inbox.map((m) => (
                      <Link key={m.id} to={`/gelen-kutusu/${m.id}`} className="list-item" style={{ color: 'inherit' }}>
                        <ChannelBadge value={m.channel} />
                        <div className="grow">
                          <div className="row between">
                            <b>{m.person ?? 'Kayıtsız gönderen'}</b>
                            <small className="muted">{ago(m.created_at)}</small>
                          </div>
                          <div className="clamp muted">{m.body}</div>
                          {m.triage && (
                            <div className="row" style={{ marginTop: 4 }}>
                              {m.triage.priority && <PriorityBadge value={m.triage.priority} />}
                              {m.triage.intent && <Badge>{INTENTS[m.triage.intent as Intent]}</Badge>}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <div className="stack" style={{ gap: 16 }}>
                <Card title="Öncelikli talepler" actions={<Link to="/talepler">Tümü</Link>}>
                  {d.tickets.length === 0 ? (
                    <Empty>Açık talep yok</Empty>
                  ) : (
                    <div className="list">
                      {d.tickets.map((t) => (
                        <Link key={t.id} to={`/talepler/${t.id}`} className="list-item" style={{ color: 'inherit' }}>
                          <PriorityBadge value={t.priority} />
                          <div className="grow">
                            <b>#{t.id}</b> {t.title}
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              {t.site} · {ago(t.created_at)}
                            </div>
                          </div>
                          <TicketStatusBadge value={t.status} />
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Periyodik kontroller" actions={<Link to="/kontroller">Takvim</Link>}>
                  {d.compliance.length === 0 ? (
                    <Empty>Yaklaşan kontrol yok</Empty>
                  ) : (
                    <div className="list">
                      {d.compliance.map((c) => (
                        <div key={c.id} className="list-item">
                          <Badge tone={c.state === 'gecikti' ? 'bad' : c.state === 'yaklasiyor' ? 'warn' : 'neutral'}>
                            {c.state === 'gecikti' ? 'Gecikti' : c.state === 'yaklasiyor' ? 'Yaklaşıyor' : 'Tarih yok'}
                          </Badge>
                          <div className="grow">
                            {c.title}
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              {c.site} · {dateTR(c.next_due)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </Load>
    </>
  )
}
