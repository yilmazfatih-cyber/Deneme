/**
 * Sesli okuma. Öncelik sırası:
 *   1. Aile sesiyle ya da kişinin kendi sesiyle kaydedilmiş Blob
 *   2. Bir kez seslendirilmiş hazır ses dosyası (public/audio)
 *   3. Cihazın Türkçe sesi (Web Speech API, speechSynthesis)
 * Türkçe ses yoksa tarayıcı başka dile düşebilir; kurulumdaki "Türkçe ses testi" bunu gösterir.
 */

export interface SpeechConfig {
  rate: number
  voiceURI?: string
}

const config: SpeechConfig = { rate: 0.8 }
let currentAudio: HTMLAudioElement | null = null

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
    currentAudio.pause()
    currentAudio = null
  }
  if (ttsBusy()) window.speechSynthesis.cancel()
}

function playUrl(url: string, revoke: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    currentAudio = audio
    const finish = () => {
      if (revoke) URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
    }
    audio.onended = () => {
      finish()
      resolve()
    }
    audio.onerror = () => {
      finish()
      reject(new Error('ses çalınamadı'))
    }
    audio.play().catch((e: unknown) => {
      finish()
      reject(e instanceof Error ? e : new Error(String(e)))
    })
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
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const wasBusy = ttsBusy()
  stopSpeaking()
  if (opts.blob) {
    try {
      return await playUrl(URL.createObjectURL(opts.blob), true)
    } catch {
      /* kayıt çalınamazsa cihaz sesine düş */
    }
  }
  if (opts.audioPath) {
    try {
      return await playUrl(`${import.meta.env.BASE_URL}${opts.audioPath}`, false)
    } catch {
      /* dosya yoksa cihaz sesine düş */
    }
  }
  await speakTts(text, opts.rate, wasBusy)
}

export interface VoiceCheck {
  supported: boolean
  turkish: boolean
  voiceName?: string
  /** Cihazdaki toplam ses sayısı */
  voiceCount: number
  /** Test cümlesi gerçekten çalmaya başladı mı? */
  started: boolean
  error?: string
}

/** Türkçe ses testi: test cümlesini okur ve ne olduğunu ayrıntılı bildirir. */
export async function checkTurkishVoice(phrase: string): Promise<VoiceCheck> {
  if (!speechSupported()) return { supported: false, turkish: false, voiceCount: 0, started: false }
  const wasBusy = ttsBusy()
  stopSpeaking()
  const voices = await loadVoices()
  const result = await speakTts(phrase, config.rate, wasBusy)
  const tr = turkishVoices()
  return {
    supported: true,
    turkish: tr.length > 0,
    voiceName: result.started ? (result.voiceName ?? 'tr-TR') : tr[0]?.name,
    voiceCount: voices.length,
    started: result.started,
    error: result.error,
  }
}
