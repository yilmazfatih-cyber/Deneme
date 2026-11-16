// Paketleyici gösterimi: bellekteki dosya sistemiyle paketleyiciyi tarayıcıda çalıştırır. Kullanıcı modülleri
// düzenler; "Paketle" paket kodunu ve özetini (dahil/atılan modüller, tutulan deyimler, döngüler) gösterir;
// "Çalıştır" iife paketini bu sayfada değerlendirir.
// Genişletme: yeni örnek modül = `FILES`'a bir satır (yol → kaynak).
import { bundle, type Format } from '../../src/paketleyici/index.ts'
import { metin } from '../metin.ts'

const FILES: Record<string, string> = {
  '/main.js': `import { topla, KDV_ORANI } from './matematik.js'
import * as metin from './metin.js'

export const sonuc = {
  toplam: topla(100, 250),
  kdv: topla(100, 250) * KDV_ORANI,
  baslik: metin.buyut('istanbul ve ırmak'),
}
`,
  '/matematik.js': `import { kaydet } from './gunluk.js'

export const KDV_ORANI = 0.2
export function topla(a, b) {
  return yuvarla(a + b)
}
function yuvarla(x) {
  return Math.round(x * 100) / 100
}
export function carp(a, b) {
  kaydet('çarpım')
  return a * b
}
`,
  '/metin.js': `export const buyut = (s) => s.toLocaleUpperCase('tr-TR')
export const kucult = (s) => s.toLocaleLowerCase('tr-TR')
`,
  '/gunluk.js': `export function kaydet(olay) {
  console.log('Günlük:', olay)
}
`,
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const editors = new Map<string, HTMLTextAreaElement>()
for (const [path, source] of Object.entries(FILES)) {
  const box = document.createElement('div')
  box.className = 'modul'
  const id = `modul-${path.replace(/\W/g, '')}`
  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = path.slice(1)
  const area = document.createElement('textarea')
  area.id = id
  area.spellcheck = false
  area.value = source
  box.append(label, area)
  $('moduller').append(box)
  editors.set(path, area)
}

function pack(format: Format = $<HTMLSelectElement>('bicim').value as Format): string | undefined {
  const fs = { readFile: (path: string) => editors.get(path)?.value }
  try {
    const result = bundle({
      entry: '/main.js',
      fs,
      format,
      name: 'Paket',
      treeShake: $<HTMLInputElement>('silkele').checked,
    })
    $('cikti').textContent = result.code
    const removed = result.removed.map((p) => p.slice(1)).join(', ')
    $('ozet').textContent =
      metin.paketleyici.ozet(result.included.length, removed, result.stats.kept, result.stats.statements) +
      result.cycles.map((c) => ` ${metin.paketleyici.dongu(c.join(' → '))}`).join('')
    return result.code
  } catch (error) {
    $('ozet').textContent = metin.paketleyici.hata((error as Error).message)
    $('cikti').textContent = ''
    return undefined
  }
}

$('paketle').addEventListener('click', () => pack())
$('calistir').addEventListener('click', () => {
  const code = pack('iife')
  if (!code) return
  try {
    // Gösterim: kullanıcının bu sayfada yazdığı modüllerden üretilen paketi yine kendi tarayıcısında çalıştırır.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function(`${code}\nreturn Paket`) as () => { sonuc?: unknown }
    const value = run()
    $('sonuc').textContent = metin.paketleyici.sonuc(JSON.stringify(value.sonuc ?? value, null, 2))
  } catch (error) {
    $('sonuc').textContent = metin.paketleyici.hata((error as Error).message)
  }
  pack()
})
pack()
