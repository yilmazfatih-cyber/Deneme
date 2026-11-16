/**
 * Anlık bildirim: `GET /api/events` akışını (Server-Sent Events) dinler; "şu alan değişti" (`poke`) gelince
 * eşitleme ister. `EventSource` yerine `fetch` kullanılır, çünkü belirteç kipinde `Authorization` başlığı
 * gerekir ve `EventSource` başlık gönderemez.
 *
 * Bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır; 401/404'te durur (oturum yok / uç yok).
 * Bildirim gelmese de veri güncel kalır: tetikleyiciler düzenli aralıkla da eşitler (triggers.ts).
 *
 * Genişletme: yeni bir olay türü için `onEvent` içinde `event.event === 'ad'` dalı ekleyin.
 */
import { API_PATHS, pokeEventSchema, syncBackoffMs, type PokeEvent } from '@uygulama/shared'
import type { ApiClient } from '../api.ts'

export interface SseEvent {
  readonly event: string
  readonly data: string
}

/**
 * Akış ayrıştırıcı: parça parça gelen metni olaylara böler (boş satır olayı bitirir).
 * Döndürdüğü işlev her yeni parça için çağrılır.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): (chunk: string) => void {
  let buffer = ''
  let eventName = ''
  let data: string[] = []
  const dispatch = () => {
    if (data.length > 0) onEvent({ event: eventName || 'message', data: data.join('\n') })
    eventName = ''
    data = []
  }
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line === '') dispatch()
      else if (line.startsWith(':'))
        continue // yorum / canlı tutma
      else {
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') eventName = value
        else if (field === 'data') data.push(value)
      }
    }
  }
}

export interface PokeStreamOptions {
  readonly api: ApiClient
  readonly onPoke: (poke: PokeEvent) => void
  /** Oturum yok (401): yeniden bağlanmayı bırakır. */
  readonly onUnauthorized?: () => void
  readonly sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Akışa bağlanır; döndürdüğü işlev bağlantıyı kapatır. */
export function connectPokeStream(options: PokeStreamOptions): () => void {
  const controller = new AbortController()
  const sleep = options.sleep ?? defaultSleep
  const parse = createSseParser((event) => {
    if (event.event !== 'poke') return
    try {
      const poke = pokeEventSchema.safeParse(JSON.parse(event.data))
      if (poke.success) options.onPoke(poke.data)
    } catch {
      // Bozuk olay: yok sayılır (sıradaki düzenli eşitleme açığı kapatır).
    }
  })

  const run = async () => {
    let failures = 0
    while (!controller.signal.aborted) {
      try {
        const response = await options.api.raw('GET', API_PATHS.events, {
          signal: controller.signal,
          timeoutMs: null,
          accept: 'text/event-stream',
        })
        if (response.status === 401) {
          options.onUnauthorized?.()
          return
        }
        if (response.status === 404) return // sunucuda bu uç yok: düzenli eşitleme yeter
        if (!response.ok || !response.body) throw new Error(`Olay akışı açılamadı (${response.status}).`)
        failures = 0
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          parse(value)
        }
      } catch {
        if (controller.signal.aborted) return
      }
      failures += 1
      await sleep(syncBackoffMs(failures))
    }
  }
  void run()
  return () => controller.abort()
}
