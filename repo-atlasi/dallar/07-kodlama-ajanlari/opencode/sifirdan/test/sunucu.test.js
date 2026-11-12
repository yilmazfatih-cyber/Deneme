import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createFakeProvider } from '../asama1_saglayici.js'
import { defaultTools } from '../asama2_araclar.js'
import { agents } from '../asama3_izinler.js'
import { createSessionStore } from '../asama5_oturum.js'
import { createAgentServer, createClient } from '../asama7_sunucu.js'

/** edit için her seferinde soran ajan. */
const careful = {
  ...agents.build,
  id: 'dikkatli',
  rules: [...agents.build.rules, { action: 'edit', resource: '*', effect: 'ask' }],
}

/** Çalışma alanı ve (onun dışında) oturum klasörü. */
async function folders(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), `${prefix}-`))
  const data = await mkdtemp(path.join(tmpdir(), `${prefix}-veri-`))
  const cleanup = async () => {
    await rm(root, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  }
  return { root, store: createSessionStore(data), cleanup }
}

/** İlk `type` olayını bekler (abonelik, istek gönderilmeden önce kurulmalı). */
async function firstEvent(client, signal, type) {
  for await (const event of client.events(signal)) if (event.type === type) return event
  return undefined
}

/** Söz `ms` içinde sonuçlanmazsa açıklamalı bir hatayla düşer; test sonsuza dek beklemez. */
async function within(promise, ms, label) {
  let timer
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: ${ms} ms içinde bitmedi`)), ms)
  })
  try {
    return await Promise.race([promise, limit])
  } finally {
    clearTimeout(timer)
  }
}

test('istemci → sunucu: istem, izin olayı, yanıt, oturum sonucu', async () => {
  const { root, store, cleanup } = await folders('mini-sunucu')
  const app = createAgentServer({
    store,
    provider: createFakeProvider([
      { toolCalls: [{ id: 'w1', name: 'write', input: { path: 'not.txt', content: 'sunucudan' } }] },
      { text: 'Dosyayı yazdım.' },
    ]),
    tools: defaultTools,
    agents: { ...agents, dikkatli: careful },
    root,
  })
  const baseURL = await app.listen(0)
  const client = createClient(baseURL)
  const abort = new AbortController()
  try {
    await assert.rejects(client.createSession({ agent: 'yok' }), /400/)
    await assert.rejects(client.prompt('ses_yok', 'x'), /404/)

    const session = await client.createSession({ agent: 'dikkatli', title: 'sunucu testi' })
    const seen = []
    const done = (async () => {
      for await (const event of client.events(abort.signal)) {
        seen.push(event.type)
        if (event.type === 'permission.asked') {
          assert.equal(event.action, 'edit')
          assert.deepEqual(event.resources, ['not.txt'])
          await client.replyPermission(event.id, 'once')
        }
        if (event.type === 'session.idle' || event.type === 'session.error') return event
      }
    })()
    await new Promise((resolve) => setTimeout(resolve, 50)) // abonelik kurulsun
    assert.deepEqual(await client.prompt(session.id, 'not.txt dosyasını yaz'), { accepted: true })

    const final = await done
    assert.equal(final.type, 'session.idle')
    assert.equal(final.result.finish, 'stop')
    assert.equal(await readFile(path.join(root, 'not.txt'), 'utf8'), 'sunucudan')
    assert.ok(seen.includes('tool-call') && seen.includes('permission.replied'))

    const stored = await client.getSession(session.id)
    assert.equal(stored.messages.length, 4)
    assert.equal((await client.listSessions()).length, 1)
  } finally {
    abort.abort()
    await app.close()
    await cleanup()
  }
})

test('kapanış: yanıtlanmamış izin sorusu reddedilir, close() takılmaz', async () => {
  const { root, store, cleanup } = await folders('mini-kapanis')
  const app = createAgentServer({
    store,
    provider: createFakeProvider([
      { toolCalls: [{ id: 'w1', name: 'write', input: { path: 'x.txt', content: 'y' } }] },
    ]),
    tools: defaultTools,
    agents: { dikkatli: careful }, // varsayılan "build" bu sunucuda yok
    root,
  })
  const client = createClient(await app.listen(0))
  const abort = new AbortController()
  let sessionID
  try {
    // Ajan verilmezse "build" denenir; tanımlı değilse süreç çökmez, 400 döner.
    await assert.rejects(client.createSession({}), /400/)
    sessionID = (await client.createSession({ agent: 'dikkatli' })).id
    const asked = firstEvent(client, abort.signal, 'permission.asked')
    await new Promise((resolve) => setTimeout(resolve, 50)) // abonelik kurulsun
    await client.prompt(sessionID, 'x.txt yaz')
    await within(asked, 2000, 'izin sorusu') // soru yayınlandı ve kimse yanıtlamıyor
  } finally {
    abort.abort()
    try {
      await within(app.close(), 2000, 'close()')
    } catch (error) {
      await cleanup() // test düşse de geçici klasörler kalmasın
      throw error
    }
  }
  try {
    const stored = await store.get(sessionID)
    assert.match(stored.messages.at(-1).parts[0].output, /reddetti/)
  } finally {
    await cleanup()
  }
})
