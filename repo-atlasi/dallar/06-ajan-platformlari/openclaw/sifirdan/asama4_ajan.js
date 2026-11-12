// Aşama 4 — Ajan çalışma zamanı: oturum başına sıralı kuyruk, araç politikası ve araç çağıran döngü.
//
// Gerçek karşılığı: packages/agent-core/src/agent-loop.ts (runAgentLoop), src/agents/agent-command.ts
// (agentCommand), src/agents/embedded-agent-runner/ (runEmbeddedAgent, run-loop.ts), src/auto-reply/tokens.ts
// (NO_REPLY / HEARTBEAT_OK), docs/concepts/agent-loop.md, docs/concepts/agent-workspace.md,
// docs/gateway/sandboxing/modes-scope-and-backend.md.
//
// Önemli fikirler:
//   * Aynı oturuma gelen turlar sıraya girer (session lane); farklı oturumlar birbirini beklemez.
//   * Sistem istemi = çalışma alanı dosyaları (AGENTS.md, SOUL.md, USER.md, IDENTITY.md) + beceri kataloğu.
//   * Araç politikası oturuma göre değişir: "non-main" kipinde ana oturum dışındaki (ör. grup) oturumlar
//     tehlikeli araçları kullanamaz (gerçekte bu oturumlar sandbox içinde koşar).
//   * Model cevabı tam olarak NO_REPLY ise kanala hiçbir şey gönderilmez (sessiz cevap).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SILENT_REPLY_TOKEN = 'NO_REPLY'
export const HEARTBEAT_TOKEN = 'HEARTBEAT_OK'
export const BOOTSTRAP_FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md']

export function isSilentReply(text) {
  const t = String(text ?? '')
    .trim()
    .toUpperCase()
  return t === SILENT_REPLY_TOKEN || t === HEARTBEAT_TOKEN
}

/** Ağsız, deterministik sahte model. Adım: {text} | {toolCalls:[{id,name,args}]} | (istek) => adım */
export function createScriptedModel(steps) {
  const queue = [...steps]
  const requests = []
  return {
    requests,
    async complete(request) {
      requests.push(structuredClone(request))
      const step = queue.shift() ?? { text: '(senaryo bitti)' }
      return typeof step === 'function' ? step(request) : step
    },
  }
}

export class ToolRegistry {
  constructor() {
    /** @type {Map<string, {name: string, description: string, parameters: any, dangerous?: boolean, execute: Function}>} */
    this.tools = new Map()
  }

  register(tool) {
    if (this.tools.has(tool.name)) throw new Error(`araç zaten kayıtlı: ${tool.name}`)
    this.tools.set(tool.name, tool)
    return this
  }

  /** Politika: {deny:Set} — modele yalnızca izinli araçların tanımı gider. */
  definitions(policy) {
    return [...this.tools.values()]
      .filter((t) => !policy.deny.has(t.name))
      .map(({ name, description, parameters }) => ({ name, description, parameters }))
  }
}

/**
 * Oturuma göre araç politikası. sandboxMode: off | non-main | all (gerçek varsayılan: off).
 * Ana oturum anahtarı her zaman agent:<agentId>:main'dir.
 */
export function resolveToolPolicy({ registry, agentId, sessionKey, sandboxMode = 'non-main', deny = [] }) {
  const isMain = sessionKey === `agent:${agentId}:main`
  const restricted = sandboxMode === 'all' || (sandboxMode === 'non-main' && !isMain)
  const denied = new Set(deny)
  if (restricted) for (const t of registry.tools.values()) if (t.dangerous) denied.add(t.name)
  return { deny: denied, restricted }
}

/** Araç çağıran döngü: model → araçlar → model … araç çağrısı kalmayana ya da sınıra kadar. */
export async function runAgentLoop({
  model,
  system,
  messages,
  registry,
  policy,
  maxTurns = 8,
  onEvent = () => {},
  context = {},
}) {
  const tools = registry.definitions(policy)
  for (let turn = 1; turn <= maxTurns; turn++) {
    const reply = await model.complete({ system, messages, tools })
    const calls = reply.toolCalls ?? []
    messages.push({ role: 'assistant', content: reply.text ?? '', toolCalls: calls })
    onEvent({ stream: 'assistant', text: reply.text ?? '', turn })
    if (calls.length === 0) return { text: reply.text ?? '', turns: turn }
    for (const call of calls) {
      const tool = registry.tools.get(call.name)
      onEvent({ stream: 'tool', phase: 'start', name: call.name })
      let result
      if (!tool || policy.deny.has(call.name)) {
        result = { error: `bu oturumda kullanılamayan araç: ${call.name}` } // politika yürütme anında da denetlenir
      } else {
        try {
          result = await tool.execute(call.args ?? {}, context)
        } catch (err) {
          result = { error: `${call.name} başarısız: ${err.message}` }
        }
      }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(result) })
      onEvent({ stream: 'tool', phase: 'end', name: call.name, ok: !result?.error })
    }
  }
  return { text: '(tur sınırına ulaşıldı)', turns: maxTurns }
}

/** Aynı anahtara gelen işleri sırala; farklı anahtarlar paralel ilerler. */
export class SessionLanes {
  constructor() {
    this.tails = new Map()
  }

  run(key, task) {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    const tail = next.catch(() => {})
    this.tails.set(key, tail)
    tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key) // boşalan şeridi unut
    })
    return next
  }
}

export async function loadBootstrap(workspaceDir) {
  const parts = []
  for (const file of BOOTSTRAP_FILES) {
    try {
      const text = await readFile(join(workspaceDir, file), 'utf8')
      parts.push(`## ${file}\n${text.slice(0, 20_000).trim()}`) // gerçek varsayılan: dosya başına 20.000 karakter
    } catch {
      // isteğe bağlı dosya yoksa atla
    }
  }
  return parts.join('\n\n')
}

export class AgentRuntime {
  /**
   * @param {{agents: Record<string, {workspace: string, model: any}>, registry: ToolRegistry,
   *          skillsPrompt?: (agentId: string) => Promise<string>, sandboxMode?: string}} options
   */
  constructor({ agents, registry, skillsPrompt = async () => '', sandboxMode = 'non-main' }) {
    this.agents = agents
    this.registry = registry
    this.skillsPrompt = skillsPrompt
    this.sandboxMode = sandboxMode
    this.lanes = new SessionLanes()
    /** @type {Map<string, any[]>} oturum anahtarı → konuşma kaydı (gerçekte SQLite) */
    this.transcripts = new Map()
    this.systemPrompts = new Map() // oturum başına bir kez kurulur: önek önbelleği korunur
  }

  async #systemPrompt(agentId, sessionKey) {
    if (!this.systemPrompts.has(sessionKey)) {
      const agent = this.agents[agentId]
      const base = `Sen ${agentId} adlı kişisel asistansın. Cevap gerekmiyorsa yalnızca ${SILENT_REPLY_TOKEN} yaz.`
      const parts = [base, await loadBootstrap(agent.workspace), await this.skillsPrompt(agentId)]
      this.systemPrompts.set(sessionKey, parts.filter(Boolean).join('\n\n'))
    }
    return this.systemPrompts.get(sessionKey)
  }

  /** @param {{agentId: string, sessionKey: string, text: string, onEvent?: Function}} turn */
  runTurn({ agentId, sessionKey, text, onEvent }) {
    return this.lanes.run(sessionKey, async () => {
      const agent = this.agents[agentId]
      if (!agent) throw new Error(`bilinmeyen ajan: ${agentId}`)
      const system = await this.#systemPrompt(agentId, sessionKey)
      const messages = this.transcripts.get(sessionKey) ?? []
      this.transcripts.set(sessionKey, messages)
      messages.push({ role: 'user', content: text })
      const policy = resolveToolPolicy({ registry: this.registry, agentId, sessionKey, sandboxMode: this.sandboxMode })
      const result = await runAgentLoop({
        model: agent.model,
        system,
        messages,
        registry: this.registry,
        policy,
        onEvent,
        context: { agentId, sessionKey, workspace: agent.workspace },
      })
      return { ...result, silent: isSilentReply(result.text), sandboxed: policy.restricted }
    })
  }

  resetSession(sessionKey) {
    this.transcripts.delete(sessionKey)
    this.systemPrompts.delete(sessionKey)
  }
}
