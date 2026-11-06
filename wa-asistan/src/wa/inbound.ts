/**
 * Raw Baileys `WAMessage` → platform-neutral `InboundMessage`.
 * Pure apart from the injected `download` function, so it is tested with plain JSON fixtures.
 */
import { getContentType, normalizeMessageContent, type WAMessage, type proto } from 'baileys'
import { isBroadcastOrNewsletter, isGroupJid, normalizeJid } from '../core/jid.js'
import type { InboundMedia, InboundMessage } from '../core/types.js'

export interface InboundContext {
  /** normalized own jids: phone jid and (v7) LID */
  selfJids: string[]
  download: (msg: WAMessage) => Promise<Buffer>
}

type Content = proto.IMessage

const hasToNumber = (v: unknown): v is { toNumber(): number } =>
  typeof v === 'object' && v !== null && typeof (v as { toNumber?: unknown }).toNumber === 'function'

/** protobuf int64 fields arrive as number or Long */
function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (hasToNumber(v)) return v.toNumber()
  return undefined
}

const isPn = (jid: string | null | undefined): jid is string => !!jid && jid.endsWith('@s.whatsapp.net')

function textOf(content: Content | null | undefined): string {
  if (!content) return ''
  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    ''
  ).trim()
}

function quotedTextOf(content: Content | null | undefined): string | undefined {
  const ctx =
    content?.extendedTextMessage?.contextInfo ??
    content?.imageMessage?.contextInfo ??
    content?.audioMessage?.contextInfo ??
    content?.documentMessage?.contextInfo ??
    content?.videoMessage?.contextInfo
  const quoted = ctx?.quotedMessage ? normalizeMessageContent(ctx.quotedMessage) : undefined
  const t = textOf(quoted)
  return t || undefined
}

function mediaOf(msg: WAMessage, content: Content, download: InboundContext['download']): InboundMedia | undefined {
  const dl = () => download(msg)
  if (content.imageMessage) {
    const m = content.imageMessage
    const size = toNum(m.fileLength)
    return {
      kind: 'image',
      mime: m.mimetype ?? 'image/jpeg',
      ...(size !== undefined ? { sizeBytes: size } : {}),
      download: dl,
    }
  }
  if (content.audioMessage) {
    const m = content.audioMessage
    const size = toNum(m.fileLength)
    return {
      kind: 'audio',
      mime: m.mimetype ?? 'audio/ogg; codecs=opus',
      ...(m.seconds ? { seconds: m.seconds } : {}),
      ...(size !== undefined ? { sizeBytes: size } : {}),
      download: dl,
    }
  }
  if (content.documentMessage) {
    const m = content.documentMessage
    const size = toNum(m.fileLength)
    return {
      kind: 'document',
      mime: m.mimetype ?? 'application/octet-stream',
      ...(m.fileName ? { fileName: m.fileName } : {}),
      ...(size !== undefined ? { sizeBytes: size } : {}),
      download: dl,
    }
  }
  if (content.videoMessage || content.ptvMessage) {
    const m = content.videoMessage ?? content.ptvMessage
    const size = toNum(m?.fileLength)
    return {
      kind: 'video',
      mime: m?.mimetype ?? 'video/mp4',
      ...(m?.seconds ? { seconds: m.seconds } : {}),
      ...(size !== undefined ? { sizeBytes: size } : {}),
      download: dl,
    }
  }
  if (content.stickerMessage) {
    return { kind: 'sticker', mime: content.stickerMessage.mimetype ?? 'image/webp', download: dl }
  }
  return undefined
}

/** `undefined` for anything the bot must never look at: status, newsletters, protocol/reaction/poll stubs. */
export function toInbound(msg: WAMessage, ctx: InboundContext): InboundMessage | undefined {
  const key = msg.key
  const remote = key?.remoteJid
  const id = key?.id
  if (!remote || !id || !msg.message) return undefined
  if (isBroadcastOrNewsletter(remote)) return undefined

  const content = normalizeMessageContent(msg.message)
  if (!content) return undefined
  const type = getContentType(content)
  if (!type) return undefined

  const media = mediaOf(msg, content, ctx.download)
  const text = textOf(content)
  // Only text-bearing and media messages are interesting; protocol, reaction, poll, key-distribution are not.
  if (!media && !text && type !== 'conversation' && type !== 'extendedTextMessage') return undefined
  if (!media && !text) return undefined

  const chatJid = normalizeJid(remote)
  const alt = key.remoteJidAlt ? normalizeJid(key.remoteJidAlt) : ''
  const fromMe = !!key.fromMe
  const self = ctx.selfJids.map(normalizeJid)
  const isSelfChat = !isGroupJid(chatJid) && (self.includes(chatJid) || (alt !== '' && self.includes(alt)))
  // Allowlists are phone numbers, so prefer the phone jid when the chat itself is addressed by LID.
  const peerPn = isPn(chatJid) ? chatJid : isPn(alt) ? alt : undefined
  const senderJid = fromMe ? (self.find(isPn) ?? self[0] ?? chatJid) : (peerPn ?? chatJid)
  const ts = toNum(msg.messageTimestamp)
  const quotedText = quotedTextOf(content)

  return {
    id,
    chatJid,
    senderJid,
    fromMe,
    isSelfChat,
    isGroup: isGroupJid(chatJid),
    ...(msg.pushName ? { pushName: msg.pushName } : {}),
    text,
    ...(quotedText ? { quotedText } : {}),
    ...(media ? { media } : {}),
    timestamp: ts !== undefined ? ts * 1000 : Date.now(),
  }
}
