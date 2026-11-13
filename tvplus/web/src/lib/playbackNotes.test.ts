import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { afterBookmarkSaves, notePlayback, playbackSince, resetPlaybackNotes, trackBookmarkSave } from './playbackNotes'

beforeEach(() => resetPlaybackNotes())
afterEach(() => vi.useRealTimers())

describe('oynatma notları', () => {
  it('iki okuyucu birbirinin notunu tüketmez', () => {
    notePlayback(80010002)
    const home = playbackSince(0)
    expect(home.ids).toEqual([80010002])
    // ana sayfa okudu; detay kendi imlecinden okur ve aynı notu görür
    const detail = playbackSince(0)
    expect(detail.ids).toEqual([80010002])
    // imleçten sonrası boş
    expect(playbackSince(home.cursor).ids).toEqual([])
  })

  it('bölümle birlikte üst dizisini de not eder; geçersiz kimlikleri atlar', () => {
    notePlayback(80020101, 80020001)
    notePlayback(0, null)
    notePlayback(undefined)
    notePlayback(Number.NaN)
    expect(playbackSince(0).ids.sort()).toEqual([80020001, 80020101])
  })

  it('aynı video yeniden oynatılınca imleçten sonra yine görünür', () => {
    notePlayback(1)
    const first = playbackSince(0)
    notePlayback(2)
    notePlayback(1)
    expect(playbackSince(first.cursor).ids.sort()).toEqual([1, 2])
  })
})

describe('yolda olan yer imi kaydı', () => {
  it('kayıt yoksa hemen çalışır', () => {
    const fn = vi.fn()
    afterBookmarkSaves(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('kayıt bitene dek bekler; başarı da hata da bekleyeni çalıştırır', async () => {
    let finish: () => void = () => {}
    let fail: (e: Error) => void = () => {}
    trackBookmarkSave(new Promise<void>((r) => (finish = r)))
    trackBookmarkSave(new Promise<void>((_, rej) => (fail = rej)))
    const fn = vi.fn()
    afterBookmarkSaves(fn)
    expect(fn).not.toHaveBeenCalled()

    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(fn).not.toHaveBeenCalled() // ikinci kayıt hâlâ yolda

    fail(new Error('ağ'))
    await Promise.resolve()
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('kayıt takılırsa en geç süre dolunca bir kez çalışır', async () => {
    vi.useFakeTimers()
    let finish: () => void = () => {}
    trackBookmarkSave(new Promise<void>((r) => (finish = r)))
    const fn = vi.fn()
    afterBookmarkSaves(fn, 500)
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)

    // sonradan biten kayıt bekleyeni ikinci kez çalıştırmaz
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
