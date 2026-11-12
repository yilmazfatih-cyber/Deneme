// Perde — SSE istemcisi. Sunucu yalnızca `data: <json>` satırları gönderir.

/**
 * Artımlı SSE ayrıştırıcı: parçaları besle, tam olaylar için `onEvent` çağrılır.
 * @param {(data: any) => void} onEvent
 */
export function createSSEParser(onEvent) {
  let buf = ''
  return {
    /** @param {string} chunk */
    feed(chunk) {
      buf += chunk.replace(/\r\n?/g, '\n')
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const data = raw
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n')
        if (!data) continue
        try {
          onEvent(JSON.parse(data))
        } catch {
          /* bozuk olay yok sayılır */
        }
      }
    },
  }
}

/**
 * POST /api/ai ve olay akışını okuma. Hata durumunda (JSON gövdeli 4xx/5xx) Error fırlatır.
 * @param {object} body
 * @param {{ onEvent: (e: any) => void, signal?: AbortSignal }} opts
 */
export async function runAI(body, { onEvent, signal }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let msg = `Sunucu hatası (${res.status}).`
    try {
      const j = await res.json()
      if (j && typeof j.error === 'string') msg = j.error
    } catch {}
    throw new Error(msg)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  const parser = createSSEParser(onEvent)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parser.feed(dec.decode(value, { stream: true }))
  }
}
