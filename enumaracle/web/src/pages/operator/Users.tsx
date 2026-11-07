import { useState, type FormEvent } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { ErrorBox, ListState, PageHeader } from '../../components/Feedback'
import { SelectField, TextField, fe } from '../../components/Fields'
import { Badge } from '../../components/StatusBadge'
import { fmtDateTime, ROLE_TEXT } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { Role, User } from '../../types'
import { useEntityNames } from './useEntityNames'

function CreateUserDialog({ names, onClose, onCreated }: { names: Record<string, string>; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('operator_analyst')
  const [entityId, setEntityId] = useState('')
  const action = useAction()
  const enterprise = role === 'enterprise_owner' || role === 'enterprise_user'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const u = await action.run(() =>
      api.createUser({ email: email.trim(), name: name.trim(), password, role, ...(enterprise ? { entity_id: entityId } : {}) }),
    )
    if (u) onCreated()
  }

  return (
    <Dialog title="Yeni kullanıcı" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <TextField label="Ad soyad" required value={name} onValue={setName} error={fe(action.fields, 'name')} />
        <TextField label="E-posta" type="email" required value={email} onValue={setEmail} error={fe(action.fields, 'email')} />
        <TextField
          label="Geçici parola"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onValue={setPassword}
          error={fe(action.fields, 'password')}
          hint="En az 10 karakter. Kullanıcıya güvenli bir kanaldan iletin."
        />
        <SelectField
          label="Rol"
          value={role}
          onValue={(v) => setRole(v as Role)}
          error={fe(action.fields, 'role')}
          options={(Object.keys(ROLE_TEXT) as Role[]).map((r) => ({ value: r, label: ROLE_TEXT[r] }))}
        />
        {enterprise ? (
          <SelectField
            label="Kurum"
            required
            value={entityId}
            onValue={setEntityId}
            error={fe(action.fields, 'entity_id')}
            options={[{ value: '', label: 'Seçin' }, ...Object.entries(names).map(([value, label]) => ({ value, label }))]}
          />
        ) : null}
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={action.pending || !email || !name || password.length < 10 || (enterprise && !entityId)}
          >
            {action.pending ? 'Oluşturuluyor…' : 'Kullanıcı oluştur'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function UsersPage() {
  const { has, user: me } = useAuth()
  const canWrite = has('admin')
  const res = useApi(() => api.users(), 'users')
  const names = useEntityNames()
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<User | null>(null)
  const action = useAction()

  const toggle = async () => {
    if (!toggling) return
    const u = await action.run(() => api.setUserActive(toggling.id, !toggling.active))
    if (u) {
      setToggling(null)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        description="Operatör ve kurum portal hesapları"
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Yeni kullanıcı
            </button>
          ) : null
        }
      />
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Kullanıcı yok." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ad</th>
                  <th scope="col">E-posta</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Kurum</th>
                  <th scope="col">Son giriş</th>
                  <th scope="col">Durum</th>
                  {canWrite ? <th scope="col"><span className="sr-only">İşlemler</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{ROLE_TEXT[u.role] ?? u.role}</td>
                    <td>{u.entity_id ? names[u.entity_id] ?? '—' : 'Operatör'}</td>
                    <td>{fmtDateTime(u.last_login_at)}</td>
                    <td>{u.active ? <Badge tone="success">Etkin</Badge> : <Badge tone="neutral">Devre dışı</Badge>}</td>
                    {canWrite ? (
                      <td className="actions">
                        {u.id !== me?.id ? (
                          <button
                            type="button"
                            className={u.active ? 'btn btn-small btn-danger' : 'btn btn-small'}
                            onClick={() => {
                              action.reset()
                              setToggling(u)
                            }}
                          >
                            {u.active ? 'Devre dışı bırak' : 'Etkinleştir'}
                          </button>
                        ) : (
                          <span className="muted small">Siz</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      {creating ? (
        <CreateUserDialog
          names={names}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            res.reload()
          }}
        />
      ) : null}
      {toggling ? (
        <ConfirmDialog
          title={toggling.active ? 'Kullanıcıyı devre dışı bırak' : 'Kullanıcıyı etkinleştir'}
          confirmText={toggling.active ? 'Devre dışı bırak' : 'Etkinleştir'}
          danger={toggling.active}
          pending={action.pending}
          error={action.error}
          onCancel={() => setToggling(null)}
          onConfirm={toggle}
          message={
            <p>
              <strong>{toggling.name}</strong> ({toggling.email}){' '}
              {toggling.active ? 'portala giriş yapamayacak; açık oturumları sonlanır.' : 'yeniden giriş yapabilecek.'}
            </p>
          }
        />
      ) : null}
    </>
  )
}
