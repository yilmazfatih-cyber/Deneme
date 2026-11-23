/**
 * API bütünleşme denemesi: havuz/uygulama'nın API'sini bir KOPYADAN başlatır (asıl klasöre dokunmaz), web
 * derlemesini o API'ye bağlı üretir ve iki test koşar:
 *   1. jest  test/integration/api.conformance.test.ts  — ortak uygunluk senaryoları, mobilin ApiClient'ıyla HTTP üzerinden
 *   2. playwright --project=api  (e2e/api.spec.ts)       — iki "cihaz": kayıt → görev ekle → eşitle → giriş → gör → tamamla
 *
 * Kullanım: npm run e2e:api                       (kaynak ../uygulama; kopya işletim sisteminin geçici klasöründe)
 *           npm run e2e:api -- --uygulama /yol/uygulama --kopya /yol/kopya
 * Gereken: Node ≥ 22.18, npm kayıt deposuna erişim (kopyada `npm ci`), Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE).
 * Genişletme: yeni bir bütünleşme senaryosu → e2e/api.spec.ts'e test ekleyin; ortam bu betikle hazırlanır.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Kopyalanan parçalar: API'yi çalıştırmaya yetenler (web yalnız çalışma alanı listesi için). */
const PARTS = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'shared', 'api', 'web/package.json']

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback)
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.on('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => done(port))
    })
  })
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void {
  console.log(`\n$ ${command} ${args.join(' ')}    [${cwd}]`)
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`Komut başarısız (${String(result.status)}): ${command} ${args.join(' ')}`)
}

/** Kopyayı hazırlar; kilit dosyası değişmediyse önceki kurulum yeniden kullanılır. */
function prepareCopy(source: string, target: string): void {
  const lock = readFileSync(join(source, 'package-lock.json'), 'utf8')
  const stamp = join(target, '.kurulum-kilidi')
  const reusable = existsSync(stamp) && readFileSync(stamp, 'utf8') === lock
  for (const part of PARTS) {
    const from = join(source, part)
    const to = join(target, part)
    rmSync(to, { recursive: true, force: true })
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true, filter: (path) => !/[\\/](node_modules|\.data|dist)([\\/]|$)/.test(path) })
  }
  if (!reusable) {
    run('npm', ['ci', '--workspace=@uygulama/api', '--ignore-scripts', '--no-audit', '--no-fund'], target)
    writeFileSync(stamp, lock)
  }
}

async function waitForHealth(url: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('API başlamadan kapandı (yukarıdaki çıktıya bakın).')
    try {
      if ((await fetch(`${url}/api/health`)).ok) return
    } catch {
      // henüz açılmadı
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`API ${url} adresinde 60 sn içinde açılmadı.`)
}

async function main(): Promise<void> {
  const source = option('--uygulama', join(ROOT, '..', 'uygulama'))
  const target = option('--kopya', join(tmpdir(), 'havuz-mobil-api-kopya'))
  if (!existsSync(join(source, 'api', 'src', 'index.ts'))) {
    throw new Error(`havuz/uygulama bulunamadı: ${source}. --uygulama <yol> verin.`)
  }
  prepareCopy(source, target)
  const [apiPort, webPort] = [await freePort(), await freePort()]
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const webUrl = `http://127.0.0.1:${webPort}`
  const api = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
    cwd: join(target, 'api'),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(apiPort),
      HOST: '127.0.0.1',
      DATABASE_PATH: '.data/mobil-api.db',
      APP_URL: webUrl,
      ALLOWED_ORIGINS: webUrl,
      RATE_LIMIT: 'off',
    },
  })
  let web: ChildProcess | null = null
  try {
    rmSync(join(target, 'api', '.data'), { recursive: true, force: true })
    await waitForHealth(apiUrl, api)
    console.log(`API hazır: ${apiUrl}`)
    const env = { ...process.env, API_URL: apiUrl, MOBIL_API_URL: apiUrl, MOBIL_WEB_URL: webUrl }
    // jest-expo fetch'i sahtesiyle değiştirir; bu bayrakla Node'un gerçek fetch'i kalır (bkz. test dosyası).
    run('npx', ['jest', 'test/integration', '--runInBand'], ROOT, { ...env, EXPO_PUBLIC_USE_RN_FETCH: '1' })
    // --clear: Metro önbelleği eski app.config değerlerini (API_URL) taşımasın.
    const exportArgs = ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-api', '--clear']
    run('npx', exportArgs, ROOT, { ...env, EXPO_OFFLINE: '1' })
    web = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-web.ts'), join(ROOT, 'dist-api'), String(webPort)], {
      stdio: 'inherit',
    })
    run('npx', ['playwright', 'test', '--project=api', '--trace', 'off'], ROOT, env)
    console.log('\nAPI bütünleşmesi: hepsi yeşil.')
  } finally {
    web?.kill()
    api.kill()
  }
}

main().catch((error: unknown) => {
  console.error(`\nAPI bütünleşmesi başarısız: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
