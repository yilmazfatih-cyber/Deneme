// Koanların "boş" çalışma kopyasını üretir: koanlar/ → calisma/ ; her __(cevap) → __()
// Kullanım: node araclar/bosalt.js   (sonra: node --test "calisma/**/*.test.js")
// calisma/ klasörü .gitignore'dadır; istediğin kadar silip yeniden üretebilirsin.
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Metindeki her `__(` çağrısının içini, dengeli parantezleri ve dize/şablon/regex dışı içerikleri
 * gözeterek boşaltır. Yorumlar ve dizeler içindeki "__(" dokunulmadan kalır.
 */
export function bosalt(kaynak) {
  let cikti = ''
  let i = 0
  while (i < kaynak.length) {
    const c = kaynak[i]
    // dizeleri ve yorumları olduğu gibi kopyala
    if (c === "'" || c === '"' || c === '`') {
      const son = dizeSonu(kaynak, i)
      cikti += kaynak.slice(i, son)
      i = son
      continue
    }
    if (kaynak.startsWith('//', i)) {
      const son = kaynak.indexOf('\n', i)
      const bitis = son < 0 ? kaynak.length : son
      cikti += kaynak.slice(i, bitis)
      i = bitis
      continue
    }
    if (kaynak.startsWith('__(', i) && !/[\w$]/.test(kaynak[i - 1] || '')) {
      const kapanis = eslesenParantez(kaynak, i + 2)
      cikti += '__()'
      i = kapanis + 1
      continue
    }
    cikti += c
    i++
  }
  return cikti
}

function dizeSonu(s, bas) {
  const tirnak = s[bas]
  let i = bas + 1
  while (i < s.length) {
    if (s[i] === '\\') i += 2
    else if (s[i] === tirnak) return i + 1
    else if (tirnak === '`' && s.startsWith('${', i)) i = eslesenParantez(s, i + 1, '{', '}') + 1
    else i++
  }
  throw new Error('kapanmamış dize')
}

function eslesenParantez(s, acilis, ac = '(', kapa = ')') {
  let derinlik = 0
  for (let i = acilis; i < s.length; i++) {
    const c = s[i]
    if (c === "'" || c === '"' || c === '`') {
      i = dizeSonu(s, i) - 1
      continue
    }
    if (c === ac) derinlik++
    else if (c === kapa && --derinlik === 0) return i
  }
  throw new Error('eşleşmeyen parantez')
}

// Doğrudan çalıştırıldıysa kopyala (testler yalnızca bosalt() fonksiyonunu içe aktarır).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const kok = fileURLToPath(new URL('..', import.meta.url))
  rmSync(`${kok}calisma`, { recursive: true, force: true })
  cpSync(`${kok}koanlar`, `${kok}calisma`, { recursive: true })
  let sayi = 0
  for (const ad of readdirSync(`${kok}calisma`).filter((a) => a.endsWith('.test.js'))) {
    const yol = `${kok}calisma/${ad}`
    const once = readFileSync(yol, 'utf8')
    const sonra = bosalt(once)
    sayi += (once.match(/__\(/g) || []).length
    writeFileSync(yol, sonra)
  }
  console.log(`calisma/ hazır: ${sayi} boşluk. Çalıştır: node --test "calisma/**/*.test.js"`)
}
