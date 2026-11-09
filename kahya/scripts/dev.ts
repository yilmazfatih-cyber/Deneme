// Geliştirme: API sunucusunu (izlemeli) ve Vite arayüzünü birlikte başlatır. Ctrl+C ikisini de durdurur.
import { spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
// Geliştirmede demo modu ve örnek veri varsayılan olarak açıktır
process.env.KAHYA_DEMO ??= '1'
process.env.KAHYA_SEED_DEMO ??= '1'
const procs = [
  spawn(
    process.execPath,
    ['--watch', '--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', 'server/index.ts'],
    { stdio: 'inherit' },
  ),
  spawn(isWin ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit', shell: isWin }),
]

const stop = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', (code) => code && code !== 0 && stop())
