import { useRef, useState } from 'react'
import { Stepper } from '../components/Stepper'
import { MAX_CYCLE, MAX_PERIOD, MIN_CYCLE, MIN_PERIOD } from '../lib/cycle'
import { exportJSON, normalize } from '../lib/storage'
import { useStore } from '../state/store'

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  )
}

export function Settings() {
  const { state, stats, dispatch } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const download = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dongu-yedek-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const parsed = normalize(JSON.parse(await f.text()))
      dispatch({ type: 'import', state: parsed })
      setMsg(`Yedek yüklendi: ${parsed.periods.length} adet, ${Object.keys(parsed.logs).length} günlük kayıt.`)
    } catch {
      setMsg('Dosya okunamadı. Bu uygulamadan alınmış bir .json yedeği seç.')
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Ayarlar</h1>

      <div className="card">
        <h3>Döngü</h3>
        <div className="setting">
          <div>
            <label htmlFor="manual">Uzunlukları elle belirle</label>
            <p className="muted" style={{ fontSize: 13 }}>
              Kapalıyken son {6} döngünün ortalaması kullanılır.
            </p>
          </div>
          <Switch
            checked={state.profile.manualLengths}
            onChange={(v) => dispatch({ type: 'setProfile', profile: { manualLengths: v } })}
            label="Uzunlukları elle belirle"
          />
        </div>
        <div className="setting">
          <label>Döngü uzunluğu</label>
          {state.profile.manualLengths ? (
            <Stepper
              value={state.profile.cycleLength}
              min={MIN_CYCLE}
              max={MAX_CYCLE}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { cycleLength: v } })}
              label="Döngü uzunluğu"
            />
          ) : (
            <span className="muted">{stats.cycleLength} gün (ortalama)</span>
          )}
        </div>
        <div className="setting">
          <label>Adet süresi</label>
          {state.profile.manualLengths ? (
            <Stepper
              value={state.profile.periodLength}
              min={MIN_PERIOD}
              max={MAX_PERIOD}
              onChange={(v) => dispatch({ type: 'setProfile', profile: { periodLength: v } })}
              label="Adet süresi"
            />
          ) : (
            <span className="muted">{stats.periodLength} gün (ortalama)</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Hatırlatmalar</h3>
        <div className="setting">
          <div>
            <label>Adet yaklaşınca uyar</label>
            <p className="muted" style={{ fontSize: 13 }}>
              Tahmini başlangıçtan 3 gün önce Bugün ekranında uyarı.
            </p>
          </div>
          <Switch
            checked={state.settings.periodReminder}
            onChange={(v) => dispatch({ type: 'setSettings', settings: { periodReminder: v } })}
            label="Adet yaklaşınca uyar"
          />
        </div>
      </div>

      <div className="card">
        <h3>Veri</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
          Tüm veriler bu cihazda saklanır; sunucuya gönderilmez. Telefon değiştirirken yedek al.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={download}>
            Yedek indir (.json)
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            Yedeği geri yükle
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Yedek dosyası"
            onChange={(e) => importFile(e.target.files?.[0])}
          />
        </div>
        {msg && (
          <p role="status" style={{ marginTop: 12 }}>
            {msg}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Tüm verileri sil</h3>
        {confirmReset ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <p className="grow">Bu işlem geri alınamaz. Emin misin?</p>
            <button className="btn danger" onClick={() => dispatch({ type: 'reset' })}>
              Evet, sil
            </button>
            <button className="btn ghost" onClick={() => setConfirmReset(false)}>
              Vazgeç
            </button>
          </div>
        ) : (
          <button className="btn ghost" style={{ color: '#b42318' }} onClick={() => setConfirmReset(true)}>
            Verileri sil ve baştan başla
          </button>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Döngü v{__APP_VERSION__}. Tahminler geçmiş kayıtlara dayalı ortalamalardır; doğum kontrolü veya tıbbi tanı
        yerine geçmez. Döngün 21 günden kısa ya da 35 günden uzunsa veya ağrın günlük hayatı etkiliyorsa bir hekime
        danış.
      </p>
    </div>
  )
}
