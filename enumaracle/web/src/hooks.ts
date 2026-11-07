import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

export interface Resource<T> {
  data: T | undefined
  error: string | null
  /** true while the response for the current key has not arrived yet. */
  loading: boolean
  reload: () => void
  /** Replaces the cached data (e.g. after a successful mutation). */
  setData: (d: T) => void
}

interface State<T> {
  key: string
  data: T | undefined
  error: string | null
}

/**
 * Loads data with `fn` whenever `key` changes (or reload is called).
 * Stale data stays visible while a new request is in flight.
 */
export function useApi<T>(fn: () => Promise<T>, key = ''): Resource<T> {
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })
  const [version, setVersion] = useState(0)
  const fullKey = `${key}#${version}`
  const [state, setState] = useState<State<T>>({ key: '', data: undefined, error: null })

  useEffect(() => {
    let alive = true
    fnRef.current().then(
      (data) => alive && setState({ key: fullKey, data, error: null }),
      (err: unknown) => alive && setState((s) => ({ key: fullKey, data: s.data, error: errorMessage(err) })),
    )
    return () => {
      alive = false
    }
  }, [fullKey])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((d: T) => setState((s) => ({ ...s, data: d })), [])

  return { data: state.data, error: state.error, loading: state.key !== fullKey, reload, setData }
}

/** Runs an async action and tracks pending state, error and field errors. */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const run = useCallback(async <R>(fn: () => Promise<R>): Promise<R | undefined> => {
    setPending(true)
    setError(null)
    setFields({})
    try {
      return await fn()
    } catch (err) {
      setError(errorMessage(err))
      const f = (err as { fields?: Record<string, string> }).fields
      if (f) setFields(f)
      return undefined
    } finally {
      setPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setFields({})
  }, [])

  return { pending, error, fields, run, reset }
}
