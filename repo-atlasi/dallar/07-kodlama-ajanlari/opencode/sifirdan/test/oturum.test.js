import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createId, createSessionStore } from '../asama5_oturum.js'

test('oturum oluştur, oku, kaydet, listele', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mini-oturum-'))
  try {
    const store = createSessionStore(path.join(directory, 'sessions'))
    assert.deepEqual(await store.list(), []) // klasör henüz yok
    const first = await store.create({ title: 'ilk' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await store.create({ title: 'ikinci', agent: 'plan' })

    first.messages.push({ role: 'user', parts: [{ type: 'text', text: 'merhaba' }] })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await store.save(first)

    const loaded = await store.get(first.id)
    assert.equal(loaded.messages[0].parts[0].text, 'merhaba')
    assert.equal((await store.get(second.id)).agent, 'plan')
    assert.deepEqual(
      (await store.list()).map((session) => session.title),
      ['ilk', 'ikinci'], // en son güncellenen önce
    )
    const files = await readdir(path.join(directory, 'sessions'))
    assert.equal(files.filter((name) => name.endsWith('.tmp')).length, 0)
    const raw = JSON.parse(await readFile(path.join(directory, 'sessions', `${first.id}.json`), 'utf8'))
    assert.equal(raw.id, first.id)
    assert.equal(await store.get('ses_yok'), undefined)
    await assert.rejects(store.get('../kacis'), /Geçersiz oturum kimliği/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('kimlikler önekli ve zamana göre sıralanabilir', async () => {
  const a = createId('ses')
  await new Promise((resolve) => setTimeout(resolve, 2))
  const b = createId('ses')
  assert.match(a, /^ses_[a-z0-9]+$/)
  assert.ok(a.slice(0, 12) <= b.slice(0, 12))
})
