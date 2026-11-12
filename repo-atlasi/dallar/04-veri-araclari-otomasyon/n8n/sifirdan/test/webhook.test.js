import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'
import { webhookSunucusu } from '../asama4_webhook.js'

const webhookAkisi = JSON.parse(await readFile(new URL('../ornekler/webhook-akisi.json', import.meta.url), 'utf8'))

/** Yanıtı hemen dönen (onReceived) ikinci bir akış: gelen gövdeyi işleyip bırakır. */
const arkaPlanAkisi = {
  name: 'Arka plan',
  nodes: [
    {
      name: 'Kanca',
      type: 'n8n-nodes-base.webhook',
      parameters: { httpMethod: 'GET', path: 'ping' },
      position: [0, 0],
    },
    {
      name: 'Not al',
      type: 'n8n-nodes-base.set',
      parameters: { assignments: { assignments: [{ name: 'kim', value: '={{ $json.query.kim }}' }] } },
      position: [200, 0],
    },
  ],
  connections: { Kanca: { main: [[{ node: 'Not al', type: 'main', index: 0 }]] } },
}

describe('webhook sunucusu', () => {
  /** @type {ReturnType<typeof webhookSunucusu>} */
  let w
  let taban = ''
  before(async () => {
    w = webhookSunucusu({ akislar: [webhookAkisi, arkaPlanAkisi] })
    await new Promise((hazir) => w.sunucu.listen(0, '127.0.0.1', () => hazir(undefined)))
    taban = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (w.sunucu.address()).port}`
  })
  after(() => new Promise((bitti) => w.sunucu.close(() => bitti(undefined))))

  const post = (/** @type {string} */ yol, /** @type {unknown} */ govde) =>
    fetch(taban + yol, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde) })

  test('lastNode: akış biter, son düğümün ilk öğesi yanıt olur', async () => {
    const yanit = await post('/webhook/siparis', { musteri: 'Ece', tutar: 250 })
    assert.equal(yanit.status, 200)
    assert.deepEqual(await yanit.json(), { musteri: 'Ece', tutar: 250, kdv: 50 })
    const gecersiz = await post('/webhook/siparis', { tutar: -5 })
    assert.deepEqual(await gecersiz.json(), { hata: 'Geçersiz tutar' })
  })

  test('onReceived: hemen yanıt, akış arkada sürer; yürütme kaydı tutulur', async () => {
    const yanit = await fetch(`${taban}/webhook/ping?kim=Deniz`)
    assert.deepEqual(await yanit.json(), { message: 'Workflow was started' })
    let kayit
    for (let i = 0; i < 50 && !kayit; i++) {
      const liste = await (await fetch(`${taban}/executions`)).json()
      kayit = liste.data.find((/** @type {any} */ k) => k.mode === 'webhook' && k.workflowId === '')
      if (!kayit) await new Promise((r) => setTimeout(r, 20))
    }
    assert.ok(kayit, 'yürütme kaydı bulunmalı')
    const ayrinti = await (await fetch(`${taban}/executions/${kayit.id}`)).json()
    assert.deepEqual(ayrinti.data.resultData.runData['Not al'][0].data.main[0][0].json, { kim: 'Deniz' })
  })

  test('kayıtsız yol, yanlış yöntem, bozuk gövde', async () => {
    assert.equal((await post('/webhook/yok', {})).status, 404)
    assert.equal((await fetch(`${taban}/webhook/siparis`)).status, 404) // GET kayıtlı değil
    const bozuk = await fetch(`${taban}/webhook/siparis`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bozuk',
    })
    assert.equal(bozuk.status, 400)
  })

  test('aynı yöntem + yol iki kez kaydedilemez', () => {
    assert.throws(() => webhookSunucusu({ akislar: [webhookAkisi, webhookAkisi] }), /zaten kullanımda/)
  })
})
