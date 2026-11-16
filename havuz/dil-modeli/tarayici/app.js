// Gösterim sayfasının davranışı: modeli yükler, formdan ayarları alır, üretimi akışla gösterir.
// Model klasörü adresi: ?model=... (varsayılan: depodaki ornek-model/tarayici/).
// Metinler tr.json'dadır; burada kullanıcıya görünen yazı yoktur.
// Genişletme: Yeni bir ayar için index.html'e alan, tr.json'a etiket, `settings()` içine okuma ekleyin.

import { generateText } from './generate.js'
import { loadFromUrl } from './loader.js'

const $ = (id) => document.getElementById(id)
const words = await (await fetch(new URL('./tr.json', import.meta.url))).json()
const say = (key, values = {}) => words[key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '')

for (const element of document.querySelectorAll('[data-metin]')) element.textContent = words[element.dataset.metin]
document.title = words.baslik
$('istem').value = words.istem_ornek

function setState(state, text) {
  document.body.dataset.durum = state
  $('durum').textContent = text
}

function settings() {
  const seed = $('tohum').value.trim()
  return {
    maxNewTokens: Number($('azami').value),
    temperature: Number($('sicaklik').value),
    topP: Number($('top-p').value),
    repetitionPenalty: Number($('ceza').value),
    seed: seed === '' ? null : Number(seed),
  }
}

let loaded = null
let controller = null
setState('yukleniyor', words.yukleniyor)
try {
  const address = new URLSearchParams(location.search).get('model') ?? '../ornek-model/tarayici/'
  loaded = await loadFromUrl(new URL(address, location.href))
  const { manifest } = loaded
  const parameters = Object.values(manifest.tensors).reduce((sum, t) => sum + t.shape.reduce((a, b) => a * b, 1), 0)
  const values = {
    parametre: (parameters / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
    tur: manifest.dtype,
    boyut: (manifest.bytes / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }),
  }
  setState('hazir', say('hazir', values))
  $('uret').disabled = false
} catch (error) {
  setState('hata', say('hata', { ileti: error.message }))
}

$('durdur').addEventListener('click', () => controller?.abort())
$('form').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!loaded) return
  const { model, tokenizer } = loaded
  const prompt = $('istem').value
  $('istem-yazisi').textContent = prompt
  $('uretilen').textContent = ''
  $('uret').disabled = true
  $('durdur').disabled = false
  controller = new AbortController()
  setState('uretiyor', words.uretiyor)
  const started = performance.now()
  const ids = [model.special.bos, ...tokenizer.encode(prompt)]
  const result = await generateText(
    model,
    tokenizer,
    ids,
    settings(),
    (piece) => {
      $('uretilen').textContent += piece
    },
    controller.signal,
  )
  const seconds = (performance.now() - started) / 1000
  const rate = (result.tokens / Math.max(seconds, 1e-3)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })
  setState('bitti', say('bitti', { belirtec: result.tokens, hiz: rate }))
  $('uret').disabled = false
  $('durdur').disabled = true
})
