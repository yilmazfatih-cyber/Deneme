/**
 * Oturum sağlayıcı: uygulamanın hangi kipte olduğunu (hesapsız / hesaplı) ve hangi veritabanını kullandığını
 * belirler; giriş, kayıt, çıkış, hesap silme işlemlerini yapar; hesaplı kipte eşitleme motorunu çalıştırır.
 *
 *   hesapsız → veritabanı `…yerel`, alan `local`, eşitleme yok
 *   hesaplı  → veritabanı `…kullanici.<id>`, eşitleme motoru + tetikleyiciler + anlık bildirim
 *
 * Oturum kaydı ayrı bir IndexedDB'dedir (store.ts) ve canlı izlenir: başka sekmede giriş/çıkış yapılınca bu sekme
 * de kendiliğinden geçer. Sunucu 401 dönerse oturum "süresi dolmuş" işaretlenir; veri silinmez, yeniden giriş
 * yapılınca bekleyen değişiklikler gönderilir.
 *
 * Genişletme: yeni bir oturum işlemi → `SessionApi`'ye yöntem ekleyin ve aşağıda gerçekleyin.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppError, isAppError, type LoginRequest, type RegisterRequest, type User } from '@uygulama/shared'
import { t } from '../../i18n/index.ts'
import { ApiClient } from '../api.ts'
import { API_CONFIG } from '../env.ts'
import { isNetworkError } from '../errors.ts'
import { deleteDb, LOCAL_DB_NAME, openDb, userDbName } from '../store/db.ts'
import { ensureClientId } from '../store/meta.ts'
import { SyncEngine, type SyncEvent } from '../sync/engine.ts'
import { connectPokeStream } from '../sync/events.ts'
import { attachSyncTriggers } from '../sync/triggers.ts'
import { SessionContext, type SessionApi, type SessionState } from './context.ts'
import {
  clearSession,
  getToken,
  readSession,
  readWelcomeDone,
  writeSession,
  writeWelcomeDone,
  type StoredSession,
} from './store.ts'

function createDefaultApi(): ApiClient | null {
  if (!API_CONFIG.enabled) return null
  return new ApiClient({ baseUrl: API_CONFIG.baseUrl, authMode: API_CONFIG.authMode, getToken })
}

/** Eşitleme olaylarının dinleyicileri (bildirim bileşenleri abone olur). */
class SyncEventHub {
  private readonly listeners = new Set<(event: SyncEvent) => void>()
  emit(event: SyncEvent): void {
    for (const listener of this.listeners) listener(event)
  }
  subscribe(listener: (event: SyncEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

async function markExpired(): Promise<void> {
  const current = await readSession()
  if (current && !current.expired) await writeSession({ ...current, expired: true, token: null })
}

/**
 * Canlı okunan değer + iyimser yerel güncelleme. Bu sekmede yazınca (giriş, çıkış) yeni değer HEMEN kullanılır;
 * veritabanından gelen sonraki değer (bu sekmenin ya da başka sekmenin yazdığı) onu geçersiz kılar.
 * Böylece "giriş yap → hemen yönlendir" sırasında eski oturum bir an bile görünmez.
 */
function useOptimisticLive<T>(querier: () => Promise<T>): [T | undefined, (value: T) => void] {
  const live = useLiveQuery(querier, [])
  const [override, setOverride] = useState<{ readonly value: T; readonly base: T | undefined } | null>(null)
  const value = override !== null && override.base === live ? override.value : live
  const set = useCallback((next: T) => setOverride({ value: next, base: live }), [live])
  return [value, set]
}

export interface SessionProviderProps {
  readonly children: ReactNode
  /** Test için: API istemcisi (`null` → hesapsız kip). Verilmezse ortam ayarından kurulur. */
  readonly api?: ApiClient | null
}

export function SessionProvider({ children, api: apiProp }: SessionProviderProps) {
  const api = useMemo(() => (apiProp === undefined ? createDefaultApi() : apiProp), [apiProp])
  const [stored, setStored] = useOptimisticLive(readSession)
  const [welcomeDone, setWelcomeDone] = useOptimisticLive(readWelcomeDone)
  const session: StoredSession | null = api ? (stored ?? null) : null
  const userId = session?.userId ?? null
  const expired = session?.expired ?? false
  const since = session?.since ?? null
  const db = useMemo(() => openDb(userId ? userDbName(userId) : LOCAL_DB_NAME), [userId])
  const [hub] = useState(() => new SyncEventHub())
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null)
  const [loggedOut, setLoggedOut] = useState(false)

  const engine = useMemo(() => {
    if (!api || !userId || expired || since === null) return null
    return new SyncEngine({
      db,
      send: (request, signal) => api.sync(request, signal),
      onEvent: (event) => {
        if (event.type === 'unauthorized') void markExpired()
        hub.emit(event)
      },
    })
  }, [api, db, userId, expired, since, hub])

  // Eşitleme motorunu tetikleyicilere bağla; oturum değişince ya da bileşen kalkınca durdur.
  useEffect(() => {
    if (!engine || !api) return
    engine.start()
    let detach: (() => void) | null = null
    let cancelled = false
    void ensureClientId(db).then((clientId) => {
      if (cancelled) return
      detach = attachSyncTriggers({
        engine,
        db,
        clientId,
        connectPokes: (onPoke) => connectPokeStream({ api, onPoke, onUnauthorized: () => void markExpired() }),
      })
    })
    return () => {
      cancelled = true
      detach?.()
      engine.stop()
    }
  }, [engine, db, api])

  // Açılışta kullanıcı bilgisini tazele (ad değişmiş olabilir); 401 → oturum düşer.
  useEffect(() => {
    if (!api || !userId || expired) return
    let cancelled = false
    api.me().then(
      async ({ user }) => {
        const current = await readSession()
        if (!cancelled && current?.userId === user.id) await writeSession({ ...current, user })
      },
      (error: unknown) => {
        if (!cancelled && isAppError(error) && error.code === 'unauthorized') void markExpired()
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, userId, expired])

  // Çıkışta "veriyi de sil" seçildiyse: arayüz öteki veritabanına geçtikten SONRA sil.
  useEffect(() => {
    if (pendingDeletion === null || pendingDeletion === db.name) return
    void deleteDb(pendingDeletion).finally(() => setPendingDeletion(null))
  }, [pendingDeletion, db])

  const startSession = useCallback(
    async (user: User, token: string | undefined): Promise<User> => {
      if (api?.authMode === 'token' && !token) throw new AppError('internal', t('auth.error.noToken'))
      const since = new Date().toISOString()
      const next: StoredSession = { userId: user.id, user, token: token ?? null, expired: false, since }
      await writeSession(next)
      await writeWelcomeDone()
      setStored(next)
      setWelcomeDone(true)
      setLoggedOut(false)
      return user
    },
    [api, setStored, setWelcomeDone],
  )

  const requireApi = useCallback((): ApiClient => {
    if (!api) throw new AppError('not_found', t('auth.error.noServer'))
    return api
  }, [api])

  const value = useMemo((): SessionApi => {
    const state: SessionState =
      api && stored === undefined
        ? { status: 'loading' }
        : session
          ? { status: 'account', db, session, engine }
          : { status: 'guest', db }
    return {
      state,
      api,
      welcomeDone,
      loggedOut,
      login: async (input: LoginRequest) => {
        const response = await requireApi().login(input)
        return startSession(response.user, response.token)
      },
      register: async (input: RegisterRequest) => {
        const response = await requireApi().register(input)
        return startSession(response.user, response.token)
      },
      logout: async ({ deleteLocalData, everywhere = false }) => {
        const current = await readSession()
        if (!current) return
        if (api && !current.expired) {
          try {
            await (everywhere ? api.logoutAll() : api.logout())
          } catch (error) {
            const ignorable = isNetworkError(error) || (isAppError(error) && error.code === 'unauthorized')
            if (everywhere || !ignorable) throw error
          }
        }
        await clearSession()
        setLoggedOut(true)
        setStored(null)
        if (deleteLocalData) setPendingDeletion(userDbName(current.userId))
      },
      deleteAccount: async (password: string) => {
        const current = await readSession()
        await requireApi().deleteAccount(password)
        await clearSession()
        setLoggedOut(true)
        setStored(null)
        if (current) setPendingDeletion(userDbName(current.userId))
      },
      updateUser: async (user: User) => {
        const current = await readSession()
        if (current?.userId !== user.id) return
        const next = { ...current, user }
        await writeSession(next)
        setStored(next)
      },
      finishWelcome: async () => {
        await writeWelcomeDone()
        setWelcomeDone(true)
      },
      subscribeSyncEvents: (listener) => hub.subscribe(listener),
    }
  }, [
    api,
    stored,
    session,
    db,
    engine,
    welcomeDone,
    loggedOut,
    requireApi,
    startSession,
    hub,
    setStored,
    setWelcomeDone,
  ])

  return <SessionContext value={value}>{children}</SessionContext>
}
