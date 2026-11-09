import { useState } from 'react'
import {
  AUTONOMY_ACTIONS,
  AUTONOMY_LEVELS,
  ROLES,
  VENDOR_TRADES,
  type AutonomyAction,
  type AutonomyLevel,
  type OrgSettings,
  type VendorTrade,
} from '../../../shared/labels.ts'
import { Badge, Card, EngineBadge, Field, Load, Modal, PageHead } from '../../components/ui.tsx'
import { useAction, useAuth, useSite } from '../../context.tsx'
import { api, dateTimeTR, phoneTR, todayISO, useApi } from '../../lib.ts'

// --- Tedarikçiler ---
type Vendor = {
  id: number
  name: string
  trade: string
  phone: string | null
  email: string | null
  rating: number | null
  active: number
  open_jobs: number
  done_jobs: number
  notes: string | null
}

export function Vendors() {
  const { data, error, reload } = useApi<Vendor[]>('/y/vendors')
  const [editing, setEditing] = useState<Vendor | 'yeni' | null>(null)
  return (
    <>
      <PageHead
        title="Tedarikçiler"
        subtitle="Usta ve firmalar; yapay zekâ talebe uygun olanı uzmanlık, puan ve iş yüküne göre önerir ve iş emrini SMS ile iletir."
        actions={
          <button className="btn primary" onClick={() => setEditing('yeni')}>
            Tedarikçi ekle
          </button>
        }
      />
      <Card>
        <Load data={data} error={error} reload={reload}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Uzmanlık</th>
                    <th>Telefon</th>
                    <th>Puan</th>
                    <th className="right">Açık iş</th>
                    <th className="right">Tamamlanan</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} style={v.active ? undefined : { opacity: 0.5 }}>
                      <td>
                        <b>{v.name}</b>
                      </td>
                      <td>{VENDOR_TRADES[v.trade as VendorTrade] ?? v.trade}</td>
                      <td>{phoneTR(v.phone)}</td>
                      <td>{v.rating ? '★'.repeat(v.rating) + '☆'.repeat(5 - v.rating) : '—'}</td>
                      <td className="right num">{v.open_jobs}</td>
                      <td className="right num">{v.done_jobs}</td>
                      <td>
                        <button className="btn small" onClick={() => setEditing(v)}>
                          Düzenle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Load>
      </Card>
      {editing && (
        <VendorModal
          vendor={editing === 'yeni' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(vendor?.name ?? '')
  const [trade, setTrade] = useState(vendor?.trade ?? 'tesisat')
  const [phone, setPhone] = useState(vendor?.phone ? phoneTR(vendor.phone) : '')
  const [rating, setRating] = useState(vendor?.rating ?? 4)
  const [active, setActive] = useState(vendor ? Boolean(vendor.active) : true)
  const { busy, run } = useAction()
  const body = { name, trade, phone: phone || null, rating, active }
  return (
    <Modal
      title={vendor ? vendor.name : 'Tedarikçi ekle'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              void run(
                () => (vendor ? api.patch(`/y/vendors/${vendor.id}`, body) : api.post('/y/vendors', body)),
                'Kaydedildi',
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Kaydet
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Firma / usta adı" className="full">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Uzmanlık">
          <select value={trade} onChange={(e) => setTrade(e.target.value)}>
            {Object.entries(VENDOR_TRADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cep telefonu (iş emri SMS’i)">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Puan">
          <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)}
              </option>
            ))}
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif
        </label>
      </div>
    </Modal>
  )
}

// --- Ayarlar ---
type Integrations = {
  ai: { engine: string; model: string | null; maskPii: boolean }
  messaging: Record<'whatsapp' | 'sms' | 'email', { provider: string; live: boolean }>
  payments: { provider: string; live: boolean; enabled: boolean }
  webhooks: Record<string, string>
  demo: boolean
}
type UserRow = {
  id: number
  name: string
  email: string
  role: string
  active: number
  last_login_at: string | null
  siteIds: number[]
}

export function Settings() {
  const { me } = useAuth()
  const settings = useApi<{ org: { name: string }; settings: OrgSettings }>('/y/settings')
  const integrations = useApi<Integrations>('/y/integrations')
  const isAdmin = me?.user.role === 'admin'
  return (
    <>
      <PageHead
        title="Ayarlar"
        subtitle="Yapay zekânın özerkliği, hatırlatma takvimi, entegrasyonlar ve kullanıcılar"
      />
      <div className="grid cols-2">
        <Load data={settings.data} error={settings.error} reload={settings.reload}>
          {(s) => (
            <AutonomyForm
              key={JSON.stringify(s.settings)}
              initial={s.settings}
              disabled={!isAdmin}
              onSaved={settings.reload}
            />
          )}
        </Load>
        <div className="stack" style={{ gap: 16 }}>
          <Load data={integrations.data} error={integrations.error}>
            {(i) => <IntegrationCard data={i} />}
          </Load>
          <AutopilotCard />
        </div>
      </div>
      {isAdmin && <UsersCard />}
    </>
  )
}

function AutonomyForm({
  initial,
  disabled,
  onSaved,
}: {
  initial: OrgSettings
  disabled: boolean
  onSaved: () => void
}) {
  const [s, setS] = useState<OrgSettings>(initial)
  const { busy, run } = useAction()
  const setLevel = (k: AutonomyAction, v: AutonomyLevel) => setS((x) => ({ ...x, autonomy: { ...x.autonomy, [k]: v } }))
  const setRem = (k: 'firstAfterDays' | 'secondAfterDays' | 'finalAfterDays', v: number) =>
    setS((x) => ({ ...x, reminders: { ...x.reminders, [k]: v } }))
  return (
    <Card title="Yapay zekâ özerkliği">
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        “Öneri” seçili işlemler onay kuyruğuna düşer; “Otomatik” olanlar insan onayı beklemeden yapılır. Acil durum
        mesajlarına güvenlik yanıtı her zaman beklemeden gider.
      </p>
      <div className="stack">
        {(Object.keys(AUTONOMY_ACTIONS) as AutonomyAction[]).map((k) => (
          <div key={k} className="row between">
            <span>{AUTONOMY_ACTIONS[k]}</span>
            <select
              value={s.autonomy[k]}
              onChange={(e) => setLevel(k, e.target.value as AutonomyLevel)}
              style={{ maxWidth: 200 }}
              disabled={disabled}
              aria-label={AUTONOMY_ACTIONS[k]}
            >
              {Object.entries(AUTONOMY_LEVELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <h3 style={{ marginTop: 8 }}>Hatırlatma takvimi (vadeden sonra gün)</h3>
        <div className="form-grid">
          <Field label="Nazik hatırlatma">
            <input
              type="number"
              value={s.reminders.firstAfterDays}
              onChange={(e) => setRem('firstAfterDays', Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="İkinci hatırlatma">
            <input
              type="number"
              value={s.reminders.secondAfterDays}
              onChange={(e) => setRem('secondAfterDays', Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="Son hatırlatma">
            <input
              type="number"
              value={s.reminders.finalAfterDays}
              onChange={(e) => setRem('finalAfterDays', Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
          <Field label="Acil durum (nöbetçi) telefonu">
            <input
              type="tel"
              value={s.emergencyPhone ?? ''}
              onChange={(e) => setS((x) => ({ ...x, emergencyPhone: e.target.value || null }))}
              disabled={disabled}
            />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={s.autoAccrual}
            onChange={(e) => setS((x) => ({ ...x, autoAccrual: e.target.checked }))}
            disabled={disabled}
          />{' '}
          Her ayın başında aidatları otomatik tahakkuk ettir
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.autoLateFee}
            onChange={(e) => setS((x) => ({ ...x, autoLateFee: e.target.checked }))}
            disabled={disabled}
          />{' '}
          Her ayın başında gecikme tazminatını otomatik tahakkuk ettir
        </label>
        {!disabled && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void run(() => api.put('/y/settings', s), 'Ayarlar kaydedildi').then(onSaved)}
            style={{ alignSelf: 'flex-start' }}
          >
            Kaydet
          </button>
        )}
      </div>
    </Card>
  )
}

function IntegrationCard({ data }: { data: Integrations }) {
  const row = (label: string, live: boolean, provider: string, hint: string) => (
    <div className="list-item">
      <div className="grow">
        <b>{label}</b>
        <div className="muted" style={{ fontSize: '0.82rem' }}>
          {hint}
        </div>
      </div>
      <Badge tone={live ? 'ok' : 'warn'}>{live ? provider : 'kayıt modu'}</Badge>
    </div>
  )
  return (
    <Card title="Entegrasyonlar">
      <div className="list">
        <div className="list-item">
          <div className="grow">
            <b>Yapay zekâ</b>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              {data.ai.engine === 'claude'
                ? `Claude (${data.ai.model})`
                : 'ANTHROPIC_API_KEY tanımlanınca Claude devreye girer'}{' '}
              · KVKK maskeleme {data.ai.maskPii ? 'açık' : 'kapalı'}
            </div>
          </div>
          <EngineBadge engine={data.ai.engine} model={data.ai.model} />
        </div>
        {row(
          'WhatsApp Business',
          data.messaging.whatsapp.live,
          'Meta Cloud API',
          'WHATSAPP_TOKEN ve WHATSAPP_PHONE_NUMBER_ID',
        )}
        {row('SMS', data.messaging.sms.live, 'Netgsm', 'NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER')}
        {row('E-posta', data.messaging.email.live, 'Resend', 'RESEND_API_KEY ve EMAIL_FROM')}
        {row(
          'Online ödeme',
          data.payments.live,
          'PayTR',
          data.payments.live
            ? 'Kart ile aidat tahsilatı'
            : data.payments.enabled
              ? 'Demo test ödeme sayfası açık'
              : 'PAYTR_MERCHANT_ID / KEY / SALT',
        )}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          Webhook adresleri
        </summary>
        <dl className="kv" style={{ marginTop: 8 }}>
          {Object.entries(data.webhooks).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  )
}

function AutopilotCard() {
  const { busy, run } = useAction()
  const [last, setLast] = useState<{
    triaged: number
    accruals: number
    reminders: number
    lateFees: number
    errors: string[]
  } | null>(null)
  return (
    <Card title="Otopilot">
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        Sunucu 15 dakikada bir işlenmemiş mesajları sınıflandırır, ay başında aidatları tahakkuk ettirir ve günde bir
        kez geciken ödemeler için hatırlatma hazırlar.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          void run(() => api.post<NonNullable<typeof last>>('/y/autopilot/run'), 'Otopilot çalıştı').then(
            (r) => r && setLast(r),
          )
        }
      >
        Şimdi çalıştır
      </button>
      {last && (
        <p style={{ marginTop: 10, fontSize: '0.9rem' }}>
          {last.triaged} mesaj sınıflandırıldı · {last.accruals} tahakkuk · {last.reminders} hatırlatma
          {last.errors.length ? ` · ${last.errors.length} uyarı` : ''}
        </p>
      )}
    </Card>
  )
}

function UsersCard() {
  const { sites } = useSite()
  const { data, error, reload } = useApi<UserRow[]>('/y/users')
  const [adding, setAdding] = useState(false)
  const { busy, run } = useAction()
  return (
    <Card
      title="Kullanıcılar"
      actions={
        <button className="btn" onClick={() => setAdding(true)}>
          Kullanıcı ekle
        </button>
      }
      className=""
    >
      <Load data={data} error={error} reload={reload}>
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>E-posta</th>
                  <th>Rol</th>
                  <th>Siteler</th>
                  <th>Son giriş</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} style={u.active ? undefined : { opacity: 0.5 }}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{ROLES[u.role as keyof typeof ROLES]}</td>
                    <td>
                      {u.role === 'yonetici'
                        ? sites
                            .filter((s) => u.siteIds.includes(s.id))
                            .map((s) => s.name)
                            .join(', ') || '—'
                        : 'Tümü'}
                    </td>
                    <td>{dateTimeTR(u.last_login_at)}</td>
                    <td>
                      <button
                        className="btn small"
                        disabled={busy}
                        onClick={() =>
                          void run(() => api.patch(`/y/users/${u.id}`, { active: !u.active }), 'Güncellendi').then(
                            reload,
                          )
                        }
                      >
                        {u.active ? 'Devre dışı bırak' : 'Etkinleştir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Load>
      {adding && (
        <NewUser
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </Card>
  )
}

function NewUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { sites } = useSite()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('yonetici')
  const [siteIds, setSiteIds] = useState<number[]>([])
  const { busy, run } = useAction()
  return (
    <Modal
      title="Kullanıcı ekle"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || password.length < 10}
            onClick={() =>
              void run(() => api.post('/y/users', { name, email, password, role, siteIds }), 'Kullanıcı eklendi').then(
                (r) => r !== undefined && onSaved(),
              )
            }
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Ad soyad">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-posta">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Geçici parola (en az 10 karakter)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Şirket yöneticisi</option>
            <option value="yonetici">Site yöneticisi</option>
            <option value="muhasebe">Muhasebe / denetçi</option>
          </select>
        </Field>
        {role === 'yonetici' && (
          <div className="full stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Sorumlu olduğu siteler
            </span>
            {sites.map((s) => (
              <label key={s.id} className="check">
                <input
                  type="checkbox"
                  checked={siteIds.includes(s.id)}
                  onChange={() =>
                    setSiteIds((xs) => (xs.includes(s.id) ? xs.filter((x) => x !== s.id) : [...xs, s.id]))
                  }
                />{' '}
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

// --- Portföy devri: içe aktarma ---
const UNIT_TEMPLATE = `blok;daire_no;kat;tip;m2;arsa_payi;malik;malik_tel;malik_eposta;kiraci;kiraci_tel;kiraci_eposta;odeyen
A Blok;1;1;daire;110;90;Ali Veli;0532 000 00 01;;;;;malik
A Blok;2;1;daire;115;95;Ayşe Yılmaz;0532 000 00 02;ayse@ornek.example;Mert Can;0533 000 00 03;;kiraci`
const BALANCE_TEMPLATE = `blok;daire_no;bakiye
A Blok;1;1.250,00
A Blok;2;-300,00`

type ImportResult = {
  dryRun: boolean
  summary: Record<string, number>
  errors: { row: number; error: string }[]
  preview: Record<string, unknown>[]
}

export function Import() {
  const { siteId, site } = useSite()
  const [kind, setKind] = useState<'units' | 'balances'>('units')
  const [csv, setCsv] = useState(UNIT_TEMPLATE)
  const [asOf, setAsOf] = useState(todayISO())
  const [lateFee, setLateFee] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const { busy, run } = useAction()
  const send = (dryRun: boolean) =>
    run(
      () =>
        api.post<ImportResult>(
          `/y/sites/${siteId}/import/${kind}`,
          kind === 'units' ? { csv, dryRun } : { csv, dryRun, asOf, lateFee },
        ),
      dryRun ? undefined : 'İçe aktarma tamamlandı',
    ).then((r) => r && setResult(r))
  return (
    <>
      <PageHead
        title="Portföy devri"
        subtitle={`Satın aldığınız ya da devraldığınız yönetimin verisini dakikalar içinde ${site?.name ?? 'siteye'} aktarın: önce kontrol, sonra kayıt.`}
      />
      <div className="grid cols-2">
        <Card title="1. Veri">
          <div className="stack">
            <div className="row">
              <label className="check">
                <input
                  type="radio"
                  checked={kind === 'units'}
                  onChange={() => {
                    setKind('units')
                    setCsv(UNIT_TEMPLATE)
                    setResult(null)
                  }}
                />{' '}
                Bağımsız bölümler ve kişiler
              </label>
              <label className="check">
                <input
                  type="radio"
                  checked={kind === 'balances'}
                  onChange={() => {
                    setKind('balances')
                    setCsv(BALANCE_TEMPLATE)
                    setResult(null)
                  }}
                />{' '}
                Devir bakiyeleri
              </label>
            </div>
            <input
              type="file"
              accept=".csv,.txt"
              aria-label="CSV dosyası"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void f.text().then(setCsv)
              }}
            />
            <textarea
              className="mono"
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              aria-label="CSV içeriği"
            />
            {kind === 'balances' && (
              <div className="form-grid">
                <Field label="Devir tarihi">
                  <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                </Field>
                <label className="check" style={{ alignSelf: 'end' }}>
                  <input type="checkbox" checked={lateFee} onChange={(e) => setLateFee(e.target.checked)} /> Devir
                  borcuna gecikme tazminatı işlesin
                </label>
              </div>
            )}
            <small className="muted">
              {kind === 'units'
                ? 'Sütunlar: blok, daire_no, kat, tip, m2, arsa_payi, malik, malik_tel, malik_eposta, kiraci, kiraci_tel, kiraci_eposta, odeyen (malik/kiraci). Ayraç ; ya da , olabilir.'
                : 'Sütunlar: blok, daire_no, bakiye. Pozitif bakiye borç (devir borcu), negatif bakiye avans olarak kaydedilir.'}
            </small>
            <div className="row">
              <button className="btn" disabled={busy || !siteId} onClick={() => void send(true)}>
                Kontrol et
              </button>
              <button
                className="btn primary"
                disabled={busy || !siteId || !result?.dryRun || result.errors.length > 0}
                onClick={() => void send(false)}
              >
                İçe aktar
              </button>
            </div>
          </div>
        </Card>
        <Card title="2. Kontrol sonucu">
          {!result ? (
            <p className="muted">“Kontrol et” ile satırlar doğrulanır; hiçbir şey kaydedilmez.</p>
          ) : (
            <div className="stack">
              <div className="row">
                {Object.entries(result.summary).map(([k, v]) => (
                  <Badge key={k} tone={k === 'errors' && v ? 'bad' : 'brand'}>
                    {k}: {v}
                  </Badge>
                ))}
                {!result.dryRun && <Badge tone="ok">Kaydedildi</Badge>}
              </div>
              {result.errors.length > 0 && (
                <div className="alert bad">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <div key={i}>
                      Satır {e.row}: {e.error}
                    </div>
                  ))}
                </div>
              )}
              {result.preview.length > 0 && (
                <pre
                  className="mono"
                  style={{
                    maxHeight: 320,
                    overflow: 'auto',
                    background: 'var(--surface-2)',
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  {JSON.stringify(result.preview.slice(0, 10), null, 2)}
                </pre>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
