// Aşama 2 — Test çalıştırıcı: öğrenci kodunu ayrı bir bağlamda çalıştır, gizli testleri koş, sonuç ver.
//
// Gerçekte bu iş tarayıcıda yapılır: istemci (client/src/templates/Challenges/redux/execute-challenge-saga.js)
// kodu derler (buildChallenge: packages/challenge-builder/src/build.ts), bir test çalıştırıcı alır
// (getTestRunner: client/src/templates/Challenges/utils/build.ts) ve her ipucunun test dizgisini
// 5 saniyelik zaman aşımıyla çalıştırır (executeTests, testTimeout = 5000). Çalıştırıcının kendisi ayrı bir
// pakettedir: @freecodecamp/curriculum-helpers (tools/client-plugins/browser-scripts/test-runner.ts bunu içe aktarır).
//
// UYARI: node:vm bir GÜVENLİK SINIRI DEĞİLDİR (Node belgeleri de böyle der). Burada yalnızca kendi
// alıştırmalarımızı çalıştırıyoruz. Güvenilmeyen kodu sunucuda çalıştıracaksan ayrı süreç + konteyner +
// kaynak sınırı kullan. freeCodeCamp kodu kullanıcının tarayıcısında, sandbox'lı iframe/worker içinde çalıştırır.

import vm from 'node:vm'
import util from 'node:util'

export class AssertionError extends Error {
  constructor(mesaj) {
    super(mesaj)
    this.name = 'AssertionError'
  }
}

/**
 * Yapısal eşitlik. util.isDeepStrictEqual kullanmıyoruz: öğrenci kodunun ürettiği diziler vm bağlamının
 * kendi Array.prototype'ına sahip ("başka bir realm"), prototip karşılaştırması bu yüzden yanlış "eşit değil" der.
 */
export function derinEsit(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const tur = Object.prototype.toString
  if (tur.call(a) !== tur.call(b)) return false
  if (tur.call(a) === '[object Date]') return a.getTime() === b.getTime()
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && derinEsit(a[k], b[k]))
}

/** Gerçek testlerin kullandığı chai `assert` arayüzünün küçük bir alt kümesi. */
export function assertOlustur() {
  const yaz = (v) => util.inspect(v, { depth: 3 })
  const fail = (mesaj) => {
    throw new AssertionError(mesaj)
  }
  const assert = (kosul, mesaj = 'beklenen doğru bir değerdi') => {
    if (!kosul) fail(mesaj)
  }
  Object.assign(assert, {
    isTrue: (v, m) => v === true || fail(m ?? `${yaz(v)} true değil`),
    isFalse: (v, m) => v === false || fail(m ?? `${yaz(v)} false değil`),
    equal: (a, b, m) => a == b || fail(m ?? `${yaz(a)} == ${yaz(b)} değil`),
    strictEqual: (a, b, m) => a === b || fail(m ?? `${yaz(a)} === ${yaz(b)} değil`),
    notStrictEqual: (a, b, m) => a !== b || fail(m ?? `${yaz(a)} ile ${yaz(b)} aynı olmamalıydı`),
    deepEqual: (a, b, m) => derinEsit(a, b) || fail(m ?? `${yaz(a)} ile ${yaz(b)} derinlemesine eşit değil`),
    isDefined: (v, m) => v !== undefined || fail(m ?? 'değer tanımsız'),
    isUndefined: (v, m) => v === undefined || fail(m ?? `${yaz(v)} tanımsız olmalıydı`),
    isNotNull: (v, m) => v !== null || fail(m ?? 'değer null'),
    isNumber: (v, m) => typeof v === 'number' || fail(m ?? `${yaz(v)} sayı değil`),
    isString: (v, m) => typeof v === 'string' || fail(m ?? `${yaz(v)} metin değil`),
    isFunction: (v, m) => typeof v === 'function' || fail(m ?? `${yaz(v)} fonksiyon değil`),
    isArray: (v, m) => Array.isArray(v) || fail(m ?? `${yaz(v)} dizi değil`),
    isAtLeast: (v, alt, m) => v >= alt || fail(m ?? `${yaz(v)} >= ${alt} değil`),
    isAtMost: (v, ust, m) => v <= ust || fail(m ?? `${yaz(v)} <= ${ust} değil`),
    include: (kap, oge, m) => (kap != null && kap.includes(oge)) || fail(m ?? `${yaz(kap)} içinde ${yaz(oge)} yok`),
    match: (v, re, m) => re.test(v) || fail(m ?? `${yaz(v)} ${re} ile eşleşmiyor`),
    notMatch: (v, re, m) => !re.test(v) || fail(m ?? `${yaz(v)} ${re} ile eşleşmemeliydi`),
    lengthOf: (v, n, m) => v?.length === n || fail(m ?? `uzunluk ${v?.length}, beklenen ${n}`),
    throws: (f, m) => {
      try {
        f()
      } catch {
        return
      }
      fail(m ?? 'hata fırlatması bekleniyordu')
    },
  })
  return assert
}

/** Testlerin `__helpers` üzerinden kullandığı yardımcılar (gerçek: curriculum-helpers). */
export const yardimcilar = Object.freeze({
  /** Yorumları silerek "öğrenci şu satırı yazdı mı?" türü regex testlerini sağlamlaştırır. */
  removeJSComments: (kod) => kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'),
  removeWhiteSpace: (kod) => kod.replace(/\s+/g, ''),
})

/**
 * @typedef {{ text: string, gecti: boolean, hata?: string }} TestSonucu
 * @typedef {{ sonuclar: TestSonucu[], konsol: string[], hepsiGecti: boolean, kodHatasi?: string }} CalismaSonucu
 */

/** Zaman aşımı mesajını öğrenciye anlaşılır yap. */
function hataMetni(e) {
  if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'Zaman aşımı: kodun bitmedi (sonsuz döngü olabilir mi?)'
  if (e && e.name === 'AssertionError') return e.message
  return `${e?.name ?? 'Hata'}: ${e?.message ?? String(e)}`
}

/**
 * Asılı kalan Promise'i keser. Sınırı: `await`'ten sonra dönen bir sonsuz döngü mikro görev olarak ana olay
 * döngüsünü kilitler; ne vm zaman aşımı ne bu zamanlayıcı onu durdurabilir. Çare: vm.createContext'e
 * { microtaskMode: 'afterEvaluate' } vermek ya da kodu worker_threads'te koşup terminate() etmek (README).
 * @param {Promise<unknown>} p @param {number} ms
 */
function zamanSiniri(p, ms) {
  let zamanlayici
  const sinir = new Promise((_, reject) => {
    zamanlayici = setTimeout(
      () => reject(Object.assign(new Error('zaman aşımı'), { code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' })),
      ms,
    )
  })
  return Promise.race([p, sinir]).finally(() => clearTimeout(zamanlayici))
}

/**
 * Öğrenci kodunu çalıştırır ve meydan okumanın ipuçlarını test olarak koşar.
 * Sıra: beforeAll → öğrenci kodu → her test için (beforeEach → test → afterEach) → afterAll.
 * @param {{ challenge: import('./asama1_ayristirici.js').MeydanOkuma, code: string, zamanAsimiMs?: number }} p
 * @returns {Promise<CalismaSonucu>}
 */
export async function runTests({ challenge, code, zamanAsimiMs = 5000 }) {
  /** @type {string[]} */
  const konsol = []
  const sahteKonsol = {
    log: (...a) => konsol.push(a.map((x) => (typeof x === 'string' ? x : util.inspect(x))).join(' ')),
  }
  sahteKonsol.info = sahteKonsol.log
  sahteKonsol.warn = sahteKonsol.log
  sahteKonsol.error = sahteKonsol.log

  // Her çalıştırmada yeni ve boş bir global nesne: önceki öğrencinin değişkenleri sızmaz.
  const baglam = vm.createContext({
    console: sahteKonsol,
    assert: assertOlustur(),
    code,
    __helpers: yardimcilar,
  })
  const calistir = (kaynak, ad) => vm.runInContext(kaynak, baglam, { timeout: zamanAsimiMs, filename: ad })
  const asenkronCalistir = async (kaynak, ad) => {
    // `await` kullanabilen testler için async sarmalayıcı; senkron sonsuz döngüyü vm, asenkronu zamanSiniri keser.
    const p = calistir(`(async () => {\n${kaynak}\n})()`, ad)
    await zamanSiniri(Promise.resolve(p), zamanAsimiMs)
  }

  const { hooks = {} } = challenge
  /** @type {string | undefined} */
  let kodHatasi
  try {
    if (hooks.beforeAll) calistir(hooks.beforeAll, 'before-all.js')
    calistir(code, 'ogrenci.js')
  } catch (e) {
    kodHatasi = hataMetni(e)
  }

  /** @type {TestSonucu[]} */
  const sonuclar = []
  for (const [i, ipucu] of challenge.hints.entries()) {
    if (kodHatasi) {
      sonuclar.push({ text: ipucu.text, gecti: false, hata: kodHatasi })
      continue
    }
    try {
      if (hooks.beforeEach) await asenkronCalistir(hooks.beforeEach, 'before-each.js')
      await asenkronCalistir(ipucu.testString, `test-${i + 1}.js`)
      sonuclar.push({ text: ipucu.text, gecti: true })
    } catch (e) {
      sonuclar.push({ text: ipucu.text, gecti: false, hata: hataMetni(e) })
    } finally {
      if (hooks.afterEach) {
        try {
          await asenkronCalistir(hooks.afterEach, 'after-each.js')
        } catch {
          // temizlik hatası testi değiştirmez
        }
      }
    }
  }
  if (hooks.afterAll && !kodHatasi) {
    try {
      calistir(hooks.afterAll, 'after-all.js')
    } catch {
      // temizlik hatası sonucu değiştirmez
    }
  }
  return { sonuclar, konsol, hepsiGecti: sonuclar.length > 0 && sonuclar.every((s) => s.gecti), kodHatasi }
}

/**
 * Müfredat bakımcısının testi: her meydan okumanın kendi çözümleri kendi testlerinden geçmeli.
 * (Gerçek: curriculum/src/test/test-challenges.js)
 * @param {import('./asama1_ayristirici.js').MeydanOkuma} challenge
 */
export async function cozumleriDogrula(challenge) {
  const raporlar = []
  for (const cozum of challenge.solutions) {
    const kod = cozum.map((d) => d.contents).join('\n')
    raporlar.push(await runTests({ challenge, code: kod }))
  }
  return raporlar
}
