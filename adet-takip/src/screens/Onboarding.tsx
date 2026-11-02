import { useState } from 'react'
import { Stepper } from '../components/Stepper'
import { DEFAULT_PROFILE, MAX_CYCLE, MAX_PERIOD, MIN_CYCLE, MIN_PERIOD } from '../lib/cycle'
import { addDays, today as todayISO, type ISODate } from '../lib/dates'
import { useStore } from '../state/store'

/** İlk açılış: son adet tarihi, adet süresi, döngü uzunluğu. Her adım atlanabilir. */
export function Onboarding() {
  const { dispatch } = useStore()
  const [step, setStep] = useState(0)
  const [lastStart, setLastStart] = useState<ISODate>('')
  const [periodLength, setPeriodLength] = useState(DEFAULT_PROFILE.periodLength)
  const [cycleLength, setCycleLength] = useState(DEFAULT_PROFILE.cycleLength)
  const today = todayISO()

  const finish = () =>
    dispatch({
      type: 'onboard',
      profile: { cycleLength, periodLength, manualLengths: false },
      lastPeriodStart: lastStart || null,
    })

  const steps = [
    {
      title: 'Son adetin ne zaman başladı?',
      lead: 'Tahminler bu tarihten başlar. Hatırlamıyorsan atlayabilirsin; ilk adetini kaydettiğinde takvim oluşur.',
      body: (
        <input
          type="date"
          aria-label="Son adet başlangıcı"
          value={lastStart}
          max={today}
          min={addDays(today, -90)}
          onChange={(e) => setLastStart(e.target.value)}
        />
      ),
    },
    {
      title: 'Adetin genelde kaç gün sürer?',
      lead: 'Emin değilsen 5 gün bırak. Kayıtların biriktikçe uygulama kendi ortalamanı kullanır.',
      body: (
        <Stepper
          value={periodLength}
          min={MIN_PERIOD}
          max={MAX_PERIOD}
          onChange={setPeriodLength}
          label="Adet süresi"
        />
      ),
    },
    {
      title: 'Döngün genelde kaç gün?',
      lead: 'Bir adetin ilk gününden sonraki adetin ilk gününe kadar geçen süre. Çoğu kişide 21–35 gün.',
      body: (
        <Stepper value={cycleLength} min={MIN_CYCLE} max={MAX_CYCLE} onChange={setCycleLength} label="Döngü uzunluğu" />
      ),
    },
  ]
  const s = steps[step]
  const last = step === steps.length - 1

  return (
    <div className="onb">
      <div className="steps" aria-label={`Adım ${step + 1} / ${steps.length}`}>
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {step === 0 && (
        <div>
          <div style={{ fontSize: 44 }} aria-hidden="true">
            🌸
          </div>
          <h1>Döngü'ye hoş geldin</h1>
          <p className="lead">
            Adetini, belirtilerini ve doğurgan günlerini takip et. Verilerin yalnızca bu telefonda kalır; hesap ve
            internet gerekmez.
          </p>
        </div>
      )}
      <div className="card">
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{s.title}</h2>
        <p className="lead" style={{ fontSize: 15, marginBottom: 16 }}>
          {s.lead}
        </p>
        {s.body}
      </div>
      <div className="grow" />
      <div className="row">
        {step > 0 && (
          <button className="btn ghost" onClick={() => setStep(step - 1)}>
            Geri
          </button>
        )}
        <div className="grow" />
        <button className="btn primary" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? 'Başla' : 'Devam'}
        </button>
      </div>
    </div>
  )
}
