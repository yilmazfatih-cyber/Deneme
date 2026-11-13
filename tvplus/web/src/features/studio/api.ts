/**
 * Stüdyo REST istemcisi (/api/studio/*; sözleşme shared/intelligence.ts).
 *   studioGet / studioSend  — oturum başlıklarıyla (yazma uçları authURL ister; sessionHeaders() taşır)
 *   useStudio(yol)          — { data, error, loading, refetch }; yeniden çekmede eski veri ekranda kalır
 *   uploadExport(dosya)     — Mixpanel dışa aktarımını akış olarak yükler (XHR: yükleme ilerlemesi için)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ROUTES } from '../../../../shared/constants'
import { apiUrl, sessionHeaders } from '../../api/session'

export const STUDIO_API = ROUTES.STUDIO

export class StudioError extends Error {
  readonly status: number
  readonly code: string | null
  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'StudioError'
    this.status = status
    this.code = code
  }
  /** Servis yok ya da henüz hazır değil (uç tanımsız, 501/503, ağ hatası) */
  get unavailable(): boolean {
    return this.status === 0 || this.status === 404 || this.status === 501 || this.status === 502 || this.status === 503
  }
}

async function errorOf(res: Response): Promise<StudioError> {
  let message = `İstek başarısız (${res.status})`
  let code: string | null = null
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body.error?.message) message = body.error.message
    code = body.error?.code ?? null
  } catch {
    /* gövde JSON değil */
  }
  return new StudioError(message, res.status, code)
}

async function run<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(`${STUDIO_API}${path}`), { credentials: 'same-origin', ...init })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new StudioError('Sunucuya ulaşılamadı.', 0, 'NETWORK')
  }
  if (!res.ok) throw await errorOf(res)
  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.text()) as T
}

export function studioGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return run<T>(path, { headers: { accept: 'application/json', ...sessionHeaders() }, signal })
}

export function studioSend<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...sessionHeaders() }
  if (body !== undefined) headers['content-type'] = 'application/json'
  return run<T>(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface Resource<T> {
  data: T | undefined
  error: StudioError | null
  loading: boolean
  refetch: () => void
}

/** Bir stüdyo ucunu okur. `path` null → istek atılmaz. */
export function useStudio<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{ path: string | null; data: T | undefined; error: StudioError | null }>({
    path: null,
    data: undefined,
    error: null,
  })
  const [loading, setLoading] = useState(path !== null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    studioGet<T>(path, ac.signal).then(
      (data) => {
        if (ac.signal.aborted) return
        setState({ path, data, error: null })
        setLoading(false)
      },
      (e: unknown) => {
        if (ac.signal.aborted) return
        const err = e instanceof StudioError ? e : new StudioError(errorMessage(e), 0, null)
        setState((s) => ({ path, data: s.path === path ? s.data : undefined, error: err }))
        setLoading(false)
      },
    )
    return () => ac.abort()
  }, [path, nonce])
  const refetch = useCallback(() => setNonce((n) => n + 1), [])
  // Yol değiştiyse eski yolun verisi gösterilmez
  const same = state.path === path
  return { data: same ? state.data : undefined, error: same ? state.error : null, loading, refetch }
}

/** Belirli aralıkla yeniden çeker (ör. eğitim RUNNING iken); `active` false olunca durur. */
export function usePolling(active: boolean, refetch: () => void, ms = 1500): void {
  const ref = useRef(refetch)
  ref.current = refetch
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => ref.current(), ms)
    return () => window.clearInterval(t)
  }, [active, ms])
}

/** Yazma işlemi durumu: { busy, run(fn) } — hata iletisi döner ya da null. */
export function useAction(): { busy: boolean; run: <T>(fn: () => Promise<T>) => Promise<T | null>; error: string | null } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runFn = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(errorMessage(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, run: runFn, error }
}

/**
 * Dışa aktarım dosyasını gövde olarak yükler (tarayıcı dosyayı parça parça gönderir; sunucu akış olarak okur).
 * `onProgress` 0–1. İptal için dönen `abort()`.
 */
export function uploadExport<T>(
  file: Blob,
  dryRun: boolean,
  onProgress: (ratio: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', apiUrl(`${STUDIO_API}/sources/mixpanel/import${dryRun ? '?dryRun=1' : ''}`))
    xhr.withCredentials = true
    for (const [k, v] of Object.entries(sessionHeaders())) xhr.setRequestHeader(k, v)
    xhr.setRequestHeader('content-type', 'application/octet-stream')
    xhr.setRequestHeader('accept', 'application/json')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* JSON değil */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else {
        const err = (body as { error?: { message?: string; code?: string } } | null)?.error
        reject(new StudioError(err?.message ?? `Yükleme başarısız (${xhr.status})`, xhr.status, err?.code ?? null))
      }
    }
    xhr.onerror = () => reject(new StudioError('Sunucuya ulaşılamadı.', 0, 'NETWORK'))
    xhr.onabort = () => reject(new StudioError('Yükleme iptal edildi.', 0, 'ABORTED'))
    xhr.send(file)
  })
  return { promise, abort: () => xhr.abort() }
}
