/** Kimlik deposunun kayıt biçimleri (plugin ve profil uçları paylaşır). */
import type { AccountRecord, ProfileRecord } from '../../kernel/context'
import type { PinHash } from './pin'

/** Depodaki profil: sözleşmedeki kayıt + kilit özeti (dışarı hiç verilmez) */
export interface StoredProfile extends ProfileRecord {
  pin?: PinHash | null
}

export interface IdentityState {
  accounts: AccountRecord[]
  profiles: StoredProfile[]
  /** deviceId → uzaktan çıkış anı (epoch ms) */
  revokedDevices?: Record<string, number>
}

/** Dışarı verilen kayıt: PIN özeti ayıklanır */
export function publicProfile(p: StoredProfile): ProfileRecord {
  return {
    guid: p.guid,
    accountId: p.accountId,
    name: p.name,
    avatar: p.avatar,
    isKids: p.isKids,
    maturityLevel: p.maturityLevel,
    language: p.language,
  }
}
