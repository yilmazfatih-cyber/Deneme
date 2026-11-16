/**
 * Sunucudan tek seferlik veri okuma kancası (üyeler, davet önizlemesi, yönetim listesi gibi EŞİTLENMEYEN veriler).
 * Eşitlenen kayıtlar için bunu DEĞİL `useRecords` kullanın (yerel depo tek doğruluk kaynağıdır).
 *
 *   const members = useRemote(api && `uyeler:${id}`, () => api!.members(id))
 *   members.data / members.error / members.loading / members.reload()
 *
 * `key` değişince yeniden yüklenir; `null` ise hiç yüklenmez (ör. API yokken).
 * Genişletme: sayfalama gerekiyorsa (bkz. AdminUsersPage) sonuçları bileşen durumunda biriktirin.
 */
import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export interface Remote<T> {
  readonly data: T | undefined
  readonly error: unknown
  readonly loading: boolean
  readonly reload: () => void
}

export function useRemote<T>(key: string | null | false, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<{ data: T | undefined; error: unknown; doneFor: string | null }>({
    data: undefined,
    error: undefined,
    doneFor: null,
  })
  const [attempt, setAttempt] = useState(0)
  const run = useEffectEvent(() => load())
  const token = key ? `${key}#${attempt}` : null

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    run().then(
      (data) => !cancelled && setState({ data, error: undefined, doneFor: token }),
      (error: unknown) => !cancelled && setState((current) => ({ data: current.data, error, doneFor: token })),
    )
    return () => {
      cancelled = true
    }
  }, [token])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  return { data: state.data, error: state.error, loading: token !== null && state.doneFor !== token, reload }
}
