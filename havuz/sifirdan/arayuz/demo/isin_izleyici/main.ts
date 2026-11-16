// Işın izleyici gösterimi: ayarları okur, işçiyi başlatır, gelen karoları tuvale yazar, ilerlemeyi gösterir;
// bitince tuval piksellerinden kendi PNG kodlayıcımızla dosya üretir. Yeni çizimde eski işçi sonlandırılır.
// Genişletme: birden çok işçi için karo listesini bölüp her işçiye ayrı aralık gönderin.
import { encodePng } from '../../src/isin_izleyici/index.ts'
import type { WorkerMessage, WorkerRequest } from '../../src/isin_izleyici/worker.ts'
import { metin } from '../metin.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('tuval')
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
const progress = $<HTMLProgressElement>('ilerleme')
const status = $('durum')
const download = $<HTMLButtonElement>('indir')
let worker: Worker | undefined

function draw(): void {
  worker?.terminate()
  const [width, height] = $<HTMLSelectElement>('boyut').value.split('x').map(Number) as [number, number]
  canvas.width = width
  canvas.height = height
  ctx.clearRect(0, 0, width, height)
  progress.value = 0
  status.textContent = metin.isin.basladi
  download.disabled = true
  const request: WorkerRequest = { width, height, samples: Number($<HTMLSelectElement>('ornek').value), seed: 1 }
  worker = new Worker(new URL('../../src/isin_izleyici/worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    if (message.type === 'tile')
      ctx.putImageData(new ImageData(new Uint8ClampedArray(message.data), message.w, message.h), message.x, message.y)
    else if (message.type === 'progress') {
      const percent = Math.round((message.done / message.total) * 100)
      progress.value = percent
      progress.setAttribute('aria-valuetext', metin.isin.ilerleme(percent))
    } else {
      progress.value = 100
      status.textContent = metin.isin.bitti(message.ms)
      download.disabled = false
    }
  }
  worker.postMessage(request)
}

download.addEventListener('click', () => {
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  void encodePng({ width: image.width, height: image.height, data: image.data }).then((png) => {
    const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: 'isin-izleyici.png' })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
})
$('ciz').addEventListener('click', draw)
draw()
