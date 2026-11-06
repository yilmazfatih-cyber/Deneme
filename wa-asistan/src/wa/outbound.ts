/** `Sender` on top of a (re)connectable Baileys socket. Paces consecutive messages to look less robotic. */
import { generateMessageIDV2, type WAMessage, type WASocket } from 'baileys'
import type { Sender } from '../core/types.js'

export interface SocketRef {
  current(): WASocket | undefined
}

export interface SenderOptions {
  /** called with the message id BEFORE it is sent, so echoes of our own replies can be recognised */
  beforeSend?: (id: string) => void
  /** looked up when `quoteId` is given */
  recent?: (id: string) => WAMessage | undefined
  /** remember what we sent: Baileys asks for it again on delivery retries */
  remember?: (id: string, m: WAMessage) => void
  /** minimum gap between two messages to the same chat (ms) */
  minGapMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export function createSender(ref: SocketRef, o: SenderOptions = {}): Sender {
  const minGap = o.minGapMs ?? 800
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = o.now ?? Date.now
  const lastSent = new Map<string, number>()

  const sock = (): WASocket => {
    const s = ref.current()
    if (!s) throw new Error('WhatsApp bağlantısı şu an yok')
    return s
  }

  return {
    async sendText(chatJid, text, opts) {
      const s = sock()
      const wait = (lastSent.get(chatJid) ?? 0) + minGap - now()
      if (wait > 0) await sleep(wait)
      const messageId = generateMessageIDV2(s.user?.id)
      o.beforeSend?.(messageId)
      const quoted = opts?.quoteId ? o.recent?.(opts.quoteId) : undefined
      const sent = await s.sendMessage(chatJid, { text }, { messageId, ...(quoted ? { quoted } : {}) })
      lastSent.set(chatJid, now())
      if (sent) o.remember?.(messageId, sent)
      return sent?.key?.id ?? messageId
    },
    async typing(chatJid, on) {
      const s = ref.current()
      if (!s) return
      try {
        await s.sendPresenceUpdate(on ? 'composing' : 'paused', chatJid)
      } catch {
        // presence is cosmetic; never fail a reply because of it
      }
    },
  }
}
