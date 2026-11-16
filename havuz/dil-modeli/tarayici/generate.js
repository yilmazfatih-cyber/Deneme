// Üretim döngüsü (tarayıcı). Python karşılığı: dil_modeli/generate.py — aynı bağlam kuralı:
// istem bağlamdan uzunsa sonu tutulur; bağlam dolunca son yarıyla önbellek yeniden kurulur.
// `generateIds` belirteçleri tek tek verir (eşzamanlı üreteç); `generateText` metni parça parça
// geri çağrıya iletir ve arada tarayıcıya nefes aldırır (arayüz donmasın).
// Genişletme: Yeni bir durma koşulu için `generateText` içindeki döngüye ekleyin.

import { DEFAULT_SAMPLING, makeRandom, sampleToken } from './sampler.js'
import { StreamDecoder } from './tokenizer.js'

export function* generateIds(model, promptIds, options = {}, stopIds = new Set()) {
  const config = { ...DEFAULT_SAMPLING, ...options }
  const limit = model.config.max_seq_len
  const history = [...promptIds]
  if (!history.length) throw new Error('İstem boş olamaz; en azından <|bas|> belirtecini verin.')
  const random = makeRandom(config.seed ?? Math.floor(Math.random() * 2 ** 32))
  let pending = history.slice(-(limit - 1))
  let cache = model.newCache()
  for (let step = 0; step < config.maxNewTokens; step++) {
    if (cache.length + pending.length > limit) {
      pending = history.slice(-Math.floor(limit / 2))
      cache = model.newCache()
    }
    let logits = null
    for (const token of pending) logits = model.forward(token, cache)
    const window = config.repetitionWindow ? history.slice(-config.repetitionWindow) : history
    const token = sampleToken(Float32Array.from(logits), window, config, random)
    if (stopIds.has(token)) return
    yield token
    history.push(token)
    pending = [token]
  }
}

/** Akan metinde durdurma yazılarını arar; yazının başı olabilecek sonu bekletir. */
export class StopChecker {
  constructor(stops = []) {
    this.stops = stops.filter(Boolean)
    this.buffer = ''
  }
  feed(text) {
    this.buffer += text
    const hits = this.stops.map((stop) => this.buffer.indexOf(stop)).filter((i) => i >= 0)
    if (hits.length) {
      const ready = this.buffer.slice(0, Math.min(...hits))
      this.buffer = ''
      return { ready, stopped: true }
    }
    let hold = 0
    for (const stop of this.stops) {
      for (let size = Math.min(stop.length - 1, this.buffer.length); size > hold; size--) {
        if (stop.startsWith(this.buffer.slice(-size))) {
          hold = size
          break
        }
      }
    }
    const cut = this.buffer.length - hold
    const ready = this.buffer.slice(0, cut)
    this.buffer = this.buffer.slice(cut)
    return { ready, stopped: false }
  }
  flush() {
    const ready = this.buffer
    this.buffer = ''
    return ready
  }
}

/**
 * İstemin devamını üretir; her yeni metin parçası `onText(parça)` ile bildirilir.
 * `signal` (AbortSignal) ile durdurulabilir. Sonuç: { text, tokens, finishReason }.
 */
export async function generateText(model, tokenizer, promptIds, options = {}, onText = () => {}, signal = null) {
  const config = { ...DEFAULT_SAMPLING, ...options }
  const stopIds = new Set([model.special.eos, ...(options.stopIds ?? [])])
  const decoder = new StreamDecoder(tokenizer)
  const stopper = new StopChecker(config.stop)
  let text = ''
  let tokens = 0
  let finishReason = 'length'
  const emit = (piece) => {
    if (piece) {
      text += piece
      onText(piece)
    }
  }
  for (const token of generateIds(model, promptIds, config, stopIds)) {
    tokens++
    const { ready, stopped } = stopper.feed(decoder.push(token))
    emit(ready)
    if (stopped) return { text, tokens, finishReason: 'stop' }
    if (signal?.aborted) return { text, tokens, finishReason: 'abort' }
    if (tokens % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (tokens < config.maxNewTokens) finishReason = 'stop'
  const { ready, stopped } = stopper.feed(decoder.flush())
  emit(stopped ? ready : ready + stopper.flush())
  return { text, tokens, finishReason: stopped ? 'stop' : finishReason }
}
