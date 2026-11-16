/**
 * Geliştirme sunucuları: API'yi (http://127.0.0.1:8310) ve web'i (http://localhost:5310) birlikte başlatır.
 * Çıktılar [api] / [web] önekiyle tek pencerede görünür. Ctrl+C ikisini de düzgünce kapatır; biri çökerse
 * öteki de kapatılır (yarım çalışan ortam kalmasın).
 *
 * Kullanım: npm run dev            (yalnız web: npm run dev -w @uygulama/web)
 * Genişletme: yeni bir süreç (ör. e-posta önizleyici) → PROCESSES listesine satır ekleyin.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const PROCESSES = [
  { name: 'api', color: '\u001b[35m', args: ['run', 'dev', '-w', '@uygulama/api'] },
  { name: 'web', color: '\u001b[36m', args: ['run', 'dev', '-w', '@uygulama/web'] },
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

function stop(code: number): void {
  if (stopping) return
  stopping = true
  for (const child of children.values()) child.kill('SIGTERM')
  // Kapanmayan olursa 5 sn sonra zorla.
  const force = setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL')
  }, 5000)
  force.unref()
  const wait = setInterval(() => {
    if ([...children.values()].every((child) => child.exitCode !== null || child.signalCode !== null)) {
      clearInterval(wait)
      process.exit(code)
    }
  }, 100)
}

for (const { name, color, args } of PROCESSES) {
  const prefix = `${color}[${name}]${RESET}`
  const child = spawn(NPM, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: process.platform === 'win32',
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
console.log(`API: http://127.0.0.1:8310 · Web: http://localhost:5310 · Durdurmak için Ctrl+C`)
