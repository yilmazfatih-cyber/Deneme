/**
 * sema — bağımlılıksız küçük şema doğrulayıcı (Zod'un çok küçük bir alt kümesi; Zod/Pydantic kurulamayan yerler,
 * ör. tek dosyalık betikler, eklentiler için). Türkçe hata iletileri, alan yolu, tip çıkarımı (Infer).
 *
 * Kullanım:
 *   const Kisi = object({ ad: string().trim().min(2), yas: number().integer().min(0).optional(), eposta: string().email() })
 *   type Kisi = Infer<typeof Kisi>                        // { ad: string; eposta: string; yas?: number }
 *   const r = Kisi.safeParse(govde)                       // { ok: true, value } | { ok: false, issues: [{ path, message }] }
 *   const ayar = object({ PORT: number({ coerce: true }).default(8080), DEBUG: boolean({ coerce: true }).default(false) })
 *   ayar.parse(process.env)                               // ortam değişkenleri: "8080" → 8080, "evet" → true
 *
 * Davranış: Nesnede tanımsız alanlar varsayılan olarak ATILIR (`strict()` → hata, `passthrough()` → korunur).
 * Hata birikir: bütün sorunlar birlikte raporlanır. `transform` yalnız doğrulama başarılıysa çalışır.
 * Zorlama (coerce): number → Number(metin) (nokta ondalık); boolean → true/1/evet/yes/on, false/0/hayır/no/off/"".
 *
 * Sınırlar: Bilerek küçüktür: tarih, bigint, kesişim (intersection), ayrık birleşim (discriminated union),
 * tembel/özyinelemeli şema, eşzamansız doğrulama YOKTUR. İleti dili Türkçedir; çok dillilik yoktur. Zod
 * kurulabiliyorsa Zod kullanın (havuz standardı).
 *
 * Genişletme: Yeni tür bir `Schema` alt sınıfıdır (run yöntemi); yeni kural mevcut sınıfa `refineWith` ile eklenir.
 * Python eşine (kutuphane/sema.py) aynı ileti metniyle eklenir ve `vektorler/sema.json`'a örnek yazılır.
 */

export interface Issue {
  path: (string | number)[]
  message: string
}

export type SafeParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] }

export class SchemaError extends Error {
  override name = 'SchemaError'
  readonly issues: Issue[]

  constructor(issues: Issue[]) {
    super(issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(kök)'}: ${i.message}`).join('\n'))
    this.issues = issues
  }
}

const INVALID: unique symbol = Symbol('INVALID')
type Out<T> = T | typeof INVALID
type Runner<T> = (value: unknown, path: (string | number)[], issues: Issue[]) => Out<T>

export type Infer<S> = S extends Schema<infer T> ? T : never

export class Schema<T> {
  /** @internal */ readonly run: Runner<T>
  /** @internal */ readonly acceptsUndefined: boolean

  constructor(run: Runner<T>, acceptsUndefined = false) {
    this.run = run
    this.acceptsUndefined = acceptsUndefined
  }

  /** Doğrular; geçersizse bütün sorunları içeren SchemaError fırlatır. */
  parse(value: unknown): T {
    const result = this.safeParse(value)
    if (!result.ok) throw new SchemaError(result.issues)
    return result.value
  }

  /** Doğrular; hata fırlatmaz. */
  safeParse(value: unknown): SafeParseResult<T> {
    const issues: Issue[] = []
    const out = this.run(value, [], issues)
    return out === INVALID || issues.length > 0 ? { ok: false, issues } : { ok: true, value: out }
  }

  optional(): Schema<T | undefined> {
    return new Schema<T | undefined>((value, path, issues) => (value === undefined ? undefined : this.run(value, path, issues)), true)
  }

  nullable(): Schema<T | null> {
    return new Schema<T | null>((value, path, issues) => (value === null ? null : this.run(value, path, issues)), this.acceptsUndefined)
  }

  /** Değer yoksa (undefined) `fallback` kullanılır. */
  default(fallback: T): Schema<T> {
    return new Schema<T>((value, path, issues) => (value === undefined ? fallback : this.run(value, path, issues)), true)
  }

  /** Ek kural: `predicate` false dönerse `message` ile hata. */
  refine(predicate: (value: T) => boolean, message: string): Schema<T> {
    return new Schema<T>((value, path, issues) => {
      const out = this.run(value, path, issues)
      if (out === INVALID) return INVALID
      if (!predicate(out)) {
        issues.push({ path: [...path], message })
        return INVALID
      }
      return out
    }, this.acceptsUndefined)
  }

  /** Doğrulanmış değeri dönüştürür (ör. metni Date'e). */
  transform<U>(fn: (value: T) => U): Schema<U> {
    return new Schema<U>((value, path, issues) => {
      const out = this.run(value, path, issues)
      return out === INVALID ? INVALID : fn(out)
    }, this.acceptsUndefined)
  }
}

function required(value: unknown, path: (string | number)[], issues: Issue[]): boolean {
  if (value !== undefined) return true
  issues.push({ path: [...path], message: 'Zorunlu alan.' })
  return false
}

type Check<T> = { test: (value: T) => boolean; message: string }

export class StringSchema extends Schema<string> {
  private readonly checks: readonly Check<string>[]
  private readonly trimFirst: boolean

  constructor(checks: readonly Check<string>[] = [], trimFirst = false) {
    super((value, path, issues) => {
      if (!required(value, path, issues)) return INVALID
      if (typeof value !== 'string') {
        issues.push({ path: [...path], message: 'Metin bekleniyordu.' })
        return INVALID
      }
      const text = trimFirst ? value.trim() : value
      const failed = checks.find((check) => !check.test(text))
      if (failed !== undefined) {
        issues.push({ path: [...path], message: failed.message })
        return INVALID
      }
      return text
    })
    this.checks = checks
    this.trimFirst = trimFirst
  }

  private with(check: Check<string>): StringSchema {
    return new StringSchema([...this.checks, check], this.trimFirst)
  }

  /** Denetimden önce baştaki/sondaki boşlukları atar. */
  trim(): StringSchema {
    return new StringSchema(this.checks, true)
  }

  min(length: number, message = `En az ${length} karakter olmalı.`): StringSchema {
    return this.with({ test: (v) => Array.from(v).length >= length, message })
  }

  max(length: number, message = `En çok ${length} karakter olmalı.`): StringSchema {
    return this.with({ test: (v) => Array.from(v).length <= length, message })
  }

  nonempty(message = 'Boş bırakılamaz.'): StringSchema {
    return this.with({ test: (v) => v.length > 0, message })
  }

  regex(pattern: RegExp, message = 'Biçim geçersiz.'): StringSchema {
    return this.with({ test: (v) => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(v), message })
  }

  /** Pragmatik e-posta biçimi (yerel@alan.uzantı; boşluksuz). */
  email(message = 'Geçerli bir e-posta adresi değil.'): StringSchema {
    return this.with({ test: (v) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v), message })
  }

  oneOf(values: readonly string[], message = `Şunlardan biri olmalı: ${values.join(', ')}.`): StringSchema {
    return this.with({ test: (v) => values.includes(v), message })
  }
}

/** Zorlamada kabul edilen sayı yazımı (Python eşiyle aynı): 12, -3.5, .5, 1e3. Onaltılık, Infinity, boşluk yok. */
const NUMERIC = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$/

export class NumberSchema extends Schema<number> {
  private readonly checks: readonly Check<number>[]
  private readonly coerce: boolean

  constructor(checks: readonly Check<number>[] = [], coerce = false) {
    super((value, path, issues) => {
      if (!required(value, path, issues)) return INVALID
      let number = value
      if (coerce && typeof value === 'string' && NUMERIC.test(value.trim())) number = Number(value.trim())
      if (typeof number !== 'number' || !Number.isFinite(number)) {
        issues.push({ path: [...path], message: 'Sayı bekleniyordu.' })
        return INVALID
      }
      const failed = checks.find((check) => !check.test(number))
      if (failed !== undefined) {
        issues.push({ path: [...path], message: failed.message })
        return INVALID
      }
      return number
    })
    this.checks = checks
    this.coerce = coerce
  }

  private with(check: Check<number>): NumberSchema {
    return new NumberSchema([...this.checks, check], this.coerce)
  }

  integer(message = 'Tam sayı olmalı.'): NumberSchema {
    return this.with({ test: (v) => Number.isInteger(v), message })
  }

  min(minimum: number, message = `En az ${minimum} olmalı.`): NumberSchema {
    return this.with({ test: (v) => v >= minimum, message })
  }

  max(maximum: number, message = `En çok ${maximum} olmalı.`): NumberSchema {
    return this.with({ test: (v) => v <= maximum, message })
  }

  positive(message = 'Sıfırdan büyük olmalı.'): NumberSchema {
    return this.with({ test: (v) => v > 0, message })
  }
}

export class ArraySchema<T> extends Schema<T[]> {
  private readonly item: Schema<T>
  private readonly checks: readonly Check<unknown[]>[]

  constructor(item: Schema<T>, checks: readonly Check<unknown[]>[] = []) {
    super((value, path, issues) => {
      if (!required(value, path, issues)) return INVALID
      if (!Array.isArray(value)) {
        issues.push({ path: [...path], message: 'Liste bekleniyordu.' })
        return INVALID
      }
      const failed = checks.find((check) => !check.test(value))
      if (failed !== undefined) {
        issues.push({ path: [...path], message: failed.message })
        return INVALID
      }
      let valid = true
      const out = value.map((element, index) => {
        const parsed = item.run(element, [...path, index], issues)
        if (parsed === INVALID) valid = false
        return parsed
      })
      return valid ? (out as T[]) : INVALID
    })
    this.item = item
    this.checks = checks
  }

  min(length: number, message = `En az ${length} öğe olmalı.`): ArraySchema<T> {
    return new ArraySchema(this.item, [...this.checks, { test: (v) => v.length >= length, message }])
  }

  max(length: number, message = `En çok ${length} öğe olmalı.`): ArraySchema<T> {
    return new ArraySchema(this.item, [...this.checks, { test: (v) => v.length <= length, message }])
  }
}

type Shape = Record<string, Schema<unknown>>
type OptionalKeys<S extends Shape> = { [K in keyof S]: undefined extends Infer<S[K]> ? K : never }[keyof S]
type ObjectOutput<S extends Shape> = { [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]> } & {
  [K in OptionalKeys<S>]?: Infer<S[K]>
}
type Simplify<T> = { [K in keyof T]: T[K] } & {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class ObjectSchema<S extends Shape> extends Schema<Simplify<ObjectOutput<S>>> {
  private readonly shape: S

  constructor(shape: S, mode: 'strip' | 'strict' | 'passthrough' = 'strip') {
    super((value, path, issues) => {
      if (!required(value, path, issues)) return INVALID
      if (!isRecord(value)) {
        issues.push({ path: [...path], message: 'Nesne bekleniyordu.' })
        return INVALID
      }
      let valid = true
      const out: Record<string, unknown> = mode === 'passthrough' ? { ...value } : {}
      for (const [key, schema] of Object.entries(shape)) {
        const present = Object.prototype.hasOwnProperty.call(value, key)
        const parsed = schema.run(present ? value[key] : undefined, [...path, key], issues)
        if (parsed === INVALID) valid = false
        else if (parsed !== undefined || present) out[key] = parsed
      }
      if (mode === 'strict') {
        for (const key of Object.keys(value)) {
          if (!(key in shape)) {
            issues.push({ path: [...path, key], message: 'Beklenmeyen alan.' })
            valid = false
          }
        }
      }
      return valid ? (out as Simplify<ObjectOutput<S>>) : INVALID
    })
    this.shape = shape
  }

  /** Şemada olmayan alan hata sayılır. */
  strict(): ObjectSchema<S> {
    return new ObjectSchema(this.shape, 'strict')
  }

  /** Şemada olmayan alanlar olduğu gibi korunur. */
  passthrough(): ObjectSchema<S> {
    return new ObjectSchema(this.shape, 'passthrough')
  }
}

export function string(): StringSchema {
  return new StringSchema()
}

export function number(options: { coerce?: boolean } = {}): NumberSchema {
  return new NumberSchema([], options.coerce === true)
}

const TRUE_WORDS = ['true', '1', 'evet', 'yes', 'on']
const FALSE_WORDS = ['false', '0', 'hayır', 'hayir', 'no', 'off', '']

export function boolean(options: { coerce?: boolean } = {}): Schema<boolean> {
  return new Schema<boolean>((value, path, issues) => {
    if (!required(value, path, issues)) return INVALID
    if (typeof value === 'boolean') return value
    if (options.coerce === true && typeof value === 'string') {
      const word = value.trim().toLowerCase() // harf: yalnız ASCII sözcüklerle karşılaştırılır
      if (TRUE_WORDS.includes(word)) return true
      if (FALSE_WORDS.includes(word)) return false
    }
    issues.push({ path: [...path], message: 'Evet/hayır (true/false) bekleniyordu.' })
    return INVALID
  })
}

export function literal<const T extends string | number | boolean | null>(expected: T): Schema<T> {
  return new Schema<T>((value, path, issues) => {
    if (value === expected) return expected
    issues.push({ path: [...path], message: `${JSON.stringify(expected)} bekleniyordu.` })
    return INVALID
  })
}

/** Sabit seçeneklerden biri: oneOf(['taslak', 'yayında']). */
export function oneOf<const T extends readonly (string | number)[]>(values: T): Schema<T[number]> {
  return new Schema<T[number]>((value, path, issues) => {
    if (!required(value, path, issues)) return INVALID
    if ((values as readonly unknown[]).includes(value)) return value as T[number]
    issues.push({ path: [...path], message: `Şunlardan biri olmalı: ${values.join(', ')}.` })
    return INVALID
  })
}

export function array<T>(item: Schema<T>): ArraySchema<T> {
  return new ArraySchema(item)
}

export function object<S extends Shape>(shape: S): ObjectSchema<S> {
  return new ObjectSchema(shape)
}

/** Seçeneklerden ilk tutan; hiçbiri tutmazsa tek bir ileti. */
export function union<T extends readonly Schema<unknown>[]>(options: T): Schema<Infer<T[number]>> {
  return new Schema<Infer<T[number]>>((value, path, issues) => {
    for (const option of options) {
      const scratch: Issue[] = []
      const out = option.run(value, path, scratch)
      if (out !== INVALID && scratch.length === 0) return out as Infer<T[number]>
    }
    issues.push({ path: [...path], message: 'Seçeneklerin hiçbirine uymuyor.' })
    return INVALID
  }, options.some((option) => option.acceptsUndefined))
}

/** Anahtarları metin, değerleri aynı şemaya uyan sözlük. */
export function record<T>(valueSchema: Schema<T>): Schema<Record<string, T>> {
  return new Schema<Record<string, T>>((value, path, issues) => {
    if (!required(value, path, issues)) return INVALID
    if (!isRecord(value)) {
      issues.push({ path: [...path], message: 'Nesne bekleniyordu.' })
      return INVALID
    }
    let valid = true
    const out: Record<string, T> = {}
    for (const [key, element] of Object.entries(value)) {
      const parsed = valueSchema.run(element, [...path, key], issues)
      if (parsed === INVALID) valid = false
      else out[key] = parsed
    }
    return valid ? out : INVALID
  })
}
