/**
 * Importers for the personal profile: vCard (.vcf), Google/Outlook contacts CSV, iCalendar (.ics).
 * Pure functions (text in, structures out) so they are testable without files.
 *
 * Header names of the Google/Outlook CSV exports were matched by pattern from documented formats; they could not be
 * checked against a 2026 export from this environment, which is why the matching is deliberately loose.
 */
import { clip } from '../core/text.js'
import type { CalendarEvent } from './store.js'
import { findSensitive } from './sensitive.js'

export interface Contact {
  name: string
  nickname?: string
  phones: string[]
  emails: string[]
  org?: string
  title?: string
  birthday?: string
  address?: string
  note?: string
}

export interface ImportReport {
  /** values left out because they looked like a password, TC kimlik no, IBAN or card number */
  droppedSensitive: number
}

// ---------- shared helpers -----------------------------------------------------------------------------------

function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

function unescapeValue(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function qpDecode(v: string): string {
  const bytes: number[] = []
  for (let i = 0; i < v.length; i++) {
    const m = /^=([0-9A-Fa-f]{2})/.exec(v.slice(i, i + 3))
    if (v[i] === '=' && m) {
      bytes.push(parseInt(m[1]!, 16))
      i += 2
    } else {
      bytes.push(...Buffer.from(v[i]!, 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

interface Prop {
  name: string
  params: string[]
  value: string
}

function parseProp(line: string): Prop | undefined {
  const colon = line.indexOf(':')
  if (colon < 1) return undefined
  const head = line.slice(0, colon).split(';')
  const raw = head[0]!.replace(/^[\w-]+\./, '').toUpperCase() // drop "item1." group prefix
  const params = head.slice(1).map((p) => p.toUpperCase())
  let value = line.slice(colon + 1)
  if (params.some((p) => p.includes('QUOTED-PRINTABLE'))) value = qpDecode(value)
  return { name: raw, params, value }
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]

// ---------- vCard --------------------------------------------------------------------------------------------

export function parseVcf(text: string): { contacts: Contact[] } & ImportReport {
  // quoted-printable soft line breaks end with '='
  const lines = unfold(text.replace(/=\r?\n/g, ''))
  const contacts: Contact[] = []
  let dropped = 0
  let cur: Contact | undefined
  const keep = (v: string | undefined): string | undefined => {
    if (!v) return undefined
    if (findSensitive(v)) {
      dropped++
      return undefined
    }
    return v
  }
  for (const line of lines) {
    const p = parseProp(line)
    if (!p) continue
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VCARD') {
      cur = { name: '', phones: [], emails: [] }
      continue
    }
    if (p.name === 'END' && p.value.toUpperCase() === 'VCARD') {
      if (cur) {
        if (!cur.name) cur.name = cur.org ?? cur.emails[0] ?? cur.phones[0] ?? ''
        if (cur.name) contacts.push({ ...cur, phones: uniq(cur.phones), emails: uniq(cur.emails) })
      }
      cur = undefined
      continue
    }
    if (!cur) continue
    switch (p.name) {
      case 'FN':
        cur.name = unescapeValue(p.value).trim()
        break
      case 'N': {
        if (!cur.name) {
          const [family, given, additional] = p.value.split(';').map((x) => unescapeValue(x).trim())
          cur.name = [given, additional, family].filter(Boolean).join(' ')
        }
        break
      }
      case 'NICKNAME':
        cur.nickname = unescapeValue(p.value).trim() || undefined
        break
      case 'TEL':
        cur.phones.push(p.value.replace(/^tel:/i, '').trim())
        break
      case 'EMAIL':
        cur.emails.push(unescapeValue(p.value))
        break
      case 'ORG':
        cur.org = unescapeValue(p.value.split(';').filter(Boolean).join(', ')).trim() || undefined
        break
      case 'TITLE':
        cur.title = unescapeValue(p.value).trim() || undefined
        break
      case 'BDAY': {
        const d = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(p.value.trim())
        if (d) cur.birthday = `${d[1]}-${d[2]}-${d[3]}`
        break
      }
      case 'ADR': {
        const a = p.value
          .split(';')
          .map((x) => unescapeValue(x).trim())
          .filter(Boolean)
          .join(', ')
        const safe = keep(a)
        if (safe) cur.address = safe
        break
      }
      case 'NOTE': {
        const safe = keep(unescapeValue(p.value).replace(/\s+/g, ' ').trim())
        if (safe) cur.note = clip(safe, 300)
        break
      }
    }
  }
  return { contacts, droppedSensitive: dropped }
}

// ---------- CSV ----------------------------------------------------------------------------------------------

export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const first = src.split(/\r?\n/, 1)[0] ?? ''
  const d = delimiter ?? ((first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === d) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const SPLIT_MULTI = / ::: |\n/

export function parseContactsCsv(text: string): { contacts: Contact[] } & ImportReport {
  const rows = parseCsv(text)
  const header = (rows[0] ?? []).map((h) => h.trim())
  if (header.length === 0) return { contacts: [], droppedSensitive: 0 }
  const idx = (re: RegExp, not?: RegExp) => header.flatMap((h, i) => (re.test(h) && !(not && not.test(h)) ? [i] : []))
  const typeLike = /(type|label|tür|etiket)/i
  const cols = {
    full: idx(/^(name|display name|ad soyad)$/i),
    given: idx(/^(first name|given name|ad)$/i),
    middle: idx(/^(middle name|additional name)$/i),
    family: idx(/^(last name|family name|soyad)$/i),
    nick: idx(/^nickname$/i),
    phones: idx(/(phone|mobile|telefon|tel\b)/i, typeLike),
    emails: idx(/(e-?mail|eposta|e-posta)/i, typeLike),
    org: idx(/^(organization( 1)? - name|organization name|company|şirket|kurum)$/i),
    title: idx(/^(organization( 1)? - title|job title|ünvan)$/i),
    birthday: idx(/^(birthday|doğum günü)$/i),
    address: idx(/(address.*formatted|^home address$|^adres$)/i),
    notes: idx(/^(notes?|notlar)$/i),
  }
  const get = (r: string[], is: number[]) =>
    is
      .flatMap((i) => (r[i] ?? '').split(SPLIT_MULTI))
      .map((s) => s.trim())
      .filter(Boolean)
  const contacts: Contact[] = []
  let dropped = 0
  for (const r of rows.slice(1)) {
    const full = get(r, cols.full)[0]
    const composed = [...get(r, cols.given), ...get(r, cols.middle), ...get(r, cols.family)].join(' ').trim()
    const org = get(r, cols.org)[0]
    const phones = uniq(get(r, cols.phones))
    const emails = uniq(get(r, cols.emails))
    const name = full || composed || org || emails[0] || phones[0] || ''
    if (!name) continue
    const c: Contact = { name, phones, emails }
    const nick = get(r, cols.nick)[0]
    if (nick) c.nickname = nick
    if (org) c.org = org
    const title = get(r, cols.title)[0]
    if (title) c.title = title
    const bday = /^(\d{4})-(\d{2})-(\d{2})/.exec(get(r, cols.birthday)[0] ?? '')
    if (bday) c.birthday = bday[0]
    for (const [key, is] of [
      ['address', cols.address],
      ['note', cols.notes],
    ] as const) {
      const v = (is.map((i) => r[i] ?? '').find((x) => x.trim()) ?? '').replace(/\s+/g, ' ').trim()
      if (!v) continue
      if (findSensitive(v)) dropped++
      else c[key] = clip(v, key === 'note' ? 300 : 200)
    }
    contacts.push(c)
  }
  return { contacts, droppedSensitive: dropped }
}

export function renderContacts(contacts: Contact[]): string {
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const out = [
    '# Kişiler',
    '',
    '<!-- npm run ice-aktar ile üretildi; yeniden içe aktarınca bu dosya baştan yazılır. -->',
    '',
  ]
  for (const c of sorted) {
    out.push(`### ${c.name.replace(/[\r\n#]+/g, ' ')}`)
    if (c.nickname) out.push(`- Takma ad: ${c.nickname}`)
    if (c.phones.length) out.push(`- Telefon: ${c.phones.join(', ')}`)
    if (c.emails.length) out.push(`- E-posta: ${c.emails.join(', ')}`)
    if (c.org || c.title) out.push(`- İş: ${[c.title, c.org].filter(Boolean).join(', ')}`)
    if (c.birthday) out.push(`- Doğum günü: ${c.birthday}`)
    if (c.address) out.push(`- Adres: ${c.address}`)
    if (c.note) out.push(`- Not: ${c.note}`)
    out.push('')
  }
  return out.join('\n')
}

// ---------- iCalendar ----------------------------------------------------------------------------------------

const TZ = 'Europe/Istanbul'

/** Offset (ms) of `tz` from UTC at the instant `utcMs`. */
function tzOffset(utcMs: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((x) => [x.type, x.value]),
  )
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(utcMs / 1000) * 1000
}

/** Wall-clock time in `tz` → UTC ms. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let utc = guess - tzOffset(guess, tz)
  utc = guess - tzOffset(utc, tz)
  return utc
}

const istanbulLocal = (utcMs: number): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(utcMs))
    .replace(' ', 'T')

interface IcsTime {
  utcMs: number
  allDay: boolean
}

function parseIcsTime(p: Prop): IcsTime | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim())
  if (!m) return undefined
  const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!]
  if (m[4] === undefined) return { utcMs: Date.UTC(y, mo - 1, d), allDay: true }
  const [h, mi] = [+m[4], +m[5]!]
  if (m[7]) return { utcMs: Date.UTC(y, mo - 1, d, h, mi), allDay: false }
  const tzid = p.params.map((x) => /^TZID=(.+)$/.exec(x)?.[1]).find(Boolean)
  try {
    return { utcMs: zonedToUtc(y, mo, d, h, mi, tzid ?? TZ), allDay: false }
  } catch {
    return { utcMs: zonedToUtc(y, mo, d, h, mi, TZ), allDay: false } // unknown TZID: treat as local
  }
}

function addMonths(utcMs: number, months: number): number {
  const d = new Date(utcMs)
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
  return new Date(t).getUTCDate() === d.getUTCDate() ? t : NaN // skip e.g. 31st in a 30-day month
}

function toEvent(start: IcsTime, end: IcsTime | undefined, title: string, location?: string): CalendarEvent {
  const fmt = (t: IcsTime) => (t.allDay ? new Date(t.utcMs).toISOString().slice(0, 10) : istanbulLocal(t.utcMs))
  return { start: fmt(start), ...(end ? { end: fmt(end) } : {}), title, ...(location ? { location } : {}) }
}

export interface IcsOptions {
  now: number
  /** how far ahead recurring events are expanded */
  horizonDays?: number
  maxEvents?: number
}

export function parseIcs(text: string, o: IcsOptions): { events: CalendarEvent[] } & ImportReport {
  const horizon = o.now + (o.horizonDays ?? 120) * 86_400_000
  const from = o.now - 86_400_000
  const events: CalendarEvent[] = []
  let dropped = 0
  let ev: Prop[] | undefined
  const push = (props: Prop[]) => {
    const get = (n: string) => props.find((x) => x.name === n)
    const s = get('DTSTART')
    const title = unescapeValue(get('SUMMARY')?.value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!s || !title) return
    const start = parseIcsTime(s)
    if (!start) return
    const endP = get('DTEND')
    const end = endP ? parseIcsTime(endP) : undefined
    let location =
      unescapeValue(get('LOCATION')?.value ?? '')
        .replace(/\s+/g, ' ')
        .trim() || undefined
    if (findSensitive(title)) {
      dropped++
      return
    }
    if (location && findSensitive(location)) {
      dropped++
      location = undefined
    }
    const dur = end ? end.utcMs - start.utcMs : 0
    const rr = get('RRULE')?.value
    if (!rr) {
      if (start.utcMs >= from && start.utcMs <= horizon) events.push(toEvent(start, end, title, location))
      return
    }
    const rule = Object.fromEntries(rr.split(';').map((kv) => kv.split('=') as [string, string]))
    const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1)
    const until = rule.UNTIL ? parseIcsTime({ name: 'UNTIL', params: [], value: rule.UNTIL })?.utcMs : undefined
    const freq = rule.FREQ
    const yearly = freq === 'YEARLY'
    const limit = yearly ? o.now + 400 * 86_400_000 : horizon
    for (let n = 0; n < 4000; n++) {
      let t: number
      if (freq === 'DAILY') t = start.utcMs + n * interval * 86_400_000
      else if (freq === 'WEEKLY') t = start.utcMs + n * interval * 7 * 86_400_000
      else if (freq === 'MONTHLY') t = addMonths(start.utcMs, n * interval)
      else if (yearly) t = addMonths(start.utcMs, n * interval * 12)
      else break
      if (Number.isNaN(t)) continue
      if (t > limit || (until !== undefined && t > until)) break
      if (t >= from)
        events.push(
          toEvent(
            { utcMs: t, allDay: start.allDay },
            end ? { utcMs: t + dur, allDay: end.allDay } : undefined,
            title,
            location,
          ),
        )
    }
  }
  for (const line of unfold(text)) {
    const p = parseProp(line)
    if (!p) continue
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') ev = []
    else if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') {
      if (ev) push(ev)
      ev = undefined
    } else if (ev) ev.push(p)
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'tr'))
  return { events: events.slice(0, o.maxEvents ?? 500), droppedSensitive: dropped }
}

export function renderEvents(events: CalendarEvent[]): string {
  const out = [
    '# Takvim',
    '',
    '<!-- npm run ice-aktar ile üretildi; yeniden içe aktarınca bu dosya baştan yazılır. -->',
    '',
  ]
  let month = ''
  for (const e of events) {
    const m = e.start.slice(0, 7)
    if (m !== month) {
      month = m
      out.push('', `## ${m}`)
    }
    const day = e.start.slice(0, 10)
    const time = e.start.length > 10 ? ` ${e.start.slice(11, 16)}` : ' (tüm gün)'
    out.push(`- ${day}${time} ${e.title}${e.location ? ` (${e.location})` : ''}`)
  }
  return out.join('\n') + '\n'
}
