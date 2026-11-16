/**
 * ek — özel adlara, sayılara ve kısaltmalara kesme işaretiyle ek getirir: Ankara'ya, İzmir'e, Zonguldak'ta,
 * Ayşe'nin, 3'te, 6'ya, 40'ı, 2026'da, %20'si, TDK'nin, İstanbul Üniversitesi'ne.
 *
 * Kullanım:
 *   addSuffix('Ankara', 'dative')                       // "Ankara'ya"
 *   addSuffix('2026', 'locative')                       // "2026'da"
 *   addSuffix('%20', 'possessive')                      // "%20'si"
 *   addSuffix('1990', ['plural', 'locative'])           // "1990'larda"   (ekler zincirlenir)
 *   addSuffix('Shakespeare', 'genitive', { pronunciation: 'şekspir' })   // "Shakespeare'in"
 *   suffixOf('Zonguldak', 'ablative')                   // "tan"   (yalnız ek)
 *
 * Nasıl çalışır: Ek, metnin SON SÖZCÜĞÜNÜN OKUNUŞUNA göre seçilir (son ünlü → ünlü uyumu; son ses → kaynaştırma
 * ünsüzü ve d/t). Sayılarda okunuş hesaplanır (2026 → "altı", 40 → "kırk", 1000 → "bin", saat 09.00 → "dokuz",
 * 3,5 → "beş", 3/4 → "üç"). BÜYÜK harfli kısaltmalar harf harf okunur (TDK → "ke" → TDK'nin); sözcük gibi
 * okunabilenler sözcük sayılır (NATO'ya, ASELSAN'ın). Birimler okunuşuyla eklenir (kg'dan, cm'yi).
 *
 * Sınırlar (bilerek kapsam dışı):
 *  - Cins adlar ve ünsüz yumuşaması (kitap → kitabı, renk → rengi) YOK; bu modül yalnız kesmeyle ayrılan eklere bakar.
 *  - Okunuşu yazımından çıkmayan yabancı adlar ve kısaltmalar için `pronunciation` verin (Bordeaux → 'bordo',
 *    CNN → 'en', BIST → 'bist'). Son hecesi ince okunan adlarda (yerleşik listede olmayan) `front: true` verin.
 *  - Belirtisiz tamlama biçimindeki adlar (… Üniversitesi, Kuşadası) bir sözcük listesinden tanınır ve araya "n"
 *    alır (Üniversitesi'ne). Listede olmayanlar için `compound: true` (ör. Beylerbeyi), yanlış tanınanlar için
 *    `compound: false` verin.
 *  - Noktalı kısaltmalar (vb., Alm.), Roma rakamları ve "3,5" → "üç buçuk" okunuşu desteklenmez.
 *  - Çoğul eki özel adlarda TDK kuralınca kesmesiz yazılır (Ahmetler); sayı ve kısaltmalarda kesmelidir (1990'lar).
 *
 * Genişletme: Yeni ek türü `TEMPLATES`'e bir satırdır (A = e/a, I = i/ı/u/ü, D = d/t). Yeni tamlama başı
 * `HEAD_WORDS`'e, ince okunan ad `FRONT_WORDS`'e, birim `UNITS`'e eklenir. Her ekleme için
 * `vektorler/ek.json` dosyasına örnek yazın.
 */

export type SuffixKind =
  | 'dative' // yönelme: -e/-a
  | 'locative' // bulunma: -de/-da/-te/-ta
  | 'ablative' // ayrılma: -den/-dan/-ten/-tan
  | 'accusative' // belirtme: -i/-ı/-u/-ü
  | 'genitive' // tamlayan: -in/-ın/-un/-ün
  | 'instrumental' // birliktelik: -le/-la
  | 'plural' // çoğul: -ler/-lar
  | 'possessive' // 3. tekil iyelik: -i/-si (%20'si, 5'i)
  | 'ordinal' // sıra: -inci (8'inci)
  | 'lik' // -lik (5'lik, %10'luk)

export interface SuffixOptions {
  /** Okunuş ipucu: sözcüğün Türkçe harflerle okunuşu (yalnız sonu önemlidir). */
  pronunciation?: string
  /** Son hece ince okunuyorsa `true` (Kemal'e, Seul'ü, saat'e gibi). */
  front?: boolean
  /** Belirtisiz tamlama mı (… Üniversitesi'ne)? Verilmezse listeden tanınır. */
  compound?: boolean
  /** Kesme işareti; varsayılan "'" (özel adın çoğulunda boş). */
  apostrophe?: string
}

export class SuffixError extends Error {
  override name = 'SuffixError'
}

/** [ünsüzden sonra, ünlüden sonra, iyelikten/tamlamadan sonra] — A: e/a, I: i/ı/u/ü, D: d/t */
const TEMPLATES: Record<SuffixKind, readonly [string, string, string]> = {
  dative: ['A', 'yA', 'nA'],
  locative: ['DA', 'DA', 'ndA'],
  ablative: ['DAn', 'DAn', 'ndAn'],
  accusative: ['I', 'yI', 'nI'],
  genitive: ['In', 'nIn', 'nIn'],
  instrumental: ['lA', 'ylA', 'ylA'],
  plural: ['lAr', 'lAr', 'lAr'],
  possessive: ['I', 'sI', 'sI'],
  ordinal: ['IncI', 'ncI', 'ncI'],
  lik: ['lIk', 'lIk', 'lIk'],
}

const VOWELS = 'aeıioöuüâîû'
const VOICELESS = 'çfhkpsşt'
const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
const CURRENCIES: Record<string, string> = { '₺': 'lira', $: 'dolar', '€': 'avro', '£': 'sterlin' }
const FRONT_OF: Record<string, string> = { a: 'e', ı: 'i', o: 'ö', u: 'ü' }
const CLOSERS = '.,;:!?)]}"\'\u{201d}\u{2019}\u{bb}'

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter((word) => word !== ''))

/** Son hecesi ince okunan (kalın ünlülü ama ince ek alan) adlar. */
const FRONT_WORDS = words(`kemal cemal celal bilal hilal nihal zuhal meral şevval iclal ikbal visal zülal resul
  istiklal alp gökalp seul ziraat saat`)

/** Sözcük gibi okunan kısaltmalarda kabul edilen çift ünsüzlü bitişler (TÜRK, SWIFT…). */
const CODAS = words(`lt lk lp lç lf ls rt rk rp rç rs rş rf rz rm rn rd nt nk nç ns nd ng mp st sk sp şt şk ft ht
  kt ks ps yt yk yp vk zm`)

/** Birimler ve okunuşları (TDK: küçük harfli kısaltmalara ek, okunuşa göre gelir). */
const UNITS = new Map<string, string>(
  `mm:milimetre cm:santimetre dm:desimetre m:metre km:kilometre m²:metrekare m2:metrekare km²:kilometrekare
  km2:kilometrekare m³:metreküp m3:metreküp g:gram gr:gram mg:miligram kg:kilogram t:ton l:litre lt:litre L:litre
  ml:mililitre mL:mililitre cl:santilitre sn:saniye dk:dakika sa:saat kr:kuruş kWh:kilovatsaat kW:kilovat W:vat
  V:volt Hz:hertz KB:kilobayt MB:megabayt GB:gigabayt TB:terabayt ha:hektar da:dekar px:piksel °C:derece °:derece`
    .split(/\s+/)
    .map((pair) => pair.split(':') as [string, string]),
)

/** Son sözcük bunlardan biriyse ad belirtisiz tamlamadır: "Ege Üniversitesi" → Üniversitesi'ne. */
const HEAD_WORDS = words(`üniversitesi fakültesi enstitüsü yüksekokulu lisesi okulu ilkokulu ortaokulu koleji
  akademisi kütüphanesi müzesi hastanesi kliniği eczanesi bankası bakanlığı başkanlığı cumhurbaşkanlığı müdürlüğü
  müsteşarlığı valiliği kaymakamlığı belediyesi muhtarlığı meclisi mahkemesi savcılığı barosu kurumu kurulu
  kuruluşu derneği vakfı odası birliği federasyonu konfederasyonu sendikası partisi cumhuriyeti devleti devletleri
  krallığı imparatorluğu emirliği emirlikleri şirketi holdingi fabrikası ajansı gazetesi dergisi yayınevi yayınları
  kanalı televizyonu radyosu caddesi sokağı bulvarı meydanı mahallesi ilçesi kasabası parkı bahçesi ormanı dağı
  dağları tepesi gölü nehri ırmağı denizi okyanusu boğazı körfezi adası adaları yarımadası burnu ovası vadisi
  yaylası geçidi mağarası şelalesi barajı köprüsü tüneli limanı havalimanı havaalanı garı istasyonu terminali
  otogarı durağı camii camisi kilisesi sinagogu türbesi külliyesi medresesi sarayı kasrı köşkü konağı kalesi hisarı
  kulesi anıtı çarşısı pazarı hamamı oteli tiyatrosu sineması operası stadyumu stadı kulübü salonu merkezi günü
  haftası bayramı festivali şenliği fuarı sergisi ödülü ödülleri kupası ligi şampiyonası turnuvası oyunları savaşı
  savaşları muharebesi zaferi antlaşması anlaşması sözleşmesi kanunu yasası anayasası yönetmeliği tüzüğü
  bildirgesi planı projesi programı hastalığı sendromu harekâtı harekatı operasyonu devrimi dönemi hanedanı
  beyliği sultanlığı hanlığı eyaleti bölgesi kıtası takımı sahili plajı feneri tersanesi üssü komutanlığı
  kuvvetleri teşkilatı örgütü konseyi komisyonu komitesi kongresi konferansı zirvesi forumu borsası fonu sigortası
  yolları yolu hattı metrosu tapınağı kapısı şehitliği mezarlığı başkanı cumhurbaşkanı başbakanı bakanı valisi
  kralı kraliçesi oğlu başı önü üstü ağzı suyu deresi gücü`)

/** Bitişik yazılan adlarda sözcüğün SONU bunlardan biriyse tamlamadır: Kuşadası, Zeytinburnu, Davutoğlu. */
const HEAD_ENDINGS = `oğlu adası burnu başı önü altı üstü ağzı dağı gölü pazarı hisarı limanı yolu boğazı deresi
  suyu tepesi kapısı kalesi köprüsü birliği gücü başkanı`.split(/\s+/)

/** Tamlama gibi görünen ama kalıplaşmış, ek alırken düz ad gibi davranan adlar. */
const NOT_COMPOUND = words('inönü')

interface Ending {
  vowel: string
  endsWithVowel: boolean
  voiceless: boolean
}

type TokenKind = 'word' | 'number' | 'abbreviation' | 'unit'

function lowerTr(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase() // harf: İ/I önce elle çevrildi
    .replace(/i\u{307}/gu, 'i')
}

function upperTr(text: string): string {
  return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase() // harf: i/ı önce elle çevrildi
}

function lettersOf(text: string): string[] {
  return Array.from(text).filter((ch) => /\p{L}/u.test(ch))
}

function endingOf(reading: string, front: boolean): Ending {
  const letters = lettersOf(reading)
  const last = letters[letters.length - 1] ?? ''
  let vowel = [...letters].reverse().find((ch) => VOWELS.includes(ch)) ?? 'e'
  vowel = vowel === 'â' ? 'a' : vowel === 'î' ? 'i' : vowel === 'û' ? 'u' : vowel
  if (front) vowel = FRONT_OF[vowel] ?? vowel
  return { vowel, endsWithVowel: VOWELS.includes(last) && last !== '', voiceless: VOICELESS.includes(last) && last !== '' }
}

function render(template: string, ending: Ending): string {
  const a = 'eiöü'.includes(ending.vowel) ? 'e' : 'a'
  const i = 'aı'.includes(ending.vowel) ? 'ı' : 'ou'.includes(ending.vowel) ? 'u' : 'öü'.includes(ending.vowel) ? 'ü' : 'i'
  return template
    .replace(/A/g, a)
    .replace(/I/g, i)
    .replace(/D/g, ending.voiceless ? 't' : 'd')
}

/** Rakam dizisinin okunuşundaki son sözcük: "2026" → "altı", "40" → "kırk", "1000" → "bin", "0" → "sıfır". */
function numberWord(digits: string): string {
  const significant = digits.replace(/^0+/, '')
  if (significant === '') return 'sıfır'
  const zeros = significant.length - significant.replace(/0+$/, '').length
  if (zeros === 0) return ONES[Number(significant.slice(-1))] ?? 'sıfır'
  if (zeros === 1) return TENS[Number(significant.slice(-2, -1))] ?? 'on'
  if (zeros === 2) return 'yüz'
  const group = Math.floor(zeros / 3)
  return group === 1 ? 'bin' : group === 3 ? 'milyar' : 'milyon' // trilyon, katrilyon… "milyon" gibi ek alır
}

function letterName(letter: string): string {
  if (VOWELS.includes(letter)) return letter
  return letter === 'q' ? 'kü' : letter === 'w' ? 've' : letter === 'x' ? 'iks' : `${letter}e`
}

function wordReading(lower: string): string {
  return lower.replace(/q/g, 'k').replace(/w/g, 'v').replace(/x/g, 'ks')
}

/** Büyük harfli kısaltmanın okunuşu: sözcük gibi okunabiliyorsa sözcük, değilse son harfin adı. */
function abbreviationReading(lower: string): string {
  const letters = Array.from(lower)
  const last = letters[letters.length - 1] ?? ''
  let lastVowelAt = -1
  letters.forEach((ch, index) => {
    if (VOWELS.includes(ch)) lastVowelAt = index
  })
  if (lastVowelAt === -1 || letters.length <= 2) return letterName(last)
  const tail = letters.slice(lastVowelAt + 1).join('')
  if (tail.length > 2 || (tail.length === 2 && !CODAS.has(tail))) return letterName(last)
  return wordReading(lower)
}

function numericReading(chunk: string): string | null {
  for (const [symbol, name] of Object.entries(CURRENCIES)) {
    if (chunk.includes(symbol) && (/\d/.test(chunk) || chunk === symbol)) return name
  }
  const plain = chunk.replace(/%/g, '')
  const time = /^(\d{1,2})[.:](\d{2})$/.exec(plain)
  if (time) return numberWord(time[2] === '00' ? (time[1] ?? '') : (time[2] ?? ''))
  const fraction = /^(\d+)\/(\d+)$/.exec(plain)
  if (fraction) return numberWord(fraction[1] ?? '')
  const trailing = /(\d[\d.]*)(?:,(\d+))?$/.exec(plain)
  if (!trailing) return null
  return numberWord(trailing[2] ?? (trailing[1] ?? '').replace(/\./g, ''))
}

function classify(text: string): { kind: TokenKind; reading: string; word: string } {
  let chunk = text.normalize('NFC').trim().split(/\s+/).pop() ?? ''
  while (chunk.length > 1 && CLOSERS.includes(chunk.slice(-1))) chunk = chunk.slice(0, -1)
  const unit = UNITS.get(chunk) ?? UNITS.get(chunk.replace(/^[\d.,+\-%]+/, ''))
  if (unit !== undefined) return { kind: 'unit', reading: unit, word: '' }
  const numeric = numericReading(chunk)
  if (numeric !== null) return { kind: 'number', reading: numeric, word: '' }
  const token = /\p{L}+$/u.exec(chunk)?.[0] ?? ''
  if (token === '') throw new SuffixError(`"${text}" içinde ek getirilecek harf ya da rakam bulunamadı.`)
  const lower = lowerTr(token)
  const allCaps = token === upperTr(token) && token !== lower
  if (Array.from(token).length === 1) return { kind: 'abbreviation', reading: letterName(lower), word: '' }
  if (allCaps) return { kind: 'abbreviation', reading: abbreviationReading(lower), word: '' }
  if (!Array.from(lower).some((ch) => VOWELS.includes(ch))) {
    return { kind: 'abbreviation', reading: letterName(lower.slice(-1)), word: '' }
  }
  return { kind: 'word', reading: wordReading(lower), word: lower }
}

function isCompound(text: string, word: string): boolean {
  if (word === '' || NOT_COMPOUND.has(word)) return false
  if (HEAD_WORDS.has(word)) return true
  if (HEAD_ENDINGS.some((head) => word.length > head.length && word.endsWith(head))) return true
  if (!/\s/.test(text.trim())) return false
  const pluralPossessive = /^(.{3,})(ları|leri)$/u.exec(word) // Kaz Dağları, Türk Hava Yolları
  if (!pluralPossessive) return false
  const stemIsFront = 'eiöü'.includes(endingOf(pluralPossessive[1] ?? '', false).vowel)
  return (pluralPossessive[2] === 'leri') === stemIsFront
}

function isFront(reading: string): boolean {
  const last = reading.trim().split(/\s+/).pop() ?? ''
  return FRONT_WORDS.has(last) || last.endsWith('saat') || /[âû]l$/.test(last)
}

/** Ekin seçilmesinde kullanılan okunuşu verir: "2026" → "altı", "TDK" → "ke", "Ankara" → "ankara". */
export function readingForSuffix(text: string, options: SuffixOptions = {}): string {
  const hint = options.pronunciation?.trim() ?? ''
  if (hint !== '') return wordReading(lowerTr(hint))
  if (text.trim() === '') throw new SuffixError('Ek getirilecek metin boş olamaz.')
  return classify(text).reading
}

function resolve(text: string, kinds: SuffixKind | readonly SuffixKind[], options: SuffixOptions) {
  const list = typeof kinds === 'string' ? [kinds] : kinds
  if (list.length === 0) throw new SuffixError('En az bir ek türü verin (örnek: "dative").')
  if (text.trim() === '') throw new SuffixError('Ek getirilecek metin boş olamaz.')
  const source = classify(text)
  const reading = readingForSuffix(text, options)
  let ending = endingOf(reading, options.front ?? isFront(reading))
  let pronominal = options.compound ?? isCompound(text, source.word)
  let suffix = ''
  for (const kind of list) {
    const template = (TEMPLATES as Record<string, readonly [string, string, string] | undefined>)[kind]
    if (!template) throw new SuffixError(`Bilinmeyen ek türü: "${kind}". Geçerli türler: ${Object.keys(TEMPLATES).join(', ')}.`)
    const part = render(pronominal ? template[2] : ending.endsWithVowel ? template[1] : template[0], ending)
    suffix += part
    ending = endingOf(part, false)
    pronominal = kind === 'possessive' // iyelik ekinden sonra araya "n" girer: %20'sini
  }
  const defaultApostrophe = list[0] === 'plural' && source.kind === 'word' ? '' : "'"
  return { suffix, apostrophe: options.apostrophe ?? defaultApostrophe }
}

/** Yalnız eki döndürür: suffixOf('Zonguldak', 'locative') → "ta". Birden çok ek zincirlenebilir. */
export function suffixOf(text: string, kinds: SuffixKind | readonly SuffixKind[], options: SuffixOptions = {}): string {
  return resolve(text, kinds, options).suffix
}

/** Metne kesme işaretiyle ek getirir: addSuffix('İzmir', 'dative') → "İzmir'e". */
export function addSuffix(text: string, kinds: SuffixKind | readonly SuffixKind[], options: SuffixOptions = {}): string {
  const { suffix, apostrophe } = resolve(text, kinds, options)
  return text.trimEnd() + apostrophe + suffix
}
