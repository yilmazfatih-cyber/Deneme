// Aşama 3 — Her şey bir eklenti: oturum günlüğü, model, araçlar, izin kapısı, onay, arayüz, ajan döngüsü
//
// deepseek-harness'ta ajan döngüsü bile bir eklentidir (packages/core/agent-loop, `ctx.agentLoop`).
// Model bağdaştırıcıları `ctx.llm`'e, araçlar `ctx.tools`'a kaydolur; izin ve onay `tools/pre-execute`
// waterfall'ına takılır; arayüz yalnızca `session/event` olaylarından çizer. Kural: "modelin gördüğü her
// şey günlükte vardır" — model geçmişi her adımda olay günlüğünden türetilir (deriveMessages).
// Bu dosyadaki her parça, docs/architecture.md'deki bir çekirdek paketin küçük karşılığıdır.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Service } from './asama2_baglam.js'

// --- Oturum günlüğü (ctx.sessions) ----------------------------------------------------------------

/** Yalnızca eklenen (append-only) olay günlüğü ve ondan model geçmişi türeten izdüşüm. */
export class SessionLog extends Service {
  constructor(ctx) {
    super(ctx, 'sessions')
    this.logs = new Map()
  }

  append(sessionId, type, data = {}) {
    const log = this.logs.get(sessionId) ?? []
    const event = { seq: log.length + 1, type, data }
    log.push(event)
    this.logs.set(sessionId, log)
    this.ctx.emit('session/event', sessionId, event)
    return event
  }

  events(sessionId) {
    return [...(this.logs.get(sessionId) ?? [])]
  }

  /** Model geçmişi = günlüğün izdüşümü. Günlükte olmayan hiçbir şey modele gitmez. */
  deriveMessages(sessionId) {
    const messages = []
    for (const event of this.logs.get(sessionId) ?? []) {
      if (event.type === 'user/message') messages.push({ role: 'user', text: event.data.text })
      if (event.type === 'assistant/message') messages.push({ role: 'assistant', ...event.data })
      if (event.type === 'tool/result') messages.push({ role: 'tool', ...event.data })
    }
    return messages
  }
}

// --- Model servisi (ctx.llm) ve sahte bağdaştırıcı -----------------------------------------------

export class LlmService extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
    this.adapters = new Map()
  }

  /** Bağdaştırıcı kaydı; dönen fonksiyon kaydı siler. Çağıran bunu ctx.effect içinde yapmalı. */
  register(name, adapter) {
    if (this.adapters.has(name)) throw new Error(`"${name}" bağdaştırıcısı zaten kayıtlı`)
    this.adapters.set(name, adapter)
    return () => this.adapters.delete(name)
  }

  async complete(request) {
    // Eklentiler isteği değiştirebilir (ör. ek bağlam); en içte bağdaştırıcı çağrılır. `llm/request` mini'nin
    // kendi olayıdır; gerçek dsh'de en yakın karşılığı akışı saran `llm/stream` waterfall'ıdır.
    return this.ctx.waterfall('llm/request', request, async () => {
      const name = request.provider ?? this.adapters.keys().next().value
      const adapter = this.adapters.get(name)
      if (!adapter) throw new Error('Kayıtlı model bağdaştırıcısı yok')
      return adapter.complete(request)
    })
  }
}

/** Senaryolu sahte model: config.responses sırayla döner, istekler config.requests'e yazılır. */
export function fakeLlm(ctx, config) {
  let index = 0
  ctx.effect(() =>
    ctx.llm.register('fake', {
      async complete(request) {
        config.requests?.push(structuredClone(request))
        const response = config.responses[index++]
        if (!response) throw new Error(`Senaryoda ${index}. yanıt yok`)
        return { text: response.text ?? '', toolCalls: response.toolCalls ?? [] }
      },
    }),
  )
}
fakeLlm.inject = ['llm']

// --- Araçlar (ctx.tools) ve yürütme hattı ---------------------------------------------------------

export class ToolsService extends Service {
  constructor(ctx) {
    super(ctx, 'tools')
    this.definitions = new Map()
  }

  register(definition) {
    if (this.definitions.has(definition.name)) throw new Error(`"${definition.name}" aracı zaten kayıtlı`)
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }

  schemas() {
    return [...this.definitions.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }))
  }

  /**
   * Hat: tools/pre-execute (izin, kanca) → gerekirse ctx.approval → tools/execute (çalıştırma) →
   * tools/post-execute (sonucu düzelt) → tools/result (gözlem). Hata her zaman isError sonucu olur.
   */
  async execute(call, info = {}) {
    const decision = await this.ctx.waterfall('tools/pre-execute', call, info, async () => ({ action: 'allow' }))
    let result
    if (decision.action === 'ask') {
      const approval = this.ctx.get('approval')
      const answer = approval ? await approval.request({ ...info, tool: call.name, args: call.args }) : 'deny'
      if (answer !== 'allow') result = { content: `Kullanıcı ${call.name} çağrısını onaylamadı`, isError: true }
    } else if (decision.action === 'deny') {
      result = { content: decision.reason ?? `${call.name} yasaklı`, isError: true }
    }
    if (!result) {
      try {
        result = await this.ctx.waterfall('tools/execute', call, info, async () => {
          const definition = this.definitions.get(call.name)
          if (!definition) throw new Error(`"${call.name}" adında araç yok`)
          return { content: String(await definition.execute(call.args ?? {}, info)), isError: false }
        })
      } catch (error) {
        result = { content: error.message, isError: true }
      }
    }
    result = await this.ctx.waterfall('tools/post-execute', call, result, async () => result)
    this.ctx.emit('tools/result', call, result)
    return result
  }
}

/** Dosya araçları eklentisi: bir kök klasörün içinde okuma/yazma. */
export function fsTools(ctx, config) {
  const resolve = (relative) => {
    const absolute = path.resolve(config.root, relative)
    if (!absolute.startsWith(path.resolve(config.root) + path.sep)) throw new Error(`Kök dışı yol: ${relative}`)
    return absolute
  }
  ctx.effect(() =>
    ctx.tools.register({
      name: 'read_file',
      description: 'Dosya okur',
      parameters: { path: { type: 'string', required: true } },
      execute: async (args) => readFile(resolve(args.path), 'utf8'),
    }),
  )
  ctx.effect(() =>
    ctx.tools.register({
      name: 'write_file',
      description: 'Dosya yazar',
      parameters: { path: { type: 'string', required: true }, content: { type: 'string', required: true } },
      execute: async (args) => {
        const target = resolve(args.path)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, args.content)
        return `${args.path} yazıldı`
      },
    }),
  )
}
fsTools.inject = ['tools']
fsTools.schema = (config) => {
  if (typeof config.root !== 'string') throw new Error('fsTools: root yapılandırması gerekli')
  return config
}

// --- İzin kapısı, onay servisi ve arayüz kanalı -------------------------------------------------

/** Araç adına göre allow / ask / deny. Kararı veren dinleyici next() çağırmadan döner. */
export function permissionGate(ctx, config) {
  ctx.on('tools/pre-execute', async (call, _info, next) => {
    const effect = config.rules?.[call.name] ?? config.default ?? 'ask'
    if (effect === 'deny') return { action: 'deny', reason: `İzin kuralı ${call.name} aracını yasaklıyor` }
    if (effect === 'ask') return { action: 'ask' }
    return next()
  })
}
permissionGate.inject = ['tools']

/** Onay servisi: soruyu olay olarak yayınlar, yanıtı bekler. Yanıtı kim verirse (arayüz, test) o. */
export class ApprovalService extends Service {
  constructor(ctx) {
    super(ctx, 'approval')
    this.pending = new Map()
    this.nextId = 1
  }

  request(question) {
    const id = `onay_${this.nextId++}`
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.ctx.emit('approval/requested', id, question)
    })
  }

  answer(id, decision) {
    const resolve = this.pending.get(id)
    if (!resolve) return false
    this.pending.delete(id)
    resolve(decision)
    return true
  }
}

/** Arayüz kanalı: oturum olaylarını satırlara çevirir, onay sorularını senaryodan yanıtlar. */
export class UiChannel extends Service {
  static inject = ['approval']

  constructor(ctx, config) {
    super(ctx, 'ui')
    this.lines = []
    this.answers = [...(config.answers ?? [])]
    ctx.on('session/event', (sessionId, event) => this.lines.push(`${sessionId}#${event.seq} ${event.type}`))
    ctx.on('approval/requested', (id, question) => {
      const decision = this.answers.shift() ?? 'deny'
      this.lines.push(`onay? ${question.tool} → ${decision}`)
      queueMicrotask(() => ctx.approval.answer(id, decision))
    })
  }
}

// --- Ajan döngüsü (ctx.agentLoop) -----------------------------------------------------------------

/**
 * Tur = bir ya da daha çok adım; adım = bir model isteği + istediği araçlar.
 * Her olay önce günlüğe yazılır, model geçmişi günlükten türetilir.
 */
export class AgentLoop extends Service {
  static inject = ['sessions', 'llm', 'tools']

  constructor(ctx, config) {
    super(ctx, 'agentLoop')
    this.maxSteps = config.maxSteps ?? 8
  }

  async run(sessionId, text) {
    const { sessions, llm, tools } = this.ctx
    sessions.append(sessionId, 'turn/start')
    sessions.append(sessionId, 'user/message', { text })
    let steps = 0
    let reason = 'stop'
    while (true) {
      if (steps >= this.maxSteps) {
        reason = 'max-steps'
        break
      }
      steps++
      sessions.append(sessionId, 'step/start', { step: steps })
      const response = await llm.complete({ messages: sessions.deriveMessages(sessionId), tools: tools.schemas() })
      sessions.append(sessionId, 'assistant/message', { text: response.text, toolCalls: response.toolCalls })
      for (const call of response.toolCalls) {
        sessions.append(sessionId, 'tool/call', call)
        const result = await tools.execute(call, { sessionId })
        sessions.append(sessionId, 'tool/result', { id: call.id, name: call.name, ...result })
      }
      sessions.append(sessionId, 'step/end', { step: steps })
      if (response.toolCalls.length > 0) continue
      // Tur bitmek üzere. Mini'de bir dinleyici metin döndürürse tur o metinle sürer. Gerçek dsh'de bu serial
      // olayın dönüş değeri kullanılmaz: döngü olaydan sonra gelen kutusuna bakar ve tur ancak orada yeni bir
      // adım girdisi (ör. yönlendirme) varsa sürer; dinleyiciler olayı çoğunlukla kaçak turları kesmek için
      // kullanır (packages/core/agent-loop/src/agent.ts).
      const followUp = await this.ctx.serial('agent/turn-stopping', sessionId)
      if (typeof followUp !== 'string') break
      sessions.append(sessionId, 'user/message', { text: followUp, synthetic: true })
    }
    sessions.append(sessionId, 'turn/end', { reason, steps })
    return { reason, steps }
  }
}
