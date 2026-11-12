// Aşama 4 — Eklenti bildirimi (package.json) ve katkı noktaları (contribution points).
//
// Eklenti kodunu çalıştırmadan önce VS Code yalnızca bildirimi okur: hangi komutları, tuşları,
// ayarları "katkı" olarak sunduğunu bilir, komut paletini doldurur ve eklentiyi ancak gerektiğinde
// (ör. komutu çağrılınca) yükler. Bu, binlerce eklentiyle bile açılışın hızlı kalmasının sırrıdır.
// Gerçek dosyalar:
//   src/vs/workbench/services/extensions/common/extensionsRegistry.ts   (registerExtensionPoint)
//   src/vs/workbench/services/actions/common/menusExtensionPoint.ts       ('commands' noktası)
//   src/vs/workbench/services/keybinding/browser/keybindingService.ts     ('keybindings' noktası)
//   src/vs/platform/extensionManagement/common/implicitActivationEvents.ts (örtük olaylar)
//   src/vs/platform/extensions/common/extensionValidator.ts               (bildirim doğrulama)

import fs from 'node:fs'
import path from 'node:path'
import { parseKeybinding, parseWhen } from './asama2_komutlar.js'

/**
 * @typedef {{ ad: string, dogrula: (deger: any, hata: (m: string) => void) => void,
 *             ortukOlaylar?: (deger: any) => string[] }} NoktaTanimi
 * @typedef {{ eklenti: string, deger: any }} Katki
 */

export class ExtensionPointRegistry {
  /** @type {Map<string, NoktaTanimi & { isleyici?: (katkilar: Katki[]) => void }>} */
  #noktalar = new Map()

  /** @param {NoktaTanimi} tanim */
  registerExtensionPoint(tanim) {
    if (this.#noktalar.has(tanim.ad)) throw new Error(`'${tanim.ad}' katkı noktası zaten var`)
    const nokta = { ...tanim }
    this.#noktalar.set(tanim.ad, nokta)
    return {
      /** @param {(katkilar: Katki[]) => void} isleyici */
      setHandler(isleyici) {
        nokta.isleyici = isleyici
      },
    }
  }

  has(ad) {
    return this.#noktalar.has(ad)
  }

  /** Kısayol: ada göre işleyici bağla. @param {string} ad @param {(katkilar: Katki[]) => void} isleyici */
  setHandler(ad, isleyici) {
    const nokta = this.#noktalar.get(ad)
    if (!nokta) throw new Error(`'${ad}' katkı noktası yok`)
    nokta.isleyici = isleyici
  }

  /** @param {string} ad */
  get(ad) {
    return this.#noktalar.get(ad)
  }

  adlar() {
    return [...this.#noktalar.keys()]
  }
}

const TIPLER = ['string', 'number', 'boolean', 'array', 'object']

function tipiUyarMi(tip, deger) {
  if (tip === 'array') return Array.isArray(deger)
  if (tip === 'object') return deger !== null && typeof deger === 'object' && !Array.isArray(deger)
  return typeof deger === tip
}

/** Yerleşik üç katkı noktasını kaydeder. */
export function varsayilanNoktalar() {
  const kayit = new ExtensionPointRegistry()
  kayit.registerExtensionPoint({
    ad: 'commands',
    dogrula(deger, hata) {
      const liste = Array.isArray(deger) ? deger : [deger]
      for (const k of liste) {
        if (!k || typeof k.command !== 'string' || !k.command) hata('commands: "command" alanı zorunlu bir metin')
        if (!k || typeof k.title !== 'string' || !k.title) hata(`commands: '${k?.command}' için "title" zorunlu`)
      }
    },
    // Gerçek koddaki gibi: komut katkısı otomatik olarak onCommand:<id> olayı üretir.
    ortukOlaylar: (deger) => (Array.isArray(deger) ? deger : [deger]).map((k) => `onCommand:${k.command}`),
  })
  kayit.registerExtensionPoint({
    ad: 'keybindings',
    dogrula(deger, hata) {
      for (const t of Array.isArray(deger) ? deger : [deger]) {
        if (!t || typeof t.command !== 'string') hata('keybindings: "command" zorunlu')
        try {
          parseKeybinding(String(t?.key ?? ''))
        } catch (e) {
          hata(`keybindings: geçersiz tuş '${t?.key}': ${e.message}`)
        }
        if (t?.when) {
          try {
            parseWhen(t.when)
          } catch (e) {
            hata(`keybindings: geçersiz when '${t.when}': ${e.message}`)
          }
        }
      }
    },
  })
  kayit.registerExtensionPoint({
    ad: 'configuration',
    dogrula(deger, hata) {
      const ozellikler = deger?.properties
      if (!ozellikler || typeof ozellikler !== 'object') return hata('configuration: "properties" nesnesi zorunlu')
      for (const [anahtar, sema] of Object.entries(ozellikler)) {
        if (!TIPLER.includes(sema.type)) hata(`configuration: '${anahtar}' için bilinmeyen tip '${sema.type}'`)
        else if ('default' in sema && !tipiUyarMi(sema.type, sema.default)) {
          hata(`configuration: '${anahtar}' varsayılanı ${sema.type} değil`)
        }
      }
    },
  })
  return kayit
}

/**
 * @typedef {{ id: string, dizin: string, main?: string, activationEvents: string[],
 *             contributes: Record<string, any>, manifest: any }} EklentiAciklamasi
 */

/**
 * Bir klasördeki eklentileri tarar: her alt klasörün package.json'unu okur ve doğrular.
 * Kod ÇALIŞTIRILMAZ; yalnızca bildirim okunur.
 * @param {string} kok
 * @param {ExtensionPointRegistry} noktalar
 * @returns {{ eklentiler: EklentiAciklamasi[], hatalar: string[] }}
 */
export function eklentileriTara(kok, noktalar) {
  const eklentiler = []
  const hatalar = []
  for (const ad of fs.readdirSync(kok).sort()) {
    const dizin = path.join(kok, ad)
    const bildirimYolu = path.join(dizin, 'package.json')
    if (!fs.existsSync(bildirimYolu)) continue
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(bildirimYolu, 'utf8'))
    } catch (e) {
      hatalar.push(`${ad}: package.json okunamadı (${e.message})`)
      continue
    }
    const sonuc = bildirimiDogrula(manifest, noktalar)
    if (sonuc.hatalar.length) {
      hatalar.push(...sonuc.hatalar.map((h) => `${ad}: ${h}`))
      continue
    }
    eklentiler.push({
      id: `${manifest.publisher}.${manifest.name}`,
      dizin,
      main: manifest.main,
      activationEvents: etkinlestirmeOlaylari(manifest, noktalar),
      contributes: manifest.contributes ?? {},
      manifest,
    })
  }
  return { eklentiler, hatalar }
}

/**
 * @param {any} manifest
 * @param {ExtensionPointRegistry} noktalar
 */
export function bildirimiDogrula(manifest, noktalar) {
  const hatalar = []
  const hata = (m) => hatalar.push(m)
  for (const alan of ['name', 'publisher', 'version']) {
    if (typeof manifest?.[alan] !== 'string' || !manifest[alan]) hata(`"${alan}" alanı zorunlu`)
  }
  if (manifest?.name && !/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) hata('"name" küçük harf, rakam ve tire içermeli')
  if (manifest?.activationEvents !== undefined && !Array.isArray(manifest.activationEvents)) {
    hata('"activationEvents" bir dizi olmalı')
  }
  for (const [nokta, deger] of Object.entries(manifest?.contributes ?? {})) {
    const tanim = noktalar.get(nokta)
    if (!tanim) {
      hata(`bilinmeyen katkı noktası '${nokta}'`)
      continue
    }
    tanim.dogrula(deger, hata)
  }
  return { hatalar }
}

/** Açık olaylar + katkılardan türeyen örtük olaylar. */
export function etkinlestirmeOlaylari(manifest, noktalar) {
  const olaylar = new Set(manifest.activationEvents ?? [])
  if (!manifest.main) return []
  for (const [nokta, deger] of Object.entries(manifest.contributes ?? {})) {
    const uretici = noktalar.get(nokta)?.ortukOlaylar
    if (uretici) for (const o of uretici(deger)) olaylar.add(o)
  }
  return [...olaylar]
}

/**
 * Her katkı noktasının işleyicisini, o noktaya katkı veren tüm eklentilerle çağırır.
 * @param {EklentiAciklamasi[]} eklentiler
 * @param {ExtensionPointRegistry} noktalar
 */
export function katkilariDagit(eklentiler, noktalar) {
  for (const ad of noktalar.adlar()) {
    const nokta = noktalar.get(ad)
    if (!nokta?.isleyici) continue
    const katkilar = eklentiler
      .filter((e) => ad in e.contributes)
      .map((e) => ({ eklenti: e.id, deger: e.contributes[ad] }))
    nokta.isleyici(katkilar)
  }
}
