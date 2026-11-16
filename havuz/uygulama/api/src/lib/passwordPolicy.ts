/**
 * Yeni şifre kuralları (NIST 800-63B çizgisi): uzunluk şemada denetlenir (shared → newPasswordSchema, 10–128);
 * burada yalnız "tahmin edilmesi kolay" şifreler reddedilir. Karakter türü zorunluluğu YOKTUR (bilerek).
 *
 * Reddedilenler:
 *  1. common-passwords.txt listesindekiler (kaynak ve lisans dosyanın başında),
 *  2. yaygın bir sözcük + yalnız rakam/işaret (galatasaray1905, Şifre2026!, 123parola),
 *  3. tek karakter ya da iki karakterin yinelenmesi (aaaaaaaaaa, 1212121212), düz diziler (0123456789, abcdefghij),
 *  4. hiç harf içermeyenler (telefon numarası, doğum tarihi gibi yalnız rakamlı şifreler kolay tahmin edilir),
 *  5. kullanıcının e-posta adının (@ öncesi) ya da adının bir parçasını (4+ harf) içerenler.
 * Karşılaştırmalar foldTr ile yapılır: büyük/küçük harf ve Türkçe işaret (ş/s, ı/i…) fark etmez.
 *
 * Genişletme: yeni bir kural eklerken `checkPassword` içine bir satır ve test/password.test.ts'e iki örnek
 * (reddedilen + kabul edilen) ekleyin.
 */
import { readFileSync } from 'node:fs'
import { foldTr } from '@uygulama/shared'
import { MESSAGES } from '../messages.ts'

function loadList(): Set<string> {
  const text = readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
  return new Set(entries.map((entry) => foldTr(entry)))
}

const COMMON = loadList()

/** Başına/sonuna rakam ya da işaret eklenince de reddedilecek sözcükler (foldTr uygulanmış hâlde). */
export const BASE_WORDS = new Set([
  'sifre',
  'sifrem',
  'parola',
  'parolam',
  'password',
  'passw0rd',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'admin',
  'welcome',
  'letmein',
  'iloveyou',
  'seviyorum',
  'seniseviyorum',
  'sevgilim',
  'askim',
  'hayatim',
  'canim',
  'bebegim',
  'galatasaray',
  'cimbom',
  'cimbombom',
  'fenerbahce',
  'besiktas',
  'trabzonspor',
  'karakartal',
  'turkiye',
  'istanbul',
  'ankara',
  'izmir',
  'ataturk',
  'mustafakemal',
  'allah',
  'bismillah',
])

function isRepetitive(folded: string): boolean {
  if (new Set(folded).size <= 2) return true
  const codes = [...folded].map((char) => char.codePointAt(0) ?? 0)
  const step = (codes[1] ?? 0) - (codes[0] ?? 0)
  if (step !== 1 && step !== -1) return false
  return codes.every((code, index) => index === 0 || code - (codes[index - 1] ?? 0) === step)
}

function containsIdentity(folded: string, identity: { email?: string; name?: string }): boolean {
  const parts: string[] = []
  const local = identity.email?.split('@')[0]
  if (local) parts.push(...foldTr(local).split(/[^\p{L}\p{N}]+/u))
  if (identity.name) parts.push(...foldTr(identity.name).split(/[^\p{L}\p{N}]+/u))
  return parts.some((part) => part.length >= 4 && folded.includes(part))
}

export type PasswordCheck = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** Şifre yeterince güçlü mü? Uzunluk denetimi şemadadır; bu işlev uzunluğu geçmiş şifreye uygulanır. */
export function checkPassword(password: string, identity: { email?: string; name?: string } = {}): PasswordCheck {
  const folded = foldTr(password.normalize('NFC'))
  // Baştaki ve sondaki harf dışı karakterler atılınca kalan "öz": galatasaray1905! → galatasaray
  const core = folded.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
  if (core === '') return { ok: false, message: MESSAGES.noLetters }
  if (COMMON.has(folded) || BASE_WORDS.has(core) || isRepetitive(folded)) {
    return { ok: false, message: MESSAGES.commonPassword }
  }
  if (containsIdentity(folded, identity)) return { ok: false, message: MESSAGES.passwordLikeIdentity }
  return { ok: true }
}

/** Listedeki parola sayısı (test ve belge için). */
export function commonPasswordCount(): number {
  return COMMON.size
}
