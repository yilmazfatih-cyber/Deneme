// Web Worker: ışın izlemeyi ana iş parçacığından ayırır (sayfa donmaz). Aşamalı çizim:
//   1) kaba geçiş — her 8×8 blok için tek ışın; blok tek renge boyanır (görüntü hemen belirir)
//   2) ince geçiş — ortadan dışa doğru 32×32 karolar, tam örnek sayısıyla
// Her parça hazır oldukça `postMessage` ile gönderilir (bayt dizisi aktarılır, kopyalanmaz). Yeni ayarla
// çizmek için sayfa eski işçiyi sonlandırıp yenisini başlatır (en basit ve kesin iptal yöntemi).
// Genişletme: birden çok işçiye karo dağıtmak için karo listesini işçi sayısına bölün.
import { exampleScene } from './example_scene.ts'
import { renderPixel, renderTile, tiles } from './render.ts'
import { toByte } from './image.ts'

export interface WorkerRequest {
  width: number
  height: number
  samples: number
  seed: number
}

export type WorkerMessage =
  | { type: 'tile'; pass: 'kaba' | 'ince'; x: number; y: number; w: number; h: number; data: Uint8ClampedArray }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; ms: number }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void
}

scope.onmessage = (event) => {
  const options = event.data
  const started = performance.now()
  const scene = exampleScene()
  const block = 8
  for (let y = 0; y < options.height; y += block) {
    for (let x = 0; x < options.width; x += block) {
      const w = Math.min(block, options.width - x)
      const h = Math.min(block, options.height - y)
      const c = renderPixel(scene, x + (w >> 1), y + (h >> 1), { ...options, samples: 1 })
      const data = new Uint8ClampedArray(w * h * 4)
      for (let i = 0; i < w * h; i++) data.set([toByte(c.x), toByte(c.y), toByte(c.z), 255], i * 4)
      scope.postMessage({ type: 'tile', pass: 'kaba', x, y, w, h, data }, [data.buffer])
    }
  }
  const list = tiles(options.width, options.height, 32)
  list.forEach((tile, i) => {
    const data = renderTile(scene, tile, options)
    scope.postMessage({ type: 'tile', pass: 'ince', ...tile, data }, [data.buffer])
    scope.postMessage({ type: 'progress', done: i + 1, total: list.length })
  })
  scope.postMessage({ type: 'done', ms: performance.now() - started })
}
