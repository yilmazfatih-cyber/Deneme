// Claude API istemcisi: yapılandırılmış çıktı (Zod şeması) + sunucu tarafı yedek model (fallbacks: "default").
// Model reddederse (stop_reason "refusal") ya da şemaya uymayan çıktı gelirse hata fırlatılır; AIService bu durumda
// kural tabanlı motora düşer.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'

export type Effort = 'low' | 'medium' | 'high'

export type StructuredResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number }

export class AIError extends Error {}

export interface StructuredLLM {
  readonly model: string
  structured<S extends z.ZodType>(p: {
    system: string
    user: string
    schema: S
    effort: Effort
    maxTokens?: number
  }): Promise<StructuredResult<z.infer<S>>>
}

export class ClaudeEngine implements StructuredLLM {
  readonly model: string
  private client: Anthropic

  constructor(model: string, client?: Anthropic) {
    this.model = model
    this.client = client ?? new Anthropic({ maxRetries: 2, timeout: 90_000 })
  }

  async structured<S extends z.ZodType>(p: {
    system: string
    user: string
    schema: S
    effort: Effort
    maxTokens?: number
  }): Promise<StructuredResult<z.infer<S>>> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: p.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: p.user }],
      output_config: { effort: p.effort, format: betaZodOutputFormat(p.schema) },
    })
    if (response.stop_reason === 'refusal') throw new AIError('Model bu isteği yanıtlamadı (güvenlik reddi)')
    if (response.stop_reason === 'max_tokens') throw new AIError('Model yanıtı token sınırına takıldı')
    if (response.parsed_output == null) throw new AIError('Model çıktısı beklenen şemaya uymadı')
    return {
      data: response.parsed_output as z.infer<S>,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  }
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude API anahtarı geçersiz'
  if (e instanceof Anthropic.RateLimitError) return 'Claude API hız sınırı'
  if (e instanceof Anthropic.APIConnectionError) return 'Claude API’ye bağlanılamadı'
  if (e instanceof Anthropic.APIError) return `Claude API hatası ${e.status ?? ''}`.trim()
  return (e as Error)?.message ?? String(e)
}
