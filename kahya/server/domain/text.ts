// Türkçe metin yardımcıları. Büyük/küçük harf dönüşümü her zaman 'tr-TR' yerel ayarıyla yapılır (i → İ, ı → I).

export const trLower = (s: string) => s.toLocaleLowerCase('tr-TR')
export const trUpper = (s: string) => s.toLocaleUpperCase('tr-TR')

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Karşılaştırma anahtarı: küçük harf, Türkçe karakterler sadeleştirilmiş, boşluklar tekil. */
export function fold(s: string): string {
  return trLower(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP = new Set(
  'acaba ama ancak artik bana bazi belki ben beni benim bile bir biraz birkac bize biz bu buna bunu bunun da daha de defa diye en gibi hem hep hepsi her hic icin ile ise kadar ki kim mi mu mi mu ne neden nedir nicin o ona onu onun orada oysa sanki siz size sizin su suna sunu sen seni ve veya ya yani zaten lutfen merhaba selam iyi gunler aksamlar acaba olarak olan oldu olur var yok'.split(
    ' ',
  ),
)

/** Arama için kökleme: Türkçe eklemeli yapıda ilk 5 harf pratik bir kök verir (aidatım → aidat, otoparka → otopa). */
export function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word
}

export function tokenize(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem)
}

/** "Ayşe Kaya" → ['ayse', 'kaya'] */
export function nameParts(name: string): string[] {
  return fold(name)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2)
}

/** +90 5XX XXX XX XX biçimine çevirir; Türkiye cep/ sabit numarası değilse null. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let d = input.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('90') && d.length === 12) d = d.slice(2)
  if (d.startsWith('0') && d.length === 11) d = d.slice(1)
  if (d.length !== 10 || !/^[2-5]/.test(d)) return null
  return `+90${d}`
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164)
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

/** Kısaltır; kelime ortasında kesmez. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`
}
