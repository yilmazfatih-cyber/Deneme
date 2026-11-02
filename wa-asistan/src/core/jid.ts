/**
 * WhatsApp JID helpers. Pure string functions, no Baileys import, so the handler and the
 * access layer can be tested without the WhatsApp stack.
 *
 * Shapes seen in the wild:
 *   905321234567@s.whatsapp.net        phone user
 *   905321234567:12@s.whatsapp.net     phone user, device 12
 *   905321234567_3:12@s.whatsapp.net   phone user, agent 3, device 12 (rare)
 *   123456789012345@lid                "linked id" user (privacy mode); no phone inside
 *   120363012345678901@g.us            group
 *   status@broadcast, 1234@broadcast, 1234@newsletter
 */

const USER_SERVER = 's.whatsapp.net'

/** Splits a jid into user and (lowercased) server. Returns undefined when there is no '@'. */
function split(jid: string): { user: string; server: string } | undefined {
  const at = jid.lastIndexOf('@')
  if (at < 0) return undefined
  return { user: jid.slice(0, at), server: jid.slice(at + 1).toLowerCase() }
}

/**
 * Drops the device (`:12`) and agent (`_3`) parts, lowercases the server and maps the legacy
 * `c.us` server to `s.whatsapp.net` (same result as Baileys' `jidNormalizedUser`).
 * Returns '' for falsy input. Input without '@' is returned trimmed, untouched.
 */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) return ''
  const trimmed = jid.trim()
  const parts = split(trimmed)
  if (!parts) return trimmed
  const [userAndAgent = ''] = parts.user.split(':')
  const [user = ''] = userAndAgent.split('_')
  const server = parts.server === 'c.us' ? USER_SERVER : parts.server
  return `${user}@${server}`
}

function serverOf(jid: string): string {
  return split(normalizeJid(jid))?.server ?? ''
}

export function isGroupJid(jid: string): boolean {
  return serverOf(jid) === 'g.us'
}

export function isLidJid(jid: string): boolean {
  return serverOf(jid) === 'lid'
}

/** A person: phone jid or linked-id jid. */
export function isUserJid(jid: string): boolean {
  const server = serverOf(jid)
  return server === USER_SERVER || server === 'lid'
}

/** Status updates, broadcast lists and channels; the bot never answers these. */
export function isBroadcastOrNewsletter(jid: string): boolean {
  const server = serverOf(jid)
  return server === 'broadcast' || server === 'newsletter'
}

/** `905321234567` → `905321234567@s.whatsapp.net`. Non-digits are dropped; throws when nothing is left. */
export function phoneToJid(phoneDigits: string): string {
  const digits = (phoneDigits ?? '').replace(/\D+/g, '')
  if (!digits) throw new Error('Telefon numarası boş olamaz. Ülke koduyla, yalnızca rakam yazın.')
  return `${digits}@${USER_SERVER}`
}

/** Digits of a phone jid; undefined for lid, group and everything else. */
export function jidToPhone(jid: string): string | undefined {
  const parts = split(normalizeJid(jid))
  if (!parts || parts.server !== USER_SERVER) return undefined
  return /^\d+$/.test(parts.user) ? parts.user : undefined
}

/** True when both jids point at the same user after normalization (device suffixes ignored). */
export function sameUser(a: string, b: string): boolean {
  const na = normalizeJid(a)
  return na !== '' && na === normalizeJid(b)
}
