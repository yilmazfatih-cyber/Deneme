// Sanal DOM gösterimi: yapılacaklar listesi JSX ile. Kancalar (useState, useReducer, useMemo, useRef,
// useEffect, useContext) ve hata sınırı gerçek bir kullanımda görünür. DOM işlem sayacı her güncellemeden
// önce sıfırlanır ve etki içinde okunur.
// Genişletme: yeni bir alan (ör. son tarih) için `Task` türüne alan + `TaskItem`'a bir öğe ekleyin.
import {
  createContext,
  domStats,
  ErrorBoundary,
  Fragment,
  h,
  render,
  resetDomStats,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Child,
} from '../../src/sanal_dom/index.ts'
import { metin } from '../metin.ts'

void Fragment
type Task = { id: number; text: string; done: boolean }
type Filter = 'hepsi' | 'bekleyen' | 'biten'
type Action =
  | { type: 'ekle'; text: string }
  | { type: 'degistir'; id: number }
  | { type: 'sil'; id: number }
  | { type: 'yukari'; id: number }
  | { type: 'karistir' }

let nextId = 4
const initial: Task[] = [
  { id: 1, text: 'Süt al', done: false },
  { id: 2, text: 'Faturayı öde', done: true },
  { id: 3, text: 'İzmir biletine bak', done: false },
]

function reducer(tasks: Task[], action: Action): Task[] {
  switch (action.type) {
    case 'ekle':
      return [...tasks, { id: nextId++, text: action.text, done: false }]
    case 'degistir':
      return tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t))
    case 'sil':
      return tasks.filter((t) => t.id !== action.id)
    case 'yukari': {
      const i = tasks.findIndex((t) => t.id === action.id)
      if (i <= 0) return tasks
      const copy = tasks.slice()
      ;[copy[i - 1], copy[i]] = [copy[i] as Task, copy[i - 1] as Task]
      return copy
    }
    case 'karistir':
      return tasks.length < 2 ? tasks : [...tasks.slice(1), tasks[0] as Task].reverse()
  }
}

const Stats = createContext({ show: true })

function TaskItem(props: { task: Task; dispatch: (a: Action) => void }): Child {
  const { task, dispatch } = props
  return (
    <li class={task.done ? 'gorev bitti' : 'gorev'}>
      <label>
        <input type="checkbox" checked={task.done} onChange={() => dispatch({ type: 'degistir', id: task.id })} />
        <span>{task.text}</span>
      </label>
      <button
        type="button"
        aria-label={metin.sanal_dom.yukari(task.text)}
        onClick={() => dispatch({ type: 'yukari', id: task.id })}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={metin.sanal_dom.sil(task.text)}
        onClick={() => dispatch({ type: 'sil', id: task.id })}
      >
        Sil
      </button>
    </li>
  )
}

function DomCounter(props: { version: number }): Child {
  const { show } = useContext(Stats)
  const [text, setText] = useState('')
  useEffect(() => {
    if (props.version > 0) setText(metin.sanal_dom.islem(domStats.inserts, domStats.creations, domStats.removals))
  }, [props.version])
  return show ? (
    <p class="durum" aria-live="polite">
      {text}
    </p>
  ) : null
}

function Bomb(): Child {
  throw new Error('Bu bileşen bilerek hata attı.')
}

function App(): Child {
  const [tasks, rawDispatch] = useReducer(reducer, initial)
  const [filter, setFilter] = useState<Filter>('hepsi')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [explode, setExplode] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)
  const dispatch = (action: Action) => {
    resetDomStats()
    rawDispatch(action)
    setVersion((v) => v + 1)
  }
  const visible = useMemo(
    () => tasks.filter((t) => (filter === 'hepsi' ? true : filter === 'biten' ? t.done : !t.done)),
    [tasks, filter],
  )
  const remaining = tasks.filter((t) => !t.done).length
  const submit = (event: Event) => {
    event.preventDefault()
    if (draft.trim() === '') {
      setError(metin.sanal_dom.hata)
      input.current?.focus()
      return
    }
    dispatch({ type: 'ekle', text: draft.trim() })
    setDraft('')
    setError('')
  }
  const filterButton = (value: Filter, label: string) => (
    <button type="button" aria-pressed={filter === value ? 'true' : 'false'} onClick={() => setFilter(value)}>
      {label}
    </button>
  )
  return (
    <>
      <section class="panel" aria-labelledby="liste-baslik">
        <h2 id="liste-baslik">Görevler</h2>
        <form class="gorev-formu" onSubmit={submit} novalidate>
          <label class="gizli" for="yeni-gorev">
            Yeni görev
          </label>
          <input
            id="yeni-gorev"
            ref={input}
            placeholder="Yeni görev yazın"
            value={draft}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'gorev-hatasi' : undefined}
            onInput={(e: Event) => setDraft((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="birincil">
            Ekle
          </button>
        </form>
        {error ? (
          <p id="gorev-hatasi" class="hata-metni">
            {error}
          </p>
        ) : null}
        <div class="satir" role="group" aria-label="Süzgeç">
          {filterButton('hepsi', 'Tümü')}
          {filterButton('bekleyen', 'Bekleyen')}
          {filterButton('biten', 'Biten')}
          <button type="button" onClick={() => dispatch({ type: 'karistir' })}>
            Karıştır
          </button>
        </div>
        {visible.length === 0 ? (
          <p class="ikincil">{metin.sanal_dom.bos}</p>
        ) : (
          <ul class="gorevler">
            {visible.map((task) => (
              <TaskItem key={task.id} task={task} dispatch={dispatch} />
            ))}
          </ul>
        )}
        <p class="durum">{metin.sanal_dom.sayac(remaining, tasks.length)}</p>
        <Stats.Provider value={{ show: true }}>
          <DomCounter version={version} />
        </Stats.Provider>
      </section>
      <section class="panel" aria-labelledby="sinir-baslik">
        <h2 id="sinir-baslik">Hata sınırı</h2>
        <ErrorBoundary
          fallback={(e: unknown, reset: () => void) => (
            <div role="alert">
              <p class="hata-metni">Bir bileşen çöktü: {(e as Error).message}</p>
              <button
                type="button"
                onClick={() => {
                  setExplode(false)
                  reset()
                }}
              >
                Yeniden dene
              </button>
            </div>
          )}
        >
          {explode ? (
            <Bomb />
          ) : (
            <p class="ikincil">Bu alan bir hata sınırıyla sarılı; uygulamanın geri kalanı çökmez.</p>
          )}
          <button type="button" onClick={() => setExplode(true)}>
            Bileşeni çökert
          </button>
        </ErrorBoundary>
      </section>
    </>
  )
}

render(<App />, document.getElementById('uygulama') as HTMLElement)
