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

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (speechSupported()) window.speechSynthesis.cancel()
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

function speakTts(text: string, rate = config.rate): Promise<void> {
  if (!speechSupported() || !text.trim()) return Promise.resolve()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'
    u.rate = rate
    const voice = pickVoice()
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
    // Bazı tarayıcılar onend göndermez; sonsuza dek bekleme.
    setTimeout(resolve, Math.max(2500, text.length * 180))
  })
}

export interface SpeakOptions {
  blob?: Blob
  audioPath?: string
  rate?: number
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
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
  return speakTts(text, opts.rate)
}

export interface VoiceCheck {
  supported: boolean
  turkish: boolean
  voiceName?: string
}

export async function checkTurkishVoice(): Promise<VoiceCheck> {
  if (!speechSupported()) return { supported: false, turkish: false }
  await loadVoices()
  const voice = pickVoice()
  return { supported: true, turkish: !!voice, voiceName: voice?.name }
}
