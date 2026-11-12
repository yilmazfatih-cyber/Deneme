// Aşama 3 — yürütme motoru: n8n biçimindeki iş akışı JSON'unu çalıştırır.
//
// Asıl motor: packages/core/src/execution-engine/workflow-execute.ts (WorkflowExecute).
// Ana fikirler:
//   * nodeExecutionStack: çalıştırılmayı bekleyen düğümler (girdileriyle birlikte),
//   * waitingExecution: birden fazla girdisi olan düğüm (Merge) tüm girdileri gelene
//     kadar burada bekler; yığın boşalınca eksik girdiyle çalıştırılabilir (requiredInputs),
//   * runData: her düğümün her çalışmasının kaydı (başlangıç, süre, çıktılar, hata),
//   * executionOrder 'v1': bir dal bitmeden diğerine geçilmez (yığının BAŞINA ekleme) ve
//     kardeşler arasında tuvalde "sol üstteki önce" çalışır. Eski 'v0' kuyruk gibi
//     (sona ekleme) ilerler.

import { setTimeout as bekle } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import { ifadeOrtami, parametreleriCoz } from './asama1_ifade.js'
import { DugumHatasi, dugumTipleri } from './asama2_dugumler.js'

/** @typedef {import('./asama2_dugumler.js').Oge} Oge */
/** @typedef {{ name: string, type: string, position?: [number, number], parameters?: Record<string, any>,
 *   disabled?: boolean, continueOnFail?: boolean, onError?: string, retryOnFail?: boolean,
 *   maxTries?: number, waitBetweenTries?: number }} Dugum */
/** @typedef {{ node: string, type: string, index: number }} Baglanti */

export class AkisHatasi extends Error {}

export class IsAkisi {
  /** @param {any} veri n8n'den dışa aktarılmış iş akışı JSON'u @param {Map<string, any>} [tipler] */
  constructor(veri, tipler = dugumTipleri) {
    this.id = veri.id ?? ''
    this.ad = veri.name ?? 'Adsız akış'
    /** @type {Map<string, Dugum>} */
    this.dugumler = new Map(veri.nodes.map((/** @type {Dugum} */ d) => [d.name, d]))
    /** @type {Record<string, Record<string, (Baglanti[] | null)[]>>} */
    this.baglantilar = veri.connections ?? {}
    this.ayarlar = { executionOrder: 'v1', ...veri.settings }
    /** @type {Record<string, Oge[]>} */
    this.pinData = veri.pinData ?? {}
    this.tipler = tipler
    /** @type {Map<string, { sayi: number, ebeveynler: Set<string> }>} */
    this.girisler = new Map()
    for (const d of this.dugumler.values()) {
      if (!tipler.has(d.type)) throw new AkisHatasi(`Bilinmeyen düğüm tipi: ${d.type} (${d.name})`)
      this.girisler.set(d.name, { sayi: 0, ebeveynler: new Set() })
    }
    for (const [kaynak, turler] of Object.entries(this.baglantilar)) {
      for (const cikis of turler.main ?? []) {
        for (const b of cikis ?? []) {
          const hedef = this.girisler.get(b.node)
          if (!hedef || !this.dugumler.has(kaynak)) throw new AkisHatasi(`Geçersiz bağlantı: ${kaynak} -> ${b.node}`)
          hedef.sayi = Math.max(hedef.sayi, b.index + 1)
          hedef.ebeveynler.add(kaynak)
        }
      }
    }
  }

  /** @param {string} ad */
  dugum(ad) {
    const d = this.dugumler.get(ad)
    if (!d) throw new AkisHatasi(`Düğüm yok: ${ad}`)
    return d
  }

  baslangicDugumu() {
    const tetikleyici = [...this.dugumler.values()].find((d) => this.tipler.get(d.type)?.tetikleyici)
    if (!tetikleyici) throw new AkisHatasi('Akışta tetikleyici düğüm yok')
    return tetikleyici
  }

  /** Tüm atalar (yalnızca ebeveynler değil). @param {string} ad */
  atalar(ad, gorulen = new Set()) {
    for (const ebeveyn of this.girisler.get(ad)?.ebeveynler ?? []) {
      if (!gorulen.has(ebeveyn)) {
        gorulen.add(ebeveyn)
        this.atalar(ebeveyn, gorulen)
      }
    }
    return gorulen
  }
}

/** n8n de düğüm sınırında veriyi JSON'a normalleştirir. @param {unknown} cikti @param {string} ad @returns {Oge[][]} */
function ciktiyiNormallestir(cikti, ad) {
  if (!Array.isArray(cikti)) throw new DugumHatasi(`${ad}: çıktı dizi olmalı`)
  return cikti.map((ogeler) => (ogeler ?? []).map((/** @type {Oge} */ oge) => JSON.parse(JSON.stringify(oge))))
}

/**
 * @param {IsAkisi} akis
 * @param {{ baslangic?: string, tetikleyiciVerisi?: Record<string, any>, mod?: string, zamanAsimiMs?: number,
 *   fetch?: typeof fetch, kancalar?: { dugumOncesi?: (ad: string) => void,
 *   dugumSonrasi?: (ad: string, kayit: any) => void } }} [secenek]
 */
export async function akisiCalistir(akis, secenek = {}) {
  const yurutmeId = randomUUID()
  const baslangicZamani = new Date()
  const kancalar = secenek.kancalar ?? {}
  /** @type {Record<string, any[]>} */
  const calismaVerisi = {}
  /** @type {{ zaman: string, dugum: string, mesaj: string }[]} */
  const gunluk = []
  const yaz = (/** @type {string} */ dugum, /** @type {string} */ mesaj) =>
    gunluk.push({ zaman: new Date().toISOString(), dugum, mesaj })
  const v1 = akis.ayarlar.executionOrder === 'v1'

  /** @type {{ dugum: Dugum, girdi: Oge[][], kaynak: any[] | null }[]} */
  const yigin = [
    { dugum: secenek.baslangic ? akis.dugum(secenek.baslangic) : akis.baslangicDugumu(), girdi: [], kaynak: null },
  ]
  /** @type {Map<string, { girdi: (Oge[] | null)[], kaynak: any[] }>} */
  const bekleyen = new Map()
  let sonDugum = ''
  /** @type {{ message: string, node: string } | null} */
  let akisHatasi = null

  /** Bir çıkışın verisini hedef düğüme ilet (gerekirse bekleme odasına koy). */
  const ilet = (
    /** @type {Baglanti} */ b,
    /** @type {Oge[]} */ ogeler,
    /** @type {string} */ kaynak,
    /** @type {number} */ cikis,
  ) => {
    const hedef = akis.dugum(b.node)
    const sayi = akis.girisler.get(hedef.name)?.sayi ?? 1
    const kaynakBilgisi = { previousNode: kaynak, previousNodeOutput: cikis }
    const ekle = (/** @type {any} */ is) => (v1 ? yigin.unshift(is) : yigin.push(is))
    if (sayi <= 1) return ekle({ dugum: hedef, girdi: [ogeler], kaynak: [kaynakBilgisi] })
    const kayit = bekleyen.get(hedef.name) ?? { girdi: Array(sayi).fill(null), kaynak: Array(sayi).fill(null) }
    kayit.girdi[b.index] = ogeler
    kayit.kaynak[b.index] = kaynakBilgisi
    bekleyen.set(hedef.name, kayit)
    if (kayit.girdi.every((g) => g !== null)) {
      bekleyen.delete(hedef.name)
      ekle({ dugum: hedef, girdi: /** @type {Oge[][]} */ (kayit.girdi), kaynak: kayit.kaynak })
    }
  }

  /** Yığın boşaldı: bekleyenlerden eksik girdiyle çalışabilecek olanı seç (n8n v1 kuralı). */
  const bekleyeniCoz = () => {
    for (const [ad, kayit] of bekleyen) {
      const atalar = akis.atalar(ad)
      if ([...bekleyen.keys()].some((diger) => diger !== ad && atalar.has(diger))) continue
      const dugum = akis.dugum(ad)
      const gerekli = akis.tipler.get(dugum.type)?.gerekliGirdiler?.(dugum)
      const dolu = kayit.girdi.flatMap((g, i) => (g === null ? [] : [i]))
      if (Array.isArray(gerekli) ? gerekli.some((g) => !dolu.includes(g)) : dolu.length < (gerekli ?? 1)) continue
      if (!kayit.girdi.some((g) => g?.length)) continue
      bekleyen.delete(ad)
      return { dugum, girdi: kayit.girdi.map((g) => g ?? []), kaynak: kayit.kaynak }
    }
    return null
  }

  for (;;) {
    const is = yigin.shift() ?? bekleyeniCoz()
    if (!is) break
    const { dugum } = is
    const tip = akis.tipler.get(dugum.type)
    kancalar.dugumOncesi?.(dugum.name)
    yaz(dugum.name, 'başladı')
    const baslangic = Date.now()
    /** @type {Oge[][]} */
    let cikti = []
    /** @type {Error | null} */
    let hata = null

    if (dugum.disabled) {
      cikti = [is.girdi[0] ?? []] // devre dışı düğüm ilk girdisini aynen geçirir
    } else if (akis.pinData[dugum.name]) {
      cikti = [akis.pinData[dugum.name]] // sabitlenmiş veri: düğüm çalıştırılmaz
    } else {
      const denemeler = dugum.retryOnFail ? Math.min(5, Math.max(2, dugum.maxTries || 3)) : 1
      const beklemeMs = dugum.retryOnFail ? Math.min(5000, Math.max(0, dugum.waitBetweenTries ?? 1000)) : 0
      for (let deneme = 0; deneme < denemeler; deneme++) {
        if (deneme > 0) {
          yaz(dugum.name, `yeniden deneme ${deneme + 1}/${denemeler}`)
          await bekle(beklemeMs)
        }
        try {
          const ham = await tip.calistir({
            dugum,
            girdiler: is.girdi,
            tetikleyiciVerisi: secenek.tetikleyiciVerisi,
            fetch: secenek.fetch ?? globalThis.fetch,
            zamanAsimiMs: secenek.zamanAsimiMs ?? 5000,
            gunluk: (/** @type {string} */ mesaj) => yaz(dugum.name, mesaj),
            parametre(/** @type {string} */ ad, indeks = 0, varsayilan = undefined) {
              const ham = dugum.parameters?.[ad]
              if (ham === undefined) return varsayilan
              const ortam = ifadeOrtami({ ogeler: is.girdi[0] ?? [], indeks, calismaVerisi, akis, yurutmeId })
              return parametreleriCoz(ham, ortam)
            },
          })
          cikti = ciktiyiNormallestir(ham, dugum.name)
          hata = null
          break
        } catch (e) {
          hata = e instanceof Error ? e : new Error(String(e))
        }
      }
    }

    const kayit = {
      startTime: baslangic,
      executionTime: Date.now() - baslangic,
      executionStatus: 'success',
      source: is.kaynak,
      data: { main: cikti },
      ...(hata ? { error: { message: hata.message } } : {}),
    }
    if (hata) {
      yaz(dugum.name, `hata: ${hata.message}`)
      if (dugum.continueOnFail || dugum.onError === 'continueRegularOutput') {
        kayit.data.main = cikti = [[{ json: { error: hata.message } }]]
      } else if (dugum.onError === 'continueErrorOutput') {
        // Ek "hata" çıkışı: normal çıkışlar boş, hata öğesi son çıkışa
        kayit.data.main = cikti = [
          ...Array.from({ length: tip.ciktiSayisi }, () => []),
          [{ json: { error: hata.message } }],
        ]
      } else {
        kayit.executionStatus = 'error'
        akisHatasi = { message: hata.message, node: dugum.name }
      }
    }
    ;(calismaVerisi[dugum.name] ??= []).push(kayit)
    kancalar.dugumSonrasi?.(dugum.name, kayit)
    sonDugum = dugum.name
    if (akisHatasi) break
    yaz(dugum.name, `bitti: ${cikti.map((o) => o.length).join('/')} öğe`)

    // Çocukları topla; boş çıkışın alt dalı ÇALIŞMAZ
    /** @type {{ b: Baglanti, ogeler: Oge[], cikis: number }[]} */
    const eklenecekler = []
    for (const [cikis, ogeler] of cikti.entries()) {
      if (!ogeler.length) continue
      for (const b of akis.baglantilar[dugum.name]?.main?.[cikis] ?? []) eklenecekler.push({ b, ogeler, cikis })
    }
    if (v1) {
      // workflow-execute.ts'teki "top-left first" fikri: alttaki/sağdaki önce gelir, sonra her biri
      // yığının BAŞINA eklenir; sonuçta sol üstteki ilk çalışır. (Asıl karşılaştırıcı x için yalnızca
      // a.x > b.x durumunu ele alır; biz tutarlı, tam bir sıralama kullanıyoruz.)
      eklenecekler.sort((x, y) => {
        const [xx, xy] = akis.dugum(x.b.node).position ?? [0, 0]
        const [yx, yy] = akis.dugum(y.b.node).position ?? [0, 0]
        return yy - xy || yx - xx
      })
    }
    for (const e of eklenecekler) ilet(e.b, e.ogeler, dugum.name, e.cikis)
  }

  return {
    id: yurutmeId,
    workflowId: akis.id,
    mode: secenek.mod ?? 'manual',
    finished: !akisHatasi,
    status: akisHatasi ? 'error' : 'success',
    startedAt: baslangicZamani.toISOString(),
    stoppedAt: new Date().toISOString(),
    data: {
      resultData: { runData: calismaVerisi, lastNodeExecuted: sonDugum, ...(akisHatasi ? { error: akisHatasi } : {}) },
    },
    gunluk,
  }
}

/** Kolaylık: belirli bir düğümün son çalışmasının ilk çıkışındaki öğeler. @param {any} sonuc @param {string} ad */
export function dugumCiktisi(sonuc, ad, cikis = 0) {
  const kosular = sonuc.data.resultData.runData[ad]
  return kosular?.[kosular.length - 1]?.data.main[cikis] ?? []
}
