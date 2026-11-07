import type { Certificate, TNEntry } from '../types'
import { CERT_KIND_TEXT, CERT_STATUS, fmtDate, fmtNum, fmtTN } from '../format'
import { CopyButton } from './Secret'
import { StatusBadge } from './StatusBadge'

function entryText(e: TNEntry): string {
  if (e.spc) return `SPC ${e.spc}`
  if (e.tn) return fmtTN(`+${e.tn}`)
  if (e.start) return `${fmtTN(`+${e.start}`)} (+${fmtNum(e.count ?? 0)})`
  return '—'
}

function expiresSoon(c: Certificate): boolean {
  const ms = new Date(c.not_after).getTime() - Date.now()
  return c.status === 'active' && ms > 0 && ms < 30 * 86400000
}

export function CertTable({
  certs,
  onRevoke,
  entityNames,
}: {
  certs: Certificate[]
  onRevoke?: (c: Certificate) => void
  entityNames?: Record<string, string>
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Konu (CN)</th>
            <th scope="col">Tür</th>
            <th scope="col">Yetki (TNAuthList)</th>
            <th scope="col">Geçerlilik</th>
            <th scope="col">Durum</th>
            <th scope="col">
              <span className="sr-only">Ayrıntı ve işlemler</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {certs.map((c) => {
            const entries = c.tn_auth_list ?? []
            return (
              <tr key={c.id}>
                <td>
                  {c.subject_cn}
                  <span className="muted small block mono">Seri: {c.serial}</span>
                  {c.entity_id && entityNames ? <span className="muted small block">{entityNames[c.entity_id] ?? ''}</span> : null}
                </td>
                <td>{CERT_KIND_TEXT[c.kind] ?? c.kind}</td>
                <td>
                  {entries.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <ul className="plain-list small">
                      {entries.slice(0, 3).map((e, i) => (
                        <li key={i} className="mono">
                          {entryText(e)}
                        </li>
                      ))}
                      {entries.length > 3 ? <li className="muted">+{entries.length - 3} kayıt daha</li> : null}
                    </ul>
                  )}
                </td>
                <td>
                  {fmtDate(c.not_before)} – {fmtDate(c.not_after)}
                  {expiresSoon(c) ? <span className="warn-text small block">30 gün içinde sona eriyor</span> : null}
                </td>
                <td>
                  <StatusBadge map={CERT_STATUS} value={c.status} />
                  {c.revoke_reason ? <span className="muted small block">{c.revoke_reason}</span> : null}
                </td>
                <td className="actions">
                  <details className="inline-details">
                    <summary>PEM</summary>
                    <div className="pem-box">
                      <p className="small">
                        x5u:{' '}
                        <a href={c.x5u} target="_blank" rel="noreferrer noopener" className="mono">
                          {c.x5u}
                        </a>
                      </p>
                      <pre className="pem">{c.pem}</pre>
                      <CopyButton text={c.pem} label="PEM'i kopyala" />
                    </div>
                  </details>
                  {onRevoke && c.status === 'active' && c.kind !== 'root' ? (
                    <button type="button" className="btn btn-small btn-danger" onClick={() => onRevoke(c)}>
                      İptal et
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
