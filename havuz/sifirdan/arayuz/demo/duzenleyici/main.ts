// Düzenleyici gösterimi: klavye ve fare olaylarını düzenleyici komutlarına çevirir. Metin girişi gizli
// textarea'dan `beforeinput` olaylarıyla alınır (IME bileşimi `compositionend` ile); textarea'nın değeri ve
// seçimi her değişiklikten sonra belgeyle eşitlenir: ekran okuyucu metni oradan okur.
// Genişletme: yeni kısayol = `onKey` içindeki tabloya bir satır (tuş → komut).
import {
  Editor,
  findAll,
  primaryRange,
  rangeFrom,
  rangeTo,
  SearchError,
  type Match,
  type SearchQuery,
} from '../../src/duzenleyici/index.ts'
import { metin } from '../metin.ts'
import { EditorView } from './view.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const SAMPLE = [
  "İstanbul'da bir sabah, ılık bir rüzgâr esiyordu.",
  'istanbul · ISTANBUL · İSTANBUL · Istanbul — Türkçe kural: i ↔ İ, ı ↔ I',
  'Emoji ve birleşik harfler tek adımda geçilir: 👍🏽 🇹🇷 e\u0301 n\u0303',
  'const toplam = fiyat * adet // Ctrl+D ile "fiyat"ı seçip çoğaltın',
  '',
  'Iğdır, Şanlıurfa ve Çanakkale; ırmak, IRMAK.',
].join('\n')

const editor = new Editor({ text: SAMPLE })
const input = $<HTMLTextAreaElement>('girdi')
const surface = $('yuzey')
const view = new EditorView(editor, $('satirlar'), $('numaralar'), $('katman'))
let matches: Match[] = []

function query(): SearchQuery {
  return {
    text: $<HTMLInputElement>('aranan').value,
    regex: $<HTMLInputElement>('duzenli').checked,
    caseSensitive: $<HTMLInputElement>('duyarli').checked,
    wholeWord: $<HTMLInputElement>('kelime').checked,
  }
}

function updateMatches(): void {
  try {
    matches = findAll(editor.text(), query())
    $('bul-durum').textContent = metin.duzenleyici.bulundu(matches.length)
  } catch (error) {
    matches = []
    $('bul-durum').textContent =
      error instanceof SearchError ? metin.duzenleyici.hataliIfade(error.message) : String(error)
  }
}

function syncInput(): void {
  const main = primaryRange(editor.selection)
  if (input.value !== editor.text()) input.value = editor.text()
  input.setSelectionRange(rangeFrom(main), rangeTo(main), main.head < main.anchor ? 'backward' : 'forward')
}

function render(): void {
  updateMatches()
  view.render(matches)
  const main = primaryRange(editor.selection)
  const pos = editor.doc.positionAt(main.head)
  $('konum').textContent = metin.duzenleyici.konum(pos.line + 1, pos.col + 1, editor.selection.ranges.length)
  $<HTMLButtonElement>('geri-al').disabled = !editor.canUndo
  $<HTMLButtonElement>('yinele').disabled = !editor.canRedo
  syncInput()
  if (document.activeElement === input) view.reveal()
}

editor.subscribe(render)

input.addEventListener('keydown', (event) => {
  const ctrl = event.ctrlKey || event.metaKey
  const word = event.altKey || ctrl ? 'word' : 'char'
  const handled = (() => {
    switch (event.key) {
      case 'ArrowLeft':
        editor.moveHorizontal(-1, event.shiftKey, word)
        return true
      case 'ArrowRight':
        editor.moveHorizontal(1, event.shiftKey, word)
        return true
      case 'ArrowUp':
        editor.moveVertical(-1, event.shiftKey)
        return true
      case 'ArrowDown':
        editor.moveVertical(1, event.shiftKey)
        return true
      case 'Home':
        if (ctrl) editor.moveDocBoundary(false, event.shiftKey)
        else editor.moveLineBoundary(false, event.shiftKey)
        return true
      case 'End':
        if (ctrl) editor.moveDocBoundary(true, event.shiftKey)
        else editor.moveLineBoundary(true, event.shiftKey)
        return true
      case 'Escape':
        editor.setSelection({ ranges: [primaryRange(editor.selection)], primary: 0 })
        return true
    }
    if (!ctrl) return false
    const key = event.key.length === 1 ? event.key.toLocaleLowerCase('tr-TR') : event.key
    if (key === 'z' && !event.shiftKey) return editor.undo() || true
    if (key === 'y' || (key === 'z' && event.shiftKey)) return editor.redo() || true
    if (key === 'a') return (editor.selectAll(), true)
    if (key === 'd') return (editor.addNextOccurrence(), true)
    return false
  })()
  if (handled) event.preventDefault()
})

input.addEventListener('beforeinput', (event) => {
  const e = event
  switch (e.inputType) {
    case 'insertText':
    case 'insertReplacementText':
      editor.insertText(e.data ?? e.dataTransfer?.getData('text/plain') ?? '')
      break
    case 'insertLineBreak':
    case 'insertParagraph':
      editor.insertText('\n')
      break
    case 'insertFromPaste':
    case 'insertFromDrop':
      editor.insertText(e.dataTransfer?.getData('text/plain') ?? e.data ?? '')
      break
    case 'deleteContentBackward':
      editor.deleteBackward()
      break
    case 'deleteContentForward':
      editor.deleteForward()
      break
    case 'deleteWordBackward':
      editor.deleteBackward('word')
      break
    case 'deleteWordForward':
      editor.deleteForward('word')
      break
    case 'historyUndo':
      editor.undo()
      break
    case 'historyRedo':
      editor.redo()
      break
    default:
      return
  }
  e.preventDefault()
})
input.addEventListener('compositionend', (event) => {
  if (event.data) editor.insertText(event.data)
  syncInput()
})
input.addEventListener('cut', (event) => {
  const main = primaryRange(editor.selection)
  event.clipboardData?.setData('text/plain', editor.doc.slice(rangeFrom(main), rangeTo(main)))
  event.preventDefault()
  editor.insertText('')
})

let dragging = false
surface.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  input.focus({ preventScroll: true })
  const offset = view.offsetAt(event.clientX, event.clientY)
  const main = primaryRange(editor.selection)
  if (event.altKey) editor.addCursor(offset)
  else editor.setSelection({ ranges: [{ anchor: event.shiftKey ? main.anchor : offset, head: offset }], primary: 0 })
  dragging = !event.altKey
  surface.setPointerCapture?.(event.pointerId)
})
surface.addEventListener('pointermove', (event) => {
  if (!dragging) return
  const main = primaryRange(editor.selection)
  editor.setSelection({
    ranges: [{ anchor: main.anchor, head: view.offsetAt(event.clientX, event.clientY) }],
    primary: 0,
  })
})
surface.addEventListener('pointerup', () => (dragging = false))

$('geri-al').addEventListener('click', () => editor.undo())
$('yinele').addEventListener('click', () => editor.redo())
$('sonraki').addEventListener('click', () => {
  if (!editor.selectNextMatch(query())) updateMatches()
  input.focus()
})
$('degistir').addEventListener('click', () => {
  editor.replaceNext(query(), $<HTMLInputElement>('yerine').value)
})
$('tumu').addEventListener('click', () => {
  try {
    const n = editor.replaceAll(query(), $<HTMLInputElement>('yerine').value)
    $('bul-durum').textContent = metin.duzenleyici.degisti(n)
  } catch (error) {
    $('bul-durum').textContent = String((error as Error).message)
  }
})
for (const id of ['aranan', 'duzenli', 'duyarli', 'kelime']) $(id).addEventListener('input', render)

render()
