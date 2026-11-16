/**
 * SSE (Server-Sent Events) okuyucusu: `GET /api/events` akışını `app.request` ile açar, gelen metni biriktirir,
 * olaylara ayırır ve "şu olay gelene kadar bekle" sağlar. Zaman aşımı cömerttir (paylaşımlı makine).
 *
 * Genişletme: yeni olay türünü test etmek için `waitFor(events => events.some(e => e.event === 'yeni'))`.
 */
import { API_PATHS } from '@uygulama/shared'
import type { TestClient } from './client.ts'

export interface SseEvent {
  readonly event: string
  readonly data: string
}

export interface SseStream {
  readonly status: number
  readonly headers: Headers
  /** Şimdiye dek gelen ham metin. */
  text(): string
  events(): SseEvent[]
  /** Koşul sağlanana ya da akış bitene dek okur; süre aşılırsa hata fırlatır. */
  waitFor(predicate: (events: SseEvent[], text: string) => boolean, timeoutMs?: number): Promise<SseEvent[]>
  /** Akış sunucu tarafından kapandı mı (okuma `done` döndü mü)? */
  ended(timeoutMs?: number): Promise<boolean>
  close(): Promise<void>
}

export function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '' && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split('\n')
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message'
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
      return { event, data }
    })
}

export async function openEvents(client: TestClient): Promise<SseStream> {
  const headers: Record<string, string> = {}
  if (client.cookie) headers.Cookie = client.cookie
  if (client.token) headers.Authorization = `Bearer ${client.token}`
  const response = await client.t.server.app.request(API_PATHS.events, { headers })
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = !reader
  let pending: ReturnType<NonNullable<typeof reader>['read']> | null = null

  const pump = async (deadline: number): Promise<boolean> => {
    if (done || !reader) return false
    pending ??= reader.read()
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), Math.max(0, deadline - Date.now())),
    )
    const result = await Promise.race([pending, timeout])
    if (result === 'timeout') return false
    pending = null
    if (result.done) {
      done = true
      return false
    }
    buffer += decoder.decode(result.value, { stream: true })
    return true
  }

  return {
    status: response.status,
    headers: response.headers,
    text: () => buffer,
    events: () => parseSse(buffer),
    async waitFor(predicate, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs
      while (!predicate(parseSse(buffer), buffer)) {
        const progressed = await pump(deadline)
        if (!progressed && (done || Date.now() >= deadline)) {
          throw new Error(`SSE beklenen olay gelmedi. Gelen:\n${buffer}`)
        }
      }
      return parseSse(buffer)
    },
    async ended(timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs
      while (!done && Date.now() < deadline) await pump(deadline)
      return done
    },
    async close() {
      if (!done) await reader?.cancel()
      done = true
    },
  }
}

/** Koşul doğru olana dek kısa aralıklarla bekler (ör. bağlantı temizliği). */
export async function eventually(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Koşul zamanında sağlanmadı.')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
