/**
 * `process` karşılığı: ortam değişkenleri, süre ölçümü, kimliği 1 olan tek "süreç".
 * `versions.node` bilerek tanımsızdır: sunucu kodu Node'a özgü yolları (sınama sunucuları vb.) böyle ayırır.
 */
import { EventEmitter } from './events'

const startedAt = performance.now()

class BrowserProcess extends EventEmitter {
  env: Record<string, string | undefined> = { NODE_ENV: 'production' }
  pid = 1
  ppid = 0
  platform = 'browser'
  arch = 'wasm'
  title = 'tvplus-tarayici'
  argv: string[] = ['tarayici', 'tvplus']
  execArgv: string[] = []
  versions: Record<string, string> = {}
  version = ''
  release = { name: 'tarayici' }
  exitCode: number | undefined = undefined
  browser = true

  hrtime = Object.assign(
    (prev?: [number, number]): [number, number] => {
      const ns = BigInt(Math.round(performance.now() * 1e6))
      let s = Number(ns / 1_000_000_000n)
      let n = Number(ns % 1_000_000_000n)
      if (prev) {
        s -= prev[0]
        n -= prev[1]
        if (n < 0) {
          s -= 1
          n += 1e9
        }
      }
      return [s, n]
    },
    { bigint: (): bigint => BigInt(Math.round(performance.now() * 1e6)) },
  )

  cwd(): string {
    return '/'
  }
  chdir(): void {}
  uptime(): number {
    return (performance.now() - startedAt) / 1000
  }
  nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]): void {
    queueMicrotask(() => fn(...args))
  }
  memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number } {
    const m = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
    const used = m?.usedJSHeapSize ?? 0
    return { rss: used, heapTotal: m?.totalJSHeapSize ?? used, heapUsed: used, external: 0, arrayBuffers: 0 }
  }
  cpuUsage(): { user: number; system: number } {
    return { user: Math.round(performance.now() * 1000), system: 0 }
  }
  emitWarning(warning: unknown): void {
    console.warn('[süreç uyarısı]', warning)
  }
  kill(pid: number): boolean {
    if (pid === this.pid) return true
    const err = new Error(`kill ESRCH`) as Error & { code: string }
    err.code = 'ESRCH'
    throw err
  }
  exit(code?: number): never {
    throw new Error(`Tarayıcıda süreç sonlandırılamaz (çıkış kodu ${code ?? 0})`)
  }
  umask(): number {
    return 0o22
  }
  stdout = { write: (s: string): boolean => (console.log(s), true), isTTY: false }
  stderr = { write: (s: string): boolean => (console.warn(s), true), isTTY: false }
}

export const process = new BrowserProcess()
export default process
