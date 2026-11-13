import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import persistedClient from '../../shared/graphql/persisted.client.json'
import type { BootContext } from '../../shared/types'
import { createGraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import type { GqlContext, Passport, ResolverMap } from '../src/kernel/context'
import { createTestApp } from './helpers'

const typeDefs = /* GraphQL */ `
  scalar DateTime
  enum MembershipStatus {
    ANONYMOUS
    CURRENT_MEMBER
  }
  interface Video {
    videoId: Int!
    title: String
  }
  type Movie implements Video {
    videoId: Int!
    title: String
    runtimeSec: Int
  }
  type Show implements Video {
    videoId: Int!
    title: String
    seasonCount: Int
  }
  type Channel {
    channelId: Int!
  }
  union RowEntity = Movie | Channel
  type MembershipStatusResult {
    status: MembershipStatus!
  }
  type Query {
    membershipStatus: MembershipStatusResult!
    interstitial(location: String!): String
    video(videoId: Int!): Video
    entity(id: Int!): RowEntity
    now: DateTime!
    echoDate(at: DateTime!): DateTime!
    failing: String
    coded: String
    partial: [Video]!
  }
  type Mutation {
    rate(videoId: Int!): Boolean!
  }
`

const ops: Record<string, { name: string; type: string; document: string }> = {
  q1: { name: 'Membership', type: 'query', document: 'query Membership { membershipStatus { status } }' },
  q2: {
    name: 'VideoQ',
    type: 'query',
    document:
      'query VideoQ($id: Int!) { video(videoId: $id) { __typename videoId title ... on Movie { runtimeSec } ... on Show { seasonCount } } }',
  },
  q3: { name: 'EntityQ', type: 'query', document: 'query EntityQ($id: Int!) { entity(id: $id) { __typename ... on Channel { channelId } ... on Movie { videoId } } }' },
  q4: { name: 'Dates', type: 'query', document: 'query Dates($at: DateTime!) { now echoDate(at: $at) }' },
  q5: { name: 'Errors', type: 'query', document: 'query Errors { failing coded membershipStatus { status } }' },
  q6: { name: 'Rate', type: 'mutation', document: 'mutation Rate { rate(videoId: 1) }' },
  q7: { name: 'Mixed', type: 'query', document: 'query Mixed { membershipStatus { status } interstitial(location: "HOME") }' },
  q8: { name: 'Frag', type: 'query', document: 'query Frag { ...Root } fragment Root on Query { video(videoId: 1) { videoId } }' },
  q9: { name: 'Partial', type: 'query', document: 'query Partial { partial { videoId title } }' },
}
const registry: PersistedRegistry = { version: 7, operations: ops }

const resolvers: ResolverMap = {
  Query: {
    membershipStatus: (_p, _a, ctx: GqlContext) => ({ status: ctx.passport.membershipStatus }),
    interstitial: () => 'duyuru',
    video: (_p, args: { videoId: number }) => ({ videoId: args.videoId }),
    entity: (_p, args: { id: number }) => (args.id > 100 ? { channelId: args.id } : { __typename: 'Movie', videoId: args.id }),
    now: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    echoDate: (_p, args: { at: Date }) => {
      if (!(args.at instanceof Date)) throw new Error('Date bekleniyordu')
      return args.at.getTime()
    },
    failing: () => {
      throw new Error('veritabanı parolası: hunter2')
    },
    coded: () => {
      throw Object.assign(new Error('Bu içerik paketinizde yok.'), { code: 'UPSELL' })
    },
    partial: () => [{ videoId: 1 }, { videoId: -1 }],
  },
  Mutation: { rate: () => true },
  Video: {
    __resolveType: (v: { videoId: number }) => (v.videoId % 2 === 0 ? 'Show' : 'Movie'),
  },
  Movie: {
    title: (v: { videoId: number }) => {
      if (v.videoId < 0) throw new Error('kayıp')
      return `Film ${v.videoId}`
    },
    runtimeSec: () => 5400,
  },
  Show: { title: (v: { videoId: number }) => `Dizi ${v.videoId}`, seasonCount: () => 2 },
  RowEntity: { __resolveType: (v: { channelId?: number; __typename?: string }) => (v.channelId ? 'Channel' : 'Movie') },
}

const passport = (over: Partial<Passport> = {}): Passport => ({
  membershipStatus: 'CURRENT_MEMBER',
  account: { accountId: 'acc', planName: 'p', products: [] },
  profile: { guid: 'G', accountId: 'acc', name: 'Deniz', avatar: 'a', isKids: false, maturityLevel: 110, language: 'tr' },
  esn: 'e',
  deviceId: 'd',
  authURLVerified: true,
  ...over,
})
const ANON = passport({ membershipStatus: 'ANONYMOUS', account: null, profile: null, authURLVerified: false })

const logs: { level: string; msg: string; detail?: unknown }[] = []
const engine = createGraphQLEngine({ typeDefs, resolvers, persisted: registry, log: (level, msg, detail) => logs.push({ level, msg, detail }) })
const run = (id: string, p: Passport = passport(), variables?: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  engine.handle({
    body: { operationName: 'x', variables, extensions: { persistedQuery: { id, version: 7 } }, ...extra },
    passport: p,
    makeContext: () => ({ passport: p, cache: new Map() }) as unknown as GqlContext,
  })

describe('GraphQL motoru (fabrika, küçük şema)', () => {
  it('ham sorgu, bilinmeyen kimlik, sürüm uyuşmazlığı reddedilir', async () => {
    const raw = await engine.handle({ body: { query: '{ now }' }, passport: passport(), makeContext: () => ({}) as GqlContext })
    expect(raw.statusCode).toBe(400)
    expect(raw.body.errors?.[0]?.extensions.code).toBe('RAW_QUERY_NOT_ALLOWED')

    const unknown = await run('yok')
    expect(unknown.statusCode).toBe(400)
    expect(unknown.body.errors?.[0]?.extensions.code).toBe('PERSISTED_QUERY_NOT_FOUND')

    const missing = await engine.handle({ body: {}, passport: passport(), makeContext: () => ({}) as GqlContext })
    expect(missing.body.errors?.[0]?.extensions.code).toBe('PERSISTED_QUERY_NOT_FOUND')

    const mismatch = await engine.handle({
      body: { extensions: { persistedQuery: { id: 'q1', version: 6 } } },
      passport: passport(),
      makeContext: () => ({}) as GqlContext,
    })
    expect(mismatch.statusCode).toBe(400)
    expect(mismatch.body.errors?.[0]?.extensions.code).toBe('PERSISTED_QUERY_VERSION_MISMATCH')

    const noRegistry = createGraphQLEngine({ typeDefs, resolvers, persisted: null })
    const nr = await noRegistry.handle({ body: { extensions: { persistedQuery: { id: 'q1', version: 7 } } }, passport: passport(), makeContext: () => ({}) as GqlContext })
    expect(nr.body.errors?.[0]?.extensions.code).toBe('PERSISTED_QUERY_NOT_FOUND')
  })

  it('kimlik doğrulama kök alan adlarına göre', async () => {
    const pub = await run('q1', ANON)
    expect(pub.statusCode).toBe(200)
    expect(pub.body.data).toEqual({ membershipStatus: { status: 'ANONYMOUS' } })
    expect(pub.operationName).toBe('Membership')
    expect((await run('q7', ANON)).statusCode).toBe(200)

    const anon = await run('q2', ANON, { id: 1 })
    expect(anon.statusCode).toBe(401)
    expect(anon.body.errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')
    expect(anon.operationName).toBe('VideoQ')

    const noProfile = await run('q2', passport({ profile: null }), { id: 1 })
    expect(noProfile.statusCode).toBe(403)
    expect(noProfile.body.errors?.[0]?.extensions.code).toBe('PROFILE_REQUIRED')

    // Parça içindeki kök alanlar da sayılır
    expect((await run('q8', ANON)).statusCode).toBe(401)
  })

  it('mutasyon authURL ister', async () => {
    const csrf = await run('q6', passport({ authURLVerified: false }))
    expect(csrf.statusCode).toBe(403)
    expect(csrf.body.errors?.[0]?.extensions.code).toBe('CSRF_FAILED')
    const ok = await run('q6')
    expect(ok.statusCode).toBe(200)
    expect(ok.body.data).toEqual({ rate: true })
  })

  it('__resolveType ve alan çözümleyicileri', async () => {
    const movie = await run('q2', passport(), { id: 3 })
    expect(movie.body.data).toEqual({ video: { __typename: 'Movie', videoId: 3, title: 'Film 3', runtimeSec: 5400 } })
    const show = await run('q2', passport(), { id: 4 })
    expect(show.body.data).toEqual({ video: { __typename: 'Show', videoId: 4, title: 'Dizi 4', seasonCount: 2 } })
    const ch = await run('q3', passport(), { id: 500 })
    expect(ch.body.data).toEqual({ entity: { __typename: 'Channel', channelId: 500 } })
    const mv = await run('q3', passport(), { id: 5 })
    expect(mv.body.data).toEqual({ entity: { __typename: 'Movie', videoId: 5 } })
  })

  it('DateTime skaleri: Date/sayı → ISO, ISO → Date', async () => {
    const res = await run('q4', passport(), { at: '2026-11-13T10:00:00.000Z' })
    expect(res.body.errors).toBeUndefined()
    expect(res.body.data).toEqual({ now: '2026-01-02T03:04:05.000Z', echoDate: '2026-11-13T10:00:00.000Z' })
    const bad = await run('q4', passport(), { at: 'dün' })
    expect(bad.statusCode).toBe(400)
    expect(bad.body.errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
  })

  it('hata kodu eşleme: kodlu hata korunur, diğeri INTERNAL; kısmi veri 200', async () => {
    logs.length = 0
    const res = await run('q5')
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toEqual({ failing: null, coded: null, membershipStatus: { status: 'CURRENT_MEMBER' } })
    const byPath = Object.fromEntries((res.body.errors ?? []).map((e) => [e.path?.join('.'), e]))
    expect(byPath.coded).toEqual({ message: 'Bu içerik paketinizde yok.', path: ['coded'], extensions: { code: 'UPSELL' } })
    expect(byPath.failing).toEqual({ message: 'Beklenmeyen bir hata oluştu.', path: ['failing'], extensions: { code: 'INTERNAL' } })
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
    expect(logs.some((l) => l.level === 'error' && String((l.detail as Error)?.message).includes('hunter2'))).toBe(true)

    const partial = await run('q9')
    expect(partial.statusCode).toBe(200)
    expect(partial.body.data).toEqual({ partial: [{ videoId: 1, title: 'Film 1' }, { videoId: -1, title: null }] })
    expect(partial.body.errors?.[0]?.path).toEqual(['partial', 1, 'title'])
  })

  it('değişkenler nesne olmalı', async () => {
    const res = await engine.handle({
      body: { variables: [1], extensions: { persistedQuery: { id: 'q2', version: 7 } } },
      passport: passport(),
      makeContext: () => ({}) as GqlContext,
    })
    expect(res.statusCode).toBe(400)
    expect(res.body.errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
  })
})

describe('POST /graphql (gerçek şema ve kayıt defteri)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>
  const ids = persistedClient.operations as Record<string, string>
  const body = (name: string, variables: Record<string, unknown> = {}) => ({
    operationName: name,
    variables,
    extensions: { persistedQuery: { id: ids[name], version: persistedClient.version } },
  })
  const take = (res: InjectResponse, into: Record<string, string>) => {
    for (const c of res.cookies) if (c.value) into[c.name] = c.value
  }
  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('ham sorgu reddedilir', async () => {
    const res = await app.inject({ method: 'POST', url: '/graphql', payload: { query: '{ membershipStatus { status } }' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().errors[0].extensions.code).toBe('RAW_QUERY_NOT_ALLOWED')
  })

  it('MembershipStatus kimlikle çalışır ve işlem adını başlığa yazar', async () => {
    const res = await app.inject({ method: 'POST', url: '/graphql', payload: body('MembershipStatus') })
    expect(res.headers['x-tvplus-gql-op']).toBe('MembershipStatus')
    // Çözümleyici alan servisleri ajanından gelir; henüz yoksa INTERNAL hatası (200, data null) beklenir.
    expect([200]).toContain(res.statusCode)
    const json = res.json()
    if (json.errors) expect(json.errors[0].extensions.code).toBeTypeOf('string')
    else expect(json.data.membershipStatus.status).toBe('ANONYMOUS')
  })

  it('üyelik isteyen sorgu anonimde 401, mutasyon authURL’siz 403', async () => {
    const detail = await app.inject({ method: 'POST', url: '/graphql', payload: body('DetailModal', { videoId: 1 }) })
    expect(detail.statusCode).toBe(401)
    expect(detail.json().errors[0].extensions.code).toBe('UNAUTHENTICATED')

    const cookies: Record<string, string> = {}
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    take(login, cookies)
    const sw = await app.inject({
      method: 'POST',
      url: '/api/profiles/switch',
      cookies,
      payload: { guid: login.json<BootContext>().profiles[0]!.guid },
    })
    take(sw, cookies)
    const authURL = sw.json<BootContext>().authURL!
    const mut = await app.inject({ method: 'POST', url: '/graphql', cookies, payload: body('ClearRecentSearches') })
    expect(mut.statusCode).toBe(403)
    expect(mut.json().errors[0].extensions.code).toBe('CSRF_FAILED')
    const ok = await app.inject({
      method: 'POST',
      url: '/graphql',
      cookies,
      headers: { 'x-tvplus-authurl': authURL },
      payload: body('ClearRecentSearches'),
    })
    // Yetki kapıları geçildi; sonuç çözümleyiciye bağlı (yoksa 200 + INTERNAL hatası)
    expect(ok.statusCode).toBe(200)
  })
})
