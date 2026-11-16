/**
 * sayfalama — imleçli (keyset) ve sayfa numaralı (offset) sayfalama yardımcıları: imleci opak bir metne kodlama/
 * çözme, bellekteki sıralı listeyi imleçle sayfalama, SQL için güvenli "sonrakiler" koşulu üretme.
 *
 * Kullanım:
 *   const imlec = encodeCursor({ createdAt: '2026-11-16T10:00:00Z', id: 42 })   // "eyJjcmVh…" (URL güvenli)
 *   decodeCursor(imlec, { keys: ['createdAt', 'id'] })                           // { createdAt: …, id: 42 }
 *   const { clause, params } = keysetWhere(['created_at', 'id'], ['2026-11-16T10:00:00Z', 42])
 *   // clause: "(created_at > ?) OR (created_at = ? AND id > ?)"   → WHERE … ORDER BY created_at, id LIMIT 21
 *   paginate(kayitlar, { limit: 20, cursor, sortKeys: ['tarih', 'id'] })        // { items, nextCursor, hasMore }
 *   offsetPagination({ total: 95, page: 3, pageSize: 20 })                       // { offset: 40, totalPages: 5, … }
 *
 * Neden imleç: OFFSET büyük sayfalarda yavaşlar ve araya kayıt eklenince satır atlar/yineler; imleç (son görülen
 * kaydın sıralama anahtarı) ikisini de önler. Sıralama anahtarı TEKİL olmalıdır: son sütun olarak `id` ekleyin.
 *
 * Sınırlar: İmleç İMZASIZDIR (base64url JSON); kullanıcı çözebilir ve değiştirebilir. Sunucu yine yetki denetimi
 * yapmalı; kurcalamaya karşı gerekiyorsa kripto.signToken ile imzalayın. İmleç değerleri metin, tam sayı, mantıksal
 * ya da null olmalıdır (kesirli sayı JS ve Python'da farklı yazılır). `keysetWhere` yalnız artan ya da yalnız azalan
 * sıralamayı destekler (karışık yön yok).
 *
 * Genişletme: Yeni bir sayfalama biçimi saf işlev olarak eklenir; Python eşine (kutuphane/sayfalama.py) aynı
 * çıktıyı verecek biçimde eklenir ve `vektorler/sayfalama.json`'a örnek yazılır.
 */

export type CursorValue = string | number | boolean | null
export type Cursor = Record<string, CursorValue>

export interface Page<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface KeysetCondition {
  clause: string
  params: CursorValue[]
}

export interface OffsetPage {
  page: number
  pageSize: number
  totalPages: number
  offset: number
  hasPrevious: boolean
  hasNext: boolean
}

export class CursorError extends Error {
  override name = 'CursorError'
}

const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** İmleç nesnesini URL güvenli opak metne çevirir. */
export function encodeCursor(values: Cursor): string {
  for (const [key, value] of Object.entries(values)) {
    const ok = value === null || ['string', 'boolean'].includes(typeof value) || Number.isSafeInteger(value)
    if (!ok) throw new CursorError(`İmleç değeri "${key}" metin, tam sayı, mantıksal ya da null olmalı.`)
  }
  return base64Url(encoder.encode(JSON.stringify(values)))
}

/** Opak imleci çözer; bozuksa ya da beklenen anahtarlar yoksa CursorError. */
export function decodeCursor(cursor: string, options: { keys?: readonly string[] } = {}): Cursor {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length % 4 === 1 || cursor.length > 4096) {
    throw new CursorError('İmleç bozuk: yalnız base64url karakterleri içermeli.')
  }
  let parsed: unknown
  try {
    const binary = atob(cursor.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (cursor.length % 4)) % 4))
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    )
  } catch {
    throw new CursorError('İmleç çözülemedi.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new CursorError('İmleç bir nesne olmalı.')
  const cursorObject = parsed as Cursor
  for (const key of options.keys ?? []) {
    if (!(key in cursorObject)) throw new CursorError(`İmleçte "${key}" alanı yok.`)
  }
  return cursorObject
}

function compareValues(a: CursorValue | undefined, b: CursorValue | undefined): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1 // null en başta (SQL'de NULLS FIRST gibi)
  if (b === null || b === undefined) return 1
  return a < b ? -1 : 1
}

/**
 * Bellekteki, `sortKeys`'e göre ARTAN sıralı listeyi imleçle sayfalar. `cursor` son görülen kaydın imlecidir.
 * Dönen `nextCursor` sonraki sayfa için kullanılır; son sayfada null.
 */
export function paginate<T extends Record<string, unknown>>(
  items: readonly T[],
  options: { limit: number; cursor?: string | null; sortKeys: readonly string[] },
): Page<T> {
  if (!Number.isInteger(options.limit) || options.limit < 1)
    throw new CursorError('limit 1 veya daha büyük tam sayı olmalı.')
  let start = 0
  if (options.cursor) {
    const after = decodeCursor(options.cursor, { keys: options.sortKeys })
    start = items.findIndex((item) => {
      for (const key of options.sortKeys) {
        const order = compareValues(item[key] as CursorValue, after[key])
        if (order !== 0) return order > 0
      }
      return false
    })
    if (start === -1) start = items.length
  }
  const page = items.slice(start, start + options.limit)
  const hasMore = start + options.limit < items.length
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last !== undefined
      ? encodeCursor(Object.fromEntries(options.sortKeys.map((key) => [key, last[key] as CursorValue])))
      : null
  return { items: page, nextCursor, hasMore }
}

/**
 * SQL için "imleçten sonraki kayıtlar" koşulu (parametreli; değerler asla metne gömülmez).
 * ['a', 'b'] + [1, 2] → "(a > ?) OR (a = ? AND b > ?)", [1, 1, 2]. Azalan sıralama için direction: 'desc'.
 */
export function keysetWhere(
  columns: readonly string[],
  values: readonly CursorValue[],
  options: { direction?: 'asc' | 'desc'; placeholder?: (index: number) => string } = {},
): KeysetCondition {
  if (columns.length === 0 || columns.length !== values.length) {
    throw new CursorError('Sütun ve değer sayısı eşit ve sıfırdan büyük olmalı.')
  }
  for (const column of columns) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(column)) {
      throw new CursorError(`Geçersiz sütun adı: "${column}" (yalnız harf, rakam, alt çizgi; SQL enjeksiyonu önlemi).`)
    }
  }
  const op = options.direction === 'desc' ? '<' : '>'
  const placeholder = options.placeholder ?? (() => '?')
  const params: CursorValue[] = []
  const branches = columns.map((column, i) => {
    const parts: string[] = []
    for (let j = 0; j < i; j++) {
      params.push(values[j] ?? null)
      parts.push(`${columns[j]} = ${placeholder(params.length)}`)
    }
    params.push(values[i] ?? null)
    parts.push(`${column} ${op} ${placeholder(params.length)}`)
    return `(${parts.join(' AND ')})`
  })
  return { clause: branches.join(' OR '), params }
}

/** Sayfa numaralı sayfalama hesabı; sayfa 1'den başlar ve geçerli aralığa sıkıştırılır. */
export function offsetPagination(options: { total: number; page: number; pageSize: number }): OffsetPage {
  const { total, pageSize } = options
  if (!Number.isInteger(total) || total < 0) throw new CursorError('total 0 veya daha büyük tam sayı olmalı.')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new CursorError('pageSize 1 ile 1000 arasında tam sayı olmalı.')
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, Math.floor(Number.isFinite(options.page) ? options.page : 1)), totalPages)
  return {
    page,
    pageSize,
    totalPages,
    offset: (page - 1) * pageSize,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  }
}
