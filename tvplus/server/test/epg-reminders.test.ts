/**
 * Yayın hatırlatmaları: setReminder / hasReminder / reminders (GraphQL, ad hoc belgelerle motor üzerinden),
 * zamanlayıcı (enjekte saatle) ve ikinci tur Profile alanları; çözümleyici birleştirmesi.
 * Kalıcı belge eklenmez (istemciler sahiptir): motor, bu dosyadaki küçük kayıt defteriyle kurulur.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGraphQLEngine, type GraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import { searchResolvers } from '../src/graphql/resolvers/search'
import type { Passport } from '../src/kernel/context'
import type { AiringRecord } from '../src/kernel/services'
import { createReminderScheduler } from '../src/services/epg/reminders'
import { ADULT, createAlanApp, gqlContext, KID, passport, setClock, TEST_NOW } from './fixtures/alan'

const root = join(import.meta.dirname, '..', '..', 'shared', 'graphql')
const AIRING_FIELDS = 'airingId title startAt endAt hasReminder liveState channel { channelId }'
const DOCS: Record<string, { type: string; document: string }> = {
  SetReminderTest: {
    type: 'mutation',
    document: `mutation SetReminderTest($airingId: ID!, $enabled: Boolean!) { setReminder(airingId: $airingId, enabled: $enabled) { ${AIRING_FIELDS} } }`,
  },
  RemindersTest: { type: 'query', document: `query RemindersTest { reminders { ${AIRING_FIELDS} } }` },
  AiringTest: {
    type: 'query',
    document: `query AiringTest($airingId: ID!) { airing(airingId: $airingId) { airingId hasReminder } }`,
  },
  ProfileTest: {
    type: 'query',
    document:
      'query ProfileTest { membershipStatus { activeProfile { guid avatarKey isLocked avatar(params: { width: 64 }) { url } } } }',
  },
}
const registry: PersistedRegistry = {
  version: 1,
  operations: Object.fromEntries(Object.entries(DOCS).map(([name, d]) => [`test-${name}`, { name, ...d }])),
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test gövdelerinde derin JSON erişimi */
type Data = Record<string, any>

describe('yayın hatırlatmaları', () => {
  let app: FastifyInstance
  let engine: GraphQLEngine
  beforeAll(async () => {
    app = await createAlanApp()
    engine = createGraphQLEngine({
      typeDefs: readFileSync(join(root, 'schema.graphql'), 'utf8'),
      resolvers,
      persisted: registry,
    })
  })
  afterAll(async () => {
    await app.close()
  })

  async function run(name: string, variables: Record<string, unknown> = {}, pp: Passport = passport(ADULT)) {
    const r = await engine.handle({
      body: { operationName: name, variables, extensions: { persistedQuery: { id: `test-${name}`, version: 1 } } },
      passport: pp,
      makeContext: () => gqlContext(app, pp),
    })
    return r.body as { data?: Data; errors?: { message: string; extensions: { code: string } }[] }
  }

  /** Kanalın şu andan sonra başlayan ilk iki yayını */
  function upcoming(channelId: number, now = TEST_NOW): AiringRecord[] {
    return app.services.epg
      .airings(channelId, now, new Date(now.getTime() + 2 * 86_400_000))
      .filter((a) => a.startAt.getTime() > now.getTime())
  }

  it('kurar, listeler (yaklaşan önce), kaldırır; başlamış yayına kurulamaz', async () => {
    setClock(app, TEST_NOW)
    const [a1, a2] = upcoming(1)
    const b1 = upcoming(2)[0]!
    expect(a1 && a2 && b1).toBeTruthy()

    const set = await run('SetReminderTest', { airingId: a2!.airingId, enabled: true })
    expect(set.errors).toBeUndefined()
    expect(set.data!.setReminder).toMatchObject({ airingId: a2!.airingId, hasReminder: true, liveState: 'UPCOMING' })
    await run('SetReminderTest', { airingId: b1.airingId, enabled: true })
    await run('SetReminderTest', { airingId: a1!.airingId, enabled: true })
    // ikinci kez kurmak tekrarlamaz
    await run('SetReminderTest', { airingId: a1!.airingId, enabled: true })

    const list = (await run('RemindersTest')).data!.reminders as { airingId: string; startAt: string }[]
    const expected = [a1!, a2!, b1].sort((x, y) => x.startAt.getTime() - y.startAt.getTime()).map((a) => a.airingId)
    expect(list.map((x) => x.airingId)).toEqual(expected)
    expect((await run('AiringTest', { airingId: a1!.airingId })).data!.airing.hasReminder).toBe(true)
    // başka profil görmez
    expect((await run('RemindersTest', {}, passport(KID))).data!.reminders).toEqual([])
    expect((await run('AiringTest', { airingId: a1!.airingId }, passport(KID))).data?.airing ?? null).toBeNull() // kanal 1 çocukta görünmez

    // başlamış yayın
    const live = app.services.epg.currentAiring(1, TEST_NOW)!
    const started = await run('SetReminderTest', { airingId: live.airingId, enabled: true })
    expect(started.errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
    // bilinmeyen
    expect(
      (await run('SetReminderTest', { airingId: '1-19990101-0000', enabled: true })).errors?.[0]?.extensions.code,
    ).toBe('NOT_FOUND')
    // profilsiz
    expect((await run('RemindersTest', {}, passport(null))).errors?.[0]?.extensions.code).toBe('PROFILE_REQUIRED')

    // kaldır
    const off = await run('SetReminderTest', { airingId: b1.airingId, enabled: false })
    expect(off.data!.setReminder.hasReminder).toBe(false)
    expect(((await run('RemindersTest')).data!.reminders as unknown[]).length).toBe(2)

    // a1 yayındayken listede sonda; bitince düşer
    setClock(app, new Date(a1!.startAt.getTime() + 1000))
    const during = ((await run('RemindersTest')).data!.reminders as { airingId: string }[]).map((x) => x.airingId)
    expect(during.at(-1)).toBe(a1!.airingId)
    setClock(app, new Date(a2!.endAt.getTime() + 1000))
    expect((await run('RemindersTest')).data!.reminders).toEqual([])
    setClock(app, TEST_NOW)
    // kaldırma her zaman serbest
    const g = ADULT.guid
    for (const id of app.services.progress.reminders(g)) app.services.progress.setReminder(g, id, false)
    expect(app.services.progress.reminders(g)).toEqual([])
  })

  it('zamanlayıcı: yayın başlayınca tam bir kez bildirim; kaçırılan bitmiş yayın sessizce düşer', async () => {
    setClock(app, TEST_NOW)
    const [a1, a2] = upcoming(5)
    const guid = ADULT.guid
    app.services.progress.setReminder(guid, a1!.airingId, true)
    app.services.progress.setReminder(guid, a2!.airingId, true)
    let now = TEST_NOW
    const scheduler = createReminderScheduler({ services: () => app.services, now: () => now })
    const reminders = () => app.services.notifications.list(guid).filter((n) => n.kind === 'REMINDER')
    const before = reminders().length

    expect(scheduler.tick()).toBe(0)
    now = new Date(a1!.startAt.getTime() + 5_000)
    expect(scheduler.tick()).toBe(1)
    expect(scheduler.tick()).toBe(0) // tam bir kez
    const n = reminders()
    expect(n.length).toBe(before + 1)
    const channel = app.services.catalog.getChannel(5)!
    const hhmm = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(a1!.startAt)
    expect(n.find((x) => x.title === `Şimdi başlıyor: ${a1!.title}`)).toMatchObject({
      body: `${channel.name} · ${hhmm}`,
      href: '#/izle/Channel:5',
    })
    // Bildirildikten sonra da hatırlatma listede kalır (yayın sürerken)
    expect(app.services.progress.hasReminder(guid, a1!.airingId)).toBe(true)

    // a2 hiç bildirilmeden biterse (sunucu kapalıydı) bildirim atılmaz
    now = new Date(a2!.endAt.getTime() + 5_000)
    expect(scheduler.tick()).toBe(0)
    expect(reminders().length).toBe(before + 1)
    expect(app.services.progress.pendingReminders().filter((r) => r.profileGuid === guid)).toEqual([])
  })

  it('zamanlayıcı start/stop: süreci ayakta tutmaz', () => {
    const s = createReminderScheduler({ services: () => app.services, now: () => TEST_NOW, intervalMs: 60_000 })
    s.start()
    s.start()
    s.stop()
    s.stop()
  })

  it('Profile.avatarKey / isLocked / avatar adresi', async () => {
    const r = await run('ProfileTest')
    expect(r.errors).toBeUndefined()
    expect(r.data!.membershipStatus.activeProfile).toMatchObject({
      guid: ADULT.guid,
      avatarKey: 'avatar-1',
      isLocked: false,
    })
    expect(r.data!.membershipStatus.activeProfile.avatar.url).toMatch(
      /^\/img\/v1\/avatar\/64x64\/Profile%3A.+&v=avatar-1$/,
    )
  })
})

describe('çözümleyici birleştirmesi', () => {
  it('searchResolvers alanları tip bazında korunur (Query/Mutation derin birleşir)', () => {
    for (const [type, fields] of Object.entries(searchResolvers))
      for (const f of Object.keys(fields)) expect(resolvers[type]?.[f], `${type}.${f}`).toBe(fields[f])
    for (const f of ['reminders', 'membershipStatus', 'livePage', 'channel'])
      expect(resolvers.Query?.[f]).toBeTypeOf('function')
    for (const f of ['setReminder', 'addToPlaylist']) expect(resolvers.Mutation?.[f]).toBeTypeOf('function')
    expect(resolvers.ProgramAiring?.hasReminder).toBeTypeOf('function')
  })
})
