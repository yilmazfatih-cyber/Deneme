/**
 * Kalıcı sorgu istemcisi. Sorgu METNİ asla yollanmaz: yalnızca işlem adı + kayıt kimliği + sürüm.
 *   POST /graphql  { operationName, variables, extensions: { persistedQuery: { id, version } } }
 * Kimlikler derleme anında üretilir (npm run persisted → shared/graphql/persisted.client.json).
 */
import registry from '../../../shared/graphql/persisted.client.json'
import { HEADERS, ROUTES } from '../../../shared/constants'
import { devbus } from '../lib/devbus'
import { sessionHeaders } from './session'

export interface GraphQLErrorItem {
  message: string
  path?: (string | number)[]
  extensions?: { code?: string; [k: string]: unknown }
}
export class GraphQLRequestError extends Error {
  readonly operationName: string
  readonly errors: GraphQLErrorItem[]
  readonly status: number
  readonly traceId: string | null
  constructor(
    message: string,
    operationName: string,
    errors: GraphQLErrorItem[],
    status: number,
    traceId: string | null,
  ) {
    super(message)
    this.name = 'GraphQLRequestError'
    this.operationName = operationName
    this.errors = errors
    this.status = status
    this.traceId = traceId
  }
  get code(): string | undefined {
    return this.errors[0]?.extensions?.code
  }
}

const ids = registry.operations as Record<string, string>

export async function gql<TData, TVars extends object = Record<string, never>>(
  operationName: string,
  variables?: TVars,
  opts?: { signal?: AbortSignal },
): Promise<TData> {
  const id = ids[operationName]
  if (!id) throw new Error(`Kayıtlı olmayan sorgu: ${operationName} (npm run persisted çalıştırın)`)
  const t0 = performance.now()
  let status = 0
  let traceId: string | null = null
  try {
    const res = await fetch(ROUTES.GRAPHQL, {
      method: 'POST',
      credentials: 'same-origin',
      signal: opts?.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...sessionHeaders() },
      body: JSON.stringify({
        operationName,
        variables: variables ?? {},
        extensions: { persistedQuery: { id, version: registry.version } },
      }),
    })
    status = res.status
    traceId = res.headers.get(HEADERS.TRACE_ID)
    const text = await res.text()
    const body = JSON.parse(text) as { data?: TData | null; errors?: GraphQLErrorItem[] }
    const ms = performance.now() - t0
    if (body.errors?.length && !body.data) {
      devbus.emit(
        'graphql',
        operationName,
        { id, version: registry.version, variables, status, traceId, errors: body.errors },
        { ms, ok: false },
      )
      throw new GraphQLRequestError(body.errors[0]!.message, operationName, body.errors, status, traceId)
    }
    devbus.emit(
      'graphql',
      operationName,
      {
        id,
        version: registry.version,
        variables,
        status,
        traceId,
        bytes: text.length,
        partialErrors: body.errors?.length ?? 0,
      },
      { ms, ok: true },
    )
    return body.data as TData
  } catch (err) {
    if (err instanceof GraphQLRequestError) throw err
    if ((err as Error).name !== 'AbortError') {
      devbus.emit(
        'graphql',
        operationName,
        { id, variables, status, traceId, error: String(err) },
        { ms: performance.now() - t0, ok: false },
      )
    }
    throw err
  }
}
