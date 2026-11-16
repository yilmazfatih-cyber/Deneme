import { describe, expect, it, vi } from 'vitest'
import { installPreloadRecovery, PRELOAD_RELOAD_KEY } from '../../src/lib/preloadRecovery.ts'

function fakeTarget(storageWorks = true) {
  const values = new Map<string, string>()
  let handler: ((event: Event) => void) | undefined
  const reload = vi.fn()
  const target = {
    addEventListener: (_type: 'vite:preloadError', listener: (event: Event) => void) => {
      handler = listener
    },
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => {
        if (!storageWorks) throw new Error('depolama kapalı')
        return values.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (!storageWorks) throw new Error('depolama kapalı')
        values.set(key, value)
      },
    },
  }
  const fire = () => {
    const event = new Event('vite:preloadError', { cancelable: true })
    handler?.(event)
    return event
  }
  return { target, reload, values, fire }
}

describe('installPreloadRecovery', () => {
  it('ilk parça hatasında olayı engeller ve sayfayı bir kez yeniler', () => {
    const { target, reload, values, fire } = fakeTarget()
    installPreloadRecovery(target)
    const event = fire()
    expect(event.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(values.get(PRELOAD_RELOAD_KEY)).toBe('1')
  })

  it('aynı oturumda ikinci hatada yenilemez; hata hata sınırına ulaşır (döngü yok)', () => {
    const { target, reload, fire } = fakeTarget()
    installPreloadRecovery(target)
    fire()
    const second = fire()
    expect(second.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('depolama kapalıysa hiç yenilemez (döngü riskine girilmez)', () => {
    const { target, reload, fire } = fakeTarget(false)
    installPreloadRecovery(target)
    expect(fire().defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('yenilemeden önce onRecover çağrılır', () => {
    const { target, fire } = fakeTarget()
    const onRecover = vi.fn()
    installPreloadRecovery(target, { onRecover })
    fire()
    expect(onRecover).toHaveBeenCalledTimes(1)
  })
})
