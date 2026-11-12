// @ts-check
// Claude çağrısı. Tüm SDK adları /claude-api belgelerinden alındı:
// client.beta.messages.stream(params, { signal }), betas + fallbacks: "default", output_config.effort.
// `thinking`, `temperature`, `top_p`, `top_k` ve asistan ön doldurması bu modelde 400 verir; bilerek gönderilmez.
import Anthropic from '@anthropic-ai/sdk'
import { EFFORT, buildSystem, buildUserContent } from './prompts.mjs'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const MAX_TOKENS = 32000
export const BETAS = ['server-side-fallback-2026-07-01']
// Sunucu tarafı yedek model yalnızca bu modellerde istenir; diğerlerinde (ör. Haiku 5.5) parametre gönderilmez.
export const FALLBACK_MODELS = [
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]

/** @typedef {import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaMessageStreamParams} StreamParams */

/**
 * @param {string} model
 * @param {import('./prompts.mjs').ActionInput} input
 * @returns {StreamParams}
 */
export function buildParams(model, input) {
  /** @type {StreamParams} */
  const params = {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT[input.action] },
    system: buildSystem(),
    messages: [{ role: 'user', content: buildUserContent(input) }],
  }
  if (FALLBACK_MODELS.includes(model)) {
    params.betas = [...BETAS]
    params.fallbacks = 'default'
  }
  return params
}

/**
 * Hata zincirinin en özelinden en geneline Türkçe, suçlayıcı olmayan ileti.
 * @param {unknown} err
 */
export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'API anahtarı yok veya geçersiz. ANTHROPIC_API_KEY değişkenini ayarlayıp sunucuyu yeniden başlatın.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'İstek sınırına ulaşıldı. Biraz bekleyip yeniden deneyin.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Yapay zekâ servisine bağlanılamadı. Bağlantınızı kontrol edip yeniden deneyin.'
  }
  if (err instanceof Anthropic.APIError) {
    return `Yapay zekâ servisi bir hata döndürdü (${err.status ?? 'bilinmiyor'}). Yeniden deneyin.`
  }
  if (err instanceof Anthropic.AnthropicError) {
    return 'Yapay zekâ istemcisi başlatılamadı. API anahtarı ayarlı mı (ANTHROPIC_API_KEY)?'
  }
  return 'Beklenmeyen bir hata oluştu. Yeniden deneyin.'
}

/**
 * Akışı çalıştırır ve olayları `emit` ile iletir. İstemci koparsa `signal` iptal olur ve sessizce biter.
 * @param {object} args
 * @param {Pick<Anthropic, 'beta'>} args.client
 * @param {StreamParams} args.params
 * @param {AbortSignal} args.signal
 * @param {(event: Record<string, unknown>) => void} args.emit
 */
export async function runClaude({ client, params, signal, emit }) {
  try {
    const stream = client.beta.messages.stream(params, { signal })
    let streamed = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        streamed += event.delta.text
        emit({ type: 'text', text: event.delta.text })
      }
    }
    const message = await stream.finalMessage()
    // Sunucu tarafı yedek model devreye girdiyse, nihai metin yedeğin ürettiği kısımdır.
    const lastFallback = message.content.map((b) => b.type).lastIndexOf('fallback')
    if (lastFallback >= 0) {
      const finalText = message.content
        .slice(lastFallback + 1)
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      if (finalText && finalText !== streamed) emit({ type: 'replace', text: finalText })
    }
    if (message.stop_reason === 'refusal') {
      emit({
        type: 'notice',
        code: 'refusal',
        message: 'Model bu istek için çıktı üretmedi. İsteği farklı biçimde ifade edip yeniden deneyebilirsiniz.',
      })
    } else if (message.stop_reason === 'max_tokens') {
      emit({
        type: 'notice',
        code: 'max_tokens',
        message: 'Çıktı uzunluk sınırına ulaştı; yanıt yarım kalmış olabilir.',
      })
    }
    emit({ type: 'done', stopReason: message.stop_reason })
  } catch (err) {
    if (signal.aborted) return
    emit({ type: 'error', message: describeError(err) })
  }
}
