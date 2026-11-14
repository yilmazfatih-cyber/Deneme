import { buildApp } from './app'

const app = await buildApp()
const { host, port } = app.config
await app.listen({ host, port })
console.log(`TV+ sunucusu hazır: http://localhost:${port}  (bölge ${app.config.region}, derleme ${app.config.buildId})`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0))
  })
}
