import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileAccessControl, normalizeAllowPhone } from '../src/core/access.js'

const OWNER = '905321234567@s.whatsapp.net'
const OWNER_LID = '123456789012345@lid'
const FRIEND = '905559876543'
const CONFIG_PHONE = '905001112233'

let dir = ''
let file = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-access-'))
  file = path.join(dir, 'allowlist.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function make(extra: Partial<ConstructorParameters<typeof FileAccessControl>[0]> = {}): FileAccessControl {
  return new FileAccessControl({ file, ownerJids: [OWNER], configAllowedPhones: [CONFIG_PHONE], ...extra })
}

describe('owner detection', () => {
  it('matches the owner jid with or without a device suffix', () => {
    const access = make()
    expect(access.isOwner(OWNER)).toBe(true)
    expect(access.isOwner('905321234567:17@s.whatsapp.net')).toBe(true)
    expect(access.isOwner('905321234567@S.WHATSAPP.NET')).toBe(true)
    expect(access.isOwner(`${FRIEND}@s.whatsapp.net`)).toBe(false)
  })

  it('matches the lid only after addOwnerJid reports it', () => {
    const access = make()
    expect(access.isOwner(OWNER_LID)).toBe(false)
    access.addOwnerJid('123456789012345:3@lid')
    expect(access.isOwner(OWNER_LID)).toBe(true)
    expect(access.isAllowed(OWNER_LID)).toBe(true)
    expect(access.owners().jids).toEqual([OWNER_LID, OWNER])
  })

  it('matches OWNER_NUMBER by phone even before the connection reports a jid', () => {
    const access = new FileAccessControl({ file, ownerPhones: ['+90 532 123 45 67'], configAllowedPhones: [] })
    expect(access.isOwner('905321234567:2@s.whatsapp.net')).toBe(true)
    expect(access.isOwner('905321234567')).toBe(true)
    expect(access.isOwner('905321234568@s.whatsapp.net')).toBe(false)
    expect(access.owners().phones).toEqual(['905321234567'])
  })
})

describe('isAllowed', () => {
  it('allows owners, .env numbers and persisted numbers; nobody else', async () => {
    const access = make()
    await access.add(FRIEND)
    expect(access.isAllowed(OWNER)).toBe(true)
    expect(access.isAllowed(`${CONFIG_PHONE}:4@s.whatsapp.net`)).toBe(true)
    expect(access.isAllowed(`${FRIEND}@s.whatsapp.net`)).toBe(true)
    expect(access.isAllowed(FRIEND)).toBe(true)
    expect(access.isAllowed('905000000000@s.whatsapp.net')).toBe(false)
  })

  it('never allows groups, lids of strangers, status or newsletters', () => {
    const access = make()
    expect(access.isAllowed('120363012345678901@g.us')).toBe(false)
    expect(access.isAllowed('999999999999999@lid')).toBe(false)
    expect(access.isAllowed('status@broadcast')).toBe(false)
    expect(access.isAllowed('120363000000000000@newsletter')).toBe(false)
    expect(access.isAllowed('')).toBe(false)
  })
})

describe('add / remove / list', () => {
  it('normalizes the number, persists it and returns the digits', async () => {
    const access = make()
    await expect(access.add('+90 (555) 987 65 43')).resolves.toBe(FRIEND)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([FRIEND])
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)

    const again = make()
    expect(again.isAllowed(`${FRIEND}@s.whatsapp.net`)).toBe(true)
    expect(again.list()).toEqual([CONFIG_PHONE, FRIEND])
  })

  it('rejects numbers shorter than 7 digits with a Turkish message and persists nothing', async () => {
    const access = make()
    await expect(access.add('12 34')).rejects.toThrow(/rakam/)
    await expect(access.add('')).rejects.toThrow(/Örnek: 905321234567/)
    expect(fs.existsSync(file)).toBe(false)
    expect(() => normalizeAllowPhone('abc')).toThrow(/Numara/)
  })

  it('does not duplicate an existing number', async () => {
    const access = make()
    await access.add(FRIEND)
    await access.add(`+${FRIEND}`)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([FRIEND])
    expect(access.list()).toEqual([CONFIG_PHONE, FRIEND])
  })

  it('removes persisted numbers only and reports whether one existed', async () => {
    const access = make()
    await access.add(FRIEND)
    await expect(access.remove(`+${FRIEND}`)).resolves.toBe(true)
    expect(access.isAllowed(`${FRIEND}@s.whatsapp.net`)).toBe(false)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([])
    await expect(access.remove(FRIEND)).resolves.toBe(false)
    await expect(access.remove('123')).resolves.toBe(false)
    await expect(access.remove(CONFIG_PHONE)).resolves.toBe(false)
    expect(access.isAllowed(`${CONFIG_PHONE}@s.whatsapp.net`)).toBe(true)
  })

  it('never removes an owner, even when the number was added to the list', async () => {
    const access = make()
    await access.add('905321234567')
    await expect(access.remove('905321234567')).resolves.toBe(false)
    expect(access.isOwner(OWNER)).toBe(true)
    expect(access.isAllowed(OWNER)).toBe(true)
  })

  it('lists .env and persisted numbers deduped and sorted', async () => {
    const access = make({ configAllowedPhones: ['905009990000', CONFIG_PHONE] })
    await access.add(CONFIG_PHONE)
    await access.add('905000000001')
    expect(access.list()).toEqual(['905000000001', CONFIG_PHONE, '905009990000'])
  })
})

describe('allowlist file handling', () => {
  it('loads an existing file and ignores junk entries', () => {
    fs.writeFileSync(file, JSON.stringify([FRIEND, 42, '12', '+90 500 111 22 33']))
    const access = make({ configAllowedPhones: [] })
    expect(access.list()).toEqual([CONFIG_PHONE, FRIEND])
  })

  it('starts empty when the file is corrupt and moves it aside', () => {
    fs.writeFileSync(file, '[bozuk')
    const access = make()
    expect(access.list()).toEqual([CONFIG_PHONE])
    expect(fs.existsSync(file)).toBe(false)
    expect(fs.readdirSync(dir).some((n) => n.startsWith('allowlist.json.bozuk-'))).toBe(true)
  })

  it('starts empty when the file holds the wrong shape', () => {
    fs.writeFileSync(file, JSON.stringify({ not: 'an array' }))
    expect(make().list()).toEqual([CONFIG_PHONE])
  })
})
