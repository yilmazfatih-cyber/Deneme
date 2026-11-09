import { useState } from 'react'
import { AI_KINDS, type AiKind } from '../../../shared/labels.ts'
import { ActionCard, ActionStatus, type AiAction } from '../../components/ActionCard.tsx'
import { Card, Empty, EngineBadge, Load, PageHead, Tabs } from '../../components/ui.tsx'
import { dateTimeTR, useApi } from '../../lib.ts'

export function Approvals() {
  const [tab, setTab] = useState<'oneri' | 'tumu'>('oneri')
  const { data, error, reload } = useApi<AiAction[]>(`/y/actions?status=${tab}`)
  return (
    <>
      <PageHead
        title="Yapay zekâ onayları"
        subtitle="Yapay zekânın önerdiği yanıtlar, talepler, usta atamaları ve ödeme hatırlatmaları. Hangi işlerin onaysız yapılacağını Ayarlar’dan belirlersiniz."
      />
      <Tabs
        tabs={[
          ['oneri', 'Onay bekleyen'],
          ['tumu', 'İşlem günlüğü'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <Empty>{tab === 'oneri' ? 'Onay bekleyen öneri yok. Her şey yolunda.' : 'Kayıt yok.'}</Empty>
            </Card>
          ) : tab === 'oneri' ? (
            <div className="grid cols-2">
              {rows.map((a) => (
                <ActionCard key={a.id} action={a} onDone={reload} />
              ))}
            </div>
          ) : (
            <Card>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>İşlem</th>
                      <th>Ayrıntı</th>
                      <th>Motor</th>
                      <th className="right">Token</th>
                      <th>KVKK</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td className="num">{dateTimeTR(a.created_at)}</td>
                        <td>{AI_KINDS[a.kind as AiKind] ?? a.kind}</td>
                        <td style={{ maxWidth: 420 }}>
                          <div className="clamp">{a.title}</div>
                          {a.note && <small className="muted">{a.note}</small>}
                        </td>
                        <td>
                          <EngineBadge engine={a.engine} model={a.model} />
                        </td>
                        <td className="right num">{(a.input_tokens ?? 0) + (a.output_tokens ?? 0) || '—'}</td>
                        <td>{a.masked_count ? `${a.masked_count} maske` : '—'}</td>
                        <td>
                          <ActionStatus status={a.status} />
                          {a.decided_by_name && (
                            <div className="muted" style={{ fontSize: '0.8rem' }}>
                              {a.decided_by_name}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        }
      </Load>
    </>
  )
}
