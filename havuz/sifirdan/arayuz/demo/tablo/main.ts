// E-tablo gösterimi: sanallaştırılmış ızgara (yalnız görünen satırlar DOM'dadır), klavye gezintisi, formül
// çubuğu, dikdörtgen seçim, kopyala-yapıştır (içeride kopyalanan formüller yeni yere göre kaydırılır).
// Erişilebilirlik: role=grid + aria-activedescendant; etkin hücre her zaman çizili tutulur.
// Genişletme: hücre içi düzenleyici için etkin hücrenin üstüne bir <input> yerleştirip formül çubuğuyla eşleyin.
import {
  alignment,
  cellKey,
  columnName,
  isError,
  listFunctions,
  parseTSV,
  Sheet,
  shiftFormula,
  toTSV,
} from '../../src/tablo/index.ts'
import { metin } from '../metin.ts'

const ROWS = 100
const COLS = 26
const ROW_H = 32
const OVERSCAN = 6

const sheet = new Sheet({ rows: ROWS, cols: COLS, decimalComma: true })
sheet.setCells([
  ['A1', 'Kalem'],
  ['B1', 'Ocak'],
  ['C1', 'Şubat'],
  ['D1', 'Toplam'],
  ['A2', 'Kira'],
  ['B2', '15000'],
  ['C2', '15000'],
  ['A3', 'Market'],
  ['B3', '6250,5'],
  ['C3', '7100'],
  ['A4', 'Fatura'],
  ['B4', '2300'],
  ['C4', '2650'],
  ['A5', 'Ulaşım'],
  ['B5', '1800'],
  ['C5', '1650'],
  ...[2, 3, 4, 5].map((r) => [`D${r}`, `=TOPLA(B${r}:C${r})`] as [string, string]),
  ['A6', 'Toplam'],
  ['B6', '=TOPLA(B2:B5)'],
  ['C6', '=TOPLA(C2:C5)'],
  ['D6', '=TOPLA(D2:D5)'],
  ['A8', 'En yüksek'],
  ['B8', '=MAK(B2:C5)'],
  ['A9', 'Ortalama'],
  ['B9', '=YUVARLA(ORTALAMA(B2:C5);2)'],
  ['A10', 'Durum'],
  ['B10', '=EĞER(D6>50000;"Bütçe aşıldı";"Bütçe uygun")'],
])

const grid = document.getElementById('izgara') as HTMLElement
const formula = document.getElementById('formul') as HTMLInputElement
const address = document.getElementById('adres') as HTMLOutputElement
const status = document.getElementById('durum') as HTMLElement
document.getElementById('islevler')!.textContent = listFunctions()
  .map((f) => f.names.join(' / '))
  .join(' · ')

let active = { row: 0, col: 0 }
let anchor = { row: 0, col: 0 }
let lastCopy: { text: string; row: number; col: number } | undefined

grid.setAttribute('aria-rowcount', String(ROWS + 1))
grid.setAttribute('aria-colcount', String(COLS + 1))
const head = document.createElement('div')
head.className = 'izgara-ust'
head.setAttribute('role', 'rowgroup')
const headRow = document.createElement('div')
headRow.className = 'izgara-satir'
headRow.setAttribute('role', 'row')
headRow.setAttribute('aria-rowindex', '1')
const corner = document.createElement('div')
corner.className = 'hucre baslik satir-no'
corner.setAttribute('role', 'columnheader')
corner.setAttribute('aria-label', 'Satır numarası')
headRow.append(corner)
for (let c = 0; c < COLS; c++) {
  const cell = document.createElement('div')
  cell.className = 'hucre baslik'
  cell.setAttribute('role', 'columnheader')
  cell.textContent = columnName(c)
  headRow.append(cell)
}
head.append(headRow)
const body = document.createElement('div')
body.setAttribute('role', 'rowgroup')
body.style.position = 'relative'
body.style.height = `${ROWS * ROW_H}px`
body.style.width = `${48 + COLS * 104}px`
grid.append(head, body)

const selection = () => ({
  top: Math.min(active.row, anchor.row),
  bottom: Math.max(active.row, anchor.row),
  left: Math.min(active.col, anchor.col),
  right: Math.max(active.col, anchor.col),
})

function drawRows(): void {
  const first = Math.max(0, Math.floor(grid.scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(ROWS - 1, Math.ceil((grid.scrollTop + grid.clientHeight) / ROW_H) + OVERSCAN)
  const range = selection()
  const rows: HTMLElement[] = []
  const wanted = new Set<number>([active.row])
  for (let r = first; r <= last; r++) wanted.add(r)
  for (const r of [...wanted].sort((a, b) => a - b)) {
    const row = document.createElement('div')
    row.className = 'izgara-satir'
    row.setAttribute('role', 'row')
    row.setAttribute('aria-rowindex', String(r + 2))
    row.style.top = `${r * ROW_H}px`
    const label = document.createElement('div')
    label.className = 'hucre baslik satir-no'
    label.setAttribute('role', 'rowheader')
    label.textContent = String(r + 1)
    row.append(label)
    for (let c = 0; c < COLS; c++) {
      const key = cellKey(r, c)
      const value = sheet.getValueAt(r, c)
      const cell = document.createElement('div')
      cell.id = `hucre-${key}`
      cell.setAttribute('role', 'gridcell')
      cell.setAttribute('aria-colindex', String(c + 2))
      const selected = r >= range.top && r <= range.bottom && c >= range.left && c <= range.right
      cell.setAttribute('aria-selected', String(selected))
      const align = alignment(value)
      cell.className = `hucre${align === 'end' ? ' sayi' : align === 'center' ? ' orta' : ''}${isError(value) ? ' hata' : ''}${r === active.row && c === active.col ? ' etkin' : ''}`
      cell.textContent = sheet.getDisplay(key)
      cell.dataset.r = String(r)
      cell.dataset.c = String(c)
      row.append(cell)
    }
    rows.push(row)
  }
  body.replaceChildren(...rows)
  grid.setAttribute('aria-activedescendant', `hucre-${cellKey(active.row, active.col)}`)
}

function syncBar(): void {
  const key = cellKey(active.row, active.col)
  address.textContent = key
  if (document.activeElement !== formula) formula.value = sheet.getInput(key)
}

function scrollIntoView(): void {
  const top = active.row * ROW_H
  const bottom = top + ROW_H + ROW_H
  if (top < grid.scrollTop) grid.scrollTop = top
  else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTop = bottom - grid.clientHeight
  const left = 48 + active.col * 104
  if (left - 48 < grid.scrollLeft) grid.scrollLeft = left - 48
  else if (left + 104 > grid.scrollLeft + grid.clientWidth) grid.scrollLeft = left + 104 - grid.clientWidth
}

function move(dRow: number, dCol: number, extend = false): void {
  active = {
    row: Math.max(0, Math.min(ROWS - 1, active.row + dRow)),
    col: Math.max(0, Math.min(COLS - 1, active.col + dCol)),
  }
  if (!extend) anchor = { ...active }
  scrollIntoView()
  drawRows()
  syncBar()
}

function commit(input: string): void {
  const before = sheet.stats.evaluations
  const changed = sheet.setCell(cellKey(active.row, active.col), input)
  status.textContent = metin.tablo.hesaplanan(sheet.stats.evaluations - before, changed.length)
}

grid.addEventListener('keydown', (event) => {
  const keys: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    PageUp: [-10, 0],
    PageDown: [10, 0],
  }
  const step = keys[event.key]
  if (step) {
    event.preventDefault()
    move(step[0], step[1], event.shiftKey)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    move(event.ctrlKey ? (event.key === 'Home' ? -ROWS : ROWS) : 0, event.key === 'Home' ? -COLS : COLS)
  } else if (event.key === 'Enter' || event.key === 'F2') {
    event.preventDefault()
    formula.focus()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    const r = selection()
    const entries: [string, string][] = []
    for (let row = r.top; row <= r.bottom; row++)
      for (let col = r.left; col <= r.right; col++) entries.push([cellKey(row, col), ''])
    sheet.setCells(entries)
    drawRows()
    syncBar()
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    formula.value = event.key
    formula.focus()
  }
})

formula.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    commit(formula.value)
    grid.focus()
    move(event.key === 'Enter' ? 1 : 0, event.key === 'Tab' ? 1 : 0)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    formula.value = sheet.getInput(cellKey(active.row, active.col))
    grid.focus()
  }
})

grid.addEventListener('click', (event) => {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[role="gridcell"]')
  if (!cell) return
  active = { row: Number(cell.dataset.r), col: Number(cell.dataset.c) }
  if (!event.shiftKey) anchor = { ...active }
  drawRows()
  syncBar()
})
grid.addEventListener('dblclick', () => formula.focus())

grid.addEventListener('copy', (event) => {
  const r = selection()
  const rows: string[][] = []
  for (let row = r.top; row <= r.bottom; row++) {
    const line: string[] = []
    for (let col = r.left; col <= r.right; col++) line.push(sheet.getInput(cellKey(row, col)))
    rows.push(line)
  }
  const text = toTSV(rows)
  lastCopy = { text, row: r.top, col: r.left }
  event.clipboardData?.setData('text/plain', text)
  event.preventDefault()
})

grid.addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  event.preventDefault()
  const internal = lastCopy && lastCopy.text === text ? lastCopy : undefined
  const entries: [string, string][] = []
  parseTSV(text).forEach((line, dr) =>
    line.forEach((input, dc) => {
      const row = active.row + dr
      const col = active.col + dc
      if (row >= ROWS || col >= COLS) return
      const value = internal
        ? shiftFormula(input, active.row - internal.row, active.col - internal.col, sheet.style)
        : input
      entries.push([cellKey(row, col), value])
    }),
  )
  sheet.setCells(entries)
  status.textContent = metin.tablo.yapistirildi(entries.length)
  drawRows()
  syncBar()
})

let pending = false
grid.addEventListener('scroll', () => {
  if (pending) return
  pending = true
  requestAnimationFrame(() => {
    pending = false
    drawRows()
  })
})
sheet.subscribe(() => drawRows())
drawRows()
syncBar()
