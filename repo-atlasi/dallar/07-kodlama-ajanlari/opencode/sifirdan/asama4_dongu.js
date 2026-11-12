// Aşama 4 — Ajan döngüsü (agent loop)
//
// Bir "adım" = tek model çağrısı + o çağrının istediği araçlar. Model araç istemeyi bırakınca tur biter.
// opencode'daki karşılığı: packages/core/src/session/runner/llm.ts (drain → advanceToStep → runStep)
// ve runner/step.ts (akışı okur, araçları paralel fiber'larda çalıştırır). Oradaki kural burada da var:
// her adım geçmişi depodan YENİDEN okur; bellekte gizli bir araç döngüsü tutulmaz.

import { ProviderError, textMessage } from './asama1_saglayici.js'
import { ToolError, validateInput } from './asama2_araclar.js'
import { PermissionRejectedError } from './asama3_izinler.js'
import { compactSession, needsCompaction } from './asama6_sikistirma.js'

export const MAX_STEPS_PROMPT =
  'Adım sınırına ulaştın. Artık araç çağıramazsın. Yaptıklarını ve kalan işi kısaca özetle.'

/** 429 ve 5xx geçici hatalardır; bağlam taşması ayrıca ele alınır. */
export function isRetryable(error) {
  return error instanceof ProviderError && (error.status === 429 || error.status >= 500)
}

/** Taşma iletilerinin dar bir kalıbı. opencode sağlayıcı başına onlarca kalıp tutar (packages/ai/src/provider-error.ts). */
const OVERFLOW_PATTERN = /too long|context (length|window)|maximum context|too many tokens|exceeds the context/i

/**
 * Bağlam taşması mı? Yalnızca 413'te ya da 400 + taşma iletisinde evet. Gövdede "context" geçen her
 * hatayı taşma saymak tehlikelidir: geçici bir 503 "context deadline exceeded", yeniden denenecek yerde
 * geri alınamaz bir sıkıştırmayı (ek model çağrısı + geçmişin özetle değişmesi) tetikler.
 */
export function isContextOverflow(error) {
  if (!(error instanceof ProviderError)) return false
  if (error.status === 413) return true
  return error.status === 400 && OVERFLOW_PATTERN.test(error.body ?? '')
}

/**
 * Önceki çalıştırma araçlar sürerken öldüyse son asistan mesajındaki çağrıların sonucu yoktur;
 * sağlayıcılar böyle bir geçmişi reddeder. Her eksik çağrıya "kesildi" sonucu yazılır
 * (opencode: runner/llm.ts, settleStaleToolCalls; her drain'in başında çalışır).
 * @returns {number} kapatılan çağrı sayısı
 */
export function settleDanglingToolCalls(messages) {
  const last = messages.at(-1)
  const calls = last?.role === 'assistant' ? last.parts.filter((part) => part.type === 'tool-call') : []
  if (calls.length === 0) return 0
  messages.push({
    role: 'tool',
    parts: calls.map((call) => ({
      type: 'tool-result',
      id: call.id,
      name: call.name,
      output: 'Araç çalışırken süreç kesildi; sonuç yok',
      isError: true,
    })),
  })
  return calls.length
}

/** Araç tanımını modele gidecek şemaya çevirir. */
export function toolSchema(tool) {
  return { name: tool.name, description: tool.description, parameters: tool.parameters }
}

/**
 * Bir kullanıcı istemini (prompt) sonuna kadar çalıştırır.
 * @param {{
 *   provider: { complete: Function }, store: object, sessionID: string, prompt?: string,
 *   tools: Array<object>, agent: { id: string, system: string }, permission: object, root: string,
 *   maxSteps?: number, contextLimit?: number, reserve?: number, keepTokens?: number,
 *   retries?: number, retryDelayMs?: number, onEvent?: Function, signal?: AbortSignal
 * }} options
 * @returns {Promise<{ finish: string, text: string, steps: number }>}
 */
export async function runAgent(options) {
  const emit = options.onEvent ?? (() => {})
  const maxSteps = options.maxSteps ?? 25
  const limits = {
    contextLimit: options.contextLimit ?? 128_000,
    reserve: options.reserve ?? 16_000,
    keepTokens: options.keepTokens ?? 15_000,
  }
  const id = options.sessionID

  // Açılış: yarım kalmış araç çağrılarını kapat, sonra yeni istemi ekle.
  const opened = await mustLoad(options.store, id)
  const settled = settleDanglingToolCalls(opened.messages)
  if (options.prompt !== undefined) opened.messages.push(textMessage('user', options.prompt))
  if (settled > 0 || options.prompt !== undefined) await options.store.save(opened)

  // Model tümüyle yasaklı araçları hiç görmez (opencode: Tool.snapshot → whollyDisabled).
  const visible = options.tools.filter((tool) => !options.permission.isWhollyDenied(tool.permission))
  const schemas = visible.map(toolSchema)

  for (let step = 1; ; step++) {
    if (options.signal?.aborted) return { finish: 'aborted', text: '', steps: step - 1 }
    let session = await mustLoad(options.store, id)

    if (needsCompaction(session.messages, limits)) {
      const result = await compactSession(session, { provider: options.provider, keepTokens: limits.keepTokens })
      if (result.status === 'completed') {
        await options.store.save(session)
        emit({ type: 'compaction', sessionID: id, removed: result.removed })
      }
    }

    // Son adımda araçlar kapanır ama tanımlar istekte kalır: sağlayıcının önbelleğe aldığı önek bozulmasın.
    const lastStep = step >= maxSteps
    const withLimit = (messages) => (lastStep ? [...messages, textMessage('user', MAX_STEPS_PROMPT)] : messages)
    const request = {
      system: options.agent.system,
      messages: withLimit(session.messages),
      tools: schemas,
      toolChoice: lastStep ? 'none' : 'auto',
    }

    emit({ type: 'step-start', sessionID: id, step })
    const response = await completeWithRecovery(options, request, session, { ...limits, withLimit }, emit)
    session = await mustLoad(options.store, id) // kurtarma sırasında sıkıştırma olmuş olabilir

    const parts = []
    if (response.text) parts.push({ type: 'text', text: response.text })
    const calls = lastStep ? [] : response.toolCalls
    for (const call of calls) parts.push({ type: 'tool-call', id: call.id, name: call.name, input: call.input })
    // Boş yanıt (ne metin ne araç çağrısı) geçmişe yazılmaz: sağlayıcılar içeriksiz asistan mesajını reddeder.
    // Örnek: son adımda model yine araç çağırırsa çağrılar atılır ve geriye hiçbir parça kalmaz.
    if (parts.length > 0) session.messages.push({ role: 'assistant', parts })
    session.usage.input += response.usage.input
    session.usage.output += response.usage.output
    await options.store.save(session)
    if (response.text) emit({ type: 'text', sessionID: id, text: response.text })

    if (calls.length === 0) {
      emit({ type: 'step-finish', sessionID: id, step, finish: response.finish })
      return { finish: lastStep ? 'max-steps' : response.finish, text: response.text, steps: step }
    }

    const results = []
    let rejected = false
    for (const call of calls) {
      emit({ type: 'tool-call', sessionID: id, call })
      // Reddedilen bir çağrıdan sonra kalanlar çalışmaz ama her çağrıya mutlaka bir sonuç yazılır.
      const result = rejected
        ? { output: 'Önceki araç çağrısı reddedildiği için çalıştırılmadı', isError: true }
        : await executeCall(call, visible, options)
      if (result.rejected) rejected = true
      const part = { type: 'tool-result', id: call.id, name: call.name, output: result.output, isError: result.isError }
      results.push(part)
      emit({ type: 'tool-result', sessionID: id, result: part })
    }
    session = await mustLoad(options.store, id)
    session.messages.push({ role: 'tool', parts: results })
    await options.store.save(session)
    emit({ type: 'step-finish', sessionID: id, step, finish: 'tool-calls' })
    if (rejected) return { finish: 'rejected', text: response.text, steps: step }
  }
}

/** Tek bir araç çağrısını doğrular ve çalıştırır; hatalar modele araç sonucu olarak döner. */
async function executeCall(call, tools, options) {
  const tool = tools.find((item) => item.name === call.name)
  try {
    if (!tool) throw new ToolError(`"${call.name}" adında kullanılabilir bir araç yok`)
    const problem = validateInput(tool.parameters, call.input)
    if (problem) throw new ToolError(problem)
    const output = await tool.execute(call.input, {
      root: options.root,
      permission: options.permission,
      signal: options.signal,
    })
    return { output, isError: false }
  } catch (error) {
    if (error instanceof PermissionRejectedError) return { output: error.message, isError: true, rejected: true }
    return { output: error.message, isError: true }
  }
}

/** Geçici hatada bekleyip yeniden dener; bağlam taşmasında bir kez sıkıştırıp tekrar dener. */
async function completeWithRecovery(options, request, session, limits, emit) {
  const retries = options.retries ?? 2
  let compacted = false
  for (let attempt = 0; ; attempt++) {
    try {
      return await options.provider.complete(request)
    } catch (error) {
      if (isContextOverflow(error) && !compacted) {
        compacted = true
        const result = await compactSession(session, { provider: options.provider, keepTokens: limits.keepTokens })
        if (result.status !== 'completed') throw error
        await options.store.save(session)
        emit({ type: 'compaction', sessionID: session.id, removed: result.removed, reason: 'overflow' })
        request = { ...request, messages: limits.withLimit(session.messages) }
        continue
      }
      if (!isRetryable(error) || attempt >= retries) throw error
      emit({ type: 'retry', sessionID: session.id, attempt: attempt + 1, status: error.status })
      await new Promise((resolve) => setTimeout(resolve, (options.retryDelayMs ?? 500) * 2 ** attempt))
    }
  }
}

async function mustLoad(store, id) {
  const session = await store.get(id)
  if (!session) throw new Error(`Oturum bulunamadı: ${id}`)
  return session
}
