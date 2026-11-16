// Sanal liste gösterimi: tohumlu üreteçle 10.000 farklı uzunlukta mesaj; yalnız görünenler çizilir.
// Genişletme: gerçek veri için `messageAt` yerine diziden okuyun; `estimate`'i ortalama yüksekliğe yakın seçin.
import { VirtualList } from '../../src/sanal_liste/index.ts'
import { metin } from '../metin.ts'

const COUNT = 10_000
const WORDS = [
  'merhaba',
  'toplantı',
  'yarın',
  'saat',
  'üçte',
  'İzmir',
  'Iğdır',
  'rapor',
  'hazır',
  'mı',
  'evet',
  'teşekkürler',
  'görüşürüz',
  'çay',
  'kahve',
  'öğle',
  'arası',
  'proje',
  'bitti',
]
const NAMES = ['Ayşe', 'Ali', 'Zeynep', 'Mehmet', 'Elif']

/** Tohumlu, belirlenimci sahte mesaj: aynı sıra her açılışta aynı metni verir. */
function messageAt(i: number): { from: string; text: string } {
  let seed = (i + 1) * 2654435761
  const next = () => (seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0) / 4294967296
  const length = 3 + Math.floor(next() * (next() < 0.15 ? 60 : 14))
  const words = Array.from({ length }, () => WORDS[Math.floor(next() * WORDS.length)] as string)
  return { from: NAMES[i % NAMES.length] as string, text: words.join(' ') }
}

const counter = document.getElementById('sayac') as HTMLElement
const list = new VirtualList(document.getElementById('liste') as HTMLElement, {
  count: COUNT,
  estimate: 64,
  label: 'Mesaj listesi',
  render: (i) => {
    const { from, text } = messageAt(i)
    const article = document.createElement('article')
    article.className = 'mesaj'
    const head = document.createElement('header')
    head.append(
      Object.assign(document.createElement('strong'), { textContent: from }),
      Object.assign(document.createElement('span'), { textContent: `#${i + 1}` }),
    )
    article.append(head, Object.assign(document.createElement('p'), { textContent: `Mesaj ${i + 1}: ${text}` }))
    return article
  },
})

const showCount = () => (counter.textContent = metin.sanal_liste.cizilen(list.renderedCount, COUNT))
list.element.addEventListener('scroll', () => requestAnimationFrame(showCount))
document.getElementById('basa')?.addEventListener('click', () => (list.scrollToIndex(0), showCount()))
document.getElementById('ortaya')?.addEventListener('click', () => (list.scrollToIndex(4999, 'center'), showCount()))
document.getElementById('sona')?.addEventListener('click', () => (list.scrollToIndex(COUNT - 1, 'end'), showCount()))
showCount()
