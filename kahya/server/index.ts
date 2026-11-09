// Sunucuyu başlatır: node server/index.ts (Node 22.18+ TypeScript'i doğrudan çalıştırır).
import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { ClaudeEngine } from './ai/claude.ts'
import { AIService } from './ai/service.ts'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { get, openDb } from './db/db.ts'
import { seedDemo } from './db/seed.ts'
import type { Deps } from './http.ts'
import { Messaging } from './integrations/messaging.ts'
import { Payments } from './integrations/payments.ts'
import { startScheduler } from './services/autopilot.ts'

const config = loadConfig()
const db = openDb(config.dbPath)

if (config.seedDemo && !get(db, 'SELECT id FROM orgs LIMIT 1')) {
  await seedDemo(db)
  console.info('[kahya] Örnek veri yüklendi (KAHYA_SEED_DEMO=0 ile kapatılır).')
}

const llm = config.ai.engine === 'claude' ? new ClaudeEngine(config.ai.model) : null
const deps: Deps = {
  db,
  config,
  ai: new AIService(config, llm),
  messaging: new Messaging(config),
  payments: new Payments(config),
  now: () => new Date(),
}

const staticDir = existsSync('dist/index.html') ? 'dist' : undefined
const app = createApp(deps, { staticDir })
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.info(
    `[kahya] http://localhost:${info.port} — yapay zekâ: ${deps.ai.describe().engine}${llm ? ` (${llm.model})` : ''}, demo: ${config.demo ? 'açık' : 'kapalı'}${staticDir ? '' : ' — arayüz için `npm run dev` ya da `npm run build`'}`,
  )
})
const stopScheduler = startScheduler(deps)

const shutdown = () => {
  stopScheduler()
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
