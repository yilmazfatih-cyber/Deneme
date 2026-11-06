/**
 * Baileys socket lifecycle: auth folder, QR or pairing code, reconnect with backoff, logout handling.
 * Verified against baileys@7.0.0-rc14 typings. `printQRInTerminal` no longer exists: we draw the QR ourselves.
 */
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidNewsletter,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
  type proto,
} from 'baileys'
import type { Logger } from 'pino'
import qrcode from 'qrcode-terminal'
import type { InboundMessage, Sender } from '../core/types.js'
import { toInbound } from './inbound.js'
import { createSender } from './outbound.js'

export interface ConnectedInfo {
  jid: string
  lid?: string
  name?: string
}

export interface WhatsAppOptions {
  authDir: string
  logger: Logger
  pairingPhone?: string
  onMessage: (msg: InboundMessage) => void | Promise<void>
  onConnected: (info: ConnectedInfo) => void
  onLoggedOut: () => void
  /** ids of messages we are about to send (so echoes can be ignored) */
  beforeSend?: (id: string) => void
  minGapMs?: number
}

export interface WhatsAppHandle {
  sender: Sender
  stop(): Promise<void>
}

const MAX_REMEMBERED = 500
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000, 30_000, 60_000]

const statusOf = (err: unknown): number | undefined =>
  (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode

export async function startWhatsApp(o: WhatsAppOptions): Promise<WhatsAppHandle> {
  const log = o.logger.child({ mod: 'wa' })
  const { state, saveCreds } = await useMultiFileAuthState(o.authDir)
  // pino here is baileys' own default silent-ish logger: keep its noise out of the console
  const baileysLog = o.logger.child({ mod: 'baileys' }, { level: 'warn' })

  let version: [number, number, number] | undefined
  try {
    version = (await fetchLatestBaileysVersion()).version
  } catch (err) {
    log.warn({ err: String(err) }, 'Sürüm bilgisi alınamadı, paketle gelen varsayılan kullanılıyor')
  }

  let sock: WASocket | undefined
  let stopped = false
  let attempt = 0
  let selfJids: string[] = []
  const recent = new Map<string, WAMessage>()
  const sent = new Map<string, WAMessage>()
  const remember = (map: Map<string, WAMessage>, id: string, m: WAMessage) => {
    map.set(id, m)
    if (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value as string)
  }

  const sender = createSender(
    { current: () => sock },
    {
      ...(o.beforeSend ? { beforeSend: o.beforeSend } : {}),
      ...(o.minGapMs !== undefined ? { minGapMs: o.minGapMs } : {}),
      recent: (id) => recent.get(id),
      remember: (id, m) => remember(sent, id, m),
    },
  )

  const connect = (): void => {
    if (stopped) return
    const s = makeWASocket({
      ...(version ? { version } : {}),
      logger: baileysLog,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLog) },
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidNewsletter(jid),
      // delivery retries ask for the original message; an empty text keeps the handshake alive if we lost it
      getMessage: async (key): Promise<proto.IMessage | undefined> =>
        (key.id ? sent.get(key.id)?.message : undefined) ?? { conversation: '' },
    })
    sock = s
    let pairingRequested = false

    s.ev.on('creds.update', () => void saveCreds())

    s.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u
      if (qr && !s.authState.creds.registered) {
        if (o.pairingPhone) {
          if (!pairingRequested) {
            pairingRequested = true
            s.requestPairingCode(o.pairingPhone)
              .then((code) => {
                console.log(
                  `\nEşleştirme kodu: ${code}\nWhatsApp › Bağlı cihazlar › Cihaz bağla › "Telefon numarasıyla bağla"\n`,
                )
              })
              .catch((err: unknown) =>
                log.error({ err: String(err) }, 'Eşleştirme kodu alınamadı; PAIRING_PHONE boş bırakıp QR deneyin'),
              )
          }
        } else {
          console.log('\nWhatsApp › Bağlı cihazlar › Cihaz bağla ile bu kodu okutun:\n')
          qrcode.generate(qr, { small: true })
        }
      }
      if (connection === 'open') {
        attempt = 0
        const me = s.user
        const jid = jidNormalizedUser(me?.id)
        const lid = me?.lid ? jidNormalizedUser(me.lid) : undefined
        selfJids = [jid, ...(lid ? [lid] : [])].filter(Boolean)
        log.info({ jid, lid }, 'WhatsApp bağlandı')
        o.onConnected({ jid, ...(lid ? { lid } : {}), ...(me?.name ? { name: me.name } : {}) })
      }
      if (connection === 'close') {
        const code = statusOf(lastDisconnect?.error)
        if (code === DisconnectReason.loggedOut) {
          log.error('WhatsApp oturumu kapatıldı (cihaz bağlantısı kaldırılmış).')
          o.onLoggedOut()
          return
        }
        if (stopped) return
        const wait =
          code === DisconnectReason.restartRequired
            ? 500
            : (BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 60_000)
        attempt++
        log.warn({ code, wait }, 'Bağlantı koptu, yeniden deneniyor')
        setTimeout(connect, wait)
      }
    })

    s.ev.on('messages.upsert', ({ messages, type }) => {
      // 'append' is offline backlog / history: answering it would reply to old messages
      if (type !== 'notify') return
      for (const m of messages) {
        const inbound = toInbound(m, {
          selfJids,
          download: (wam) =>
            downloadMediaMessage(wam, 'buffer', {}, { logger: baileysLog, reuploadRequest: s.updateMediaMessage }),
        })
        if (!inbound) continue
        if (m.key.id) remember(recent, m.key.id, m)
        Promise.resolve(o.onMessage(inbound)).catch((err: unknown) =>
          log.error({ err: String(err) }, 'Mesaj işlenemedi'),
        )
      }
    })
  }

  connect()

  return {
    sender,
    async stop() {
      stopped = true
      try {
        sock?.end(undefined)
      } catch {
        // already closed
      }
    },
  }
}
