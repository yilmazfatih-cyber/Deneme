// Aşama 6 testleri: cron ayrıştırma, at/every/cron sonraki zaman, tick'in en fazla bir kez koşması, teslim.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeNextRun, CronService, parseCron, parseDuration } from '../asama6_zamanlayici.js'

const T = (iso) => Date.parse(iso)

test('cron alanları ve geçersiz ifadeler', () => {
  const c = parseCron('*/20 9-17/4 * * 1-5')
  assert.deepEqual([...c.minute], [0, 20, 40])
  assert.deepEqual([...c.hour], [9, 13, 17])
  for (const kotu of ['* * * *', '60 * * * *', '*/0 * * * *', 'x * * * *', '5-1 * * * *', ',5 * * * *']) {
    assert.throws(() => parseCron(kotu), /cron/, kotu)
  }
})

test('sonraki çalışma: cron, every ızgarası, at', () => {
  const cuma = T('2026-11-13T09:00:00Z')
  assert.equal(computeNextRun({ kind: 'cron', expr: '0 9 * * 1-5' }, cuma), T('2026-11-16T09:00:00Z'))
  assert.equal(
    computeNextRun({ kind: 'cron', expr: '0 0 1 * 0' }, T('2026-11-02T00:00:00Z')),
    T('2026-11-08T00:00:00Z'),
  )
  const anchor = T('2026-11-09T08:00:00Z')
  assert.equal(
    computeNextRun({ kind: 'every', every: '30m', anchorMs: anchor }, anchor + 45 * 60_000),
    anchor + 60 * 60_000,
  )
  assert.equal(computeNextRun({ kind: 'at', at: '2026-11-09T10:00:00Z' }, anchor), T('2026-11-09T10:00:00Z'))
  assert.equal(computeNextRun({ kind: 'at', at: '2026-11-09T07:00:00Z' }, anchor), null)
  assert.equal(parseDuration('2h'), 7_200_000)
  assert.throws(() => parseDuration('yarım saat'))
})

function kur() {
  let saat = T('2026-11-09T08:00:00Z')
  const teslimler = []
  const turlar = []
  const runtime = {
    runTurn: async ({ sessionKey, text }) => {
      turlar.push(sessionKey)
      if (text.includes('patla')) throw new Error('model hatası')
      const yanit = text.includes('kontrol') ? 'HEARTBEAT_OK' : `rapor: ${text}`
      return { text: yanit, silent: yanit === 'HEARTBEAT_OK' }
    },
  }
  const cron = new CronService({
    runtime,
    deliver: async (hedef, metin) => teslimler.push([hedef.to, metin]),
    now: () => saat,
  })
  return { cron, teslimler, turlar, ileri: (dk) => (saat += dk * 60_000) }
}

test('tick: zamanı gelen iş bir kez koşar, yalıtılmış oturumda, sonucu teslim edilir', async () => {
  const { cron, teslimler, turlar, ileri } = kur()
  const is = cron.add({
    name: 'ozet',
    schedule: { kind: 'every', every: '1h' },
    message: 'gün',
    delivery: { channel: 'x', to: '42' },
  })
  assert.deepEqual(await cron.tick(), [])
  ileri(60)
  const [kayit] = await cron.tick()
  assert.match(kayit.sessionKey, new RegExp(`^agent:main:cron:${is.id}:run:[0-9a-f]{8}$`))
  assert.deepEqual(teslimler, [['42', 'rapor: gün']])
  assert.deepEqual(await cron.tick(), []) // aynı dakikada ikinci kez koşmaz
  ileri(60)
  await cron.tick()
  assert.equal(new Set(turlar).size, 2) // her koşu taze oturum
})

test('HEARTBEAT_OK teslim edilmez; tek seferlik iş koşunca silinir; hata kaydedilir', async () => {
  const { cron, teslimler, ileri } = kur()
  cron.add({
    name: 'nabiz',
    schedule: { kind: 'every', every: '30m' },
    message: 'kontrol et',
    delivery: { channel: 'x', to: '1' },
  })
  cron.add({ name: 'hatirlat', schedule: { kind: 'at', at: '2026-11-09T08:10:00Z' }, message: 'ilaç saati' })
  cron.add({ name: 'bozuk', schedule: { kind: 'cron', expr: '*/5 * * * *' }, message: 'patla' })
  ileri(30)
  const kayitlar = await cron.tick()
  assert.deepEqual(
    kayitlar.map((k) => k.status),
    ['error', 'ok', 'ok'],
  ) // sıra: 08:05 bozuk, 08:10 hatırlat, 08:30 nabız
  assert.equal(
    kayitlar.some((k) => k.delivered),
    false,
  )
  assert.deepEqual(teslimler, [])
  assert.deepEqual(
    cron
      .list()
      .map((j) => j.name)
      .sort(),
    ['bozuk', 'nabiz'],
  )
  assert.equal(kayitlar.find((k) => k.status === 'error').text, 'model hatası')
  assert.throws(() => cron.add({ name: 'gecmis', schedule: { kind: 'at', at: '2020-01-01T00:00:00Z' }, message: 'x' }))
})
