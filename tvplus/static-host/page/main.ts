/**
 * Durağan barındırma (GitHub Pages) girişi. Sunucu kipindeki akışın karşılığı:
 *   sunucu: HTML'i üretir, `<!--TVP_BOOT-->` yerine açılış bağlamını gömer → uygulama başlar
 *   burada: arka ucu (worker) bağlar, API taşımasını kurar, hazır olunca GET /api/boot ile açılış bağlamını alıp aynı
 *           `<script id="tvp-boot">` öğesini gömer → uygulamayı (web/src/main.tsx) yükler.
 * Arka uç hazırlanırken #root içinde bir bekleme ekranı durur (index.html'in 10 sn'lik açılış tanılaması tetiklenmez);
 * arka uç açılamazsa hata, aynı tanılama kutusunda nedeniyle gösterilir.
 */
import workerUrl from '../worker/main.ts?worker&url'
import { connectBackend } from './backend'
import { installTransport } from './transport'

const BOOT_ROUTE = '/api/boot'
const VD_RE = /^[a-z0-9]{1,12}$/

function splash(): { set(text: string): void; remove(): void } {
  const root = document.getElementById('root')
  const box = document.createElement('div')
  box.id = 'tvp-static-splash'
  box.setAttribute('role', 'status')
  box.setAttribute('aria-live', 'polite')
  box.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
    'background:#141414;color:#b3b3b3;font:500 16px/1.5 Manrope,system-ui,-apple-system,Segoe UI,sans-serif'
  const logo = document.createElement('div')
  logo.textContent = 'TV+'
  logo.style.cssText = 'font-size:40px;font-weight:800;color:#e50914;letter-spacing:-1px'
  const text = document.createElement('div')
  text.textContent = 'Hazırlanıyor…'
  box.append(logo, text)
  root?.appendChild(box)
  return {
    set: (t) => {
      text.textContent = t
    },
    remove: () => box.remove(),
  }
}

async function embedBoot(): Promise<void> {
  const headers: Record<string, string> = { accept: 'application/json' }
  const vd = new URLSearchParams(location.search).get('vd')
  if (vd && VD_RE.test(vd)) headers['x-tvplus-vd'] = vd
  const res = await fetch(BOOT_ROUTE, { credentials: 'same-origin', headers })
  if (!res.ok) throw new Error(`Açılış bağlamı alınamadı (${res.status})`)
  const json = (await res.text())
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  const script = document.createElement('script')
  script.id = 'tvp-boot'
  script.type = 'application/json'
  script.textContent = json
  document.head.appendChild(script)
}

async function start(): Promise<void> {
  const ui = splash()
  const backend = connectBackend(workerUrl)
  installTransport(backend)
  const off = backend.onStatus((s) => ui.set(s.text))
  try {
    const status = await backend.ready()
    off()
    if (status.ms !== undefined) console.info(`[TV+] tarayıcı arka ucu hazır (${backend.kind}, ${status.ms} ms)`)
    await embedBoot()
  } catch (err) {
    off()
    ui.remove()
    // index.html'deki açılış tanılaması yakalar ve nedeni gösterir.
    throw err instanceof Error ? err : new Error(String(err))
  }
  ui.remove()
  await import('../../web/src/main.tsx')
}

void start()
