/**
 * Taban sağlayıcının deterministik yapı taşları: Türkçe katlama ve sözcükleme, özellik karması (feature hashing),
 * tohumlu sözde rastgele sayılar ve tohumlu izdüşüm matrisleri.
 *
 * Belirlenimcilik: yalnız tamsayı işlemleri (Math.imul, >>>), toplama/çarpma ve Math.sqrt kullanılır — bunlar IEEE 754
 * gereği her makinede aynı sonucu verir. Aşkın işlevler (log, exp, sin) kullanılmaz: motorlar arasında son bitleri
 * farklı olabilir.
 */

/* ───────────── Türkçe katlama ve sözcükleme ───────────── */

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** "Işığın ÇOCUĞU" → "isigin cocugu": tr-TR küçük harf, Türkçe harfler ASCII'ye, diğer imler atılır. */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Anlam taşımayan sık sözcükler (Türkçe + İngilizce; katlanmış biçimde). */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    've ile bir bu su o da de ki mi mu ne ama icin gibi daha cok en her ya ise kadar sonra once olan olarak ' +
    'bunu sunu onu ben sen biz siz onlar var yok degil diye hem ancak ya da hic bile artik sadece ' +
    'the a an and or of to in on for with is are was were be it this that at by from as his her their its'
  ).split(/\s+/),
)

/**
 * Katalog metinlerinde içerikten değil biçimden söz eden kökler ("… dizisinin 3. bölümü", "programın", "serisi"):
 * bu köklerle başlayan sözcükler atılır. Atılmazsa ilgisiz iki kısa özet yalnız "bölüm" yüzünden benzer çıkıyordu.
 */
export const FORMAT_STEMS: readonly string[] = ['bolum', 'dizi', 'program', 'serisi', 'serinin', 'episode', 'season']

/** Katlanmış metnin sözcükleri (en az 2 harf; durak sözcükleri, yalnız rakamlar ve biçim kökleri hariç). */
export function wordsOf(text: string): string[] {
  const folded = foldTr(text)
  if (!folded) return []
  return folded
    .split(' ')
    .filter(
      (w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w) && !FORMAT_STEMS.some((st) => w.startsWith(st)),
    )
}

/** Sözcüğün karakter 3-gramları ("#ejder#" → "#ej", "eje", …): Türkçe eklerde ortak kökü yakalar. */
export function charGrams(word: string, n = 3): string[] {
  const w = `#${word}#`
  const out: string[] = []
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n))
  return out
}

/* ───────────── Karma ───────────── */

/** FNV-1a (32 bit), tohumlu. */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // Son karıştırma (murmur3 fmix32): alt bitlerin dağılımını düzeltir.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Seyrek özellik vektörü: kova → değer. */
export type Sparse = Map<number, number>

/**
 * İşaretli özellik karması: her özellik anahtarı bir kovaya ve ±1 işarete gider (çarpışmalar ortalamada birbirini
 * götürür). Ağırlık doğrudan eklenir; alt-doğrusal ağırlıklama çağıranın işidir.
 */
export function addHashed(into: Sparse, key: string, weight: number, buckets: number): void {
  if (weight === 0) return
  const h = fnv1a(key)
  const bucket = h % buckets
  const sign = (h >>> 31) & 1 ? -1 : 1
  into.set(bucket, (into.get(bucket) ?? 0) + sign * weight)
}

/** Seyrek vektörün L2 normu. */
export function sparseNorm(v: Sparse): number {
  let s = 0
  for (const x of v.values()) s += x * x
  return Math.sqrt(s)
}

/** Ağırlıklı sözcük sayımı → alt-doğrusal ağırlık: √tf (log yerine; belirlenimci ve benzer etkili). */
export function sublinear(counts: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [k, c] of counts) out.set(k, Math.sqrt(c))
  return out
}

/* ───────────── Tohumlu sözde rastgele sayılar ve izdüşüm ───────────── */

/** mulberry32: 32 bit tohumdan [0, 1) dizisi. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Seyrek tohumlu izdüşüm matrisi (Achlioptas 2003): girdiler 1/6 olasılıkla +√3, 4/6 ile 0, 1/6 ile −√3.
 * Uzaklıkları Johnson–Lindenstrauss anlamında korur; aşkın işlev gerektirmez. Satır sayısı `rows` (girdi boyutu),
 * sütun sayısı `cols` (ortak uzay boyutu). Satır r, (tohum, r) ikilisinden üretilir: satırlar birbirinden bağımsızdır.
 */
export function projectionMatrix(rows: number, cols: number, seed: number): Float32Array {
  const m = new Float32Array(rows * cols)
  const s3 = Math.sqrt(3)
  for (let r = 0; r < rows; r++) {
    const rnd = mulberry32(fnv1a(`row:${r}`, seed))
    for (let c = 0; c < cols; c++) {
      const u = rnd()
      m[r * cols + c] = u < 1 / 6 ? s3 : u < 2 / 6 ? -s3 : 0
    }
  }
  return m
}

/** Seyrek vektörü matrisle ortak uzaya taşır: out = Σ v[k] · M[k, :] */
export function projectSparse(v: Sparse, m: Float32Array, cols: number, out = new Float64Array(cols)): Float64Array {
  for (const [k, x] of v) {
    const off = k * cols
    for (let c = 0; c < cols; c++) out[c]! += x * m[off + c]!
  }
  return out
}

/** Yoğun vektörü matrisle ortak uzaya taşır. */
export function projectDense(v: ArrayLike<number>, m: Float32Array, cols: number): Float64Array {
  const out = new Float64Array(cols)
  for (let k = 0; k < v.length; k++) {
    const x = v[k]!
    if (x === 0) continue
    const off = k * cols
    for (let c = 0; c < cols; c++) out[c]! += x * m[off + c]!
  }
  return out
}
