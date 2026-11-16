// Küçük, bağımlılıksız şema doğrulayıcı (Zod fikri): `s.object({ ad: s.string().min(2) })` gibi tanımlanır,
// `parse(girdi)` ya dönüştürülmüş değeri ya da yol + kod + Türkçe ileti taşıyan sorunları döndürür.
// Form girdileri dizgi olduğu için `s.number()` "3,5" ve "3.5" yazımlarını sayıya çevirir; `s.string()` baştaki
// ve sondaki boşlukları kırpar ve uzunluğu kullanıcının gördüğü karakter (grafem) sayısıyla ölçer.
// Her alan için en fazla bir ileti üretilir (ilk bozulan kural) ki kullanıcı bir seferde tek şeyi düzeltsin.
// Genişletme: yeni kural = ilgili şemaya bir yöntem + messages.ts'e bir kod. Yeni tür = `makeSchema` ile.
import { formatIssue, type IssueCode, type IssueParams } from './messages.ts'
import type { PathPart } from './path.ts'

export interface Issue {
  path: PathPart[]
  code: IssueCode
  params: IssueParams
  message: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] }

export interface Schema<T> {
  readonly kind: string
  /** İç kullanım: değeri doğrular, sorunları `issues`'a ekler, dönüştürülmüş değeri döndürür. */
  check(input: unknown, path: PathPart[], issues: Issue[]): T
  parse(input: unknown): ParseResult<T>
  /** Boş (undefined, null, boş/boşluk dizgi) değere izin verir; sonuç undefined olur. */
  optional(): Schema<T | undefined>
  /** Ek kural. `at`: iletinin bağlanacağı alt yol (ör. nesne düzeyinde "şifreler aynı mı" → ['sifreTekrar']). */
  refine(test: (value: T) => boolean, message: string, at?: PathPart[]): Schema<T>
}

type Rule<T> = (value: T) => { code: IssueCode; params?: IssueParams } | undefined

export function makeIssue(path: PathPart[], code: IssueCode, params: IssueParams = {}): Issue {
  return { path, code, params, message: formatIssue(code, params) }
}

function isBlank(input: unknown): boolean {
  return input === undefined || input === null || (typeof input === 'string' && input.trim() === '')
}

export function makeSchema<T>(kind: string, check: Schema<T>['check']): Schema<T> {
  return {
    kind,
    check,
    parse(input) {
      const issues: Issue[] = []
      const value = check(input, [], issues)
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
    },
    optional() {
      return makeSchema<T | undefined>(kind, (input, path, issues) =>
        isBlank(input) ? undefined : check(input, path, issues),
      )
    },
    refine(test, message, at = []) {
      return makeSchema<T>(kind, (input, path, issues) => {
        const before = issues.length
        const value = check(input, path, issues)
        if (issues.length === before && !test(value)) issues.push(makeIssue([...path, ...at], 'custom', { message }))
        return value
      })
    },
  }
}

function applyRules<T>(value: T, rules: readonly Rule<T>[], path: PathPart[], issues: Issue[]): void {
  for (const rule of rules) {
    const problem = rule(value)
    if (problem) {
      issues.push(makeIssue(path, problem.code, problem.params))
      return
    }
  }
}

const segmenter = new Intl.Segmenter('tr', { granularity: 'grapheme' })
/** Kullanıcının gördüğü karakter sayısı: "👍🏽" ve "é" (e + birleşik işaret) birer karakterdir. */
export function graphemeLength(text: string): number {
  let count = 0
  for (const _ of segmenter.segment(text)) count++
  return count
}

export interface StringSchema extends Schema<string> {
  min(length: number): StringSchema
  max(length: number): StringSchema
  email(): StringSchema
  pattern(regex: RegExp, message: string): StringSchema
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u

export function string(rules: readonly Rule<string>[] = []): StringSchema {
  const base = makeSchema<string>('string', (input, path, issues) => {
    if (typeof input !== 'string' && input !== undefined && input !== null) {
      issues.push(makeIssue(path, 'type'))
      return ''
    }
    const value = (input ?? '').trim()
    if (value === '') issues.push(makeIssue(path, 'required'))
    else applyRules(value, rules, path, issues)
    return value
  })
  return {
    ...base,
    min: (min) =>
      string([...rules, (v) => (graphemeLength(v) < min ? { code: 'too_short', params: { min } } : undefined)]),
    max: (max) =>
      string([...rules, (v) => (graphemeLength(v) > max ? { code: 'too_long', params: { max } } : undefined)]),
    email: () => string([...rules, (v) => (EMAIL.test(v) ? undefined : { code: 'email' })]),
    pattern: (regex, message) =>
      string([...rules, (v) => (regex.test(v) ? undefined : { code: 'pattern', params: { message } })]),
  }
}

export interface NumberSchema extends Schema<number> {
  min(min: number): NumberSchema
  max(max: number): NumberSchema
  int(): NumberSchema
}

/** "3,5" / "3.5" / " 42 " → sayı; binlik ayraçlı ya da harfli yazımlar reddedilir (belirsiz olduğu için). */
export function toNumber(input: unknown): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined
  if (typeof input !== 'string') return undefined
  const text = input.trim()
  if (!/^[+-]?\d+([.,]\d+)?$/.test(text)) return undefined
  return Number(text.replace(',', '.'))
}

export function number(rules: readonly Rule<number>[] = []): NumberSchema {
  const base = makeSchema<number>('number', (input, path, issues) => {
    if (isBlank(input)) {
      issues.push(makeIssue(path, 'required'))
      return 0
    }
    const value = toNumber(input)
    if (value === undefined) {
      issues.push(makeIssue(path, 'number'))
      return 0
    }
    applyRules(value, rules, path, issues)
    return value
  })
  return {
    ...base,
    min: (min) => number([...rules, (v) => (v < min ? { code: 'too_small', params: { min } } : undefined)]),
    max: (max) => number([...rules, (v) => (v > max ? { code: 'too_big', params: { max } } : undefined)]),
    int: () => number([...rules, (v) => (Number.isInteger(v) ? undefined : { code: 'integer' })]),
  }
}

export function boolean(): Schema<boolean> {
  return makeSchema('boolean', (input, path, issues) => {
    if (typeof input === 'boolean') return input
    issues.push(makeIssue(path, input === undefined ? 'required' : 'type'))
    return false
  })
}

export function enumOf<const V extends string>(values: readonly V[]): Schema<V> {
  return makeSchema('enum', (input, path, issues) => {
    if (isBlank(input)) issues.push(makeIssue(path, 'required'))
    else if (!values.includes(input as V)) issues.push(makeIssue(path, 'enum', { values }))
    return input as V
  })
}

type Shape = Record<string, Schema<unknown>>
export type Infer<S> = S extends Schema<infer T> ? T : never
type ObjectValue<S extends Shape> = { [K in keyof S]: Infer<S[K]> }

/** Nesne: bilinmeyen alanlar atılır; her alanın sorunu kendi yoluyla raporlanır. */
export function object<S extends Shape>(shape: S): Schema<ObjectValue<S>> & { shape: S } {
  const schema = makeSchema<ObjectValue<S>>('object', (input, path, issues) => {
    const source =
      typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
    if (source !== input) issues.push(makeIssue(path, 'type'))
    const out: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(shape)) out[key] = field.check(source[key], [...path, key], issues)
    return out as ObjectValue<S>
  })
  return { ...schema, shape }
}

export interface ArraySchema<T> extends Schema<T[]> {
  min(length: number): ArraySchema<T>
  max(length: number): ArraySchema<T>
}

export function array<T>(item: Schema<T>, rules: readonly Rule<T[]>[] = []): ArraySchema<T> {
  const base = makeSchema<T[]>('array', (input, path, issues) => {
    const list = Array.isArray(input) ? (input as unknown[]) : []
    if (!Array.isArray(input) && input !== undefined) issues.push(makeIssue(path, 'type'))
    const out = list.map((value, index) => item.check(value, [...path, index], issues))
    applyRules(out, rules, path, issues)
    return out
  })
  return {
    ...base,
    min: (min) =>
      array(item, [...rules, (v) => (v.length < min ? { code: 'array_too_short', params: { min } } : undefined)]),
    max: (max) =>
      array(item, [...rules, (v) => (v.length > max ? { code: 'array_too_long', params: { max } } : undefined)]),
  }
}

/** Kısa yol: `import { s } from './schema.ts'` → `s.object({ ad: s.string().min(2) })`. */
export const s = { string, number, boolean, enumOf, object, array }
