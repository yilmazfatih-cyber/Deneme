/**
 * Oturum sağlayıcı: uygulamanın hangi kipte olduğunu (hesapsız / hesaplı) ve hangi veritabanını kullandığını
 * belirler; giriş, kayıt, çıkış, hesap silme işlemlerini yapar; hesaplı kipte eşitleme motorunu çalıştırır.
 *
 *   hesapsız → veritabanı `…yerel.db`, alan `local`, eşitleme yok
 *   hesaplı  → veritabanı `…kullanici.<id>.db`, eşitleme motoru + tetikleyiciler (ön plan, ağ, yazma, aralık)
 *
 * Sunucu 401 dönerse oturum "süresi dolmuş" işaretlenir: veri silinmez, yeniden giriş yapılınca bekleyen
 * değişiklikler gönderilir. Web'deki karşılığı: uygulama/web/src/lib/session/SessionProvider.tsx.
 * Genişletme: yeni bir oturum işlemi → context.ts'te `SessionApi`'ye yöntem, aşağıda `value` içinde gerçekleme.
 */
import { AppError, isAppError, type User } from '@uygulama/shared'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { t } from '../../i18n/index.ts'
import type { ThemeChoice } from '../../ui/theme.tsx'
import { setDeviceValue, type StoredSession } from '../device/deviceStore.ts'
import { isNetworkError } from '../errors.ts'
import { closeLocalDb, deleteLocalDb, LOCAL_DB_NAME, openLocalDb, userDbName } from '../store/databases.ts'
import type { LocalDb } from '../store/localDb.ts'
import { ensureClientId } from '../store/meta.ts'
import { SyncEngine, type SyncEvent } from '../sync/engine.ts'
import { attachSyncTriggers } from '../sync/triggers.ts'
import { bootSession, type BootResult } from './boot.ts'
import { SessionContext, type SessionApi, type SessionState } from './context.ts'
import { sessionServices } from './services.ts'
import { clearToken, getToken, saveToken } from './tokenStore.ts'

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [services] = useState(sessionServices)
  const [api] = useState(() => services.createApi(getToken))
  const [hub] = useState(() => new SyncEventHub())
  const [boot, setBoot] = useState<BootResult | null>(null)
  const [fatal, setFatal] = useState<Error | null>(null)
  const [session, setSession] = useState<StoredSession | null>(null)
  const [welcomeDone, setWelcomeDone] = useState(false)
  const [theme, setThemeState] = useState<ThemeChoice>('system')
  const [opened, setOpened] = useState<LocalDb | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null)

  useEffect(() => {
    bootSession(api !== null).then(
      (result) => {
        setSession(result.session)
        setWelcomeDone(result.welcomeDone)
        setThemeState(result.theme)
        setBoot(result)
      },
      (error: unknown) => setFatal(error instanceof Error ? error : new Error(String(error))),
    )
  }, [api])

  const dbName = session ? userDbName(session.userId) : LOCAL_DB_NAME
  useEffect(() => {
    if (!boot) return
    let cancelled = false
    openLocalDb(dbName).then(
      (db) => {
        if (!cancelled) setOpened(db)
      },
      (error: unknown) => setFatal(error instanceof Error ? error : new Error(String(error))),
    )
    return () => {
      cancelled = true
    }
  }, [boot, dbName])
  const db = opened?.name === dbName ? opened : null

  // Öteki veritabanına geçilince (giriş/çıkış) eskisini kapat: web'de aynı anda açık dosya sayısı sınırlı.
  useEffect(() => {
    if (!opened) return
    const name = opened.name
    return () => {
      void closeLocalDb(name)
    }
  }, [opened])

  const userId = session?.userId ?? null
  const expired = session?.expired ?? false
  const since = session?.since ?? null

  const markExpired = useCallback(async () => {
    if (!boot) return
    await clearToken()
    setSession((current) => {
      if (!current || current.expired) return current
      const next = { ...current, expired: true }
      void setDeviceValue(boot.device, 'session', next)
      return next
    })
  }, [boot])

  const engine = useMemo(() => {
    if (!api || !db || !userId || expired || since === null) return null
    return new SyncEngine({
      db,
      send: (request, signal) => api.sync(request, signal),
      onEvent: (event) => {
        if (event.type === 'unauthorized') void markExpired()
        hub.emit(event)
      },
    })
  }, [api, db, userId, expired, since, hub, markExpired])

  // Motoru tetikleyicilere bağla; oturum değişince ya da sağlayıcı kalkınca durdur.
  useEffect(() => {
    if (!engine || !db) return
    const network = services.createNetwork()
    let detach: (() => void) | null = null
    let cancelled = false
    engine.start()
    void ensureClientId(db).then((clientId) => {
      if (cancelled) return
      detach = attachSyncTriggers({ engine, db, app: services.app, network, clientId })
    })
    return () => {
      cancelled = true
      detach?.()
      engine.stop()
      network.dispose()
    }
  }, [engine, db, services])

  // Açılışta kullanıcı bilgisini tazele (ad değişmiş olabilir); 401 → oturum düşer.
  useEffect(() => {
    if (!api || !boot || !userId || expired) return
    let cancelled = false
    api.me().then(
      ({ user }) => {
        if (cancelled) return
        setSession((current) => {
          if (current?.userId !== user.id) return current
          const next = { ...current, user }
          void setDeviceValue(boot.device, 'session', next)
          return next
        })
      },
      (error: unknown) => {
        if (!cancelled && isAppError(error) && error.code === 'unauthorized') void markExpired()
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, boot, userId, expired, markExpired])

  // "Veriyi de sil" seçildiyse: arayüz öteki veritabanına geçtikten SONRA sil.
  useEffect(() => {
    if (pendingDeletion === null || pendingDeletion === db?.name) return
    void deleteLocalDb(pendingDeletion).finally(() => setPendingDeletion(null))
  }, [pendingDeletion, db])

  const value = useMemo((): SessionApi => {
    const requireApi = () => {
      if (!api) throw new AppError('not_found', t('auth.error.noServer'))
      return api
    }
    const start = async (user: User, token: string | undefined): Promise<User> => {
      if (!boot) throw new AppError('internal')
      if (!token) throw new AppError('internal', t('auth.error.noToken'))
      await saveToken(token)
      const next: StoredSession = { userId: user.id, user, expired: false, since: new Date().toISOString() }
      await setDeviceValue(boot.device, 'session', next)
      await setDeviceValue(boot.device, 'welcomeDone', true)
      setSession(next)
      setWelcomeDone(true)
      return user
    }
    const leave = async (deleteData: boolean) => {
      if (!boot || !session) return
      await clearToken()
      await setDeviceValue(boot.device, 'session', null)
      setSession(null)
      if (deleteData) setPendingDeletion(userDbName(session.userId))
    }
    let state: SessionState = { status: 'loading' }
    if (boot && db) state = session ? { status: 'account', db, session, engine } : { status: 'guest', db }
    return {
      state,
      apiEnabled: api !== null,
      welcomeDone,
      theme,
      fatal,
      login: async (input) => {
        const response = await requireApi().login(input)
        return start(response.user, response.token)
      },
      register: async (input) => {
        const response = await requireApi().register(input)
        return start(response.user, response.token)
      },
      logout: async ({ deleteLocalData }) => {
        if (api && session && !session.expired) {
          try {
            await api.logout()
          } catch (error) {
            // Çevrimdışıyken de çıkılabilir: sunucudaki oturum süresi dolunca kendiliğinden kapanır.
            if (!isNetworkError(error) && !(isAppError(error) && error.code === 'unauthorized')) throw error
          }
        }
        await leave(deleteLocalData)
      },
      deleteAccount: async (password) => {
        await requireApi().deleteAccount(password)
        await leave(true)
      },
      forgotPassword: async (email) => {
        await requireApi().forgotPassword(email)
      },
      finishWelcome: async () => {
        if (boot) await setDeviceValue(boot.device, 'welcomeDone', true)
        setWelcomeDone(true)
      },
      setTheme: async (choice) => {
        setThemeState(choice)
        if (boot) await setDeviceValue(boot.device, 'theme', choice)
      },
      subscribeSyncEvents: (listener) => hub.subscribe(listener),
    }
  }, [api, boot, db, session, engine, welcomeDone, theme, fatal, hub])

  return <SessionContext value={value}>{children}</SessionContext>
}
