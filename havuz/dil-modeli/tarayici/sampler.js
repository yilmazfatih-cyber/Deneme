// Örnekleme kuralları (tarayıcı). Python karşılığı: dil_modeli/sampling.py — aynı sırayla uygulanır:
// yineleme cezası -> (sıcaklık 0 ise açgözlü) -> sıcaklık -> top-k -> top-p -> çekiliş.
// Açgözlü üretim Python ile bire bir aynıdır; tohumlu çekiliş ise farklı bir rastgele sayı
// üreteci kullandığı için Python'unkiyle aynı sırayı vermez (bkz. docs/MIMARI.md).
// Genişletme: Yeni bir yöntem için `sampleToken` içine "YENİ ÖRNEKLEME YÖNTEMİ BURAYA" satırının
// üstüne bir adım ekleyin ve sampler.test.js'e test yazın.

export const DEFAULT_SAMPLING = Object.freeze({
  maxNewTokens: 200,
  temperature: 0.8,
  topK: 0,
  topP: 1,
  repetitionPenalty: 1,
  repetitionWindow: 64,
  stop: [],
  seed: null,
})

/** Tohumlu, hızlı ve küçük rastgele sayı üreteci (mulberry32): [0, 1) aralığında sayı verir. */
export function makeRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function argmax(values) {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i
  return best
}

export function applyRepetitionPenalty(logits, history, penalty) {
  for (const id of new Set(history)) {
    const value = logits[id]
    logits[id] = value > 0 ? value / penalty : value * penalty
  }
}

/** Logitlerden (Float32Array, değiştirilir) bir sonraki belirteci seçer. */
export function sampleToken(logits, history, options, random) {
  const config = { ...DEFAULT_SAMPLING, ...options }
  if (config.repetitionPenalty !== 1 && history.length) {
    const window = config.repetitionWindow ? history.slice(-config.repetitionWindow) : history
    applyRepetitionPenalty(logits, window, config.repetitionPenalty)
  }
  if (config.temperature === 0) return argmax(logits)
  const order = Array.from(logits.keys()).sort((a, b) => logits[b] - logits[a] || a - b)
  let keep = order.length
  if (config.topK > 0 && config.topK < keep) {
    const threshold = logits[order[config.topK - 1]]
    keep = config.topK
    while (keep < order.length && logits[order[keep]] === threshold) keep++ // eşitler de kalır
  }
  const scaled = order.slice(0, keep).map((id) => logits[id] / config.temperature)
  const top = scaled[0]
  let probs = scaled.map((value) => Math.exp(value - top))
  let total = probs.reduce((sum, p) => sum + p, 0)
  if (config.topP < 1) {
    let before = 0
    let cut = probs.length
    for (let i = 0; i < probs.length; i++) {
      if (before >= config.topP * total) {
        cut = i
        break
      }
      before += probs[i]
    }
    probs = probs.slice(0, Math.max(1, cut))
    total = probs.reduce((sum, p) => sum + p, 0)
  }
  // YENİ ÖRNEKLEME YÖNTEMİ BURAYA
  let point = random() * total
  for (let i = 0; i < probs.length; i++) {
    point -= probs[i]
    if (point < 0) return order[i]
  }
  return order[probs.length - 1]
}
