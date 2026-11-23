/**
 * Playwright genel hazırlığı: dist/ klasörünü ayrı bir süreçte (scripts/serve-web.ts) boş bir kapıda sunar ve
 * adresi testlere `MOBIL_WEB_URL` ile verir. Dönen işlev testler bitince sunucuyu kapatır.
 * dist/ yoksa yol gösteren hatayla durur.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

export default async function globalSetup(): Promise<() => Promise<void>> {
  // API bütünleşmesinde (scripts/api-integration.ts) sunucuyu betik açar ve adresi kendisi verir.
  if (process.env.MOBIL_WEB_URL) return async () => {}
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    throw new Error('Web derlemesi yok. Önce `npm run build:web` çalıştırın (npm run e2e bunu kendisi yapar).')
  }
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-web.ts'), join(ROOT, 'dist'), '0'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const port = await new Promise<number>((resolve, reject) => {
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = /PORT (\d+)/.exec(output)
      if (match) resolve(Number(match[1]))
    })
    child.on('exit', (code) => reject(new Error(`Durağan sunucu başlamadı (çıkış kodu ${String(code)}).`)))
  })
  process.env.MOBIL_WEB_URL = `http://127.0.0.1:${port}`
  return async () => {
    child.kill()
  }
}
