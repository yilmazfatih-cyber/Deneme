/**
 * Geliştirme sunucuları: API'yi (http://127.0.0.1:8310) ve web'i (http://localhost:5310) birlikte başlatır.
 * Çıktılar [api] / [web] önekiyle tek pencerede görünür. Ctrl+C ikisini de düzgünce kapatır; biri çökerse
 * öteki de kapatılır (yarım çalışan ortam kalmasın).
 *
 * Süreçler `npm run …` yerine doğrudan `node` ile başlatılır: araya giren `sh -c` katmanı kapanış sinyalini
 * iletmez ve arkada sahipsiz süreç kalır. Her süreç kendi süreç grubunda açılır; kapanışta grubun tamamı kapatılır.
 *
 * Kullanım: npm run dev            (yalnız web: npm run dev -w @uygulama/web)
 * Genişletme: yeni bir süreç (ör. e-posta önizleyici) → PROCESSES listesine satır ekleyin.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const WINDOWS = process.platform === 'win32'

const PROCESSES = [
  {
    name: 'api',
    color: '\u001b[35m',
    cwd: join(ROOT, 'api'),
    args: ['--watch', '--disable-warning=ExperimentalWarning', 'src/index.ts'],
  },
  {
    name: 'web',
    color: '\u001b[36m',
    cwd: join(ROOT, 'web'),
    args: [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')],
  },
] as const

const RESET = '\u001b[0m'
const children = new Map<string, ChildProcess>()
let stopping = false

function pipe(stream: NodeJS.ReadableStream | null, prefix: string, out: NodeJS.WriteStream): void {
  let buffer = ''
  stream?.setEncoding('utf8')
  stream?.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) out.write(`${prefix} ${line}\n`)
  })
  stream?.on('end', () => {
    if (buffer) out.write(`${prefix} ${buffer}\n`)
  })
}

/** Sürecin kendisini ve alt süreçlerini kapatır (Windows'ta taskkill, öteki sistemlerde süreç grubu). */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  if (WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

function stop(code: number): void {
  if (stopping) return
  stopping = true
  for (const child of children.values()) killTree(child, 'SIGTERM')
  // Kapanmayan olursa 5 sn sonra zorla.
  const force = setTimeout(() => {
    for (const child of children.values()) killTree(child, 'SIGKILL')
  }, 5000)
  force.unref()
  const wait = setInterval(() => {
    if ([...children.values()].every((child) => child.exitCode !== null || child.signalCode !== null)) {
      clearInterval(wait)
      process.exit(code)
    }
  }, 100)
}

for (const { name, color, cwd, args } of PROCESSES) {
  const prefix = `${color}[${name}]${RESET}`
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    detached: !WINDOWS,
  })
  children.set(name, child)
  pipe(child.stdout, prefix, process.stdout)
  pipe(child.stderr, prefix, process.stderr)
  child.on('exit', (code) => {
    if (stopping) return
    console.error(`${prefix} kapandı (çıkış kodu ${code ?? '?'}). Öteki süreç de kapatılıyor.`)
    stop(code ?? 1)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
process.on('exit', () => {
  for (const child of children.values()) killTree(child, 'SIGKILL')
})
console.log('API: http://127.0.0.1:8310 · Web: http://localhost:5310 · Durdurmak için Ctrl+C')
