/**
 * Boş bir TCP kapısı bulur (eşzamanlı çalışan başka süreçlerle çakışmasın diye sabit kapı kullanılmaz).
 * Playwright ayarı eşzamanlı (senkron) okunduğu için küçük bir alt süreçle sorulur.
 */
import { execFileSync } from 'node:child_process'

const PROBE =
  "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})"

export function freePort(): number {
  const port = Number(execFileSync(process.execPath, ['-e', PROBE], { encoding: 'utf8' }))
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Boş kapı bulunamadı: ${port}`)
  return port
}
