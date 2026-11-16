/**
 * Ortak risk modelinin değerlendiricisi: bir uygulama gününün deneyimi + kullanıcının durumu → o günün "son gün"
 * olma lojiti. Simülatör her simüle günün sonunda bunu çağırır; ikizlerin başlangıç durumu da bununla hesaplanır.
 * Model `analyzeTriggers` çıktısıdır (triggers.ts); sütun adları burada çözülür.
 */
import type { TupleFile } from './data'
import { tenureBucket, TRIGGERS, type DayExp, type HazardModel } from './triggers'

export interface HazardEvaluator {
  /**
   * Lojit. `prior`: önceki penceredeki uygulama günü sayısı · `tenure`: ilk görüldüğünden beri gün (bilinmiyorsa −1) ·
   * `device`: cihaz sınıfı kodu · `tuple`: boyut demeti kimliği.
   */
  eta(x: DayExp, prior: number, tenure: number, device: number, tuple: number): number
  /** Modelin churn süresi (gün) ve önceki etkinlik penceresi */
  n: number
  priorWindow: number
  baseRate: number
}

export function hazardEvaluator(model: HazardModel, tuples: TupleFile): HazardEvaluator {
  const triggerCols: { test: (x: DayExp) => boolean; coef: number }[] = []
  let priorCoef = 0
  const tenureCoef = [0, 0, 0]
  const deviceCoef = [0, 0, 0, 0, 0]
  // Boyut kuklaları: demet başına toplam katkı önceden hesaplanır
  const dimEta = new Float64Array(tuples.tuples.length)
  model.columns.forEach((col, k) => {
    const b = model.coef[k + 1]
    if (col.kind === 'tetik') {
      const t = TRIGGERS.find((x) => x.key === col.name)
      if (t) triggerCols.push({ test: t.test, coef: b })
      return
    }
    switch (col.name) {
      case 'ln_onceki_gun':
        priorCoef = b
        return
      case 'kidem_0_7':
        tenureCoef[0] = b
        return
      case 'kidem_8_30':
        tenureCoef[1] = b
        return
      case 'kidem_31_90':
        tenureCoef[2] = b
        return
      case 'cihaz_tv':
        deviceCoef[1] = b
        return
      case 'cihaz_mobil':
        deviceCoef[2] = b
        return
      case 'cihaz_web':
        deviceCoef[3] = b
        return
      default:
        break
    }
    const m = /^boyut:([^=]+)=(.*)$/.exec(col.name)
    if (!m) return
    const di = tuples.dimNames.indexOf(m[1])
    if (di < 0) return
    const code = tuples.dimValues[di].indexOf(m[2])
    if (code < 0) return
    for (let t = 0; t < tuples.tuples.length; t++) if ((tuples.tuples[t][di] ?? 0) === code) dimEta[t] += b
  })
  const intercept = model.coef[0]
  return {
    n: model.n,
    priorWindow: model.priorWindow,
    baseRate: model.baseRate,
    eta(x, prior, tenure, device, tuple) {
      let eta = intercept + priorCoef * Math.log1p(prior)
      for (const c of triggerCols) if (c.test(x)) eta += c.coef
      const tb = tenureBucket(tenure)
      if (tb < 3) eta += tenureCoef[tb]
      eta += deviceCoef[device] ?? 0
      if (tuple < dimEta.length) eta += dimEta[tuple]
      return eta
    },
  }
}
