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

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = turkishVoices()
  return voices.find((v) => v.voiceURI === config.voiceURI) ?? voices.find((v) => v.localService) ?? voices[0]
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

export interface TtsResult {
  started: boolean
  error?: string
}

function speakTts(text: string, rate = config.rate, afterCancel = false): Promise<TtsResult> {
  if (!speechSupported() || !text.trim()) return Promise.resolve({ started: false, error: 'desteklenmiyor' })
  return new Promise((resolve) => {
    let started = false
    let settled = false
    const finish = (error?: string) => {
      if (settled) return
      settled = true
      if (activeUtterance === u) activeUtterance = null
      resolve({ started, error })
    }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'
    u.rate = rate
    const voice = pickVoice()
    if (voice) u.voice = voice
    u.onstart = () => {
      started = true
    }
    u.onend = () => finish()
    u.onerror = (e) => finish(e.error)
    activeUtterance = u
    const go = () => {
      // Chrome bazen konuşmayı "duraklatılmış" bırakır; önce sürdür.
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(u)
    }
    // Android Chrome: cancel() ardından hemen speak() yeni cümleyi sessizce düşürebilir; kısa bekle.
    if (afterCancel) setTimeout(go, 120)
    else go()
    // Bazı tarayıcılar onend göndermez; sonsuza dek bekleme.
    setTimeout(() => finish(started ? undefined : 'baslamadi'), Math.max(4000, text.length * 200))
  })
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
  const voice = pickVoice()
  const result = await speakTts(phrase, config.rate, wasBusy)
  return {
    supported: true,
    turkish: !!voice,
    voiceName: voice?.name,
    voiceCount: voices.length,
    started: result.started,
    error: result.error,
  }
}
