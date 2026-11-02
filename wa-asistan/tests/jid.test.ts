import { describe, expect, it } from 'vitest'
import {
  isBroadcastOrNewsletter,
  isGroupJid,
  isLidJid,
  isUserJid,
  jidToPhone,
  normalizeJid,
  phoneToJid,
  sameUser,
} from '../src/core/jid.js'

describe('normalizeJid', () => {
  it('strips the device suffix from phone jids', () => {
    expect(normalizeJid('905321234567:12@s.whatsapp.net')).toBe('905321234567@s.whatsapp.net')
    expect(normalizeJid('905321234567@s.whatsapp.net')).toBe('905321234567@s.whatsapp.net')
  })

  it('strips device and agent parts from lid and group jids', () => {
    expect(normalizeJid('123456789012345:3@lid')).toBe('123456789012345@lid')
    expect(normalizeJid('123456789012345_2:3@lid')).toBe('123456789012345@lid')
    expect(normalizeJid('120363012345678901:1@g.us')).toBe('120363012345678901@g.us')
  })

  it('lowercases the server and maps legacy c.us', () => {
    expect(normalizeJid('905321234567@S.WHATSAPP.NET')).toBe('905321234567@s.whatsapp.net')
    expect(normalizeJid('905321234567@c.us')).toBe('905321234567@s.whatsapp.net')
    expect(normalizeJid('  905321234567@LID ')).toBe('905321234567@lid')
  })

  it('returns empty for falsy input and leaves text without @ untouched', () => {
    expect(normalizeJid('')).toBe('')
    expect(normalizeJid(undefined)).toBe('')
    expect(normalizeJid(null)).toBe('')
    expect(normalizeJid('905321234567')).toBe('905321234567')
  })
})

describe('kind predicates', () => {
  it('recognizes groups, lids and users', () => {
    expect(isGroupJid('120363012345678901@g.us')).toBe(true)
    expect(isGroupJid('905321234567@s.whatsapp.net')).toBe(false)
    expect(isLidJid('123@lid')).toBe(true)
    expect(isLidJid('123@g.us')).toBe(false)
    expect(isUserJid('905321234567:5@s.whatsapp.net')).toBe(true)
    expect(isUserJid('123@lid')).toBe(true)
    expect(isUserJid('123@g.us')).toBe(false)
    expect(isUserJid('status@broadcast')).toBe(false)
    expect(isUserJid('')).toBe(false)
  })

  it('recognizes status, broadcast lists and newsletters', () => {
    expect(isBroadcastOrNewsletter('status@broadcast')).toBe(true)
    expect(isBroadcastOrNewsletter('1234567890@broadcast')).toBe(true)
    expect(isBroadcastOrNewsletter('120363000000000000@newsletter')).toBe(true)
    expect(isBroadcastOrNewsletter('905321234567@s.whatsapp.net')).toBe(false)
    expect(isBroadcastOrNewsletter('120363012345678901@g.us')).toBe(false)
  })
})

describe('phone <-> jid', () => {
  it('builds a phone jid from digits and tolerates formatting', () => {
    expect(phoneToJid('905321234567')).toBe('905321234567@s.whatsapp.net')
    expect(phoneToJid('+90 532 123 45 67')).toBe('905321234567@s.whatsapp.net')
  })

  it('throws a Turkish error on empty input', () => {
    expect(() => phoneToJid('')).toThrow(/Telefon numarası/)
    expect(() => phoneToJid('abc')).toThrow(/Telefon numarası/)
  })

  it('extracts digits only from phone jids', () => {
    expect(jidToPhone('905321234567:7@s.whatsapp.net')).toBe('905321234567')
    expect(jidToPhone('905321234567@c.us')).toBe('905321234567')
    expect(jidToPhone('123456789012345@lid')).toBeUndefined()
    expect(jidToPhone('120363012345678901@g.us')).toBeUndefined()
    expect(jidToPhone('status@broadcast')).toBeUndefined()
    expect(jidToPhone('')).toBeUndefined()
    expect(jidToPhone('905321234567')).toBeUndefined()
  })
})

describe('sameUser', () => {
  it('ignores device suffix and server case', () => {
    expect(sameUser('905321234567:12@s.whatsapp.net', '905321234567@S.whatsapp.net')).toBe(true)
    expect(sameUser('123@lid', '123:4@lid')).toBe(true)
  })

  it('does not confuse lid with phone or empty with empty', () => {
    expect(sameUser('905321234567@s.whatsapp.net', '905321234567@lid')).toBe(false)
    expect(sameUser('905321234567@s.whatsapp.net', '905321234568@s.whatsapp.net')).toBe(false)
    expect(sameUser('', '')).toBe(false)
  })
})
