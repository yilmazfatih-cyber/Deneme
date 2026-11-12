// Aşama 4 — webhook sunucusu ve yürütme kayıtları.
//
// n8n'de aktif iş akışlarındaki Webhook düğümleri '/webhook/<path>' altında, editördeki
// test çalıştırmaları '/webhook-test/<path>' altında dinlenir (@n8n/config: endpoints).
// İstek gelince akış Webhook düğümünden başlatılır; düğümün çıktısı
// { headers, params, query, body } biçimindedir. Yanıt kipi (responseMode):
//   'onReceived' -> hemen { message: 'Workflow was started' } dön, akış arkada sürsün
//   'lastNode'   -> akış bitsin, son düğümün ilk öğesinin JSON'unu dön
// Kodun asıl yeri: packages/cli/src/webhooks/ (live-webhooks.ts, webhook-helpers.ts ...).

import { createServer } from 'node:http'
import { akisiCalistir, dugumCiktisi, IsAkisi } from './asama3_motor.js'

const WEBHOOK_TIPI = 'n8n-nodes-base.webhook'

export class YurutmeDeposu {
  constructor(sinir = 100) {
    this.sinir = sinir // n8n de eski yürütmeleri budar (EXECUTIONS_DATA_PRUNE)
    /** @type {any[]} */
    this.kayitlar = []
  }

  /** @param {any} sonuc */
  ekle(sonuc) {
    this.kayitlar.unshift(sonuc)
    this.kayitlar.length = Math.min(this.kayitlar.length, this.sinir)
  }

  ozet() {
    return this.kayitlar.map(({ id, workflowId, mode, status, startedAt, stoppedAt }) => ({
      id,
      workflowId,
      mode,
      status,
      startedAt,
      stoppedAt,
    }))
  }

  /** @param {string} id */
  al(id) {
    return this.kayitlar.find((k) => k.id === id) ?? null
  }
}

/** @param {import('node:http').IncomingMessage} istek @param {number} sinir */
async function govdeyiOku(istek, sinir) {
  const parcalar = []
  let boyut = 0
  for await (const parca of istek) {
    boyut += parca.length
    if (boyut > sinir) throw Object.assign(new Error('Gövde çok büyük'), { durum: 413 })
    parcalar.push(parca)
  }
  const metin = Buffer.concat(parcalar).toString('utf8')
  const tur = istek.headers['content-type'] ?? ''
  if (!metin) return {}
  if (tur.includes('application/json')) {
    try {
      return JSON.parse(metin)
    } catch {
      throw Object.assign(new Error('Geçersiz JSON'), { durum: 400 })
    }
  }
  if (tur.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(metin))
  return { data: metin }
}

/**
 * @param {{ akislar: any[], depo?: YurutmeDeposu, govdeSiniri?: number, calistirmaSecenekleri?: object }} ayar
 */
export function webhookSunucusu(ayar) {
  const depo = ayar.depo ?? new YurutmeDeposu()
  /** @type {Map<string, { akis: IsAkisi, dugum: any }>} */
  const kayitli = new Map()
  for (const veri of ayar.akislar) {
    if (veri.active === false) continue
    const akis = new IsAkisi(veri)
    for (const dugum of akis.dugumler.values()) {
      if (dugum.type !== WEBHOOK_TIPI || dugum.disabled) continue
      const yontem = (dugum.parameters?.httpMethod ?? 'GET').toUpperCase()
      const yol = String(dugum.parameters?.path ?? '').replace(/^\/+|\/+$/g, '')
      const anahtar = `${yontem} ${yol}`
      if (kayitli.has(anahtar)) throw new Error(`Webhook yolu zaten kullanımda: ${anahtar}`) // n8n: WebhookPathTakenError
      kayitli.set(anahtar, { akis, dugum })
    }
  }

  /** @param {import('node:http').ServerResponse} yanit @param {number} durum @param {unknown} veri */
  const json = (yanit, durum, veri) => {
    const metin = JSON.stringify(veri)
    yanit.writeHead(durum, { 'content-type': 'application/json; charset=utf-8' })
    yanit.end(metin)
  }

  const sunucu = createServer(async (istek, yanit) => {
    try {
      const adres = new URL(istek.url ?? '/', 'http://yerel')
      const parcalar = adres.pathname.split('/').filter(Boolean)
      if (istek.method === 'GET' && parcalar[0] === 'executions') {
        if (!parcalar[1]) return json(yanit, 200, { data: depo.ozet() })
        const kayit = depo.al(parcalar[1])
        return kayit ? json(yanit, 200, kayit) : json(yanit, 404, { message: 'Yürütme bulunamadı' })
      }
      if (parcalar[0] !== 'webhook') return json(yanit, 404, { message: 'Bulunamadı' })
      const yol = parcalar.slice(1).join('/')
      const hedef = kayitli.get(`${istek.method} ${yol}`)
      if (!hedef) return json(yanit, 404, { code: 404, message: `"${istek.method} ${yol}" webhook'u kayıtlı değil` })

      const tetikleyiciVerisi = {
        headers: istek.headers,
        params: {},
        query: Object.fromEntries(adres.searchParams),
        body: await govdeyiOku(istek, ayar.govdeSiniri ?? 1_000_000),
      }
      const calisma = akisiCalistir(hedef.akis, {
        ...ayar.calistirmaSecenekleri,
        baslangic: hedef.dugum.name,
        tetikleyiciVerisi,
        mod: 'webhook',
      }).then((sonuc) => {
        depo.ekle(sonuc)
        return sonuc
      })
      if ((hedef.dugum.parameters?.responseMode ?? 'onReceived') !== 'lastNode') {
        calisma.catch(() => {}) // yanıt verildi; hata yürütme kaydında görünür
        return json(yanit, 200, { message: 'Workflow was started' })
      }
      const sonuc = await calisma
      if (sonuc.status !== 'success') return json(yanit, 500, { message: 'Error in workflow' })
      const son = dugumCiktisi(sonuc, sonuc.data.resultData.lastNodeExecuted)
      return json(yanit, 200, son[0]?.json ?? {})
    } catch (hata) {
      const durum = /** @type {any} */ (hata).durum ?? 500
      return json(yanit, durum, { message: hata instanceof Error ? hata.message : String(hata) })
    }
  })
  return { sunucu, depo, kayitli }
}
