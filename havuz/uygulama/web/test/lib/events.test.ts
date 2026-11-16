// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ApiClient } from '../../src/lib/api.ts'
import { connectPokeStream, createSseParser, type SseEvent } from '../../src/lib/sync/events.ts'

describe('anlık bildirim akışı (SSE)', () => {
  it('ayrıştırıcı parça parça gelen metni olaylara böler; yorum satırlarını atlar', () => {
    const events: SseEvent[] = []
    const feed = createSseParser((event) => events.push(event))
    feed(': canlı tutma\n\nevent: ready\nda')
    feed('ta: {}\n\nevent: poke\r\ndata: {"a":')
    feed('1}\r\n\r\n')
    expect(events).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'poke', data: '{"a":1}' },
    ])
  })

  it('poke olayları şemayla doğrulanıp iletilir; 401 gelince bağlantı bırakılır', async () => {
    const encoder = new TextEncoder()
    const poke = { workspaceId: 'ws1', rev: 4, clientId: null }
    let calls = 0
    const api = new ApiClient({
      baseUrl: '',
      authMode: 'cookie',
      fetch: async () => {
        calls += 1
        if (calls > 1) return new Response('', { status: 401 })
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`event: poke\ndata: ${JSON.stringify(poke)}\n\n`))
            controller.enqueue(encoder.encode('event: poke\ndata: bozuk\n\n'))
            controller.close()
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      },
    })
    const pokes: unknown[] = []
    const unauthorized = new Promise<void>((resolve) => {
      connectPokeStream({ api, onPoke: (value) => pokes.push(value), onUnauthorized: resolve, sleep: async () => {} })
    })
    await unauthorized
    expect(pokes).toEqual([poke])
    expect(calls).toBe(2)
  })
})
