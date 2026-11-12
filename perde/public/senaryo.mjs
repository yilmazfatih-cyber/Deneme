// Perde — saf senaryo çekirdeği. DOM yok; tarayıcı, sunucu ve testler aynı dosyayı içe aktarır.
//
// Model: bir senaryo, { type, text } öğelerinden oluşan düz bir dizidir.
// Kanonik biçim (normalizeDoc): boş öğe yok, art arda gelen diyaloglar tek öğe ("\n" ile),
// karakter/parantez/diyalog öbeğinin dışında kalan diyalog ve parantezler aksiyona çevrilmiş.

/** @typedef {'scene'|'action'|'character'|'parenthetical'|'dialogue'|'transition'} ElementType */
/** @typedef {{ type: ElementType, text: string }} ScriptElement */
/** @typedef {{ title?: string, author?: string }} Meta */

/** @type {readonly ElementType[]} */
export const TYPES = Object.freeze(['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'])

/** @type {Record<ElementType, string>} */
export const TYPE_LABELS = Object.freeze({
  scene: 'Sahne başlığı',
  action: 'Aksiyon',
  character: 'Karakter',
  parenthetical: 'Parantez',
  dialogue: 'Diyalog',
  transition: 'Geçiş',
})

/** Tab döngüsü: aksiyon → karakter → diyalog → parantez → geçiş → sahne → aksiyon. */
const TAB_RING = /** @type {readonly ElementType[]} */ (
  Object.freeze(['action', 'character', 'dialogue', 'parenthetical', 'transition', 'scene'])
)

/** Büyük harfe çevrilen öğe türleri. */
const UPPER_TYPES = new Set(['scene', 'character', 'transition'])
/** Tek satırlık öğe türleri. */
const SINGLE_LINE = new Set(['scene', 'character', 'parenthetical', 'transition'])

/**
 * Türkçe büyük harf ("iç" → "İÇ"). Projede büyük harf yalnızca buradan geçer.
 * @param {string} s
 */
export function upperTr(s) {
  return s.toLocaleUpperCase('tr-TR')
}

/**
 * @param {unknown} t
 * @returns {t is ElementType}
 */
export function isType(t) {
  return typeof t === 'string' && /** @type {readonly string[]} */ (TYPES).includes(t)
}

/** @param {ElementType} type */
export function isUpperType(type) {
  return UPPER_TYPES.has(type)
}

// ---------------------------------------------------------------------------
// Metin kanonikleştirme

/**
 * Sahne başlığını büyük harfe çevirir; "int." Türkçe kuralla "İNT." olmasın diye INT/I-E önekini düzeltir.
 * @param {string} s
 */
function upperScene(s) {
  return upperTr(s)
    .replace(/^İNT(?=[./ ])/, 'INT')
    .replace(/^İ\/E(?=[. ])/, 'I/E')
}

/**
 * Bir öğe metnini türüne göre kanonik biçime getirir.
 * @param {ElementType} type
 * @param {string} text
 */
export function normalizeText(type, text) {
  let t = String(text ?? '').replace(/\r\n?/g, '\n')
  if (SINGLE_LINE.has(type)) {
    t = t.replace(/\s*\n\s*/g, ' ').trim()
    if (type === 'parenthetical') {
      t = t
        .replace(/^\(+\s*/, '')
        .replace(/\s*\)+$/, '')
        .trim()
    } else if (type === 'scene') {
      t = upperScene(t.replace(/^\.+/, '').trim())
    } else if (type === 'transition') {
      t = upperTr(t.replace(/^>+/, '').replace(/<+$/, '').trim())
    } else {
      t = upperTr(t.replace(/\^$/, '').trim())
    }
    return t
  }
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * @param {{ type?: unknown, text?: unknown }} el
 * @returns {ScriptElement}
 */
export function normalizeElement(el) {
  const type = isType(el?.type) ? el.type : 'action'
  return { type, text: normalizeText(type, typeof el?.text === 'string' ? el.text : '') }
}

const IN_DIALOGUE_BLOCK = new Set(['character', 'dialogue', 'parenthetical'])

/**
 * Kanonik belge: boş öğeleri atar, art arda diyalogları birleştirir, yetim diyalog/parantezi aksiyona çevirir.
 * @param {ReadonlyArray<{ type?: unknown, text?: unknown }>} elements
 * @returns {ScriptElement[]}
 */
export function normalizeDoc(elements) {
  /** @type {ScriptElement[]} */
  const out = []
  for (const raw of elements ?? []) {
    let el = normalizeElement(raw)
    if (el.text === '') continue
    const prev = out[out.length - 1]
    if ((el.type === 'dialogue' || el.type === 'parenthetical') && !(prev && IN_DIALOGUE_BLOCK.has(prev.type))) {
      el = { type: 'action', text: el.type === 'parenthetical' ? `(${el.text})` : el.text }
    }
    if (el.type === 'dialogue' && prev && prev.type === 'dialogue') {
      prev.text += '\n' + el.text
    } else {
      out.push(el)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Tanıma desenleri

const SCENE_EN = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i
const SCENE_TR = /^(?:İÇ\/DIŞ|DIŞ\/İÇ|İÇ|DIŞ)\./
const TRANSITION_STD = /^(?:[A-Z0-9 .'-]*TO:|FADE IN:)$/
const TITLE_KEY = /^(?:title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\s*:/i

/**
 * Sahne başlığı gibi görünen satır (INT./EXT. ya da İÇ./DIŞ.).
 * @param {string} line
 */
export function isSceneLine(line) {
  const l = line.trim()
  return SCENE_EN.test(l) || SCENE_TR.test(upperTr(l))
}

/**
 * Standart (ASCII) Fountain ayrıştırıcıların kendiliğinden sahne başlığı sayacağı satır.
 * @param {string} line
 */
function isStandardScene(line) {
  return SCENE_EN.test(line)
}

/**
 * Karakter adı + uzantı: "AYŞE (V.O.)" → "AYŞE".
 * @param {string} text
 */
export function characterBase(text) {
  return upperTr(
    text
      .replace(/\^$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim(),
  )
}

/**
 * Satır "TAMAMEN BÜYÜK HARF" mi (karakter adı adayı)? Sondaki (V.O.) gibi uzantı serbest.
 * @param {string} line
 */
function isUpperLine(line) {
  const base = line
    .replace(/\^$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
  return /\p{L}/u.test(base) && base === upperTr(base)
}

/** @param {string} line */
function isTransitionBare(line) {
  return TRANSITION_STD.test(line)
}

// ---------------------------------------------------------------------------
// Fountain: yazım

/**
 * Metin standart bir Fountain ayrıştırıcıda aksiyon olarak kalsın diye `!` gerekir mi?
 * @param {string} line0
 */
function actionNeedsForce(line0) {
  return (
    isUpperLine(line0) ||
    isSceneLine(line0) ||
    isTransitionBare(line0) ||
    TITLE_KEY.test(line0) ||
    /^[!@.>~=#(\[]/.test(line0) ||
    line0.startsWith('/*')
  )
}

/**
 * Standart ayrıştırıcının kendiliğinden karakter sayacağı ad (yalnızca ASCII büyük harf).
 * @param {string} text
 */
function isStandardCharacter(text) {
  return (
    /^[A-Z0-9 .'-]+(?:\s*\([^)]*\))?$/.test(text) && /[A-Z]/.test(text) && !isSceneLine(text) && !isTransitionBare(text)
  )
}

/**
 * Öğeleri Fountain metnine çevirir. Standart bir ayrıştırıcının tanımayacağı Türkçe metinlerde
 * zorlayıcı işaretler kullanır: `.` sahne, `@` karakter, `>` geçiş, `!` aksiyon.
 * @param {ReadonlyArray<{ type?: unknown, text?: unknown }>} elements
 * @param {Meta} [meta]
 */
export function toFountain(elements, meta = {}) {
  const els = normalizeDoc(elements)
  /** @type {string[]} */
  const blocks = []
  const head = []
  const title = (meta.title ?? '').replace(/\s+/g, ' ').trim()
  const author = (meta.author ?? '').replace(/\s+/g, ' ').trim()
  if (title) head.push(`Title: ${title}`)
  if (author) head.push(`Author: ${author}`)
  if (head.length) blocks.push(head.join('\n'))

  /** @type {string[]} */
  let cur = []
  const flush = () => {
    if (cur.length) blocks.push(cur.join('\n'))
    cur = []
  }
  els.forEach((el, i) => {
    const next = els[i + 1]
    const continues = (el.type === 'dialogue' || el.type === 'parenthetical') && cur.length > 0
    if (!continues) flush()
    switch (el.type) {
      case 'scene':
        cur.push(isStandardScene(el.text) ? el.text : '.' + el.text)
        break
      case 'character': {
        const hasDialogue = next && (next.type === 'dialogue' || next.type === 'parenthetical')
        cur.push(hasDialogue && isStandardCharacter(el.text) ? el.text : '@' + el.text)
        break
      }
      case 'parenthetical':
        cur.push(`(${el.text})`)
        break
      case 'dialogue':
        cur.push(...el.text.split('\n'))
        break
      case 'transition':
        cur.push(isTransitionBare(el.text) ? el.text : '> ' + el.text)
        break
      default: {
        const lines = el.text.split('\n')
        if (actionNeedsForce(lines[0])) lines[0] = '!' + lines[0]
        cur.push(...lines)
      }
    }
  })
  flush()
  return blocks.join('\n\n') + '\n'
}

// ---------------------------------------------------------------------------
// Fountain: okuma

/**
 * @param {string[]} lines  Diyalog öbeğinin karakter satırından sonraki satırları
 * @param {ScriptElement[]} out
 */
function pushDialogueLines(lines, out) {
  for (const line of lines) {
    const m = /^\((.*)\)$/.exec(line)
    if (m) {
      out.push({ type: 'parenthetical', text: m[1].trim() })
      continue
    }
    const prev = out[out.length - 1]
    if (prev && prev.type === 'dialogue') prev.text += '\n' + line
    else out.push({ type: 'dialogue', text: line })
  }
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function actionText(lines) {
  return lines
    .map((l) => l.replace(/^~\s*/, ''))
    .join('\n')
    .trim()
}

/**
 * @param {string[]} ls  Boş satırsız bir öbek
 * @param {ScriptElement[]} out
 */
function parseBlock(ls, out) {
  const first = ls[0]
  const rest = ls.slice(1)
  const pushRestAsAction = () => {
    if (rest.length) out.push({ type: 'action', text: actionText(rest) })
  }

  if (first.startsWith('!')) {
    out.push({ type: 'action', text: actionText([first.slice(1).trim(), ...rest]) })
  } else if (first.startsWith('@')) {
    out.push({ type: 'character', text: first.slice(1) })
    pushDialogueLines(rest, out)
  } else if (first.startsWith('.') && !first.startsWith('..')) {
    out.push({ type: 'scene', text: first.slice(1) })
    pushRestAsAction()
  } else if (first.startsWith('>')) {
    if (first.endsWith('<')) {
      out.push({ type: 'action', text: actionText([first.slice(1, -1).trim(), ...rest]) })
    } else {
      out.push({ type: 'transition', text: first.slice(1) })
      pushRestAsAction()
    }
  } else if (isSceneLine(first)) {
    out.push({ type: 'scene', text: first })
    pushRestAsAction()
  } else if (ls.length === 1 && isTransitionBare(first)) {
    out.push({ type: 'transition', text: first })
  } else if (ls.length >= 2 && isUpperLine(first) && !first.startsWith('(')) {
    out.push({ type: 'character', text: first })
    pushDialogueLines(rest, out)
  } else {
    out.push({ type: 'action', text: actionText(ls) })
  }
}

/**
 * Fountain metnini okur. Başlık sayfası, bölüm/özet satırları, sayfa sonu, not ve boneyard yok sayılır.
 * @param {string} input
 * @returns {{ meta: Meta, elements: ScriptElement[] }}
 */
export function parseFountain(input) {
  const src = String(input ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\[\[[\s\S]*?\]\]/g, '')
  const lines = src.split('\n')
  /** @type {Meta} */
  const meta = {}
  let i = 0

  // Başlık sayfası: belgenin ilk öbeği anahtar: değer satırlarıyla başlıyorsa.
  while (i < lines.length && lines[i].trim() === '') i++
  if (i < lines.length && TITLE_KEY.test(lines[i].trim())) {
    /** @type {string | null} */
    let key = null
    for (; i < lines.length && lines[i].trim() !== ''; i++) {
      const raw = lines[i]
      const m = /^([A-Za-z ]+?)\s*:\s*(.*)$/.exec(raw.trim())
      if (m && !/^\s/.test(raw)) {
        key = m[1].toLowerCase()
        if (key === 'title') meta.title = m[2].trim()
        else if (key === 'author' || key === 'authors') meta.author = m[2].trim()
      } else if (key === 'title' && meta.title !== undefined) {
        meta.title = (meta.title + ' ' + raw.trim()).trim()
      }
    }
  }

  /** @type {ScriptElement[]} */
  const elements = []
  /** @type {string[]} */
  let block = []
  const flush = () => {
    if (block.length) parseBlock(block, elements)
    block = []
  }
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') {
      flush()
      continue
    }
    // Bölüm (#), özet (=), sayfa sonu (===): ekrana basılmaz.
    if (/^#/.test(line) || /^={3,}$/.test(line) || (line.startsWith('=') && !line.startsWith('=='))) continue
    block.push(line)
  }
  flush()
  return { meta, elements: normalizeDoc(elements) }
}

/**
 * Yapıştırılan düz metni öğelere çevirir. Tek satırsa null döner (satır içi eklenir).
 * @param {string} text
 * @returns {ScriptElement[] | null}
 */
export function parsePaste(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n')
  if (!t.includes('\n')) return null
  const els = parseFountain(t).elements
  return els.length ? els : null
}

// ---------------------------------------------------------------------------
// Enter / Tab kuralları

/** @type {Record<ElementType, ElementType>} */
const ENTER_NEXT = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'scene',
}

/**
 * Enter ile oluşacak bir sonraki öğenin türü.
 * @param {ElementType} type
 * @returns {ElementType}
 */
export function nextTypeOnEnter(type) {
  return ENTER_NEXT[type] ?? 'action'
}

/**
 * Tab (ileri) / Shift+Tab (geri) ile tür döngüsü.
 * @param {ElementType} type
 * @param {boolean} [backward]
 * @returns {ElementType}
 */
export function cycleType(type, backward = false) {
  const i = TAB_RING.indexOf(type)
  if (i < 0) return 'action'
  return TAB_RING[(i + (backward ? TAB_RING.length - 1 : 1)) % TAB_RING.length]
}

/**
 * "iç. mutfak - gün" yazılmış bir aksiyon satırını sahne başlığı olarak tanır.
 * @param {ElementType} type
 * @param {string} text
 * @returns {ElementType}
 */
export function inferType(type, text) {
  if (type === 'action' && text.trim() !== '' && !text.includes('\n') && isSceneLine(text)) return 'scene'
  return type
}

/**
 * Enter: öğeyi imleç konumunda böler.
 *  - Boş (aksiyon dışı) öğede Enter: öğe aksiyona döner, yeni öğe eklenmez.
 *  - İmleçten sonrası boşsa yeni öğenin türü Enter kuralından gelir; doluysa aynı tür sürer.
 * @param {ScriptElement} el
 * @param {number} offset  İmlecin metin içindeki konumu
 * @returns {{ current: ScriptElement, next: ScriptElement | null }}
 */
export function splitElement(el, offset) {
  const text = el.text
  const at = Math.max(0, Math.min(offset, text.length))
  if (text.trim() === '' && el.type !== 'action') {
    return { current: { type: 'action', text: '' }, next: null }
  }
  let before = text.slice(0, at)
  const after = text.slice(at)
  let type = inferType(el.type, before)
  if (at === 0) {
    // Satır başında Enter: içerik aşağı iner, boş öğe yukarıda kalır.
    return { current: { type: el.type, text: '' }, next: { type: el.type, text: after } }
  }
  if (isUpperType(type)) before = upperTr(before)
  const nextType = after.trim() === '' ? nextTypeOnEnter(type) : type
  return {
    current: { type, text: before },
    next: { type: nextType, text: isUpperType(nextType) ? upperTr(after) : after },
  }
}

// ---------------------------------------------------------------------------
// Sahne yardımcıları

/**
 * Verilen öğe dizininin ait olduğu sahnenin sırası (0 tabanlı); sahne başlığından önceyse -1.
 * @param {ReadonlyArray<{ type: string }>} elements
 * @param {number} index
 */
export function sceneNumberAt(elements, index) {
  let n = -1
  for (let i = 0; i <= index && i < elements.length; i++) if (elements[i].type === 'scene') n++
  return n
}

/**
 * Sahnenin öğe aralığı: start dahil, end hariç.
 * @param {ReadonlyArray<{ type: string }>} elements
 * @param {number} sceneNo
 * @returns {{ start: number, end: number } | null}
 */
export function sceneBounds(elements, sceneNo) {
  if (!Number.isInteger(sceneNo) || sceneNo < 0) return null
  let n = -1
  let start = -1
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].type !== 'scene') continue
    n++
    if (n === sceneNo) start = i
    else if (n === sceneNo + 1) return { start, end: i }
  }
  return start >= 0 ? { start, end: elements.length } : null
}

// ---------------------------------------------------------------------------
// İstatistik

/** Bir sayfa ≈ 55 satır (Courier 12 pt). */
export const PAGE_LINES = 55

/** @type {Record<ElementType, number>} */
const WIDTH = { scene: 60, action: 60, character: 38, parenthetical: 25, dialogue: 35, transition: 60 }

/**
 * @param {string} text
 */
export function countWords(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length
}

/**
 * Tahmini sayfa satırı (öğe aralarındaki boş satırlar dahil).
 * @param {ReadonlyArray<{ type: ElementType, text: string }>} elements
 */
export function estimateLines(elements) {
  let lines = 0
  let prev = ''
  for (const el of normalizeDoc(elements)) {
    const w = WIDTH[el.type]
    const body = el.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / w)), 0)
    const continues = (el.type === 'dialogue' || el.type === 'parenthetical') && IN_DIALOGUE_BLOCK.has(prev)
    lines += body + (continues ? 0 : 1)
    prev = el.type
  }
  return lines
}

/**
 * @typedef {{ index: number, elementIndex: number, heading: string, words: number, elements: number }} SceneInfo
 * @typedef {{ name: string, lines: number, words: number }} CharacterInfo
 * @typedef {{ scenes: SceneInfo[], characters: CharacterInfo[], words: number, pages: number, elementCount: number }} Stats
 */

/**
 * Sahne listesi, karakterler (replik sayısıyla), kelime sayısı, tahmini sayfa.
 * Ham model üzerinde çalışır (editördeki boş öğeler sayılmaz).
 * @param {ReadonlyArray<{ type: ElementType, text: string }>} elements
 * @returns {Stats}
 */
export function computeStats(elements) {
  /** @type {SceneInfo[]} */
  const scenes = []
  /** @type {Map<string, CharacterInfo>} */
  const chars = new Map()
  let words = 0
  /** @type {CharacterInfo | null} */
  let speaker = null
  let count = 0
  elements.forEach((el, i) => {
    if (el.text.trim() === '') return
    count++
    const w = countWords(el.text)
    words += w
    if (el.type === 'scene') {
      scenes.push({ index: scenes.length, elementIndex: i, heading: el.text.trim(), words: 0, elements: 0 })
    }
    const scene = scenes[scenes.length - 1]
    if (scene) {
      scene.words += w
      scene.elements++
    }
    if (el.type === 'character') {
      const name = characterBase(el.text)
      if (!name) {
        speaker = null
        return
      }
      let info = chars.get(name)
      if (!info) chars.set(name, (info = { name, lines: 0, words: 0 }))
      speaker = info
    } else if (el.type === 'dialogue') {
      if (speaker) {
        speaker.lines++
        speaker.words += w
      }
    } else if (el.type !== 'parenthetical') {
      speaker = null
    }
  })
  const characters = [...chars.values()].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name, 'tr-TR'))
  const pages = Math.round((estimateLines(elements) / PAGE_LINES) * 10) / 10
  return { scenes, characters, words, pages, elementCount: count }
}
