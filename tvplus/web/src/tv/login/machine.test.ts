import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TvLoginPoll, TvLoginStart } from '../../../../shared/devices'
import type { BootContext } from '../../../../shared/types'
import { START_RETRY_MS, TvLoginFlow, type TvLoginView } from './machine'

const startOf = (n: number, expiresInSec = 600): TvLoginStart => ({
  deviceCode: `dc${n}`,
  userCode: `KLMN-48${n}${n}`,
  verificationUrl: `http://192.168.1.5:8787/#/bagla?kod=KLMN48${n}${n}`,
  qrUrl: `/api/tv/login/qr.svg?kod=KLMN48${n}${n}`,
  expiresInSec,
  intervalSec: 2,
})
const boot = { membershipStatus: 'CURRENT_MEMBER', activeProfile: null } as unknown as BootContext

function harness(polls: (TvLoginPoll | Error)[], expiresInSec = 600) {
  let n = 0
  const views: TvLoginView[] = []
  const start = vi.fn(async () => startOf(++n, expiresInSec))
  const poll = vi.fn(async (_dc: string) => {
    const next = polls.shift() ?? { status: 'PENDING' as const }
    if (next instanceof Error) throw next
    return next
  })
  const flow = new TvLoginFlow(
    {
      start,
      poll,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    (v) => views.push(v),
  )
  return { flow, views, start, poll }
}

describe('TV giriş akışı', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('pending → approved: aralıkla yoklar, onayda bağlamı verir ve durur', async () => {
    const h = harness([{ status: 'PENDING' }, { status: 'APPROVED', boot }])
    h.flow.begin()
    expect(h.flow.view().phase).toBe('starting')
    await vi.advanceTimersByTimeAsync(0)
    const v = h.flow.view()
    expect(v.phase).toBe('pending')
    if (v.phase === 'pending') {
      expect(v.start.userCode).toBe('KLMN-4811')
      expect(v.expiresAt).toBe(Date.parse('2026-11-13T10:10:00Z'))
    }
    expect(h.poll).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.poll).toHaveBeenCalledTimes(1)
    expect(h.poll).toHaveBeenCalledWith('dc1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.flow.view()).toEqual({ phase: 'approved', boot })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.poll).toHaveBeenCalledTimes(2)
  })

  it('denied → sakin bildirimle yeni kod', async () => {
    const h = harness([{ status: 'DENIED' }])
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(2000)
    const v = h.flow.view()
    expect(v.phase).toBe('pending')
    if (v.phase === 'pending') {
      expect(v.notice).toBe('denied')
      expect(v.start.deviceCode).toBe('dc2')
    }
    expect(h.start).toHaveBeenCalledTimes(2)
  })

  it('sunucu EXPIRED derse yeni kod', async () => {
    const h = harness([{ status: 'EXPIRED' }])
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(2000)
    const v = h.flow.view()
    expect(v.phase === 'pending' && v.notice).toBe('expired')
    expect(h.start).toHaveBeenCalledTimes(2)
  })

  it('geri sayım biterse (sunucu sormadan) kod kendiliğinden yenilenir', async () => {
    const h = harness([], 30)
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(29_000)
    expect(h.start).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.start).toHaveBeenCalledTimes(2)
    const v = h.flow.view()
    expect(v.phase === 'pending' && v.start.deviceCode).toBe('dc2')
    // eski kodun yoklaması bitti, yenisi sürüyor
    h.poll.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.poll).toHaveBeenCalledWith('dc2')
  })

  it('yoklamada ağ hatası akışı bozmaz', async () => {
    const h = harness([new Error('ağ yok'), { status: 'APPROVED' }])
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.flow.view().phase).toBe('pending')
    await vi.advanceTimersByTimeAsync(2000)
    expect(h.flow.view()).toEqual({ phase: 'approved', boot: null })
  })

  it('kod alınamazsa hata gösterir ve beklemeden sonra yeniden dener', async () => {
    const h = harness([])
    h.start.mockRejectedValueOnce(new Error('sunucu yok'))
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.flow.view()).toMatchObject({ phase: 'error', message: 'sunucu yok' })
    await vi.advanceTimersByTimeAsync(START_RETRY_MS)
    expect(h.flow.view().phase).toBe('pending')
  })

  it('dispose sonrası gelen yanıtlar yok sayılır', async () => {
    const h = harness([{ status: 'APPROVED', boot }])
    h.flow.begin()
    await vi.advanceTimersByTimeAsync(0)
    h.flow.dispose()
    const before = h.views.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.poll).not.toHaveBeenCalled()
    expect(h.views.length).toBe(before)
  })
})
