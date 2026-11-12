// Perde — editör arayüzü. Tek contenteditable kök, öğe başına bir div[data-type].
import {
  TYPES,
  TYPE_LABELS,
  computeStats,
  cycleType,
  isType,
  isUpperType,
  normalizeDoc,
  parseFountain,
  parsePaste,
  splitElement,
  toFountain,
  upperTr,
} from './senaryo.mjs'
import { createStore } from './depo.mjs'
import { runAI } from './akis.mjs'
import { renderMarkdown } from './md.mjs'

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id))
const sayfa = $('sayfa')

const IPUCU = {
  scene: 'İÇ. MEKÂN - GÜN',
  action: 'Ne görüyoruz?',
  character: 'KARAKTER',
  parenthetical: 'nasıl',
  dialogue: 'Replik',
  transition: 'KESME',
}

// ---------------------------------------------------------------------------
// Depolama

function pickStorage() {
  try {
    const s = window.localStorage
    s.setItem('perde:t', '1')
    s.removeItem('perde:t')
    return { storage: s, persistent: true }
  } catch {
    const m = new Map()
    return {
      persistent: false,
      storage: {
        getItem: (/** @type {string} */ k) => m.get(k) ?? null,
        setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
        removeItem: (/** @type {string} */ k) => void m.delete(k),
      },
    }
  }
}
const { storage, persistent } = pickStorage()
const store = createStore(storage)
/** @type {import('./depo.mjs').Project} */
let project

// ---------------------------------------------------------------------------
// Bildirim ve iletişim kutuları

let toastTimer = 0
/**
 * @param {string} msg
 * @param {{ label: string, fn: () => void }} [action]
 */
function toast(msg, action) {
  const el = $('bildirim')
  el.replaceChildren(document.createTextNode(msg))
  if (action) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = action.label
    b.addEventListener('click', () => {
      el.hidden = true
      action.fn()
    })
    el.append(b)
  }
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), action ? 9000 : 4000)
}

/**
 * @param {{ title: string, message: string, ok: string, input?: { label: string, value?: string } }} o
 * @returns {Promise<{ ok: boolean, value: string }>}
 */
function ask({ title, message, ok, input }) {
  const dlg = /** @type {HTMLDialogElement} */ ($('onay'))
  $('onayBaslik').textContent = title
  $('onayMetin').textContent = message
  $('onayTamam').textContent = ok
  const kap = $('onayGirdiKap')
  const girdi = /** @type {HTMLInputElement} */ ($('onayGirdi'))
  kap.hidden = !input
  if (input) {
    $('onayGirdiEtiket').textContent = input.label
    girdi.value = input.value ?? ''
  }
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve({ ok: dlg.returnValue === 'tamam', value: girdi.value.trim() }), {
      once: true,
    })
    dlg.returnValue = ''
    dlg.showModal()
    if (input) girdi.focus()
  })
}

// ---------------------------------------------------------------------------
// DOM yardımcıları

/** @param {HTMLElement} d */
function syncEmpty(d) {
  d.classList.toggle('bos-oge', (d.textContent ?? '') === '')
}

/**
 * @param {string} type
 * @param {string} [text]
 */
function makeEl(type, text = '') {
  const d = document.createElement('div')
  d.dataset.type = type
  d.dataset.ipucu = IPUCU[/** @type {keyof typeof IPUCU} */ (type)] ?? ''
  d.textContent = text
  syncEmpty(d)
  return d
}

/** @returns {Array<{type: import('./senaryo.mjs').ElementType, text: string}>} */
function readModel() {
  return [...sayfa.children].map((node) => {
    const d = /** @type {HTMLElement} */ (node)
    const type = isType(d.dataset.type) ? d.dataset.type : 'action'
    let text = (d.textContent ?? '').replace(/ /g, ' ')
    if (isUpperType(type)) text = upperTr(text)
    return { type, text }
  })
}

/** @param {Array<{type: string, text: string}>} elements */
function render(elements) {
  const list = elements.length ? elements : [{ type: 'scene', text: '' }]
  sayfa.replaceChildren(...list.map((e) => makeEl(isType(e.type) ? e.type : 'action', e.text)))
}

/** Tarayıcının yarattığı başıboş düğümleri öğe div'lerine çevirir. */
function normalizeDom() {
  if (!sayfa.childNodes.length) {
    sayfa.append(makeEl('action'))
    return
  }
  for (const n of [...sayfa.childNodes]) {
    const el = /** @type {HTMLElement} */ (n)
    if (el.nodeType === 1 && el.tagName === 'DIV') {
      if (!isType(el.dataset.type)) {
        const prev = /** @type {HTMLElement | null} */ (el.previousElementSibling)
        el.dataset.type = prev?.dataset.type ?? 'action'
      }
      el.dataset.ipucu = IPUCU[/** @type {keyof typeof IPUCU} */ (el.dataset.type)] ?? ''
    } else if (el.nodeType === 1 && el.tagName === 'BR') {
      el.remove()
    } else if (n.nodeType === 3 || n.nodeType === 1) {
      const d = makeEl('action')
      n.replaceWith(d)
      d.append(n)
    }
  }
}

/** @returns {HTMLElement | null} */
function currentDiv() {
  const sel = getSelection()
  if (!sel || !sel.anchorNode) return null
  let n = sel.anchorNode
  if (n === sayfa)
    return /** @type {HTMLElement | null} */ (
      sayfa.children[Math.min(sel.anchorOffset, sayfa.children.length - 1)] ?? null
    )
  if (n.nodeType === 3) n = /** @type {Node} */ (n.parentNode)
  const d = /** @type {Element} */ (n).closest?.('#sayfa > div')
  return d && sayfa.contains(d) ? /** @type {HTMLElement} */ (d) : null
}

/** @param {HTMLElement} div */
function caretOffset(div) {
  const sel = getSelection()
  if (!sel || !sel.rangeCount) return (div.textContent ?? '').length
  const r = sel.getRangeAt(0)
  if (!div.contains(r.startContainer)) return (div.textContent ?? '').length
  const pre = document.createRange()
  pre.selectNodeContents(div)
  try {
    pre.setEnd(r.startContainer, r.startOffset)
  } catch {
    return (div.textContent ?? '').length
  }
  return pre.toString().length
}

/**
 * @param {HTMLElement} div
 * @param {number} offset
 */
function setCaret(div, offset) {
  const sel = getSelection()
  if (!sel) return
  const r = document.createRange()
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT)
  let left = offset
  /** @type {Node | null} */
  let node
  let placed = false
  while ((node = walker.nextNode())) {
    const len = (node.nodeValue ?? '').length
    if (left <= len) {
      r.setStart(node, left)
      placed = true
      break
    }
    left -= len
  }
  if (!placed) r.setStart(div, div.childNodes.length && offset > 0 ? div.childNodes.length : 0)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

/**
 * @param {HTMLElement} div
 * @param {string} type
 * @param {string} [text]
 */
function applyElement(div, type, text) {
  div.dataset.type = type
  div.dataset.ipucu = IPUCU[/** @type {keyof typeof IPUCU} */ (type)] ?? ''
  if (text !== undefined && div.textContent !== text) div.textContent = text
  syncEmpty(div)
}

// ---------------------------------------------------------------------------
// Geçmiş (geri al / yinele): kendi anlık görüntülerimiz, tarayıcının geri alması devre dışı

/** @type {Array<{ els: ReturnType<typeof readModel>, i: number, off: number, key: string }>} */
let hist = []
let pos = -1
let histTimer = 0

function snapshot() {
  const els = readModel()
  const d = currentDiv()
  const i = d ? [...sayfa.children].indexOf(d) : -1
  return { els, i, off: d ? caretOffset(d) : 0, key: JSON.stringify(els) }
}
function commitHistory() {
  clearTimeout(histTimer)
  const s = snapshot()
  if (hist[pos] && hist[pos].key === s.key) {
    hist[pos].i = s.i
    hist[pos].off = s.off
    return
  }
  hist.splice(pos + 1)
  hist.push(s)
  if (hist.length > 200) hist.shift()
  pos = hist.length - 1
}
function resetHistory() {
  hist = []
  pos = -1
  commitHistory()
}
/** @param {typeof hist[number]} s */
function restore(s) {
  render(s.els)
  const d = /** @type {HTMLElement | undefined} */ (sayfa.children[Math.max(0, s.i)])
  if (d) {
    sayfa.focus()
    setCaret(d, s.off)
  }
  changed(false)
}
function undo() {
  commitHistory()
  if (pos > 0) restore(hist[--pos])
}
function redo() {
  commitHistory()
  if (pos < hist.length - 1) restore(hist[++pos])
}

// ---------------------------------------------------------------------------
// Kaydetme ve gezinti güncellemesi

let saveTimer = 0
let navTimer = 0

/** @param {boolean} [withHistory] */
function changed(withHistory = true) {
  $('durum').textContent = 'Kaydediliyor…'
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveNow, 500)
  clearTimeout(navTimer)
  navTimer = window.setTimeout(updateNav, 250)
  if (withHistory) {
    clearTimeout(histTimer)
    histTimer = window.setTimeout(commitHistory, 500)
  }
}

function saveNow() {
  clearTimeout(saveTimer)
  if (!project) return
  project.elements = readModel()
  const ok = store.save(project)
  const t = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  $('durum').textContent = ok
    ? persistent
      ? `Kaydedildi ${t}`
      : 'Bu oturumda tutuluyor (tarayıcı depolaması kapalı)'
    : 'Kaydedilemedi: tarayıcı depolaması dolu. .fountain olarak indirin.'
}

let navKey = ''
function updateNav() {
  clearTimeout(navTimer)
  const model = readModel()
  const stats = computeStats(model)
  const current = currentSceneNo(model)
  const key = JSON.stringify([stats, current])
  $('istatistik').textContent =
    `${stats.words.toLocaleString('tr-TR')} kelime · ${stats.pages.toLocaleString('tr-TR')} sayfa · ${stats.scenes.length} sahne`
  updateAiContext()
  if (key === navKey) return
  navKey = key
  const sl = $('sahneListe')
  sl.replaceChildren(
    ...(stats.scenes.length
      ? stats.scenes.map((s) => {
          const li = document.createElement('li')
          if (s.index === current) li.className = 'aktif'
          const b = document.createElement('button')
          b.type = 'button'
          const ad = document.createElement('span')
          ad.className = 'ad'
          ad.textContent = `${s.index + 1}. ${s.heading}`
          const sayi = document.createElement('span')
          sayi.className = 'sayi'
          sayi.textContent = `${s.words} k`
          b.append(ad, sayi)
          b.addEventListener('click', () => goTo(s.elementIndex))
          li.append(b)
          return li
        })
      : [emptyNote('Henüz sahne başlığı yok.')]),
  )
  const kl = $('karakterListe')
  kl.replaceChildren(
    ...(stats.characters.length
      ? stats.characters.map((c) => {
          const li = document.createElement('li')
          const b = document.createElement('button')
          b.type = 'button'
          const ad = document.createElement('span')
          ad.className = 'ad'
          ad.textContent = c.name
          const sayi = document.createElement('span')
          sayi.className = 'sayi'
          sayi.textContent = `${c.lines} replik`
          b.append(ad, sayi)
          b.addEventListener('click', () => {
            const m = readModel()
            const at = m.findIndex(
              (e) =>
                e.type === 'character' &&
                upperTr(e.text)
                  .replace(/\s*\([^)]*\)\s*$/, '')
                  .trim() === c.name,
            )
            if (at >= 0) goTo(at)
          })
          li.append(b)
          return li
        })
      : [emptyNote('Henüz karakter yok.')]),
  )
}

/** @param {string} t */
function emptyNote(t) {
  const li = document.createElement('li')
  li.className = 'bos'
  li.textContent = t
  return li
}

/**
 * Boş başlıklı sahneler dahil, ham modelde imlecin sahne numarası (normalizeDoc ile aynı sayım).
 * @param {ReturnType<typeof readModel>} model
 */
function currentSceneNo(model, idx = activeIndex()) {
  let n = -1
  for (let i = 0; i <= idx && i < model.length; i++) if (model[i].type === 'scene' && model[i].text.trim() !== '') n++
  return n
}

function activeIndex() {
  const d = lastDiv && sayfa.contains(lastDiv) ? lastDiv : null
  return d ? [...sayfa.children].indexOf(d) : sayfa.children.length - 1
}

/** @param {number} index */
function goTo(index) {
  const d = /** @type {HTMLElement | undefined} */ (sayfa.children[index])
  if (!d) return
  closeDrawers()
  sayfa.focus()
  setCaret(d, (d.textContent ?? '').length)
  d.scrollIntoView({ block: 'center' })
}

// ---------------------------------------------------------------------------
// Seçim takibi, tür seçici

/** @type {HTMLElement | null} */
let lastDiv = null
/** @type {{ a: number, b: number }} */
let lastSel = { a: 0, b: 0 }

const tip = /** @type {HTMLSelectElement} */ ($('tip'))
for (const t of TYPES) {
  const o = document.createElement('option')
  o.value = t
  o.textContent = TYPE_LABELS[t]
  tip.append(o)
}

/** Etkin öğeyi eşzamanlı işaretler (selectionchange olayı gecikebilir). */
function markActive(/** @type {HTMLElement} */ d) {
  if (lastDiv && lastDiv !== d) lastDiv.classList.remove('aktif')
  lastDiv = d
  d.classList.add('aktif')
  tip.value = d.dataset.type ?? 'action'
}

function captureSelection() {
  const sel = getSelection()
  if (!sel || !sel.anchorNode || !sayfa.contains(sel.anchorNode)) return
  const d = currentDiv()
  if (!d) return
  markActive(d)
  const kids = [...sayfa.children]
  const a = kids.indexOf(d)
  let b = a
  if (sel.focusNode && sayfa.contains(sel.focusNode)) {
    const fn = sel.focusNode.nodeType === 3 ? sel.focusNode.parentNode : sel.focusNode
    const fd = /** @type {Element} */ (fn)?.closest?.('#sayfa > div')
    if (fd) b = kids.indexOf(fd)
  }
  lastSel = { a: Math.min(a, b), b: Math.max(a, b) }
  clearTimeout(navTimer)
  navTimer = window.setTimeout(updateNav, 120)
}

// selectionchange asenkron gelir; odak başka yere giderken (ör. talimat kutusu) seçim yine de yakalanır.
document.addEventListener('selectionchange', captureSelection)
for (const ev of ['mouseup', 'keyup', 'touchend', 'focusout']) sayfa.addEventListener(ev, captureSelection)

/**
 * @param {HTMLElement} div
 * @param {string} type
 */
function setType(div, type) {
  commitHistory()
  const off = caretOffset(div)
  // Metin değiştirilmez: büyük harf görüntüsü CSS'ten, kayıt değeri readModel'den gelir (Tab döngüsü harf kaybettirmez).
  applyElement(div, type)
  sayfa.focus()
  setCaret(div, off)
  markActive(div)
  commitHistory()
  changed(false)
}

tip.addEventListener('change', () => {
  const d = lastDiv && sayfa.contains(lastDiv) ? lastDiv : /** @type {HTMLElement | null} */ (sayfa.lastElementChild)
  if (d) {
    sayfa.focus()
    setType(d, tip.value)
  }
})

// ---------------------------------------------------------------------------
// Klavye, yapıştırma

function doEnter() {
  const sel = getSelection()
  if (sel && !sel.isCollapsed) document.execCommand('delete')
  normalizeDom()
  const div = currentDiv() ?? /** @type {HTMLElement | null} */ (sayfa.lastElementChild)
  if (!div) return
  commitHistory()
  const type = isType(div.dataset.type) ? div.dataset.type : 'action'
  const r = splitElement({ type, text: div.textContent ?? '' }, caretOffset(div))
  applyElement(div, r.current.type, r.current.text)
  let focus = div
  if (r.next) {
    focus = makeEl(r.next.type, r.next.text)
    div.after(focus)
  }
  setCaret(focus, 0)
  markActive(focus)
  focus.scrollIntoView({ block: 'nearest' })
  commitHistory()
  changed(false)
}

/** @param {string} text */
function doPaste(text) {
  const els = parsePaste(text)
  if (!els) {
    document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'))
    return
  }
  const sel = getSelection()
  if (sel && !sel.isCollapsed) document.execCommand('delete')
  normalizeDom()
  const div = currentDiv() ?? /** @type {HTMLElement} */ (sayfa.lastElementChild)
  commitHistory()
  const full = div.textContent ?? ''
  const off = caretOffset(div)
  const before = full.slice(0, off)
  const after = full.slice(off)
  const nodes = els.map((e) => makeEl(e.type, e.text))
  if (before.trim() === '' && after.trim() === '') {
    div.replaceWith(...nodes)
  } else if (before.trim() === '') {
    div.before(...nodes)
  } else {
    applyElement(div, div.dataset.type ?? 'action', before)
    div.after(...nodes)
    if (after.trim() !== '') nodes[nodes.length - 1].after(makeEl(div.dataset.type ?? 'action', after))
  }
  const last = nodes[nodes.length - 1]
  setCaret(last, (last.textContent ?? '').length)
  last.scrollIntoView({ block: 'nearest' })
  commitHistory()
  changed(false)
}

sayfa.addEventListener('keydown', (e) => {
  if (e.isComposing) return
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'Enter' && !mod) {
    e.preventDefault()
    doEnter()
  } else if (e.key === 'Tab' && !mod && !e.altKey) {
    e.preventDefault()
    normalizeDom()
    const d = currentDiv()
    if (d) setType(d, cycleType(/** @type {any} */ (d.dataset.type), e.shiftKey))
  } else if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    e.shiftKey ? redo() : undo()
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redo()
  } else if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
    e.preventDefault()
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveNow()
    toast('Kaydedildi.')
  }
})

sayfa.addEventListener('beforeinput', (e) => {
  const t = e.inputType
  if (t === 'historyUndo') {
    e.preventDefault()
    undo()
  } else if (t === 'historyRedo') {
    e.preventDefault()
    redo()
  } else if (t === 'insertParagraph' || t === 'insertLineBreak') {
    e.preventDefault()
    doEnter()
  } else if (t.startsWith('format') || t === 'insertFromDrop') {
    e.preventDefault()
  }
})

sayfa.addEventListener('paste', (e) => {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (text) doPaste(text)
})
sayfa.addEventListener('drop', (e) => e.preventDefault())

sayfa.addEventListener('input', () => {
  if (
    !sayfa.children.length ||
    [...sayfa.childNodes].some(
      (n) =>
        !(
          n.nodeType === 1 &&
          /** @type {HTMLElement} */ (n).tagName === 'DIV' &&
          isType(/** @type {HTMLElement} */ (n).dataset.type)
        ),
    )
  ) {
    normalizeDom()
  }
  const d = currentDiv()
  if (d) syncEmpty(d)
  changed(true)
})

sayfa.addEventListener('focusout', () => {
  // Büyük harfli türlerde metni gerçekten büyük harfe çevir (görüntü zaten CSS ile büyük).
  for (const node of sayfa.children) {
    const d = /** @type {HTMLElement} */ (node)
    if (isUpperType(/** @type {any} */ (d.dataset.type))) {
      const t = d.textContent ?? ''
      const u = upperTr(t)
      if (u !== t) d.textContent = u
    }
  }
})

// ---------------------------------------------------------------------------
// Projeler

function refreshProjects() {
  const sel = /** @type {HTMLSelectElement} */ ($('projeSec'))
  sel.replaceChildren(
    ...store.list().map((p) => {
      const o = document.createElement('option')
      o.value = p.id
      o.textContent = p.title || 'Adsız senaryo'
      return o
    }),
  )
  sel.value = project.id
}

function updatePrintHeader() {
  const b = $('baskiBaslik')
  const t = document.createElement('div')
  t.className = 'b'
  t.textContent = project.title
  const y = document.createElement('div')
  y.className = 'y'
  y.textContent = project.author
  b.replaceChildren(t, y)
}

/** @param {import('./depo.mjs').Project} p */
function openProject(p) {
  project = p
  store.setCurrent(p.id)
  ;/** @type {HTMLInputElement} */ ($('baslik')).value = p.title
  render(p.elements)
  lastDiv = null
  navKey = ''
  resetHistory()
  refreshProjects()
  updatePrintHeader()
  updateNav()
  closeAi(true)
  $('durum').textContent = ''
}

/** @param {string} id */
function switchProject(id) {
  saveNow()
  const p = store.load(id)
  if (p) openProject(p)
}

$('projeSec').addEventListener('change', (e) => switchProject(/** @type {HTMLSelectElement} */ (e.target).value))
$('projeYeni').addEventListener('click', () => {
  saveNow()
  openProject(store.create())
  closeDrawers()
  sayfa.focus()
  const first = /** @type {HTMLElement} */ (sayfa.children[0])
  if (first) setCaret(first, 0)
})
$('projeSil').addEventListener('click', async () => {
  const r = await ask({
    title: 'Proje silinsin mi?',
    message: `"${project.title}" projesi ve ${project.versions.length} sürümü bu tarayıcıdan silinecek. Silmeden önce ".fountain indir" ile yedek alabilirsiniz.`,
    ok: 'Projeyi sil',
  })
  if (!r.ok) return
  const id = project.id
  store.remove(id)
  const next = store.currentId()
  const p = next ? store.load(next) : null
  openProject(p ?? store.create())
  toast('Proje silindi.')
})
$('baslik').addEventListener('input', (e) => {
  project.title = /** @type {HTMLInputElement} */ (e.target).value
  const o = /** @type {HTMLSelectElement} */ ($('projeSec')).selectedOptions[0]
  if (o) o.textContent = project.title || 'Adsız senaryo'
  updatePrintHeader()
  changed(false)
})

// İçe / dışa aktarma
const dosya = /** @type {HTMLInputElement} */ ($('dosya'))
$('projeIce').addEventListener('click', () => dosya.click())
dosya.addEventListener('change', async () => {
  const f = dosya.files?.[0]
  dosya.value = ''
  if (!f) return
  const text = await f.text()
  const parsed = parseFountain(text)
  if (!parsed.elements.length) {
    toast('Dosyada senaryo öğesi bulunamadı.')
    return
  }
  saveNow()
  const p = store.create({
    title: parsed.meta.title || f.name.replace(/\.[^.]+$/, ''),
    author: parsed.meta.author,
    elements: parsed.elements,
  })
  openProject(p)
  closeDrawers()
  toast(`İçe aktarıldı: ${p.title} (${parsed.elements.length} öğe).`)
})

/**
 * Dosya adı: Türkçe harfler ASCII'ye çevrilir (bazı tarayıcılar/sistemler aksanlı adı yok sayar).
 * @param {string} title
 */
function fileSlug(title) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }
  const slug = (title || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => map[/** @type {keyof typeof map} */ (c)])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'senaryo'
}

$('disaAktar').addEventListener('click', () => {
  const text = toFountain(readModel(), { title: project.title, author: project.author })
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileSlug(project.title) + '.fountain'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})
$('yazdir').addEventListener('click', () => {
  updatePrintHeader()
  window.print()
})
$('geriAl').addEventListener('click', undo)
$('yinele').addEventListener('click', redo)

// ---------------------------------------------------------------------------
// Sürümler

/**
 * Geri alınabilirlik için otomatik anlık görüntü.
 * @param {string} label
 */
function autoSnapshot(label) {
  project.elements = readModel()
  store.addVersion(project, label, true)
  saveNow()
}

$('surumKaydet').addEventListener('click', async () => {
  const r = await ask({
    title: 'Sürüm kaydet',
    message: 'Senaryonun şu anki hâli bir sürüm olarak saklanır.',
    ok: 'Kaydet',
    input: { label: 'Ad (isteğe bağlı)', value: '' },
  })
  if (!r.ok) return
  project.elements = readModel()
  store.addVersion(project, r.value || 'Elle kayıt', false)
  saveNow()
  toast('Sürüm kaydedildi.')
})

function renderVersions() {
  const ul = $('surumListe')
  if (!project.versions.length) {
    ul.replaceChildren(emptyNote('Henüz sürüm yok.'))
    return
  }
  ul.replaceChildren(
    ...project.versions.map((v) => {
      const li = document.createElement('li')
      const info = document.createElement('div')
      const name = document.createElement('div')
      name.textContent = v.label + (v.auto ? ' (otomatik)' : '')
      const meta = document.createElement('div')
      meta.className = 'meta'
      const words = computeStats(/** @type {any} */ (v.elements)).words
      meta.textContent = `${new Date(v.at).toLocaleString('tr-TR')} · ${v.elements.length} öğe · ${words} kelime`
      info.append(name, meta)
      const actions = document.createElement('div')
      actions.className = 'satir'
      const restoreBtn = document.createElement('button')
      restoreBtn.type = 'button'
      restoreBtn.textContent = 'Geri yükle'
      restoreBtn.addEventListener('click', () => restoreVersion(v))
      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'tehlike'
      delBtn.textContent = 'Sil…'
      delBtn.addEventListener('click', () => deleteVersion(v))
      actions.append(restoreBtn, delBtn)
      li.append(info, actions)
      return li
    }),
  )
}
$('surumler').addEventListener('click', () => {
  renderVersions()
  ;/** @type {HTMLDialogElement} */ ($('surumDlg')).showModal()
})
$('surumKapat').addEventListener('click', () => /** @type {HTMLDialogElement} */ ($('surumDlg')).close())

/** @param {import('./depo.mjs').Version} v */
async function restoreVersion(v) {
  const dlg = /** @type {HTMLDialogElement} */ ($('surumDlg'))
  dlg.close()
  const r = await ask({
    title: 'Sürüm geri yüklensin mi?',
    message: `"${v.label}" sürümü açılacak. Şu anki hâl önce otomatik sürüm olarak kaydedilir; istediğiniz zaman ona dönebilirsiniz.`,
    ok: 'Geri yükle',
  })
  if (!r.ok) return
  commitHistory()
  autoSnapshot('Geri yüklemeden önce')
  render(v.elements)
  resetHistory()
  navKey = ''
  changed(false)
  updateNav()
  toast('Sürüm geri yüklendi.')
}

/** @param {import('./depo.mjs').Version} v */
async function deleteVersion(v) {
  const dlg = /** @type {HTMLDialogElement} */ ($('surumDlg'))
  dlg.close()
  const r = await ask({
    title: 'Sürüm silinsin mi?',
    message: `"${v.label}" sürümü kalıcı olarak silinecek.`,
    ok: 'Sürümü sil',
  })
  if (r.ok) {
    store.removeVersion(project, v.id)
    saveNow()
  }
  renderVersions()
  dlg.showModal()
}

// ---------------------------------------------------------------------------
// Çekmeceler (dar ekran)

const sol = $('sol')
const sag = $('sag')
const perde = $('perdeKapat')
function closeDrawers() {
  sol.classList.remove('acik')
  sag.classList.remove('acik')
  $('btnSol').setAttribute('aria-expanded', 'false')
  $('btnSag').setAttribute('aria-expanded', 'false')
  perde.hidden = true
}
/**
 * @param {HTMLElement} panel
 * @param {HTMLElement} btn
 */
function toggleDrawer(panel, btn) {
  const open = !panel.classList.contains('acik')
  closeDrawers()
  if (open) {
    panel.classList.add('acik')
    btn.setAttribute('aria-expanded', 'true')
    perde.hidden = false
  }
}
$('btnSol').addEventListener('click', () => toggleDrawer(sol, $('btnSol')))
$('btnSag').addEventListener('click', () => toggleDrawer(sag, $('btnSag')))
perde.addEventListener('click', closeDrawers)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawers()
})

// ---------------------------------------------------------------------------
// Yapay zekâ paneli

/**
 * @typedef {object} AiState
 * @property {AbortController | null} ctrl
 * @property {string} action
 * @property {string} text
 * @property {Array<{type: string, text: string}> | null} result
 * @property {HTMLElement | null} sceneEnd  Devam ettir: çalışma anındaki sahnenin son öğesi
 * @property {[HTMLElement, HTMLElement] | null} range  Yeniden yaz: çalışma anındaki seçim
 * @property {HTMLElement[]} notes  Akıştaki bilgi notları
 */
/** @type {AiState} */
const ai = {
  ctrl: null,
  action: '',
  text: '',
  result: null,
  sceneEnd: null,
  range: null,
  notes: /** @type {HTMLElement[]} */ ([]),
}

const yzSonuc = $('yzSonuc')
const yzDurum = $('yzDurum')
const yzDur = $('yzDur')
const yzKarar = $('yzKarar')

function updateAiContext() {
  const model = readModel()
  const idx = activeIndex()
  const no = currentSceneNo(model, idx)
  const stats = computeStats(model)
  const scene = no >= 0 ? stats.scenes[no] : null
  const count = lastSel.b - lastSel.a + 1
  $('yzBaglam').textContent =
    (scene ? `Sahne ${no + 1}: ${scene.heading}` : 'İmleç bir sahnenin içinde değil.') +
    (count > 1 ? ` · ${count} öğe seçili` : '')
}

/** @param {boolean} busy */
function setBusy(busy) {
  for (const b of document.querySelectorAll('[data-eylem], [data-hazir]'))
    /** @type {HTMLButtonElement} */ (b).disabled = busy
  yzDur.hidden = !busy
}

/** @param {boolean} [clear] */
function closeAi(clear = false) {
  if (ai.ctrl) ai.ctrl.abort()
  ai.result = null
  yzKarar.hidden = true
  if (clear) {
    yzSonuc.replaceChildren()
    yzDurum.textContent = ''
  }
}

/** @param {string} t */
function stripFences(t) {
  return t
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim()
}

function renderResult() {
  const t = stripFences(ai.text)
  if (ai.action === 'continue' || ai.action === 'rewrite') {
    const els = parseFountain(t).elements
    ai.result = els
    const box = document.createElement('div')
    box.className = 'izleme'
    for (const e of els) box.append(makeEl(e.type, e.text))
    yzSonuc.replaceChildren(...(ai.notes ?? []), box)
  } else {
    const box = document.createElement('div')
    renderMarkdown(box, t)
    yzSonuc.replaceChildren(...(ai.notes ?? []), box)
  }
}

let renderQueued = false
function queueRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderResult()
  })
}

function showDecision() {
  const has = ai.text.trim() !== ''
  const gen = ai.action === 'continue' || ai.action === 'rewrite'
  yzKarar.hidden = !has
  $('yzEkle').hidden = !(gen && ai.result?.length)
  $('yzDegistir').hidden = !(ai.action === 'rewrite' && ai.result?.length)
  $('yzKopyala').hidden = !has
  $('yzVazgec').textContent = gen ? 'Vazgeç' : 'Kapat'
}

/**
 * @param {string} action
 * @param {string} [presetInstruction]
 */
async function startAi(action, presetInstruction) {
  if (ai.ctrl) return
  const model = readModel()
  const idx = activeIndex()
  const no = currentSceneNo(model, idx)
  const instruction = (presetInstruction ?? /** @type {HTMLTextAreaElement} */ ($('yonerge')).value).trim()
  const norm = normalizeDoc(model)
  if (!norm.length) {
    yzDurum.textContent = 'Önce senaryoya birkaç satır yazın.'
    return
  }

  /** @type {{ action: string, script: string, sceneIndex?: number, selection?: string, instruction?: string }} */
  const body = {
    action,
    script: toFountain(model, { title: project.title, author: project.author }),
  }
  if (no >= 0) body.sceneIndex = no
  if (instruction) body.instruction = instruction

  ai.sceneEnd = null
  ai.range = null
  const kids = /** @type {HTMLElement[]} */ ([...sayfa.children])
  if (action === 'continue') {
    let end = idx
    if (no >= 0) {
      end = model.length - 1
      let n = -1
      for (let i = 0; i < model.length; i++) {
        if (model[i].type === 'scene' && model[i].text.trim() !== '') n++
        if (n > no) {
          end = i - 1
          break
        }
      }
    } else end = model.length - 1
    ai.sceneEnd = kids[Math.max(0, end)] ?? null
  } else if (action === 'rewrite') {
    let from = Math.min(lastSel.a, model.length - 1)
    const to = Math.min(lastSel.b, model.length - 1)
    // Seçim bir diyalog/parantezle başlıyorsa karakter adı da dahil edilir (yetim diyalog aksiyona dönmesin).
    while (from > 0 && (model[from].type === 'dialogue' || model[from].type === 'parenthetical')) from--
    const slice = model.slice(from, to + 1)
    if (!normalizeDoc(slice).length) {
      yzDurum.textContent = 'Yeniden yazmak için yazılı bir öğe seçin ya da imleci içine koyun.'
      return
    }
    body.selection = toFountain(slice)
    ai.range = [kids[from], kids[to]]
  } else if (action === 'shots' && no < 0) {
    yzDurum.textContent = 'Çekim listesi için imleci bir sahnenin içine koyun.'
    return
  }

  ai.action = action
  ai.text = ''
  ai.result = null
  ai.notes = []
  yzSonuc.replaceChildren()
  yzKarar.hidden = true
  yzDurum.textContent = 'Yazılıyor…'
  setBusy(true)
  ai.ctrl = new AbortController()
  let stopped = false
  try {
    await runAI(body, {
      signal: ai.ctrl.signal,
      onEvent: (e) => {
        if (e.type === 'text') {
          ai.text += e.text
          queueRender()
        } else if (e.type === 'replace') {
          ai.text = e.text
          queueRender()
        } else if (e.type === 'notice') {
          const p = document.createElement('p')
          p.className = 'not'
          p.textContent = e.message
          ai.notes.push(p)
          queueRender()
        } else if (e.type === 'error') {
          yzDurum.textContent = e.message
        }
      },
    })
    if (!yzDurum.textContent || yzDurum.textContent === 'Yazılıyor…')
      yzDurum.textContent = ai.text.trim() ? 'Hazır.' : 'Çıktı üretilemedi.'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      stopped = true
      yzDurum.textContent = 'Durduruldu.'
    } else {
      yzDurum.textContent = err instanceof Error ? err.message : 'İstek tamamlanamadı.'
    }
  } finally {
    ai.ctrl = null
    setBusy(false)
    renderResult()
    showDecision()
    if (stopped && !ai.text.trim()) yzKarar.hidden = true
  }
}

for (const b of document.querySelectorAll('[data-eylem]')) {
  b.addEventListener('click', () => startAi(/** @type {HTMLElement} */ (b).dataset.eylem ?? ''))
}
for (const b of document.querySelectorAll('[data-hazir]')) {
  b.addEventListener('click', () => {
    const text = /** @type {HTMLElement} */ (b).dataset.hazir ?? ''
    ;/** @type {HTMLTextAreaElement} */ ($('yonerge')).value = text
    startAi('rewrite', text)
  })
}
yzDur.addEventListener('click', () => ai.ctrl?.abort())
$('yzVazgec').addEventListener('click', () => closeAi(true))
$('yzKopyala').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(stripFences(ai.text))
    toast('Kopyalandı.')
  } catch {
    toast('Kopyalanamadı; metni elle seçip kopyalayın.')
  }
})

/** @param {'ekle' | 'degistir'} mode */
function applyAi(mode) {
  const els = ai.result
  if (!els || !els.length) return
  const nodes = els.map((e) => makeEl(e.type, e.text))
  commitHistory()
  autoSnapshot('Yapay zekâ çıktısından önce')
  if (ai.action === 'continue') {
    const ref =
      ai.sceneEnd && ai.sceneEnd.isConnected ? ai.sceneEnd : /** @type {HTMLElement} */ (sayfa.lastElementChild)
    const empty = (ref.textContent ?? '').trim() === ''
    ref.after(...nodes)
    if (empty && sayfa.children.length > nodes.length + 1) ref.remove()
  } else if (ai.range && ai.range[0].isConnected && ai.range[1].isConnected) {
    const [first, last] = ai.range
    if (mode === 'degistir') {
      first.before(...nodes)
      let n = /** @type {Element | null} */ (first)
      while (n) {
        const next = n === last ? null : n.nextElementSibling
        n.remove()
        n = next
      }
    } else {
      last.after(...nodes)
    }
  } else {
    toast('Belge değişmiş; seçimi yeniden yapıp tekrar deneyin.')
    return
  }
  normalizeDom()
  const lastNode = nodes[nodes.length - 1]
  sayfa.focus()
  setCaret(lastNode, (lastNode.textContent ?? '').length)
  lastNode.scrollIntoView({ block: 'nearest' })
  commitHistory()
  changed(false)
  updateNav()
  yzKarar.hidden = true
  ai.result = null
  yzSonuc.replaceChildren()
  yzDurum.textContent = mode === 'degistir' ? 'Değiştirildi.' : 'Eklendi.'
  closeDrawers()
  toast(mode === 'degistir' ? 'Seçim değiştirildi.' : 'Eklendi.', { label: 'Geri al', fn: undo })
}
$('yzEkle').addEventListener('click', () => applyAi('ekle'))
$('yzDegistir').addEventListener('click', () => applyAi('degistir'))

// ---------------------------------------------------------------------------
// Kapanış, başlangıç

window.addEventListener('pagehide', saveNow)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow()
})

async function init() {
  const id = store.currentId()
  const p = id ? store.load(id) : null
  openProject(p ?? store.create())
  if (!persistent) toast('Tarayıcı depolaması kapalı: çalışmanız yalnızca bu oturumda tutulur.')
  try {
    const r = await fetch('/api/durum')
    const j = await r.json()
    $('kipEtiket').hidden = !j.mock
    if (j.mock) $('kipEtiket').title = 'Yapay zekâ çıktıları sabit örnek metindir (PERDE_MOCK=1).'
  } catch {}
}
init()
