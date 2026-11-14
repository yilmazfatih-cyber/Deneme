/**
 * iPhone (iOS 17.1+) yolu: klasik MediaSource gizlenip sahte bir ManagedMediaSource sınıfı verilir. Gerçek Safari'de
 * sınanmamıştır; burada yalnız algılama, akış kapısı ve tarayıcının tamponu boşaltmasına karşı imleç düzeltmesi sınanır.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaSourceCtor,
  resetCapabilitiesCache,
  supportedProfiles,
  supportsMse,
  usesManagedMediaSource,
} from '../net/capabilities'
import { resyncAppendCursor } from './buffered'
import { StreamingGate } from './streamingGate'

class FakeManagedMediaSource extends EventTarget {
  streaming = false
  static asked: string[] = []
  /** Safari'de iPhone: H.264/AAC var, VP9/Opus (WebM) yok */
  static isTypeSupported(type: string): boolean {
    FakeManagedMediaSource.asked.push(type)
    return type.startsWith('video/mp4') || type.startsWith('audio/mp4')
  }
}
class FakeClassicMediaSource extends EventTarget {
  static isTypeSupported(): boolean {
    return true
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetCapabilitiesCache()
  FakeManagedMediaSource.asked = []
})

describe('ManagedMediaSource algılama', () => {
  it('klasik MediaSource yoksa ManagedMediaSource kullanılır; isTypeSupported ondan sorulur', () => {
    vi.stubGlobal('window', { MediaSource: undefined, ManagedMediaSource: FakeManagedMediaSource })
    expect(mediaSourceCtor()).toBe(FakeManagedMediaSource)
    expect(supportsMse()).toBe(true)
    expect(usesManagedMediaSource()).toBe(true)
    expect(supportedProfiles()).toEqual(['h264-mp4', 'aac-mp4'])
    expect(FakeManagedMediaSource.asked.length).toBe(4)
  })

  it('klasik MediaSource varsa (Chromium) o seçilir, yönetilen yol devreye girmez', () => {
    vi.stubGlobal('window', { MediaSource: FakeClassicMediaSource, ManagedMediaSource: FakeManagedMediaSource })
    expect(mediaSourceCtor()).toBe(FakeClassicMediaSource)
    expect(usesManagedMediaSource()).toBe(false)
    expect(FakeManagedMediaSource.asked).toEqual([])
  })

  it('ikisi de yoksa MSE yok', () => {
    vi.stubGlobal('window', {})
    expect(supportsMse()).toBe(false)
    expect(usesManagedMediaSource()).toBe(false)
  })
})

describe('akış kapısı (startstreaming / endstreaming)', () => {
  it('yönetilen kaynakta olaylara uyar ve açılınca haber verir', () => {
    const ms = new FakeManagedMediaSource()
    const changes: boolean[] = []
    const gate = new StreamingGate(ms, true, (o) => changes.push(o))
    expect(gate.allowed()).toBe(false) // streaming = false ile başladı
    ms.dispatchEvent(new Event('startstreaming'))
    expect(gate.allowed()).toBe(true)
    ms.dispatchEvent(new Event('endstreaming'))
    expect(gate.allowed()).toBe(false)
    expect(changes).toEqual([true, false])
    gate.dispose()
    ms.dispatchEvent(new Event('startstreaming'))
    expect(gate.allowed()).toBe(false)
  })

  it('klasik MediaSource için hep açık, olayları dinlemez', () => {
    const ms = new FakeManagedMediaSource()
    const gate = new StreamingGate(ms, false)
    ms.dispatchEvent(new Event('endstreaming'))
    expect(gate.allowed()).toBe(true)
  })
})

describe('tarayıcının tamponu boşaltması (bufferedchange)', () => {
  it('oynatma noktasının ilerisi silindiyse ekleme imleci tamponun sonuna çekilir', () => {
    // 10–40 sn eklenmişti, tarayıcı 25 sn sonrasını sildi
    expect(resyncAppendCursor([{ start: 10, end: 25 }], 20, 40)).toBe(25)
    // her şey silindi
    expect(resyncAppendCursor([], 20, 40)).toBe(20)
  })

  it('yalnız geride kalan silindiyse imleç değişmez', () => {
    expect(resyncAppendCursor([{ start: 18, end: 40 }], 20, 40)).toBeNull()
  })
})
