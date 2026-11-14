/**
 * Profil yönetimi istemcisi: deviceClient'ın profil yöntemleri (shared/devices.ts "Profil yönetimi");
 * cihaz istemcisi henüz iskeletse aynı REST uçlarına doğrudan gidilir (app/deviceApi.ts).
 */
import { ROUTES } from '../../../../shared/constants'
import type { ManagedProfile, ProfilesResponse } from '../../../../shared/devices'
import { requestJson, withRestFallback } from '../../app/deviceApi'
import { deviceClient } from '../../devices/client'

export interface ProfileInput {
  name: string
  avatarKey: string
  isKids: boolean
}

const path = (guid: string) => `${ROUTES.PROFILES}/${encodeURIComponent(guid)}`

export const profilesApi = {
  list: (): Promise<ProfilesResponse> =>
    withRestFallback(
      () => deviceClient.listProfiles(),
      () => requestJson<ProfilesResponse>('GET', ROUTES.PROFILES),
    ),

  create: (input: ProfileInput): Promise<ManagedProfile> =>
    withRestFallback(
      () => deviceClient.createProfile(input),
      async () => (await requestJson<{ profile: ManagedProfile }>('POST', ROUTES.PROFILES, input)).profile,
    ),

  /** pin: 4 hane → kilit kurulur / değişir · null → kilit kalkar · undefined → dokunulmaz */
  update: (
    guid: string,
    input: { name?: string; avatarKey?: string; isKids?: boolean; pin?: string | null },
  ): Promise<ManagedProfile> =>
    withRestFallback(
      () => deviceClient.updateProfile(guid, input),
      async () => (await requestJson<{ profile: ManagedProfile }>('PATCH', path(guid), input)).profile,
    ),

  remove: (guid: string): Promise<void> =>
    withRestFallback(
      () => deviceClient.deleteProfile(guid),
      async () => {
        await requestJson<null>('DELETE', path(guid))
      },
    ),
}

/** Sunucu hata iletisini (varsa) kullanıcı metnine çevirir. */
export function profileErrorText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.name === 'ApiRequestError' && err.message) return err.message
  return fallback
}
