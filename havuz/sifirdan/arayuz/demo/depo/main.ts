// Depo gösterimi: notlar uygulaması. Kök indirgeyici sarmalanır: replaceable(undoable(notlar)).
// Kalıcılık yalnız `present`'ı yazar (sürüm 2; sürüm 1 için göç örneği var). Sekmeler BroadcastChannel ile
// eşitlenir; yeni sekme açık sekmeden tüm durumu (geçmiş dahil) alır.
// Genişletme: yeni eylem = `reducer`'a bir dal + düğmeye `store.dispatch({ type: … })`.
import {
  createSelector,
  createStore,
  createTabSync,
  jumpTo,
  loadPersisted,
  logger,
  persist,
  redo,
  replaceable,
  timeline,
  undo,
  undoable,
  type Action,
  type UndoState,
} from '../../src/depo/index.ts'
import { metin } from '../metin.ts'

type Note = { id: number; metin: string; yildiz: boolean }
type Notes = { notlar: Note[] }
type Root = UndoState<Notes>

const empty: Notes = { notlar: [] }
function reducer(state: Notes = empty, action: Action): Notes {
  switch (action.type) {
    case 'ekle': {
      const id = state.notlar.reduce((max, n) => Math.max(max, n.id), 0) + 1
      return { notlar: [...state.notlar, { id, metin: String(action.payload), yildiz: false }] }
    }
    case 'sil':
      return { notlar: state.notlar.filter((n) => n.id !== action.payload) }
    case 'yildiz':
      return { notlar: state.notlar.map((n) => (n.id === action.payload ? { ...n, yildiz: !n.yildiz } : n)) }
    case 'temizle':
      return state.notlar.length === 0 ? state : empty
    default:
      return state
  }
}

const isNotes = (v: unknown): v is Notes =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Notes).notlar) &&
  (v as Notes).notlar.every(
    (n) => typeof n.id === 'number' && typeof n.metin === 'string' && typeof n.yildiz === 'boolean',
  )

const persistOptions = {
  key: 'sifirdan-depo-notlar',
  version: 2,
  validate: isNotes,
  select: (s: Root) => s.present,
  migrations: {
    2: (old: unknown) => ({
      notlar: ((old as { notlar: string[] }).notlar ?? []).map((m, i) => ({ id: i + 1, metin: m, yildiz: false })),
    }),
  },
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const status = $('durum')
const loaded = loadPersisted<Root, Notes>(persistOptions)
if (!loaded.ok && loaded.reason !== 'yok') status.textContent = metin.depo.kayitYuklenemedi(loaded.reason)

const log = $<HTMLOListElement>('gunluk')
const sync = createTabSync<Root>({ name: 'sifirdan-depo' })
const store = createStore<Root>(
  replaceable(undoable(reducer, { limit: 50 })),
  loaded.ok ? { past: [], present: loaded.value, future: [], group: undefined } : undefined,
  {
    middleware: [
      logger(({ action }) => {
        const a = action as Action
        const item = document.createElement('li')
        item.textContent = `${a.type}${a.payload === undefined ? '' : ` ${JSON.stringify(a.payload)}`}${a.meta?.remote ? ' (başka sekme)' : ''}`
        log.prepend(item)
        while (log.children.length > 8) log.lastElementChild?.remove()
        if (a.meta?.remote) status.textContent = metin.depo.eşitlendi
      }),
      sync.middleware,
    ],
  },
)
sync.connect(store)
const persisted = persist(store, persistOptions)
// Yazma gecikmelidir (100 ms); sayfa kapanırken ya da yenilenirken bekleyen yazma kaybolmasın.
window.addEventListener('pagehide', () => persisted.flush())

const starred = createSelector([(s: Root) => s.present.notlar], (notes) => notes.filter((n) => n.yildiz).length)

function render(): void {
  const state = store.getState()
  const list = $<HTMLUListElement>('notlar')
  list.replaceChildren()
  if (state.present.notlar.length === 0) {
    const item = document.createElement('li')
    item.className = 'ikincil'
    item.textContent = metin.depo.bos
    list.append(item)
  }
  for (const note of state.present.notlar) {
    const item = document.createElement('li')
    const text = document.createElement('span')
    text.textContent = note.metin
    const star = document.createElement('button')
    star.type = 'button'
    star.textContent = note.yildiz ? '★' : '☆'
    star.setAttribute('aria-pressed', String(note.yildiz))
    star.setAttribute('aria-label', `"${note.metin}" yıldızlı`)
    star.addEventListener('click', () => store.dispatch({ type: 'yildiz', payload: note.id }))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = 'Sil'
    remove.setAttribute('aria-label', `"${note.metin}" notunu sil`)
    remove.addEventListener('click', () => store.dispatch({ type: 'sil', payload: note.id }))
    item.append(star, text, remove)
    list.append(item)
  }
  const { states, index } = timeline(state)
  const slider = $<HTMLInputElement>('zaman')
  slider.max = String(states.length - 1)
  slider.value = String(index)
  $('adim').textContent = metin.depo.adim(index + 1, states.length)
  $<HTMLButtonElement>('geri-al').disabled = state.past.length === 0
  $<HTMLButtonElement>('yinele').disabled = state.future.length === 0
  $('secici').textContent = `Yıldızlı not: ${starred(state)} (seçici ${starred.recomputations()} kez hesapladı)`
}

store.subscribe(render)
render()

$<HTMLFormElement>('not-formu').addEventListener('submit', (event) => {
  event.preventDefault()
  const input = $<HTMLInputElement>('not-metni')
  if (input.value.trim() === '') return input.focus()
  store.dispatch({ type: 'ekle', payload: input.value.trim() })
  input.value = ''
})
$('geri-al').addEventListener('click', () => store.dispatch(undo()))
$('yinele').addEventListener('click', () => store.dispatch(redo()))
$('temizle').addEventListener('click', () => store.dispatch({ type: 'temizle' }))
$<HTMLInputElement>('zaman').addEventListener('input', (e) =>
  store.dispatch(jumpTo(Number((e.target as HTMLInputElement).value))),
)
