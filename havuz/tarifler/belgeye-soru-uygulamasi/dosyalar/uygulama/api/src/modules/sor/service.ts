/**
 * Belgeye soru: soruyu yerel yz sunucusunun RAG ucuna (`POST <YZ_URL>/api/sor`, anahtarlı) iletir; gelen yanıtı
 * şemayla doğrulayıp uygulamanın sözleşmesine (shared → askResponseSchema) çevirir. yz'nin alanları Türkçedir
 * (`yanit`, `kaynaklar`…), uygulamanınkiler İngilizce: eşleme yalnız bu dosyada yapılır.
 *
 * Kullanıcının gördüğü hatalar (ayrıntı yalnız günlükte; anahtar ve soru metni günlüğe YAZILMAZ):
 *   YZ_URL yok → 404 askDisabled · aynı anda çok soru → 429 askBusy · zaman aşımı → 500 askTimeout
 *   bağlantı yok / yz 4xx-5xx (401 = anahtar uyuşmuyor) → 500 askUnavailable · bozuk yanıt → 500 askBadResponse
 *
 * Genişletme: yz'ye yeni bir alan iletmek için (ör. sağlayıcı profili) `body`'ye ekleyin; yz tarafındaki karşılığı
 * yz/sunucu/uygulama.py → SorGovdesi. Yeni yanıt alanı → yzAnswerSchema + shared/askResponseSchema + test.
 */
import { AppError, type AskResponse } from '@uygulama/shared'
import { z } from 'zod'
import type { AiConfig } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { errorFields } from '../../lib/logger.ts'
import { MESSAGES } from '../../messages.ts'

/** yz sunucusunun `/api/sor` yanıtı (yz/sunucu/uygulama.py → sor). Bilinmeyen alanlar yok sayılır. */
const yzAnswerSchema = z.object({
  yanit: z.string(),
  atiflar: z.array(z.number().int()),
  belgede_yok: z.boolean(),
  uyarilar: z.array(z.string()),
  dayanaksiz: z.array(z.string()),
  kaynaklar: z.array(z.object({ numara: z.number().int().positive(), ad: z.string(), metin: z.string() })),
})
type YzAnswer = z.infer<typeof yzAnswerSchema>

/** Ekrana gönderilen alıntının en çok uzunluğu (yz bütün parçayı döndürür). */
export const EXCERPT_MAX = 1200

function toAskResponse(answer: YzAnswer): AskResponse {
  const warnings = [...answer.uyarilar]
  if (answer.dayanaksiz.length > 0) warnings.push(`${MESSAGES.askUnsupportedClaims} ${answer.dayanaksiz.join(', ')}`)
  return {
    answer: answer.yanit,
    notInDocuments: answer.belgede_yok,
    citations: answer.atiflar,
    sources: answer.kaynaklar.map((source) => ({
      number: source.numara,
      title: source.ad,
      excerpt: source.metin.length > EXCERPT_MAX ? `${source.metin.slice(0, EXCERPT_MAX)}…` : source.metin,
    })),
    warnings,
  }
}

async function callYz(ctx: AppContext, ai: AiConfig, question: string): Promise<unknown> {
  const doFetch = ctx.fetch ?? fetch
  let response: Response
  try {
    response = await doFetch(`${ai.url}/api/sor`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ soru: question }),
      signal: AbortSignal.timeout(ai.timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    ctx.logger.warn(timedOut ? 'yz yanıtı zaman aşımına uğradı' : 'yz sunucusuna ulaşılamadı', {
      url: ai.url,
      ...errorFields(error),
      stack: undefined,
    })
    throw new AppError('internal', timedOut ? MESSAGES.askTimeout : MESSAGES.askUnavailable)
  }
  if (!response.ok) {
    await response.body?.cancel()
    ctx.logger.warn('yz hata döndürdü', {
      url: ai.url,
      status: response.status,
      hint: response.status === 401 ? 'YZ_API_KEY ile yz sunucusunun YZ_SUNUCU_ANAHTARI aynı mı?' : undefined,
    })
    throw new AppError('internal', MESSAGES.askUnavailable)
  }
  return response.json().catch(() => null)
}

/** Soru sorma işlevi (uygulama başına bir tane): aynı anda en çok `maxConcurrent` soru; fazlası 429 alır ki tek
 * işlemcili model sunucusu boğulmasın. */
export function createAskService(ctx: AppContext): (question: string) => Promise<AskResponse> {
  let active = 0
  return async (question) => {
    const ai = ctx.config.ai
    if (!ai) throw new AppError('not_found', MESSAGES.askDisabled)
    if (active >= ai.maxConcurrent) throw new AppError('rate_limited', MESSAGES.askBusy, { retryAfter: 5 })
    active += 1
    try {
      const parsed = yzAnswerSchema.safeParse(await callYz(ctx, ai, question))
      if (!parsed.success) {
        const issues = JSON.stringify(parsed.error.issues).slice(0, 500)
        ctx.logger.error('yz yanıtı beklenen biçimde değil', { issues })
        throw new AppError('internal', MESSAGES.askBadResponse)
      }
      return toAskResponse(parsed.data)
    } finally {
      active -= 1
    }
  }
}
