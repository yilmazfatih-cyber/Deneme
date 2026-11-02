/**
 * Who gets an answer. Owner = the linked WhatsApp account (phone jid and, when present, lid jid)
 * plus OWNER_NUMBER. Allowed = owners + ALLOWED_NUMBERS + numbers added at runtime with
 * `/izin ekle`, persisted as a JSON array of digit strings. Strangers are never allowed.
 */
import { jidToPhone, normalizeJid } from './jid.js'
import type { AccessControl } from './types.js'
import { atomicWriteJson, readJsonSync } from '../store/files.js'

export const MIN_PHONE_DIGITS = 7

export interface FileAccessControlOptions {
  /** allowlist file, a JSON array of digit strings */
  file: string
  /** jids of the linked account, when already known */
  ownerJids?: string[]
  /** OWNER_NUMBER and friends, digits only */
  ownerPhones?: string[]
  /** ALLOWED_NUMBERS from .env (read-only here) */
  configAllowedPhones: string[]
}

/** `+90 (532) 123 45 67` → `905321234567`; throws (in Turkish) when too short to be a phone. */
export function normalizeAllowPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (digits.length < MIN_PHONE_DIGITS) {
    throw new Error('Numara ülke koduyla, yalnızca rakamlardan oluşmalı. Örnek: 905321234567')
  }
  return digits
}

function digitsOrUndefined(raw: string): string | undefined {
  const digits = (raw ?? '').replace(/\D+/g, '')
  return digits.length >= MIN_PHONE_DIGITS ? digits : undefined
}

/** Phone digits of a jid; a bare digit string is accepted as a phone too. */
function phoneOf(jid: string): string | undefined {
  const fromJid = jidToPhone(jid)
  if (fromJid) return fromJid
  const trimmed = (jid ?? '').trim()
  return /^\d+$/.test(trimmed) && trimmed.length >= MIN_PHONE_DIGITS ? trimmed : undefined
}

function loadPersisted(file: string): Set<string> {
  const raw = readJsonSync<unknown>(file, [])
  const out = new Set<string>()
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const digits = digitsOrUndefined(item)
    if (digits) out.add(digits)
  }
  return out
}

export class FileAccessControl implements AccessControl {
  private readonly file: string
  private readonly ownerJids = new Set<string>()
  private readonly ownerPhones = new Set<string>()
  private readonly configPhones = new Set<string>()
  private readonly persisted: Set<string>

  constructor(opts: FileAccessControlOptions) {
    this.file = opts.file
    for (const jid of opts.ownerJids ?? []) this.addOwnerJid(jid)
    for (const phone of opts.ownerPhones ?? []) {
      const digits = digitsOrUndefined(phone)
      if (digits) this.ownerPhones.add(digits)
    }
    for (const phone of opts.configAllowedPhones) {
      const digits = digitsOrUndefined(phone)
      if (digits) this.configPhones.add(digits)
    }
    this.persisted = loadPersisted(this.file)
  }

  /** Called once the connection reports the account's jid and lid. */
  addOwnerJid(jid: string): void {
    const normalized = normalizeJid(jid)
    if (!normalized) return
    this.ownerJids.add(normalized)
    const phone = jidToPhone(normalized)
    if (phone) this.ownerPhones.add(phone)
  }

  owners(): { jids: string[]; phones: string[] } {
    return { jids: [...this.ownerJids].sort(), phones: [...this.ownerPhones].sort() }
  }

  isOwner(jid: string): boolean {
    const normalized = normalizeJid(jid)
    if (normalized && this.ownerJids.has(normalized)) return true
    const phone = phoneOf(jid)
    return phone !== undefined && this.ownerPhones.has(phone)
  }

  isAllowed(jid: string): boolean {
    if (this.isOwner(jid)) return true
    const phone = phoneOf(jid)
    if (!phone) return false
    return this.configPhones.has(phone) || this.persisted.has(phone)
  }

  list(): string[] {
    return [...new Set([...this.configPhones, ...this.persisted])].sort()
  }

  private persistNow(): Promise<void> {
    return atomicWriteJson(this.file, [...this.persisted].sort())
  }

  async add(phone: string): Promise<string> {
    const digits = normalizeAllowPhone(phone)
    if (!this.persisted.has(digits)) {
      this.persisted.add(digits)
      await this.persistNow()
    }
    return digits
  }

  /** Owners and .env numbers are never removed here; returns true only when a persisted number was dropped. */
  async remove(phone: string): Promise<boolean> {
    const digits = digitsOrUndefined(phone)
    if (!digits) return false
    if (this.ownerPhones.has(digits)) return false
    if (!this.persisted.has(digits)) return false
    this.persisted.delete(digits)
    await this.persistNow()
    return true
  }
}
