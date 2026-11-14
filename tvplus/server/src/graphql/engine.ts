/**
 * Kalıcı sorgu GraphQL motoru (Netflix `web.prod.cloud.netflix.com/graphql` deseni).
 * İstemci sorgu metni yollamaz; yalnızca `{ id, version }`. Ham sorgu, bilinmeyen kimlik ve sürüm uyuşmazlığı
 * 400 ile reddedilir. Yetki, işlemin kök alan adlarına göre denetlenir; mutasyonlar ayrıca authURL ister.
 *
 * Fabrika biçimindedir (`createGraphQLEngine`): gerçek şema olmadan küçük bir şemayla birim testi yapılabilir.
 */
import {
  GraphQLError,
  Kind,
  buildSchema,
  execute,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
  parse,
  validate,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
} from 'graphql'
import type { GqlContext, Passport, ResolverMap } from '../kernel/context'

export interface PersistedOperation {
  name: string
  type: string
  document: string
}
export interface PersistedRegistry {
  version: number
  operations: Record<string, PersistedOperation>
}

export interface GraphQLEngineOptions {
  typeDefs: string
  resolvers: ResolverMap
  /** null → kayıt defteri yüklenemedi; her istek PERSISTED_QUERY_NOT_FOUND alır. */
  persisted: PersistedRegistry | null
  /** Anonim ve profilsiz çalışabilen kök alanlar. */
  publicRootFields?: readonly string[]
  /** Uyarı/hata günlüğü (gerçek hata metni yalnız buraya yazılır). */
  log?: (level: 'warn' | 'error', msg: string, detail?: unknown) => void
}

export interface GqlFormattedError {
  message: string
  path?: readonly (string | number)[]
  extensions: { code: string }
}
export interface GqlResponseBody {
  data?: unknown
  errors?: GqlFormattedError[]
}
export interface GqlResult {
  statusCode: number
  body: GqlResponseBody
  /** Kayıt defterindeki işlem adı (yanıt başlığı için); çözülemediyse null */
  operationName: string | null
}

export interface GqlRequestInput {
  body: unknown
  passport: Passport
  /** İstek bağlamını üretir (her istekte yeni `cache`). */
  makeContext: () => GqlContext
}

export interface GraphQLEngine {
  schema: GraphQLSchema
  handle(input: GqlRequestInput): Promise<GqlResult>
}

const DEFAULT_PUBLIC = ['membershipStatus', 'interstitial'] as const
const GENERIC_MESSAGE = 'Beklenmeyen bir hata oluştu.'

/* ───────────── DateTime skaleri ───────────── */

function toIso(value: unknown): string {
  const d =
    value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) throw new TypeError('DateTime değeri geçersiz')
  return d.toISOString()
}
function parseIso(value: unknown): Date {
  if (typeof value !== 'string') throw new TypeError('DateTime ISO dizgesi olmalı')
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new TypeError('DateTime ISO dizgesi olmalı')
  return d
}

/* ───────────── Şema kurulumu ───────────── */

function attachResolvers(schema: GraphQLSchema, resolvers: ResolverMap, log: GraphQLEngineOptions['log']): void {
  for (const [typeName, fields] of Object.entries(resolvers)) {
    const type = schema.getType(typeName)
    if (!type) {
      log?.('warn', `Çözümleyici şemada olmayan tipe ait: ${typeName}`)
      continue
    }
    if (isObjectType(type)) {
      const fieldMap = type.getFields()
      for (const [fieldName, fn] of Object.entries(fields)) {
        if (fieldName === '__isTypeOf') {
          type.isTypeOf = (value, ctx) => Boolean(fn(value, {}, ctx as GqlContext))
          continue
        }
        const field = fieldMap[fieldName]
        if (!field) {
          log?.('warn', `Çözümleyici şemada olmayan alana ait: ${typeName}.${fieldName}`)
          continue
        }
        field.resolve = (source, args, ctx) => fn(source, args, ctx as GqlContext)
      }
    } else if (isInterfaceType(type) || isUnionType(type)) {
      const fn = fields.__resolveType
      if (fn) {
        // Sözleşme: ResolverFn(parent, args, ctx) — args boş nesnedir.
        type.resolveType = async (value, ctx) => {
          const r = await fn(value, {}, ctx as GqlContext)
          return typeof r === 'string' ? r : undefined
        }
      }
    } else if (!isScalarType(type)) {
      log?.('warn', `Çözümleyici desteklenmeyen tipe ait: ${typeName}`)
    }
  }

  const dt = schema.getType('DateTime')
  if (dt && isScalarType(dt)) {
    dt.serialize = toIso
    dt.parseValue = parseIso
    dt.parseLiteral = (ast: ValueNode) => {
      if (ast.kind !== Kind.STRING) throw new TypeError('DateTime ISO dizgesi olmalı')
      return parseIso(ast.value)
    }
  }
}

/* ───────────── Belge çözümleme ───────────── */

interface PreparedOperation {
  name: string
  operation: 'query' | 'mutation' | 'subscription'
  document: DocumentNode
  rootFields: string[]
}

function collectRootFields(
  set: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  out: Set<string>,
  seen: Set<string>,
): void {
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) out.add(sel.name.value)
    else if (sel.kind === Kind.INLINE_FRAGMENT) collectRootFields(sel.selectionSet, fragments, out, seen)
    else if (sel.kind === Kind.FRAGMENT_SPREAD && !seen.has(sel.name.value)) {
      seen.add(sel.name.value)
      const frag = fragments.get(sel.name.value)
      if (frag) collectRootFields(frag.selectionSet, fragments, out, seen)
    }
  }
}

class RequestError extends Error {
  statusCode: number
  code: string
  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const fail = (statusCode: number, code: string, message: string): GqlResult => ({
  statusCode,
  body: { errors: [{ message, extensions: { code } }] },
  operationName: null,
})

function errorCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const c = (err as { code?: unknown }).code
  if (typeof c === 'string' && c) return c
  const ext = (err as { extensions?: { code?: unknown } }).extensions
  if (ext && typeof ext.code === 'string' && ext.code) return ext.code
  return null
}

export function createGraphQLEngine(options: GraphQLEngineOptions): GraphQLEngine {
  const log = options.log
  const schema = buildSchema(options.typeDefs)
  attachResolvers(schema, options.resolvers, log)
  const publicFields = new Set(options.publicRootFields ?? DEFAULT_PUBLIC)
  const registry = options.persisted
  const prepared = new Map<string, PreparedOperation>()

  function prepare(id: string, entry: PersistedOperation): PreparedOperation {
    const cached = prepared.get(id)
    if (cached) return cached
    const document = parse(entry.document)
    const errors = validate(schema, document)
    if (errors.length) {
      log?.(
        'error',
        `Kalıcı sorgu şemayla uyuşmuyor: ${entry.name}`,
        errors.map((e) => e.message),
      )
      throw new RequestError(500, 'INTERNAL', GENERIC_MESSAGE)
    }
    const fragments = new Map<string, FragmentDefinitionNode>()
    let op: OperationDefinitionNode | null = null
    for (const def of document.definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def)
      else if (def.kind === Kind.OPERATION_DEFINITION && (!op || def.name?.value === entry.name)) op = def
    }
    if (!op) throw new RequestError(500, 'INTERNAL', GENERIC_MESSAGE)
    const roots = new Set<string>()
    collectRootFields(op.selectionSet, fragments, roots, new Set())
    roots.delete('__typename')
    const result: PreparedOperation = {
      name: op.name?.value ?? entry.name,
      operation: op.operation,
      document,
      rootFields: [...roots],
    }
    prepared.set(id, result)
    return result
  }

  function formatError(e: GraphQLError): GqlFormattedError {
    const orig = e.originalError
    const code = errorCodeOf(orig) ?? (orig ? null : errorCodeOf(e))
    if (orig && code) return { message: orig.message, path: e.path, extensions: { code } }
    log?.('error', `GraphQL çözümleyici hatası${e.path ? ` (${e.path.join('.')})` : ''}`, orig ?? e)
    return { message: GENERIC_MESSAGE, path: e.path, extensions: { code: 'INTERNAL' } }
  }

  async function handle(input: GqlRequestInput): Promise<GqlResult> {
    const body = input.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail(400, 'BAD_REQUEST', 'İstek gövdesi bir JSON nesnesi olmalı.')
    }
    const b = body as Record<string, unknown>
    if (b.query !== undefined && b.query !== null) {
      return fail(400, 'RAW_QUERY_NOT_ALLOWED', 'Ham sorgu kabul edilmez; kalıcı sorgu kimliği gönderin.')
    }
    const ext = b.extensions as { persistedQuery?: { id?: unknown; version?: unknown } } | undefined
    const pq = ext && typeof ext === 'object' ? ext.persistedQuery : undefined
    const id = pq && typeof pq.id === 'string' ? pq.id : null
    const version = pq ? Number(pq.version) : NaN
    if (!registry) {
      log?.('error', 'Kalıcı sorgu kayıt defteri yüklenmedi: `npm run persisted` çalıştırın.')
      return fail(400, 'PERSISTED_QUERY_NOT_FOUND', 'Sorgu kayıt defterinde bulunamadı.')
    }
    if (pq && pq.version !== undefined && version !== registry.version) {
      return fail(400, 'PERSISTED_QUERY_VERSION_MISMATCH', 'Uygulama sürümü eski; sayfayı yenileyin.')
    }
    const entry = id ? registry.operations[id] : undefined
    if (!id || !entry) return fail(400, 'PERSISTED_QUERY_NOT_FOUND', 'Sorgu kayıt defterinde bulunamadı.')

    let op: PreparedOperation
    try {
      op = prepare(id, entry)
    } catch (err) {
      if (err instanceof RequestError)
        return { ...fail(err.statusCode, err.code, err.message), operationName: entry.name }
      log?.('error', `Kalıcı sorgu ayrıştırılamadı: ${entry.name}`, err)
      return { ...fail(500, 'INTERNAL', GENERIC_MESSAGE), operationName: entry.name }
    }
    const named = (r: GqlResult): GqlResult => ({ ...r, operationName: op.name })

    if (op.operation === 'subscription') return named(fail(400, 'BAD_REQUEST', 'Abonelik işlemleri desteklenmiyor.'))

    // Yetki: kök alanların hepsi herkese açık değilse üyelik + profil gerekir.
    const needsMember = op.operation !== 'query' || op.rootFields.some((f) => !publicFields.has(f))
    const passport = input.passport
    if (needsMember) {
      if (passport.membershipStatus !== 'CURRENT_MEMBER' || !passport.account) {
        return named(fail(401, 'UNAUTHENTICATED', 'Önce giriş yapmalısınız.'))
      }
      if (!passport.profile) return named(fail(403, 'PROFILE_REQUIRED', 'Önce bir profil seçin.'))
    }
    if (op.operation === 'mutation' && !passport.authURLVerified) {
      return named(fail(403, 'CSRF_FAILED', 'Oturum belirteci geçersiz; sayfayı yenileyin.'))
    }

    const variables = b.variables ?? {}
    if (typeof variables !== 'object' || Array.isArray(variables)) {
      return named(fail(400, 'BAD_USER_INPUT', 'Sorgu değişkenleri bir nesne olmalı.'))
    }

    const result = await execute({
      schema,
      document: op.document,
      operationName: op.name,
      variableValues: variables as Record<string, unknown>,
      contextValue: input.makeContext(),
    })

    if (result.data === undefined) {
      // İstek düzeyi hata (ör. değişken türü uymuyor): yürütme hiç başlamadı.
      log?.(
        'warn',
        `GraphQL istek hatası: ${op.name}`,
        result.errors?.map((e) => e.message),
      )
      return named(fail(400, 'BAD_USER_INPUT', 'Sorgu değişkenleri geçersiz.'))
    }
    const out: GqlResponseBody = { data: result.data }
    if (result.errors?.length) out.errors = result.errors.map(formatError)
    return named({ statusCode: 200, body: out, operationName: op.name })
  }

  return { schema, handle }
}
