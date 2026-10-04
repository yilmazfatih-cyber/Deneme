import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Android Chrome'u taklit eden sahte speechSynthesis: verilen seslerden hangisinin çaldığını biz belirleriz. */
class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

const voice = (name: string, voiceURI: string, localService: boolean) =>
  ({ name, voiceURI, lang: 'tr-TR', localService, default: false }) as SpeechSynthesisVoice

function installSynth(voices: SpeechSynthesisVoice[], works: (u: FakeUtterance) => boolean) {
  const spoken: FakeUtterance[] = []
  const synth = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    addEventListener: () => {},
    removeEventListener: () => {},
    resume: () => {},
    cancel: () => {},
    speak: (u: FakeUtterance) => {
      spoken.push(u)
      setTimeout(() => {
        if (works(u)) {
          u.onstart?.()
          u.onend?.()
        } else {
          u.onerror?.({ error: 'synthesis-failed' })
        }
      }, 5)
    },
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance })
  return spoken
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sesli okuma (Google motoru)', () => {
  it('önce Google motorunun cihazdaki Türkçe sesini dener', async () => {
    const spoken = installSynth(
      [voice('Samsung Türkçe', 'samsung-tr', true), voice('Türkçe Türkiye', 'tr-tr-x-cfs-local', true)],
      () => true,
    )
    const { speak } = await import('../../src/lib/speech')
    await speak('Su istiyorum')
    expect(spoken[0]!.voice?.voiceURI).toBe('tr-tr-x-cfs-local')
  })

  it('bir yol çalmazsa sıradakini dener ve çalışanı hatırlar', async () => {
    const spoken = installSynth(
      [voice('Türkçe Türkiye', 'tr-tr-x-cfs-local', true), voice('Samsung Türkçe', 'samsung-tr', true)],
      (u) => u.voice === null, // yalnızca "dil ile" okuma çalışıyor
    )
    const { speak } = await import('../../src/lib/speech')
    await speak('Su istiyorum')
    expect(spoken.map((u) => u.voice?.voiceURI ?? 'dil')).toEqual(['tr-tr-x-cfs-local', 'dil'])
    expect(localStorage.getItem('kopru.sesYolu')).toBe('yalniz-dil')

    spoken.length = 0
    await speak('Çay istiyorum')
    expect(spoken.map((u) => u.voice?.voiceURI ?? 'dil')).toEqual(['dil'])
  })

  it('ses testi ne olduğunu bildirir', async () => {
    installSynth([voice('Türkçe Türkiye', 'tr-tr-x-cfs-local', true)], () => false)
    const { checkTurkishVoice } = await import('../../src/lib/speech')
    const r = await checkTurkishVoice('Merhaba')
    expect(r).toMatchObject({ supported: true, turkish: true, started: false, voiceCount: 1 })
    expect(r.error).toBeTruthy()
  })
})
