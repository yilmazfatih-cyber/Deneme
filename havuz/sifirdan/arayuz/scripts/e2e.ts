// `npm run e2e`: siteyi derler, işletim sisteminden boş bir kapı alır ve Playwright'ı o kapıyla çalıştırır.
// Ek argümanlar Playwright'a geçer: `npm run e2e -- --trace off`, `npm run e2e -- -g sinyal`.
// Genişletme: ekran görüntüsü üretimi için ayrı bir proje (ör. --project ekran) tanımlayıp buradan çağırın.
import { spawnSync } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const port = await freePort()
run('npx', ['vite', 'build'])
run('npx', ['playwright', 'test', ...process.argv.slice(2)], { E2E_PORT: String(port) })
