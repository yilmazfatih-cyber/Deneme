/**
 * Bildirim zili: ilk liste GraphQL `Notifications` ile gelir, sonra GET /push uzun yoklamasıyla canlı güncellenir
 * (Netflix'te notifications.netflix.com/push). Profil yoksa hiçbir şey yapmaz; profil değişince döngü baştan kurulur.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ROUTES } from '../../../../shared/constants'
import type { PushEvent } from '../../../../shared/types'
import { gql } from '../../api/graphql'
import { onBootChange, peekBoot, sessionHeaders, virtualDevice } from '../../api/session'
import { devbus } from '../../lib/devbus'
import './notifications.css'
import { createPushPoller } from './poller'
import { relativeTime } from './time'

interface Item {
  id: string
  kind: string
  title: string
  body: string
  href: string | null
  createdAt: string
  read: boolean
}

const TOAST_MS = 5000
const BELL_PATH_1 = 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7'
const BELL_PATH_2 = 'M10 20a2 2 0 0 0 4 0'

function useWide(): boolean {
  const q = '(min-width: 900px)'
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(q).matches,
    () => true,
  )
}

function merge(list: Item[], incoming: Item[]): Item[] {
  const byId = new Map(list.map((i) => [i.id, i]))
  for (const n of incoming) {
    const old = byId.get(n.id)
    // Yerelde okundu sayılanı sunucudan gelen eski kopya geri "okunmadı" yapmasın.
    byId.set(n.id, old ? { ...n, read: n.read || old.read } : n)
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function toItem(e: PushEvent | Item): Item {
  return { id: e.id, kind: e.kind, title: e.title, body: e.body, href: e.href, createdAt: e.createdAt, read: e.read }
}

function go(href: string | null): void {
  if (!href) return
  location.hash = href.startsWith('#') ? href.slice(1) : href
}

export function NotificationBell(): ReactElement | null {
  const boot = useSyncExternalStore(onBootChange, peekBoot, peekBoot)
  const guid = boot?.activeProfile?.guid ?? null
  if (!guid) return null
  // Profil değişince bileşen yeniden kurulur: eski döngü iptal edilir, liste yeniden alınır.
  return <Bell key={guid} />
}

function Bell(): ReactElement {
  const [items, setItems] = useState<Item[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<Item | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const rootRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const wide = useWide()

  // İlk liste + uzun yoklama döngüsü
  useEffect(() => {
    const ctrl = new AbortController()
    const known = new Set<string>()
    const poller = createPushPoller(
      {
        fetch: (url, init) => fetch(url, init),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (h) => window.clearTimeout(h as number),
        now: () => performance.now(),
        isHidden: () => document.visibilityState === 'hidden',
        onVisibilityChange: (fn) => {
          document.addEventListener('visibilitychange', fn)
          return () => document.removeEventListener('visibilitychange', fn)
        },
        headers: () => ({ accept: 'application/json', ...sessionHeaders() }),
        emit: (label, detail, o) => devbus.emit('push', label, detail, o),
      },
      {
        route: ROUTES.PUSH,
        cursor: null,
        // Cihaz vitrininde üç çerçeve aynı tarayıcıdadır; tarayıcının ana makine başına bağlantı sınırı dolmasın diye
        // sanal cihazlar uzun yoklama yerine seyrek kısa yoklama yapar (bağlantı açık tutulmaz).
        ...(virtualDevice ? { waitSec: 0, minGapMs: 20_000 } : {}),
        onEvents: (events, info) => {
          const fresh = events.map(toItem)
          const brandNew = fresh.filter((f) => !known.has(f.id))
          for (const f of fresh) known.add(f.id)
          setItems((list) => merge(list, fresh))
          setStatus('ready')
          // Eşitleme yanıtı birikmiş olaylardır; yalnızca sonradan gelen okunmamışlar duyurulur.
          const announce = info.initial ? undefined : brandNew.find((f) => !f.read)
          if (announce && !openRef.current) setToast(announce)
        },
      },
    )
    gql<{ notifications: Item[] }>('Notifications', undefined, { signal: ctrl.signal })
      .then((d) => {
        const list = (d.notifications ?? []).map(toItem)
        for (const i of list) known.add(i.id)
        setItems((cur) => merge(cur, list))
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return
        setStatus((s) => (s === 'ready' ? s : 'error'))
      })
      .finally(() => {
        if (!ctrl.signal.aborted) poller.start()
      })
    return () => {
      ctrl.abort()
      poller.stop()
    }
  }, [])

  // Bildirim balonu 5 sn sonra kaybolur
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(t)
  }, [toast])

  // Dışarı tıklayınca / Esc ile kapanır
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || layerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markRead = useCallback((ids: string[]) => {
    if (!ids.length) return
    const set = new Set(ids)
    setItems((list) => list.map((i) => (set.has(i.id) ? { ...i, read: true } : i)))
    gql<{ markNotificationsRead: boolean }, { ids: string[] }>('MarkNotificationsRead', { ids }).catch(() => {
      // Sunucu kaydedemezse yerel "okundu" durumu yine de kalır; bir sonraki listede düzelir.
    })
  }, [])

  const openItem = (item: Item) => {
    if (!item.read) markRead([item.id])
    setOpen(false)
    setToast(null)
    go(item.href)
  }

  const unread = items.filter((i) => !i.read)
  const now = Date.now()
  const label = unread.length ? `Bildirimler, ${unread.length} okunmamış` : 'Bildirimler'

  const toastEl: ReactNode =
    toast && !open ? (
      <button type="button" className="nb-toast" role="status" onClick={() => openItem(toast)}>
        <span className="nb-toast-title">{toast.title}</span>
        <span className="nb-toast-body">{toast.body}</span>
      </button>
    ) : null
  const dialog: ReactNode = (
    <div className={wide ? 'nb-pop' : 'nb-sheet'} role="dialog" aria-label="Bildirimler">
      {!wide && <div className="nb-grab" aria-hidden="true" />}
      <div className="nb-head">
        <h2 className="nb-title">Bildirimler</h2>
        <button
          type="button"
          className="nb-all"
          disabled={unread.length === 0}
          onClick={() => markRead(unread.map((u) => u.id))}
        >
          Tümünü okundu say
        </button>
      </div>
      {status === 'loading' && items.length === 0 && <p className="nb-empty">Yükleniyor…</p>}
      {status === 'error' && items.length === 0 && (
        <p className="nb-empty">Bildirimler şu an yüklenemedi. Biraz sonra yeniden denenecek.</p>
      )}
      {status === 'ready' && items.length === 0 && <p className="nb-empty">Yeni bildirim yok.</p>}
      {items.length > 0 && (
        <ul className="nb-list">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className={`nb-item${i.read ? '' : ' is-unread'}`} onClick={() => openItem(i)}>
                <span className="nb-mark" aria-hidden="true" />
                <span className="nb-text">
                  <span className="nb-item-title">
                    {i.title}
                    {!i.read && <span className="nb-sr"> (okunmadı)</span>}
                  </span>
                  <span className="nb-item-body">{i.body}</span>
                  <span className="nb-time">{relativeTime(Date.parse(i.createdAt), now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="nb-root" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="nb-bell"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setToast(null)
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={BELL_PATH_1} />
          <path d={BELL_PATH_2} />
        </svg>
        {unread.length > 0 && <span className="nb-dot" aria-hidden="true" />}
      </button>

      {wide && toastEl}
      {wide && open && dialog}
      {!wide &&
        (open || toastEl) &&
        // Telefonda alt sayfa ve balon body'ye taşınır: üst çubuğun katmanı (z 50) onları alt gezinmenin altında bırakmasın.
        createPortal(
          <div className="nb-layer" ref={layerRef}>
            {open && <div className="nb-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
            {open ? dialog : toastEl}
          </div>,
          document.body,
        )}
    </div>
  )
}
