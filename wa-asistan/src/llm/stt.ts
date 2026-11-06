/** Voice-note transcription through an OpenAI-compatible `/audio/transcriptions` endpoint. */
import type { Transcriber } from '../core/types.js'

export interface SttOptions {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/aac': 'aac',
}

export class HttpTranscriber implements Transcriber {
  private readonly fetchImpl: typeof fetch
  constructor(private readonly o: SttOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch
  }

  async transcribe(audio: Buffer, mime: string): Promise<string> {
    const base = mime.split(';')[0]?.trim().toLowerCase() ?? 'audio/ogg'
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array(audio)], { type: base }), `ses.${EXT[base] ?? 'ogg'}`)
    form.set('model', this.o.model)
    form.set('language', 'tr')
    form.set('response_format', 'json')
    const res = await this.fetchImpl(`${this.o.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.o.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 120_000),
    })
    if (!res.ok) throw new Error(`Ses yazıya dökülemedi (HTTP ${res.status})`)
    const json = (await res.json()) as { text?: unknown }
    return typeof json.text === 'string' ? json.text.trim() : ''
  }
}
