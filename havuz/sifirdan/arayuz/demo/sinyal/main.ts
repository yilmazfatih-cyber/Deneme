// Sinyal gösterimi: sepet hesapları computed ile, ekran güncellemesi effect ile yapılır. Sayaçlar
// computed.computeCount'tan okunur: gereksiz yeniden hesap olmadığını kullanıcı gözüyle görür.
// Genişletme: yeni bir hesap satırı = bir computed + `rows` dizisine bir öğe.
import { batch, computed, effect, signal, type Computed } from '../../src/sinyal/index.ts'
import { metin } from '../metin.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const para = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

const fiyat = signal(120, { name: 'fiyat' })
const adet = signal(2, { name: 'adet' })
const indirimOrani = signal(0.1, { name: 'indirim oranı' })

const araToplam = computed(() => fiyat.value * adet.value, { name: 'Ara toplam' })
const indirim = computed(() => araToplam.value * indirimOrani.value, { name: 'İndirim' })
const kdv = computed(() => (araToplam.value - indirim.value) * 0.2, { name: 'KDV (%20)' })
const toplam = computed(() => araToplam.value - indirim.value + kdv.value, { name: 'Toplam' })

const rows: Computed<number>[] = [araToplam, indirim, kdv, toplam]
const list = $<HTMLDListElement>('hesaplar')
const cells = rows.map((row) => {
  const dt = document.createElement('dt')
  dt.textContent = row.name ?? ''
  const dd = document.createElement('dd')
  list.append(dt, dd)
  return dd
})

let runs = 0
const log = $<HTMLOListElement>('gunluk')
effect(() => {
  const total = toplam.value
  rows.forEach((row, i) => {
    const cell = cells[i] as HTMLElement
    cell.innerHTML = ''
    const value = document.createElement('span')
    value.textContent = para.format(row.value)
    const counter = document.createElement('span')
    counter.className = 'sayac'
    counter.textContent = ` · ${metin.sinyal.hesap(row.computeCount)}`
    cell.append(value, counter)
  })
  $('toplam').textContent = metin.sinyal.toplam(para.format(total))
  runs++
  const item = document.createElement('li')
  item.textContent = metin.sinyal.etki(runs, para.format(total))
  log.prepend(item)
  while (log.children.length > 6) log.lastElementChild?.remove()
})

effect(() => {
  $('adet').textContent = String(adet.value)
  $<HTMLButtonElement>('azalt').disabled = adet.value <= 1
})

$<HTMLInputElement>('fiyat').addEventListener('input', (e) => {
  const value = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(value) && value >= 0) fiyat.value = value
})
$('artir').addEventListener('click', () => adet.update((n) => n + 1))
$('azalt').addEventListener('click', () => adet.update((n) => Math.max(1, n - 1)))
$<HTMLInputElement>('indirim').addEventListener('input', (e) => {
  const percent = Number((e.target as HTMLInputElement).value)
  $('indirim-deger').textContent = `%${percent}`
  indirimOrani.value = percent / 100
})
const syncPriceInput = () => ($<HTMLInputElement>('fiyat').value = String(fiyat.peek()))
$('toplu').addEventListener('click', () => {
  batch(() => {
    adet.update((n) => n + 1)
    fiyat.update((n) => n + 10)
  })
  syncPriceInput()
})
$('ayri').addEventListener('click', () => {
  adet.update((n) => n + 1)
  fiyat.update((n) => n + 10)
  syncPriceInput()
})
