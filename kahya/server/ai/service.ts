// Yapay zekâ hizmeti: her görevi önce Claude ile (yapılandırıldıysa), olmazsa kural motoruyla yapar.
// KVKK: Claude'a gitmeden önce metin maskelenir (TCKN, IBAN, kart, telefon, e-posta, bilinen adlar);
// yanıt sunucuda maskeden çıkarılır. Hangi motorun, kaç token ve kaç maskeyle çalıştığı her sonuçta döner.
import { CHANNELS, type Channel } from '../../shared/labels.ts'
import type { Config } from '../config.ts'
import { maskedTotal, maskPII, unmask } from '../domain/pii.ts'
import type { Hit } from '../domain/search.ts'
import { describeError, type StructuredLLM } from './claude.ts'
import { ANNOUNCEMENT_SYSTEM, ANSWER_SYSTEM, TRIAGE_SYSTEM } from './prompts.ts'
import { ruleAnnouncement, ruleAnswer, ruleTriage } from './rules.ts'
import {
  AnnouncementSchema,
  AnswerSchema,
  TriageSchema,
  type Announcement,
  type Answer,
  type Triage,
} from './schemas.ts'

export type Engine = 'claude' | 'kural'

export type AIRun<T> = {
  result: T
  engine: Engine
  model: string | null
  inputTokens: number
  outputTokens: number
  masked: number
  /** Claude denendi ama kural motoruna düşüldüyse nedeni. */
  fallbackReason?: string
}

export type TriageInput = {
  text: string
  channel: Channel
  siteName?: string | null
  blockNames?: string[]
  blockKeys?: string[]
  senderName?: string | null
  senderUnit?: string | null
  otherNames?: string[]
}

export type AnswerInput = {
  question: string
  hits: Hit[]
  /** Sakinin hesap özeti (düz metin) — yalnız sakin portalından gelen sorularda. */
  facts?: string | null
  askerName?: string | null
  siteName?: string | null
}

export class AIService {
  private llm: StructuredLLM | null
  private maskPii: boolean

  constructor(config: Pick<Config, 'ai'>, llm: StructuredLLM | null) {
    this.llm = config.ai.engine === 'claude' ? llm : null
    this.maskPii = config.ai.maskPii
  }

  get engine(): Engine {
    return this.llm ? 'claude' : 'kural'
  }

  describe() {
    return { engine: this.engine, model: this.llm?.model ?? null, maskPii: this.maskPii }
  }

  private mask(text: string, names: (string | null | undefined)[]) {
    if (!this.maskPii) return { text, map: {} as Record<string, string>, masked: 0 }
    const r = maskPII(text, { names: names.filter((n): n is string => Boolean(n)) })
    return { text: r.text, map: r.map, masked: maskedTotal(r.counts) }
  }

  private local<T>(result: T, fallbackReason?: string): AIRun<T> {
    return { result, engine: 'kural', model: null, inputTokens: 0, outputTokens: 0, masked: 0, fallbackReason }
  }

  async triage(input: TriageInput): Promise<AIRun<Triage>> {
    const fallback = () => ruleTriage(input.text, { senderName: input.senderName, blockKeys: input.blockKeys })
    if (!this.llm) return this.local(fallback())
    const context = [
      `Kanal: ${CHANNELS[input.channel]}`,
      input.siteName
        ? `Site: ${input.siteName}${input.blockNames?.length ? ` (bloklar: ${input.blockNames.join(', ')})` : ''}`
        : null,
      `Gönderen: ${input.senderName ?? 'kayıtlı olmayan numara'}${input.senderUnit ? ` — ${input.senderUnit}` : ''}`,
    ]
      .filter(Boolean)
      .join('\n')
    const { text, map, masked } = this.mask(`${context}\n\nMesaj:\n<<<\n${input.text}\n>>>`, [
      input.senderName,
      ...(input.otherNames ?? []),
    ])
    try {
      const r = await this.llm.structured({ system: TRIAGE_SYSTEM, user: text, schema: TriageSchema, effort: 'low' })
      const d = r.data
      const result: Triage = {
        ...d,
        summary: unmask(d.summary, map),
        ticket_title: unmask(d.ticket_title, map),
        reply: unmask(d.reply, map),
        safety_advice: d.safety_advice ? unmask(d.safety_advice, map) : null,
      }
      return {
        result,
        engine: 'claude',
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        masked,
      }
    } catch (e) {
      return this.local(fallback(), describeError(e))
    }
  }

  async answer(input: AnswerInput): Promise<AIRun<Answer>> {
    const fallback = () => ruleAnswer(input.question, input.hits, input.facts ?? null)
    if (!this.llm) return this.local(fallback())
    const sources = input.hits.length
      ? input.hits
          .map(
            (h, i) => `[${i + 1}] ${h.chunk.title}${h.chunk.heading ? ` — ${h.chunk.heading}` : ''}\n${h.chunk.text}`,
          )
          .join('\n\n')
      : '(ilgili belge parçası bulunamadı)'
    const prompt = [
      input.siteName ? `Site: ${input.siteName}` : null,
      input.facts ? `Sakinin hesap özeti:\n${input.facts}` : null,
      `Belge parçaları:\n${sources}`,
      `Soru (${input.askerName ?? 'sakin'}):\n<<<\n${input.question}\n>>>`,
    ]
      .filter(Boolean)
      .join('\n\n')
    const { text, map, masked } = this.mask(prompt, [input.askerName])
    try {
      const r = await this.llm.structured({ system: ANSWER_SYSTEM, user: text, schema: AnswerSchema, effort: 'medium' })
      const result: Answer = {
        ...r.data,
        answer: unmask(r.data.answer, map),
        used_sources: r.data.used_sources.filter((n) => n >= 1 && n <= input.hits.length),
      }
      return {
        result,
        engine: 'claude',
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        masked,
      }
    } catch (e) {
      return this.local(fallback(), describeError(e))
    }
  }

  async announcement(brief: string, siteName: string | null): Promise<AIRun<Announcement>> {
    if (!this.llm) return this.local(ruleAnnouncement(brief))
    const { text, map, masked } = this.mask(
      `${siteName ? `Site: ${siteName}\n` : ''}Yöneticinin notu:\n<<<\n${brief}\n>>>`,
      [],
    )
    try {
      const r = await this.llm.structured({
        system: ANNOUNCEMENT_SYSTEM,
        user: text,
        schema: AnnouncementSchema,
        effort: 'low',
      })
      const result = { title: unmask(r.data.title, map), body: unmask(r.data.body, map) }
      return {
        result,
        engine: 'claude',
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        masked,
      }
    } catch (e) {
      return this.local(ruleAnnouncement(brief), describeError(e))
    }
  }
}
