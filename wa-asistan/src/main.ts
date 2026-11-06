/**
 * wa-asistan entry point: configuration → services → WhatsApp → handler, with a clean shutdown.
 * Start with `npm start`. First run prints a QR code (or a pairing code when PAIRING_PHONE is set).
 */
import fs from 'node:fs'
import path from 'node:path'
import { ConfigError, loadConfig, type Config } from './config.js'
import { FileAccessControl } from './core/access.js'
import { HttpFxService } from './core/fx.js'
import { createHandler } from './core/handler.js'
import { JsonlLedger } from './core/ledger.js'
import type { AppContext, Sender } from './core/types.js'
import { OpenAICompatClient } from './llm/client.js'
import { ModelCatalog } from './llm/catalog.js'
import { HttpTranscriber } from './llm/stt.js'
import { createLogger } from './log.js'
import { ProfileStore } from './profile/store.js'
import { FileChatStore, FileSettingsStore } from './store/files.js'
import { startWhatsApp } from './wa/connection.js'

function loadEnvFile(): void {
  try {
    process.loadEnvFile('.env')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

function loadConfigOrExit(): Config {
  try {
    return loadConfig()
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Ayar hatası: ${err.message}`)
      console.error('Örnek ayarlar için env.example dosyasına bakın:  cp env.example .env')
      process.exit(1)
    }
    throw err
  }
}

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadConfigOrExit()
  const log = createLogger(config.logLevel)
  const data = (...p: string[]) => path.join(config.dataDir, ...p)
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })

  const llm = new OpenAICompatClient({
    baseUrl: config.llmBaseUrl,
    apiKey: config.llmApiKey,
    provider: config.provider,
    appName: config.appName,
    timeoutMs: config.llmTimeoutMs,
    extraHeaders: config.extraHeaders,
  })
  const catalog = new ModelCatalog({ llm, file: data('catalog.json'), aliases: config.modelAliases })
  const fx = new HttpFxService({
    file: data('fx.json'),
    refreshHours: config.fxRefreshHours,
    multiplier: config.tlMultiplier,
    ...(config.usdTry !== undefined ? { envManual: config.usdTry } : {}),
    warn: (m) => log.warn(m),
  })
  const access = new FileAccessControl({
    file: data('allowlist.json'),
    ownerPhones: config.ownerNumber ? [config.ownerNumber] : [],
    configAllowedPhones: config.allowedNumbers,
  })

  // The sender only exists once the socket does, but the handler is needed to create the socket.
  let realSender: Sender | undefined
  const sender: Sender = {
    sendText: (jid, text, opts) => {
      if (!realSender) throw new Error('WhatsApp henüz hazır değil')
      return realSender.sendText(jid, text, opts)
    },
    typing: (jid, on) => realSender?.typing(jid, on) ?? Promise.resolve(),
  }

  const ctx: AppContext = {
    config,
    llm,
    catalog,
    ...(config.stt ? { stt: new HttpTranscriber(config.stt) } : {}),
    fx,
    ledger: new JsonlLedger(data('ledger.jsonl')),
    store: new FileChatStore(config.dataDir, { persist: config.historyPersist }),
    access,
    settings: new FileSettingsStore(data('settings.json'), {}),
    profile: new ProfileStore(data('profil')),
    sender,
    log,
    now: Date.now,
    startedAt: Date.now(),
  }
  const handler = createHandler(ctx)

  // Background refreshes never block a reply. Failures are logged once; cached data keeps working.
  const refreshCatalog = () =>
    catalog.refresh().catch((err: unknown) => log.warn({ err: String(err) }, 'Model listesi alınamadı'))
  void refreshCatalog()
  void fx.refresh()
  const timers = [
    setInterval(() => void refreshCatalog(), 24 * 3_600_000),
    setInterval(() => void fx.refresh(), config.fxRefreshHours * 3_600_000),
  ]
  for (const t of timers) t.unref()

  const wa = await startWhatsApp({
    authDir: data('auth'),
    logger: log,
    ...(config.pairingPhone ? { pairingPhone: config.pairingPhone } : {}),
    beforeSend: (id) => handler.noteSent(id),
    onMessage: (m) => handler.handle(m),
    onConnected: (info) => {
      access.addOwnerJid(info.jid)
      if (info.lid) access.addOwnerJid(info.lid)
      handler.setOwnerJids([info.jid, ...(info.lid ? [info.lid] : [])])
      const rate = fx.rate()
      void rate.then((r) =>
        log.info(
          { model: config.defaultModel, provider: config.provider, kur: r ? `${r.rate} (${r.source})` : 'yok' },
          'Hazır. WhatsApp\'ta "kendine mesaj" sohbetine /yardim yazın.',
        ),
      )
    },
    onLoggedOut: () => {
      console.error(
        '\nWhatsApp bu cihazın bağlantısını kaldırdı. Yeniden bağlamak için:\n' +
          `  1) Programı durdurun   2) ${data('auth')} klasörünü silin   3) npm start ile yeniden QR okutun\n`,
      )
      void shutdown(1)
    },
    ...(process.env.NODE_ENV === 'test' ? { minGapMs: 0 } : {}),
  })
  realSender = wa.sender

  let closing = false
  async function shutdown(code = 0): Promise<void> {
    if (closing) return
    closing = true
    log.info('Kapatılıyor…')
    await handler.stop().catch(() => {})
    await wa.stop().catch(() => {})
    process.exit(code)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((err: unknown) => {
  console.error('Başlatılamadı:', err instanceof Error ? err.message : err)
  process.exit(1)
})
