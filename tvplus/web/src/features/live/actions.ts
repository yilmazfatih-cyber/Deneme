/**
 * Canlı TV ve Rehber'in yan etkili eylemleri: favori kanal, yayın hatırlatması, son kanal, TV'de izle.
 * Her eylem iyimserdir (overrides.ts), olay günlüğüne `tctx` ile yazılır ve devbus'a bildirilir.
 */
import { useSyncExternalStore } from 'react'
import { gql } from '../../api/graphql'
import { onBootChange, peekBoot } from '../../api/session'
import { isCastAvailable, requestCast, subscribeCastAvailable } from '../../devices/bridge'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { toast } from '../../ui'
import { createOverrideStore, effectiveValue, isPending, useOverrides } from './overrides'

export const favoriteStore = createOverrideStore()
export const reminderStore = createOverrideStore()

// Profil değişince başka profilin iyimser değerleri taşınmasın.
let lastProfile = peekBoot()?.activeProfile?.guid ?? null
onBootChange((b) => {
  const guid = b.activeProfile?.guid ?? null
  if (guid === lastProfile) return
  lastProfile = guid
  favoriteStore.dispatch({ type: 'reset' })
  reminderStore.dispatch({ type: 'reset' })
})

/* ───────────── Yenileme aboneleri ───────────── */

const refreshers = new Set<() => void>()
/** Bir eylem sunucuda onaylanınca yeniden çekilecek sorgular (Canlı TV sayfası, Hatırlatmalar) kendini kaydeder. */
export function onLiveDataChanged(fn: () => void): () => void {
  refreshers.add(fn)
  return () => {
    refreshers.delete(fn)
  }
}
const notifyChanged = () => {
  for (const fn of refreshers) fn()
}

/* ───────────── Favori kanal ───────────── */

export interface FavoriteTarget {
  channelId: number
  name: string
  isFavorite: boolean
  unifiedEntityId?: string
}

const favKey = (channelId: number) => String(channelId)

/** Kanalın favori durumu (iyimser değer dahil) ve bekleyen istek. */
export function useFavorite(channelId: number, server: boolean): { on: boolean; busy: boolean } {
  const s = useOverrides(favoriteStore)
  return { on: effectiveValue(s, favKey(channelId), server), busy: isPending(s, favKey(channelId)) }
}

/** Favori değerini okuyucu (satır hesapları için). */
export function useFavoriteResolver(): (channelId: number, server: boolean) => boolean {
  const s = useOverrides(favoriteStore)
  return (channelId, server) => effectiveValue(s, favKey(channelId), server)
}

export function toggleFavorite(ch: FavoriteTarget, surface: string, tctx?: string | null): void {
  const key = favKey(ch.channelId)
  const previous = effectiveValue(favoriteStore.get(), key, ch.isFavorite)
  const next = !previous
  favoriteStore.dispatch({ type: 'request', key, value: next })
  logEvent(
    'click',
    { surface, action: next ? 'kanal-ekle' : 'kanal-cikar', entityId: ch.unifiedEntityId ?? `Channel:${ch.channelId}` },
    tctx,
  )
  gql<{ toggleFavoriteChannel: { channelId: number; isFavorite: boolean } }, { channelId: number }>(
    'ToggleFavoriteChannel',
    { channelId: ch.channelId },
  ).then(
    (res) => {
      const fav = res.toggleFavoriteChannel.isFavorite
      favoriteStore.dispatch({ type: 'confirm', key, value: fav })
      toast(fav ? `${ch.name} Kanallarım'a eklendi` : `${ch.name} Kanallarım'dan çıkarıldı`, { kind: 'success' })
      notifyChanged()
    },
    () => {
      favoriteStore.dispatch({ type: 'fail', key, previous })
      toast('Kanal listesi güncellenemedi. Tekrar dene.', { kind: 'error' })
    },
  )
}

/* ───────────── Hatırlatma ───────────── */

export interface ReminderTarget {
  airingId: string
  title: string
  startAt: string
  hasReminder?: boolean
  unifiedEntityId?: string
}

export function useReminder(airingId: string, server: boolean | undefined): { on: boolean; busy: boolean } {
  const s = useOverrides(reminderStore)
  return { on: effectiveValue(s, airingId, server ?? false), busy: isPending(s, airingId) }
}

export function useReminderResolver(): (airingId: string, server: boolean | undefined) => boolean {
  const s = useOverrides(reminderStore)
  return (airingId, server) => effectiveValue(s, airingId, server ?? false)
}

/** Hatırlatmayı kurar ya da kaldırır (`enabled` verilmezse tersine çevirir). */
export function setReminder(a: ReminderTarget, surface: string, tctx?: string | null, enabled?: boolean): void {
  const key = a.airingId
  const previous = effectiveValue(reminderStore.get(), key, a.hasReminder ?? false)
  const next = enabled ?? !previous
  if (next === previous && !isPending(reminderStore.get(), key)) return
  reminderStore.dispatch({ type: 'request', key, value: next })
  logEvent(
    'click',
    { surface, action: next ? 'hatirlat' : 'hatirlatma-kaldir', entityId: a.unifiedEntityId ?? `Airing:${a.airingId}` },
    tctx,
  )
  gql<{ setReminder: { airingId: string; hasReminder: boolean } | null }, { airingId: string; enabled: boolean }>(
    'SetReminder',
    { airingId: a.airingId, enabled: next },
  ).then(
    (res) => {
      const on = res.setReminder?.hasReminder ?? next
      reminderStore.dispatch({ type: 'confirm', key, value: on })
      devbus.emit('cache', `Hatırlatma ${on ? 'kuruldu' : 'kaldırıldı'}`, { airingId: a.airingId, surface })
      toast(on ? `${a.title}: hatırlatma kuruldu` : `${a.title}: hatırlatma kaldırıldı`, {
        kind: 'success',
        action: { label: 'Geri Al', onClick: () => setReminder({ ...a, hasReminder: on }, surface, tctx, !on) },
      })
      notifyChanged()
    },
    () => {
      reminderStore.dispatch({ type: 'fail', key, previous })
      toast('Hatırlatma kaydedilemedi. Tekrar dene.', { kind: 'error' })
    },
  )
}

/**
 * Hatırlatmayı başka bir ekrandan (TV+'ım) kurar ya da kaldırır. Aynı iyimser depoya yazar; böylece Rehber ve
 * Canlı TV aynı oturumda doğru durumu gösterir (sorgu önbellekleri dolmadan). Bildirim ve olay günlüğü çağırana aittir.
 * Sonuç: sunucunun onayladığı değer; hata olursa depo önceki değerine döner ve hata çağırana iletilir.
 */
export async function applyReminder(airingId: string, enabled: boolean): Promise<boolean> {
  const key = airingId
  const previous = effectiveValue(reminderStore.get(), key, !enabled)
  reminderStore.dispatch({ type: 'request', key, value: enabled })
  try {
    const res = await gql<
      { setReminder: { airingId: string; hasReminder: boolean } | null },
      { airingId: string; enabled: boolean }
    >('SetReminder', { airingId, enabled })
    const on = res.setReminder?.hasReminder ?? enabled
    reminderStore.dispatch({ type: 'confirm', key, value: on })
    devbus.emit('cache', `Hatırlatma ${on ? 'kuruldu' : 'kaldırıldı'}`, { airingId, surface: 'tvplusim' })
    notifyChanged()
    return on
  } catch (err) {
    reminderStore.dispatch({ type: 'fail', key, previous })
    throw err
  }
}

/* ───────────── Son kanal ───────────── */

/** İzlemeye başlanan kanal profilin "son kanalı" olur (Canlı TV vitrini ona açılır). Sessizce dener. */
export function rememberChannel(channelId: number): void {
  gql<{ setLastChannel: boolean }, { channelId: number }>('SetLastChannel', { channelId }).catch(() => {
    /* vitrin bir sonraki açılışta önceki kanalda kalır; kullanıcıya gösterilecek bir hata değil */
  })
}

/* ───────────── TV'de izle ───────────── */

/** Yansıtılabilecek bir cihaz çevrimiçi mi (simge ve düğme buna göre görünür). */
export function useCastAvailable(): boolean {
  return useSyncExternalStore(subscribeCastAvailable, isCastAvailable, () => false)
}

export interface CastTarget {
  channelId: number
  name: string
  programme?: string | null
}

/** Canlı kanalı TV'de açar: tek dokunuş, cihaz seçici devices ekibinin. */
export function castChannel(ch: CastTarget, surface: string, tctx?: string | null): void {
  const viewableId = `Channel:${ch.channelId}`
  logEvent('click', { surface, action: 'tvde-izle', entityId: viewableId }, tctx)
  devbus.emit('device', "TV'de izle isteği", { viewableId, surface })
  const ok = requestCast({
    viewableId,
    title: ch.programme ? `${ch.name} · ${ch.programme}` : ch.name,
    tctx: tctx ?? undefined,
  })
  if (ok) rememberChannel(ch.channelId)
  else toast("Şu an TV'ye bağlanılamıyor. Biraz sonra tekrar dene.")
}
