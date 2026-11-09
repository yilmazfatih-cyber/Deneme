import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Load, Money, PageHead } from '../../components/ui.tsx'
import { useAction } from '../../context.tsx'
import { api, dateTR, useApi } from '../../lib.ts'

type Row = {
  id: number
  txn_date: string
  description: string
  amount: number
  reference: string | null
  suggested_unit_id: number | null
  confidence: number
  reason: string | null
  status: 'bekliyor' | 'eslesti' | 'yoksay' | 'mukerrer'
}
type Data = {
  import: { id: number; filename: string | null; site_id: number; created_at: string }
  rows: Row[]
  units: { id: number; label: string; payer: string | null }[]
}

export function BankImport() {
  const { id } = useParams()
  const { data, error, reload } = useApi<Data>(`/y/bank-imports/${id}`)
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => <Review key={d.rows.map((r) => r.status).join()} data={d} reload={reload} />}
    </Load>
  )
}

function Review({ data, reload }: { data: Data; reload: () => void }) {
  const pending = data.rows.filter((r) => r.status === 'bekliyor')
  const [choice, setChoice] = useState<Record<number, { unitId: string; action: 'eslestir' | 'yoksay' | '' }>>(() =>
    Object.fromEntries(
      pending.map((r) => [
        r.id,
        {
          unitId: r.suggested_unit_id ? String(r.suggested_unit_id) : '',
          action: r.suggested_unit_id && r.confidence >= 0.5 ? 'eslestir' : '',
        },
      ]),
    ),
  )
  const { busy, run } = useAction()
  const selected = Object.entries(choice).filter(([, c]) =>
    c.action === 'eslestir' ? Boolean(c.unitId) : c.action === 'yoksay',
  )
  const unitLabel = (id: number | null) => data.units.find((u) => u.id === id)?.label ?? '—'
  return (
    <>
      <PageHead
        title={data.import.filename ?? `Banka yüklemesi #${data.import.id}`}
        subtitle={`${dateTR(data.import.created_at)} · ${data.rows.length} gelen hareket · ${pending.length} onay bekliyor`}
        actions={
          <Link className="btn" to="/finans?sekme=banka">
            ← Banka hareketleri
          </Link>
        }
      />
      <Card
        title="Eşleştirme"
        actions={
          <button
            className="btn primary"
            disabled={busy || selected.length === 0}
            onClick={() =>
              void run(
                () =>
                  api.post<{ matched: number; ignored: number }>(`/y/bank-imports/${data.import.id}/confirm`, {
                    rows: selected.map(([rowId, c]) => ({
                      rowId: Number(rowId),
                      action: c.action,
                      unitId: c.unitId ? Number(c.unitId) : null,
                    })),
                  }),
                (r) => `${r.matched} tahsilat kaydedildi${r.ignored ? `, ${r.ignored} satır yok sayıldı` : ''}`,
              ).then(reload)
            }
          >
            Seçilenleri onayla ({selected.length})
          </button>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Açıklama</th>
                <th className="right">Tutar</th>
                <th>Önerilen bölüm</th>
                <th>Güven</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const c = choice[r.id]
                return (
                  <tr key={r.id}>
                    <td className="num">{dateTR(r.txn_date)}</td>
                    <td style={{ maxWidth: 320 }}>
                      <span className="mono">{r.description}</span>
                      {r.reason && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {r.reason}
                        </div>
                      )}
                    </td>
                    <td className="right">
                      <Money value={r.amount} />
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {r.status === 'bekliyor' && c ? (
                        <select
                          value={c.unitId}
                          onChange={(e) =>
                            setChoice((s) => ({
                              ...s,
                              [r.id]: { unitId: e.target.value, action: e.target.value ? 'eslestir' : '' },
                            }))
                          }
                          aria-label="Bağımsız bölüm"
                        >
                          <option value="">— seçin —</option>
                          {data.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label} {u.payer ? `· ${u.payer}` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        unitLabel(r.suggested_unit_id)
                      )}
                    </td>
                    <td>
                      {r.status === 'bekliyor' ? (
                        <Badge tone={r.confidence >= 0.6 ? 'ok' : r.confidence >= 0.4 ? 'warn' : 'neutral'}>
                          %{Math.round(r.confidence * 100)}
                        </Badge>
                      ) : null}
                    </td>
                    <td>
                      {r.status === 'bekliyor' && c ? (
                        <select
                          value={c.action}
                          onChange={(e) =>
                            setChoice((s) => ({
                              ...s,
                              [r.id]: { ...c, action: e.target.value as 'eslestir' | 'yoksay' | '' },
                            }))
                          }
                          aria-label="İşlem"
                        >
                          <option value="">Beklet</option>
                          <option value="eslestir">Tahsilat olarak kaydet</option>
                          <option value="yoksay">Aidat değil, yok say</option>
                        </select>
                      ) : r.status === 'eslesti' ? (
                        <Badge tone="ok">Kaydedildi</Badge>
                      ) : r.status === 'mukerrer' ? (
                        <Badge tone="warn">Daha önce kaydedilmiş</Badge>
                      ) : (
                        <Badge>Yok sayıldı</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
