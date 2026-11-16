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
 * Ek türleri: dative (yönelme -e/-a), locative (bulunma -de/-da/-te/-ta), ablative (ayrılma -den/-tan),
 * accusative (belirtme -i/-ı/-u/-ü), genitive (tamlayan -in/-nin), instrumental (birliktelik -le/-yla),
 * plural (çoğul -ler/-lar), possessive (iyelik -i/-si), ordinal (sıra -inci), lik (-lik/-lık), li (-li/-lı).
 *
 * Nasıl çalışır: Ek, metnin SON SÖZCÜĞÜNÜN OKUNUŞUNA göre seçilir (son ünlü → ünlü uyumu; son ses → kaynaştırma
 * ünsüzü ve d/t). Sayılarda okunuş hesaplanır (2026 → "altı", 40 → "kırk", 1000 → "bin", saat 09.00 → "dokuz",
 * 3,5 → "beş", 3/4 → "üç"). BÜYÜK harfli kısaltmalar harf harf okunur (TDK → "ke" → TDK'nin); sözcük gibi
 * okunabilenler sözcük sayılır (NATO'ya, ASELSAN'ın). Birimler okunuşuyla eklenir (kg'dan, cm'yi).
 *
 * Sınırlar (bilerek kapsam dışı):
 *  - Cins adlar ve ünsüz yumuşaması (kitap → kitabı, renk → rengi) YOK; bu modül yalnız kesmeyle ayrılan eklere bakar.
 *  - Okunuşu yazımından çıkmayan yabancı adlar ve kısaltmalar için `pronunciation` verin (Bordeaux → 'bordo',
 *    CNN İngilizce okunuşla → 'en'). Son hecesi ince okunan, listede olmayan adlarda `front: true` verin.
 *  - Belirtisiz tamlama biçimindeki adlar (… Üniversitesi, Kuşadası) bir sözcük listesinden tanınır ve araya "n"
 *    alır (Üniversitesi'ne). Listede olmayanlar için `compound: true`, yanlış tanınanlar için `compound: false` verin.
 *  - ASCII ile yazılmış büyük I Türkçe kuralla "ı" okunur (BIST → 'bıst'); "İ" kastediliyorsa okunuş verin.
 *  - Noktalı kısaltmalar (vb., A.Ş.), Roma rakamları ve "3,5" → "üç buçuk" okunuşu desteklenmez. Metni sondaki
 *    noktalama olmadan verin. Ek her zaman küçük harfle yazılır (BÜYÜK metinde sonucu kendiniz büyütün).
 *  - Çoğul eki özel adlarda TDK kuralınca kesmesiz yazılır (Ahmetler, Ahmetlere); sayı ve kısaltmalarda kesmelidir.
 *
 * Genişletme: Yeni ek türü `TEMPLATES`'e bir satırdır (A = e/a, I = i/ı/u/ü, D = d/t). Yeni tamlama başı
 * `HEAD_WORDS`'e, ince okunan ad `FRONT_WORDS`'e, birim `UNITS`'e eklenir. Her ekleme için `vektorler/ek.json`
 * dosyasına örnek yazın; aynı örnek Python eşini de sınar.
 */

export type SuffixKind =
  | 'dative'
  | 'locative'
  | 'ablative'
  | 'accusative'
  | 'genitive'
  | 'instrumental'
  | 'plural'
  | 'possessive'
  | 'ordinal'
  | 'lik'
  | 'li'

export interface SuffixOptions {
  /** Okunuş ipucu: sözcüğün Türkçe harflerle okunuşu (yalnız sonu önemlidir). */
  pronunciation?: string
  /** Son hece ince okunuyorsa `true` (Kemal'e, Seul'ü). */
  front?: boolean
  /** Belirtisiz tamlama mı (… Üniversitesi'ne)? Verilmezse listeden tanınır. */
  compound?: boolean
  /** Kesme işareti; varsayılan "'" (özel adın çoğulunda boş). */
  apostrophe?: string
}

export class SuffixError extends Error {
  override name = 'SuffixError'
}

/** [ünsüzden sonra, ünlüden sonra, iyelik/tamlamadan sonra] — A: e/a, I: i/ı/u/ü, D: d/t */
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
  li: ['lI', 'lI', 'lI'],
}

const VOWELS = 'aeıioöuüâîû'
const VOICELESS = 'çfhkpsşt'
const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
const CURRENCIES: Record<string, string> = { '₺': 'lira', $: 'dolar', '€': 'avro', '£': 'sterlin' }
const FRONT_OF: Record<string, string> = { a: 'e', ı: 'i', o: 'ö', u: 'ü' }
const CLOSERS = '.,;:!?)]}"\'\u{201d}\u{2019}\u{bb}'
const WS = /[ \t\n\r\f\v\u{a0}]+/u

const wordSet = (list: string): Set<string> => new Set(list.split(WS).filter((word) => word !== ''))

/** Son hecesi ince okunan (kalın ünlülü ama ince ek alan) adlar. */
const FRONT_WORDS = wordSet(`kemal cemal celal bilal hilal nihal zuhal iclal ikbal visal zülal şevval resul istiklal
  alp gökalp seul ziraat saat`)

/** Sözcük gibi okunan kısaltmalarda kabul edilen çift ünsüzlü bitişler (TÜRK, BIST…). */
const CODAS = wordSet(`lt lk lp lç lf ls rt rk rp rç rs rş rf rz rm rn rd nt nk nç ns nd ng mp st sk sp şt şk ft ht
  kt ks ps yt yk yp vk zm`)

/** Birimler ve okunuşları (TDK: küçük harfli kısaltmalara ek, okunuşa göre gelir). */
const UNITS = new Map<string, string>(
  `mm:milimetre cm:santimetre dm:desimetre m:metre km:kilometre m²:metrekare m2:metrekare km²:kilometrekare
  km2:kilometrekare m³:metreküp m3:metreküp g:gram gr:gram mg:miligram kg:kilogram t:ton l:litre lt:litre
  ml:mililitre mL:mililitre cl:santilitre sn:saniye dk:dakika sa:saat kr:kuruş kWh:kilovatsaat kW:kilovat
  Hz:hertz KB:kilobayt MB:megabayt GB:gigabayt TB:terabayt ha:hektar da:dekar px:piksel °C:derece °:derece`
    .split(WS)
    .map((pair) => pair.split(':') as [string, string]),
)

/** Son sözcük bunlardan biriyse ad belirtisiz tamlamadır: "Ege Üniversitesi" → Üniversitesi'ne. */
const HEAD_WORDS = wordSet(`üniversitesi fakültesi enstitüsü yüksekokulu lisesi okulu ilkokulu ortaokulu koleji
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
const HEAD_ENDINGS = `oğlu adası burnu başı önü üstü ağzı dağı gölü pazarı hisarı limanı yolu boğazı deresi suyu
  tepesi kapısı kalesi köprüsü birliği gücü başkanı`.split(WS)

/** Tamlama gibi görünen ama kalıplaşmış, ek alırken düz ad gibi davranan adlar. */
const NOT_COMPOUND = wordSet('inönü')

interface Ending {
  vowel: string
  endsWithVowel: boolean
  voiceless: boolean
}

interface Source {
  kind: 'word' | 'number' | 'abbreviation' | 'unit'
  reading: string
  word: string
}

function strip(text: string): string {
  return text.replace(/^[ \t\n\r\f\v\u{a0}]+|[ \t\n\r\f\v\u{a0}]+$/gu, '')
}

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

function endingOf(reading: string, front: boolean): Ending {
  const letters = Array.from(reading).filter((ch) => /\p{L}/u.test(ch))
  const last = letters[letters.length - 1] ?? ''
  let vowel = [...letters].reverse().find((ch) => VOWELS.includes(ch)) ?? 'e'
  vowel = vowel === 'â' ? 'a' : vowel === 'î' ? 'i' : vowel === 'û' ? 'u' : vowel
  if (front) vowel = FRONT_OF[vowel] ?? vowel
  return {
    vowel,
    endsWithVowel: last !== '' && VOWELS.includes(last),
    voiceless: last !== '' && VOICELESS.includes(last),
  }
}

function render(template: string, ending: Ending): string {
  const v = ending.vowel
  const a = 'eiöü'.includes(v) ? 'e' : 'a'
  const i = 'aı'.includes(v) ? 'ı' : 'ou'.includes(v) ? 'u' : 'öü'.includes(v) ? 'ü' : 'i'
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
    if (chunk.includes(symbol) && (/[0-9]/.test(chunk) || chunk === symbol)) return name
  }
  const plain = chunk.replace(/%/g, '')
  const time = /^([0-9]{1,2})[.:]([0-9]{2})$/.exec(plain)
  if (time) return numberWord(time[2] === '00' ? (time[1] ?? '') : (time[2] ?? ''))
  const fraction = /^([0-9]+)\/([0-9]+)$/.exec(plain)
  if (fraction) return numberWord(fraction[1] ?? '')
  const trailing = /([0-9][0-9.]*)(?:,([0-9]+))?$/.exec(plain)
  if (!trailing) return null
  return numberWord(trailing[2] ?? (trailing[1] ?? '').replace(/\./g, ''))
}

function classify(text: string): Source {
  const parts = strip(text.normalize('NFC')).split(WS)
  let chunk = parts[parts.length - 1] ?? ''
  while (Array.from(chunk).length > 1 && CLOSERS.includes(chunk.slice(-1))) chunk = chunk.slice(0, -1)
  const unit = UNITS.get(chunk) ?? UNITS.get(chunk.replace(/^[0-9.,+\-%]+/, ''))
  if (unit !== undefined) return { kind: 'unit', reading: unit, word: '' }
  const numeric = numericReading(chunk)
  if (numeric !== null) return { kind: 'number', reading: numeric, word: '' }
  const token = /\p{L}+$/u.exec(chunk)?.[0] ?? ''
  if (token === '') throw new SuffixError(`"${text}" içinde ek getirilecek harf ya da rakam bulunamadı.`)
  const lower = lowerTr(token)
  if (Array.from(token).length === 1) return { kind: 'abbreviation', reading: letterName(lower), word: '' }
  if (token === upperTr(token) && token !== lower) {
    return { kind: 'abbreviation', reading: abbreviationReading(lower), word: '' }
  }
  if (!Array.from(lower).some((ch) => VOWELS.includes(ch))) {
    return { kind: 'abbreviation', reading: letterName(lower.slice(-1)), word: '' }
  }
  return { kind: 'word', reading: wordReading(lower), word: lower }
}

function isCompound(text: string, word: string): boolean {
  if (word === '' || NOT_COMPOUND.has(word)) return false
  if (HEAD_WORDS.has(word)) return true
  if (HEAD_ENDINGS.some((head) => word.length > head.length && word.endsWith(head))) return true
  if (!WS.test(strip(text))) return false
  const pluralPossessive = /^(.{3,})(ları|leri)$/u.exec(word) // Kaz Dağları, Türk Hava Yolları
  if (!pluralPossessive) return false
  const stemIsFront = 'eiöü'.includes(endingOf(pluralPossessive[1] ?? '', false).vowel)
  return (pluralPossessive[2] === 'leri') === stemIsFront
}

function isFront(reading: string): boolean {
  const parts = strip(reading).split(WS)
  const last = parts[parts.length - 1] ?? ''
  return FRONT_WORDS.has(last) || last.endsWith('saat') || /[âû]l$/.test(last)
}

/** Ekin seçilmesinde kullanılan okunuşu verir: "2026" → "altı", "TDK" → "ke", "Ankara" → "ankara". */
export function readingForSuffix(text: string, options: SuffixOptions = {}): string {
  const hint = strip(options.pronunciation ?? '')
  if (hint !== '') return wordReading(lowerTr(hint))
  if (strip(text) === '') throw new SuffixError('Ek getirilecek metin boş olamaz.')
  return classify(text).reading
}

function resolve(
  text: string,
  kinds: SuffixKind | readonly SuffixKind[],
  options: SuffixOptions,
): { suffix: string; apostrophe: string } {
  const list: readonly string[] = typeof kinds === 'string' ? [kinds] : kinds
  if (list.length === 0) throw new SuffixError('En az bir ek türü verin (örnek: "dative").')
  if (strip(text) === '') throw new SuffixError('Ek getirilecek metin boş olamaz.')
  const source = classify(text)
  const reading = readingForSuffix(text, options)
  let ending = endingOf(reading, options.front ?? isFront(reading))
  let pronominal = options.compound ?? isCompound(text, source.word)
  let suffix = ''
  for (const kind of list) {
    const template = (TEMPLATES as Record<string, readonly [string, string, string] | undefined>)[kind]
    if (template === undefined) {
      throw new SuffixError(`Bilinmeyen ek türü: "${kind}". Geçerli türler: ${Object.keys(TEMPLATES).join(', ')}.`)
    }
    const part = render(pronominal ? template[2] : ending.endsWithVowel ? template[1] : template[0], ending)
    if (suffix.endsWith('k') && VOWELS.includes(part[0] ?? '')) suffix = `${suffix.slice(0, -1)}ğ` // 5'liğe
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
export function addSuffix(
  text: string,
  kinds: SuffixKind | readonly SuffixKind[],
  options: SuffixOptions = {},
): string {
  const { suffix, apostrophe } = resolve(text, kinds, options)
  return text.replace(/[ \t\n\r\f\v\u{a0}]+$/u, '') + apostrophe + suffix
}
