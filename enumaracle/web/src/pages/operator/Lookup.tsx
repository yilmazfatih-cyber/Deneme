import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { ScoreGauge } from '../../components/Charts'
import { ErrorBox, Notice, PageHeader } from '../../components/Feedback'
import { CheckField, SelectField, TextField, fe } from '../../components/Fields'
import { PhonePreview } from '../../components/PhonePreview'
import { CopyButton } from '../../components/Secret'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import {
  ATTEST_TEXT,
  CHECK_TEXT,
  fmtDateTime,
  fmtTN,
  NUMBER_STATUS,
  REPUTATION_LABEL,
  USE_CASE_TEXT,
  VERSTAT,
} from '../../format'
import { useAction } from '../../hooks'
import type { Attest, LookupResult, SignResult, VerifyResult } from '../../types'

const clean = (s: string) => s.replace(/[\s()-]/g, '')

function LookupCard({ r }: { r: LookupResult }) {
  return (
    <section className="card" aria-labelledby="lr-h">
      <h2 id="lr-h">Sorgu sonucu: {fmtTN(r.tn)}</h2>
      {!r.found ? (
        <Notice tone="info" title="Numara kayıtlı değil">
          Bu numara hiçbir kurum tarafından kaydedilmemiş. Arama doğrulanmamış olarak işlenir.
        </Notice>
      ) : null}
      <div className="lookup-grid">
        <dl className="kv">
          <div>
            <dt>Doğrulanmış arayan</dt>
            <dd>{r.verified ? <Badge tone="success">Evet</Badge> : <Badge tone="neutral">Hayır</Badge>}</dd>
          </div>
          <div>
            <dt>Kurum</dt>
            <dd>{r.entity_name || '—'}</dd>
          </div>
          <div>
            <dt>Numara durumu</dt>
            <dd>{r.number_status ? <StatusBadge map={NUMBER_STATUS} value={r.number_status} /> : '—'}</dd>
          </div>
          <div>
            <dt>Doğrulama seviyesi (attest)</dt>
            <dd>{r.attest ? ATTEST_TEXT[r.attest] : '—'}</dd>
          </div>
          <div>
            <dt>Kullanım amacı</dt>
            <dd>{r.use_case ? USE_CASE_TEXT[r.use_case] : '—'}</dd>
          </div>
          <div>
            <dt>İtibar</dt>
            <dd className="inline-flex">
              <ScoreGauge score={r.score} size={40} /> <StatusBadge map={REPUTATION_LABEL} value={r.label} />
            </dd>
          </div>
          <div>
            <dt>Önbellek süresi</dt>
            <dd>{r.ttl} sn · {fmtDateTime(r.computed_at)}</dd>
          </div>
        </dl>
        <PhonePreview
          displayName={r.display_name || (r.verified ? r.entity_name ?? '' : '')}
          logoUrl={r.logo_url}
          callReason={r.call_reason}
          tn={r.tn}
          verified={r.verified}
          caption={r.display_name ? 'Onaylı marka ile görünüm' : 'Onaylı marka yok; numara ile görünüm'}
        />
      </div>
    </section>
  )
}

function Checks({ v }: { v: VerifyResult }) {
  return (
    <>
      <p>
        Sonuç: <StatusBadge map={VERSTAT} value={v.verstat} /> {v.attest ? <Badge tone="info">{`Seviye ${v.attest}`}</Badge> : null}{' '}
        {v.rcd ? <Badge tone={v.rcd_verified ? 'success' : 'warning'}>{v.rcd_verified ? 'RCD doğrulandı' : 'RCD doğrulanamadı'}</Badge> : null}
      </p>
      {v.reason ? <p className="muted">{v.reason}</p> : null}
      <ul className="checks" aria-label="Doğrulama adımları">
        {(v.checks ?? []).map((c) => (
          <li key={c.name} className={c.ok ? 'ok' : 'fail'}>
            <span className="check-icon" aria-hidden="true">
              {c.ok ? '✓' : '✕'}
            </span>
            <span>
              <strong>{CHECK_TEXT[c.name] ?? c.name}</strong> — {c.ok ? 'Geçti' : 'Başarısız'}
              {c.detail ? <span className="muted small block">{c.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {v.rcd ? (
        <dl className="kv">
          <div><dt>RCD adı (nam)</dt><dd>{v.rcd.nam}</dd></div>
          {v.rcd.crn ? <div><dt>Arama nedeni (crn)</dt><dd>{v.rcd.crn}</dd></div> : null}
          {v.rcd.icn ? <div><dt>Logo (icn)</dt><dd className="truncate">{v.rcd.icn}</dd></div> : null}
        </dl>
      ) : null}
    </>
  )
}

function SignVerify() {
  const [orig, setOrig] = useState('')
  const [dest, setDest] = useState('')
  const [attest, setAttest] = useState<Attest | ''>('')
  const [withRcd, setWithRcd] = useState(true)
  const [signed, setSigned] = useState<SignResult | null>(null)
  const [verified, setVerified] = useState<VerifyResult | null>(null)
  const action = useAction()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSigned(null)
    setVerified(null)
    const o = clean(orig)
    const d = clean(dest)
    const s = await action.run(() => api.sign({ orig_tn: o, dest_tn: d, with_rcd: withRcd, ...(attest ? { attest } : {}) }))
    if (!s) return
    setSigned(s)
    const v = await action.run(() =>
      api.verify({ identity: s.identity, ...(s.rcd_identity ? { rcd_identity: s.rcd_identity } : {}), from_tn: o, to_tn: d }),
    )
    if (v) setVerified(v)
  }

  return (
    <section className="card" aria-labelledby="sv-h">
      <h2 id="sv-h">İmzala ve doğrula (STIR/SHAKEN gösterimi)</h2>
      <p className="muted small">
        Arayan ağ, operatör SP sertifikasıyla bir PASSporT imzalar; karşı ağ Identity başlığını doğrular. Bu araç iki adımı
        sırayla çalıştırır.
      </p>
      <form onSubmit={onSubmit} className="grid-3 align-end">
        <TextField label="Arayan numara" type="tel" required placeholder="+90…" value={orig} onValue={setOrig} error={fe(action.fields, 'orig_tn')} />
        <TextField label="Aranan numara" type="tel" required placeholder="+90…" value={dest} onValue={setDest} error={fe(action.fields, 'dest_tn')} />
        <SelectField
          label="Doğrulama seviyesi"
          value={attest}
          onValue={(v) => setAttest(v as Attest | '')}
          options={[
            { value: '', label: 'Kayıttan belirle' },
            { value: 'A', label: ATTEST_TEXT.A! },
            { value: 'B', label: ATTEST_TEXT.B! },
            { value: 'C', label: ATTEST_TEXT.C! },
          ]}
        />
        <CheckField label="Marka bilgisini ekle (RCD PASSporT)" checked={withRcd} onChecked={setWithRcd} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={action.pending || !orig || !dest}>
            {action.pending ? 'Çalışıyor…' : 'İmzala ve doğrula'}
          </button>
        </div>
      </form>
      <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
      {signed ? (
        <div className="sign-result">
          <h3>1. İmza</h3>
          <dl className="kv">
            <div><dt>Seviye</dt><dd>{ATTEST_TEXT[signed.attest] ?? signed.attest}</dd></div>
            <div><dt>origid</dt><dd className="mono">{signed.orig_id}</dd></div>
            <div><dt>Sertifika (x5u)</dt><dd className="mono truncate">{signed.x5u}</dd></div>
          </dl>
          <div className="code-block">
            <div className="code-head">
              <span>SIP Identity başlığı</span>
              <CopyButton text={signed.identity} />
            </div>
            <pre className="wrap">{signed.identity}</pre>
          </div>
          {signed.rcd_identity ? (
            <div className="code-block">
              <div className="code-head">
                <span>RCD Identity başlığı</span>
                <CopyButton text={signed.rcd_identity} />
              </div>
              <pre className="wrap">{signed.rcd_identity}</pre>
            </div>
          ) : null}
          {verified ? (
            <>
              <h3>2. Doğrulama</h3>
              <Checks v={verified} />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function LookupPage() {
  const { has } = useAuth()
  const [tn, setTn] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const action = useAction()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await action.run(() => api.lookup(clean(tn)))
    setResult(r ?? null)
  }

  return (
    <>
      <PageHeader title="Arama sorgula" description="Bir numaranın arama anında taşıyıcılara döndürülen yanıtını görün" />
      <section className="card">
        <form onSubmit={onSubmit} className="inline-form">
          <TextField
            label="Telefon numarası"
            type="tel"
            required
            placeholder="+90 532 123 45 67"
            value={tn}
            onValue={setTn}
            error={fe(action.fields, 'tn')}
            hint="E.164 biçimi önerilir; 0 ile başlayan yurt içi biçim de kabul edilir."
          />
          <button type="submit" className="btn btn-primary" disabled={action.pending || !tn.trim()}>
            {action.pending ? 'Sorgulanıyor…' : 'Sorgula'}
          </button>
        </form>
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
      </section>
      {result ? <LookupCard r={result} /> : null}
      {has('carrier:write') ? (
        <SignVerify />
      ) : (
        <Notice tone="info">İmzala ve doğrula gösterimi taşıyıcı yazma yetkisi gerektirir.</Notice>
      )}
    </>
  )
}
