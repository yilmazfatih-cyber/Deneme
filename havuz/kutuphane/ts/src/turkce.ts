/**
 * turkce — Türkçe metin işlemleri: büyük/küçük harf, başlık biçimi, ASCII'ye indirgeme, arama anahtarı,
 * kısa ad (slug), Türk alfabesine göre sıralama, heceleme ve ünlü uyumu yardımcıları.
 *
 * Neden var: `'i'.toUpperCase()` → 'I', `'I'.toLowerCase()` → 'i' ve `'İ'.toLowerCase()` → 'i' + U+0307 (iki
 * karakter!) Türkçe için YANLIŞTIR; `sort()` ise ç/ğ/ı/ö/ş/ü harflerini z'den sonraya atar. Buradaki işlevler
 * `Intl`'e ya da makinenin yerel ayarına bağlı DEĞİLDİR; tarayıcıda, Node'da ve Python eşinde aynı sonucu verir.
 *
 * Kullanım:
 *   upperTr('istanbul')                      // 'İSTANBUL'
 *   lowerTr('IŞIK')                          // 'ışık'
 *   titleCaseTr('İSTANBUL VE ANKARA')        // 'İstanbul ve Ankara'
 *   ['zil', 'çay', 'cam'].sort(compareTr)    // ['cam', 'çay', 'zil']
 *   normalizeForSearch('ŞİŞLİ') === normalizeForSearch('sisli')   // true
 *   slugify('Çağrı Merkezi – İletişim')      // 'cagri-merkezi-iletisim'
 *   syllabify('merhaba')                     // ['mer', 'ha', 'ba']
 *
 * Sınırlar: Sıralama yalnız Latin/Türk harflerini alfabe sırasına koyar; başka yazılar kod noktası sırasıyla sona
 * gider. Heceleme yazıma bakar (TDK kuralı: iki ünlü arasındaki son ünsüz sonraki heceye geçer); birleşik
 * sözcükleri ("ilkokul" → il-ko-kul) da bu kurala göre böler. Ünlü uyumu yardımcıları "saat, rol, Kemal" gibi ince
 * okunan istisnaları bilmez (ek getirmek için `ek` modülünü kullanın).
 *
 * Genişletme: Yeni bir harf eşlemesi `FOLD_MAP`'e, yeni küçük sözcük `SMALL_WORDS`'e eklenir. Her yeni işlev için
 * `vektorler/turkce.json` dosyasına örnek ekleyin; aynı örnek Python eşini de sınar.
 */

const LOWER_ALPHABET = 'abcçdefgğhıijklmnoöpqrsştuüvwxyz'
const UPPER_ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ'
const VOWELS = 'aeıioöuüâîû'
const FRONT_VOWELS = 'eiöüî'
const VOICELESS = 'çfhkpsşt'
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
/** Boşluk sayılan karakterler (JS `\s` ile Python `isspace` farklı olduğundan liste açık yazıldı). */
const SPACES =
  ' \t\n\r\u{b}\u{c}\u{a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}' +
  '\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}'
const APOSTROPHES = "'\u{2019}"
const COMBINING_MARKS = /[\u{300}-\u{36f}]/gu
/** "i" + birleşik nokta (U+0307): `'İ'.toLowerCase()` çıktısı; tek bir "i" sayılır. */
const DOTTED_I_ARTIFACT = /i\u{307}/gu

/** TDK: başlıklarda özel ada dâhil olmayan bu sözcükler küçük yazılır. */
const SMALL_WORDS = new Set(['ve', 'ile', 'ya', 'veya', 'yahut', 'ki', 'da', 'de', 'mı', 'mi', 'mu', 'mü'])

// prettier-ignore
const FOLD_MAP = new Map<string, string>([
  ['ç', 'c'], ['Ç', 'C'], ['ğ', 'g'], ['Ğ', 'G'], ['ı', 'i'], ['İ', 'I'], ['ö', 'o'], ['Ö', 'O'],
  ['ş', 's'], ['Ş', 'S'], ['ü', 'u'], ['Ü', 'U'], ['ß', 'ss'], ['æ', 'ae'], ['Æ', 'AE'], ['œ', 'oe'],
  ['Œ', 'OE'], ['ø', 'o'], ['Ø', 'O'], ['đ', 'd'], ['Đ', 'D'], ['ł', 'l'], ['Ł', 'L'],
  ['\u{2018}', "'"], ['\u{2019}', "'"], ['\u{201c}', '"'], ['\u{201d}', '"'], ['\u{2013}', '-'], ['\u{2014}', '-'],
  ['\u{2026}', '...'], ['\u{a0}', ' '],
])

// ---------------------------------------------------------------------------------------------------------------
// Büyük / küçük harf
// ---------------------------------------------------------------------------------------------------------------

/** Türkçe kuralla büyük harfe çevirir: i → İ, ı → I. */
export function upperTr(text: string): string {
  return text.replace(DOTTED_I_ARTIFACT, 'İ').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase() // harf: i/ı önce elle çevrildi
}

/** Türkçe kuralla küçük harfe çevirir: İ → i, I → ı. "i + birleşik nokta" artığını da temizler. */
export function lowerTr(text: string): string {
  return text
    .replace(/I\u{307}/gu, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase() // harf: İ/I önce elle çevrildi
    .replace(DOTTED_I_ARTIFACT, 'i')
}

/** Yalnız ilk harfi büyütür, gerisine dokunmaz: 'istanbul' → 'İstanbul', 'iPhone' → 'İPhone'. */
export function capitalizeTr(text: string): string {
  if (text === '') return ''
  const first = text.startsWith('i\u{307}') ? 'i\u{307}' : String.fromCodePoint(text.codePointAt(0) ?? 0)
  return upperTr(first) + text.slice(first.length)
}

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}\p{M}]/u.test(ch)
}

/**
 * Başlık biçimi: her sözcüğün ilk harfi büyük, gerisi küçük. Kesme işaretinden sonrası küçük kalır
 * ("ANKARA'DA" → "Ankara'da"). `smallWords: true` (varsayılan) iken "ve, ile, de, mi…" küçük yazılır (ilk sözcük hariç).
 */
export function titleCaseTr(text: string, options: { smallWords?: boolean } = {}): string {
  const keepSmall = options.smallWords ?? true
  const chars = Array.from(text)
  let out = ''
  let wordIndex = 0
  let i = 0
  while (i < chars.length) {
    const ch = chars[i] ?? ''
    if (!isWordChar(ch)) {
      out += ch
      i += 1
      continue
    }
    let j = i
    while (j < chars.length) {
      const c = chars[j] ?? ''
      const joinsNext = APOSTROPHES.includes(c) && isWordChar(chars[j + 1] ?? '')
      if (!isWordChar(c) && !joinsNext) break
      j += 1
    }
    const word = lowerTr(chars.slice(i, j).join(''))
    out += keepSmall && wordIndex > 0 && SMALL_WORDS.has(word) ? word : capitalizeTr(word)
    wordIndex += 1
    i = j
  }
  return out
}

/** Büyük/küçük harf ayrımı yapmadan (Türkçe kuralla) eşitlik: 'İSTANBUL' ile 'istanbul' eşittir. */
export function equalsIgnoreCaseTr(a: string, b: string): boolean {
  return lowerTr(a.normalize('NFC')) === lowerTr(b.normalize('NFC'))
}

// ---------------------------------------------------------------------------------------------------------------
// ASCII'ye indirgeme, arama anahtarı, kısa ad
// ---------------------------------------------------------------------------------------------------------------

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x7f) return false
  return true
}

/** Türkçe ve Latin işaretli harfleri ASCII karşılığına indirger: 'Çağrı' → 'Cagri'. Başka yazılara dokunmaz. */
export function asciiFold(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    const mapped = FOLD_MAP.get(ch)
    if (mapped !== undefined) {
      out += mapped
    } else if ((ch.codePointAt(0) ?? 0) < 0x80) {
      out += ch
    } else {
      const stripped = ch.normalize('NFD').replace(COMBINING_MARKS, '')
      out += isAscii(stripped) ? stripped : ch
    }
  }
  return out
}

/**
 * Arama/karşılaştırma anahtarı: büyük-küçük harf, işaret (ç/c, ş/s…) ve İ/ı farkını yok eder, boşlukları sadeleştirir.
 * 'ISPARTA', 'ısparta', 'İsparta' → 'isparta'. Aramada iki tarafı da bu işlevden geçirin.
 */
export function normalizeForSearch(text: string): string {
  let out = ''
  let pendingSpace = false
  for (const ch of asciiFold(lowerTr(text.normalize('NFC')))) {
    if (SPACES.includes(ch)) {
      pendingSpace = out !== ''
    } else {
      out += (pendingSpace ? ' ' : '') + ch
      pendingSpace = false
    }
  }
  return out
}

/** URL/dosya adı için kısa ad: 'Çağrı Merkezi – İletişim' → 'cagri-merkezi-iletisim'. */
export function slugify(text: string, options: { separator?: string; maxLength?: number } = {}): string {
  const separator = options.separator ?? '-'
  const words = normalizeForSearch(text)
    .replace(/'/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
  let slug = words.join(separator)
  const max = options.maxLength
  if (max !== undefined && slug.length > max) {
    const cut = slug.slice(0, max)
    const cutsWord = separator !== '' && !slug.startsWith(separator, max)
    const lastSeparator = cut.lastIndexOf(separator)
    slug = cutsWord && lastSeparator > 0 ? cut.slice(0, lastSeparator) : cut
    while (separator !== '' && slug.endsWith(separator)) slug = slug.slice(0, -separator.length)
  }
  return slug
}

// ---------------------------------------------------------------------------------------------------------------
// Türk alfabesine göre sıralama
// ---------------------------------------------------------------------------------------------------------------

type CollationElement = readonly [primary: string, secondary: string, tertiary: string]

function collationElement(ch: string): CollationElement {
  const lower = LOWER_ALPHABET.indexOf(ch)
  if (lower !== -1) return [String.fromCharCode(0x41 + lower), '0', '0']
  const upper = UPPER_ALPHABET.indexOf(ch)
  if (upper !== -1) return [String.fromCharCode(0x41 + upper), '0', '1']
  if (ch >= '0' && ch <= '9') return [ch, '0', '0']
  if (SPACES.includes(ch)) return ['\x01', '0', '0']
  const punctuation = PUNCTUATION.indexOf(ch)
  if (punctuation !== -1) return [String.fromCharCode(0x02 + punctuation), '0', '0']
  const code = ch.codePointAt(0) ?? 0
  if (code < 0x20 || code === 0x7f) return ['', '', '']
  if (ch === 'ß') return [collationElement('s')[0].repeat(2), '11', '00']
  const base = String.fromCodePoint(ch.normalize('NFD').codePointAt(0) ?? 0)
  if (base !== ch && (LOWER_ALPHABET.includes(base) || UPPER_ALPHABET.includes(base))) {
    const [primary, , tertiary] = collationElement(base)
    return [primary, '1', tertiary] // şapkalı/aksanlı harf: temel harfle aynı yerde, ikincil farkla
  }
  return [ch, '0', '0']
}

/**
 * Türk alfabesi sırasını veren anahtar. Anahtarlar KOD NOKTASI sırasıyla karşılaştırılınca (Python `<`, UTF-8 ikili
 * sıralama) doğru sıra çıkar: boşluk/noktalama < rakam < harf (a b c ç d … z) < öteki yazılar; eşitlikte şapkasız
 * önce, sonra küçük harf önce. `numeric: true` → "Sokak 2" < "Sokak 10".
 */
export function sortKeyTr(text: string, options: { numeric?: boolean } = {}): string {
  const chars = Array.from(text.normalize('NFC'))
  let primary = ''
  let secondary = ''
  let tertiary = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? ''
    if (options.numeric === true && ch >= '0' && ch <= '9') {
      let j = i
      while (j < chars.length && (chars[j] ?? '') >= '0' && (chars[j] ?? '') <= '9') j += 1
      const digits = chars
        .slice(i, j)
        .join('')
        .replace(/^0+(?=\d)/, '')
      primary += String.fromCharCode(0x30 + Math.min(digits.length, 16)) + digits
      secondary += '0'
      tertiary += '0'
      i = j - 1
      continue
    }
    const [p, s, t] = collationElement(ch)
    primary += p
    secondary += s
    tertiary += t
  }
  return `${primary}\x00${secondary}\x00${tertiary}`
}

/** İki metni KOD NOKTASI sırasıyla karşılaştırır (JS'in `<` işleci UTF-16 birimiyle karşılaştırır; bu fark yaratır). */
function compareCodePoints(a: string, b: string): number {
  const fix = (unit: number): number =>
    unit >= 0xd800 && unit <= 0xdfff ? unit + 0x2000 : unit >= 0xe000 ? unit - 0x800 : unit
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i)
    const y = b.charCodeAt(i)
    if (x !== y) return fix(x) < fix(y) ? -1 : 1
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1
}

/** `Array.prototype.sort` için Türkçe karşılaştırıcı: -1, 0 ya da 1 döner. */
export function compareTr(a: string, b: string, options: { numeric?: boolean } = {}): number {
  const byKey = compareCodePoints(sortKeyTr(a, options), sortKeyTr(b, options))
  return byKey !== 0 ? byKey : compareCodePoints(a, b)
}

/**
 * Yeni bir dizi döndürerek Türkçe sıralar; büyük listelerde `sort(compareTr)`'den hızlıdır (anahtar bir kez üretilir).
 * Nesne dizilerinde `by` ile alan seçilir: `sortTr(kisiler, { by: (k) => k.ad })`.
 */
export function sortTr<T>(items: readonly T[], options: { by?: (item: T) => string; numeric?: boolean } = {}): T[] {
  const by = options.by ?? ((item: T) => String(item))
  return items
    .map((item) => ({ item, text: by(item), key: sortKeyTr(by(item), options) }))
    .sort((x, y) => compareCodePoints(x.key, y.key) || compareCodePoints(x.text, y.text))
    .map((entry) => entry.item)
}

// ---------------------------------------------------------------------------------------------------------------
// Heceleme
// ---------------------------------------------------------------------------------------------------------------

/** Tek bir harf ünlü mü? (a e ı i o ö u ü ve şapkalıları; büyük harf de olur) */
export function isVowel(ch: string): boolean {
  return ch !== '' && VOWELS.includes(lowerTr(ch))
}

/**
 * Bir sözcüğü hecelerine ayırır: 'merhaba' → ['mer','ha','ba'], 'saat' → ['sa','at'], 'kontrol' → ['kont','rol'].
 * Kesme işareti bulunduğu hecede kalır: "Ankara'ya" → ['An','ka',"ra'",'ya'].
 */
export function syllabify(word: string): string[] {
  const chars = Array.from(word.normalize('NFC'))
  if (chars.length === 0) return []
  const vowelAt: number[] = []
  chars.forEach((ch, index) => {
    if (isVowel(ch)) vowelAt.push(index)
  })
  const starts = [0]
  for (let v = 1; v < vowelAt.length; v++) {
    const position = vowelAt[v] ?? 0
    const previousVowel = vowelAt[v - 1] ?? 0
    let k = position - 1
    while (k > previousVowel && APOSTROPHES.includes(chars[k] ?? '')) k -= 1
    // Öndeki ünsüz bu heceye geçer; ünlü ünlüye bitişikse tam arada bölünür.
    starts.push(k > previousVowel ? k : position)
  }
  return starts.map((start, index) => chars.slice(start, starts[index + 1] ?? chars.length).join(''))
}

/** Metindeki her sözcüğü heceleyip araya ayırıcı koyar: 'merhaba dünya' → 'mer-ha-ba dün-ya'. */
export function hyphenate(text: string, separator = '-'): string {
  return text
    .split(/([ \t\n\r]+)/)
    .map((part) => (/^[ \t\n\r]*$/.test(part) ? part : syllabify(part).join(separator)))
    .join('')
}

/** Hece sayısı (ünlü sayısı). Ünlüsüz ama dolu bir sözcük 1 hece sayılır. */
export function countSyllables(word: string): number {
  return syllabify(word).length
}

// ---------------------------------------------------------------------------------------------------------------
// Ünlü uyumu yardımcıları
// ---------------------------------------------------------------------------------------------------------------

function letters(word: string): string[] {
  return Array.from(lowerTr(word.normalize('NFC'))).filter((ch) => /\p{L}/u.test(ch))
}

/** Sözcüğün son ünlüsü (küçük harf, şapkasız); ünlü yoksa `null`. */
export function lastVowel(word: string): string | null {
  const found = letters(word)
    .reverse()
    .find((ch) => VOWELS.includes(ch))
  if (found === undefined) return null
  return found === 'â' ? 'a' : found === 'î' ? 'i' : found === 'û' ? 'u' : found
}

/** İki biçimli ekler (-ler/-lar, -de/-da) için ünlü: son ünlü ince ise 'e', kalın ise 'a'. Ünlü yoksa 'e'. */
export function harmonyTwoWay(word: string): 'e' | 'a' {
  const vowel = lastVowel(word)
  return vowel === null || FRONT_VOWELS.includes(vowel) ? 'e' : 'a'
}

/** Dört biçimli ekler (-i/-ı/-u/-ü) için ünlü. Ünlü yoksa 'i'. */
export function harmonyFourWay(word: string): 'i' | 'ı' | 'u' | 'ü' {
  const vowel = lastVowel(word)
  if (vowel === 'a' || vowel === 'ı') return 'ı'
  if (vowel === 'o' || vowel === 'u') return 'u'
  if (vowel === 'ö' || vowel === 'ü') return 'ü'
  return 'i'
}

/** Sözcük ünlüyle mi bitiyor? */
export function endsWithVowel(word: string): boolean {
  const all = letters(word)
  return isVowel(all[all.length - 1] ?? '')
}

/** Sözcük sert (ötümsüz) ünsüzle mi bitiyor? (f, s, t, k, ç, ş, h, p — "fıstıkçı şahap") */
export function endsWithVoiceless(word: string): boolean {
  const all = letters(word)
  const last = all[all.length - 1] ?? ''
  return last !== '' && VOICELESS.includes(last)
}

/** Büyük ünlü uyumu: bütün ünlüler ya ince ya kalın mı? ('kitap' → false, 'okul' → true) */
export function hasVowelHarmony(word: string): boolean {
  const vowels = letters(word).filter((ch) => VOWELS.includes(ch))
  const front = vowels.filter((ch) => FRONT_VOWELS.includes(ch)).length
  return front === 0 || front === vowels.length
}
