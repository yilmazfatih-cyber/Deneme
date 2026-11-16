import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FLAGS } from '../../../shared/experiments'
import type { BootContext } from '../../../shared/types'
import { applyBoot } from '../api/session'
import { getFlag, noteFlagRead, resetFlagExposures } from './flags'

const logEvent = vi.fn()
vi.mock('../telemetry/logger', () => ({ logEvent: (...args: unknown[]) => logEvent(...args) }))

function boot(patch: Partial<BootContext> = {}, guid = 'P1'): BootContext {
  return {
    buildId: 'test',
    region: 'TR',
    serverTime: new Date(0).toISOString(),
    membershipStatus: 'CURRENT_MEMBER',
    account: null,
    profiles: [],
    activeProfile: { guid, name: 'Deniz', avatarUrl: '', isKids: false, maturityLevel: 110 },
    esn: 'ESN',
    authURL: null,
    persistedQueryVersion: 1,
    featureFlags: {},
    falcorCache: null,
    flags: { ...DEFAULT_FLAGS },
    experiments: [],
    ...patch,
  }
}

beforeEach(() => {
  logEvent.mockClear()
  resetFlagExposures()
})

describe('istemci bayrakları', () => {
  it('açılış bağlamındaki değer; tanınmayan değer ya da eksik bağlamda varsayılan', () => {
    applyBoot(boot({ flags: { ...DEFAULT_FLAGS, 'preview.autoplay': 'off' } }))
    expect(getFlag('preview.autoplay')).toBe('off')
    expect(getFlag('home.top10')).toBe('top')
    applyBoot(boot({ flags: { ...DEFAULT_FLAGS, 'preview.autoplay': 'belki' as 'on' } }))
    expect(getFlag('preview.autoplay')).toBe('on')
    // eski sunucu: flags alanı yok
    applyBoot({ ...boot(), flags: undefined as unknown as BootContext['flags'] })
    expect(getFlag('player.autoplayNext')).toBe('off')
  })

  it('istemci bayrağı okunduğunda o bayrağı yöneten deneyin maruziyeti oturumda bir kez', () => {
    applyBoot(
      boot({
        flags: { ...DEFAULT_FLAGS, 'preview.autoplay': 'off' },
        experiments: [
          { experiment: 'onizleme', variant: 'kapali', flags: ['preview.autoplay'] },
          { experiment: 'sayfa', variant: 'kisisel', flags: ['home.pageRanker'] },
        ],
      }),
    )
    noteFlagRead('preview.autoplay')
    noteFlagRead('preview.autoplay')
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('experiment.exposure', { experiment: 'onizleme', variant: 'kapali' })
    // sunucu bayrağı: istemci maruziyet yazmaz
    noteFlagRead('home.pageRanker')
    // atanmamış istemci bayrağı: olay yok
    noteFlagRead('player.autoplayNext')
    expect(logEvent).toHaveBeenCalledTimes(1)
  })

  it('profil değişince yeni profil için ayrıca bir kez', () => {
    const experiments = [{ experiment: 'onizleme', variant: 'kontrol', flags: ['preview.autoplay' as const] }]
    applyBoot(boot({ experiments }, 'P1'))
    noteFlagRead('preview.autoplay')
    applyBoot(boot({ experiments }, 'P2'))
    noteFlagRead('preview.autoplay')
    noteFlagRead('preview.autoplay')
    expect(logEvent).toHaveBeenCalledTimes(2)
  })
})
