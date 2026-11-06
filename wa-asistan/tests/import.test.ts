import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runImport } from '../src/cli/import.js'
import { parseContactsCsv, parseCsv, parseIcs, parseVcf, renderContacts, renderEvents } from '../src/profile/import.js'
import { ProfileStore } from '../src/profile/store.js'

const NOW = Date.UTC(2026, 10, 2, 9, 0)

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Ayşe Yılmaz',
  'N:Yılmaz;Ayşe;;;',
  'item1.TEL;TYPE=CELL:+90 532 111 22 33',
  'TEL;TYPE=HOME:+90 216 444 55 66',
  'EMAIL;TYPE=INTERNET:ayse@example.com',
  'ORG:Acme\\, Ltd.;Satış',
  'TITLE:Müdür',
  'BDAY:1985-03-14',
  'ADR;TYPE=HOME:;;Moda Cad. 5;Kadıköy;İstanbul;34710;Türkiye',
  'NOTE:Kardeşim. Çok uzun bir not satırı devam',
  '  ediyor ve katlanmış.\\nİkinci satır',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N:Demir;Mehmet;;;',
  'TEL:05321234567',
  'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:G=C3=BCl=',
  '=20teyze',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Banka Notu',
  'NOTE:IBAN TR33 0006 1005 1978 6457 8413 26',
  'END:VCARD',
  '',
].join('\r\n')

describe('parseVcf', () => {
  const { contacts, droppedSensitive } = parseVcf(VCF)

  it('reads names, phones, emails, org, title, birthday and address', () => {
    expect(contacts).toHaveLength(3)
    expect(contacts[0]).toMatchObject({
      name: 'Ayşe Yılmaz',
      phones: ['+90 532 111 22 33', '+90 216 444 55 66'],
      emails: ['ayse@example.com'],
      org: 'Acme, Ltd., Satış',
      title: 'Müdür',
      birthday: '1985-03-14',
      address: 'Moda Cad. 5, Kadıköy, İstanbul, 34710, Türkiye',
    })
  })
  it('unfolds long lines and unescapes \\n', () => {
    expect(contacts[0]?.note).toContain('katlanmış. İkinci satır')
  })
  it('builds the name from N when FN is missing and decodes quoted-printable', () => {
    expect(contacts[1]?.name).toBe('Mehmet Demir')
    expect(contacts[1]?.note).toBe('Gül teyze')
  })
  it('drops a sensitive note but keeps the contact', () => {
    expect(contacts[2]?.name).toBe('Banka Notu')
    expect(contacts[2]?.note).toBeUndefined()
    expect(droppedSensitive).toBe(1)
  })
})

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines inside cells', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi""\nsecond line"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"\nsecond line'],
    ])
  })
  it('detects semicolons and strips a BOM', () => {
    expect(parseCsv('﻿a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parseContactsCsv', () => {
  it('reads the Google CSV layout', () => {
    const csv = [
      'Name,Given Name,Family Name,Nickname,Birthday,Notes,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Address 1 - Formatted,Organization 1 - Name,Organization 1 - Title',
      'Ali Veli,Ali,Veli,Alo,1980-05-02,"Komşu, 3. kat",* Home,ali@example.com,Mobile,+905551112233 ::: +905559998877,"Bağdat Cad. 1\nKadıköy",Acme,Mühendis',
    ].join('\n')
    const { contacts } = parseContactsCsv(csv)
    expect(contacts[0]).toEqual({
      name: 'Ali Veli',
      nickname: 'Alo',
      phones: ['+905551112233', '+905559998877'],
      emails: ['ali@example.com'],
      org: 'Acme',
      title: 'Mühendis',
      birthday: '1980-05-02',
      address: 'Bağdat Cad. 1 Kadıköy',
      note: 'Komşu, 3. kat',
    })
  })
  it('reads the Outlook layout and skips rows without any name', () => {
    const csv = [
      'First Name,Last Name,E-mail Address,Mobile Phone,Company',
      'Zeynep,Kara,z@example.com,05320000000,Beta',
      ',,,,',
    ].join('\n')
    const { contacts } = parseContactsCsv(csv)
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      name: 'Zeynep Kara',
      phones: ['05320000000'],
      emails: ['z@example.com'],
      org: 'Beta',
    })
  })
  it('drops sensitive notes', () => {
    const r = parseContactsCsv('Name,Notes\nBanka,TC 10000000146')
    expect(r.contacts[0]?.note).toBeUndefined()
    expect(r.droppedSensitive).toBe(1)
  })
})

describe('renderContacts + ProfileStore', () => {
  it('renders one searchable section per contact', () => {
    const md = renderContacts(parseVcf(VCF).contacts)
    expect(md).toContain('### Ayşe Yılmaz')
    expect(md).toContain('- Telefon: +90 532 111 22 33, +90 216 444 55 66')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ice-'))
    fs.writeFileSync(path.join(dir, 'kisiler.md'), md)
    const ctx = new ProfileStore(dir, () => NOW).contextFor('Ayşe nin telefonu kaç')
    expect(ctx).toContain('+90 532 111 22 33')
    expect(ctx).not.toContain('Mehmet')
  })
})

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Diş randevusu',
  'DTSTART:20261104T113000Z',
  'DTEND:20261104T120000Z',
  'LOCATION:Kadıköy\\, İstanbul',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Toplantı (New York)',
  'DTSTART;TZID=America/New_York:20261105T090000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Tüm gün izin',
  'DTSTART;VALUE=DATE:20261106',
  'END:VEVENT',
  'BEGIN:VEVENT',
  "SUMMARY:Ayşe'nin doğum günü",
  'DTSTART;VALUE=DATE:20150314',
  'RRULE:FREQ=YEARLY',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Haftalık spor',
  'DTSTART:20261026T170000Z',
  'RRULE:FREQ=WEEKLY;UNTIL=20261120T000000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Eski olay',
  'DTSTART:20200101T100000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Banka IBAN TR33 0006 1005 1978 6457 8413 26',
  'DTSTART:20261110T100000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcs', () => {
  const { events, droppedSensitive } = parseIcs(ICS, { now: NOW })
  const find = (t: string) => events.filter((e) => e.title === t)

  it('converts UTC times to Istanbul local time and unescapes locations', () => {
    expect(find('Diş randevusu')).toEqual([
      { start: '2026-11-04T14:30', end: '2026-11-04T15:00', title: 'Diş randevusu', location: 'Kadıköy, İstanbul' },
    ])
  })
  it('converts other time zones', () => {
    // 09:00 New York (EST, UTC-5 on 5 Nov 2026) = 14:00 UTC = 17:00 Istanbul
    expect(find('Toplantı (New York)')[0]?.start).toBe('2026-11-05T17:00')
  })
  it('keeps all-day events as dates', () => {
    expect(find('Tüm gün izin')[0]?.start).toBe('2026-11-06')
  })
  it('expands yearly birthdays to the next occurrence', () => {
    expect(find("Ayşe'nin doğum günü").map((e) => e.start)).toEqual(
      ['2026-03-14'].filter(() => false).concat(['2027-03-14']),
    )
  })
  it('expands weekly events until UNTIL', () => {
    expect(find('Haftalık spor').map((e) => e.start.slice(0, 10))).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
  })
  it('drops past one-off events and sensitive ones, sorted by start', () => {
    expect(find('Eski olay')).toEqual([])
    expect(events.some((e) => e.title.includes('IBAN'))).toBe(false)
    expect(droppedSensitive).toBe(1)
    const starts = events.map((e) => e.start)
    expect(starts).toEqual([...starts].sort())
  })
  it('renders months and times', () => {
    const md = renderEvents(events)
    expect(md).toContain('## 2026-11')
    expect(md).toContain('- 2026-11-04 14:30 Diş randevusu (Kadıköy, İstanbul)')
    expect(md).toContain('- 2026-11-06 (tüm gün) Tüm gün izin')
  })
})

describe('runImport', () => {
  it('writes kisiler.md, backs up the old file and reports counts', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'))
    const vcf = path.join(base, 'k.vcf')
    fs.writeFileSync(vcf, VCF)
    const profile = path.join(base, 'profil')
    expect(runImport(vcf, profile, NOW)).toMatch(/3 kişi içe aktarıldı.*\n1 alan/)
    expect(fs.readFileSync(path.join(profile, 'kisiler.md'), 'utf8')).toContain('### Ayşe Yılmaz')
    runImport(vcf, profile, NOW)
    expect(fs.existsSync(path.join(profile, 'kisiler.md.eski'))).toBe(true)
  })
  it('writes takvim.md and takvim.json for .ics', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'))
    const ics = path.join(base, 't.ics')
    fs.writeFileSync(ics, ICS)
    const profile = path.join(base, 'profil')
    expect(runImport(ics, profile, NOW)).toMatch(/etkinlik içe aktarıldı/)
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'takvim.json'), 'utf8')).length).toBeGreaterThan(3)
  })
  it('explains unsupported files', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'))
    const f = path.join(base, 'x.pdf')
    fs.writeFileSync(f, 'x')
    expect(runImport(f, path.join(base, 'p'), NOW)).toContain('Desteklenmeyen')
  })
})
