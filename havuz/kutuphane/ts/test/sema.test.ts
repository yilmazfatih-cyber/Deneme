// sema modülünün testi: JSON tanımından kurulan şemalarla ortak vektörler + tip çıkarımı ve parse davranışı.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  array,
  boolean,
  literal,
  number,
  object,
  oneOf,
  record,
  Schema,
  SchemaError,
  string,
  union,
  type Infer,
} from '../src/sema.ts'

interface VectorCase {
  girdi: unknown[]
  secenek?: Record<string, unknown>
  cikti?: unknown
  hata?: boolean
}

function loadVectors(name: string): Record<string, VectorCase[]> {
  for (const relative of [`./vektorler/${name}.json`, `../../vektorler/${name}.json`]) {
    const url = new URL(relative, import.meta.url)
    if (existsSync(url)) return JSON.parse(readFileSync(url, 'utf8')).islevler
  }
  throw new Error(`vektorler/${name}.json bulunamadı (testin yanında ya da kutuphane/vektorler altında olmalı)`)
}

/** Vektör dosyasındaki JSON tanımından şema kurar (Python testindeki build ile aynı kurallar). */
function build(spec: any): Schema<unknown> {
  let schema: Schema<unknown>
  switch (spec.tip) {
    case 'string': {
      let s = string()
      if (spec.trim) s = s.trim()
      if (spec.min !== undefined) s = s.min(spec.min)
      if (spec.max !== undefined) s = s.max(spec.max)
      if (spec.email) s = s.email()
      if (spec.regex !== undefined) s = s.regex(new RegExp(spec.regex))
      schema = s
      break
    }
    case 'number': {
      let n = number({ coerce: spec.coerce === true })
      if (spec.integer) n = n.integer()
      if (spec.min !== undefined) n = n.min(spec.min)
      if (spec.max !== undefined) n = n.max(spec.max)
      if (spec.positive) n = n.positive()
      schema = n
      break
    }
    case 'boolean':
      schema = boolean({ coerce: spec.coerce === true })
      break
    case 'literal':
      schema = literal(spec.value)
      break
    case 'oneOf':
      schema = oneOf(spec.values)
      break
    case 'array': {
      let a = array(build(spec.item))
      if (spec.min !== undefined) a = a.min(spec.min)
      if (spec.max !== undefined) a = a.max(spec.max)
      schema = a
      break
    }
    case 'object': {
      const o = object(Object.fromEntries(Object.entries(spec.shape).map(([k, v]) => [k, build(v)])))
      schema = spec.mode === 'strict' ? o.strict() : spec.mode === 'passthrough' ? o.passthrough() : o
      break
    }
    case 'union':
      schema = union(spec.options.map(build))
      break
    case 'record':
      schema = record(build(spec.value))
      break
    default:
      throw new Error(`Bilinmeyen tip: ${spec.tip}`)
  }
  if (spec.optional) schema = schema.optional()
  if (spec.nullable) schema = schema.nullable()
  if (spec.default !== undefined) schema = schema.default(spec.default)
  return schema
}

describe('ortak vektörler', () => {
  loadVectors('sema').safeParse?.forEach((testCase, index) => {
    it(`safeParse #${index + 1}: ${JSON.stringify(testCase.girdi[1])}`, () => {
      expect(build(testCase.girdi[0]).safeParse(testCase.girdi[1])).toEqual(testCase.cikti)
    })
  })
})

describe('tipler ve parse', () => {
  const Kisi = object({
    ad: string().trim().min(2),
    yas: number().integer().min(0).optional(),
    rol: oneOf(['okur', 'yazar'] as const).default('okur'),
    etiketler: array(string()).max(3),
  })

  it('tip çıkarımı: isteğe bağlı alanlar ? ile gelir', () => {
    type Kisi = Infer<typeof Kisi>
    expectTypeOf<Kisi>().toEqualTypeOf<{
      ad: string
      rol: 'okur' | 'yazar'
      etiketler: string[]
      yas?: number | undefined
    }>()
  })

  it('parse geçerliyi döndürür, geçersizde bütün sorunlarla SchemaError fırlatır', () => {
    expect(Kisi.parse({ ad: ' Ali ', etiketler: [] })).toEqual({ ad: 'Ali', rol: 'okur', etiketler: [] })
    try {
      Kisi.parse({ ad: 'A', yas: -1, etiketler: ['a', 'b', 'c', 'd'] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError)
      expect((error as SchemaError).issues.map((i) => i.path.join('.'))).toEqual(['ad', 'yas', 'etiketler'])
      expect((error as Error).message).toContain('ad: En az 2 karakter olmalı.')
    }
  })

  it('refine ve transform', () => {
    const Parola = string()
      .min(8)
      .refine((v) => /[0-9]/.test(v), 'En az bir rakam içermeli.')
      .transform((v) => v.length)
    expect(Parola.safeParse('abcdefgh')).toEqual({
      ok: false,
      issues: [{ path: [], message: 'En az bir rakam içermeli.' }],
    })
    expect(Parola.parse('abcdefg1')).toBe(8)
  })
})
