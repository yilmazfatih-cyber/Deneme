/**
 * Yönetici kodunu değiştirir: yeni kodu uçbirimden (ekrana yazdırmadan) okur ve depodaki varsayılan özetini günceller.
 *
 *   npm run admin:code
 *
 * Depoda kodun kendisi durmaz; yalnız `sha256(ADMIN_CODE_SALT + düzleştirilmiş kod)` özeti durur. Sunucuyu ortam
 * değişkeniyle çalıştırıyorsanız bu komuta gerek yoktur: `TVP_ADMIN_CODE=<kod>` özeti açılışta kendisi hesaplar.
 * Sunucusuz (GitHub Pages) sürümde ardından `npm run build:pages` gerekir.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADMIN_CODE_SALT, normalizeAdminCode } from '../shared/constants'

export const MIN_CODE_LENGTH = 8
const HASH_RE = /(DEFAULT_ADMIN_CODE_HASH\s*=\s*)'[0-9a-f]{64}'/

/** Kodun özeti (sunucudaki hesapla aynı). */
export function adminCodeHash(code: string): string {
  return createHash('sha256')
    .update(ADMIN_CODE_SALT + normalizeAdminCode(code))
    .digest('hex')
}

/** Kod kabul edilebilir mi; değilse nedenini döndürür. */
export function codeProblem(code: string): string | null {
  const n = normalizeAdminCode(code)
  if (n.length < MIN_CODE_LENGTH) return `Kod en az ${MIN_CODE_LENGTH} karakter olmalı (boşluk ve tire sayılmaz).`
  if (!/^[\p{L}\p{N}]+$/u.test(n)) return 'Kod yalnız harf ve rakamdan oluşmalı (boşluk ve tire serbest).'
  return null
}

/** Kaynak metindeki varsayılan özeti değiştirir; sabit bulunamazsa null. */
export function rewriteHash(source: string, hash: string): string | null {
  if (!HASH_RE.test(source)) return null
  return source.replace(HASH_RE, `$1'${hash}'`)
}

/** Özet sabitini taşıyan dosya (server/src/kernel altında aranır). */
function findTarget(root: string): string | null {
  const dir = join(root, 'server', 'src', 'kernel')
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue
    const file = join(dir, name)
    if (HASH_RE.test(readFileSync(file, 'utf8'))) return file
  }
  return null
}

/** Uçbirimden gizli satır okur (TTY değilse standart girdiden bir satır). */
function readSecret(prompt: string): Promise<string> {
  const { stdin, stdout } = process
  stdout.write(prompt)
  return new Promise((resolve, reject) => {
    let buf = ''
    if (!stdin.isTTY) {
      stdin.setEncoding('utf8')
      stdin.once('data', (d) => resolve(String(d).split(/\r?\n/)[0] ?? ''))
      stdin.once('error', reject)
      return
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const done = (value: string | null) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      stdout.write('\n')
      if (value === null) reject(new Error('iptal edildi'))
      else resolve(value)
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(buf)
        if (ch === '\u0003') return done(null) // Ctrl+C
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1)
        else if (ch >= ' ') buf += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const target = findTarget(root)
  if (!target) throw new Error('Varsayılan özet sabiti (DEFAULT_ADMIN_CODE_HASH) bulunamadı.')
  const code = await readSecret('Yeni yönetici kodu: ')
  const problem = codeProblem(code)
  if (problem) throw new Error(problem)
  if (process.stdin.isTTY) {
    const again = await readSecret('Yeniden yazın: ')
    if (normalizeAdminCode(again) !== normalizeAdminCode(code)) throw new Error('İki giriş aynı değil.')
  }
  const next = rewriteHash(readFileSync(target, 'utf8'), adminCodeHash(code))
  if (next === null) throw new Error('Özet sabiti güncellenemedi.')
  writeFileSync(target, next)
  process.stdout.write(
    `Özet güncellendi: ${target.slice(root.length)}\nSunucusuz sürüm için: npm run build:pages. Değişikliği depoya göndermeyi unutmayın.\n`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}
