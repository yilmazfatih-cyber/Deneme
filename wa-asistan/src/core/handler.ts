/**
 * Orchestration: inbound message -> access decision -> slash command or chat turn -> reply -> ledger.
 *
 * The handler only talks to the service interfaces in types.ts, so it runs against fakes in tests.
 * Rules worth remembering:
 *  - strangers, groups, status/newsletters and the bot's own echoes are ignored silently (debug log only);
 *  - one chat is processed strictly in order, different chats run in parallel;
 *  - commands never reach the model;
 *  - handle() never throws: every failure is logged and answered with one short Turkish notice at most.
 */
import {
  UNKNOWN_COMMAND,
  effectiveBudget,
  effectiveFooter,
  parseCommand,
  runCommand,
  unknownCommandReply,
  type ParsedCommand,
} from './commands.js'
import { buildMessages, charBudgetFor, historyPlaceholder, trimHistory, userContentFor } from './conversation.js'
import { footerLine, formatTl, ledgerEntry, tlOf } from './cost.js'
import { isBroadcastOrNewsletter, isGroupJid, normalizeJid } from './jid.js'
import { KeyedQueue, TtlSet } from './queue.js'
import { chunkText, markdownToWhatsApp, trLower } from './text.js'
import {
  LlmError,
  type AccessControl,
  type AppContext,
  type ChatResult,
  type ChatState,
  type ContentPart,
  type FxRate,
  type InboundMedia,
  type InboundMessage,
  type LedgerEntry,
  type ModelInfo,
} from './types.js'

export interface Handler {
  /** Resolves when the message has been fully processed (or ignored). Never rejects. */
  handle(msg: InboundMessage): Promise<void>
  /** The WhatsApp layer calls this for every message id the bot is about to send. */
  noteSent(id: string): void
  /** Own jids of the linked account (phone and LID); forwarded to the access control when it takes them. */
  setOwnerJids(jids: string[]): void
  /** Stops accepting messages and waits (best effort, bounded) for the ones in flight. */
  stop(): Promise<void>
}

/** Inbound dedup window. */
export const DEDUP_TTL_MS = 10 * 60_000
/** How long the ids of the bot's own messages are remembered (echoes arrive within seconds). */
export const SENT_TTL_MS = 6 * 60 * 60_000
/** Largest image forwarded to the model. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Largest text document inlined into the prompt. */
export const DOCUMENT_MAX_BYTES = 200 * 1024
/** WhatsApp messages are cut into pieces of at most this many characters (footer included). */
export const REPLY_CHUNK_CHARS = 3500
/** stop() gives in-flight work this long before it gives up waiting. */
export const STOP_WAIT_MS = 10_000

export { UNKNOWN_COMMAND }
export const GENERIC_ERROR = 'Bir sorun oldu, yanıt veremedim. Biraz sonra tekrar dene.'
export const EMPTY_REPLY = 'Model boş yanıt döndü.'
const DOWNLOAD_FAILED = 'Dosyayı indiremedim. Tekrar göndermeyi dene.'
const IMAGE_TOO_BIG = 'Resim çok büyük (en fazla 5 MB). Daha küçük bir kopyasını gönder.'
const DOCUMENT_TOO_BIG = 'Dosya çok büyük (en fazla 200 KB). Daha kısa bir bölümünü gönder.'
const DOCUMENT_UNSUPPORTED = 'Bu dosya türünü henüz okuyamıyorum. Metin, .md, .csv veya .json gönder.'
const DOCUMENT_EMPTY = 'Dosya boş görünüyor.'
const NO_STT = 'Sesli mesajı yazıya çevirmek için STT_BASE_URL ayarı gerekli. Şimdilik yazarak sor.'
const STT_FAILED = 'Sesli mesaj yazıya çevrilemedi. Biraz sonra tekrar dene.'
const STT_EMPTY = 'Sesli mesajda konuşma algılamadım. Tekrar dene.'
const UNSUPPORTED_MEDIA = 'Video ve çıkartmaları henüz okuyamıyorum. Yazı ya da resim gönder.'

const TEXT_EXTENSION = /\.(txt|md|csv|json)$/i
/** Contacts and calendar exports: imported locally with `npm run ice-aktar`, never sent to the model. */
export const PERSONAL_EXPORT =
  'Bu bir kişi/takvim dışa aktarımına benziyor. Modele göndermedim. Bilgisayarında içe aktar: npm run ice-aktar -- <dosya>'
const PERSONAL_EXTENSION = /\.(vcf|vcard|ics|ical)$/i
const CONTACT_HEADER = /(phone|telefon|e-?mail|first name|given name|family name|BEGIN:VCARD|BEGIN:VCALENDAR)/i

export function isPersonalExport(fileName: string | undefined, mime: string, body?: string): boolean {
  const m = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if (m === 'text/vcard' || m === 'text/x-vcard' || m === 'text/calendar') return true
  if (fileName && PERSONAL_EXTENSION.test(fileName)) return true
  if (body !== undefined) {
    const first = body.slice(0, 2000).split(/\r?\n/, 1)[0] ?? ''
    if (/BEGIN:(VCARD|VCALENDAR)/i.test(body.slice(0, 2000))) return true
    if (CONTACT_HEADER.test(first) && (first.match(/[,;]/g)?.length ?? 0) >= 2) return true
  }
  return false
}

/** Turkish notice for a failed model call. Status 0 means the request never got an HTTP answer. */
export function llmNotice(err: LlmError, modelId: string): string {
  switch (err.status) {
    case 401:
    case 403:
      return 'Sağlayıcı anahtarı reddedildi; .env dosyasını kontrol et.'
    case 402:
      return 'Sağlayıcıda bakiye bitmiş görünüyor.'
    case 404:
      return `Model bulunamadı: ${modelId}. Ara: /modeller <arama>`
    default:
      return err.status > 0
        ? `Model yanıt vermedi (HTTP ${err.status}). Biraz sonra tekrar dene.`
        : 'Model yanıt vermedi (bağlantı sorunu). Biraz sonra tekrar dene.'
  }
}

type Prepared = { content: string | ContentPart[] } | { notice: string }

function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase()
}

function isTextLike(media: InboundMedia): boolean {
  const mime = baseMime(media.mime)
  if (mime.startsWith('text/') || mime === 'application/json') return true
  return media.fileName !== undefined && TEXT_EXTENSION.test(media.fileName)
}

function withPrefix(content: string | ContentPart[], block: string): string | ContentPart[] {
  if (typeof content === 'string') return `${block}\n\n---\n${content}`
  return [{ type: 'text', text: block }, ...content]
}

export function createHandler(ctx: AppContext): Handler {
  const queue = new KeyedQueue()
  const clock = () => ctx.now()
  const seen = new TtlSet(DEDUP_TTL_MS, 5000, clock)
  const sentIds = new TtlSet(SENT_TTL_MS, 5000, clock)
  const inflight = new Set<Promise<void>>()
  let stopping = false

  // -------------------------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------------------------

  /** Sends one message and remembers its id so the echo is ignored. */
  async function say(chatJid: string, text: string): Promise<void> {
    const id = await ctx.sender.sendText(chatJid, text)
    if (typeof id === 'string' && id !== '') sentIds.add(id)
  }

  async function sayChunks(chatJid: string, text: string): Promise<void> {
    for (const chunk of chunkText(text, REPLY_CHUNK_CHARS)) await say(chatJid, chunk)
  }

  /** Best-effort short notice; failing to deliver it is only logged. */
  async function notice(chatJid: string, text: string): Promise<void> {
    try {
      await say(chatJid, text)
    } catch (err) {
      ctx.log.error({ err, chat: chatJid }, 'notice could not be sent')
    }
  }

  /** Cosmetic calls (typing indicator) must never break a turn. */
  async function quietly(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn()
    } catch (err) {
      ctx.log.debug({ err }, 'cosmetic call failed')
    }
  }

  async function currentRate(): Promise<FxRate | undefined> {
    try {
      return await ctx.fx.rate()
    } catch (err) {
      ctx.log.warn({ err }, 'fx rate failed')
      return undefined
    }
  }

  async function download(media: InboundMedia): Promise<Buffer | undefined> {
    try {
      return await media.download()
    } catch (err) {
      ctx.log.warn({ err, kind: media.kind }, 'media download failed')
      return undefined
    }
  }

  // -------------------------------------------------------------------------------------------
  // Who gets an answer
  // -------------------------------------------------------------------------------------------

  /** The text to process (trigger prefix stripped), or undefined when the message is to be ignored. */
  function decide(msg: InboundMessage): string | undefined {
    const ignore = (reason: string): undefined => {
      ctx.log.debug({ chat: msg.chatJid, id: msg.id, reason }, 'message ignored')
      return undefined
    }
    if (msg.isGroup || isGroupJid(msg.chatJid)) return ignore('group')
    if (isBroadcastOrNewsletter(msg.chatJid)) return ignore('broadcast or newsletter')
    if (sentIds.has(msg.id)) return ignore('own message')
    if (!seen.firstSeen(`${msg.chatJid}:${msg.id}`)) return ignore('duplicate')

    const ownChat = msg.isSelfChat && msg.fromMe && ctx.config.replyInSelfChat
    const allowedContact = !msg.fromMe && ctx.access.isAllowed(msg.senderJid)
    if (!ownChat && !allowedContact) return ignore(msg.fromMe ? 'own message to someone else' : 'not allowed')

    let text = msg.text.trim()
    const prefix = ctx.config.triggerPrefix
    if (prefix !== '' && !text.startsWith('/')) {
      if (trLower(text.slice(0, prefix.length)) !== trLower(prefix)) return ignore('no trigger prefix')
      text = text.slice(prefix.length).trim()
    }
    if (text === '' && !msg.media) return ignore('empty')
    return text
  }

  // -------------------------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------------------------

  async function commandTurn(msg: InboundMessage, cmd: ParsedCommand): Promise<void> {
    if (cmd.name === 'unknown') {
      await say(msg.chatJid, unknownCommandReply(cmd.raw))
      return
    }
    const state = await ctx.store.load(msg.chatJid)
    const result = await runCommand(cmd, msg, state, ctx)
    if (result.state !== state) await ctx.store.save(result.state)
    if (result.reply.trim() !== '') await sayChunks(msg.chatJid, result.reply)
  }

  // -------------------------------------------------------------------------------------------
  // Chat turn
  // -------------------------------------------------------------------------------------------

  /** A budget notice when this month's spending has reached the limit; undefined otherwise. */
  async function budgetNotice(): Promise<string | undefined> {
    const budget = effectiveBudget(ctx)
    if (!(budget > 0)) return undefined
    const month = await ctx.ledger.month(ctx.now())
    let spent = month.tl
    if (spent === 0 && month.usd > 0) {
      // Entries written while no rate was available carry no TL; convert them at today's rate.
      const converted = tlOf(month.usd, (await currentRate())?.rate)
      if (converted !== undefined) spent = converted
    }
    if (spent < budget) return undefined
    return [
      `Aylık bütçe doldu: ${formatTl(spent)} harcandı, sınır ${formatTl(budget)}.`,
      'Yeni sınır için /butce <TL> yaz. 0 yazarsan sınır kalkar.',
    ].join('\n')
  }

  /** Turns the inbound message into the user content for the model, or into a notice (no model call). */
  async function prepareContent(
    msg: InboundMessage,
    text: string,
    modelId: string,
    modelInfo: ModelInfo | undefined,
  ): Promise<Prepared> {
    const media = msg.media
    const quotedText = msg.quotedText
    if (!media) return { content: userContentFor({ text, quotedText }) }

    switch (media.kind) {
      case 'image': {
        if (!modelInfo) {
          return {
            notice: `Bu modelin resim desteğini doğrulayamadım (${modelId}). /modeller yenile ile listeyi tazele ya da görsel destekli bir model seç.`,
          }
        }
        if (!modelInfo.inputModalities.includes('image')) {
          return {
            notice: `Bu model (${modelId}) resim okuyamıyor. Görsel destekli bir model seç; örnek: /modeller gemini`,
          }
        }
        if (media.sizeBytes !== undefined && media.sizeBytes > IMAGE_MAX_BYTES) return { notice: IMAGE_TOO_BIG }
        const buf = await download(media)
        if (!buf) return { notice: DOWNLOAD_FAILED }
        if (buf.length > IMAGE_MAX_BYTES) return { notice: IMAGE_TOO_BIG }
        const declared = baseMime(media.mime)
        const mime = /^image\/[a-z0-9.+-]+$/.test(declared) ? declared : 'image/jpeg'
        const imageDataUrl = `data:${mime};base64,${buf.toString('base64')}`
        return { content: userContentFor({ text, quotedText, imageDataUrl }) }
      }
      case 'audio': {
        if (!ctx.stt) return { notice: NO_STT }
        const buf = await download(media)
        if (!buf) return { notice: DOWNLOAD_FAILED }
        let transcript: string
        try {
          transcript = (await ctx.stt.transcribe(buf, media.mime)).trim()
        } catch (err) {
          ctx.log.warn({ err }, 'transcription failed')
          return { notice: STT_FAILED }
        }
        if (transcript === '') return { notice: STT_EMPTY }
        return { content: userContentFor({ text, quotedText, transcript }) }
      }
      case 'document': {
        if (isPersonalExport(media.fileName, media.mime)) return { notice: PERSONAL_EXPORT }
        if (!isTextLike(media)) return { notice: DOCUMENT_UNSUPPORTED }
        if (media.sizeBytes !== undefined && media.sizeBytes > DOCUMENT_MAX_BYTES) return { notice: DOCUMENT_TOO_BIG }
        const buf = await download(media)
        if (!buf) return { notice: DOWNLOAD_FAILED }
        if (buf.length > DOCUMENT_MAX_BYTES) return { notice: DOCUMENT_TOO_BIG }
        const body = buf.toString('utf8').replace(/^﻿/, '')
        if (body.includes('\u0000')) return { notice: DOCUMENT_UNSUPPORTED }
        if (body.trim() === '') return { notice: DOCUMENT_EMPTY }
        if (isPersonalExport(media.fileName, media.mime, body)) return { notice: PERSONAL_EXPORT }
        const name = media.fileName?.trim() || 'dosya'
        return { content: userContentFor({ text, quotedText, documentText: { name, text: body } }) }
      }
      default:
        return { notice: UNSUPPORTED_MEDIA }
    }
  }

  async function recordCost(entry: LedgerEntry): Promise<void> {
    try {
      await ctx.ledger.append(entry)
    } catch (err) {
      // The answer is already paid for; losing one ledger line must not lose the answer.
      ctx.log.error({ err, entry }, 'ledger append failed')
    }
  }

  async function runTurn(msg: InboundMessage, text: string): Promise<void> {
    const chat = msg.chatJid
    const state = await ctx.store.load(chat)
    const modelId = state.model ?? ctx.config.defaultModel
    const modelInfo = ctx.catalog.get(modelId)

    const blocked = await budgetNotice()
    if (blocked) {
      await say(chat, blocked)
      return
    }

    const prepared = await prepareContent(msg, text, modelId, modelInfo)
    if ('notice' in prepared) {
      await say(chat, prepared.notice)
      return
    }
    const userContent = prepared.content

    // Personal profile: only for the account owner, only in this turn's request, never in stored history.
    const owner = msg.isSelfChat || ctx.access.isOwner(msg.senderJid)
    let profileBlock = ''
    if (owner && ctx.profile) {
      const lastUser = [...state.history].reverse().find((m) => m.role === 'user')
      const query = [text, msg.quotedText ?? '', typeof lastUser?.content === 'string' ? lastUser.content : ''].join(
        '\n',
      )
      try {
        profileBlock = ctx.profile.contextFor(query)
      } catch (err) {
        ctx.log.warn({ err }, 'profile lookup failed')
      }
    }
    const requestContent = profileBlock ? withPrefix(userContent, profileBlock) : userContent
    const messages = buildMessages({
      state,
      config: ctx.config,
      model: modelInfo,
      userContent: requestContent,
      now: ctx.now(),
    })
    let result: ChatResult
    try {
      result = await ctx.llm.chat({ model: modelId, messages, maxTokens: ctx.config.maxOutputTokens })
    } catch (err) {
      if (err instanceof LlmError) {
        ctx.log.warn({ status: err.status, detail: err.detail, model: modelId }, 'model call failed')
        await say(chat, llmNotice(err, modelId))
        return
      }
      throw err
    }

    // Router models (openrouter/auto) report the model that really answered; bill that one when the
    // catalog knows it. Otherwise keep the requested id so ledger rows group by what the user chose.
    const answeredBy = result.model && result.model !== modelId ? ctx.catalog.get(result.model) : undefined
    const billedInfo = answeredBy ?? modelInfo
    const billedId = answeredBy ? answeredBy.id : modelId
    const rate = (await currentRate())?.rate
    const entry = ledgerEntry({
      ts: ctx.now(),
      chatJid: chat,
      model: billedId,
      result,
      modelInfo: billedInfo,
      rate,
    })

    const answer = (result.text ?? '').trim()
    const formatted = markdownToWhatsApp(answer)
    if (formatted.trim() === '') {
      // Tokens may have been billed even though nothing came back.
      if (result.usage) await recordCost(entry)
      await say(chat, EMPTY_REPLY)
      return
    }
    await recordCost(entry)

    const next: ChatState = {
      ...state,
      history: trimHistory(
        [
          ...state.history,
          { role: 'user', content: historyPlaceholder(userContent) },
          { role: 'assistant', content: answer },
        ],
        { maxMessages: ctx.config.maxHistory, maxChars: charBudgetFor(modelInfo) },
      ),
      updatedAt: ctx.now(),
    }
    try {
      await ctx.store.save(next)
    } catch (err) {
      ctx.log.error({ err, chat }, 'chat state could not be saved')
    }

    const footer = effectiveFooter(ctx) ? footerLine(entry) : undefined
    const chunks = chunkText(formatted, REPLY_CHUNK_CHARS - (footer ? footer.length + 2 : 0))
    const last = chunks.pop()
    if (last !== undefined) chunks.push(footer ? `${last}\n\n${footer}` : last)
    for (const chunk of chunks) await say(chat, chunk)
    ctx.log.info(
      {
        chat,
        model: billedId,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        usd: entry.usd,
      },
      'reply sent',
    )
  }

  async function chatTurn(msg: InboundMessage, text: string): Promise<void> {
    await quietly(() => ctx.sender.typing(msg.chatJid, true))
    try {
      await runTurn(msg, text)
    } finally {
      await quietly(() => ctx.sender.typing(msg.chatJid, false))
    }
  }

  /** One queued unit of work. Never throws. */
  async function processMessage(msg: InboundMessage, text: string): Promise<void> {
    try {
      const cmd = parseCommand(text)
      if (cmd) await commandTurn(msg, cmd)
      else await chatTurn(msg, text)
    } catch (err) {
      ctx.log.error({ err, chat: msg.chatJid, id: msg.id }, 'message handling failed')
      await notice(msg.chatJid, GENERIC_ERROR)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------------------------

  return {
    async handle(msg) {
      try {
        if (stopping) {
          ctx.log.debug({ chat: msg.chatJid, id: msg.id }, 'message ignored: handler is stopping')
          return
        }
        const text = decide(msg)
        if (text === undefined) return
        const job = queue
          .run(msg.chatJid, () => processMessage(msg, text))
          .catch((err: unknown) => {
            ctx.log.error({ err, chat: msg.chatJid }, 'queued task failed')
          })
        const tracked: Promise<void> = job.finally(() => {
          inflight.delete(tracked)
        })
        inflight.add(tracked)
        await tracked
      } catch (err) {
        try {
          ctx.log.error({ err }, 'handle failed')
        } catch {
          // logging must not be able to throw out of handle() either
        }
      }
    },

    noteSent(id) {
      if (id) sentIds.add(id)
    },

    setOwnerJids(jids) {
      const normalized = jids.map((j) => normalizeJid(j)).filter((j) => j !== '')
      const access = ctx.access as AccessControl & { addOwnerJid?: (jid: string) => void }
      if (typeof access.addOwnerJid === 'function') {
        for (const jid of normalized) access.addOwnerJid(jid)
      }
      ctx.log.debug({ count: normalized.length }, 'owner jids set')
    },

    async stop() {
      stopping = true
      if (inflight.size === 0) return
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), STOP_WAIT_MS)
        timer.unref()
      })
      const drained = (async () => {
        while (inflight.size > 0) await Promise.allSettled([...inflight])
        return 'drained' as const
      })()
      const outcome = await Promise.race([drained, timeout])
      clearTimeout(timer)
      if (outcome === 'timeout')
        ctx.log.warn({ pending: inflight.size }, 'stop: gave up waiting for in-flight messages')
    },
  }
}
