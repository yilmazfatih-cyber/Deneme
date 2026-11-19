// Fiş — arayüz. Sunucu yok: fiş ve yanıtlar bağlantının # kısmında taşınır, toplayıcının telefonu
// yanıtları localStorage'da biriktirir. Bağlantıdan ya da depodan gelen her metin textContent ile yazılır.
import {
  newId,
  subtotal,
  normalizeBill,
  normalizeResp,
  encodeBill,
  decodeBill,
  encodeResp,
  decodeResp,
  encodeAll,
  decodeAll,
  parseHash,
  buildUrl,
  nameKey,
  upsertResp,
  calc,
  report,
  parseReceiptText,
  formatMoney,
  parseMoney,
  MAX_UNIT,
} from './fis.mjs'
import { ORNEK_FIS } from './ornek.mjs'
import qrcode from './vendor/qrcode.mjs'

// ---------- Depo (localStorage atarsa bellekte sürer: gizli sekmede de her şey çizilir) ----------
const mem = new Map()
const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key)
      if (v != null) return v
    } catch {
      /* depoya erişim yok */
    }
    return mem.has(key) ? mem.get(key) : null
  },
  set(key, value) {
    mem.set(key, value)
    try {
      localStorage.setItem(key, value)
    } catch {
      /* yalnızca bu oturumda hatırlanır */
    }
  },
  del(key) {
    mem.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      /* yok say */
    }
  },
  json(key) {
    try {
      return JSON.parse(this.get(key) || 'null')
    } catch {
      return null
    }
  },
}

const isHost = (id) => store.get('fis.host.' + id) === '1'
const setHost = (id) => store.set('fis.host.' + id, '1')

function loadResps(bill) {
  const raw = store.json('fis.resps.' + bill.id)
  let out = []
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const r = normalizeResp(bill, x)
      if (r) out = upsertResp(out, r)
    }
  }
  return out
}
function saveResps(bill, resps) {
  store.set('fis.resps.' + bill.id, JSON.stringify(resps))
}
function loadBill(id) {
  const b = decodeBill(store.get('fis.bill.' + id) || '')
  return b && b.id === id ? b : null
}
function loadRecent() {
  const raw = store.json('fis.recent')
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x.id))
    .map((x) => ({ id: x.id, title: String(x.title || '').slice(0, 80), t: Number(x.t) || 0, host: x.host === true }))
    .slice(0, 20)
}
/** Fişi bu telefona kaydeder ve son hesaplar listesinin başına alır. */
function remember(bill, host) {
  store.set('fis.bill.' + bill.id, encodeBill(bill))
  const list = loadRecent()
  const old = list.find((x) => x.id === bill.id)
  const entry = { id: bill.id, title: bill.title, t: old ? old.t : Date.now(), host: host || (old ? old.host : false) }
  const next = [entry, ...list.filter((x) => x.id !== bill.id)]
  // Liste 20'yi aşınca en eski misafir kaydı (yoksa en eski kayıt) verisiyle birlikte silinir; depo şişmez.
  while (next.length > 20) {
    let at = next.length - 1
    for (let i = next.length - 1; i > 0; i--) {
      if (!next[i].host) {
        at = i
        break
      }
    }
    dropKeys(next.splice(at, 1)[0].id)
  }
  store.set('fis.recent', JSON.stringify(next))
}
function dropKeys(id) {
  for (const k of ['fis.bill.', 'fis.resps.', 'fis.host.', 'fis.pick.', 'fis.me.']) store.del(k + id)
}
function forget(id) {
  dropKeys(id)
  store.set('fis.recent', JSON.stringify(loadRecent().filter((x) => x.id !== id)))
}

// ---------- Küçük yardımcılar ----------
const app = document.getElementById('app')
const toasts = document.getElementById('toasts')
const base = () => location.href.split('#')[0]
const money = formatMoney
const plain = (k) => formatMoney(k).replace(/\s*₺$/, '')

/** DOM kurucu. Metin çocukları her zaman metin düğümü olur (innerHTML yok). */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue
      if (k === 'class') el.className = v
      else if (k === 'value') el.value = v
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else el.setAttribute(k, v === true ? '' : v)
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  }
  return el
}

// Simgeler: 24'lük ızgarada çizgi simgeler. Yollar sabittir, kullanıcı verisi içermez.
const ICONS = {
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  share: 'M12 15V3.5M7.5 7.5L12 3l4.5 4.5M5 12v7a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-7',
  copy: 'M9 9h10a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V10a1 1 0 011-1zM5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5h6V7',
  clock: 'M12 7.5V12l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 9v4.5M12 17h.01M10.3 4.2L2.9 17a2 2 0 001.7 3h14.8a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5a7.5 7.5 0 0115 0',
  personPlus: 'M10 12a4 4 0 100-8 4 4 0 000 8zM2.5 20.5a7.5 7.5 0 0113.2-4.9M19 14v6M16 17h6',
  paste:
    'M9 4H7a1.5 1.5 0 00-1.5 1.5v14A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5v-14A1.5 1.5 0 0017 4h-2M9 3h6v3H9zM9 12h6M9 16h4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1M19.5 14h.5',
  receipt: 'M6 3h12v18l-2.4-1.6L13.2 21 12 20.2l-1.2.8-2.4-1.6L6 21zM9 8h6M9 12h6M9 16h3',
  split: 'M12 3v18M4 8l16 8M4 16l16-8',
  info: 'M12 11v5.5M12 7.5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  pencil: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19zM14.5 6.5l3 3',
}
function icon(name, size = 22, stroke = 2) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('class', 'ic')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', stroke)
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(ns, 'path')
  p.setAttribute('d', ICONS[name])
  svg.append(p)
  return svg
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => Array.from(p)[0] || '')
    .join('')
    .toLocaleUpperCase('tr-TR')
}

/** Tek bildirim: yenisi eskisinin yerine geçer (üst üste binmez). Yeri CSS'te: alt çubuğun hemen üstü. */
let toastTimer = 0
function toast(text, ms = 4200) {
  const el = h('div', { class: 'toast' }, icon('check', 20, 2.4), h('span', null, text))
  clearTimeout(toastTimer)
  toasts.replaceChildren(el)
  toastTimer = setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 300)
  }, ms)
}

// ---------- Yaprak (alttan açılır) ----------
let closeSheet = () => {}
function sheet(title, build) {
  closeSheet()
  const opener = document.activeElement
  const body = h('div', { class: 'sheet-body' })
  const close = () => {
    backdrop.remove()
    el.remove()
    document.documentElement.classList.remove('locked')
    document.removeEventListener('keydown', onKey)
    closeSheet = () => {}
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  const backdrop = h('div', { class: 'backdrop', onclick: close })
  const heading = h('h2', { id: 'sheet-title' }, title)
  const el = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title', tabindex: '-1' },
    h(
      'div',
      { class: 'sheet-head' },
      heading,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon('close')),
    ),
    body,
  )
  build(body, close)
  document.body.append(backdrop, el)
  document.documentElement.classList.add('locked')
  document.addEventListener('keydown', onKey)
  closeSheet = close
  el.focus({ preventScroll: true })
  return close
}

// iOS'ta klavye sabit konumlu yaprağın altını örter (yerleşim görünümü küçülmez). Görsel görünümden klavye
// yüksekliğini ölçüp yaprağı yukarı taşırız; böylece yapıştırma alanının altındaki düğme görünür kalır.
const vv = window.visualViewport
if (vv) {
  const onVv = () => {
    const kb = vv.scale > 1.01 ? 0 : Math.round(window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px')
  }
  vv.addEventListener('resize', onVv)
  vv.addEventListener('scroll', onVv)
}

// ---------- Paylaşma ve kopyalama (iOS: dokunuşun içinde, öncesinde await yok) ----------
function legacyCopy(text) {
  try {
    const ta = h('textarea', {
      readonly: true,
      'aria-hidden': 'true',
      style: 'position:fixed;top:0;left:0;opacity:0;font-size:16px',
    })
    ta.value = text
    document.body.append(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
function manualCopy(text) {
  sheet('Bağlantıyı elle kopyala', (body) => {
    const input = h('input', { class: 'copy-box', type: 'text', readonly: true, 'aria-label': 'Bağlantı' })
    input.value = text
    input.addEventListener('focus', () => input.setSelectionRange(0, text.length))
    body.append(h('p', null, 'Kopyalanamadı. Alana basılı tut, "Tümünü Seç" ve "Kopyala" de.'), input)
    setTimeout(() => {
      input.focus()
      input.select()
    }, 50)
  })
}
function copyText(text, okMsg = 'Bağlantı kopyalandı') {
  const fallback = () => (legacyCopy(text) ? toast(okMsg) : manualCopy(text))
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback)
      return
    }
  } catch {
    /* aşağıdaki yedeğe düş */
  }
  fallback()
}
/** Paylaşım sayfasını açar; yoksa ya da açılamazsa bağlantıyı kopyalar ve bunu söyler. */
function shareLink(data) {
  const copied = 'Paylaşım açılamadı; bağlantı kopyalandı'
  if (typeof navigator.share === 'function') {
    try {
      navigator.share(data).catch((err) => {
        if (!err || err.name !== 'AbortError') copyText(data.url, copied)
      })
    } catch {
      copyText(data.url, copied)
    }
    return
  }
  copyText(data.url, 'Bu tarayıcıda paylaşım yok; bağlantı kopyalandı')
}

// ---------- QR ----------
function qrBox(text, label) {
  const box = h('div', { class: 'qr', role: 'img', 'aria-label': label })
  try {
    const q = qrcode(0, 'L')
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    const m = 4 // sessiz bölge: standart 4 modül
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue
        let w = 1
        while (c + w < n && q.isDark(r, c + w)) w++
        d += `M${c + m} ${r + m}h${w}v1h-${w}z`
        c += w - 1
      }
    }
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', `0 0 ${n + 2 * m} ${n + 2 * m}`)
    svg.setAttribute('shape-rendering', 'crispEdges')
    svg.setAttribute('data-modules', n)
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    p.setAttribute('fill', '#000')
    svg.append(p)
    box.append(svg)
    return box
  } catch {
    return h('div', { class: 'qr-none' }, 'Bu bağlantı QR koda sığmıyor. Paylaş ya da kopyala düğmesini kullan.')
  }
}

/** QR'ın bayt kipinde en düşük hata düzeltmeyle (L) taşıyabildiği üst sınır: sürüm 40 = 2953 bayt. */
const qrFits = (text) => new TextEncoder().encode(text).length <= 2953

// ---------- Yönlendirme ----------
let renderedHash = null
let lastKey = ''
const encCache = { id: '', bill: null, str: '' }
function enc(bill) {
  if (encCache.bill !== bill) Object.assign(encCache, { bill, str: encodeBill(bill) })
  return encCache.str
}
const hashFor = (bill, view) => '#b=' + enc(bill) + (view ? '&v=' + view : '')

function go(hash, replace = false) {
  closeSheet()
  if (replace) history.replaceState(null, '', base() + hash)
  else if (location.hash !== hash) location.hash = hash
  render()
}
window.addEventListener('hashchange', () => {
  if (location.hash !== renderedHash) {
    closeSheet()
    render()
  }
})
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('fis.resps.') && lastKey.startsWith('toplama:')) render()
})

/** Toplayıcının seçim ekranı kimin için açık (bellekte; yenilemede "kendim" olur). */
let pickFor = null
/** Seçim ekranı Toplama'dan açıldıysa dönüşte geçmişte geri gidilir (geri tuşu aynı ekrana düşmesin). */
let secPushed = false
function openPick(bill, who) {
  pickFor = { id: bill.id, ...who }
  secPushed = true
  go(hashFor(bill, 'sec'))
}
function leavePick(bill) {
  pickFor = null
  closeSheet()
  if (secPushed && history.length > 1) {
    secPushed = false
    history.back() // hashchange yeniden çizer
  } else go(hashFor(bill), true)
}

function render() {
  renderedHash = location.hash
  const parts = parseHash(location.hash)
  const view = (/(?:^#|&)v=([a-z]+)/.exec(location.hash) || [])[1] || ''
  let screen
  if (!parts.b) {
    screen = view === 'yeni' ? screenEntry() : screenHome()
  } else {
    let bill = decodeBill(parts.b)
    // Toplayıcının telefonunda kayıtlı fiş esastır: aynı kimlikle gelen farklı içerikli bir bağlantı
    // (değiştirilmiş fiyatlar, eksik kalemler) kayıtlı fişin ve yanıtların üzerine yazamaz.
    if (bill && !parts.s && isHost(bill.id)) {
      const own = loadBill(bill.id)
      if (own && encodeBill(own) !== encodeBill(bill)) {
        bill = own
        if (!parts.r) {
          history.replaceState(null, '', base() + hashFor(own, view))
          renderedHash = location.hash
          toast('Bu bağlantıdaki fiş seninkinden farklı. Kendi kayıtlı fişin açıldı.')
        }
      }
    }
    if (!bill) screen = screenBroken()
    else if (parts.s) screen = screenResult(bill, decodeAll(bill, parts.s))
    else if (parts.r) screen = routeResponse(bill, parts.r)
    else if (isHost(bill.id)) {
      remember(bill, true)
      if (view === 'paylas') screen = screenShare(bill)
      else if (view === 'sec') screen = screenPick(bill, true)
      else screen = screenCollect(bill)
    } else {
      remember(bill, false)
      screen = screenPick(bill, false)
    }
  }
  if (!screen) return
  const same = screen.key === lastKey
  const y = window.scrollY
  app.replaceChildren(...screen.nodes.filter(Boolean))
  document.title = screen.title ? screen.title + ' · Fiş' : 'Fiş'
  document.documentElement.classList.toggle('with-bar', !!app.querySelector('.bar'))
  window.scrollTo(0, same ? y : 0)
  lastKey = screen.key
  if (screen.after) screen.after()
}

function nav(left, right) {
  return h('header', { class: 'nav' }, left || h('span'), right || h('span'))
}
const backBtn = (label, onclick) =>
  h('button', { class: 'nav-btn', type: 'button', onclick }, icon('back', 24, 2.2), label)
const brand = () =>
  h('a', { class: 'nav-brand', href: '#', 'aria-label': 'Fiş ana ekranı' }, icon('receipt', 20), 'Fiş')

// ---------- 1. Ana ekran ----------
function screenHome() {
  const recent = loadRecent()
  const rows = recent.map((x) => {
    const bill = loadBill(x.id)
    if (!bill) return null
    let status = h('span', { class: 'pill' }, 'misafir')
    if (x.host && isHost(x.id)) {
      const r = report(bill, loadResps(bill))
      status = r.complete
        ? h('span', { class: 'pill ok' }, icon('check', 14, 3), 'tamam')
        : h(
            'span',
            { class: 'pill warn' },
            r.expected ? `${r.answered}/${r.expected} gönderdi` : `${r.answered} gönderdi`,
          )
    }
    const date = x.t ? new Date(x.t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ''
    return h(
      'a',
      { class: 'row', href: hashFor(bill) },
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 't' }, bill.title || 'Hesap'),
        h('div', { class: 's num' }, `${date} · ${money(bill.total)}`),
      ),
      status,
      h('span', { class: 'chev' }, icon('chev', 18)),
    )
  })
  const step = (n, t, s) =>
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'n' }, n),
      h('div', { class: 'grow' }, h('div', { class: 't' }, t), h('div', { class: 's' }, s)),
    )
  const mark = h('img', { class: 'brand-mark', src: './icon.svg', alt: '', width: '64', height: '64' })
  const main = h(
    'main',
    null,
    mark,
    h('h1', { class: 'large' }, 'Fiş'),
    h('p', { class: 'lead' }, 'Masadaki hesabı herkes kendi telefonundan bölüşür. Hesap açmak, uygulama kurmak yok.'),
    h(
      'div',
      { class: 'stack' },
      h('a', { class: 'btn primary block', href: '#v=yeni' }, icon('plus', 20, 2.4), 'Yeni hesap'),
      h('button', { class: 'btn block', type: 'button', id: 'ornek', onclick: openSample }, 'Örnek fişi dene'),
    ),
    rows.some(Boolean) && [h('div', { class: 'label' }, 'Son hesaplar'), h('div', { class: 'group' }, rows)],
    h('div', { class: 'label' }, 'Nasıl çalışır'),
    h(
      'div',
      { class: 'group steps' },
      step('1', 'Fişi gir', 'Kalemleri yaz ya da fiş fotoğrafından kopyaladığın metni yapıştır.'),
      step('2', 'Masaya yolla', 'AirDrop, QR ya da mesajla. Herkes Safari’de açar, yediğini işaretler.'),
      step(
        '3',
        'Eksiği gör',
        'Seçimler sana döner. Kim göndermedi, hangi kalem sahipsiz, kaç lira açıkta: hepsi tek ekranda.',
      ),
    ),
    h('p', { class: 'foot' }, 'Sunucu yok. Fiş bağlantının içinde gider; yanıtlar yalnızca bu telefonda durur.'),
  )
  return { key: 'home', title: '', nodes: [nav(), main] }
}
function openSample() {
  const bill = normalizeBill(ORNEK_FIS)
  if (!bill) return
  setHost(bill.id)
  remember(bill, true)
  go(hashFor(bill, 'paylas'))
}

function screenBroken() {
  const main = h(
    'main',
    null,
    h('h1', { class: 'large' }, 'Bağlantı açılamadı'),
    h(
      'p',
      { class: 'lead' },
      'Bağlantı eksik kopyalanmış olabilir. Gönderen kişiden bağlantıyı yeniden iste ya da QR kodu okut.',
    ),
    h('a', { class: 'btn block', href: '#' }, 'Ana ekrana dön'),
  )
  return { key: 'broken', title: 'Bağlantı açılamadı', nodes: [nav(brand()), main] }
}

// ---------- 2. Fiş girişi ----------
let draft = null
function emptyDraft() {
  return { title: '', people: '', items: [{ name: '', qty: '1', unit: '' }], total: '', note: '' }
}
function loadDraft() {
  const d = store.json('fis.draft')
  const out = emptyDraft()
  if (!d || typeof d !== 'object') return out
  for (const k of ['title', 'people', 'total', 'note']) if (typeof d[k] === 'string') out[k] = d[k].slice(0, 300)
  if (Array.isArray(d.items) && d.items.length) {
    out.items = d.items.slice(0, 99).map((it) => ({
      name: String((it && it.name) || '').slice(0, 60),
      qty: String((it && it.qty) || '1').slice(0, 2),
      unit: String((it && it.unit) || '').slice(0, 12),
    }))
  }
  return out
}
const saveDraft = () => store.set('fis.draft', JSON.stringify(draft))
function draftItems() {
  const items = []
  for (const it of draft.items) {
    const name = it.name.trim()
    const qty = /^\d{1,2}$/.test(it.qty.trim()) ? Number(it.qty) : 0
    const unit = parseMoney(it.unit)
    if (!name && !it.unit.trim()) continue
    items.push({ name, qty, unit, ok: !!name && qty >= 1 && unit != null && unit > 0 && unit <= MAX_UNIT })
  }
  return items
}

function screenEntry() {
  if (!draft) draft = loadDraft()
  const err = h('p', { class: 'err', role: 'alert' })
  const subEl = h('span', { class: 'num' })
  const discEl = h('p', { class: 'foot' })
  const barK = h('div', { class: 'k' })
  const barV = h('div', { class: 'v' })
  const totalInput = h('input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    id: 'f-total',
    value: draft.total,
    oninput: (e) => {
      draft.total = e.target.value
      sync()
    },
  })

  function sync() {
    saveDraft()
    const items = draftItems()
    const sub = items.reduce((a, it) => a + (it.ok ? it.qty * it.unit : 0), 0)
    subEl.textContent = money(sub)
    totalInput.placeholder = plain(sub)
    const t = draft.total.trim() ? parseMoney(draft.total) : sub
    let msg = ''
    if (t == null) msg = 'Ödenecek tutar okunamadı. 9.770,75 gibi yaz.'
    else if (t > sub && sub > 0)
      msg = 'Ödenecek tutar ara toplamdan büyük olamaz. Servis ücreti varsa kalem olarak ekle.'
    else if (sub > 0 && t < sub)
      msg = `İndirim ${money(sub - t)} (%${Math.round(((sub - t) / sub) * 100)}). Herkesin payına aynı oranda yansır.`
    else msg = 'İndirim varsa fişin en altındaki tutarı yaz. Boş bırakırsan ara toplam geçerli olur.'
    discEl.textContent = msg
    const n = items.filter((it) => it.ok).length
    barK.textContent = n ? `${n} kalem` : 'Kalem yok'
    barV.textContent = money(t != null && t <= sub && t > 0 ? t : sub)
    draft.items.forEach((it, i) => {
      const el = document.getElementById('f-tot-' + i)
      const unit = parseMoney(it.unit)
      const qty = /^\d{1,2}$/.test(it.qty.trim()) ? Number(it.qty) : 0
      if (el) el.textContent = unit && qty ? money(unit * qty) : '—'
    })
  }

  const rowEls = draft.items.map((it, i) =>
    h(
      'div',
      { class: 'li-edit' },
      h(
        'div',
        { class: 'top' },
        h(
          'div',
          { class: 'box name' },
          h('input', {
            type: 'text',
            id: 'f-name-' + i,
            placeholder: 'Kalem adı',
            'aria-label': `${i + 1}. kalemin adı`,
            maxlength: '60',
            autocomplete: 'off',
            autocapitalize: 'sentences',
            enterkeyhint: 'next',
            value: it.name,
            oninput: (e) => {
              it.name = e.target.value
              sync()
            },
          }),
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `${i + 1}. kalemi sil`,
            onclick: () => {
              draft.items.splice(i, 1)
              if (!draft.items.length) draft.items.push({ name: '', qty: '1', unit: '' })
              saveDraft()
              render()
            },
          },
          icon('trash', 20, 1.8),
        ),
      ),
      h(
        'div',
        { class: 'bottom' },
        h(
          'div',
          { class: 'box qty' },
          h('input', {
            type: 'text',
            inputmode: 'numeric',
            id: 'f-qty-' + i,
            'aria-label': 'Adet',
            maxlength: '2',
            autocomplete: 'off',
            value: it.qty,
            oninput: (e) => {
              it.qty = e.target.value
              sync()
            },
          }),
        ),
        h('span', { class: 'x' }, '×'),
        h(
          'div',
          { class: 'box unit' },
          h('input', {
            type: 'text',
            inputmode: 'decimal',
            id: 'f-unit-' + i,
            placeholder: 'Birim ₺',
            'aria-label': 'Birim fiyat (₺)',
            maxlength: '12',
            autocomplete: 'off',
            value: it.unit,
            oninput: (e) => {
              it.unit = e.target.value
              sync()
            },
          }),
        ),
        h('span', { class: 'tot', id: 'f-tot-' + i }, '—'),
      ),
    ),
  )

  function addRow() {
    if (draft.items.length >= 99) return toast('Bir fişe en çok 99 kalem girilir')
    draft.items.push({ name: '', qty: '1', unit: '' })
    saveDraft()
    render()
    const el = document.getElementById('f-name-' + (draft.items.length - 1))
    if (el) el.focus()
  }

  function pasteSheet() {
    sheet('Fiş metnini yapıştır', (body, close) => {
      const ta = h('textarea', {
        class: 'big',
        id: 'f-paste',
        'aria-label': 'Fiş metni',
        placeholder: 'DONER PORSIYON 1 700,00 700,00\nAYRAN PAKET 3 120,00 360,00\nTOPLAM 1.060,00',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
      })
      const perr = h('p', { class: 'err', role: 'alert' })
      body.append(
        h(
          'p',
          null,
          'iPhone’da fişin fotoğrafını aç, yazının üstüne basılı tut, "Metni Kopyala" de. Sonra buraya yapıştır.',
        ),
        ta,
        perr,
        h(
          'button',
          {
            class: 'btn primary block',
            type: 'button',
            style: 'margin-top:14px',
            onclick: () => {
              const res = parseReceiptText(ta.value)
              if (!res.items.length) {
                perr.textContent = 'Kalem bulunamadı. Her satırda ad ve tutar olmalı. İstersen kalemleri elle gir.'
                return
              }
              const fresh = res.items
                .slice(0, 99)
                .map((it) => ({ name: it.name, qty: String(it.qty), unit: plain(it.unit) }))
              const kept = draft.items.filter((it) => it.name.trim() || it.unit.trim())
              draft.items = [...kept, ...fresh].slice(0, 99)
              const sub = res.items.reduce((a, it) => a + it.qty * it.unit, 0)
              if (!kept.length && res.total && res.total < sub) draft.total = plain(res.total)
              saveDraft()
              close()
              render()
              toast(`${fresh.length} kalem eklendi. Adları ve fiyatları kontrol et.`)
            },
          },
          'Satırları doldur',
        ),
      )
      setTimeout(() => ta.focus(), 60)
    })
  }

  function submit() {
    const items = draftItems()
    const bad = items.findIndex((it) => !it.ok)
    const fail = (msg) => {
      err.textContent = msg
      err.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    if (!items.length) return fail('Önce en az bir kalem gir: ad, adet ve birim fiyat.')
    if (bad >= 0)
      return fail(
        items[bad].unit > MAX_UNIT
          ? `"${items[bad].name || 'Adsız kalem'}" satırının birim fiyatı çok büyük (en çok ${money(MAX_UNIT)}).`
          : `"${items[bad].name || 'Adsız kalem'}" satırı eksik. Ad, adet (1-99) ve birim fiyat gerekli.`,
      )
    const sub = items.reduce((a, it) => a + it.qty * it.unit, 0)
    const total = draft.total.trim() ? parseMoney(draft.total) : sub
    if (total == null || total < 1) return fail('Ödenecek tutar okunamadı. 9.770,75 gibi yaz ya da boş bırak.')
    if (total > sub) return fail('Ödenecek tutar ara toplamdan büyük olamaz. Servis ücreti varsa kalem olarak ekle.')
    const people = /^\d{1,2}$/.test(draft.people.trim()) ? Number(draft.people) : 0
    const bill = normalizeBill({
      id: newId(),
      title: draft.title.trim() || 'Hesap',
      meta: new Date().toLocaleDateString('tr-TR'),
      people,
      total,
      note: draft.note.trim(),
      items: items.map((it) => ({ name: it.name, qty: it.qty, unit: it.unit })),
    })
    if (!bill) return fail('Fiş oluşturulamadı. Kalemleri kontrol et.')
    setHost(bill.id)
    remember(bill, true)
    draft = null
    store.del('fis.draft')
    go(hashFor(bill, 'paylas'), true)
  }

  const field = (label, input, cls = '') => h('label', { class: 'field ' + cls }, h('span', null, label), input)
  const main = h(
    'main',
    { class: 'has-bar' },
    h('h1', { class: 'large' }, 'Yeni hesap'),
    h('p', { class: 'lead' }, 'Fişteki kalemleri gir. Paylaştıktan sonra kalemler değişmez.'),
    h(
      'div',
      { class: 'group' },
      field(
        'İşletme',
        h('input', {
          type: 'text',
          id: 'f-title',
          placeholder: 'Restoranın adı',
          maxlength: '80',
          autocomplete: 'off',
          value: draft.title,
          oninput: (e) => {
            draft.title = e.target.value
            saveDraft()
          },
        }),
      ),
      field(
        'Kaç kişisiniz',
        h('input', {
          type: 'text',
          inputmode: 'numeric',
          id: 'f-people',
          placeholder: 'Bilmiyorum',
          maxlength: '2',
          autocomplete: 'off',
          value: draft.people,
          oninput: (e) => {
            draft.people = e.target.value
            saveDraft()
          },
        }),
      ),
    ),
    h('p', { class: 'foot' }, 'Kişi sayısını yazarsan kaç kişinin eksik olduğunu söyleyebilirim.'),
    h('div', { class: 'label' }, 'Kalemler'),
    h(
      'button',
      { class: 'btn block', type: 'button', id: 'f-paste-open', style: 'margin-bottom:12px', onclick: pasteSheet },
      icon('paste', 20),
      'Fiş metnini yapıştır',
    ),
    h(
      'div',
      { class: 'receipt-wrap' },
      h('div', { class: 'receipt' }, rowEls, h('div', { class: 'sum first' }, h('span', null, 'Ara toplam'), subEl)),
    ),
    h(
      'button',
      { class: 'btn block', type: 'button', id: 'f-add', style: 'margin-top:12px', onclick: addRow },
      icon('plus', 20, 2.4),
      'Kalem ekle',
    ),
    h('div', { class: 'label' }, 'Ödeme'),
    h(
      'div',
      { class: 'group' },
      field('Ödenecek tutar', totalInput),
      field(
        'Ödeme notu (isteğe bağlı)',
        h(
          'textarea',
          {
            id: 'f-note',
            rows: '2',
            maxlength: '200',
            placeholder: 'IBAN, ad soyad…',
            oninput: (e) => {
              draft.note = e.target.value
              saveDraft()
            },
          },
          draft.note,
        ),
        'col',
      ),
    ),
    discEl,
    err,
  )
  const bar = h(
    'div',
    { class: 'bar' },
    h(
      'div',
      { class: 'bar-in' },
      h('div', { class: 'grow' }, barK, barV),
      h('button', { class: 'btn primary', type: 'button', id: 'f-submit', onclick: submit }, 'Paylaş'),
    ),
  )
  return {
    key: 'entry',
    title: 'Yeni hesap',
    nodes: [nav(backBtn('Vazgeç', () => go('#'))), main, bar],
    after: sync,
  }
}

// ---------- 3. Paylaş ----------
function shareBlock(bill) {
  const url = buildUrl(base(), { b: enc(bill) })
  const data = { title: 'Fiş · ' + bill.title, text: `${bill.title} hesabı: yediklerini işaretle`, url }
  return [
    h(
      'div',
      { class: 'qr-card' },
      qrBox(url, 'Misafir bağlantısının QR kodu'),
      qrFits(url) && h('p', { class: 'qr-cap' }, 'Masadakiler kamerayla okutsun ya da bağlantıyı yolla.'),
    ),
    h(
      'div',
      { class: 'stack', style: 'margin-top:14px' },
      h(
        'button',
        { class: 'btn primary block', type: 'button', id: 'share-go', onclick: () => shareLink(data) },
        icon('share', 20),
        'Paylaş',
      ),
      h(
        'button',
        { class: 'btn block', type: 'button', id: 'share-copy', 'data-url': url, onclick: () => copyText(url) },
        icon('copy', 20),
        'Bağlantıyı kopyala',
      ),
    ),
  ]
}
function screenShare(bill) {
  const main = h(
    'main',
    null,
    h('h1', { class: 'large' }, 'Masaya yolla'),
    h('p', { class: 'meta' }, `${bill.title} · `, h('span', { class: 'num' }, money(bill.total))),
    shareBlock(bill),
    h('p', { class: 'foot center' }, '"Paylaş" iPhone’un paylaşım sayfasını açar: AirDrop, Mesajlar, WhatsApp orada.'),
    h(
      'a',
      { class: 'btn quiet block', id: 'to-collect', href: hashFor(bill), style: 'margin-top:10px' },
      'Toplama ekranına geç',
      icon('chev', 18, 2.2),
    ),
  )
  return { key: 'share:' + bill.id, title: 'Paylaş', nodes: [nav(backBtn('Hesaplar', () => go('#'))), main] }
}

// ---------- 4. Misafir (ve toplayıcının "birinin yerine işaretle" ekranı) ----------
function screenPick(bill, host) {
  const resps = host ? loadResps(bill) : []
  const sel = { name: '', picks: {} }
  let editing = false
  if (host) {
    const who = pickFor && pickFor.id === bill.id ? pickFor : { self: true, name: store.get('fis.name') || '' }
    sel.name = who.name || ''
    const old = sel.name && resps.find((r) => nameKey(r.name) === nameKey(sel.name))
    if (old) {
      sel.picks = { ...old.picks }
      editing = true
    }
    pickFor = { id: bill.id, ...who }
  } else {
    const saved = normalizeResp(bill, { ...(store.json('fis.pick.' + bill.id) || {}), name: '-' })
    if (saved) sel.picks = saved.picks
    const raw = store.json('fis.pick.' + bill.id)
    sel.name = (raw && typeof raw.name === 'string' ? raw.name : store.get('fis.name') || '').slice(0, 24)
  }
  const self = host && pickFor.self
  const origKey = nameKey(sel.name)
  const others = host ? resps.filter((r) => nameKey(r.name) !== nameKey(sel.name)) : []
  const taken = calc(bill, others).units
  const discount = bill.total < subtotal(bill)

  const persist = () => {
    if (host) return
    store.set('fis.pick.' + bill.id, JSON.stringify(sel))
    if (sel.name.trim()) store.set('fis.name', sel.name.trim())
  }
  const current = () => normalizeResp(bill, { name: sel.name.trim() || '—', picks: sel.picks })
  function estimate() {
    const me = current()
    if (!me || !Object.keys(me.picks).length) return 0
    const c = calc(bill, upsertResp(others, me))
    const p = c.people.find((x) => nameKey(x.name) === nameKey(me.name))
    return p ? p.due : 0
  }

  const barV = h('div', { class: 'v', id: 'pick-due' })
  const barK = h('div', { class: 'k' })
  const err = h('p', { class: 'err', role: 'alert' })
  const nameInput = h('input', {
    type: 'text',
    id: 'pick-name',
    placeholder: host && !self ? 'Kimin için?' : 'Adın',
    maxlength: '24',
    autocomplete: 'given-name',
    autocapitalize: 'words',
    enterkeyhint: 'done',
    value: sel.name,
    oninput: (e) => {
      sel.name = e.target.value
      nameField.classList.remove('bad')
      err.textContent = ''
      persist()
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') e.target.blur()
    },
  })
  const nameField = h('label', { class: 'field' }, h('span', null, host && !self ? 'Ad' : 'Adın'), nameInput)

  const painters = []
  function paintBar() {
    const n = Object.keys(sel.picks).length
    barK.textContent = n ? (host && !self ? 'Payı ≈' : 'Senin payın ≈') : 'Henüz seçim yok'
    barV.textContent = money(estimate())
    barV.dataset.due = String(estimate())
  }
  const rows = bill.items.map((it, i) => {
    const line = it.qty * it.unit
    const sub = h('div', { class: 's' })
    const amt = h('span', { class: 'amt', 'data-amt': line }, money(line))
    const main = h(
      'button',
      {
        class: 'li-main',
        type: 'button',
        role: 'checkbox',
        onclick: () => {
          if (sel.picks[i]) delete sel.picks[i]
          else sel.picks[i] = 1
          err.textContent = ''
          persist()
          paint()
          paintBar()
        },
      },
      h('span', { class: 'check' }, icon('check', 16, 3)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, it.name), sub),
      amt,
    )
    const out = h('output', { 'aria-live': 'polite' })
    const minus = h(
      'button',
      { type: 'button', 'aria-label': 'Bir azalt', onclick: () => bump(-1) },
      icon('minus', 20, 2.4),
    )
    const plus = h(
      'button',
      { type: 'button', 'aria-label': 'Bir artır', onclick: () => bump(1) },
      icon('plus', 20, 2.4),
    )
    const step = h(
      'div',
      { class: 'li-step' },
      h('span', null, host && !self ? 'Kaç tanesi onun?' : 'Kaç tanesi senin?'),
      h('div', { class: 'stepper' }, minus, out, plus),
    )
    const row = h('div', { class: 'li', 'data-i': i }, main, it.qty > 1 ? step : null)
    function bump(d) {
      const next = (sel.picks[i] || 0) + d
      if (next < 1) delete sel.picks[i]
      else sel.picks[i] = Math.min(it.qty, next)
      persist()
      paint()
      paintBar()
    }
    function paint() {
      const n = sel.picks[i] || 0
      row.classList.toggle('on', n > 0)
      main.setAttribute('aria-checked', n > 0 ? 'true' : 'false')
      const bits = []
      if (it.qty > 1) bits.push(`${it.qty} adet × ${money(it.unit)}`)
      if (host && taken[i])
        bits.push(taken[i] >= it.qty ? `${taken[i]} kişi işaretledi` : `${taken[i]}/${it.qty} alındı`)
      sub.textContent = bits.join(' · ')
      sub.classList.toggle('hidden', !bits.length)
      // Çok adetli kalemde sağdaki tutar kişinin aldığı kadardır (liste fiyatıyla); satırın tamamı altta yazar.
      const own = n > 0 ? n * it.unit : line
      amt.textContent = money(own)
      amt.dataset.amt = String(own)
      if (it.qty > 1) {
        step.classList.toggle('hidden', n === 0)
        out.textContent = `${n} / ${it.qty}`
        minus.disabled = n <= 0
        plus.disabled = n >= it.qty
      }
    }
    painters.push(paint)
    return row
  })

  function submit() {
    const name = sel.name.trim()
    if (!name) {
      nameField.classList.add('bad')
      err.textContent =
        host && !self ? 'Önce kimin için işaretlediğini yaz.' : 'Önce adını yaz ki toplayıcı seni tanısın.'
      nameInput.focus()
      nameField.scrollIntoView({ block: 'center' })
      return
    }
    const me = normalizeResp(bill, { name, picks: sel.picks })
    if (!me || !Object.keys(me.picks).length) {
      err.textContent = 'Henüz bir şey işaretlemedin. Yediklerine dokun.'
      return
    }
    if (host) {
      // Düzenlerken ad değişirse eski kayıt silinir; ad başka birine aitse üzerine yazılmaz.
      const key = nameKey(me.name)
      if ((!editing || key !== origKey) && resps.some((r) => nameKey(r.name) === key)) {
        err.textContent = `"${me.name}" zaten listede. Başka bir ad yaz ya da listeden o kişiyi düzenle.`
        return
      }
      const kept = editing ? resps.map((r) => (nameKey(r.name) === origKey ? me : r)) : resps
      const next = upsertResp(kept, me)
      saveResps(bill, next)
      if (self) store.set('fis.name', me.name)
      const due = calc(bill, next).people.find((p) => nameKey(p.name) === key)
      toast(`${me.name} ${editing ? 'güncellendi' : 'eklendi'} (${money(due ? due.due : 0)})`)
      leavePick(bill)
      return
    }
    sendSheet(bill, me, estimate())
  }

  const main = h(
    'main',
    { class: 'has-bar' },
    h('h1', { class: 'large' }, host ? (self ? 'Kendi yediklerim' : editing ? sel.name : 'Birini ekle') : bill.title),
    h(
      'p',
      { class: 'meta' },
      host ? bill.title : bill.meta,
      host || !bill.meta ? null : h('br'),
      host ? ' · ' : null,
      h('span', { class: 'num' }, `Ödenecek ${money(bill.total)}`),
      !host && bill.people ? ` · ${bill.people} kişi` : null,
    ),
    h('div', { class: 'group' }, nameField),
    h('div', { class: 'label' }, 'Ne yedin, ne içtin?', h('span', { class: 'count' }, `${bill.items.length} kalem`)),
    h('div', { class: 'receipt-wrap' }, h('div', { class: 'receipt', id: 'pick-list' }, rows)),
    h(
      'p',
      { class: 'foot' },
      'Ortak yediklerini de işaretle; toplayıcıda işaretleyenler arasında bölünür.',
      discount ? ' Fiyatlar indirimsiz; payın indirimli hesaplanır.' : '',
    ),
    err,
    !host &&
      h(
        'div',
        { class: 'links' },
        h(
          'button',
          {
            class: 'link-btn muted',
            type: 'button',
            id: 'claim-host',
            onclick: () => {
              setHost(bill.id)
              remember(bill, true)
              render()
              toast('Bu hesabı artık sen topluyorsun')
            },
          },
          'Bu hesabı ben topluyorum',
        ),
      ),
  )
  const bar = h(
    'div',
    { class: 'bar' },
    h(
      'div',
      { class: 'bar-in' },
      h('div', { class: 'grow' }, barK, barV),
      h(
        'button',
        { class: 'btn primary', type: 'button', id: 'pick-submit', onclick: submit },
        host ? (editing ? 'Kaydet' : 'Ekle') : 'Gönder',
      ),
    ),
  )
  const left = host ? backBtn('Toplama', () => leavePick(bill)) : brand()
  return {
    key: (host ? 'sec:' : 'misafir:') + bill.id,
    title: bill.title,
    nodes: [nav(left), main, bar],
    after: () => {
      painters.forEach((p) => p())
      paintBar()
    },
  }
}

function pickLines(bill, resp, person) {
  return (person ? person.items : []).map((x) => {
    const it = bill.items[x.index]
    return h(
      'div',
      { class: 'row' },
      h('div', { class: 'grow' }, (it.qty > 1 ? `${x.units} × ` : '') + it.name),
      h('span', { class: 'amt' }, money(x.amount)),
    )
  })
}

function sendSheet(bill, me, due) {
  const code = encodeResp(bill, me)
  if (!enc(bill) || !code) return toast('Seçimin bağlantıya çevrilemedi. Sayfayı yenileyip yeniden dene.')
  const url = buildUrl(base(), { b: enc(bill), r: code })
  const data = { title: 'Fiş · ' + bill.title, text: `${me.name} · ${money(due)} · seçimim`, url }
  const person = calc(bill, [me]).people[0]
  sheet('Seçimin', (body) => {
    body.append(
      h(
        'div',
        { class: 'group' },
        pickLines(bill, me, person),
        h(
          'div',
          { class: 'total-line' },
          h('span', { class: 'k' }, 'Senin payın ≈'),
          h('span', { class: 'v', id: 'send-due' }, money(due)),
        ),
      ),
      h(
        'p',
        { class: 'foot', style: 'margin-bottom:16px' },
        'Tahmini tutar. Ortak bir kalemi başkaları da işaretlerse payın düşer; son tutarı toplayıcı söyler.',
      ),
      h(
        'button',
        { class: 'btn primary block', type: 'button', id: 'send-go', onclick: () => shareLink(data) },
        icon('share', 20),
        'Toplayıcıya gönder',
      ),
      h(
        'p',
        { class: 'foot center', style: 'margin:10px 0 18px' },
        'AirDrop ya da mesajla hesabı toplayan kişiye yolla.',
      ),
      h(
        'div',
        { class: 'qr-card' },
        qrBox(url, 'Seçiminin QR kodu'),
        qrFits(url) && h('p', { class: 'qr-cap' }, 'Ya da toplayıcı kamerasıyla okutsun.'),
      ),
      h(
        'button',
        {
          class: 'btn block',
          type: 'button',
          id: 'send-copy',
          'data-url': url,
          style: 'margin-top:14px',
          onclick: () => copyText(url),
        },
        icon('copy', 20),
        'Bağlantıyı kopyala',
      ),
    )
  })
}

// ---------- Yanıt bağlantısı açıldığında ----------
function importResp(bill, resp) {
  const before = loadResps(bill)
  const old = before.find((x) => nameKey(x.name) === nameKey(resp.name))
  const next = upsertResp(before, resp)
  saveResps(bill, next)
  const p = calc(bill, next).people.find((x) => nameKey(x.name) === nameKey(resp.name))
  const due = money(p ? p.due : 0)
  // Aynı adla ikinci bir yanıt eskisinin yerine geçer; toplayıcı bunu görsün (adaş iki kişi olabilir).
  if (!old) toast(`${resp.name} eklendi (${due})`)
  else if (JSON.stringify(old.picks) === JSON.stringify(resp.picks)) toast(`${resp.name} zaten listede (${due})`)
  else toast(`${resp.name} güncellendi: yeni seçimi eskisinin yerine geçti (${due})`, 6000)
}
function routeResponse(bill, r) {
  const resp = decodeResp(bill, r)
  if (isHost(bill.id)) {
    remember(bill, true)
    if (resp) importResp(bill, resp)
    else toast('Bu bağlantıdaki seçim okunamadı. Gönderenden yeniden iste.')
    // Yenilemede tekrar eklenmesin diye yanıt kısmı adresten silinir.
    history.replaceState(null, '', base() + hashFor(bill))
    renderedHash = location.hash
    return screenCollect(bill)
  }
  if (!resp) return screenBroken()
  const person = calc(bill, [resp]).people[0]
  const url = buildUrl(base(), { b: enc(bill), r })
  const data = { title: 'Fiş · ' + bill.title, text: `${resp.name} · ${money(person.due)} · seçimim`, url }
  const main = h(
    'main',
    null,
    h('h1', { class: 'large' }, `${resp.name} seçimini yaptı`),
    h(
      'p',
      { class: 'lead', id: 'resp-info' },
      `Bu ${resp.name} adlı kişinin seçimi. Hesabı toplayan kişiye gönder; onun telefonunda açılınca listeye eklenir.`,
    ),
    h(
      'div',
      { class: 'group' },
      pickLines(bill, resp, person),
      h(
        'div',
        { class: 'total-line' },
        h('span', { class: 'k' }, 'Payı ≈'),
        h('span', { class: 'v' }, money(person.due)),
      ),
    ),
    h(
      'div',
      { class: 'stack', style: 'margin-top:18px' },
      h(
        'button',
        { class: 'btn primary block', type: 'button', onclick: () => shareLink(data) },
        icon('share', 20),
        'Toplayıcıya gönder',
      ),
      h(
        'button',
        {
          class: 'btn block',
          type: 'button',
          id: 'claim-host',
          onclick: () => {
            setHost(bill.id)
            render()
          },
        },
        'Bu hesabı ben topluyorum',
      ),
      h('a', { class: 'btn quiet block', href: hashFor(bill) }, 'Kendi seçimimi yapacağım'),
    ),
  )
  return { key: 'yanit:' + bill.id, title: bill.title, nodes: [nav(brand()), main] }
}

// ---------- 5. Toplama ("ortak yer") ----------
const openRows = new Set()
function personRow(bill, c, p, extra) {
  const key = extra.prefix + nameKey(p.name)
  const open = openRows.has(key)
  const lines = p.items.map((x) => {
    const it = bill.items[x.index]
    const sharedBy = c.units[x.index] > it.qty
    return h(
      'div',
      { class: 'line' },
      h('span', null, (it.qty > 1 ? `${x.units} × ` : '') + it.name + (sharedBy ? ' (bölüşülüyor)' : '')),
      h('span', null, money(x.amount)),
    )
  })
  return [
    h(
      'button',
      {
        class: 'row' + (extra.mine ? ' mine' : ''),
        type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        'data-person': p.name,
        onclick: () => {
          if (open) openRows.delete(key)
          else openRows.add(key)
          render()
        },
      },
      h('span', { class: 'avatar' + (extra.mine ? ' me' : '') }, initials(p.name)),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 't' }, p.name),
        h('div', { class: 's' }, `${p.items.length} kalem`),
      ),
      h('span', { class: 'amt', 'data-due': p.due }, money(p.due)),
      h('span', { class: 'chev' }, icon('chev', 18)),
    ),
    open &&
      h(
        'div',
        { class: 'detail' },
        lines.length ? lines : h('div', { class: 'line' }, h('span', null, 'Hiçbir şey işaretlemedi'), h('span')),
        extra.tools && h('div', { class: 'tools' }, extra.tools(p)),
      ),
  ]
}

function screenCollect(bill) {
  const resps = loadResps(bill)
  const c = calc(bill, resps)
  const r = report(bill, resps)
  const claimed = bill.total - r.left
  const pct = bill.total ? Math.round((claimed / bill.total) * 100) : 0
  const ringMax = r.expected || Math.max(r.answered, 1)
  const ringFrac = Math.min(1, r.answered / ringMax)
  const R = 36
  const C = 2 * Math.PI * R

  const ns = 'http://www.w3.org/2000/svg'
  const ringSvg = document.createElementNS(ns, 'svg')
  ringSvg.setAttribute('viewBox', '0 0 84 84')
  ringSvg.setAttribute('width', '100%')
  ringSvg.setAttribute('height', '100%')
  for (const cls of ['track', 'arc']) {
    const circle = document.createElementNS(ns, 'circle')
    circle.setAttribute('class', cls)
    circle.setAttribute('cx', '42')
    circle.setAttribute('cy', '42')
    circle.setAttribute('r', String(R))
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke-width', '8')
    circle.setAttribute('stroke-linecap', 'round')
    if (cls === 'arc') {
      circle.setAttribute('stroke-dasharray', String(C))
      circle.setAttribute('stroke-dashoffset', String(C * (1 - ringFrac)))
      if (!r.answered) circle.setAttribute('stroke', 'none')
      else if (r.waiting === 0) circle.setAttribute('style', 'stroke:var(--ok)')
    }
    ringSvg.append(circle)
  }

  const hero = h(
    'div',
    { class: 'hero' + (r.complete ? ' done' : ''), id: 'hero' },
    h(
      'div',
      { class: 'hero-top' },
      h(
        'div',
        {
          class: 'ring',
          role: 'img',
          'aria-label': r.expected
            ? `${r.expected} kişiden ${r.answered} kişi gönderdi`
            : `${r.answered} kişi gönderdi`,
        },
        ringSvg,
        h(
          'div',
          { class: 'mid', id: 'hero-count' },
          r.expected ? `${r.answered}/${r.expected}` : String(r.answered),
          h('small', null, 'gönderdi'),
        ),
      ),
      h(
        'div',
        { class: 'side' },
        h('div', { class: 'k' }, r.complete ? 'Durum' : 'Açıkta kalan'),
        h('div', { class: 'big', id: 'hero-left', 'data-left': r.left }, r.complete ? 'Tamam' : money(r.left)),
        h(
          'div',
          { class: 'sub' },
          r.complete ? 'Her kalemin sahibi var.' : `${r.unclaimed.length} kalemde sahipsiz adet var.`,
        ),
      ),
    ),
    h(
      'div',
      { class: 'meter', role: 'img', 'aria-label': `Hesabın yüzde ${pct} kadarı sahiplenildi` },
      h('i', { style: `width:${pct}%` }),
    ),
    h(
      'div',
      { class: 'meter-cap' },
      h('span', null, `${money(claimed)} sahiplenildi`),
      h('span', null, `Hesap ${money(bill.total)}`),
    ),
  )

  // Eksikler: düz cümleler.
  const said = (kind, ic, ...kids) =>
    h('div', { class: 'said' }, h('span', { class: 'tile ' + kind }, icon(ic, 18)), h('p', null, kids))
  const missing = []
  if (r.complete) {
    missing.push(said('ok', 'check', h('b', null, 'Hepsi tamam, hesap kapanıyor.'), ' Sonucu masaya yollayabilirsin.'))
    if (r.waiting > 0)
      missing.push(
        said(
          'plain',
          'info',
          `${r.expected} kişi demiştin, ${r.answered} kişi gönderdi. Kalemlerin hepsi sahipli olduğu için eksik kalmadı.`,
        ),
      )
  } else {
    if (r.waiting > 0) missing.push(said('warn', 'clock', h('b', null, `${r.waiting} kişi henüz göndermedi.`)))
    else if (r.answered === 0)
      missing.push(said('warn', 'clock', h('b', null, 'Henüz kimse göndermedi.'), ' Bağlantıyı masaya yolla.'))
    else if (r.expected)
      missing.push(
        said(
          'plain',
          'info',
          `${r.answered} kişi gönderdi ama hâlâ sahipsiz kalem var. Biri işaretlemeyi unutmuş olabilir.`,
        ),
      )
    for (const u of r.unclaimed) {
      missing.push(
        said(
          'warn',
          'alert',
          h('b', null, u.name),
          `: ${u.missing} adet sahipsiz `,
          h('span', { class: 'num' }, `(${money(u.amount)})`),
        ),
      )
    }
  }
  for (const s of r.shared) {
    missing.push(
      said(
        'plain',
        'split',
        h('b', null, s.name),
        s.qty === 1 ? `: ${s.units} kişi bölüşüyor.` : `: ${s.qty} adedi ${s.units} işaret bölüşüyor.`,
      ),
    )
  }

  const myKey = nameKey(store.get('fis.name') || '')
  const people = c.people
    .map((p) =>
      personRow(bill, c, p, {
        prefix: 't:',
        mine: !!myKey && nameKey(p.name) === myKey,
        tools: (pp) => [
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: () => {
                openPick(bill, { self: false, name: pp.name })
              },
            },
            icon('pencil', 18),
            'Düzenle',
          ),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              'data-remove': pp.name,
              onclick: () => {
                saveResps(
                  bill,
                  resps.filter((x) => nameKey(x.name) !== nameKey(pp.name)),
                )
                render()
                toast(`${pp.name} listeden çıkarıldı`)
              },
            },
            icon('trash', 18),
            'Kaldır',
          ),
        ],
      }),
    )
    .flat()
  if (r.waiting > 0) {
    people.push(
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'avatar ghost' }, icon('clock', 18)),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 't' }, `${r.waiting} kişi bekleniyor`),
          h('div', { class: 's' }, 'Seçimini henüz göndermedi'),
        ),
      ),
    )
  }
  if (!people.length) {
    people.push(
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'avatar ghost' }, icon('person', 18)),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 't' }, 'Henüz kimse yok'),
          h('div', { class: 's' }, 'Gelen bağlantıyı bu telefonda açınca kişi buraya eklenir.'),
        ),
      ),
    )
  }

  const hasMe = !!myKey && resps.some((x) => nameKey(x.name) === myKey)
  const action = (ic, t, s, onclick, id) =>
    h(
      'button',
      { class: 'row action has-ic', type: 'button', id, onclick },
      h('span', { class: 'tile' }, icon(ic, 18)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, t), s && h('div', { class: 's' }, s)),
    )
  const actions = h(
    'div',
    { class: 'group' },
    action(
      'check',
      hasMe ? 'Kendi seçimimi düzenle' : 'Kendi yediklerimi işaretle',
      null,
      () => {
        openPick(bill, { self: true, name: store.get('fis.name') || '' })
      },
      'act-self',
    ),
    action(
      'personPlus',
      'Telefonu olmayan birini ekle',
      null,
      () => {
        openPick(bill, { self: false, name: '' })
      },
      'act-add',
    ),
    action('paste', 'Gelen bağlantıyı yapıştır', null, () => pasteRespSheet(bill), 'act-paste'),
    action(
      'qr',
      'Bağlantıyı tekrar paylaş',
      null,
      () => sheet('Masaya yolla', (body) => body.append(...shareBlock(bill))),
      'act-share',
    ),
  )

  // Kalem kalem durum (fiş şeridi).
  const whoBy = bill.items.map(() => [])
  for (const x of resps) for (const [i, n] of Object.entries(x.picks)) whoBy[i].push(n > 1 ? `${x.name} ×${n}` : x.name)
  const itemRows = bill.items.map((it, i) => {
    const u = c.units[i]
    const pill =
      u < it.qty
        ? h('span', { class: 'pill warn' }, it.qty === 1 ? 'sahipsiz' : `${u}/${it.qty}`)
        : h(
            'span',
            { class: 'pill ok' },
            icon('check', 13, 3),
            u > it.qty ? `${u} ortak` : it.qty === 1 ? 'tamam' : `${u}/${it.qty}`,
          )
    return h(
      'div',
      { class: 'li' },
      h(
        'div',
        { class: 'li-main' },
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 't' }, (it.qty > 1 ? `${it.qty} × ` : '') + it.name),
          h('div', { class: 's' }, whoBy[i].length ? whoBy[i].join(', ') : 'Kimse işaretlemedi'),
        ),
        h('span', { class: 'amt' }, money(it.qty * it.unit), h('small', null, pill)),
      ),
    )
  })

  const main = h(
    'main',
    { class: 'has-bar' },
    h('h1', { class: 'large' }, bill.title),
    h('p', { class: 'meta' }, bill.meta || 'Toplama'),
    hero,
    h('div', { class: 'label' }, 'Eksikler'),
    h('div', { class: 'group', id: 'eksikler' }, missing),
    h(
      'div',
      { class: 'label' },
      'Gönderenler',
      h('span', { class: 'count' }, r.expected ? `${r.answered}/${r.expected} kişi` : `${r.answered} kişi`),
    ),
    h('div', { class: 'group', id: 'people' }, people),
    h('div', { class: 'label' }, 'Ekle'),
    actions,
    h('div', { class: 'label' }, 'Kalemler', h('span', { class: 'count' }, 'kim neyi aldı')),
    h('div', { class: 'receipt-wrap' }, h('div', { class: 'receipt' }, itemRows)),
    h(
      'div',
      { class: 'links' },
      h(
        'button',
        {
          class: 'link-btn muted',
          type: 'button',
          onclick: () => {
            store.del('fis.host.' + bill.id)
            render()
          },
        },
        'Ben toplamıyorum, misafirim',
      ),
      h(
        'button',
        {
          class: 'link-btn muted',
          type: 'button',
          onclick: () =>
            sheet('Bu hesabı sil', (body) => {
              body.append(
                h('p', null, 'Fiş ve gelen yanıtlar bu telefondan silinir. Geri alınamaz.'),
                h(
                  'button',
                  {
                    class: 'btn primary block',
                    type: 'button',
                    onclick: () => {
                      forget(bill.id)
                      go('#')
                    },
                  },
                  'Sil',
                ),
              )
            }),
        },
        'Bu hesabı sil',
      ),
    ),
  )
  const bar = h(
    'div',
    { class: 'bar' },
    h(
      'div',
      { class: 'bar-in' },
      h(
        'button',
        {
          class: 'btn wide ' + (r.complete ? 'primary' : 'tinted'),
          type: 'button',
          id: 'result-open',
          onclick: () => resultSheet(bill, resps, r),
        },
        icon('share', 20),
        'Sonucu paylaş',
      ),
    ),
  )
  return { key: 'toplama:' + bill.id, title: bill.title, nodes: [nav(backBtn('Hesaplar', () => go('#'))), main, bar] }
}

function pasteRespSheet(bill) {
  sheet('Gelen bağlantıyı yapıştır', (body, close) => {
    const ta = h('textarea', {
      class: 'big',
      id: 'paste-resp',
      'aria-label': 'Yanıt bağlantısı',
      placeholder: 'https://…#b=…&r=…',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
    })
    const perr = h('p', { class: 'err', role: 'alert' })
    body.append(
      h(
        'p',
        null,
        'Mesajla gelen yanıt bağlantısını ya da bağlantılı mesajın tamamını yapıştır. Birden çok bağlantı olabilir.',
      ),
      ta,
      perr,
      h(
        'button',
        {
          class: 'btn primary block',
          type: 'button',
          id: 'paste-go',
          style: 'margin-top:14px',
          onclick: () => {
            const found = []
            let other = false
            for (const tok of ta.value.split(/\s+/)) {
              if (!tok) continue
              const parts = parseHash(tok.includes('#') ? tok : '#' + tok)
              const code = parts.r || (!tok.includes('=') ? tok : '')
              if (!code) continue
              const resp = decodeResp(bill, code)
              if (resp) found.push(resp)
              else other = true
            }
            if (!found.length) {
              perr.textContent = other
                ? 'Bu bağlantı başka bir hesaba ait ya da eksik kopyalanmış. Gönderenden yeniden iste.'
                : 'Yapıştırdığın metinde yanıt bağlantısı yok. Bağlantının "#b=" ile "&r=" kısımları tam olmalı.'
              return
            }
            close()
            for (const resp of found) importResp(bill, resp)
            render()
          },
        },
        'Ekle',
      ),
    )
    setTimeout(() => ta.focus(), 60)
  })
}

function resultSheet(bill, resps, r) {
  const code = encodeAll(bill, resps)
  if (!enc(bill) || !code) return toast('Sonuç bağlantıya çevrilemedi. Sayfayı yenileyip yeniden dene.')
  const url = buildUrl(base(), { b: enc(bill), s: code })
  const data = { title: 'Fiş · ' + bill.title, text: `${bill.title}: kim ne kadar ödeyecek`, url }
  sheet('Sonucu paylaş', (body) => {
    body.append(
      r.complete
        ? h(
            'div',
            { class: 'note ok' },
            icon('check', 20, 2.4),
            h('span', null, 'Hesap tamam. Herkes kendi payını bu bağlantıda görür.'),
          )
        : h(
            'div',
            { class: 'note', id: 'result-warn' },
            icon('alert', 20),
            h(
              'span',
              null,
              `Hesap henüz tamam değil: ${money(r.left)} açıkta. Yine de paylaşabilirsin; açıkta kalan tutar sonuçta görünür.`,
            ),
          ),
      h(
        'div',
        { class: 'stack' },
        h(
          'button',
          { class: 'btn primary block', type: 'button', id: 'result-go', onclick: () => shareLink(data) },
          icon('share', 20),
          'Masaya yolla',
        ),
        h(
          'button',
          { class: 'btn block', type: 'button', id: 'result-copy', 'data-url': url, onclick: () => copyText(url) },
          icon('copy', 20),
          'Bağlantıyı kopyala',
        ),
        h('a', { class: 'btn quiet block', id: 'result-view', href: url }, 'Sonuç ekranını aç', icon('chev', 18, 2.2)),
      ),
    )
  })
}

// ---------- 6. Sonuç ----------
function screenResult(bill, resps) {
  const c = calc(bill, resps)
  const r = report(bill, resps)
  const sorted = c.people.slice().sort((a, b) => b.due - a.due || a.name.localeCompare(b.name, 'tr'))
  const saved = store.get('fis.me.' + bill.id) ?? store.get('fis.name') ?? ''
  const meKey = nameKey(saved)
  const me = sorted.find((p) => nameKey(p.name) === meKey)
  const host = isHost(bill.id)

  const chips = sorted.map((p) =>
    h(
      'button',
      {
        class: 'chip',
        type: 'button',
        'aria-pressed': me === p ? 'true' : 'false',
        onclick: () => {
          store.set('fis.me.' + bill.id, me === p ? '' : p.name)
          render()
        },
      },
      p.name,
    ),
  )
  const rows = sorted.map((p) => personRow(bill, c, p, { prefix: 's:', mine: me === p })).flat()

  const main = h(
    'main',
    null,
    h('h1', { class: 'large' }, bill.title),
    h(
      'p',
      { class: 'meta' },
      bill.meta ? [bill.meta, h('br')] : null,
      h('span', { class: 'num' }, `Hesap ${money(bill.total)} · ${sorted.length} kişi`),
    ),
    me &&
      h(
        'div',
        { class: 'hero done', id: 'my-due' },
        h('div', { class: 'k' }, `${me.name}, senin payın`),
        h('div', { class: 'big', style: 'color:var(--text);font-size:34px' }, money(me.due)),
        h('div', { class: 'sub' }, `${me.items.length} kalem. Ayrıntı için aşağıda adına dokun.`),
      ),
    r.left > 0 &&
      h(
        'div',
        { class: 'note', id: 'result-left', style: me ? 'margin-top:14px' : '' },
        icon('alert', 20),
        h(
          'span',
          null,
          h('b', null, `${money(r.left)} açıkta. `),
          r.unclaimed.map((u) => `${u.name}: ${u.missing} adet sahipsiz (${money(u.amount)})`).join(' · '),
        ),
      ),
    sorted.length > 1 && [h('div', { class: 'label' }, 'Hangisi sensin?'), h('div', { class: 'chips' }, chips)],
    h('div', { class: 'label' }, 'Kim ne kadar ödeyecek'),
    h(
      'div',
      { class: 'group', id: 'result-people' },
      rows.length
        ? rows
        : h('div', { class: 'row' }, h('div', { class: 'grow s' }, 'Bu bağlantıda kimsenin seçimi yok.')),
    ),
    bill.note && [
      h('div', { class: 'label' }, 'Ödeme'),
      h(
        'div',
        { class: 'group' },
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'grow', id: 'pay-note', style: 'white-space:pre-wrap' }, bill.note),
        ),
        h(
          'button',
          { class: 'row action', type: 'button', onclick: () => copyText(bill.note, 'Ödeme notu kopyalandı') },
          icon('copy', 20),
          'Notu kopyala',
        ),
      ),
    ],
    h(
      'p',
      { class: 'foot center', style: 'margin-top:22px' },
      host ? null : 'Bu ekran salt okunur. Yanlışlık varsa hesabı toplayan kişiye söyle.',
    ),
    host && h('a', { class: 'btn quiet block', href: hashFor(bill) }, 'Toplama ekranına dön'),
  )
  return { key: 'sonuc:' + bill.id, title: bill.title, nodes: [nav(brand()), main] }
}

// ---------- Başlat ----------
render()

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
