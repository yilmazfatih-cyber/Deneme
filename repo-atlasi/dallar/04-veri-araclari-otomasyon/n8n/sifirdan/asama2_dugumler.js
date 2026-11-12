// Aşama 2 — düğüm tipleri kayıt defteri.
//
// n8n'de her düğüm bir INodeType'tır (packages/workflow/src/interfaces.ts): bir
// 'description' (ad, girdiler, çıktılar, parametreler) ve execute/trigger/webhook
// fonksiyonları. 400'ü aşkın yerleşik düğüm packages/nodes-base/nodes/ altındadır.
// Veri hep "öğe dizisi"dir: [{ json: {...}, binary?, pairedItem? }, ...]. Bir düğüm
// her ÇIKIŞI için ayrı bir öğe dizisi döndürür (If: [doğrular, yanlışlar]).

import { Worker } from 'node:worker_threads'

/** @typedef {{ json: Record<string, any>, pairedItem?: { item: number } }} Oge */
/**
 * @typedef {{
 *   dugum: { name: string, type: string, parameters?: Record<string, any> },
 *   girdiler: Oge[][],
 *   parametre: (ad: string, indeks?: number, varsayilan?: any) => any,
 *   tetikleyiciVerisi?: Record<string, any>,
 *   gunluk: (mesaj: string) => void,
 *   fetch: typeof fetch,
 *   zamanAsimiMs: number,
 * }} Baglam
 */
/**
 * @typedef {{
 *   tetikleyici?: boolean,
 *   girdiSayisi: number,
 *   ciktiSayisi: number,
 *   gerekliGirdiler?: (dugum: any) => number | number[],
 *   calistir: (b: Baglam) => Oge[][] | Promise<Oge[][]>,
 * }} DugumTipi
 */

export class DugumHatasi extends Error {}

/** @type {Map<string, DugumTipi>} */
export const dugumTipleri = new Map()

/** @param {string} ad @param {DugumTipi} tip */
export function dugumTipiKaydet(ad, tip) {
  dugumTipleri.set(ad, tip)
}

// --- tetikleyiciler -----------------------------------------------------------------------
dugumTipiKaydet('n8n-nodes-base.manualTrigger', {
  tetikleyici: true,
  girdiSayisi: 0,
  ciktiSayisi: 1,
  calistir: () => [[{ json: {} }]], // asıl düğüm de tek boş öğe yayar
})

dugumTipiKaydet('n8n-nodes-base.webhook', {
  tetikleyici: true,
  girdiSayisi: 0,
  ciktiSayisi: 1,
  // Webhook sunucusu isteği { headers, params, query, body } biçiminde verir
  calistir: (b) => [[{ json: b.tetikleyiciVerisi ?? {} }]],
})

// --- Set ("Edit Fields", v3.3+ parametre biçimi) ---------------------------------------------
/** @param {Record<string, any>} hedef @param {string} yol @param {unknown} deger */
function yolaYaz(hedef, yol, deger) {
  const parcalar = yol.split('.')
  if (parcalar.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) {
    throw new DugumHatasi(`Geçersiz alan adı: ${yol}`)
  }
  let gecerli = hedef
  for (const parca of parcalar.slice(0, -1)) {
    if (gecerli[parca] === null || typeof gecerli[parca] !== 'object') gecerli[parca] = {}
    gecerli = gecerli[parca]
  }
  gecerli[parcalar[parcalar.length - 1]] = deger
}

/** @param {unknown} deger @param {string} tur @param {string} ad */
function turaCevir(deger, tur, ad) {
  switch (tur) {
    case 'number': {
      const sayi = Number(deger)
      if (deger === '' || Number.isNaN(sayi)) throw new DugumHatasi(`'${ad}' sayıya çevrilemedi: ${deger}`)
      return sayi
    }
    case 'boolean':
      return deger === true || deger === 'true' || deger === 1 || deger === '1'
    case 'array':
    case 'object': {
      const cozulmus = typeof deger === 'string' ? JSON.parse(deger) : deger
      if (tur === 'array' ? !Array.isArray(cozulmus) : typeof cozulmus !== 'object') {
        throw new DugumHatasi(`'${ad}' ${tur} değil`)
      }
      return cozulmus
    }
    default:
      return deger === null || deger === undefined
        ? ''
        : typeof deger === 'object'
          ? JSON.stringify(deger)
          : String(deger)
  }
}

dugumTipiKaydet('n8n-nodes-base.set', {
  girdiSayisi: 1,
  ciktiSayisi: 1,
  calistir(b) {
    return [
      (b.girdiler[0] ?? []).map((oge, i) => {
        const atamalar = b.parametre('assignments', i, {}).assignments ?? []
        const noktali = b.parametre('options', i, {}).dotNotation !== false
        const yeni = b.parametre('includeOtherFields', i, false) ? structuredClone(oge.json) : {}
        for (const { name, value, type } of atamalar) {
          const deger = turaCevir(value, type ?? 'string', name)
          if (noktali) yolaYaz(yeni, name, deger)
          else yeni[name] = deger
        }
        return { json: yeni, pairedItem: { item: i } }
      }),
    ]
  },
})

// --- If (v2 koşul biçimi) ---------------------------------------------------------------------
/** @type {Record<string, (a: any, b: any) => boolean>} */
const ISLEMLER = {
  'string:equals': (a, b) => a === b,
  'string:notEquals': (a, b) => a !== b,
  'string:contains': (a, b) => a.includes(b),
  'string:notContains': (a, b) => !a.includes(b),
  'string:startsWith': (a, b) => a.startsWith(b),
  'string:endsWith': (a, b) => a.endsWith(b),
  'string:regex': (a, b) => new RegExp(b).test(a),
  'number:equals': (a, b) => a === b,
  'number:notEquals': (a, b) => a !== b,
  'number:gt': (a, b) => a > b,
  'number:lt': (a, b) => a < b,
  'number:gte': (a, b) => a >= b,
  'number:lte': (a, b) => a <= b,
  'boolean:true': (a) => a === true,
  'boolean:false': (a) => a === false,
  'boolean:equals': (a, b) => a === b,
  'array:contains': (a, b) => a.includes(b),
}
const BOS_MU = (/** @type {any} */ v) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length)

/** @param {any} deger @param {string} tur @param {boolean} gevsek */
function kosulTuru(deger, tur, gevsek) {
  if (deger === undefined || deger === null) return deger
  if (tur === 'number') {
    if (typeof deger === 'number') return deger
    if (gevsek && deger !== '' && !Number.isNaN(Number(deger))) return Number(deger)
  } else if (tur === 'boolean') {
    if (typeof deger === 'boolean') return deger
    if (gevsek && (deger === 'true' || deger === 'false')) return deger === 'true'
  } else if (tur === 'string') {
    if (typeof deger === 'string') return deger
    if (gevsek) return String(deger)
  } else if (tur === 'array' && Array.isArray(deger)) return deger
  throw new DugumHatasi(
    `Tür uyuşmazlığı: ${JSON.stringify(deger)} bir ${tur} değil (gevşek denetim için typeValidation: "loose")`,
  )
}

/** @param {any} kosul @param {{ caseSensitive?: boolean, typeValidation?: string }} secenek */
function kosulDogruMu(kosul, secenek) {
  const { type: tur, operation: islem } = kosul.operator ?? {}
  if (islem === 'exists') return kosul.leftValue !== undefined && kosul.leftValue !== null
  if (islem === 'notExists') return kosul.leftValue === undefined || kosul.leftValue === null
  if (islem === 'empty') return BOS_MU(kosul.leftValue)
  if (islem === 'notEmpty') return !BOS_MU(kosul.leftValue)
  const fonk = ISLEMLER[`${tur}:${islem}`]
  if (!fonk) throw new DugumHatasi(`Desteklenmeyen işlem: ${tur}.${islem}`)
  const gevsek = secenek.typeValidation === 'loose'
  let sol = kosulTuru(kosul.leftValue, tur, gevsek)
  let sag = islem === 'regex' || tur === 'array' ? kosul.rightValue : kosulTuru(kosul.rightValue, tur, gevsek)
  if (sol === undefined || sol === null) return false
  if (tur === 'string' && secenek.caseSensitive === false) {
    sol = sol.toLocaleLowerCase('tr-TR')
    sag = String(sag).toLocaleLowerCase('tr-TR')
  }
  return fonk(sol, sag)
}

dugumTipiKaydet('n8n-nodes-base.if', {
  girdiSayisi: 1,
  ciktiSayisi: 2, // 0: doğru, 1: yanlış
  calistir(b) {
    /** @type {Oge[]} */
    const dogru = []
    /** @type {Oge[]} */
    const yanlis = []
    ;(b.girdiler[0] ?? []).forEach((oge, i) => {
      const { conditions = [], combinator = 'and', options = {} } = b.parametre('conditions', i, {})
      const sonuclar = conditions.map((/** @type {any} */ k) => kosulDogruMu(k, options))
      const gecti = combinator === 'or' ? sonuclar.some(Boolean) : sonuclar.every(Boolean)
      ;(gecti ? dogru : yanlis).push({ json: oge.json, pairedItem: { item: i } })
    })
    return [dogru, yanlis]
  },
})

// --- HTTP Request (v4 parametre biçiminin alt kümesi) ---------------------------------------
/** @param {any} liste */
const ciftler = (liste) =>
  (liste?.parameters ?? []).map((/** @type {any} */ p) => [String(p.name), String(p.value ?? '')])

dugumTipiKaydet('n8n-nodes-base.httpRequest', {
  girdiSayisi: 1,
  ciktiSayisi: 1,
  async calistir(b) {
    const ogeler = b.girdiler[0]?.length ? b.girdiler[0] : [{ json: {} }]
    /** @type {Oge[]} */
    const cikti = []
    for (let i = 0; i < ogeler.length; i++) {
      const url = new URL(b.parametre('url', i))
      if (b.parametre('sendQuery', i, false)) {
        for (const [ad, deger] of ciftler(b.parametre('queryParameters', i, {}))) url.searchParams.append(ad, deger)
      }
      /** @type {Record<string, string>} */
      const basliklar = {}
      if (b.parametre('sendHeaders', i, false)) {
        for (const [ad, deger] of ciftler(b.parametre('headerParameters', i, {}))) basliklar[ad.toLowerCase()] = deger
      }
      let govde
      if (b.parametre('sendBody', i, false)) {
        if (b.parametre('specifyBody', i, 'keypair') === 'json') {
          const json = b.parametre('jsonBody', i, '{}')
          govde = typeof json === 'string' ? json : JSON.stringify(json)
        } else govde = JSON.stringify(Object.fromEntries(ciftler(b.parametre('bodyParameters', i, {}))))
        basliklar['content-type'] ??= 'application/json'
      }
      const yanit = await b.fetch(url, {
        method: b.parametre('method', i, 'GET'),
        headers: basliklar,
        body: govde,
        signal: AbortSignal.timeout(b.zamanAsimiMs),
      })
      const metin = await yanit.text()
      if (!yanit.ok) throw new DugumHatasi(`HTTP ${yanit.status}: ${metin.slice(0, 200)}`)
      let veri
      try {
        veri = JSON.parse(metin)
      } catch {
        veri = { data: metin }
      }
      // Yanıt bir diziyse her elemanı ayrı öğe yap (sonraki düğümler öğe başına çalışır)
      for (const j of Array.isArray(veri) ? veri : [veri]) {
        cikti.push({
          json: j !== null && typeof j === 'object' && !Array.isArray(j) ? j : { data: j },
          pairedItem: { item: i },
        })
      }
    }
    return [cikti]
  },
})

// --- Code (JavaScript) -------------------------------------------------------------------------
// Kod, sonlandırılabilir bir işçi iş parçacığında ve onun içindeki node:vm bağlamında çalışır
// (bkz. kod-iscisi.js). node:vm tek başına güvenlik sınırı DEĞİLDİR; n8n Code düğümünü ayrı
// "task runner" SÜREÇLERİNDE çalıştırır (packages/@n8n/task-runner, task-runner-python).

/** @param {string} kod @param {Oge[]} ogeler @param {string} kip @param {Baglam} b @returns {Promise<any[]>} */
function iscideCalistir(kod, ogeler, kip, b) {
  return new Promise((coz, reddet) => {
    const isci = new Worker(new URL('./kod-iscisi.js', import.meta.url), {
      workerData: { kod, veri: JSON.stringify(ogeler), kip },
      resourceLimits: { maxOldGenerationSizeMb: 64 }, // bellek patlamasına karşı
    })
    const bitir = (/** @type {() => void} */ sonra) => {
      clearTimeout(zamanlayici)
      isci.removeAllListeners()
      isci.terminate().then(sonra, sonra)
    }
    const zamanlayici = setTimeout(
      () => bitir(() => reddet(new DugumHatasi(`Kod zaman aşımına uğradı (${b.zamanAsimiMs} ms)`))),
      b.zamanAsimiMs,
    )
    isci.once('message', (m) =>
      bitir(() => (m.tamam ? coz(m.sonuclar) : reddet(new DugumHatasi(`Kod hatası: ${m.mesaj}`)))),
    )
    isci.once('error', (e) => bitir(() => reddet(new DugumHatasi(`Kod hatası: ${e.message}`))))
  })
}

/** @param {any} deger @returns {Oge} */
function ogeyeCevir(deger) {
  if (deger === null || typeof deger !== 'object' || Array.isArray(deger)) {
    throw new DugumHatasi(`Kod nesne döndürmeli, gelen: ${JSON.stringify(deger)}`)
  }
  return deger.json !== null && typeof deger.json === 'object' ? { json: deger.json } : { json: deger }
}

dugumTipiKaydet('n8n-nodes-base.code', {
  girdiSayisi: 1,
  ciktiSayisi: 1,
  async calistir(b) {
    const kod = b.dugum.parameters?.jsCode ?? '' // kod bir ifade değildir; çözülmez
    const kip = b.parametre('mode', 0, 'runOnceForAllItems')
    const ogeler = b.girdiler[0] ?? []
    const sonuclar = await iscideCalistir(kod, ogeler, kip, b)
    for (const { gunluk } of sonuclar) for (const satir of gunluk) b.gunluk(`[console] ${satir}`)
    const hatali = sonuclar.find((s) => s.hata !== undefined)
    if (hatali) throw new DugumHatasi(`Kod hatası: ${hatali.hata}`)
    if (kip === 'runOnceForEachItem') {
      return [
        sonuclar.map(({ sonuc }, i) => {
          if (Array.isArray(sonuc)) throw new DugumHatasi('Öğe başına kipte tek bir nesne döndürün')
          return { ...ogeyeCevir(sonuc), pairedItem: { item: i } }
        }),
      ]
    }
    const { sonuc } = sonuclar[0]
    return [(Array.isArray(sonuc) ? sonuc : [sonuc]).map(ogeyeCevir)]
  },
})

// --- Merge (v3: append ve combine/combineByPosition) -------------------------------------------
dugumTipiKaydet('n8n-nodes-base.merge', {
  girdiSayisi: 2,
  ciktiSayisi: 1,
  // Asıl tanımda: requiredInputs = mode === 'chooseBranch' ? [0, 1] : 1
  gerekliGirdiler: () => 1,
  calistir(b) {
    const [a = [], c = []] = b.girdiler
    const kip = b.parametre('mode', 0, 'append')
    if (kip === 'append') return [[...a, ...c]]
    if (kip === 'combine' && b.parametre('combineBy', 0, 'combineByFields') === 'combineByPosition') {
      const n = Math.min(a.length, c.length)
      return [Array.from({ length: n }, (_, i) => ({ json: { ...a[i].json, ...c[i].json } }))]
    }
    throw new DugumHatasi(`Bu mini sürümde desteklenmeyen Merge kipi: ${kip}`)
  },
})

dugumTipiKaydet('n8n-nodes-base.noOp', {
  girdiSayisi: 1,
  ciktiSayisi: 1,
  calistir: (b) => [b.girdiler[0] ?? []],
})
