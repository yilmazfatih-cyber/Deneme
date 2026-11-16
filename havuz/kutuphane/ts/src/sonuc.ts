/**
 * sonuc — hata fırlatmak yerine değer döndürmek için Result tipi: `{ ok: true, value }` ya da `{ ok: false, error }`.
 * Beklenen hataları (doğrulama, bulunamadı, ağ) tipte görünür kılar; `try/catch` unutulamaz.
 *
 * Kullanım:
 *   function bul(id: string): Result<Kisi, 'yok'> { return kisi ? ok(kisi) : err('yok') }
 *   const r = bul('42')
 *   if (r.ok) console.log(r.value.ad); else console.log(r.error)
 *   const ad = unwrapOr(mapOk(r, (k) => k.ad), 'bilinmiyor')
 *   const json = tryCatch(() => JSON.parse(metin))         // fırlatan kodu sarar → Result<unknown, Error>
 *   const hepsi = combine([r1, r2])                         // ilk hatada durur
 *
 * Sınırlar: Bilerek küçüktür (sınıf/zincir yok, düz nesne + işlev). Beklenmeyen hatalar (programlama hataları)
 * için yine `throw` kullanın; Result yalnız çağıranın ele alması gereken durumlar içindir.
 *
 * Genişletme: Yeni yardımcı, Result alıp Result döndüren saf bir işlev olarak eklenir; Python eşine
 * (kutuphane/sonuc.py) aynı adın snake_case biçimiyle eklenir.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E = Error> = Ok<T> | Err<E>

export class UnwrapError extends Error {
  override name = 'UnwrapError'
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

/** Başarılıysa değeri dönüştürür, hatayı olduğu gibi geçirir. */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Hatalıysa hatayı dönüştürür (ör. teknik hatayı kullanıcı iletisine çevirmek). */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error))
}

/** Başarılıysa sıradaki Result döndüren adımı çalıştırır (zincirleme). */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/** Değeri verir; hatalıysa UnwrapError fırlatır (asıl hata `cause` içinde). */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  throw new UnwrapError(`Sonuç hatalı: ${describe(result.error)}`, { cause: result.error })
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

/** İki dalı da ele alıp tek bir değere indirger. */
export function fold<T, E, R>(result: Result<T, E>, onOk: (value: T) => R, onErr: (error: E) => R): R {
  return result.ok ? onOk(result.value) : onErr(result.error)
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return Object.prototype.toString.call(error)
  }
}

function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(describe(thrown), { cause: thrown })
}

/** Fırlatabilen kodu sarar: tryCatch(() => JSON.parse(metin)). Fırlatılan değer Error değilse Error'a çevrilir. */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn())
  } catch (thrown) {
    return err(toError(thrown))
  }
}

/** Promise döndüren kodu sarar: await tryCatchAsync(() => fetch(url)). */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn())
  } catch (thrown) {
    return err(toError(thrown))
  }
}

/** Hepsi başarılıysa değer listesini, değilse İLK hatayı döndürür. */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}

/** Başarılıları ve hataları ayırır (toplu içe aktarımda raporlamak için). */
export function partition<T, E>(results: readonly Result<T, E>[]): { values: T[]; errors: E[] } {
  const values: T[] = []
  const errors: E[] = []
  for (const result of results) {
    if (result.ok) values.push(result.value)
    else errors.push(result.error)
  }
  return { values, errors }
}
