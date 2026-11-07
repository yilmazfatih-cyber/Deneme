import { useState, type FormEvent } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { ErrorBox, ListState, Notice, PageHeader } from '../../components/Feedback'
import { CheckGroup, SelectField, TextField, fe } from '../../components/Fields'
import { SecretOnce } from '../../components/Secret'
import { Badge } from '../../components/StatusBadge'
import { fmtDateTime, SCOPE_TEXT } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { APIKey, CreatedAPIKey, Scope } from '../../types'
import { useEntityNames } from '../operator/useEntityNames'

const ADMIN_SCOPES: Scope[] = ['carrier:read', 'carrier:write', 'admin:read', 'admin', 'enterprise:read', 'enterprise:write']
const ENTERPRISE_SCOPES: Scope[] = ['enterprise:read', 'enterprise:write']

function keyState(k: APIKey): { text: string; tone: 'success' | 'danger' | 'warning' } {
  if (k.revoked_at) return { text: 'İptal edildi', tone: 'danger' }
  if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) return { text: 'Süresi doldu', tone: 'warning' }
  return { text: 'Etkin', tone: 'success' }
}

function CreateKeyDialog({
  mode,
  names,
  onClose,
  onCreated,
}: {
  mode: 'admin' | 'enterprise'
  names: Record<string, string>
  onClose: () => void
  onCreated: (r: CreatedAPIKey) => void
}) {
  const [name, setName] = useState('')
  const [ownerKind, setOwnerKind] = useState<'operator' | 'entity'>('operator')
  const [ownerId, setOwnerId] = useState('')
  const [scopes, setScopes] = useState<string[]>(mode === 'admin' ? ['carrier:read'] : ['enterprise:read'])
  const [rate, setRate] = useState('')
  const [expires, setExpires] = useState('')
  const action = useAction()
  const available = mode === 'admin' ? (ownerKind === 'entity' ? ENTERPRISE_SCOPES : ADMIN_SCOPES) : ENTERPRISE_SCOPES

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const chosen = scopes.filter((s) => (available as string[]).includes(s)) as Scope[]
    const r = await action.run(() =>
      mode === 'admin'
        ? api.createAdminApiKey({
            name: name.trim(),
            owner_kind: ownerKind,
            ...(ownerKind === 'entity' ? { owner_id: ownerId } : {}),
            scopes: chosen,
            ...(rate ? { rate_rps: Number(rate) } : {}),
            ...(expires ? { expires_at: new Date(`${expires}T23:59:59`).toISOString() } : {}),
          })
        : api.createMyApiKey({ name: name.trim(), scopes: chosen }),
    )
    if (r) onCreated(r)
  }

  return (
    <Dialog title="Yeni API anahtarı" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <TextField label="Ad" required value={name} onValue={setName} error={fe(action.fields, 'name')} hint="Ör. “Çağrı merkezi entegrasyonu”" />
        {mode === 'admin' ? (
          <>
            <SelectField
              label="Sahip"
              value={ownerKind}
              onValue={(v) => setOwnerKind(v as 'operator' | 'entity')}
              error={fe(action.fields, 'owner_kind')}
              options={[
                { value: 'operator', label: 'Operatör / taşıyıcı sistemi' },
                { value: 'entity', label: 'Kurum' },
              ]}
            />
            {ownerKind === 'entity' ? (
              <SelectField
                label="Kurum"
                required
                value={ownerId}
                onValue={setOwnerId}
                error={fe(action.fields, 'owner_id')}
                options={[{ value: '', label: 'Seçin' }, ...Object.entries(names).map(([value, label]) => ({ value, label }))]}
              />
            ) : null}
          </>
        ) : null}
        <CheckGroup
          legend="Yetkiler"
          options={available.map((s) => ({ value: s, label: `${SCOPE_TEXT[s]} (${s})` }))}
          value={scopes}
          onChange={setScopes}
          error={fe(action.fields, 'scopes')}
        />
        {mode === 'admin' ? (
          <div className="grid-2">
            <TextField
              label="Saniyedeki istek sınırı"
              type="number"
              min={1}
              value={rate}
              onValue={setRate}
              error={fe(action.fields, 'rate_rps')}
              hint="Boş bırakılırsa varsayılan"
            />
            <TextField label="Son geçerlilik" type="date" value={expires} onValue={setExpires} error={fe(action.fields, 'expires_at')} />
          </div>
        ) : null}
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={action.pending || !name.trim() || scopes.length === 0 || (ownerKind === 'entity' && mode === 'admin' && !ownerId)}
          >
            {action.pending ? 'Oluşturuluyor…' : 'Anahtar oluştur'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function ApiKeysPage({ mode }: { mode: 'admin' | 'enterprise' }) {
  const { has } = useAuth()
  const canWrite = mode === 'admin' ? has('admin') : has('enterprise:write')
  const res = useApi(() => (mode === 'admin' ? api.adminApiKeys() : api.myApiKeys()), mode)
  const names = useEntityNames(mode === 'admin')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedAPIKey | null>(null)
  const [revoking, setRevoking] = useState<APIKey | null>(null)
  const action = useAction()

  const revoke = async () => {
    if (!revoking) return
    const ok = await action.run(async () => {
      await (mode === 'admin' ? api.revokeAdminApiKey(revoking.id) : api.revokeMyApiKey(revoking.id))
      return true
    })
    if (ok) {
      setRevoking(null)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="API anahtarları"
        description={
          mode === 'admin'
            ? 'Taşıyıcı sistemleri ve kurumlar için makineden makineye erişim anahtarları'
            : 'Sistemlerinizin Enumaracle API’sine erişmesi için anahtarlar'
        }
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Yeni anahtar
            </button>
          ) : null
        }
      />
      {created ? (
        <SecretOnce title={`“${created.api_key.name}” anahtarı oluşturuldu`} secret={created.secret} onDone={() => setCreated(null)} />
      ) : null}
      <Notice tone="info">
        İsteklerde <code>Authorization: Bearer &lt;anahtar&gt;</code> başlığını kullanın. Anahtarın tamamı yalnızca oluşturulurken
        gösterilir.
      </Notice>
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Henüz API anahtarı yok." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ad</th>
                  <th scope="col">Önek</th>
                  {mode === 'admin' ? <th scope="col">Sahip</th> : null}
                  <th scope="col">Yetkiler</th>
                  <th scope="col">Son kullanım</th>
                  <th scope="col">Durum</th>
                  {canWrite ? <th scope="col"><span className="sr-only">İşlemler</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {list.map((k) => {
                  const st = keyState(k)
                  return (
                    <tr key={k.id}>
                      <td>
                        {k.name}
                        <span className="muted small block">Oluşturma: {fmtDateTime(k.created_at)}</span>
                      </td>
                      <td className="mono">{k.prefix}…</td>
                      {mode === 'admin' ? (
                        <td>{k.owner_kind === 'entity' ? names[k.owner_id ?? ''] ?? 'Kurum' : 'Operatör'}</td>
                      ) : null}
                      <td>
                        <ul className="tag-list">
                          {(k.scopes ?? []).map((s) => (
                            <li key={s} className="tag" title={SCOPE_TEXT[s]}>
                              {s}
                            </li>
                          ))}
                        </ul>
                        {k.rate_rps ? <span className="muted small block">{k.rate_rps} istek/sn</span> : null}
                      </td>
                      <td>{fmtDateTime(k.last_used_at)}</td>
                      <td>
                        <Badge tone={st.tone}>{st.text}</Badge>
                        {k.expires_at && !k.revoked_at ? <span className="muted small block">Bitiş: {fmtDateTime(k.expires_at)}</span> : null}
                      </td>
                      {canWrite ? (
                        <td className="actions">
                          {!k.revoked_at ? (
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => {
                                action.reset()
                                setRevoking(k)
                              }}
                            >
                              İptal et
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      {creating ? (
        <CreateKeyDialog
          mode={mode}
          names={names}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false)
            setCreated(r)
            res.reload()
          }}
        />
      ) : null}
      {revoking ? (
        <ConfirmDialog
          title="API anahtarını iptal et"
          confirmText="İptal et"
          danger
          pending={action.pending}
          error={action.error}
          onCancel={() => setRevoking(null)}
          onConfirm={revoke}
          message={
            <p>
              <strong>{revoking.name}</strong> ({revoking.prefix}…) hemen geçersiz olur ve bu anahtarı kullanan sistemler erişimini
              kaybeder. Bu işlem geri alınamaz.
            </p>
          }
        />
      ) : null}
    </>
  )
}
