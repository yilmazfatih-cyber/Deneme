// Aşama 1 — ifadeler: "={{ $json.ad.toUpperCase() }}" gibi parametreleri GÜVENLİ değerlendirmek.
//
// n8n'de '=' ile başlayan her parametre bir ifadedir; '{{ }}' arası JavaScript'tir.
// Asıl projede üç katman var (packages/workflow/src/expression.ts):
//   1) "native evaluation": kapalı bir alt dil için süreç içi yorumlayıcı
//      (expressions/native-evaluation/: grammar, parser, evaluator),
//   2) olmazsa @n8n/tournament şablonu JS'e çevirir ve sandbox kancaları ekler,
//   3) kod izole V8 'isolate'larında çalışır (@n8n/expression-runtime, isolated-vm).
// Biz yalnızca 1. katmanın fikrini uyguluyoruz: kendi sözcük ayırıcımız ve
// ayrıştırıcımız var; metin ASLA kod olarak çalıştırılmaz (eval/Function yok),
// yalnızca izin listesindeki özellik ve metotlara erişilir.

export class IfadeHatasi extends Error {}

const SONUC_SINIRI = 1_000_000 // n8n'deki MAX_RESULT_LENGTH ile aynı büyüklük
const YASAK = new Set(['__proto__', 'prototype', 'constructor'])
const IZINLI_METOTLAR = {
  string: new Set(['toUpperCase', 'toLowerCase', 'toLocaleUpperCase', 'toLocaleLowerCase', 'trim', 'trimStart']),
  number: new Set(['toFixed', 'toString', 'toPrecision']),
  array: new Set(['includes', 'join', 'slice', 'indexOf', 'at', 'concat']),
}
for (const ad of ['trimEnd', 'includes', 'startsWith', 'endsWith', 'slice', 'substring', 'split', 'replace']) {
  IZINLI_METOTLAR.string.add(ad)
}
for (const ad of ['replaceAll', 'padStart', 'padEnd', 'indexOf', 'at', 'concat']) IZINLI_METOTLAR.string.add(ad)

/** İfadelerin çağırabileceği yardımcı fonksiyonlar (yalnızca bunlar). */
const GUVENLI_FONKSIYONLAR = new WeakSet()

/** @template {Record<string, unknown>} T @param {T} nesne @returns {T} */
export function guvenliNesne(nesne) {
  for (const deger of Object.values(nesne)) if (typeof deger === 'function') GUVENLI_FONKSIYONLAR.add(deger)
  return Object.freeze(nesne)
}

/** @param {Function} fonksiyon */
export function guvenliFonksiyon(fonksiyon) {
  GUVENLI_FONKSIYONLAR.add(fonksiyon)
  return fonksiyon
}

// --- 1) Sözcük ayırma -------------------------------------------------------------------
const JETON_RE =
  /(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_$][\w$]*)|(===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|[-+*/%<>!?:.,()[\]{}])/y
const KACIS = { n: '\n', t: '\t', r: '\r' }

/** @typedef {{ tur: 'sayi' | 'metin' | 'ad' | 'op', deger: any, konum: number }} Jeton */

/** @param {string} kaynak @returns {Jeton[]} */
function jetonla(kaynak) {
  const jetonlar = []
  let i = 0
  while (i < kaynak.length) {
    if (/\s/.test(kaynak[i])) {
      i++
      continue
    }
    JETON_RE.lastIndex = i
    const m = JETON_RE.exec(kaynak)
    if (!m) throw new IfadeHatasi(`Beklenmeyen karakter '${kaynak[i]}' (konum ${i})`)
    if (m[1] !== undefined) jetonlar.push({ tur: 'sayi', deger: Number(m[1]), konum: i })
    else if (m[2] !== undefined) {
      const govde = m[2].slice(1, -1).replace(/\\(.)/g, (_, k) => KACIS[/** @type {'n'} */ (k)] ?? k)
      jetonlar.push({ tur: 'metin', deger: govde, konum: i })
    } else if (m[3] !== undefined) jetonlar.push({ tur: 'ad', deger: m[3], konum: i })
    else jetonlar.push({ tur: 'op', deger: m[4], konum: i })
    i = JETON_RE.lastIndex
  }
  return jetonlar
}

// --- 2) Ayrıştırma (özyinelemeli iniş) ---------------------------------------------------
// Öncelik (düşükten yükseğe): ?: < ?? < || < && < == != < < > <= >= < + - < * / % < tekli < üye/çağrı
const IKILI_SEVIYELER = [
  ['||'],
  ['&&'],
  ['===', '!==', '==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
]

class Ayristirici {
  /** @param {string} kaynak */
  constructor(kaynak) {
    this.kaynak = kaynak
    this.j = jetonla(kaynak)
    this.i = 0
  }

  bak() {
    return this.j[this.i]
  }

  /** @param {string} op */
  opMu(op) {
    const j = this.bak()
    return j?.tur === 'op' && j.deger === op
  }

  /** @param {string} op */
  bekle(op) {
    if (!this.opMu(op)) throw new IfadeHatasi(`'${op}' bekleniyordu (konum ${this.bak()?.konum ?? this.kaynak.length})`)
    this.i++
  }

  tamami() {
    if (!this.j.length) throw new IfadeHatasi('Boş ifade')
    const dugum = this.kosul()
    if (this.i < this.j.length) throw new IfadeHatasi(`Fazla jeton: '${this.bak()?.deger}'`)
    return dugum
  }

  /** @returns {any} */
  kosul() {
    const test = this.bosBirlestirme()
    if (!this.opMu('?')) return test
    this.i++
    const evet = this.kosul()
    this.bekle(':')
    return { t: 'kosul', test, evet, hayir: this.kosul() }
  }

  bosBirlestirme() {
    let sol = this.ikili(0)
    while (this.opMu('??')) {
      this.i++
      sol = { t: 'mantik', op: '??', sol, sag: this.ikili(0) }
    }
    return sol
  }

  /** @param {number} seviye @returns {any} */
  ikili(seviye) {
    if (seviye === IKILI_SEVIYELER.length) return this.tekli()
    let sol = this.ikili(seviye + 1)
    while (this.bak()?.tur === 'op' && IKILI_SEVIYELER[seviye].includes(this.bak().deger)) {
      const op = this.j[this.i++].deger
      const sag = this.ikili(seviye + 1)
      sol = { t: op === '&&' || op === '||' ? 'mantik' : 'ikili', op, sol, sag }
    }
    return sol
  }

  /** @returns {any} */
  tekli() {
    if (this.opMu('!') || this.opMu('-') || this.opMu('+')) {
      const op = this.j[this.i++].deger
      return { t: 'tekli', op, arg: this.tekli() }
    }
    return this.sonek()
  }

  sonek() {
    let dugum = this.birincil()
    for (;;) {
      if (this.opMu('.') || this.opMu('?.')) {
        const opsiyonel = this.j[this.i++].deger === '?.'
        const ad = this.bak()
        if (ad?.tur !== 'ad') throw new IfadeHatasi(`'.' sonrası özellik adı bekleniyordu`)
        this.i++
        dugum = { t: 'uye', nesne: dugum, ozellik: { t: 'lit', v: ad.deger }, opsiyonel }
      } else if (this.opMu('[')) {
        this.i++
        const ozellik = this.kosul()
        this.bekle(']')
        dugum = { t: 'uye', nesne: dugum, ozellik, opsiyonel: false }
      } else if (this.opMu('(')) {
        this.i++
        const argumanlar = []
        while (!this.opMu(')')) {
          argumanlar.push(this.kosul())
          if (!this.opMu(')')) this.bekle(',')
        }
        this.i++
        dugum = { t: 'cagri', fonk: dugum, argumanlar }
      } else return dugum
    }
  }

  birincil() {
    const j = this.bak()
    if (!j) throw new IfadeHatasi('İfade erken bitti')
    this.i++
    if (j.tur === 'sayi' || j.tur === 'metin') return { t: 'lit', v: j.deger }
    if (j.tur === 'ad') {
      const sabitler = { true: true, false: false, null: null, undefined }
      if (j.deger in sabitler) return { t: 'lit', v: sabitler[/** @type {'true'} */ (j.deger)] }
      return { t: 'ad', ad: j.deger }
    }
    if (j.deger === '(') {
      const ic = this.kosul()
      this.bekle(')')
      return ic
    }
    if (j.deger === '[') {
      const ogeler = []
      while (!this.opMu(']')) {
        ogeler.push(this.kosul())
        if (!this.opMu(']')) this.bekle(',')
      }
      this.i++
      return { t: 'dizi', ogeler }
    }
    if (j.deger === '{') {
      // Nesne değişmezi: { ad: ifade, 'ad': ifade, ad } (kısa yazım)
      const ozellikler = []
      while (!this.opMu('}')) {
        const anahtar = this.j[this.i++]
        if (!anahtar || (anahtar.tur !== 'ad' && anahtar.tur !== 'metin'))
          throw new IfadeHatasi('Nesne anahtarı bekleniyordu')
        if (YASAK.has(anahtar.deger)) throw new IfadeHatasi(`'${anahtar.deger}' anahtarı yasak`)
        if (this.opMu(':')) {
          this.i++
          ozellikler.push([anahtar.deger, this.kosul()])
        } else if (anahtar.tur === 'ad') ozellikler.push([anahtar.deger, { t: 'ad', ad: anahtar.deger }])
        else throw new IfadeHatasi("':' bekleniyordu")
        if (!this.opMu('}')) this.bekle(',')
      }
      this.i++
      return { t: 'nesne', ozellikler }
    }
    throw new IfadeHatasi(`Beklenmeyen '${j.deger}' (konum ${j.konum})`)
  }
}

// --- 3) Yorumlama ------------------------------------------------------------------------------
/** @param {unknown} nesne @param {unknown} ad */
function ozellikOku(nesne, ad) {
  if (typeof ad !== 'string' && typeof ad !== 'number') throw new IfadeHatasi('Özellik adı metin ya da sayı olmalı')
  const anahtar = String(ad)
  if (YASAK.has(anahtar) || anahtar.startsWith('__')) throw new IfadeHatasi(`'${anahtar}' özelliğine erişim yasak`)
  if (typeof nesne === 'string' || Array.isArray(nesne)) {
    if (anahtar === 'length') return nesne.length
    if (/^\d+$/.test(anahtar)) return nesne[Number(anahtar)]
    throw new IfadeHatasi(`'${anahtar}' bu değerde okunamaz (metot ise çağırın)`)
  }
  if (nesne !== null && typeof nesne === 'object') {
    // Yalnızca KENDİ özellikleri: prototip zinciri (toString, constructor...) görünmez
    return Object.hasOwn(nesne, anahtar) ? /** @type {Record<string, unknown>} */ (nesne)[anahtar] : undefined
  }
  throw new IfadeHatasi(`${nesne === undefined ? 'undefined' : typeof nesne} üzerinde '${anahtar}' okunamaz`)
}

/** @param {unknown} sonuc */
function boyutDenetle(sonuc) {
  if (typeof sonuc === 'string' && sonuc.length > SONUC_SINIRI) throw new IfadeHatasi('Sonuç çok büyük')
  return sonuc
}

/** @param {unknown} nesne @param {string} ad @param {unknown[]} args */
function metotCagir(nesne, ad, args) {
  if (args.some((a) => typeof a === 'function')) throw new IfadeHatasi('Fonksiyon argüman olarak verilemez')
  if ((ad === 'padStart' || ad === 'padEnd') && Number(args[0]) > SONUC_SINIRI) throw new IfadeHatasi('Sonuç çok büyük')
  if (typeof nesne === 'string' && IZINLI_METOTLAR.string.has(ad)) {
    return boyutDenetle(/** @type {any} */ (String.prototype)[ad].apply(nesne, args))
  }
  if (typeof nesne === 'number' && IZINLI_METOTLAR.number.has(ad)) {
    return /** @type {any} */ (Number.prototype)[ad].apply(nesne, args)
  }
  if (Array.isArray(nesne) && IZINLI_METOTLAR.array.has(ad))
    return boyutDenetle(/** @type {any} */ (Array.prototype)[ad].apply(nesne, args))
  if (nesne !== null && typeof nesne === 'object' && Object.hasOwn(nesne, ad)) {
    const fonk = /** @type {any} */ (nesne)[ad]
    if (typeof fonk === 'function' && GUVENLI_FONKSIYONLAR.has(fonk)) return fonk(...args)
  }
  throw new IfadeHatasi(`İzin verilmeyen çağrı: ${ad}()`)
}

/** @param {any} d @param {Record<string, unknown>} ortam @returns {unknown} */
function degerlendir(d, ortam) {
  switch (d.t) {
    case 'lit':
      return d.v
    case 'ad':
      if (!Object.hasOwn(ortam, d.ad)) throw new IfadeHatasi(`Tanımsız değişken: ${d.ad}`)
      return ortam[d.ad]
    case 'dizi':
      return d.ogeler.map((/** @type {any} */ o) => degerlendir(o, ortam))
    case 'nesne': // Object.fromEntries: '__proto__' bile olsa prototip değil, sıradan alan olur
      return Object.fromEntries(d.ozellikler.map((/** @type {any[]} */ [k, v]) => [k, degerlendir(v, ortam)]))
    case 'uye': {
      const nesne = degerlendir(d.nesne, ortam)
      if (nesne === null || nesne === undefined) {
        if (d.opsiyonel) return undefined
        throw new IfadeHatasi(`${nesne} değerinin özelliği okunamaz`)
      }
      return ozellikOku(nesne, degerlendir(d.ozellik, ortam))
    }
    case 'cagri': {
      const args = d.argumanlar.map((/** @type {any} */ a) => degerlendir(a, ortam))
      if (d.fonk.t === 'uye') {
        const nesne = degerlendir(d.fonk.nesne, ortam)
        if ((nesne === null || nesne === undefined) && d.fonk.opsiyonel) return undefined
        return metotCagir(nesne, String(degerlendir(d.fonk.ozellik, ortam)), args)
      }
      const fonk = degerlendir(d.fonk, ortam)
      if (typeof fonk !== 'function' || !GUVENLI_FONKSIYONLAR.has(fonk)) throw new IfadeHatasi('Bu değer çağrılamaz')
      return fonk(...args)
    }
    case 'tekli': {
      const v = /** @type {any} */ (degerlendir(d.arg, ortam))
      return d.op === '!' ? !v : d.op === '-' ? -v : +v
    }
    case 'mantik': {
      const sol = degerlendir(d.sol, ortam)
      if (d.op === '&&') return sol ? degerlendir(d.sag, ortam) : sol
      if (d.op === '||') return sol ? sol : degerlendir(d.sag, ortam)
      return sol ?? degerlendir(d.sag, ortam)
    }
    case 'kosul':
      return degerlendir(d.test, ortam) ? degerlendir(d.evet, ortam) : degerlendir(d.hayir, ortam)
    case 'ikili': {
      const a = /** @type {any} */ (degerlendir(d.sol, ortam))
      const b = /** @type {any} */ (degerlendir(d.sag, ortam))
      switch (d.op) {
        case '+':
          return boyutDenetle(a + b)
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return a / b
        case '%':
          return a % b
        case '===':
          return a === b
        case '!==':
          return a !== b
        case '==':
          return a == b // JS'in gevşek eşitliği bilerek korunuyor ('1' == 1)
        case '!=':
          return a != b
        case '<':
          return a < b
        case '<=':
          return a <= b
        case '>':
          return a > b
        case '>=':
          return a >= b
      }
    }
  }
  throw new IfadeHatasi(`Bilinmeyen düğüm: ${d.t}`)
}

const onbellek = new Map() // aynı ifade her öğe için yeniden ayrıştırılmasın

/** @param {string} kaynak @param {Record<string, unknown>} ortam */
export function ifadeyiDegerlendir(kaynak, ortam) {
  let agac = onbellek.get(kaynak)
  if (!agac) {
    agac = new Ayristirici(kaynak).tamami()
    onbellek.set(kaynak, agac)
  }
  return degerlendir(agac, ortam)
}

// --- 4) Şablonlar: "=Merhaba {{ $json.ad }}!" ---------------------------------------------------
/** @param {unknown} deger @returns {deger is string} */
export const ifadeMi = (deger) => typeof deger === 'string' && deger.startsWith('=')

/** '{{' ... '}}' arasını bul; tırnak içindeki '}}' sayılmaz. @param {string} s @param {number} i */
function kapanisBul(s, i) {
  let tirnak = ''
  for (; i < s.length - 1; i++) {
    const c = s[i]
    if (tirnak) {
      if (c === '\\') i++
      else if (c === tirnak) tirnak = ''
    } else if (c === "'" || c === '"') tirnak = c
    else if (c === '}' && s[i + 1] === '}') return i
  }
  return -1
}

/** @param {string} sablon @returns {({ metin: string } | { ifade: string })[]} */
export function sablonParcala(sablon) {
  const parcalar = []
  let i = 0
  while (i < sablon.length) {
    const bas = sablon.indexOf('{{', i)
    if (bas === -1) {
      parcalar.push({ metin: sablon.slice(i) })
      break
    }
    if (bas > i) parcalar.push({ metin: sablon.slice(i, bas) })
    const son = kapanisBul(sablon, bas + 2)
    if (son === -1) throw new IfadeHatasi("Kapanmamış '{{'")
    parcalar.push({ ifade: sablon.slice(bas + 2, son) })
    i = son + 2
  }
  return parcalar
}

/** @param {unknown} v */
const metne = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/**
 * Tek bir parametre değerini çöz. '={{ x }}' tam olarak tek ifadeyse HAM değer döner
 * (sayı sayı olarak kalır); etrafında metin varsa her şey metne çevrilip birleştirilir.
 * @param {unknown} deger @param {Record<string, unknown>} ortam
 */
export function degeriCoz(deger, ortam) {
  if (!ifadeMi(deger)) return deger
  const parcalar = sablonParcala(deger.slice(1))
  if (parcalar.length === 1 && 'ifade' in parcalar[0]) return ifadeyiDegerlendir(parcalar[0].ifade, ortam)
  return parcalar.map((p) => ('metin' in p ? p.metin : metne(ifadeyiDegerlendir(p.ifade, ortam)))).join('')
}

/** Nesne/dizi içindeki bütün ifadeleri çöz (n8n parametreleri iç içe olabilir). @param {unknown} deger @param {Record<string, unknown>} ortam @returns {any} */
export function parametreleriCoz(deger, ortam) {
  if (Array.isArray(deger)) return deger.map((d) => parametreleriCoz(d, ortam))
  if (deger !== null && typeof deger === 'object') {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, parametreleriCoz(v, ortam)]))
  }
  return degeriCoz(deger, ortam)
}

/**
 * Bir öğe için ifade ortamı: $json, $input, $('Düğüm'), $node, $itemIndex ...
 * @param {{ ogeler: { json: Record<string, unknown> }[], indeks: number, calismaVerisi: Record<string, any[]>,
 *   akis?: { id?: string, name?: string }, yurutmeId?: string }} g
 */
export function ifadeOrtami({ ogeler, indeks, calismaVerisi, akis = {}, yurutmeId = '' }) {
  /** @param {{ json: Record<string, unknown> }[]} liste */
  const erisim = (liste) =>
    guvenliNesne({
      all: () => liste,
      first: () => liste[0],
      last: () => liste[liste.length - 1],
      item: liste[indeks] ?? liste[0], // n8n bunu pairedItem soyuyla bulur; biz aynı sıradakini alıyoruz
    })
  /** @param {string} ad */
  const dugumCiktisi = (ad) => {
    const kosular = calismaVerisi[ad]
    if (!kosular?.length) throw new IfadeHatasi(`'${ad}' düğümü henüz çalışmadı`)
    return kosular[kosular.length - 1].data.main[0] ?? []
  }
  const simdi = new Date()
  return {
    $json: ogeler[indeks]?.json ?? {},
    $input: erisim(ogeler),
    $: guvenliFonksiyon((/** @type {string} */ ad) => erisim(dugumCiktisi(ad))),
    $node: Object.fromEntries(Object.keys(calismaVerisi).map((ad) => [ad, { json: dugumCiktisi(ad)[0]?.json ?? {} }])),
    $itemIndex: indeks,
    $runIndex: 0,
    $now: simdi.toISOString(), // n8n'de Luxon DateTime nesnesi; biz ISO metni veriyoruz
    $today: simdi.toISOString().slice(0, 10),
    $workflow: { id: akis.id ?? '', name: akis.name ?? '' },
    $execution: { id: yurutmeId },
    Math: guvenliNesne({
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      min: Math.min,
      max: Math.max,
      abs: Math.abs,
    }),
    JSON: guvenliNesne({
      stringify: (/** @type {unknown} */ v) => JSON.stringify(v),
      parse: (/** @type {string} */ s) => JSON.parse(s),
    }),
    String: guvenliFonksiyon((/** @type {unknown} */ v) => String(v)),
    Number: guvenliFonksiyon((/** @type {unknown} */ v) => Number(v)),
  }
}
