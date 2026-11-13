/**
 * Veri kaynakları (docs/MIXPANEL.md; uçlar /api/studio/sources*): kaynak kartları, son içe aktarma raporu,
 * Mixpanel durumu (gizli değerler asla gösterilmez), eşleme JSON'u (doğrulanır, kaydedilir), dışa aktarım dosyası
 * yükleme (deneme kipiyle), tarih aralığı çekme, sentetik örnek üretme, kaynağı temizleme (onaylı).
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { DataSourceStatus, ImportReport, SourcesResponse, ViewingSource } from '../../../../shared/intelligence'
import { zMixpanelMapping } from '../../../../shared/mixpanel-mapping'
import { apiUrl, sessionHeaders } from '../../api/session'
import { Button, Modal, ProgressBar, Switch, TextField, toast } from '../../ui'
import { STUDIO_API, StudioError, errorMessage, studioSend, uploadExport, useAction, useStudio } from './api'
import { fmtDate, fmtDateTime, fmtDuration, fmtInt } from './format'
import { Chip, Disclosure, Loadable, LoadingBlock, NotReady, Panel, SectionHead, SOURCE_LABEL } from './parts'

const SOURCE_NOTE: Record<ViewingSource, string> = {
  TVPLUS: 'Uygulamanın kendi olay günlüğü; köprü kendiliğinden çevirir.',
  MIXPANEL: 'Ham dışa aktarım dosyası ya da dışa aktarım API’si; eşleme dosyasıyla çevrilir.',
  SYNTHETIC: 'Tohumlu üreteç. Gerçek değildir; yalnız hattın uçtan uca çalıştığını gösterir.',
}

function whyActive(s: DataSourceStatus, all: DataSourceStatus[]): string {
  if (s.source === 'SYNTHETIC') {
    if (s.events === 0) return 'Sentetik örnek yok.'
    return s.active
      ? 'Gerçek kaynaklarda eşiğin altında izleyici var; sentetik örnek analize giriyor.'
      : 'Gerçek kaynaklar eşiği aştı; sentetik örnek analiz dışı (silinmedi).'
  }
  if (s.events === 0) return 'Bu kaynaktan veri gelmedi.'
  const synth = all.find((x) => x.source === 'SYNTHETIC')
  return s.active
    ? synth?.active
      ? 'Analize giriyor; sentetik örnekle birlikte (gerçek veri eşiğin altında).'
      : 'Analize giriyor.'
    : 'Analize girmiyor.'
}

export function SourcesSection(): ReactElement {
  const res = useStudio<SourcesResponse>('/sources')
  return (
    <>
      <SectionHead
        title="Veri Kaynakları"
        lead="Her kaynak aynı kanonik olaya çevrilir. Gerçek kaynaklarda yeterli izleyici olunca sentetik örnek analiz dışında kalır."
        actions={
          <button type="button" className="st-link" onClick={res.refetch}>
            Yenile
          </button>
        }
      />
      <Loadable res={res} what="Veri kaynakları" skeleton={<LoadingBlock lines={4} />}>
        {(d) => (
          <>
            <div className="st-grid3">
              {d.sources.map((s) => (
                <SourceCard key={s.source} s={s} all={d.sources} onChanged={res.refetch} />
              ))}
            </div>
            <MixpanelPanel d={d} onChanged={res.refetch} />
          </>
        )}
      </Loadable>
    </>
  )
}

function SourceCard({ s, all, onChanged }: { s: DataSourceStatus; all: DataSourceStatus[]; onChanged: () => void }): ReactElement {
  const [confirm, setConfirm] = useState(false)
  const action = useAction()
  const clear = async () => {
    const r = await action.run(() => studioSend<void>('DELETE', `/sources/${s.source}`))
    if (r !== null) {
      toast(`${SOURCE_LABEL[s.source]} kaynağı temizlendi.`, { kind: 'success' })
      setConfirm(false)
      onChanged()
    }
  }
  return (
    <Panel
      title={SOURCE_LABEL[s.source]}
      actions={
        <>
          {s.source === 'SYNTHETIC' && <Chip tone="sample">Sentetik örnek</Chip>}
          <Chip tone={s.active ? 'ok' : 'muted'}>{s.active ? 'Etkin' : 'Etkin değil'}</Chip>
        </>
      }
      className="st-source"
    >
      <p className="ui-caption">{SOURCE_NOTE[s.source]}</p>
      <dl className="st-dl st-dl--tight">
        <div className="st-dl__row">
          <dt>Olay</dt>
          <dd className="st-num">{fmtInt(s.events)}</dd>
        </div>
        <div className="st-dl__row">
          <dt>İzleyici</dt>
          <dd className="st-num">{fmtInt(s.viewers)}</dd>
        </div>
        <div className="st-dl__row">
          <dt>Başlık</dt>
          <dd className="st-num">{fmtInt(s.titles)}</dd>
        </div>
        <div className="st-dl__row">
          <dt>Aralık</dt>
          <dd>{s.firstTs ? `${fmtDate(s.firstTs)} – ${fmtDate(s.lastTs)}` : '—'}</dd>
        </div>
      </dl>
      <p className="ui-meta">{whyActive(s, all)}</p>
      {s.lastImport ? (
        <Disclosure summary={`Son içe aktarma · ${fmtDateTime(s.lastImport.finishedAt)}`}>
          <ReportView r={s.lastImport} />
        </Disclosure>
      ) : (
        <p className="ui-caption">İçe aktarma raporu yok.</p>
      )}
      <div className="st-actions">
        <Button variant="ghost" size="sm" disabled={s.events === 0} onClick={() => setConfirm(true)}>
          Kaynağı temizle
        </Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} label={`${SOURCE_LABEL[s.source]} kaynağını temizle`} maxWidth={460}>
        <div className="st-confirm">
          <h2 className="st-panel__title">{SOURCE_LABEL[s.source]} kaynağı temizlensin mi?</h2>
          <p className="ui-body">
            Bu kaynağın {fmtInt(s.events)} olayı silinir. Topluluklar, içgörüler ve model bundan sonra bu veri olmadan hesaplanır.
            {s.source === 'SYNTHETIC' ? ' Sentetik örnek istenirse yeniden üretilebilir.' : ' Gerçek veriyi geri getirmek için yeniden içe aktarmak gerekir.'}
          </p>
          {action.error && <p className="st-error">{action.error}</p>}
          <div className="st-actions">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
              Vazgeç
            </Button>
            <Button variant="accent" size="sm" onClick={clear} busy={action.busy}>
              Temizle
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  )
}

export function ReportView({ r }: { r: ImportReport }): ReactElement {
  const unmapped = Object.entries(r.unmappedEvents).sort((a, b) => b[1] - a[1])
  const ms = Date.parse(r.finishedAt) - Date.parse(r.startedAt)
  return (
    <div className="st-report">
      <p className="ui-meta">
        {SOURCE_LABEL[r.source]} · {fmtDateTime(r.startedAt)} · {fmtDuration(ms)}
        {r.from && r.to && ` · ${r.from} – ${r.to}`}
      </p>
      <div className="st-report__nums">
        <span>
          <strong>{fmtInt(r.lines)}</strong> satır
        </span>
        <span>
          <strong>{fmtInt(r.accepted)}</strong> kabul
        </span>
        <span>
          <strong>{fmtInt(r.duplicates)}</strong> yinelenen
        </span>
        <span>
          <strong>{fmtInt(r.rejected)}</strong> reddedilen
        </span>
      </div>
      <div className="st-grid2 st-grid2--tight">
        <div>
          <p className="st-h4">Eşlenmeyen olay adları</p>
          {unmapped.length === 0 ? (
            <p className="ui-caption">Yok</p>
          ) : (
            <ul className="st-kv">
              {unmapped.slice(0, 12).map(([k, n]) => (
                <li key={k}>
                  <span className="st-mono">{k}</span> <span className="st-num">{fmtInt(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="st-h4">Katalogda bulunamayan içerik kimlikleri</p>
          {r.unknownTitles.length === 0 ? (
            <p className="ui-caption">Yok</p>
          ) : (
            <ul className="st-kv">
              {r.unknownTitles.slice(0, 12).map((u) => (
                <li key={u.externalId}>
                  <span className="st-mono">{u.externalId}</span> <span className="st-num">{fmtInt(u.count)}</span>
                </li>
              ))}
              {r.unknownTitles.length > 12 && <li className="ui-caption">+{r.unknownTitles.length - 12} daha</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────── Mixpanel ───────────── */

function MixpanelPanel({ d, onChanged }: { d: SourcesResponse; onChanged: () => void }): ReactElement {
  const mp = d.mixpanel
  return (
    <>
      <Panel
        id="mixpanel"
        title="Mixpanel"
        sub="Kimlik bilgileri yalnız sunucunun ortam değişkenlerinden okunur; burada hiçbir gizli değer gösterilmez."
        actions={<Chip tone={mp.configured ? 'ok' : 'muted'}>{mp.configured ? 'Servis hesabı tanımlı' : 'Servis hesabı tanımlı değil'}</Chip>}
      >
        <dl className="st-dl">
          <dt>Veri bölgesi</dt>
          <dd>{mp.region.toUpperCase()}</dd>
          <dt>Eşlenen olaylar</dt>
          <dd className="st-chips">
            {mp.mappedEvents.map((e) => (
              <Chip key={e}>{e}</Chip>
            ))}
          </dd>
        </dl>
        <div className="st-grid2">
          <UploadBox onDone={onChanged} />
          <div className="st-stack">
            <PullBox configured={mp.configured} onDone={onChanged} />
            <SyntheticBox onDone={onChanged} />
          </div>
        </div>
      </Panel>
      <MappingEditor onSaved={onChanged} />
    </>
  )
}

function UploadBox({ onDone }: { onDone: () => void }): ReactElement {
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  const [report, setReport] = useState<{ r: ImportReport; dry: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)
  useEffect(() => () => abortRef.current?.(), [])
  const start = async () => {
    if (!file) return
    setError(null)
    setReport(null)
    setProgress(0)
    const up = uploadExport<ImportReport>(file, dryRun, setProgress)
    abortRef.current = up.abort
    try {
      const r = await up.promise
      setReport({ r, dry: dryRun })
      toast(dryRun ? 'Deneme bitti; depoya yazılmadı.' : `${fmtInt(r.accepted)} olay içe aktarıldı.`, { kind: 'success' })
      if (!dryRun) onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }
  return (
    <div className="st-box">
      <h3 className="st-h3">Dışa aktarım dosyası yükle</h3>
      <p className="ui-caption">Mixpanel ham olay dışa aktarımı: .jsonl ya da .jsonl.gz (en çok 1 GB). Dosya akış olarak gönderilir.</p>
      <label className="st-file">
        <span className="st-select__label">Dosya</span>
        <input
          type="file"
          accept=".jsonl,.json,.gz,.jsonl.gz,application/gzip,application/x-ndjson"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setReport(null)
            setError(null)
          }}
        />
      </label>
      {file && (
        <p className="ui-caption">
          {file.name} · {fmtInt(file.size / 1024)} KB
        </p>
      )}
      <Switch checked={dryRun} onChange={setDryRun} label="Deneme (depoya yazma)" description="Önce raporu görün; sonra kapatıp gerçek içe aktarın." />
      <div className="st-actions">
        {progress !== null && (
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.()}>
            İptal
          </Button>
        )}
        <Button variant="accent" size="sm" disabled={!file || progress !== null} busy={progress !== null} onClick={start}>
          {dryRun ? 'Dene' : 'İçe aktar'}
        </Button>
      </div>
      {progress !== null && <ProgressBar value={progress} label="Yükleme ilerlemesi" />}
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="st-result" role="status">
          <p className="st-h4">{report.dry ? 'Deneme raporu (depoya yazılmadı)' : 'İçe aktarma raporu'}</p>
          <ReportView r={report.r} />
        </div>
      )}
    </div>
  )
}

function PullBox({ configured, onDone }: { configured: boolean; onDone: () => void }): ReactElement {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const action = useAction()
  const [report, setReport] = useState<ImportReport | null>(null)
  const pull = async () => {
    const r = await action.run(() => studioSend<ImportReport>('POST', '/sources/mixpanel/pull', { from, to }))
    if (r) {
      setReport(r)
      onDone()
    }
  }
  return (
    <div className="st-box">
      <h3 className="st-h3">Tarih aralığı çek</h3>
      {!configured && (
        <p className="ui-caption">
          Sunucuda Mixpanel servis hesabı tanımlı değil. MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_SECRET ve
          MIXPANEL_PROJECT_ID ortam değişkenleri ayarlanınca açılır.
        </p>
      )}
      <div className="st-form-row">
        <TextField label="Başlangıç" type="date" value={from} onChange={setFrom} disabled={!configured} />
        <TextField label="Bitiş" type="date" value={to} onChange={setTo} disabled={!configured} />
      </div>
      <div className="st-actions">
        <Button variant="secondary" size="sm" disabled={!configured || !from || !to || action.busy} busy={action.busy} onClick={pull}>
          Çek
        </Button>
      </div>
      {action.error && <p className="st-error">{action.error}</p>}
      {report && <ReportView r={report} />}
    </div>
  )
}

function SyntheticBox({ onDone }: { onDone: () => void }): ReactElement {
  const [viewers, setViewers] = useState('')
  const [days, setDays] = useState('')
  const [seed, setSeed] = useState('')
  const action = useAction()
  const [report, setReport] = useState<ImportReport | null>(null)
  const gen = async () => {
    const body: Record<string, number> = {}
    for (const [k, v] of [
      ['viewers', viewers],
      ['days', days],
      ['seed', seed],
    ] as const) {
      if (v.trim()) body[k] = Number(v)
    }
    const r = await action.run(() => studioSend<ImportReport>('POST', '/sources/synthetic/generate', body))
    if (r) {
      setReport(r)
      toast('Sentetik örnek yenilendi.', { kind: 'success' })
      onDone()
    }
  }
  return (
    <div className="st-box">
      <h3 className="st-h3">
        Sentetik örnek üret <Chip tone="sample">Sentetik örnek</Chip>
      </h3>
      <p className="ui-caption">Mevcut sentetik örneğin yerini alır. Gerçek kaynaklara dokunmaz.</p>
      <div className="st-form-row">
        <TextField label="İzleyici" inputMode="numeric" placeholder="1500" value={viewers} onChange={(v) => setViewers(v.replace(/\D/g, ''))} />
        <TextField label="Gün" inputMode="numeric" placeholder="90" value={days} onChange={(v) => setDays(v.replace(/\D/g, ''))} />
        <TextField label="Tohum" inputMode="numeric" placeholder="7" value={seed} onChange={(v) => setSeed(v.replace(/\D/g, ''))} />
      </div>
      <div className="st-actions">
        <Button variant="secondary" size="sm" onClick={gen} busy={action.busy} disabled={action.busy}>
          Üret
        </Button>
      </div>
      {action.error && <p className="st-error">{action.error}</p>}
      {report && <ReportView r={report} />}
    </div>
  )
}

/* ───────────── Eşleme ───────────── */

async function fetchMapping(): Promise<{ text: string; origin: string }> {
  let res: Response
  try {
    res = await fetch(apiUrl(`${STUDIO_API}/sources/mixpanel/mapping`), {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...sessionHeaders() },
    })
  } catch {
    throw new StudioError('Sunucuya ulaşılamadı.', 0, 'NETWORK')
  }
  if (!res.ok) throw new StudioError(`Eşleme alınamadı (${res.status})`, res.status, null)
  const json: unknown = await res.json()
  return { text: JSON.stringify(json, null, 2), origin: res.headers.get('x-tvplus-mapping-origin') ?? 'bilinmiyor' }
}

const ORIGIN_LABEL: Record<string, string> = {
  override: 'sunucu deposundaki kopya (depodaki dosyanın önüne geçer)',
  repo: 'depodaki dosya (content/analytics/mixpanel-mapping.json)',
  builtin: 'yerleşik varsayılan',
}

function validateMapping(text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return `JSON okunamadı: ${errorMessage(e)}`
  }
  const r = zMixpanelMapping.safeParse(parsed)
  if (r.success) return null
  const i = r.error.issues[0]
  return `${i?.path.join('.') || 'kök'}: ${i?.message ?? 'geçersiz'}`
}

function MappingEditor({ onSaved }: { onSaved: () => void }): ReactElement {
  const [state, setState] = useState<{ text: string; origin: string; loaded: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const action = useAction()
  const load = () => {
    setLoadError(null)
    fetchMapping().then(
      (m) => setState({ text: m.text, origin: m.origin, loaded: m.text }),
      (e: unknown) => setLoadError(errorMessage(e)),
    )
  }
  useEffect(load, [])
  const problem = state ? validateMapping(state.text) : null
  const dirty = !!state && state.text !== state.loaded
  const save = async () => {
    if (!state || problem) return
    const r = await action.run(() => studioSend<unknown>('PUT', '/sources/mixpanel/mapping', JSON.parse(state.text)))
    if (r !== null) {
      toast('Eşleme kaydedildi.', { kind: 'success' })
      load()
      onSaved()
    }
  }
  return (
    <Panel
      id="esleme"
      title="Eşleme dosyası"
      sub="Hangi Mixpanel olayı hangi kanonik türe, hangi özellik hangi alana karşılık gelir. Yeni olay adı bağlamak için yalnız bu JSON düzenlenir."
    >
      {loadError && <NotReady detail={loadError} onRetry={load} />}
      {!state && !loadError && <LoadingBlock lines={3} block={false} />}
      {state && (
        <>
          <p className="ui-meta">Geçerli kaynak: {ORIGIN_LABEL[state.origin] ?? state.origin}</p>
          <Disclosure summary="JSON'u göster ve düzenle">
            <textarea
              className="st-code"
              spellCheck={false}
              aria-label="Eşleme JSON"
              value={state.text}
              rows={22}
              onChange={(e) => setState({ ...state, text: e.target.value })}
            />
            <p className={problem ? 'st-error' : 'ui-caption'} role="status">
              {problem ? `Geçersiz: ${problem}` : dirty ? 'Şemaya uygun; kaydedilmedi.' : 'Şemaya uygun.'}
            </p>
            {action.error && <p className="st-error">{action.error}</p>}
            <div className="st-actions">
              <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => setState({ ...state, text: state.loaded })}>
                Geri al
              </Button>
              <Button variant="accent" size="sm" disabled={!dirty || !!problem || action.busy} busy={action.busy} onClick={save}>
                Kaydet
              </Button>
            </div>
          </Disclosure>
        </>
      )}
    </Panel>
  )
}
