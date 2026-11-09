// Kat malikleri kurulu: toplantı ayrıntısı, yeter sayılar, çağrı metni ve tutanak taslağı.
// Çevrim içi oylama için kanuni dayanak yoktur; oylar fiziki toplantıda alınır ve burada kaydedilir.
// Resmî karar, noter onaylı karar defterine yazılıp hazır bulunan maliklerce imzalanır (KMK m.32).
import { MEETING_RULES, type MeetingRule } from '../../shared/labels.ts'
import { all, get, type DB } from '../db/db.ts'
import { dateTimeLabel, today as todayOf } from '../domain/dates.ts'
import {
  proxyWarnings,
  quorum,
  scheduleWarnings,
  tally,
  type AttendanceInfo,
  type Round,
  type VoteValue,
  type VoterUnit,
} from '../domain/quorum.ts'
import { labelOf } from './finance.ts'

export type MeetingRow = {
  id: number
  site_id: number
  kind: 'olagan' | 'olaganustu'
  title: string
  first_at: string
  second_at: string | null
  location: string
  status: string
  held_round: Round | null
  invited_at: string | null
  minutes: string | null
}

export type AgendaRow = {
  id: number
  meeting_id: number
  seq: number
  title: string
  details: string | null
  rule: MeetingRule
  result: string | null
}

export function meetingDetail(db: DB, meetingId: number, now: Date) {
  const meeting = get<MeetingRow>(db, 'SELECT * FROM meetings WHERE id = ?', meetingId)
  if (!meeting) return null
  const site = get<{ id: number; name: string; address: string | null; kind: string }>(
    db,
    'SELECT * FROM sites WHERE id = ?',
    meeting.site_id,
  )!
  const units = all<{
    id: number
    no: string
    block: string | null
    land_share: number
    owner_id: number | null
    owners: string | null
  }>(
    db,
    `SELECT u.id, u.no, b.name AS block, u.land_share,
       (SELECT MIN(o.person_id) FROM occupancies o WHERE o.unit_id = u.id AND o.role = 'malik' AND (o.end_date IS NULL OR o.end_date >= date('now'))) AS owner_id,
       (SELECT group_concat(p.full_name, ', ') FROM occupancies o JOIN people p ON p.id = o.person_id
          WHERE o.unit_id = u.id AND o.role = 'malik' AND (o.end_date IS NULL OR o.end_date >= date('now'))) AS owners
     FROM units u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.site_id = ? ORDER BY b.name, CAST(u.no AS INTEGER), u.no`,
    meeting.site_id,
  )
  const attendanceRows = all<{ unit_id: number; present: number; proxy: string | null }>(
    db,
    'SELECT * FROM attendance WHERE meeting_id = ?',
    meetingId,
  )
  const attendance = new Map<number, AttendanceInfo>(
    attendanceRows.map((a) => [a.unit_id, { present: Boolean(a.present), proxy: a.proxy }]),
  )
  const voters: VoterUnit[] = units.map((u) => ({
    unitId: u.id,
    landShare: u.land_share,
    ownerKey: u.owner_id ? `p${u.owner_id}` : null,
    label: u.owners ?? labelOf(u),
  }))
  const agenda = all<AgendaRow>(db, 'SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY seq', meetingId)
  const voteRows = all<{ item_id: number; unit_id: number; vote: VoteValue }>(
    db,
    `SELECT v.* FROM votes v JOIN agenda_items a ON a.id = v.item_id WHERE a.meeting_id = ?`,
    meetingId,
  )
  const round: Round = meeting.held_round ?? 'ilk'
  const q = quorum(voters, attendance, round)
  const items = agenda.map((a) => {
    const votes = new Map(voteRows.filter((v) => v.item_id === a.id).map((v) => [v.unit_id, v.vote]))
    return {
      ...a,
      ruleLabel: MEETING_RULES[a.rule],
      votes: Object.fromEntries(votes),
      tally: tally(voters, attendance, votes, a.rule),
    }
  })
  const today = todayOf(now)
  const warnings = [
    ...(meeting.status === 'planlandi' || meeting.status === 'cagri'
      ? scheduleWarnings({
          invitedOn: meeting.invited_at ? todayOf(new Date(meeting.invited_at)) : null,
          firstDate: todayOf(new Date(meeting.first_at)),
          secondDate: meeting.second_at ? todayOf(new Date(meeting.second_at)) : null,
          today,
        })
      : []),
    ...proxyWarnings(voters, attendance),
  ]
  return {
    meeting,
    site,
    round,
    quorum: q,
    warnings,
    agenda: items,
    units: units.map((u) => ({
      id: u.id,
      label: labelOf(u),
      landShare: u.land_share,
      owners: u.owners,
      present: attendance.get(u.id)?.present ?? false,
      proxy: attendance.get(u.id)?.proxy ?? null,
    })),
  }
}

export type MeetingDetail = NonNullable<ReturnType<typeof meetingDetail>>

export function invitationText(d: MeetingDetail): string {
  const m = d.meeting
  const kind = m.kind === 'olagan' ? 'olağan' : 'olağanüstü'
  const lines = [
    `${d.site.name} Kat Malikleri Kurulu ${kind} toplantısına çağrı`,
    '',
    `Sayın kat malikimiz,`,
    '',
    `${d.site.name} kat malikleri kurulu ${kind} toplantısı ${dateTimeLabel(m.first_at)} tarihinde ${m.location} adresinde aşağıdaki gündemle yapılacaktır.`,
    m.second_at
      ? `İlk toplantıda Kat Mülkiyeti Kanunu m.30’daki yeter sayı sağlanamazsa ikinci toplantı ${dateTimeLabel(m.second_at)} tarihinde aynı yerde yapılacaktır.`
      : '',
    '',
    'Gündem:',
    ...d.agenda.map((a) => `${a.seq}. ${a.title}${a.details ? ` — ${a.details}` : ''}`),
    '',
    'Toplantıya katılamayacak kat maliklerimiz kendilerini yazılı vekâletnameyle temsil ettirebilir. 40 ve daha az bağımsız bölümlü yapılarda bir kişi en çok iki kat malikini temsil edebilir.',
    '',
    `${d.site.name} Yönetimi`,
  ]
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}

export function minutesText(d: MeetingDetail): string {
  const m = d.meeting
  const q = d.quorum
  const kind = m.kind === 'olagan' ? 'Olağan' : 'Olağanüstü'
  const when = d.round === 'ikinci' && m.second_at ? m.second_at : m.first_at
  const present = d.units.filter((u) => u.present)
  const lines = [
    `${d.site.name.toLocaleUpperCase('tr-TR')} KAT MALİKLERİ KURULU ${kind.toLocaleUpperCase('tr-TR')} TOPLANTI TUTANAĞI (TASLAK)`,
    '',
    `Toplantı: ${d.round === 'ikinci' ? 'İkinci toplantı' : 'İlk toplantı'} — ${dateTimeLabel(when)}, ${m.location}`,
    `Katılım: ${q.presentCount}/${q.totalCount} bağımsız bölüm, arsa payı ${q.presentShare}/${q.totalShare}. ${q.explanation}`,
    `Hazır bulunanlar: ${present.map((u) => `${u.label}${u.owners ? ` (${u.owners}${u.proxy ? `, vekili ${u.proxy}` : ''})` : u.proxy ? ` (vekil ${u.proxy})` : ''}`).join('; ') || '—'}`,
    '',
    'GÜNDEM VE KARARLAR',
  ]
  for (const a of d.agenda) {
    const t = a.tally
    lines.push(
      '',
      `${a.seq}. ${a.title}`,
      a.details ? `   ${a.details}` : '',
      `   Karar yeter sayısı: ${a.ruleLabel}.`,
      `   Oylama: ${t.yes} kabul, ${t.no} ret, ${t.abstain} çekimser${t.notVoted ? `, ${t.notVoted} oy kullanmadı` : ''}. ${t.explanation}`,
      `   Sonuç: ${t.passed ? 'KABUL EDİLDİ' : 'REDDEDİLDİ'}.`,
    )
  }
  lines.push(
    '',
    'Bu tutanak taslağı Kâhya tarafından kayıtlı katılım ve oylardan üretilmiştir. Kararlar, sayfaları noter onaylı karar defterine yazılarak toplantıda hazır bulunan tüm kat maliklerince imzalanır; aykırı oy verenler gerekçelerini deftere yazabilir (KMK m.32).',
  )
  return lines
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n(\d+\.)/g, '\n\n$1')
    .replace('\nGÜNDEM', '\n\nGÜNDEM')
}
