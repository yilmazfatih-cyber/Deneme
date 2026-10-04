/**
 * Sesli okuma. Öncelik sırası:
 *   1. Aile sesiyle ya da kişinin kendi sesiyle kaydedilmiş Blob
 *   2. Bir kez seslendirilmiş hazır ses dosyası (public/audio)
 *   3. Cihazın Türkçe sesi (Web Speech API, speechSynthesis)
 * Türkçe ses yoksa tarayıcı başka dile düşebilir; kurulumdaki "Türkçe ses testi" bunu gösterir.
 */

import manifest from '../../content/audio.json'
import { audioKey, splitSentences } from './audioKey'

/** Hazır kayıtlar: anahtar → dosya (scripts/make-audio.py üretir). */
const clips = manifest as Record<string, string>

export function clipFor(text: string): string | undefined {
  const file = clips[audioKey(text)]
  return file ? `${import.meta.env.BASE_URL}audio/${file}` : undefined
}

export function hasClips(): boolean {
  return Object.keys(clips).length > 0
}

export interface SpeechConfig {
  rate: number
  voiceURI?: string
}

const config: SpeechConfig = { rate: 0.8 }
/** Çalan kayıt; durdurulunca bekleyen söz de sonuçlanır (sıralı okuma takılmasın). */
let currentAudio: { el: HTMLAudioElement; done: () => void } | null = null

export function configureSpeech(next: Partial<SpeechConfig>): void {
  Object.assign(config, next)
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function turkishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('tr'))
}

/** Sesler bazı tarayıcılarda geç yüklenir; en fazla `timeoutMs` bekler. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  const now = window.speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, timeoutMs)
  })
}

/** Google metin okuma motorunun sesi mi? (Android: "tr-tr-x-…", masaüstü: "Google …") */
export function isGoogleVoice(v: SpeechSynthesisVoice): boolean {
  return /google/i.test(v.name) || /google|^tr-tr-x-/i.test(v.voiceURI)
}

const STRATEGY_KEY = 'kopru.sesYolu'
const LANG_ONLY = 'yalniz-dil'

function rememberedStrategy(): string | null {
  try {
    return localStorage.getItem(STRATEGY_KEY)
  } catch {
    return null
  }
}

function rememberStrategy(key: string): void {
  try {
    localStorage.setItem(STRATEGY_KEY, key)
  } catch {
    /* özel pencere vb. */
  }
}

interface Strategy {
  key: string
  voice?: SpeechSynthesisVoice
}

/**
 * Denenecek okuma yolları, sırasıyla: bakım verenin seçtiği ses, daha önce çalışan yol,
 * Google motorunun cihazdaki Türkçe sesi, Google'ın ağ sesi, yalnızca "tr-TR" dili (motor kendi seçer),
 * diğer Türkçe sesler.
 */
function strategies(): Strategy[] {
  const tr = turkishVoices()
  const byKey = new Map<string, Strategy>()
  for (const v of tr) byKey.set(v.voiceURI, { key: v.voiceURI, voice: v })
  byKey.set(LANG_ONLY, { key: LANG_ONLY })
  const order: (string | undefined)[] = [
    config.voiceURI,
    rememberedStrategy() ?? undefined,
    ...tr.filter((v) => isGoogleVoice(v) && v.localService).map((v) => v.voiceURI),
    ...tr.filter((v) => isGoogleVoice(v)).map((v) => v.voiceURI),
    LANG_ONLY,
    ...tr.filter((v) => v.localService).map((v) => v.voiceURI),
    ...tr.map((v) => v.voiceURI),
  ]
  const out: Strategy[] = []
  for (const key of order) {
    const st = key ? byKey.get(key) : undefined
    if (st && !out.includes(st)) out.push(st)
  }
  return out
}

/** Konuşma sürüyor ya da sırada bekliyor mu? */
function ttsBusy(): boolean {
  return speechSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)
}

export function stopSpeaking(): void {
  if (currentAudio) {
    const { el, done } = currentAudio
    currentAudio = null
    el.pause()
    done()
  }
  if (ttsBusy()) window.speechSynthesis.cancel()
}

/** Kayıt çalar. Hazır kayıtlar yavaş okunmuştur (0,8); hız ayarı oynatma hızına çevrilir. */
function playUrl(url: string, revoke: boolean, rate = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.playbackRate = Math.min(1.6, Math.max(0.6, rate))
    audio.preservesPitch = true
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (revoke) URL.revokeObjectURL(url)
      if (currentAudio?.el === audio) currentAudio = null
      if (error) reject(error)
      else resolve()
    }
    currentAudio = { el: audio, done: () => finish() }
    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('ses çalınamadı'))
    audio.play().catch((e: unknown) => finish(e instanceof Error ? e : new Error(String(e))))
  })
}

/** Android Chrome, konuşma bitmeden nesne çöpe giderse sesi keser; başvuruyu tut. */
let activeUtterance: SpeechSynthesisUtterance | null = null
/** Yeni bir okuma başlayınca eskisinin yedek denemeleri durur. */
let generation = 0

export interface TtsResult {
  started: boolean
  error?: string
  /** Çalışan yolun sesi (yalnızca dil ile okunduysa boş) */
  voiceName?: string
  strategy?: string
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Tek bir yolla okur. Başlayamazsa (hata ya da 3 sn sessizlik) started=false döner. */
function attempt(text: string, rate: number, st: Strategy, gen: number): Promise<TtsResult> {
  return new Promise((resolve) => {
    let started = false
    let settled = false
    const u = new SpeechSynthesisUtterance(text)
    const finish = (error?: string) => {
      if (settled) return
      settled = true
      if (activeUtterance === u) activeUtterance = null
      resolve({ started, error, voiceName: st.voice?.name, strategy: st.key })
    }
    u.lang = st.voice?.lang.replace('_', '-') ?? 'tr-TR'
    u.rate = rate
    if (st.voice) u.voice = st.voice
    u.onstart = () => {
      started = true
    }
    u.onend = () => finish()
    u.onerror = (e) => finish(e.error)
    activeUtterance = u
    // Chrome bazen konuşmayı "duraklatılmış" bırakır; önce sürdür.
    window.speechSynthesis.resume()
    window.speechSynthesis.speak(u)
    // Başlama denetimi: Android'de onstart gecikebilir; "speaking" da sayılır.
    setTimeout(() => {
      if (settled || gen !== generation) return
      if (!started && window.speechSynthesis.speaking) started = true
      if (!started) {
        window.speechSynthesis.cancel()
        finish('baslamadi')
      }
    }, 3000)
    // Bazı tarayıcılar onend göndermez; sonsuza dek bekleme.
    setTimeout(() => finish(), Math.max(6000, text.length * 220))
  })
}

async function speakTts(text: string, rate = config.rate, afterCancel = false): Promise<TtsResult> {
  if (!speechSupported() || !text.trim()) return { started: false, error: 'desteklenmiyor' }
  const gen = ++generation
  if (!turkishVoices().length) await loadVoices(800)
  // Android Chrome: cancel() ardından hemen speak() yeni cümleyi sessizce düşürebilir; kısa bekle.
  if (afterCancel) await wait(120)
  let last: TtsResult = { started: false, error: 'ses-yok' }
  for (const st of strategies()) {
    if (gen !== generation) return last
    last = await attempt(text, rate, st, gen)
    if (last.started) {
      if (st.key !== rememberedStrategy()) rememberStrategy(st.key)
      return last
    }
    // Kullanıcı başka karta dokunduysa yedek deneme yapma
    if (last.error === 'interrupted' || last.error === 'canceled') return last
    window.speechSynthesis.cancel()
    await wait(150)
  }
  return last
}

export interface SpeakOptions {
  blob?: Blob
  audioPath?: string
  rate?: number
  /** Cümle şeridi gibi parçalı metin: her parça ayrı kayıtla okunur */
  parts?: string[]
}

let speakGeneration = 0

/** Metni parçalara böler: önce bütün hâlinin kaydı, yoksa cümle cümle kayıt ya da cihaz sesi. */
function plan(text: string, parts?: string[]): { clip?: string; text: string }[] {
  const whole = clipFor(text)
  if (whole) return [{ clip: whole, text }]
  const out: { clip?: string; text: string }[] = []
  for (const part of parts?.length ? parts : [text]) {
    const c = clipFor(part)
    if (c) {
      out.push({ clip: c, text: part })
      continue
    }
    for (const sentence of splitSentences(part)) out.push({ clip: clipFor(sentence), text: sentence })
  }
  // Kayıtsız ardışık parçalar cihaz sesine tek seferde verilir (daha akıcı).
  const merged: { clip?: string; text: string }[] = []
  for (const p of out) {
    const last = merged.at(-1)
    if (!p.clip && last && !last.clip) last.text = `${last.text} ${p.text}`
    else merged.push({ ...p })
  }
  return merged
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const gen = ++speakGeneration
  let wasBusy = ttsBusy()
  stopSpeaking()
  if (opts.blob) {
    try {
      return await playUrl(URL.createObjectURL(opts.blob), true)
    } catch {
      /* kayıt çalınamazsa sıradaki yola düş */
    }
  }
  if (opts.audioPath) {
    try {
      return await playUrl(`${import.meta.env.BASE_URL}${opts.audioPath}`, false, (opts.rate ?? config.rate) / 0.8)
    } catch {
      /* dosya yoksa sıradaki yola düş */
    }
  }
  const rate = opts.rate ?? config.rate
  for (const piece of plan(text, opts.parts)) {
    if (gen !== speakGeneration) return
    if (piece.clip) {
      try {
        await playUrl(piece.clip, false, rate / 0.8)
        continue
      } catch {
        /* kayıt çalınamazsa cihaz sesi */
      }
    }
    if (gen !== speakGeneration) return
    await speakTts(piece.text, rate, wasBusy)
    wasBusy = false
  }
}

export interface VoiceCheck {
  supported: boolean
  turkish: boolean
  voiceName?: string
  /** Cihazdaki toplam ses sayısı */
  voiceCount: number
  /** Test cümlesi gerçekten çalmaya başladı mı? */
  started: boolean
  /** Hazır kayıtla mı çalındı? */
  clip: boolean
  error?: string
}

/** Türkçe ses testi: test cümlesini okur ve ne olduğunu ayrıntılı bildirir. */
export async function checkTurkishVoice(phrase: string): Promise<VoiceCheck> {
  const wasBusy = ttsBusy()
  stopSpeaking()
  const voices = speechSupported() ? await loadVoices() : []
  const tr = turkishVoices()
  const base = { supported: speechSupported(), turkish: tr.length > 0, voiceCount: voices.length }
  const clip = clipFor(phrase)
  if (clip) {
    try {
      await playUrl(clip, false, config.rate / 0.8)
      return { ...base, started: true, clip: true, voiceName: tr[0]?.name }
    } catch (e) {
      if (!base.supported) return { ...base, started: false, clip: true, error: String(e) }
    }
  }
  if (!base.supported) return { ...base, started: false, clip: false }
  const result = await speakTts(phrase, config.rate, wasBusy)
  return {
    ...base,
    voiceName: result.started ? (result.voiceName ?? 'tr-TR') : tr[0]?.name,
    started: result.started,
    clip: false,
    error: result.error,
  }
}
